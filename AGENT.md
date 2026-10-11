# AGENT.md

## Project

- Project: `chinese-vietnamese-railway-term-learning`
- Stack: Vue 3 + Vite frontend, Node.js + Express backend, PostgreSQL

## Runtime

- Frontend port: `4026` from `client/vite.config.js`.
- Backend port: `8031` from `server/.env.example` `PORT`.
- AI sidecar port: `8090`, local-only (`127.0.0.1`). Start with `npm run dev:ai`.
- Frontend proxy: `/api -> http://localhost:8031`.
- Start all: `npm install && npm run dev`. The sidecar is separate and optional.
- Build frontend: `npm run build`.
- Smoke test: `npm run smoke` (backend must be running).

## Database

- Type: PostgreSQL.
- Database name: `railway_term_learning`.
- Env file: `server/.env` based on `server/.env.example`.
- Variables: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPOOL_MAX`, `PGSSL`, `JWT_SECRET`, `JWT_EXPIRES_IN`,
  `OLLAMA_*`, `AI_SIDECAR_*`, `ASR_*`, `SMTP_*`, `RESET_CODE_TTL_MINUTES`.
- Keep real passwords only in local `.env`; do not commit credentials.
- The database must be provisioned before startup; the application never creates a database.
- Canonical schema is `server/src/db/postgres/schema.sql`; migration history is checksum-verified in `schema_migrations` under a PostgreSQL advisory lock.
- Weak demo accounts and bulk test data require a `_test` database and explicit `ALLOW_DEMO_SEED=1`.

## External services

- Ollama at `127.0.0.1:11434` backs the agent chat. Unreachable => `/api/agent/health` reports `llm.available: false`.
- AI sidecar at `127.0.0.1:8090` backs ASR (faster-whisper) and TTS (edge-tts).
  Unreachable => the frontend falls back to browser `SpeechRecognition` / `speechSynthesis`.
  Never make the main flow depend on the sidecar.
- The sidecar reads `server/.env` itself (`app.py` `_load_server_env()`), so `ASR_MODEL` etc.
  live in one file for both runtimes. Explicit env vars win over the file.
- The sidecar runs uvicorn **without** `--reload` — restart it after editing `app.py`.
- ASR passes an `initial_prompt` built from `railway_term` (`rag.domainPrompt()`). Without it
  Whisper turns 道岔 into 倒插 and `ghi` into `Khi` on short clips. The prompt also biases the
  output toward Simplified Chinese. Only real terms are used — the `seed:test-data` filler rows
  (which contain digits) are filtered out, since they would bias decoding toward "XX测试0NN".

## Codex Notes

- Backend applies its PostgreSQL schema on startup; demo accounts are created only by explicit isolated test configuration.
- If ports, schema, or env vars change, update README and this file together.
- Paginated endpoints always share one envelope: `{ rows, total, page, pageSize }`.
- `LIMIT`/`OFFSET` values are parsed, clamped, then string-interpolated — see `server/src/utils/pagination.js`.
- Frontend lists all go through `usePagination` + `PagedTable` so every admin menu stays paginated.
- `getUserMedia` needs a secure context. On `http://<LAN-IP>` `navigator.mediaDevices` is `undefined`
  and throws nothing. Android WebView must load `https://localhost` — see `docs/android-webview.md`.

## GitHub Commit Language

- Use English for all GitHub commit messages and pull/push related commit notes.

## Port allocation

Web: 4026. API/services: 8031、8090. See `PORTS.md`; keep dev/preview ports fixed and fail on conflicts.
