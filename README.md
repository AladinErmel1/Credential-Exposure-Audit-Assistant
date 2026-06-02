# CredScan AI

AI-powered credential exposure audit assistant. Detects inadvertently exposed login credentials in corporate training videos by analyzing audio transcripts and scanning video frames with AI vision.

---

## Using the Railway app (no setup required)

Open the public URL. On the welcome screen you will see an **API Keys** section:

1. **Anthropic key** (required for analysis, chat, and visual frame scanning) — get one at [console.anthropic.com](https://console.anthropic.com)
2. **OpenAI key** (recommended for Whisper audio transcription; also used as Anthropic fallback) — get one at [platform.openai.com](https://platform.openai.com)

Enter your keys and upload a video. Keys are saved in your **browser's localStorage** — you only need to enter them once per device. They are never sent to any server other than the respective AI providers (Anthropic / OpenAI) when you run an analysis.

To remove stored keys, click **Clear keys** in the API Keys section.

---

## Running locally

### 1) Install dependencies
```bash
npm install
```

### 2) Configure API keys

**Option A — enter keys in the app UI** (same as Railway, no extra steps)

**Option B — set environment variables** so the dev-server proxy injects them automatically (keys don't need to be typed in the UI):

Create `.env` in the project root:
```env
VITE_ANTHROPIC_API_KEY=your_anthropic_key
ANTHROPIC_API_KEY=your_anthropic_key
VITE_OPENAI_API_KEY=your_openai_key
OPENAI_API_KEY=your_openai_key
```

> `.env` is gitignored and must never be committed.

### 3) Start the dev server
```bash
npm run dev
```

### 4) Open in browser
Open the URL shown in terminal (usually `http://localhost:3000`).

---

## What the app does

| Step | What happens |
|------|-------------|
| 1 | Upload a corporate training video (MP4, WebM, MOV, AVI, MKV) |
| 2 | Audio is transcribed via OpenAI Whisper or browser speech recognition |
| 3 | Claude analyzes the transcript for credential exposure (usernames, passwords, tokens) |
| 4 | Claude Vision independently scans sampled video frames for on-screen credentials |
| 5 | Review flagged findings, mark status, and export a full audit report |

All video processing happens in the browser. Only transcribed text and resized frame images are sent to the AI APIs.
