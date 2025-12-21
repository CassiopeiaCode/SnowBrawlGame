#!/usr/bin/env bash
set -euo pipefail

# 固定到脚本所在目录，避免相对路径问题
cd "$(dirname "$0")"

# 端口
export PORT=48230

# 可选：加载同目录 .env（如果你有的话）
if [[ -f ".env" ]]; then
  # shellcheck disable=SC2046
  export $(grep -v '^\s*#' .env | grep -v '^\s*$' | xargs -d '\n') || true
fi

echo "[start] PORT=${PORT}"
echo "[start] starting deno server..."

# 你可以把 main.ts 改成你的入口文件名
exec deno run -A --unstable-kv main.ts
