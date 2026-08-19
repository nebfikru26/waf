package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
	ort "github.com/yalue/onnxruntime_go"
	"golang.org/x/net/html"
	vtsql "vitess.io/vitess/go/vt/sqlparser"
)

// ─────────────────────────────────────────────
//   REQUEST / RESPONSE DTOs
// ─────────────────────────────────────────────

// ClassifyRequest maps the JSON payload coming from the Nginx Lua agent
type ClassifyRequest struct {
	TenantID    string            `json:"tenant_id"`
	URL         string            `json:"url"`
	Method      string            `json:"method"`
	Headers     map[string]string `json:"headers"`
	Body        string            `json:"body"`
	ContentType string            `json:"content_type"`
	JA4         string            `json:"ja4,omitempty"`
}

// ClassifyResponse returns the composite classification decision to the proxy
type ClassifyResponse struct {
	Score   float64  `json:"score"`
	Reason  string   `json:"reason,omitempty"`
	Matches []string `json:"matches"`
	Error   string   `json:"error,omitempty"`
}

// WafEventReport maps fields reported to ClickHouse via .NET WafEventsController
type WafEventReport struct {
	TenantId        string   `json:"tenantId"`
	Url             string   `json:"url"`
	Method          string   `json:"method"`
	AnomalyScore    float64  `json:"anomalyScore"`
	MLScore         float64  `json:"mlScore"`
	ASTScore        float64  `json:"astScore"`
	Matches         []string `json:"matches"`
	JA4             string   `json:"ja4,omitempty"`
	SchemaDeviation bool     `json:"schemaDeviation"`
}

// SidecarHealth holds live performance/load metrics
type SidecarHealth struct {
	Status           string  `json:"status"`
	UptimeSeconds    int64   `json:"uptime_seconds"`
	MemoryAllocBytes uint64  `json:"memory_alloc_bytes"`
	RequestsTotal    uint64  `json:"requests_total"`
	ErrorsTotal      uint64  `json:"errors_total"`
	AverageLatencyMs float64 `json:"average_latency_ms"`
	ModelLoaded      bool    `json:"model_loaded"`
	Timestamp        int64   `json:"timestamp"`
}

// tenantCacheEntry is a short-lived Redis policy cache entry
type tenantCacheEntry struct {
	enabled bool
	expiry  time.Time
}

// ─────────────────────────────────────────────
//   GLOBAL STATE
// ─────────────────────────────────────────────

var (
	// Critical routes trigger fail-secure (block if sidecar is uncertain)
	criticalPathPrefixes = []string{"/api/auth", "/api/admin", "/api/payment"}

	cacheMu     sync.RWMutex
	tenantCache = make(map[string]tenantCacheEntry)
	natsConn    *nats.Conn

	// ONNX model session (loaded once at startup, hot-reloaded from disk)
	modelMu      sync.RWMutex
	ortSession   *ort.DynamicAdvancedSession
	modelVersion string // holds the last loaded model file mtime

	// Prometheus-style metrics
	startTime      = time.Now()
	requestCount   uint64
	errorCount     uint64
	totalLatencyNs int64
)

// ─────────────────────────────────────────────
//   UTILITY HELPERS
// ─────────────────────────────────────────────

// calculateEntropy returns Shannon entropy of a string [0, log2(charset)]
func calculateEntropy(s string) float64 {
	if len(s) == 0 {
		return 0.0
	}
	counts := make(map[rune]float64)
	for _, c := range s {
		counts[c]++
	}
	var entropy float64
	length := float64(len(s))
	for _, v := range counts {
		p := v / length
		entropy -= p * math.Log2(p)
	}
	return entropy
}

// multiDecode recursively URL-decodes and HTML-entity-decodes a string
// up to maxDepth times to expose evasion-encoded payloads.
func multiDecode(s string, depth int) string {
	if depth == 0 {
		return s
	}
	decoded, err := url.QueryUnescape(s)
	if err != nil || decoded == s {
		return s
	}
	return multiDecode(decoded, depth-1)
}

// extractStrings extracts all leaf-level string values from a JSON body.
// This ensures we only inspect data values, not structural JSON keys.
func extractStrings(rawBody string) []string {
	var result []string
	var walk func(v interface{})
	walk = func(v interface{}) {
		switch t := v.(type) {
		case string:
			result = append(result, t)
		case map[string]interface{}:
			for _, val := range t {
				walk(val)
			}
		case []interface{}:
			for _, item := range t {
				walk(item)
			}
		}
	}
	var obj interface{}
	if err := json.Unmarshal([]byte(rawBody), &obj); err == nil {
		walk(obj)
	} else {
		// Not JSON — treat as plain string
		result = append(result, rawBody)
	}
	return result
}

// extractSchemaSignature returns a deterministic hash of the JSON keys and array structures
// for behavioral API profiling.
func extractSchemaSignature(rawBody string) string {
	var walk func(v interface{}, prefix string) []string
	walk = func(v interface{}, prefix string) []string {
		var paths []string
		switch t := v.(type) {
		case map[string]interface{}:
			for k, val := range t {
				currentPath := k
				if prefix != "" {
					currentPath = prefix + "." + k
				}
				paths = append(paths, currentPath)
				paths = append(paths, walk(val, currentPath)...)
			}
		case []interface{}:
			if len(t) > 0 {
				currentPath := prefix + "[]"
				paths = append(paths, currentPath)
				paths = append(paths, walk(t[0], currentPath)...)
			}
		}
		return paths
	}

	var obj interface{}
	if err := json.Unmarshal([]byte(rawBody), &obj); err == nil {
		keys := walk(obj, "")
		sort.Strings(keys)
		sig := strings.Join(keys, "|")
		hash := sha256.Sum256([]byte(sig))
		return hex.EncodeToString(hash[:])
	}
	return ""
}

// isCriticalPath checks if the request URL matches a fail-secure protected route
func isCriticalPath(requestURL string) bool {
	for _, prefix := range criticalPathPrefixes {
		if strings.HasPrefix(requestURL, prefix) {
			return true
		}
	}
	return false
}

// ─────────────────────────────────────────────
//   PHASE 1.3 — SEMANTIC AST PARSER
// ─────────────────────────────────────────────

// isSQLInjection attempts to parse the string as a SQL statement.
// If parsing succeeds, the string is valid SQL syntax → real injection risk.
func isSQLInjection(s string) bool {
	if len(s) < 6 {
		return false
	}
	parser, err := vtsql.New(vtsql.Options{})
	if err != nil {
		return false
	}
	_, err = parser.Parse(s)
	return err == nil
}

// hasActiveScriptTokens tokenizes a string as HTML and checks for
// active executable tokens (script/event-handler attributes).
func hasActiveScriptTokens(s string) bool {
	tokenizer := html.NewTokenizer(strings.NewReader(s))
	for {
		tt := tokenizer.Next()
		switch tt {
		case html.ErrorToken:
			return false
		case html.StartTagToken, html.SelfClosingTagToken:
			name, hasAttr := tokenizer.TagName()
			tagName := strings.ToLower(string(name))
			if tagName == "script" || tagName == "iframe" || tagName == "object" {
				return true
			}
			if hasAttr {
				for {
					attrKey, attrVal, moreAttr := tokenizer.TagAttr()
					k := strings.ToLower(string(attrKey))
					v := strings.ToLower(string(attrVal))
					if strings.HasPrefix(k, "on") || // onclick, onload, etc.
						(k == "src" && strings.HasPrefix(v, "javascript:")) ||
						(k == "href" && strings.HasPrefix(v, "javascript:")) {
						return true
					}
					if !moreAttr {
						break
					}
				}
			}
		}
	}
}

// ─────────────────────────────────────────────
//   PHASE 1.2 — NORMALIZED COMPOSITE SCORING
// ─────────────────────────────────────────────

// ThreatSignal holds detection results per target string
type ThreatSignal struct {
	SQLCount           int
	XSSCount           int
	RCECount           int
	EntropyScore       float64
	PromptInjectionHit bool
	PIILeakHit         bool
	Matches            []string
}

// rcePatterns holds substrings commonly found in RCE payloads
var rcePatterns = []string{
	"/bin/sh", "/bin/bash", "/bin/zsh", "cmd.exe", "powershell",
	"whoami", "/etc/passwd", "nc -e", "curl -", "wget -",
}

// ─────────────────────────────────────────────
//   PHASE 8 — PROMPT INJECTION & PII PROTECTION
// ─────────────────────────────────────────────

// promptInjectionPatterns captures adversarial natural language sequences
// that attempt to subvert an LLM's system prompt or jailbreak safety guardrails.
var promptInjectionPatterns = []string{
	"ignore previous instructions",
	"ignore all previous",
	"disregard your instructions",
	"forget your system prompt",
	"you are now",
	"pretend you are",
	"act as if you are",
	"your new instructions are",
	"override safety",
	"jailbreak",
	"do anything now",
	"dan mode",
	"prompt injection",
	"<|system|>",
	"###instruction",
	"[system]",
	"[user]",
	"[assistant]",
}

// piiPatterns are lightweight regex-based patterns to detect PII leakage
// in outbound-style request bodies (e.g., LLM response mirroring, API proxies).
// We scan for patterns that should never appear as HTTP request payloads.
var piiPatterns = []string{
	// Ethiopian style national IDs are 12 digits: simple heuristic
	`\b\d{3}-\d{2}-\d{4}\b`, // US SSN format
	`sk-[a-zA-Z0-9]{32,}`,   // OpenAI API Key pattern
	`AKIA[0-9A-Z]{16}`,      // AWS Access Key pattern
	`ghp_[a-zA-Z0-9]{36}`,   // GitHub Personal Access Token
}

// matchesPIIPattern applies a single regex pattern against a target and returns true on match.
func matchesPIIPattern(target, pattern string) bool {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return false
	}
	return re.MatchString(target)
}

// evaluateTarget checks a single decoded target string and accumulates signals
func evaluateTarget(target string, sig *ThreatSignal) {
	if len(target) == 0 {
		return
	}

	// 1. Semantic SQL AST check (replaces pure regex)
	if isSQLInjection(target) {
		sig.SQLCount++
		sig.Matches = append(sig.Matches, "SQL Injection (AST-validated)")
	}

	// 2. Semantic HTML/XSS tokenizer check
	if hasActiveScriptTokens(target) {
		sig.XSSCount++
		sig.Matches = append(sig.Matches, "Cross-Site Scripting (XSS tokenizer)")
	}

	// 3. RCE substring check (still string-based but bounded)
	lower := strings.ToLower(target)
	for _, pattern := range rcePatterns {
		if strings.Contains(lower, pattern) {
			sig.RCECount++
			sig.Matches = append(sig.Matches, fmt.Sprintf("Remote Code Execution (pattern: %s)", pattern))
			break // one RCE match is enough to trigger
		}
	}

	// 4. Shannon entropy — only on long inputs to avoid short-string noise
	if len(target) > 60 {
		e := calculateEntropy(target)
		// Accumulate highest entropy across all targets
		if e > sig.EntropyScore {
			sig.EntropyScore = e
		}
		if e > 5.3 {
			sig.Matches = append(sig.Matches, fmt.Sprintf("High-Entropy Payload (%.2f)", e))
		}
	}

	// 5. Phase 8: Prompt Injection detection
	if !sig.PromptInjectionHit {
		lower2 := strings.ToLower(target)
		for _, pattern := range promptInjectionPatterns {
			if strings.Contains(lower2, pattern) {
				sig.PromptInjectionHit = true
				sig.Matches = append(sig.Matches, fmt.Sprintf("Prompt Injection Detected (pattern: %q)", pattern))
				break
			}
		}
	}

	// 6. Phase 8: PII Leak pattern detection (outbound data exfiltration risk)
	if !sig.PIILeakHit && len(target) > 10 {
		for _, pat := range piiPatterns {
			if matchesPIIPattern(target, pat) {
				sig.PIILeakHit = true
				sig.Matches = append(sig.Matches, "PII / Credential Exfiltration Pattern Detected")
				break
			}
		}
	}
}

// evaluateAnomalyScore is the main detection pipeline.
// Returns a normalized score [0.0, 1.0] and list of match descriptors.
func evaluateAnomalyScore(req *ClassifyRequest) (float64, []string) {
	sig := &ThreatSignal{}

	// --- Build target list ---
	var targets []string

	// URL (multi-decoded to catch evasion)
	targets = append(targets, multiDecode(req.URL, 3))

	// Body — extract JSON leaf strings if content type is JSON
	ct := strings.ToLower(req.ContentType)
	if strings.Contains(ct, "application/json") {
		targets = append(targets, extractStrings(multiDecode(req.Body, 3))...)
	} else {
		targets = append(targets, multiDecode(req.Body, 3))
	}

	// Inspect security-sensitive headers only
	riskyHeaders := []string{"user-agent", "referer", "cookie", "x-forwarded-for", "origin"}
	for key, val := range req.Headers {
		for _, rh := range riskyHeaders {
			if strings.EqualFold(key, rh) {
				targets = append(targets, multiDecode(val, 2))
				break
			}
		}
	}

	// --- Evaluate each target ---
	for _, t := range targets {
		evaluateTarget(t, sig)
	}

	// --- Phase 1.2: Normalized weighted composite scoring ---
	// Weights are calibrated so a SINGLE signal type alone won't automatically
	// breach the block threshold — multiple evidence types are required.
	sqlContrib := math.Min(1.0, float64(sig.SQLCount)*0.35)
	xssContrib := math.Min(1.0, float64(sig.XSSCount)*0.30)
	rceContrib := math.Min(1.0, float64(sig.RCECount)*0.40)

	entropyContrib := 0.0
	if sig.EntropyScore > 5.3 {
		// scale 5.3–8.0 range to 0.0–0.15 contribution
		entropyContrib = math.Min(0.15, (sig.EntropyScore-5.3)/18.0)
	}

	// Phase 8: Prompt injection and PII raise score aggressively
	promptContrib := 0.0
	if sig.PromptInjectionHit {
		promptContrib = 0.70
	}
	piiContrib := 0.0
	if sig.PIILeakHit {
		piiContrib = 0.65
	}

	score := sqlContrib + xssContrib + rceContrib + entropyContrib + promptContrib + piiContrib
	if score > 1.0 {
		score = 1.0
	}

	return score, sig.Matches
}

// ─────────────────────────────────────────────
//   PHASE 1.4 — ONNX ML CLASSIFIER
// ─────────────────────────────────────────────

// extractFeatureVector builds the numerical feature vector for the ML model.
// Features (in order): url_length, body_length, entropy, special_char_ratio,
// method_ordinal, has_sql_token, has_script_token
func extractFeatureVector(req *ClassifyRequest, astScore float64) []float32 {
	urlLen := float32(len(req.URL))
	bodyLen := float32(len(req.Body))
	entropy := float32(calculateEntropy(req.Body))

	specials := 0
	combined := req.URL + req.Body
	for _, c := range combined {
		switch c {
		case '\'', '"', '<', '>', '(', ')', ';', '=', '/', '\\', '`':
			specials++
		}
	}
	specialRatio := float32(0)
	if len(combined) > 0 {
		specialRatio = float32(specials) / float32(len(combined))
	}

	methods := map[string]float32{"GET": 0, "POST": 1, "PUT": 2, "DELETE": 3, "PATCH": 4, "OPTIONS": 5, "HEAD": 6}
	methodOrd := float32(0)
	if v, ok := methods[strings.ToUpper(req.Method)]; ok {
		methodOrd = v
	}

	sqlToken := float32(0)
	if isSQLInjection(req.URL + " " + req.Body) {
		sqlToken = 1.0
	}
	scriptToken := float32(0)
	if hasActiveScriptTokens(req.URL + req.Body) {
		scriptToken = 1.0
	}

	return []float32{urlLen, bodyLen, entropy, specialRatio, methodOrd, sqlToken, scriptToken, float32(astScore)}
}

// runONNXInference sends the feature vector through the loaded ONNX model
// and returns a probability score [0.0, 1.0]. Returns -1 if model is not loaded.
func runONNXInference(features []float32) float64 {
	modelMu.RLock()
	session := ortSession
	modelMu.RUnlock()

	if session == nil {
		return -1 // model not loaded — fallback to AST score only
	}

	// Build input tensor: shape [1, numFeatures]
	inputTensor, err := ort.NewTensor(ort.NewShape(1, int64(len(features))), features)
	if err != nil {
		log.Printf("[ONNX] Failed to create input tensor: %v", err)
		return -1
	}
	defer inputTensor.Destroy()

	outputTensor, err := ort.NewEmptyTensor[float32](ort.NewShape(1, 2)) // [benign_prob, malicious_prob]
	if err != nil {
		log.Printf("[ONNX] Failed to create output tensor: %v", err)
		return -1
	}
	defer outputTensor.Destroy()

	if err := session.Run([]ort.ArbitraryTensor{inputTensor}, []ort.ArbitraryTensor{outputTensor}); err != nil {
		log.Printf("[ONNX] Inference error: %v", err)
		return -1
	}

	// outputTensor data: [benign_prob, malicious_prob]
	data := outputTensor.GetData()
	if len(data) < 2 {
		return -1
	}
	return float64(data[1]) // malicious probability
}

// loadONNXModel loads (or hot-reloads) the ONNX model from disk with stability checks
func loadONNXModel(modelPath string) {
	var info os.FileInfo
	var err error

	// Wait up to 30 seconds for the model file to exist and stabilize
	for i := 0; i < 15; i++ {
		info, err = os.Stat(modelPath)
		if err == nil && info.Size() > 0 {
			// File exists and is non-empty. Wait 2 seconds and verify size hasn't changed.
			size1 := info.Size()
			time.Sleep(2 * time.Second)
			info2, err2 := os.Stat(modelPath)
			if err2 == nil && info2.Size() == size1 {
				break // File is stable
			}
			log.Printf("[ONNX] Model file %s is still being written by trainer (size changing). Waiting...", modelPath)
		} else {
			log.Printf("[ONNX] Model file %s not found or empty (ml-trainer still running). Waiting...", modelPath)
			time.Sleep(2 * time.Second)
		}
	}

	if err != nil {
		log.Printf("[ONNX] Model file %s firmly not available after wait: %v. Running in AST-only mode.", modelPath, err)
		return
	}

	currentVersion := info.ModTime().String()
	modelMu.RLock()
	alreadyLoaded := currentVersion == modelVersion
	modelMu.RUnlock()

	if alreadyLoaded {
		return
	}

	log.Printf("[ONNX] Loading model from %s (version: %s)...", modelPath, currentVersion)
	newSession, err := ort.NewDynamicAdvancedSession(modelPath,
		[]string{"input"}, []string{"output"}, nil)
	if err != nil {
		log.Printf("[ONNX] Failed to load model: %v. Using previous model or AST-only mode.", err)
		return
	}

	modelMu.Lock()
	if ortSession != nil {
		ortSession.Destroy()
	}
	ortSession = newSession
	modelVersion = currentVersion
	modelMu.Unlock()
	log.Printf("[ONNX] Model loaded successfully.")
}

// startModelWatcher polls for a new ONNX model file every interval
func startModelWatcher(ctx context.Context, modelPath string, interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				loadONNXModel(modelPath)
			}
		}
	}()
}

// ─────────────────────────────────────────────
//   PHASE 1.5 — FAIL-SECURE LOGIC
// ─────────────────────────────────────────────

func writeForbidden(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_ = json.NewEncoder(w).Encode(ClassifyResponse{
		Score: 1.0,
		Error: message,
	})
}

// ─────────────────────────────────────────────
//   TENANT FEATURE FLAG (REDIS)
// ─────────────────────────────────────────────

func isMLDetectionEnabled(ctx context.Context, rdb *redis.Client, tenantID string) bool {
	if rdb == nil {
		return true
	}
	cacheMu.RLock()
	entry, exists := tenantCache[tenantID]
	cacheMu.RUnlock()
	if exists && time.Now().Before(entry.expiry) {
		return entry.enabled
	}

	redisKey := fmt.Sprintf("tenant:ai:%s:enabled", tenantID)
	val, err := rdb.Get(ctx, redisKey).Result()
	enabled := true
	if err == redis.Nil {
		enabled = true
	} else if err != nil {
		log.Printf("[AI-Sidecar] Redis query error for %s: %v. Fail-open.", redisKey, err)
		return false
	} else {
		enabled = strings.TrimSpace(strings.ToLower(val)) != "false"
	}

	cacheMu.Lock()
	tenantCache[tenantID] = tenantCacheEntry{enabled: enabled, expiry: time.Now().Add(5 * time.Second)}
	cacheMu.Unlock()
	return enabled
}

// ─────────────────────────────────────────────
//   THREAT REPORTING
// ─────────────────────────────────────────────

func reportBlockedEvent(tenantID, requestURL, method string, score float64, mlScore float64, astScore float64, matches []string, ja4 string, schemaDeviation bool) {
	report := WafEventReport{
		TenantId:        tenantID,
		Url:             requestURL,
		Method:          method,
		AnomalyScore:    score,
		MLScore:         mlScore,
		ASTScore:        astScore,
		Matches:         matches,
		JA4:             ja4,
		SchemaDeviation: schemaDeviation,
	}
	data, err := json.Marshal(report)
	if err != nil {
		log.Printf("[AI-Sidecar] Failed to marshal event report: %v", err)
		return
	}

	// 1. Publish real-time live event to NATS
	if natsConn != nil {
		if err := natsConn.Publish("waf.events.ai", data); err != nil {
			log.Printf("[AI-Sidecar] Failed to publish AI event to NATS: %v", err)
		}
	}

	// 2. Fire-and-forget to backend REST API for ClickHouse ingestion
	apiBase := os.Getenv("INTERNAL_API_URL")
	if apiBase == "" {
		apiBase = "http://api-dotnet:8082"
	}
	endpoint := apiBase + "/api/internal/waf-events"

	go func() {
		client := http.Client{Timeout: 2 * time.Second}
		req, err := http.NewRequest("POST", endpoint, bytes.NewReader(data))
		if err != nil {
			log.Printf("[AI-Sidecar] Failed to create HTTP request: %v", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")

		// Secret is guaranteed non-empty by the startup fail-fast guard in main()
		secret := os.Getenv("SIDECAR_SIGNING_SECRET")
		timestamp := strconv.FormatInt(time.Now().Unix(), 10)
		msg := timestamp + "." + string(data)
		h := hmac.New(sha256.New, []byte(secret))
		h.Write([]byte(msg))
		req.Header.Set("X-Sidecar-Timestamp", timestamp)
		req.Header.Set("X-Sidecar-Signature", hex.EncodeToString(h.Sum(nil)))

		resp, err := client.Do(req)
		if err != nil {
			log.Printf("[AI-Sidecar] Failed to report event to backend: %v", err)
			return
		}
		defer resp.Body.Close()
		log.Printf("[AI-Sidecar] Event reported. HTTP Status: %d", resp.StatusCode)
	}()
}

// ─────────────────────────────────────────────
//   HEALTH REPORTER
// ─────────────────────────────────────────────

func startHealthReporter(ctx context.Context, rdb *redis.Client) {
	ticker := time.NewTicker(5 * time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				var m runtime.MemStats
				runtime.ReadMemStats(&m)

				reqs := atomic.LoadUint64(&requestCount)
				errs := atomic.LoadUint64(&errorCount)
				latNs := atomic.LoadInt64(&totalLatencyNs)
				avgLatMs := 0.0
				if reqs > 0 {
					avgLatMs = float64(latNs) / float64(reqs) / 1e6
				}

				status := "online"
				if errs > 0 {
					status = "degraded"
				}
				if avgLatMs > 80.0 {
					status = "high-latency"
				}

				modelMu.RLock()
				modelLoaded := ortSession != nil
				modelMu.RUnlock()

				payload := SidecarHealth{
					Status:           status,
					UptimeSeconds:    int64(time.Since(startTime).Seconds()),
					MemoryAllocBytes: m.Alloc,
					RequestsTotal:    reqs,
					ErrorsTotal:      errs,
					AverageLatencyMs: avgLatMs,
					ModelLoaded:      modelLoaded,
					Timestamp:        time.Now().Unix(),
				}

				data, err := json.Marshal(payload)
				if err != nil {
					continue
				}

				if rdb != nil {
					redisCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
					_ = rdb.Set(redisCtx, "sidecar:health", string(data), 15*time.Second).Err()
					cancel()
				}

				if natsConn != nil {
					_ = natsConn.Publish("waf.health.ai", data)
				}
			}
		}
	}()
}

// ─────────────────────────────────────────────
//   MAIN ENTRYPOINT
// ─────────────────────────────────────────────

func main() {
	// ── Fail-Fast Security Guard ─────────────────────────────────────────────
	// The sidecar MUST have a signing secret to authenticate events to the backend.
	// An empty or missing secret would allow any service to forge WAF events.
	sidecarSecret := os.Getenv("SIDECAR_SIGNING_SECRET")
	if len(sidecarSecret) < 32 {
		log.Fatal("[FATAL] SIDECAR_SIGNING_SECRET env var is missing or too short (< 32 chars). " +
			"Set a strong secret via the SIDECAR_SIGNING_SECRET environment variable. Sidecar will not start.")
	}
	log.Println("[Security] SIDECAR_SIGNING_SECRET validated — sidecar will sign all events.")
	// ─────────────────────────────────────────────────────────────────────────

	socketPath := os.Getenv("UNIX_SOCKET_PATH")
	if socketPath == "" {
		socketPath = "/var/run/shared/ai.sock"
	}
	modelPath := os.Getenv("ONNX_MODEL_PATH")
	if modelPath == "" {
		modelPath = "/models/waf_classifier.onnx"
	}
	onnxLibPath := os.Getenv("ONNX_LIB_PATH")
	if onnxLibPath == "" {
		onnxLibPath = "/usr/lib"
	}

	// --- Initialize ONNX Runtime ---
	ort.SetSharedLibraryPath(onnxLibPath)
	if err := ort.InitializeEnvironment(); err != nil {
		log.Printf("[ONNX] Failed to initialize ONNX environment: %v. Running in AST-only mode.", err)
	} else {
		loadONNXModel(modelPath)
	}

	// --- Redis (with optional password auth) ---
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "redis:6379"
	}
	redisPassword := os.Getenv("REDIS_PASSWORD") // Empty string = no auth (dev only)
	rdb := redis.NewClient(&redis.Options{
		Addr:         redisAddr,
		Password:     redisPassword,
		DialTimeout:  500 * time.Millisecond,
		ReadTimeout:  200 * time.Millisecond,
		WriteTimeout: 200 * time.Millisecond,
	})
	log.Printf("[AI-Sidecar] Connecting to Redis at %s (auth: %v)", redisAddr, redisPassword != "")

	// --- NATS ---
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "nats://nats:4222"
	}
	nc, err := nats.Connect(natsURL, nats.Timeout(2*time.Second))
	if err != nil {
		log.Printf("[AI-Sidecar] WARNING: NATS connection failed (%s). Live streaming degraded: %v", natsURL, err)
	} else {
		natsConn = nc
		log.Printf("[AI-Sidecar] Connected to NATS at %s", natsURL)
	}

	// --- Unix Socket setup ---
	if _, err := os.Stat(socketPath); err == nil {
		if removeErr := os.Remove(socketPath); removeErr != nil {
			log.Fatalf("[AI-Sidecar] Failed to remove stale socket %s: %v", socketPath, removeErr)
		}
	}
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		log.Fatalf("[AI-Sidecar] Failed to bind Unix socket %s: %v", socketPath, err)
	}
	defer listener.Close()
	if err := os.Chmod(socketPath, 0666); err != nil {
		log.Fatalf("[AI-Sidecar] Failed to chmod socket: %v", err)
	}
	log.Printf("[AI-Sidecar] Listening on Unix socket: %s", socketPath)

	// --- Context + Graceful Shutdown ---
	shutdownCtx, shutdownCancel := context.WithCancel(context.Background())
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Println("[AI-Sidecar] Shutting down gracefully...")
		shutdownCancel()
		_ = listener.Close()
		_ = os.Remove(socketPath)
		_ = rdb.Close()
		if natsConn != nil {
			natsConn.Close()
		}
		modelMu.Lock()
		if ortSession != nil {
			ortSession.Destroy()
		}
		modelMu.Unlock()
		os.Exit(0)
	}()

	// --- Background services ---
	startHealthReporter(shutdownCtx, rdb)
	startModelWatcher(shutdownCtx, filepath.Clean(modelPath), 5*time.Minute)

	// ─────────────────────────────────────────────
	//   HTTP HANDLER: /v1/classify
	// ─────────────────────────────────────────────

	mux := http.NewServeMux()

	mux.HandleFunc("/v1/classify", func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		atomic.AddUint64(&requestCount, 1)

		if r.Method != http.MethodPost {
			atomic.AddUint64(&errorCount, 1)
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		body, err := io.ReadAll(io.LimitReader(r.Body, 512*1024)) // 512 KB cap
		if err != nil || len(body) == 0 {
			atomic.AddUint64(&errorCount, 1)
			http.Error(w, "Bad request body", http.StatusBadRequest)
			return
		}

		var req ClassifyRequest
		if err := json.Unmarshal(body, &req); err != nil {
			atomic.AddUint64(&errorCount, 1)
			log.Printf("[AI-Sidecar] JSON decode error: %v", err)
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
		defer cancel()

		// --- Feature flag check ---
		if !isMLDetectionEnabled(ctx, rdb, req.TenantID) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(ClassifyResponse{Score: 0.0, Matches: []string{"AI inspection disabled for tenant"}})
			atomic.AddInt64(&totalLatencyNs, time.Since(start).Nanoseconds())
			return
		}

		// --- Phase 3.1: JA4 Fingerprint Blocklist Check ---
		if req.JA4 != "" && rdb != nil {
			blocked, bErr := rdb.SIsMember(ctx, "waf:ja4:blocklist", req.JA4).Result()
			if bErr == nil && blocked {
				log.Printf("[AI-Sidecar] Blocked known-bad JA4 fingerprint: %s", req.JA4)
				writeForbidden(w, "Blocked by AffiniSecurity Threat Intelligence (JA4 fingerprint).")
				atomic.AddInt64(&totalLatencyNs, time.Since(start).Nanoseconds())
				return
			}
		}

		// --- Phase 1.2 + 1.3: AST + Weighted Composite Score ---
		astScore, matches := evaluateAnomalyScore(&req)

		// --- Phase 7.1: API Schema Discovery & BOLA Protection ---
		var schemaDeviated bool
		if rdb != nil && req.Method != "" && req.URL != "" && len(req.Body) > 2 && strings.Contains(req.ContentType, "application/json") {
			schemaSig := extractSchemaSignature(req.Body)
			if schemaSig != "" {
				schemaKey := fmt.Sprintf("tenant:%s:schema:%s:%s", req.TenantID, req.Method, req.URL)
				baselineSig, err := rdb.Get(ctx, schemaKey).Result()
				if err == redis.Nil {
					rdb.Set(ctx, schemaKey, schemaSig, 7*24*time.Hour)
					log.Printf("[AI-Sidecar] Schema Discovery: Baseline set for %s %s (%s)", req.Method, req.URL, schemaSig[:8])
				} else if err == nil && baselineSig != schemaSig {
					schemaDeviated = true
					astScore += 0.30
					matches = append(matches, "API Schema Topology Deviation (BOLA/Shadow API)")
					log.Printf("[AI-Sidecar] Schema Deviation Detected! Expected: %s, Got: %s", baselineSig[:8], schemaSig[:8])
				}
			}
		}

		log.Printf("[AI-Sidecar] Tenant=%s URL=%s AST-Score=%.3f Matches=%v", req.TenantID, req.URL, astScore, matches)

		// --- Phase 1.4: ONNX ML Inference ---
		finalScore := astScore
		features := extractFeatureVector(&req, astScore)
		mlScore := runONNXInference(features)
		if mlScore >= 0 {
			// Fuse: 60% weight on ML, 40% weight on AST
			finalScore = 0.60*mlScore + 0.40*astScore
			log.Printf("[AI-Sidecar] ML-Score=%.3f Fused-Score=%.3f", mlScore, finalScore)
		}

		// --- Get per-tenant threshold from policy (default 0.80) ---
		threshold := 0.80
		thKey := fmt.Sprintf("tenant:ai:%s:threshold", req.TenantID)
		if thVal, err := rdb.Get(ctx, thKey).Result(); err == nil {
			if parsed, parseErr := strconv.ParseFloat(strings.TrimSpace(thVal), 64); parseErr == nil {
				threshold = parsed
			}
		}

		// --- Phase 1.5: Fail-Secure for critical routes ---
		critical := isCriticalPath(req.URL)

		if finalScore >= threshold {
			reportBlockedEvent(req.TenantID, req.URL, req.Method, finalScore, mlScore, astScore, matches, req.JA4, schemaDeviated)
			// Automatic JA4 blocklist persistence on confirmed block
			if req.JA4 != "" && rdb != nil {
				_ = rdb.SAdd(ctx, "waf:ja4:blocklist", req.JA4).Err()
				_ = rdb.Expire(ctx, "waf:ja4:blocklist", 24*time.Hour).Err()
			}
			writeForbidden(w, "Blocked by AffiniSecurity AI Engine v2.0. Anomaly threshold exceeded.")
			atomic.AddInt64(&totalLatencyNs, time.Since(start).Nanoseconds())
			return
		}

		// Low-scoring request on a critical path with high entropy — challenge instead
		if critical && finalScore >= 0.45 {
			log.Printf("[AI-Sidecar] Suspicious request on critical path. Score=%.3f — returning 429 for challenge.", finalScore)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests) // signals Lua to serve a challenge
			_ = json.NewEncoder(w).Encode(ClassifyResponse{Score: finalScore, Reason: "challenge_required", Matches: matches})
			atomic.AddInt64(&totalLatencyNs, time.Since(start).Nanoseconds())
			return
		}

		// Pass — emit X-AI-Score so NJS adaptive rate limiter can track budget
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-AI-Score", fmt.Sprintf("%.4f", finalScore))
		_ = json.NewEncoder(w).Encode(ClassifyResponse{Score: finalScore, Matches: matches})
		atomic.AddInt64(&totalLatencyNs, time.Since(start).Nanoseconds())
	})

	// ─────────────────────────────────────────────
	//   HTTP HANDLER: /v1/health
	// ─────────────────────────────────────────────
	mux.HandleFunc("/v1/health", func(w http.ResponseWriter, r *http.Request) {
		modelMu.RLock()
		loaded := ortSession != nil
		modelMu.RUnlock()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":       "ok",
			"model_loaded": loaded,
			"uptime_s":     int64(time.Since(startTime).Seconds()),
		})
	})

	server := &http.Server{Handler: mux}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatalf("[AI-Sidecar] Fatal server error: %v", err)
	}
}
