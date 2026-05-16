<div align="center">

  # Skye — Telegram Automation Dashboard

  A self-hosted dashboard for managing Telegram automation: auto-replies, message broadcasting, music downloads, PDF conversion, and AI-powered responses.

  </div>

  ## Deploy on Railway

  1. Fork this repo
  2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select your fork
  3. Set the required environment variables (see table below)
  4. Railway builds and deploys automatically on every push

  ## Environment Variables

  | Variable | Required | Description |
  |---|---|---|
  | `TELEGRAM_API_ID` | ✅ | From [my.telegram.org](https://my.telegram.org) |
  | `TELEGRAM_API_HASH` | ✅ | From [my.telegram.org](https://my.telegram.org) |
  | `TELEGRAM_STRING_SESSION` | ✅ | Your account string session (generate via dashboard Settings) |
  | `SESSION_SECRET` | ✅ | Any long random string for Express session signing |
  | `BLUESMINDS_API_KEY` | Optional | BluesMinds AI API key |
  | `GEMINI_API_KEY` | Optional | Google Gemini API key |
  | `GROQ_API_KEY` | Optional | Groq API key |
  | `OPENROUTER_API_KEY` | Optional | OpenRouter API key |

  ## Run Locally

  ```bash
  npm install
  cp .env.example .env.local
  # Fill in .env.local with your credentials
  npm run dev
  ```

  ## Stack

  - **Frontend:** React 19 + Vite + Tailwind CSS 4
  - **Backend:** Express 4 + TypeScript (bundled with esbuild)
  - **Database:** SQLite via better-sqlite3
  - **Telegram:** GramJS (Telethon-compatible)
  - **AI:** BluesMinds / Gemini / Groq / OpenRouter
  - **Music:** yt-dlp + ytdl-core fallback chain
  