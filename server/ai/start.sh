#!/usr/bin/env bash
# 启动 AI 边车（ASR + TTS）。
#
# 用法：
#   ./start.sh            # 在 ai/ 目录下用 uv 创建 .venv 并启动
#
# 环境变量（均可选）：
#   ASR_MODEL         默认 large-v3
#   ASR_DEVICE        默认 cuda，纯 CPU 机器设为 cpu
#   ASR_COMPUTE_TYPE  默认 float16，CPU 上应改为 int8
#   AI_PORT           默认 8090
#   HF_ENDPOINT       国内网络建议设为 https://hf-mirror.com 加速权重下载
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v uv >/dev/null 2>&1; then
  echo "未找到 uv，请先安装：curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  exit 1
fi

if [ ! -d .venv ]; then
  echo "==> 创建虚拟环境（首次运行会用 Python 3.12，兼容性最好）"
  uv venv --python 3.12 .venv
fi

echo "==> 安装依赖"
uv pip install --python .venv/bin/python -r requirements.txt

# ctranslate2 需要能 dlopen 到 CUDA 12 的 cuBLAS / cuDNN。
# 这些库装在 site-packages/nvidia/*/lib 下，不在系统默认搜索路径里。
NV_LIBS="$(.venv/bin/python - <<'PY'
import glob, os, sys
base = os.path.join(sys.prefix, "lib")
paths = glob.glob(os.path.join(base, "python*/site-packages/nvidia/*/lib"))
paths += glob.glob(os.path.join(base, "site-packages/nvidia/*/lib"))
print(":".join(sorted(set(paths))))
PY
)"
if [ -n "$NV_LIBS" ]; then
  export LD_LIBRARY_PATH="${NV_LIBS}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  echo "==> 已加入 CUDA 运行库路径：$NV_LIBS"
fi

echo "==> 启动边车 http://127.0.0.1:${AI_PORT:-8090}"
exec .venv/bin/python -m uvicorn app:app --host "${AI_HOST:-127.0.0.1}" --port "${AI_PORT:-8090}"
