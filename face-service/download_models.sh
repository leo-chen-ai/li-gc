#!/usr/bin/env bash
# 下载人脸检测/识别 ONNX 模型到 face-service/models/
# 模型来自 InsightFace 官方 buffalo_sc 包（SCRFD-500M 检测 + MobileFaceNet w600k 识别）。
set -euo pipefail

MODEL_DIR="$(cd "$(dirname "$0")" && pwd)/models"
mkdir -p "$MODEL_DIR"

DET="$MODEL_DIR/scrfd_500m_bnkps_shape640x640.onnx"
REC="$MODEL_DIR/w600k_mbf.onnx"

if [ -s "$DET" ] && [ -s "$REC" ]; then
  echo "[skip] 模型已存在"
  ls -lh "$MODEL_DIR"
  exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

for base in \
  "https://github.com/deepinsight/insightface/releases/download/v0.7" \
  "https://ghfast.top/https://github.com/deepinsight/insightface/releases/download/v0.7" \
  "https://mirror.ghproxy.com/https://github.com/deepinsight/insightface/releases/download/v0.7"; do
  echo "[down] $base/buffalo_sc.zip"
  if curl -fL --connect-timeout 15 --retry 2 -o "$TMP_DIR/buffalo_sc.zip" "$base/buffalo_sc.zip"; then
    break
  fi
done

[ -s "$TMP_DIR/buffalo_sc.zip" ] || { echo "[fail] buffalo_sc.zip 下载失败" >&2; exit 1; }

unzip -o -q "$TMP_DIR/buffalo_sc.zip" -d "$TMP_DIR/buffalo_sc"
cp "$TMP_DIR/buffalo_sc/det_500m.onnx" "$DET"
cp "$TMP_DIR/buffalo_sc/w600k_mbf.onnx" "$REC"

echo "[ ok ] 模型目录: $MODEL_DIR"
ls -lh "$MODEL_DIR"
