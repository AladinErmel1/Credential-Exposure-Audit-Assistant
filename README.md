# CredScan AI

Minimal steps to run the app locally.

## 1) Install dependencies
```bash
npm install
```

## 2) Configure API keys
Create/update `.env` in the project root:

```env
VITE_ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
```

`OPENAI_API_KEY` is used for Whisper transcription and fallback analysis/chat.

## 3) Start the app
```bash
npm run dev
```

## 4) Open in browser
Open the URL shown in terminal (usually `http://localhost:3000`).

