"""
dataset_builder.py — Pulls labeled WAF events from ClickHouse and
exports a Parquet feature vector dataset for ML training.
"""
import os
import sys
import logging
import pandas as pd
import numpy as np
from clickhouse_driver import Client
from urllib.parse import unquote_plus

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("dataset_builder")

CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "clickhouse")
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "default")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "password")
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "default")
OUTPUT_PATH = os.getenv("OUTPUT_PATH", "/data/waf_training_dataset.parquet")


def connect_clickhouse():
    return Client(
        host=CLICKHOUSE_HOST,
        user=CLICKHOUSE_USER,
        password=CLICKHOUSE_PASSWORD,
        database=CLICKHOUSE_DB,
    )


def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    freq = {}
    for ch in s:
        freq[ch] = freq.get(ch, 0) + 1
    length = len(s)
    return -sum((c / length) * np.log2(c / length) for c in freq.values())


def special_char_ratio(s: str) -> float:
    if not s:
        return 0.0
    specials = sum(1 for c in s if c in r"""'":;<>=/()\`""")
    return specials / len(s)


METHOD_ORDINALS = {"GET": 0, "POST": 1, "PUT": 2, "DELETE": 3, "PATCH": 4, "OPTIONS": 5, "HEAD": 6}

SQL_KEYWORDS = ["select", "union", "insert", "delete", "drop", "update", "from", "where"]
SCRIPT_TOKENS = ["<script", "javascript:", "onerror=", "onload=", "<iframe"]


def has_sql_token(s: str) -> int:
    lower = s.lower()
    return int(any(kw in lower for kw in SQL_KEYWORDS))


def has_script_token(s: str) -> int:
    lower = s.lower()
    return int(any(t in lower for t in SCRIPT_TOKENS))


def build_feature_vector(row: dict) -> dict:
    url = unquote_plus(row.get("url", "") or "")
    body = row.get("body", "") or ""
    method = (row.get("method", "GET") or "GET").upper()
    combined = url + body

    return {
        "url_length":        float(len(url)),
        "body_length":       float(len(body)),
        "entropy":           shannon_entropy(body or url),
        "special_char_ratio":special_char_ratio(combined),
        "method_ordinal":    float(METHOD_ORDINALS.get(method, 0)),
        "has_sql_token":     float(has_sql_token(combined)),
        "has_script_token":  float(has_script_token(combined)),
        "ast_score":         float(row.get("anomaly_score", 0.0)),
        "label":             int(row.get("label", 0)),  # 1 = malicious, 0 = benign
    }


def load_from_clickhouse(client: Client) -> pd.DataFrame:
    log.info("Fetching WAF events from ClickHouse...")
    query = """
        SELECT
            url,
            method,
            body,
            anomaly_score,
            label
        FROM waf_events_labeled
        WHERE label IS NOT NULL
        LIMIT 500000
    """
    rows, columns = client.execute(query, with_column_types=True)
    col_names = [c[0] for c in columns]
    df_raw = pd.DataFrame(rows, columns=col_names)
    log.info(f"Fetched {len(df_raw)} rows from ClickHouse.")
    return df_raw


def build_synthetic_dataset(n_samples: int = 5000) -> pd.DataFrame:
    """Generate a balanced synthetic dataset when ClickHouse is unavailable."""
    log.warning("ClickHouse unavailable — generating synthetic training dataset.")
    rng = np.random.default_rng(42)

    records = []

    # ── Benign samples ─────────────────────────────────────────────────────────
    for _ in range(n_samples // 2):
        url = "/" + "/".join(rng.choice(["api", "v1", "users", "health", "login"]) for _ in range(rng.integers(1, 4)))
        body_len = int(rng.integers(0, 200))
        records.append({
            "url_length":         float(len(url)),
            "body_length":        float(body_len),
            "entropy":            float(rng.uniform(2.0, 3.5)),
            "special_char_ratio": float(rng.uniform(0.0, 0.05)),
            "method_ordinal":     float(rng.choice([0, 1, 2, 3])),
            "has_sql_token":      0.0,
            "has_script_token":   0.0,
            "ast_score":          float(rng.uniform(0.0, 0.3)),
            "label":              0,
        })

    # ── Malicious samples (SQLi, XSS, Path Traversal, SSRF) ───────────────────
    attack_urls = [
        "/api/users?id=1' OR '1'='1",
        "/api/login?user=admin'--",
        "/api/data?q=<script>alert(1)</script>",
        "/api/exec?cmd=;cat /etc/passwd",
        "/api/file?path=../../etc/shadow",
        "/api/fetch?url=http://169.254.169.254/latest/meta-data/",
        "/api/xml?q=<!ENTITY xxe SYSTEM 'file:///etc/passwd'>",
        "/api/search?q=UNION+SELECT+1,2,3--",
    ]
    for _ in range(n_samples // 2):
        url = rng.choice(attack_urls)
        records.append({
            "url_length":         float(len(url)),
            "body_length":        float(rng.integers(0, 500)),
            "entropy":            float(rng.uniform(3.5, 5.5)),
            "special_char_ratio": float(rng.uniform(0.1, 0.4)),
            "method_ordinal":     float(rng.choice([0, 1])),
            "has_sql_token":      float(int(any(kw in url.lower() for kw in SQL_KEYWORDS))),
            "has_script_token":   float(int(any(t in url.lower() for t in SCRIPT_TOKENS))),
            "ast_score":          float(rng.uniform(0.6, 1.0)),
            "label":              1,
        })

    df = pd.DataFrame(records).sample(frac=1, random_state=42).reset_index(drop=True)
    log.info(f"Synthetic dataset shape: {df.shape}")
    log.info(f"Label distribution:\n{df['label'].value_counts()}")
    return df


def main():
    df = None

    # Try to load from ClickHouse; fall back to synthetic data if unavailable
    try:
        client = connect_clickhouse()
        df_raw = load_from_clickhouse(client)
        if df_raw.empty:
            raise ValueError("ClickHouse returned 0 rows — falling back to synthetic data.")

        records = []
        for _, row in df_raw.iterrows():
            try:
                records.append(build_feature_vector(row.to_dict()))
            except Exception as e:
                log.warning(f"Skipping row due to error: {e}")
        df = pd.DataFrame(records)

    except Exception as e:
        log.warning(f"ClickHouse dataset load failed: {e}")
        df = build_synthetic_dataset()

    log.info(f"Feature matrix shape: {df.shape}")

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    df.to_parquet(OUTPUT_PATH, index=False)
    log.info(f"Dataset saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
