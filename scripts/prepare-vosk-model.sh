#!/usr/bin/env bash
# 构建时准备 vosk 中文模型（Linux 构建机用，如 EdgeOne Pages / GitHub Actions）。
# 从官方源下载并转成 vosk-browser 需要的 tar.gz（含顶层目录）。国内本机请改用
# scripts/prepare-vosk-model.ps1。已存在则跳过。
set -euo pipefail

DIR="public/models"
TARGZ="$DIR/vosk-model-small-cn-0.22.tar.gz"
URL="https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip"

if [ -f "$TARGZ" ]; then
  echo "已存在 $TARGZ，跳过。"
  exit 0
fi

mkdir -p "$DIR"
echo "下载 vosk 模型（~42MB）..."
curl -L --fail -o /tmp/vosk.zip "$URL"
echo "解压 + 打包 tar.gz..."
unzip -q /tmp/vosk.zip -d "$DIR"
tar -czf "$TARGZ" -C "$DIR" vosk-model-small-cn-0.22
rm -rf "$DIR/vosk-model-small-cn-0.22" /tmp/vosk.zip
echo "完成：$TARGZ"
