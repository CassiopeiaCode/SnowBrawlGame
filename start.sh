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

# 在空白终端/未配置 PATH 时，尽量自动找到 deno
# 你可以通过环境变量指定 deno 路径：
#   DENO_BIN=/path/to/deno ./start.sh
DENO_CMD="${DENO_BIN:-${DENO_PATH:-deno}}"

if ! command -v "$DENO_CMD" >/dev/null 2>&1; then
  # 尝试一些常见安装路径（可按需扩展）
  possible_home="${HOME:-}"
  candidate_list=()
  # 显式指定路径的优先级最高
  if [[ -n "${DENO_BIN:-}" ]]; then
    candidate_list+=("$DENO_BIN")
  elif [[ -n "${DENO_PATH:-}" ]]; then
    candidate_list+=("$DENO_PATH")
  fi
  if [[ -n "$possible_home" ]]; then
    candidate_list+=("$possible_home/.deno/bin/deno")
  fi
  # 常见安装路径（包括 root 用户下的默认安装位置）
  candidate_list+=("/root/.deno/bin/deno" "/usr/local/bin/deno" "/opt/homebrew/bin/deno")

  for candidate in "${candidate_list[@]}"; do
    if [[ -x "$candidate" ]]; then
      DENO_CMD="$candidate"
      break
    fi
  done
fi

if ! command -v "$DENO_CMD" >/dev/null 2>&1 && [[ ! -x "$DENO_CMD" ]]; then
  echo "[start] ERROR: 未找到 deno 可执行文件。"
  echo "[start] 请先安装 deno，或者将 deno 所在目录加入 PATH，"
  echo "[start] 或通过环境变量 DENO_BIN=/path/to/deno 指定 deno 路径。"
  echo "[start] 例如：curl -fsSL https://deno.land/install.sh | sh"
  exit 1
fi

echo "[start] using deno: ${DENO_CMD}"
echo "[start] starting deno server..."

# 你可以把 main.ts 改成你的入口文件名
exec "$DENO_CMD" run -A --unstable-kv main.ts
