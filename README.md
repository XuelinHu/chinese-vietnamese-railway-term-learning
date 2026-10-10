# chinese-vietnamese-railway-term-learning

<p align="center">
  <img height="20" alt="Vue 3.5.13" src="https://img.shields.io/badge/vue-3.5.13-4FC08D" />
  <img height="20" alt="Vite 6.0.7" src="https://img.shields.io/badge/vite-6.0.7-646CFF" />
  <img height="20" alt="Express 4.21.2" src="https://img.shields.io/badge/express-4.21.2-000000" />
  <img height="20" alt="MySQL configured" src="https://img.shields.io/badge/mysql-configured-4479A1" />
  <img height="20" alt="License GPL-2.0" src="https://img.shields.io/badge/license-GPL--2.0-3DA639" />
</p>

面向越南留学生的铁道专业汉越术语翻译学习软件 V1.0

H5 前端 + Node.js 后台 + MySQL 数据库 + 本地大模型/语音边车的铁道专业术语翻译学习平台。

## 功能范围

- 三语言界面：中文、English、Tiếng Việt
- **完整用户全流程**：注册、登录、改密码、找回密码（邮箱验证码）、个人中心
- 专业术语学习：分类浏览、三语对照、收藏、难度筛选
- 练习平台：按分类/难度生成单选、判断、填空、翻译练习
- 数据分析：学习次数、正确率、错题、高频错误术语、分类统计
- **管理台 13 个菜单，全部支持分页 + 筛选**：用户、角色、菜单权限、分类、术语、
  练习记录、错题本、收藏、登录日志、操作日志、智能体会话、模型管理，外加数据看板
- **智能体**：右下角悬浮球打开问答弹框，支持
  - 流式逐字回答（SSE）
  - 模型下拉切换（Ollama 本地模型，按显存分档）
  - **语音播报（TTS）** 与 **语音对话（ASR）**，三级降级保证始终可用
  - 连续对话模式（自动收音 → 转写 → 提问 → 播报 → 再收音，播报期间静音防回声）
- **术语接地（RAG）**：提问时先从术语库检索相关词条注入提示词，小模型也能答准铁道术语

## 架构

```
浏览器 H5 (Vue 3 + vue-router)
  └─ AgentWidget（悬浮球 → 弹框）
        ├─ 流式问答  fetch + ReadableStream ← SSE
        ├─ 语音播报  /api/agent/tts (edge-tts) → <audio>，降级 speechSynthesis
        └─ 语音对话  Android 原生桥 > 服务端 Whisper > Web Speech
              │
Express :8031 ──┼── MySQL :3306
                ├── Ollama :11434   （/api/chat 流式、/api/tags、/api/pull）
                └── AI 边车 :8090   （FastAPI：/asr faster-whisper、/tts edge-tts）
```

**降级原则**：AI 边车没启动时 `/api/agent/health` 返回 `asr:false, tts:false`，前端自动切到浏览器能力。
整套智能体在**不装任何 Python 依赖**的情况下依然可用，只是语音质量降级。

## Android 端

H5 应用由 Android WebView 承载，语音有两条路径：默认走 WebView `MediaRecorder` → 服务端 Whisper
（中越英三语都准，与 H5 同一套代码）；也可通过 `window.RailwayNative` 桥接交给系统级
`SpeechRecognizer` / `TextToSpeech`。

⚠️ **`getUserMedia` 需要安全上下文**：WebView 必须加载 `https://localhost`（或 https 域名）。
加载 `http://<局域网IP>` 时 `navigator.mediaDevices` 直接是 `undefined` 且**不抛任何异常**——
这是最难排查的失败模式。完整协议、Kotlin 参考实现与自测清单见
**[docs/android-webview.md](docs/android-webview.md)**。

## 配置

复制 `server/.env.example` 为 `server/.env` 后按本机情况修改（`.env` 已被 gitignore，不要提交真实口令）。
除数据库与 JWT 外，其余均可留空——留空时对应能力自动降级，不会阻塞启动。

首次启动后端会自动创建数据表和演示数据。请先确保 MySQL 已启动，并且 `root` 账号允许从本机连接。

## 启动

```bash
npm install
npm run dev          # 前端 4026 + 后端 8031
npm run dev:ai       # 可选：语音边车 8090，不启动则语音降级到浏览器能力
```

- 前端：http://localhost:4026
- 后端：http://localhost:8031
- 语音边车：http://127.0.0.1:8090（仅本机）

演示账号：

- 管理员：admin / admin123
- 教师：teacher / teacher123
- 学生：student / student123

## 智能体依赖

文字问答需要本机跑着 **Ollama**：

```bash
ollama serve                 # 默认 127.0.0.1:11434
ollama pull qwen3:14b        # 或任意目录内列出的模型
```

模型清单一期内置了 qwen3 / deepseek-r1 / qwen2.5 / glm4 / yi 等系列的 7B~70B 规格，
按 24G 显存分档展示；未安装的条目可在「管理台 → 模型管理」里点「拉取」，带实时进度条。

语音边车（`npm run dev:ai`）首次使用时会下载 Whisper 权重并缓存到 `~/.cache/huggingface/`。
默认 `small`（约 480MB），中越英三语都有可用的准确率；追求质量可在 `server/.env` 里把
`ASR_MODEL` 调成 `large-v3`（约 3GB，24G 显存跑得动）。

⚠️ **直连 `huggingface.co` 在国内基本不通，会卡在 0 字节不动**，务必设镜像
（写进 `server/.env` 即可，边车会自动读取）：

```bash
HF_ENDPOINT=https://hf-mirror.com npm run dev:ai
```

边车与 Node 端共用 `server/.env`，边车的完整配置项、模型规格对照表与排错见
**[server/ai/README.md](server/ai/README.md)**。

## 测试

```bash
npm run smoke        # 需要后端已启动；覆盖注册/改密/找回密码全流程、13 个分页菜单、智能体 SSE
```

## 文档

- [docs/android-webview.md](docs/android-webview.md) —— Android WebView 接入、`window.RailwayNative` 桥接协议与 Kotlin 参考实现

## 开源协议

本项目使用 GNU General Public License v2.0（GPL-2.0）开源，详见 `LICENSE`。

## 启动端口

网页入口：4026；后台服务：8031、8090。完整启动约定见 [PORTS.md](./PORTS.md)。
