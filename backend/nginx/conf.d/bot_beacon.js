/**
 * AffiniSecurity Bot Behavioral Beacon v1.0
 * Phase 10: Advanced Bot Mitigation via Kinetic Behavioral Biometrics
 *
 * This script is served as /bot-beacon.js from the edge proxy.
 * Clients load it once at session start; it passively tracks behavioral
 * signals and attaches them as a signed header on subsequent POST requests.
 *
 * Signal taxonomy:
 *   - Mouse trajectory entropy (genuine humans jitter, bots travel straight lines)
 *   - InterKeystroke interval distribution (sigma of time between keystrokes)
 *   - Click cadence rhythm (timing variance between button presses)
 *   - Mobile gyroscope drift (mobile bots show zero angular velocity change)
 *   - Scroll velocity profile (bots scroll in exact pixel-perfect steps)
 *
 * Transport: Signals are quantized into a compact 128-bit feature string,
 * XOR-obfuscated with a session key, and attached as the header
 * X-Bot-Telemetry on every fetch/XHR call that follows.
 */
(function () {
    "use strict";

    // ── Session key for light obfuscation (not crypto — just anti-trivial-scraping) ──
    var _sessionKey = Math.random().toString(36).slice(2, 10);
    var _startTs = Date.now();

    // ── Signal accumulators ────────────────────────────────────────────────────────
    var _mouseEvents = [];     // {x, y, t}
    var _keyIntervals = [];    // ms between consecutive keydown events
    var _clickTimes = [];      // ms timestamps of click events
    var _scrollDeltas = [];    // {dy, t}
    var _gyroReadings = [];    // {alpha, beta, gamma, t}
    var _lastKeyTs = null;

    // ── Passive event listeners ────────────────────────────────────────────────────
    document.addEventListener("mousemove", function (e) {
        if (_mouseEvents.length < 200) {
            _mouseEvents.push({ x: e.clientX, y: e.clientY, t: Date.now() - _startTs });
        }
    }, { passive: true });

    document.addEventListener("keydown", function () {
        var now = Date.now();
        if (_lastKeyTs !== null && _keyIntervals.length < 100) {
            _keyIntervals.push(now - _lastKeyTs);
        }
        _lastKeyTs = now;
    }, { passive: true });

    document.addEventListener("click", function () {
        if (_clickTimes.length < 50) {
            _clickTimes.push(Date.now() - _startTs);
        }
    }, { passive: true });

    window.addEventListener("scroll", function () {
        if (_scrollDeltas.length < 100) {
            _scrollDeltas.push({ dy: window.scrollY, t: Date.now() - _startTs });
        }
    }, { passive: true });

    if (window.DeviceOrientationEvent) {
        window.addEventListener("deviceorientation", function (e) {
            if (_gyroReadings.length < 50) {
                _gyroReadings.push({ a: (e.alpha || 0).toFixed(2), b: (e.beta || 0).toFixed(2), g: (e.gamma || 0).toFixed(2), t: Date.now() - _startTs });
            }
        }, { passive: true });
    }

    // ── Feature quantization ───────────────────────────────────────────────────────

    function mean(arr) {
        if (!arr.length) return 0;
        return arr.reduce(function (s, v) { return s + v; }, 0) / arr.length;
    }

    function stdDev(arr) {
        if (arr.length < 2) return 0;
        var m = mean(arr);
        var variance = arr.reduce(function (s, v) { return s + Math.pow(v - m, 2); }, 0) / arr.length;
        return Math.sqrt(variance);
    }

    function mouseEntropy() {
        if (_mouseEvents.length < 5) return 0;
        // Compute path curvature entropy: how much does direction change?
        var diffs = [];
        for (var i = 1; i < _mouseEvents.length; i++) {
            var dx = _mouseEvents[i].x - _mouseEvents[i - 1].x;
            var dy = _mouseEvents[i].y - _mouseEvents[i - 1].y;
            diffs.push(Math.atan2(dy, dx));
        }
        return Math.min(255, Math.round(stdDev(diffs) * 50));
    }

    function keystrokeRhythm() {
        if (_keyIntervals.length < 2) return 0;
        return Math.min(255, Math.round(stdDev(_keyIntervals)));
    }

    function clickCadence() {
        if (_clickTimes.length < 2) return 0;
        var gaps = [];
        for (var i = 1; i < _clickTimes.length; i++) {
            gaps.push(_clickTimes[i] - _clickTimes[i - 1]);
        }
        return Math.min(255, Math.round(stdDev(gaps) / 10));
    }

    function scrollProfile() {
        if (_scrollDeltas.length < 3) return 0;
        var velocities = [];
        for (var i = 1; i < _scrollDeltas.length; i++) {
            var dt = _scrollDeltas[i].t - _scrollDeltas[i - 1].t;
            if (dt > 0) velocities.push(Math.abs(_scrollDeltas[i].dy - _scrollDeltas[i - 1].dy) / dt);
        }
        return Math.min(255, Math.round(stdDev(velocities) * 10));
    }

    function gyroActivity() {
        if (!_gyroReadings.length) return 0;
        var alphas = _gyroReadings.map(function (r) { return parseFloat(r.a); });
        return Math.min(255, Math.round(stdDev(alphas)));
    }

    // ── Compact 12-byte feature vector ────────────────────────────────────────────

    function buildVector() {
        var sessionAge = Math.min(255, Math.round((Date.now() - _startTs) / 1000));
        var features = [
            mouseEntropy(),
            keystrokeRhythm(),
            clickCadence(),
            scrollProfile(),
            gyroActivity(),
            Math.min(255, _mouseEvents.length),
            Math.min(255, _keyIntervals.length),
            Math.min(255, _clickTimes.length),
            Math.min(255, _scrollDeltas.length),
            Math.min(255, _gyroReadings.length),
            sessionAge,
            // Fingerprint bit: 1 = touch device, 0 = pointer device
            ("ontouchstart" in window ? 1 : 0)
        ];
        return features;
    }

    // ── XOR obfuscation ───────────────────────────────────────────────────────────

    function obfuscate(bytes, key) {
        var keyBytes = [];
        for (var i = 0; i < key.length; i++) {
            keyBytes.push(key.charCodeAt(i));
        }
        return bytes.map(function (b, i) {
            return b ^ keyBytes[i % keyBytes.length];
        });
    }

    function encodeHex(bytes) {
        return bytes.map(function (b) {
            return ("0" + (b & 0xff).toString(16)).slice(-2);
        }).join("");
    }

    // ── Patch fetch to inject telemetry header on POST/PUT/PATCH ──────────────────

    var _origFetch = window.fetch;
    window.fetch = function (input, init) {
        init = init || {};
        var method = (init.method || "GET").toUpperCase();
        if (method === "POST" || method === "PUT" || method === "PATCH") {
            var vector = buildVector();
            var obfuscated = obfuscate(vector, _sessionKey);
            var encoded = _sessionKey + "." + encodeHex(obfuscated);
            init.headers = init.headers || {};
            // Normalize headers object (handle Headers instance)
            if (typeof init.headers.set === "function") {
                init.headers.set("X-Bot-Telemetry", encoded);
            } else {
                init.headers["X-Bot-Telemetry"] = encoded;
            }
        }
        return _origFetch.call(this, input, init);
    };

    // ── Patch XMLHttpRequest for legacy compatibility ──────────────────────────────

    var _origXHROpen = XMLHttpRequest.prototype.open;
    var _origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        this._affiniMethod = method;
        return _origXHROpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
        var method = (this._affiniMethod || "GET").toUpperCase();
        if (method === "POST" || method === "PUT" || method === "PATCH") {
            var vector = buildVector();
            var obfuscated = obfuscate(vector, _sessionKey);
            var encoded = _sessionKey + "." + encodeHex(obfuscated);
            this.setRequestHeader("X-Bot-Telemetry", encoded);
        }
        return _origXHRSend.apply(this, arguments);
    };

}());
