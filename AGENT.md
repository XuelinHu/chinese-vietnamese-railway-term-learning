# AGENT.md

## Project

- Project: `chinese-vietnamese-railway-term-learning`
- Stack: Vue 3 + Vite frontend, Node.js + Express backend, MySQL

## Runtime

- Frontend port: `5173` from `client/vite.config.js`.
- Backend port: `3000` from `server/.env.example` `PORT`.
- Frontend proxy: `/api -> http://localhost:3000`.
- Start all: `npm install && npm run dev`.
- Build frontend: `npm run build`.

## Database

- Type: MySQL.
- Database name: `railway_term_learning`.
- Env file: `server/.env` based on `server/.env.example`.
- Variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `JWT_EXPIRES_IN`.
- Keep real passwords only in local `.env`; do not commit credentials.

## Codex Notes

- Backend auto-creates tables and demo data on first startup.
- If ports, schema, or env vars change, update README and this file together.

## GitHub Commit Language

- Use English for all GitHub commit messages and pull/push related commit notes.
