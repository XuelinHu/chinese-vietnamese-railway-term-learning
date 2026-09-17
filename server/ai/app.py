"""
AI 边车服务：为「汉越铁道术语学习软件」提供本地语音能力。

  POST /asr    音频字节 -> 文本（faster-whisper）
  POST /tts    文本 -> mp3  （edge-tts）
  GET  /health 能力探测

设计要点：
- 模型**懒加载**：首次 ASR 请求才加载 Whisper，避免启动即下载 3GB 权重导致
  健康检查超时。TTS 不依赖模型，可立即使用。
- ASR 与 TTS 相互独立，任一不可用不影响另一个。
- 该服务是可选依赖。Node 端探测不到时会回退到浏览器 Web Speech，不会报错。
"""

import asyncio
import io
import logging
import os
import time
from typing import Optional

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ai-sidecar")

app = FastAPI(title="Railway Term Learning AI Sidecar", version="1.0.0")


def _load_server_env():
    """
    读取 server/.env，让 ASR_MODEL 等开关和 Node 端共用同一份配置。

    没有这步的话，README 里「在 server/.env 里把 ASR_MODEL 调小」是句空话——
    边车是独立进程，不会自动读到那边的文件。

    刻意不引 python-dotenv：格式就 `KEY=value` 一种，十几行够了。
    已存在的环境变量优先，命令行显式传入的覆盖文件。
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass  # 没有 .env 就全靠环境变量，各配置项都有默认值


_load_server_env()

ASR_MODEL = os.getenv("ASR_MODEL", "large-v3")
ASR_DEVICE = os.getenv("ASR_DEVICE", "cuda")
ASR_COMPUTE = os.getenv("ASR_COMPUTE_TYPE", "float16")
HF_ENDPOINT = os.getenv("HF_ENDPOINT", "")

if HF_ENDPOINT:
    os.environ.setdefault("HF_ENDPOINT", HF_ENDPOINT)

# 语言 -> edge-tts 音色。可用 `edge-tts --list-voices` 查看全部。
VOICES = {
    "zh": os.getenv("TTS_VOICE_ZH", "zh-CN-XiaoxiaoNeural"),
    "vi": os.getenv("TTS_VOICE_VI", "vi-VN-HoaiMyNeural"),
    "en": os.getenv("TTS_VOICE_EN", "en-US-AriaNeural"),
}

# ---------------------------------------------------------------- 依赖探测

try:
    from faster_whisper import WhisperModel  # noqa: F401
    HAS_ASR = True
    ASR_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover
    HAS_ASR = False
    ASR_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"
    log.warning("faster-whisper 不可用，ASR 功能关闭：%s", ASR_IMPORT_ERROR)

try:
    import edge_tts  # noqa: F401
    HAS_TTS = True
    TTS_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover
    HAS_TTS = False
    TTS_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"
    log.warning("edge-tts 不可用，TTS 功能关闭：%s", TTS_IMPORT_ERROR)


# ---------------------------------------------------------------- ASR

_model = None
_model_lock = asyncio.Lock()
_model_error: Optional[str] = None


def _load_model():
    """在线程里加载模型（阻塞数秒到数分钟，取决于是否需下载权重）。"""
    global _model, _model_error
    if _model is not None or _model_error:
        return
    try:
        log.info("正在加载 Whisper 模型 %s (device=%s, compute=%s) ...", ASR_MODEL, ASR_DEVICE, ASR_COMPUTE)
        started = time.time()
        _model = WhisperModel(ASR_MODEL, device=ASR_DEVICE, compute_type=ASR_COMPUTE)
        log.info("Whisper 模型加载完成，耗时 %.1fs", time.time() - started)
    except Exception as exc:
        _model_error = f"{type(exc).__name__}: {exc}"
        log.error("Whisper 模型加载失败：%s", _model_error)


@app.post("/asr")
async def asr(request: Request):
    if not HAS_ASR:
        return JSONResponse(status_code=503, content={"error": f"faster-whisper unavailable: {ASR_IMPORT_ERROR}"})

    raw = await request.body()
    if not raw:
        return JSONResponse(status_code=400, content={"error": "empty audio body"})

    language = request.query_params.get("language") or None
    if language == "":
        language = None

    # 领域提示词。Whisper 对「道岔」「khổ đường」这类低频专业词没有任何先验，
    # 单句短音频下会稳定听成同音常用词（道岔 -> 倒插）。给一段术语做 initial_prompt
    # 相当于把解码器往领域词表上偏，是提升专业词识别率最省事也最有效的一招。
    # 上限 224 token，超了 Whisper 会截断，所以由调用方负责裁剪。
    initial_prompt = request.query_params.get("prompt") or None

    async with _model_lock:
        if _model is None and _model_error is None:
            await asyncio.to_thread(_load_model)

    if _model_error:
        return JSONResponse(status_code=503, content={"error": f"model load failed: {_model_error}"})

    def _run():
        # 关键：PyAV 的 av.open() 把「裸 bytes」当作**文件路径**，
        # 直接传 bytes 会抛 FileNotFoundError 或解出垃圾数据，必须包成 BytesIO。
        audio = io.BytesIO(raw)
        segments, info = _model.transcribe(
            audio,
            language=language,
            beam_size=5,
            initial_prompt=initial_prompt,
            vad_filter=True,  # 抑制静音段幻觉
            vad_parameters={"min_silence_duration_ms": 500},
        )
        text = "".join(seg.text for seg in segments).strip()
        return text, info

    try:
        started = time.time()
        text, info = await asyncio.to_thread(_run)
        return {
            "text": text,
            "language": info.language,
            "language_probability": round(float(info.language_probability), 3),
            "duration": round(float(info.duration), 2),
            "elapsed": round(time.time() - started, 2),
        }
    except Exception as exc:
        log.exception("ASR 失败")
        return JSONResponse(status_code=500, content={"error": f"{type(exc).__name__}: {exc}"})


# ---------------------------------------------------------------- TTS

class TtsRequest(BaseModel):
    text: str
    lang: str = "zh"
    voice: str = ""


@app.post("/tts")
async def tts(payload: TtsRequest):
    if not HAS_TTS:
        return JSONResponse(status_code=503, content={"error": f"edge-tts unavailable: {TTS_IMPORT_ERROR}"})

    text = (payload.text or "").strip()
    if not text:
        return JSONResponse(status_code=400, content={"error": "empty text"})

    voice = payload.voice or VOICES.get(payload.lang, VOICES["zh"])

    try:
        communicate = edge_tts.Communicate(text, voice)
        buffer = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.extend(chunk["data"])
        if not buffer:
            raise RuntimeError("edge-tts 返回空音频")
        return Response(content=bytes(buffer), media_type="audio/mpeg")
    except Exception as exc:
        # 2026-01 起微软收紧鉴权，edge-tts < 7.2.7 会出现 403 握手中断。
        # 这里如实上报，Node 端会回退到浏览器 speechSynthesis。
        log.error("TTS 失败 (voice=%s): %s", voice, exc)
        return JSONResponse(status_code=503, content={"error": f"{type(exc).__name__}: {exc}"})


# ---------------------------------------------------------------- health

@app.get("/health")
async def health():
    device = "unknown"
    if HAS_ASR:
        try:
            import ctranslate2
            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            device = "unknown"
    return {
        "status": "ok",
        "asr": HAS_ASR and _model_error is None,
        "tts": HAS_TTS,
        "asr_model": ASR_MODEL,
        "asr_loaded": _model is not None,
        "asr_error": _model_error,
        "asr_import_error": ASR_IMPORT_ERROR,
        "tts_import_error": TTS_IMPORT_ERROR,
        "device": device,
        "voices": VOICES,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.getenv("AI_HOST", "127.0.0.1"), port=int(os.getenv("AI_PORT", "8090")))
