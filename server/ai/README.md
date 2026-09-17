# AI 边车（语音服务）

为「汉越铁道术语学习软件」提供本地语音能力的独立 Python 服务。

```
POST /asr    音频字节 -> 文本（faster-whisper）
POST /tts    文本 -> mp3  （edge-tts）
GET  /health 能力探测（Node 端据此决定降级策略）
```

**这是可选依赖。** 不启动它，网页端的智能体依然能文字问答，语音会自动降级到浏览器
`SpeechRecognition` / `speechSynthesis`——只是识别准确率和音质下降，不会报错也不会白屏。

## 启动

```bash
cd server/ai
./start.sh          # 首次会自动 uv venv + 装依赖（约 2~3 分钟）
```

或在仓库根目录：

```bash
npm run dev:ai
```

启动后监听 `http://127.0.0.1:8090`（仅本机）。确认：

```bash
curl http://127.0.0.1:8090/health
# {"status":"ok","asr":true,"tts":true,"asr_model":"small","asr_loaded":false,...}
```

`asr_loaded: false` 是正常的——Whisper 是**懒加载**的，第一次 ASR 请求才会把权重读进显存，
否则启动时就要等 3GB 下载，健康检查必然超时。

> ⚠️ **改完 `app.py` 必须手动重启边车。** uvicorn 没开 `--reload`，进程不会自己重载，
> 改完不重启会以为改动没生效（本项目就踩过一次：加完 `initial_prompt` 后测出来结果
> 一模一样，其实是旧进程还在跑）。Node 端是 nodemon，会自动重启，两边行为不一样。

## 配置

边车启动时会读取 **`server/.env`**（和 Node 端共用同一份文件，见 `app.py` 的
`_load_server_env()`）。命令行上显式传的环境变量优先于文件。

| 变量 | 默认 | 说明 |
|---|---|---|
| `ASR_MODEL` | `large-v3` | Whisper 规格，见下表 |
| `ASR_DEVICE` | `cuda` | 纯 CPU 机器设 `cpu` |
| `ASR_COMPUTE_TYPE` | `float16` | CPU 上应改 `int8`，否则慢且吃内存 |
| `AI_PORT` / `AI_HOST` | `8090` / `127.0.0.1` | 监听地址 |
| `HF_ENDPOINT` | 空 | 国内网络设为 `https://hf-mirror.com` |
| `TTS_VOICE_ZH` / `_VI` / `_EN` | 见下 | edge-tts 音色名 |

音色默认值：`zh-CN-XiaoxiaoNeural`、`vi-VN-HoaiMyNeural`、`en-US-AriaNeural`。
可用 `uv run edge-tts --list-voices` 枚举全部音色。

### Whisper 规格怎么选

| 规格 | 权重体积 | 建议 |
|---|---|---|
| `tiny` | ~75 MB | 只验流程，识别质量差 |
| `base` | ~145 MB | 英文可用；中文会出现同音字错误（`道岔`→`倒插`），越南语声调易错 |
| **`small`** | ~480 MB | **本项目默认**。中越英三语都能用，速度与准确率平衡最好 |
| `medium` | ~1.5 GB | 更准，显存换质量 |
| `large-v3` | ~3 GB | 最准。24G 显存完全跑得动，但首次下载耗时长 |

权重首次使用时从 HuggingFace 拉取并缓存在 `~/.cache/huggingface/`，之后不再下载。

> **国内网络必须先设镜像**。直连 `huggingface.co` 在国内基本不通，会卡在 0 字节不动：
> ```bash
> HF_ENDPOINT=https://hf-mirror.com ./start.sh
> ```
> 写进 `server/.env` 更省事，边车会自动读到。

## 关于 CUDA

`ctranslate2`（faster-whisper 的推理后端）的 wheel **不打包 CUDA 运行库**，运行时
`dlopen("libcublas.so.12")`——注意是 **12**，只认这个 SONAME。

如果本机装的是 CUDA 13 的 pip 库（`libcublas.so.13`），会**直接加载失败**，而不是干净地
回退到 CPU。`requirements.txt` 里的 `nvidia-cublas-cu12` / `nvidia-cudnn-cu12` 就是为此，
`start.sh` 会把 `site-packages/nvidia/*/lib` 加进 `LD_LIBRARY_PATH`。

cu12 与 cu13 的 SONAME 不同，可以并存，不会互相覆盖。

纯 CPU 运行：把 `nvidia-*` 两行从 `requirements.txt` 删掉，并设
`ASR_DEVICE=cpu` + `ASR_COMPUTE_TYPE=int8`。

## 音频格式

浏览器 `MediaRecorder` 录出来的通常是 **webm/opus**。faster-whisper 自带 PyAV 解码，
**不需要系统安装 ffmpeg**。TTS 输出固定为 `audio/mpeg`（MP3）。

上传上限由 Node 端的 `ASR_MAX_BYTES` 控制（默认 20MB），边车本身不限制。

## 排错

| 现象 | 原因 |
|---|---|
| `/health` 返回 `asr: false`，`asr_import_error` 有值 | faster-whisper 没装上，看 `asr_import_error` 具体报错 |
| 首次 ASR 请求很慢（几十秒） | 正常，在下载/加载权重。看边车日志的 `正在加载 Whisper 模型 ...` |
| 权重下载卡在 0% | 没设 `HF_ENDPOINT` 镜像 |
| 中文识别成同音错字 | 模型太小，换 `small` 或以上 |
| `/health` 里 `tts: false` | edge-tts 版本过低。2026-01 起微软收紧鉴权，**必须 >= 7.2.8** |
| TTS 返回 403 / 握手失败 | 同上；网络也可能需要代理 |
| GPU 初始化报找不到 `libcublas.so.12` | 见上面「关于 CUDA」 |

## 上游

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) —— CTranslate2 版 Whisper
- [edge-tts](https://github.com/rany2/edge-tts) —— 微软 Edge 在线语音合成
