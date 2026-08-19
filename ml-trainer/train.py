"""
train.py — Trains an XGBoost WAF classifier on the pre-built Parquet
dataset and exports the model to ONNX format for use by the Go sidecar.
"""
import os
import logging
import numpy as np
import pandas as pd
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report, confusion_matrix,
    f1_score, precision_score, recall_score, accuracy_score
)
from onnxmltools.convert.common.data_types import FloatTensorType
import onnxmltools
import onnx
import json

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("trainer")

DATASET_PATH = os.getenv("DATASET_PATH", "/data/waf_training_dataset.parquet")
MODEL_OUTPUT  = os.getenv("MODEL_OUTPUT", "/models/waf_classifier.onnx")
METRICS_OUTPUT = os.getenv("METRICS_OUTPUT", "/models/latest_metrics.json")

FEATURE_COLS = [
    "url_length", "body_length", "entropy",
    "special_char_ratio", "method_ordinal",
    "has_sql_token", "has_script_token", "ast_score",
]


def load_dataset() -> tuple:
    log.info(f"Loading dataset from {DATASET_PATH}")
    df = pd.read_parquet(DATASET_PATH)
    log.info(f"Dataset shape: {df.shape}")

    X = df[FEATURE_COLS].astype(np.float32).values
    y = df["label"].astype(int).values
    return X, y


def train_model(X, y):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    log.info(f"Train size: {X_train.shape[0]}, Test size: {X_test.shape[0]}")

    model = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=(y == 0).sum() / (y == 1).sum(),  # handle imbalance
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=50,
    )

    y_pred = model.predict(X_test)
    metrics = {
        "accuracy":   round(accuracy_score(y_test, y_pred), 4),
        "precision":  round(precision_score(y_test, y_pred, zero_division=0), 4),
        "recall":     round(recall_score(y_test, y_pred, zero_division=0), 4),
        "f1_score":   round(f1_score(y_test, y_pred, zero_division=0), 4),
        "feature_cols": FEATURE_COLS,
    }
    log.info(f"\n{classification_report(y_test, y_pred, target_names=['benign', 'malicious'])}")
    log.info(f"Confusion Matrix:\n{confusion_matrix(y_test, y_pred)}")
    log.info(f"Metrics: {metrics}")

    return model, metrics


def export_onnx(model, num_features: int):
    log.info(f"Exporting model to ONNX: {MODEL_OUTPUT}")
    initial_type = [("input", FloatTensorType([None, num_features]))]
    
    # Use onnxmltools specifically for xgboost model conversion
    onnx_model = onnxmltools.convert_xgboost(
        model,
        initial_types=initial_type,
        target_opset=15
    )
    
    os.makedirs(os.path.dirname(MODEL_OUTPUT), exist_ok=True)
    with open(MODEL_OUTPUT, "wb") as f:
        f.write(onnx_model.SerializeToString())
    log.info(f"ONNX model saved to {MODEL_OUTPUT}")


def main():
    X, y = load_dataset()
    model, metrics = train_model(X, y)
    export_onnx(model, num_features=X.shape[1])

    # Save metrics for dashboard reporting
    with open(METRICS_OUTPUT, "w") as f:
        json.dump(metrics, f, indent=2)
    log.info(f"Metrics saved to {METRICS_OUTPUT}")


if __name__ == "__main__":
    main()
