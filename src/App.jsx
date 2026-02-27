import React, { useState, useRef, useEffect, useCallback } from 'react';

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are CredScan AI, a specialized audit assistant for internal auditors conducting IT and cybersecurity audits. Your specific domain is the detection of inadvertently exposed login credentials (usernames and passwords) within corporate training videos stored on internal or external networks.

You were designed based on a peer-reviewed research methodology published for the Journal of Information Systems (JIS). You operate as a human-in-the-loop tool: you analyze, flag, and advise, but the auditor makes the final judgment.

---

YOUR CORE CAPABILITIES:

1. TRANSCRIPT ANALYSIS (Stage 1 of the pipeline)
When you receive a video transcript for analysis, you MUST perform the following and return your findings in a STRUCTURED JSON FORMAT:

   a) Scan for authentication-related keywords: "login," "password," "username," "credentials," "sign in," "authenticate," "access," "account," "SAP logon," "transaction code," "client number," "user ID," "passphrase," "PIN," "two-factor," "MFA," "single sign-on," "SSO," and similar terms.

   b) Perform semantic analysis: identify segments where the speaker describes, narrates, or demonstrates a login or authentication procedure even without explicit keywords.

   c) When the user's message starts with "[TRANSCRIPT_ANALYSIS]", you MUST respond with ONLY a valid JSON object (no markdown, no explanation, no backticks) in exactly this format:

   {
     "summary": "Brief overall assessment of the video's credential exposure risk",
     "overall_risk": "HIGH",
     "total_flags": 3,
     "flags": [
       {
         "id": 1,
         "timestamp_start": "MM:SS",
         "timestamp_end": "MM:SS",
         "text": "Exact quoted text of the flagged segment",
         "risk_level": "HIGH",
         "category": "credential_entry",
         "explanation": "Why this segment was flagged",
         "recommended_window_start": "MM:SS",
         "recommended_window_end": "MM:SS",
         "frame_extraction_priority": "CRITICAL"
       }
     ],
     "remediation": [
       "Specific remediation action 1",
       "Specific remediation action 2"
     ],
     "frameworks": ["COBIT 2019 DSS05.04", "NIST AC-2", "ISO 27001 A.9.2"]
   }

   Rules for the JSON response:
   - timestamp_start and timestamp_end should reflect the actual segment timestamps from the transcript
   - recommended_window should be approximately ±1 minute around the flagged moment
   - frame_extraction_priority should be CRITICAL for segments where credentials appear to be actively typed or displayed, HIGH for login screen navigation, and STANDARD for general authentication references
   - Include ALL flagged segments, even LOW risk ones
   - Be thorough but avoid false alarms. If a segment is borderline, classify it as MEDIUM or LOW

2. CONVERSATIONAL AUDIT SUPPORT
For any message that does NOT start with "[TRANSCRIPT_ANALYSIS]", respond conversationally as an audit expert. You can help with:
   - Interpreting the analysis results and answering follow-up questions
   - Assessing severity based on system criticality, role privileges, age of video, access breadth
   - Cross-referencing: COBIT 2019 DSS05/DSS06, ISO 27001 A.9, NIST SP 800-53 AC and IA families, IIA Global Internal Audit Standards 2024
   - Drafting finding language suitable for an audit report
   - Suggesting immediate and long-term remediation actions
   - Planning broader credential exposure audits across video libraries
   - Technical guidance on ASR tools (Whisper), NLP classification, OCR pipeline setup
   - Regulatory context: SOX, GDPR, FDA 21 CFR Part 11, EU AI Act implications

---

RESPONSE STYLE (for conversational mode):
- Be precise and audit-oriented. Auditors need specifics, not generalities.
- Use professional but accessible language.
- Cite frameworks specifically (e.g., "COBIT 2019 DSS05.04" not just "COBIT").
- Always remind the auditor that your analysis supports but does not replace professional judgment.

---

IMPORTANT CONSTRAINTS:
- When responding to [TRANSCRIPT_ANALYSIS] messages, return ONLY valid JSON. No markdown wrapping, no explanation text, no code fences.
- Never fabricate audit findings or claim to have analyzed actual video frames.
- Never provide legal advice; recommend consulting legal counsel for GDPR/regulatory questions.
- If a transcript contains what appears to be real credentials, flag it immediately and recommend the auditor treat the session as sensitive/confidential.
- Always emphasize the human-in-the-loop principle: you flag, the auditor decides.`;

// ─── SAMPLE TRANSCRIPT ────────────────────────────────────────────────────────
const SAMPLE_TRANSCRIPT = [
  { start: 0,   end: 7,   text: "Welcome to this SAP S/4HANA training module for the procurement team." },
  { start: 8,   end: 14,  text: "Today I'll walk you through how to create a purchase order from start to finish." },
  { start: 15,  end: 21,  text: "Let's begin by opening the SAP GUI. I'll log in now." },
  { start: 22,  end: 27,  text: "So here at the SAP logon screen, I'll enter my client number, which is 100." },
  { start: 28,  end: 34,  text: "My username is JSMITH_PROC and my password... let me just type that in... there we go." },
  { start: 35,  end: 41,  text: "And we're in. You'll see the SAP Easy Access screen now." },
  { start: 42,  end: 74,  text: "Navigate to transaction code ME21N to create a new purchase order." },
  { start: 75,  end: 89,  text: "First, select the vendor. I'll use vendor 10001, which is our main office supplies vendor." },
  { start: 90,  end: 164, text: "Now enter the material number, quantity, and delivery date as required by the purchase requisition." },
  { start: 165, end: 179, text: "Once you've filled everything in, click the save icon or press Ctrl+S." },
  { start: 180, end: 194, text: "The system will generate a PO number automatically." },
  { start: 195, end: 204, text: "That's it for creating a basic purchase order. In the next module, we'll cover the three-way match process." },
  { start: 205, end: 214, text: "If you need to reset your password, go to the IT service desk portal and submit a ticket." },
  { start: 215, end: 224, text: "Remember, never share your login details with colleagues. Use the delegation feature instead." },
  { start: 225, end: 234, text: "Thanks for watching, and don't hesitate to reach out if you have questions." },
];

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  bg:          '#0f0d0a',
  bgCard:      '#1a1610',
  bgSurface:   '#222018',
  bgHover:     '#2a2416',
  bgInput:     '#1e1c14',
  gold:        '#c4a35a',
  goldLight:   '#e8d5a3',
  goldDim:     '#7a6030',
  goldBorder:  'rgba(196,163,90,0.25)',
  text:        '#e8d5a3',
  textMuted:   '#8a7a5a',
  textDim:     '#5a4a2a',
  red:         '#d95050',
  redLight:    '#f07070',
  redDim:      '#2a1010',
  amber:       '#d4a020',
  amberLight:  '#f0c040',
  amberDim:    '#2a2000',
  green:       '#4a9a5a',
  greenLight:  '#6ab870',
  greenDim:    '#0a2010',
  border:      '#2a2418',
  borderLight: '#3a3428',
  mono:        "'JetBrains Mono', 'Courier New', monospace",
  serif:       "'Source Serif 4', Georgia, serif",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const parseTimestamp = (ts) => {
  if (!ts) return 0;
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  return 0;
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

const getRiskColor = (risk) => {
  switch ((risk || '').toUpperCase()) {
    case 'HIGH':   return T.red;
    case 'MEDIUM': return T.amber;
    case 'LOW':    return T.green;
    case 'NONE':   return T.textMuted;
    default:       return T.textMuted;
  }
};

const getRiskBg = (risk) => {
  switch ((risk || '').toUpperCase()) {
    case 'HIGH':   return T.redDim;
    case 'MEDIUM': return T.amberDim;
    case 'LOW':    return T.greenDim;
    default:       return T.bgCard;
  }
};

const getCategoryLabel = (cat) => ({
  credential_entry:   'Credential Entry',
  credential_mention: 'Credential Mention',
  auth_procedure:     'Auth Procedure',
  password_reference: 'Password Reference',
  access_discussion:  'Access Discussion',
}[cat] || cat || 'Unknown');

const getStatusLabel = (status) => ({
  unreviewed:          'Unreviewed',
  confirmed:           'Confirmed Finding',
  false_positive:      'False Positive',
  needs_investigation: 'Needs Investigation',
}[status] || 'Unreviewed');

const getStatusColor = (status) => ({
  confirmed:           T.red,
  false_positive:      T.green,
  needs_investigation: T.amber,
}[status] || T.textMuted);

// Simple markdown renderer for chat messages
const renderMarkdown = (text) => {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} style={{
          background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4,
          padding: '12px 16px', fontFamily: T.mono, fontSize: 12, overflowX: 'auto',
          color: T.goldLight, margin: '8px 0', lineHeight: 1.6,
        }}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} style={{ color: T.gold, fontSize: 14, fontWeight: 600, margin: '12px 0 4px' }}>{inlineFormat(line.slice(4))}</h3>);
      i++; continue;
    }
    // H2
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} style={{ color: T.goldLight, fontSize: 16, fontWeight: 600, margin: '14px 0 6px' }}>{inlineFormat(line.slice(3))}</h2>);
      i++; continue;
    }
    // H1
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} style={{ color: T.goldLight, fontSize: 18, fontWeight: 600, margin: '16px 0 8px' }}>{inlineFormat(line.slice(2))}</h1>);
      i++; continue;
    }
    // Bullet list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(<li key={i} style={{ margin: '2px 0', paddingLeft: 4 }}>{inlineFormat(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} style={{ paddingLeft: 20, margin: '6px 0', listStyleType: 'disc' }}>{items}</ul>);
      continue;
    }
    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={i} style={{ margin: '2px 0', paddingLeft: 4 }}>{inlineFormat(lines[i].replace(/^\d+\.\s/, ''))}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} style={{ paddingLeft: 20, margin: '6px 0' }}>{items}</ol>);
      continue;
    }
    // Horizontal rule
    if (line === '---' || line === '***') {
      elements.push(<hr key={i} style={{ border: 'none', borderTop: `1px solid ${T.border}`, margin: '10px 0' }} />);
      i++; continue;
    }
    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: 6 }} />);
      i++; continue;
    }
    // Normal paragraph
    elements.push(<p key={i} style={{ margin: '3px 0', lineHeight: 1.65 }}>{inlineFormat(line)}</p>);
    i++;
  }
  return elements;
};

const inlineFormat = (text) => {
  if (!text) return text;
  // Split on bold (**text**), italic (*text*), inline code (`text`)
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={idx} style={{ color: T.goldLight }}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={idx}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={idx} style={{ fontFamily: T.mono, fontSize: '0.88em', background: T.bg, padding: '1px 5px', borderRadius: 3, color: T.amberLight }}>{part.slice(1, -1)}</code>;
    return part;
  });
};

// ─── API ─────────────────────────────────────────────────────────────────────
const TRANSCRIPTION_LANGUAGE_OPTIONS = [
  { value: 'auto',  label: 'Auto-detect (browser locale)' },
  { value: 'de-DE', label: 'German (de-DE)' },
  { value: 'en-US', label: 'English (en-US)' },
  { value: 'fr-FR', label: 'French (fr-FR)' },
  { value: 'es-ES', label: 'Spanish (es-ES)' },
  { value: 'it-IT', label: 'Italian (it-IT)' },
  { value: 'nl-NL', label: 'Dutch (nl-NL)' },
  { value: 'pt-PT', label: 'Portuguese (pt-PT)' },
];

const TRANSCRIPTION_ENGINE_OPTIONS = [
  { value: 'auto', label: 'Auto (OpenAI then browser)' },
  { value: 'openai', label: 'OpenAI Whisper' },
  { value: 'browser', label: 'Browser speech recognition' },
];

const resolveAutoTranscriptionLanguage = () => {
  if (typeof navigator === 'undefined') return 'en-US';
  const preferred = [...(navigator.languages || []), navigator.language]
    .filter(Boolean)
    .map((l) => String(l).toLowerCase());

  if (preferred.some((l) => l.startsWith('de'))) return 'de-DE';
  if (preferred.some((l) => l.startsWith('en'))) return 'en-US';
  if (preferred.some((l) => l.startsWith('fr'))) return 'fr-FR';
  if (preferred.some((l) => l.startsWith('es'))) return 'es-ES';
  if (preferred.some((l) => l.startsWith('it'))) return 'it-IT';
  if (preferred.some((l) => l.startsWith('nl'))) return 'nl-NL';
  if (preferred.some((l) => l.startsWith('pt'))) return 'pt-PT';
  return 'en-US';
};

const getSpeechRecognitionErrorMessage = (code, language) => {
  switch (code) {
    case 'language-not-supported':
      return `Speech recognition does not support ${language}. Choose another language in Settings.`;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was denied. Allow microphone access and retry.';
    case 'audio-capture':
      return 'No audio input is available for speech recognition.';
    case 'network':
      return 'Speech recognition network error. Check connectivity and retry.';
    default:
      return `Speech recognition error: ${code}`;
  }
};

const getVideoSourceErrorMessage = (video) => {
  const code = video?.error?.code;
  switch (code) {
    case 1:
      return 'Video loading was aborted before transcription started.';
    case 2:
      return 'A network error occurred while loading the video.';
    case 3:
      return 'The video could not be decoded by this browser.';
    case 4:
      return 'This video format/codec is not supported by your browser for transcription.';
    default:
      return 'The selected video source cannot be played in this browser.';
  }
};

const waitForVideoReady = (video, timeoutMs = 15000) => new Promise((resolve, reject) => {
  if (!video) {
    reject(new Error('Video element not ready.'));
    return;
  }
  if (video.error) {
    reject(new Error(getVideoSourceErrorMessage(video)));
    return;
  }
  if (video.readyState >= 2) {
    resolve();
    return;
  }

  let done = false;
  const finish = (fn) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    video.removeEventListener('loadeddata', onReady);
    video.removeEventListener('canplay', onReady);
    video.removeEventListener('error', onError);
    fn();
  };
  const onReady = () => finish(resolve);
  const onError = () => finish(() => reject(new Error(getVideoSourceErrorMessage(video))));
  const timer = setTimeout(() => finish(() => reject(new Error('Timed out while preparing video for transcription.'))), timeoutMs);

  video.addEventListener('loadeddata', onReady);
  video.addEventListener('canplay', onReady);
  video.addEventListener('error', onError);
});

const DIRECT_ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DIRECT_OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DIRECT_OPENAI_TRANSCRIPTION_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;

const getAnthropicEndpoints = () => {
  const configured =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ANTHROPIC_API_BASE_URL) || '';
  if (configured.trim()) return [configured.trim()];

  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    return ['/api/anthropic/v1/messages', DIRECT_ANTHROPIC_ENDPOINT];
  }
  return [DIRECT_ANTHROPIC_ENDPOINT];
};

const getOpenAIChatEndpoints = () => {
  const configured =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_CHAT_API_BASE_URL) || '';
  if (configured.trim()) return [configured.trim()];

  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    return ['/api/openai/v1/chat/completions', DIRECT_OPENAI_CHAT_ENDPOINT];
  }
  return [DIRECT_OPENAI_CHAT_ENDPOINT];
};

const getOpenAITranscriptionEndpoints = () => {
  const configured =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_TRANSCRIPTION_API_BASE_URL) || '';
  if (configured.trim()) return [configured.trim()];

  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    return ['/api/openai/v1/audio/transcriptions', DIRECT_OPENAI_TRANSCRIPTION_ENDPOINT];
  }
  return [DIRECT_OPENAI_TRANSCRIPTION_ENDPOINT];
};

const getOpenAIKeyFromEnv = () =>
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) || '';

const getOpenAIModel = () =>
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_MODEL) || 'gpt-4o-mini';

const getOpenAITranscriptionModel = () =>
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_TRANSCRIPTION_MODEL) || 'whisper-1';

const normalizeLanguageForOpenAI = (languageTag) => {
  if (!languageTag || languageTag === 'auto') return '';
  return String(languageTag).split('-')[0].toLowerCase();
};

const readApiErrorMessage = async (res) => {
  const errText = await res.text().catch(() => '');
  if (!errText) return `API error ${res.status}: ${res.statusText}`;
  try {
    const errData = JSON.parse(errText);
    return errData.error?.message || errData.message || errText;
  } catch {
    return errText;
  }
};

const extractOpenAIChatContent = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        return part?.text || '';
      })
      .join('\n')
      .trim();
  }
  return '';
};

const getSupportedAudioRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  const preferred = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  for (const type of preferred) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {}
  }
  return '';
};

const extractAudioTrackForWhisper = async (videoFile) => new Promise((resolve, reject) => {
  if (typeof document === 'undefined') {
    reject(new Error('Audio extraction is only available in browser runtime.'));
    return;
  }
  const streamCapture = HTMLMediaElement.prototype.captureStream || HTMLMediaElement.prototype.mozCaptureStream;
  if (!streamCapture) {
    reject(new Error('This browser does not support media stream capture for large-file transcription.'));
    return;
  }

  const objectUrl = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.src = objectUrl;
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;

  let done = false;
  let stream = null;
  let recorder = null;
  const chunks = [];
  const timeout = setTimeout(() => {
    finalize(new Error('Timed out while extracting audio for Whisper.'));
  }, 120000);

  const cleanup = () => {
    clearTimeout(timeout);
    URL.revokeObjectURL(objectUrl);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
  };

  const finalize = (err, file) => {
    if (done) return;
    done = true;
    cleanup();
    if (err) reject(err);
    else resolve(file);
  };

  video.onerror = () => finalize(new Error('Failed to decode video while preparing audio for Whisper.'));

  video.onloadedmetadata = async () => {
    try {
      stream = streamCapture.call(video);
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        finalize(new Error('No audio track found in video for Whisper transcription.'));
        return;
      }

      const audioStream = new MediaStream(audioTracks);
      const mimeType = getSupportedAudioRecorderMimeType();
      const recOptions = mimeType
        ? { mimeType, audioBitsPerSecond: 64000 }
        : { audioBitsPerSecond: 64000 };

      recorder = new MediaRecorder(audioStream, recOptions);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onerror = () => finalize(new Error('MediaRecorder failed while extracting audio for Whisper.'));
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        if (!blob.size) {
          finalize(new Error('Extracted audio blob is empty.'));
          return;
        }
        const fileNameBase = (videoFile.name || 'audio').replace(/\.[^.]+$/, '');
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
        const audioFile = new File([blob], `${fileNameBase}.whisper.${extension}`, { type: blob.type || 'audio/webm' });
        finalize(null, audioFile);
      };

      video.currentTime = 0;
      recorder.start(1000);
      await video.play();
    } catch (err) {
      finalize(new Error(`Could not prepare compact audio for Whisper: ${err?.message || err}`));
      return;
    }

    video.onended = () => {
      if (recorder && recorder.state === 'recording') recorder.stop();
    };
  };
});

const callOpenAIChat = async (messages, openAiApiKey = '') => {
  const resolvedKey = openAiApiKey || getOpenAIKeyFromEnv();
  const model = getOpenAIModel();
  const endpoints = getOpenAIChatEndpoints();
  let lastError;

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    const hasFallback = i < endpoints.length - 1;

    if (!resolvedKey && !endpoint.startsWith('/api/openai')) {
      lastError = new Error('No OpenAI API key available for direct OpenAI endpoint.');
      continue;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (resolvedKey) headers.Authorization = `Bearer ${resolvedKey}`;

    let res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        }),
      });
    } catch (err) {
      if (endpoint.startsWith('/api/openai') && hasFallback) {
        lastError = new Error(`Local OpenAI proxy unavailable (${err?.message || 'Failed to fetch'}). Retrying direct OpenAI API...`);
        continue;
      }
      throw new Error(`Unable to reach OpenAI API endpoint: ${err?.message || 'Failed to fetch'}`);
    }

    if (!res.ok) {
      const message = await readApiErrorMessage(res);
      if (endpoint.startsWith('/api/openai') && hasFallback && (res.status === 404 || res.status >= 500)) {
        lastError = new Error(`Local OpenAI proxy error (${res.status}). Retrying direct OpenAI API...`);
        continue;
      }
      throw new Error(message);
    }

    const data = await res.json();
    const text = extractOpenAIChatContent(data?.choices?.[0]?.message?.content);
    if (!text) throw new Error('OpenAI response did not include message text.');
    return text;
  }

  throw lastError || new Error('Unable to reach OpenAI chat endpoint.');
};

const transcribeWithOpenAI = async (file, openAiApiKey = '', languageTag = 'auto') => {
  if (!file) throw new Error('No video file provided for OpenAI transcription.');

  const resolvedKey = openAiApiKey || getOpenAIKeyFromEnv();
  const model = getOpenAITranscriptionModel();
  const endpoints = getOpenAITranscriptionEndpoints();
  const language = normalizeLanguageForOpenAI(languageTag);
  let uploadFile = file;
  if (file.size > OPENAI_TRANSCRIPTION_MAX_BYTES) {
    uploadFile = await extractAudioTrackForWhisper(file);
    if (uploadFile.size > OPENAI_TRANSCRIPTION_MAX_BYTES) {
      throw new Error('OpenAI Whisper upload limit exceeded after audio extraction. Use browser transcription for this video.');
    }
  }
  let lastError;

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    const hasFallback = i < endpoints.length - 1;

    if (!resolvedKey && !endpoint.startsWith('/api/openai')) {
      lastError = new Error('No OpenAI API key available for direct transcription endpoint.');
      continue;
    }

    const form = new FormData();
    form.append('file', uploadFile, uploadFile.name || 'audio.webm');
    form.append('model', model);
    form.append('response_format', 'verbose_json');
    if (language) form.append('language', language);

    const headers = {};
    if (resolvedKey) headers.Authorization = `Bearer ${resolvedKey}`;

    let res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: form,
      });
    } catch (err) {
      if (endpoint.startsWith('/api/openai') && hasFallback) {
        lastError = new Error(`Local OpenAI proxy unavailable (${err?.message || 'Failed to fetch'}). Retrying direct OpenAI API...`);
        continue;
      }
      throw new Error(`Unable to reach OpenAI transcription endpoint: ${err?.message || 'Failed to fetch'}`);
    }

    if (!res.ok) {
      const message = await readApiErrorMessage(res);
      if (endpoint.startsWith('/api/openai') && hasFallback && (res.status === 404 || res.status >= 500)) {
        lastError = new Error(`Local OpenAI proxy error (${res.status}). Retrying direct OpenAI API...`);
        continue;
      }
      throw new Error(message);
    }

    const data = await res.json();
    const segments = Array.isArray(data?.segments) && data.segments.length > 0
      ? data.segments.map((s, idx) => ({
          start: Number(s.start || 0),
          end: Number(s.end || (Number(s.start || 0) + 5)),
          text: String(s.text || '').trim(),
          id: s.id ?? idx,
        })).filter((s) => s.text)
      : [{ start: 0, end: 10, text: String(data?.text || '').trim(), id: 0 }].filter((s) => s.text);

    if (!segments.length) {
      throw new Error('OpenAI transcription returned no usable text segments.');
    }

    return {
      segments,
      language: data?.language || (language || ''),
      rawText: data?.text || segments.map((s) => s.text).join(' '),
    };
  }

  throw lastError || new Error('Unable to reach OpenAI transcription endpoint.');
};

const callClaude = async (messages, apiKey, openAiApiKey = '') => {
  const key = apiKey || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ANTHROPIC_API_KEY) || '';
  let anthropicError;

  if (key) {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
    };
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
    });
    const endpoints = getAnthropicEndpoints();

    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      const hasFallback = i < endpoints.length - 1;
      let res;

      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body,
        });
      } catch (err) {
        if (endpoint.startsWith('/api/anthropic') && hasFallback) {
          anthropicError = new Error(`Local Anthropic proxy unavailable (${err?.message || 'Failed to fetch'}). Retrying direct Anthropic API...`);
          continue;
        }
        anthropicError = new Error(`${endpoint.startsWith('/api/anthropic') ? 'Cannot reach the local Anthropic proxy endpoint.' : 'Network/CORS error while contacting Anthropic API.'} ${err?.message || 'Failed to fetch'}`);
        break;
      }

      if (!res.ok) {
        const message = await readApiErrorMessage(res);
        if (endpoint.startsWith('/api/anthropic') && hasFallback && (res.status === 404 || res.status >= 500)) {
          anthropicError = new Error(`Local Anthropic proxy error (${res.status}). Retrying direct Anthropic API...`);
          continue;
        }
        anthropicError = new Error(message);
        break;
      }

      const data = await res.json();
      const text = data?.content?.[0]?.text;
      if (!text) {
        anthropicError = new Error('Anthropic response did not include message text.');
        break;
      }
      return text;
    }
  } else {
    anthropicError = new Error('No Anthropic API key configured. Falling back to OpenAI.');
  }

  try {
    return await callOpenAIChat(messages, openAiApiKey);
  } catch (openErr) {
    if (anthropicError) {
      throw new Error(`${anthropicError.message} OpenAI fallback failed: ${openErr.message}`);
    }
    throw openErr;
  }
};
const extractFrames = async (videoEl, startTime, endTime, fps = 1) => {
  const frames = [];
  const canvas = document.createElement('canvas');
  canvas.width  = videoEl.videoWidth  || 640;
  canvas.height = videoEl.videoHeight || 360;
  const ctx = canvas.getContext('2d');
  const step = Math.max(1 / fps, 0.5);
  const clampedEnd = Math.min(endTime, videoEl.duration || endTime);

  for (let t = startTime; t <= clampedEnd; t += step) {
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('seek timeout')), 4000);
        videoEl.onseeked = () => { clearTimeout(timeout); resolve(); };
        videoEl.onerror  = () => { clearTimeout(timeout); reject(new Error('video error')); };
        videoEl.currentTime = t;
      });
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      frames.push({ time: t, dataUrl: canvas.toDataURL('image/jpeg', 0.85), timestamp: formatTime(t) });
    } catch (e) {
      console.warn(`Frame skip at ${t}s:`, e.message);
    }
  }
  return frames;
};

// ─── ICON COMPONENTS ─────────────────────────────────────────────────────────
const Spinner = ({ size = 16, color = T.gold }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className="spin" style={{ color }}>
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round"/>
  </svg>
);

const CheckIcon = ({ size = 16, color = T.green }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const CircleIcon = ({ size = 16, color = T.textDim }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
  </svg>
);

const UploadIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={T.goldDim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const PlayIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);

const PauseIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16"/>
    <rect x="14" y="4" width="4" height="16"/>
  </svg>
);

const ChatIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const DownloadIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const GearIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
);

const ArrowLeftIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);

const SendIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

// ─── BTN HELPER ──────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, style = {}, disabled = false, variant = 'primary', small = false }) => {
  const base = {
    border: 'none', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: T.serif, fontWeight: 600, display: 'inline-flex', alignItems: 'center',
    gap: 6, transition: 'all 0.15s', opacity: disabled ? 0.5 : 1,
    padding: small ? '6px 12px' : '9px 18px', fontSize: small ? 12 : 14,
  };
  const variants = {
    primary:  { background: T.gold, color: '#0f0d0a' },
    outline:  { background: 'transparent', color: T.gold, border: `1px solid ${T.goldBorder}` },
    ghost:    { background: 'transparent', color: T.textMuted, border: `1px solid ${T.border}` },
    danger:   { background: T.redDim, color: T.redLight, border: `1px solid rgba(217,80,80,0.3)` },
    success:  { background: T.greenDim, color: T.greenLight, border: `1px solid rgba(74,154,90,0.3)` },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...style }} disabled={disabled}>
      {children}
    </button>
  );
};

// ─── RISK BADGE ──────────────────────────────────────────────────────────────
const RiskBadge = ({ risk, small = false }) => (
  <span style={{
    display: 'inline-block',
    background: getRiskBg(risk),
    color: getRiskColor(risk),
    border: `1px solid ${getRiskColor(risk)}40`,
    borderRadius: 4,
    padding: small ? '1px 6px' : '3px 10px',
    fontSize: small ? 10 : 12,
    fontFamily: T.mono,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  }}>
    {risk || 'N/A'}
  </span>
);


// ─── MAIN APP COMPONENT ───────────────────────────────────────────────────────
export default function App() {
  // Core state
  const [mode, setMode]                               = useState('welcome');
  const [videoFile, setVideoFile]                     = useState(null);
  const [videoUrl, setVideoUrl]                       = useState('');
  const [videoDuration, setVideoDuration]             = useState(0);
  const [videoThumbnail, setVideoThumbnail]           = useState('');
  const [transcript, setTranscript]                   = useState([]);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [transcriptionMethod, setTranscriptionMethod] = useState('openai');
  const [transcriptionEngine, setTranscriptionEngine] = useState('openai');
  const [transcriptionLanguage, setTranscriptionLanguage] = useState('auto');
  const [resolvedTranscriptionLanguage, setResolvedTranscriptionLanguage] = useState(resolveAutoTranscriptionLanguage);
  const [analysisResult, setAnalysisResult]           = useState(null);
  const [processingStep, setProcessingStep]           = useState(1);
  const [extractedFrames, setExtractedFrames]         = useState(new Map());
  const [frameExtractionProgress, setFrameExtractionProgress] = useState({ current: 0, total: 0 });
  const [selectedFlagId, setSelectedFlagId]           = useState(null);
  const [flagStatuses, setFlagStatuses]               = useState(new Map());
  const [flagNotes, setFlagNotes]                     = useState(new Map());
  const [chatMessages, setChatMessages]               = useState([]);
  const [chatLoading, setChatLoading]                 = useState(false);

  // UI state
  const [isDragOver, setIsDragOver]       = useState(false);
  const [uploadError, setUploadError]     = useState('');
  const [processingError, setProcessingError] = useState('');
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [filterRisk, setFilterRisk]       = useState('ALL');
  const [sortBy, setSortBy]               = useState('timestamp');
  const [chatInput, setChatInput]         = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualTranscript, setManualTranscript] = useState('');
  const [apiKey, setApiKey]               = useState('');
  const [showApiKey, setShowApiKey]       = useState(false);
  const [openAiApiKey, setOpenAiApiKey]   = useState('');
  const [showOpenAiApiKey, setShowOpenAiApiKey] = useState(false);
  const [showSettings, setShowSettings]   = useState(false);
  const [isSampleMode, setIsSampleMode]   = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [stepTimes, setStepTimes]         = useState({});
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [isPlaying, setIsPlaying]         = useState(false);
  const [playbackRate, setPlaybackRate]   = useState(1);
  const [extractedPreviewFrames, setExtractedPreviewFrames] = useState([]);
  const [showFrameIndex, setShowFrameIndex] = useState(0);

  // Refs
  const videoRef        = useRef(null);
  const hiddenVideoRef  = useRef(null);
  const fileInputRef    = useRef(null);
  const chatEndRef      = useRef(null);
  const chatInputRef    = useRef(null);
  const recognitionRef  = useRef(null);
  const stepStartRef    = useRef({});
  const cancelledRef    = useRef(false);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Sync video player time
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentVideoTime(v.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [mode]);

  // Seek visible video when flag selected
  useEffect(() => {
    if (!selectedFlagId || !analysisResult?.flags) return;
    const flag = analysisResult.flags.find(f => f.id === selectedFlagId);
    if (flag && videoRef.current) {
      videoRef.current.currentTime = parseTimestamp(flag.timestamp_start);
    }
    setShowFrameIndex(0);
  }, [selectedFlagId, analysisResult]);

  // ─── PIPELINE: Step 1 — Browser transcription ─────────────────────────────
  const startBrowserTranscription = useCallback(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) throw new Error('Speech Recognition is not supported in this browser. Please use Chrome or Edge, or use the manual transcript option.');

    const video = hiddenVideoRef.current;
    if (!video) throw new Error('Video element not ready.');
    const activeLanguage = transcriptionLanguage === 'auto'
      ? resolveAutoTranscriptionLanguage()
      : transcriptionLanguage;
    setResolvedTranscriptionLanguage(activeLanguage);
    // Keep background transcription playback fully silent.
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.preload = 'auto';
    if (videoUrl && video.src !== videoUrl) video.src = videoUrl;
    video.load();
    await waitForVideoReady(video);
    if (video.error) throw new Error(getVideoSourceErrorMessage(video));

    return new Promise((resolve, reject) => {
      const recognition = new SR();
      recognition.continuous      = true;
      recognition.interimResults  = true;
      recognition.lang            = activeLanguage;
      recognitionRef.current      = recognition;
      let settled = false;

      const segments = [];
      let accumulated = '';
      const safeResolve = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const safeReject = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r.isFinal) {
            segments.push({
              start: video.currentTime,
              end:   Math.min(video.currentTime + 3, video.duration || video.currentTime + 3),
              text:  r[0].transcript.trim(),
            });
            accumulated += r[0].transcript + ' ';
            setLiveTranscript(accumulated);
          }
        }
        if (video.duration > 0) setTranscriptionProgress((video.currentTime / video.duration) * 100);
      };

      recognition.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        safeReject(new Error(getSpeechRecognitionErrorMessage(e.error, activeLanguage)));
      };

      recognition.onend = () => {
        video.pause();
        const result = segments.length > 0
          ? segments
          : [{ start: 0, end: video.duration || 10, text: accumulated || 'No speech detected.' }];
        safeResolve(result);
      };

      video.currentTime = 0;
      video.playbackRate = 1;
      try {
        recognition.start();
      } catch (err) {
        safeReject(new Error(`Unable to start speech recognition: ${err?.message || err}`));
        return;
      }
      video.play().catch((err) => {
        if (settled || cancelledRef.current) return;
        if (video.error) {
          safeReject(new Error(getVideoSourceErrorMessage(video)));
          return;
        }
        const msg = String(err?.message || 'Playback failed');
        // Ignore benign race where recognition ends quickly and pauses the video before play settles.
        if (msg.toLowerCase().includes('interrupted')) return;
        safeReject(new Error(`Unable to play video for transcription: ${msg}`));
      });

      video.onended  = () => { try { recognition.stop(); } catch {} };
      video.ontimeupdate = () => {
        if (cancelledRef.current) {
          try { recognition.stop(); } catch {}
          video.pause();
        }
        if (video.duration > 0) setTranscriptionProgress((video.currentTime / video.duration) * 100);
      };
    });
  }, [transcriptionLanguage, videoUrl]);
  const startOpenAITranscription = useCallback(async () => {
    if (!videoFile) throw new Error('No video file available for OpenAI transcription.');
    setTranscriptionProgress(15);

    const languageTag = transcriptionLanguage === 'auto' ? 'auto' : transcriptionLanguage;
    const result = await transcribeWithOpenAI(videoFile, openAiApiKey, languageTag);

    setResolvedTranscriptionLanguage(
      result.language ? String(result.language) : (transcriptionLanguage === 'auto' ? 'auto' : transcriptionLanguage)
    );
    setLiveTranscript(result.rawText || result.segments.map((s) => s.text).join(' '));
    setTranscriptionProgress(100);
    return result.segments;
  }, [videoFile, openAiApiKey, transcriptionLanguage]);

  // ─── PIPELINE: Parse manual/SRT/VTT transcript ────────────────────────────
  const parseManualTranscript = useCallback((text) => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    const segments = [];
    const tsRe = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)/;

    for (const line of lines) {
      const m = line.match(tsRe);
      if (m) {
        segments.push({ start: parseTimestamp(m[1]), end: parseTimestamp(m[1]) + 10, text: m[2].trim() });
      } else if (segments.length > 0) {
        segments[segments.length - 1].text += ' ' + line.trim();
      } else {
        segments.push({ start: 0, end: 10, text: line.trim() });
      }
    }

    // Fix end times
    for (let i = 0; i < segments.length - 1; i++) {
      segments[i].end = segments[i + 1].start;
    }
    return segments;
  }, []);

  // ─── PIPELINE: Step 2 — Claude analysis ──────────────────────────────────
  const analyzeTranscript = useCallback(async (segs) => {
    const text = segs.map(s => `[${formatTime(s.start)}] ${s.text}`).join('\n');
    const msg  = `[TRANSCRIPT_ANALYSIS]\n\nVideo transcript for analysis:\n\n${text}`;
    const raw  = await callClaude([{ role: 'user', content: msg }], apiKey, openAiApiKey);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); }
        catch { throw new Error('Unable to parse analysis response from the model. Raw: ' + raw.slice(0, 400)); }
      } else {
        throw new Error('No JSON found in Claude response. Raw: ' + raw.slice(0, 400));
      }
    }
    return parsed;
  }, [apiKey, openAiApiKey]);

  // ─── PIPELINE: Step 3 — Frame extraction ─────────────────────────────────
  const extractAllFrames = useCallback(async (flags) => {
    const video = hiddenVideoRef.current;
    if (!video || !videoUrl) return;

    const priorityOrder = { CRITICAL: 0, HIGH: 1, STANDARD: 2 };
    const sorted = [...flags].sort((a, b) =>
      (priorityOrder[a.frame_extraction_priority] ?? 2) - (priorityOrder[b.frame_extraction_priority] ?? 2)
    );

    setFrameExtractionProgress({ current: 0, total: sorted.length });

    for (let i = 0; i < sorted.length; i++) {
      if (cancelledRef.current) break;
      const flag  = sorted[i];
      const flaggedTime = parseTimestamp(flag.timestamp_start);
      const start = Math.max(0, flaggedTime - 15);
      const rawEnd = flaggedTime + 15;
      const end = video.duration > 0 ? Math.min(rawEnd, video.duration) : rawEnd;

      try {
        const frames = await extractFrames(video, start, end, 1);
        setExtractedFrames(prev => new Map(prev).set(flag.id, frames));
        // Show first frame in processing preview
        if (frames[0]) setExtractedPreviewFrames(prev => [...prev, frames[0]]);
      } catch (e) {
        console.warn(`Frame extraction failed for flag ${flag.id}:`, e);
      }
      setFrameExtractionProgress({ current: i + 1, total: sorted.length });
    }
  }, [videoUrl]);

  // ─── MAIN PIPELINE RUNNER ─────────────────────────────────────────────────
  const runPipeline = useCallback(async (method) => {
    cancelledRef.current = false;
    setMode('processing');
    setProcessingError('');
    setTranscriptionMethod(method === 'manual' ? 'manual' : method === 'sample' ? 'sample' : (transcriptionEngine === 'browser' ? 'browser' : 'openai'));
    setProcessingStep(1);
    setTranscriptionProgress(0);
    setLiveTranscript('');
    setExtractedFrames(new Map());
    setExtractedPreviewFrames([]);
    setAnalysisResult(null);
    setFlagStatuses(new Map());
    setFlagNotes(new Map());
    setChatMessages([]);
    stepStartRef.current = { 1: Date.now() };

    try {
      // ── Step 1: Transcription ──
      let segs;
      if (method === 'sample') {
        setIsSampleMode(true);
        segs = SAMPLE_TRANSCRIPT;
        setTranscriptionProgress(100);
        setLiveTranscript(SAMPLE_TRANSCRIPT.map(s => s.text).join(' '));
        await new Promise(r => setTimeout(r, 600));
      } else if (method === 'browser') {
        setIsSampleMode(false);
        if (transcriptionEngine === 'browser') {
          setTranscriptionMethod('browser');
          segs = await startBrowserTranscription();
        } else if (transcriptionEngine === 'openai') {
          setTranscriptionMethod('openai');
          try {
            segs = await startOpenAITranscription();
          } catch (openErr) {
            const openMsg = String(openErr?.message || '');
            const likelySizeOrCodecIssue =
              openMsg.includes('upload limit') ||
              openMsg.includes('Maximum content size limit') ||
              openMsg.includes('media stream capture') ||
              openMsg.includes('decode video') ||
              openMsg.includes('No audio track found');
            if (!likelySizeOrCodecIssue) throw openErr;

            try {
              setTranscriptionMethod('browser');
              segs = await startBrowserTranscription();
            } catch (browserErr) {
              throw new Error(`OpenAI transcription failed: ${openMsg}\nBrowser fallback failed: ${browserErr.message}`);
            }
          }
        } else {
          try {
            setTranscriptionMethod('openai');
            segs = await startOpenAITranscription();
          } catch (openErr) {
            try {
              setTranscriptionMethod('browser');
              segs = await startBrowserTranscription();
            } catch (browserErr) {
              throw new Error(`OpenAI transcription failed: ${openErr.message}\nBrowser fallback failed: ${browserErr.message}`);
            }
          }
        }
      } else {
        setIsSampleMode(false);
        segs = parseManualTranscript(manualTranscript);
        setTranscriptionProgress(100);
        await new Promise(r => setTimeout(r, 400));
      }

      if (cancelledRef.current) return;
      setTranscript(segs);
      setStepTimes(p => ({ ...p, 1: Date.now() - stepStartRef.current[1] }));

      // ── Step 2: Analysis ──
      setProcessingStep(2);
      stepStartRef.current[2] = Date.now();
      const result = await analyzeTranscript(segs);
      setAnalysisResult(result);
      setStepTimes(p => ({ ...p, 2: Date.now() - stepStartRef.current[2] }));

      if (cancelledRef.current) return;

      // ── Step 3: Frame extraction ──
      setProcessingStep(3);
      stepStartRef.current[3] = Date.now();
      if (method !== 'sample' && result.flags?.length > 0) {
        await extractAllFrames(result.flags);
      }
      setStepTimes(p => ({ ...p, 3: Date.now() - stepStartRef.current[3] }));

      // ── Step 4: Done ──
      setProcessingStep(4);
      await new Promise(r => setTimeout(r, 800));

      if (!cancelledRef.current) {
        setMode('results');
        if (result.flags?.length > 0) setSelectedFlagId(result.flags[0].id);
      }
    } catch (e) {
      setProcessingError(e.message);
    }
  }, [
    transcriptionEngine,
    startBrowserTranscription,
    startOpenAITranscription,
    parseManualTranscript,
    analyzeTranscript,
    extractAllFrames,
    manualTranscript,
  ]);

  // ─── VIDEO LOAD ───────────────────────────────────────────────────────────
  const handleVideoLoad = useCallback((file) => {
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setUploadError('');

    // Thumbnail from first frame
    const tmp = document.createElement('video');
    tmp.src = url;
    tmp.crossOrigin = 'anonymous';
    tmp.onloadedmetadata = () => {
      setVideoDuration(tmp.duration);
      tmp.currentTime = 0.5;
    };
    tmp.onseeked = () => {
      const c = document.createElement('canvas');
      c.width = 320; c.height = 180;
      c.getContext('2d').drawImage(tmp, 0, 0, 320, 180);
      setVideoThumbnail(c.toDataURL('image/jpeg', 0.8));
    };
  }, []);

  const validateAndLoad = useCallback((file) => {
    const valid = /\.(mp4|webm|mov|avi|mkv)$/i.test(file.name) ||
                  ['video/mp4','video/webm','video/quicktime','video/x-msvideo','video/x-matroska'].includes(file.type);
    if (!valid) {
      setUploadError('Unsupported format. Please upload MP4, WebM, MOV, AVI, or MKV.');
      return false;
    }
    handleVideoLoad(file);
    return true;
  }, [handleVideoLoad]);

  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files[0];
    if (file && validateAndLoad(file)) runPipeline('browser');
  }, [validateAndLoad, runPipeline]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file && validateAndLoad(file)) runPipeline('browser');
    if (e.target) e.target.value = '';
  }, [validateAndLoad, runPipeline]);

  // ─── CHAT ─────────────────────────────────────────────────────────────────
  const sendChatMessage = useCallback(async (text) => {
    if (!text.trim() || chatLoading) return;
    setChatInput('');
    const userMsg = { role: 'user', content: text };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);

    try {
      // Build context prefix if we have analysis
      const history = [];
      if (analysisResult) {
        history.push({
          role: 'user',
          content: `[AUDIT CONTEXT]\nVideo: ${videoFile?.name || 'Sample Transcript'}\nOverall Risk: ${analysisResult.overall_risk}\nTotal Flags: ${analysisResult.total_flags}\nSummary: ${analysisResult.summary}\n\nConfirmed findings: ${[...flagStatuses.values()].filter(s => s === 'confirmed').length}\nNeeds investigation: ${[...flagStatuses.values()].filter(s => s === 'needs_investigation').length}`,
        });
        history.push({ role: 'assistant', content: 'Understood. I have full context of your video analysis. How can I assist?' });
      }

      const msgs = [...history, ...chatMessages, userMsg];
      const response = await callClaude(msgs, apiKey, openAiApiKey);
      setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `⚠ Error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, chatMessages, analysisResult, videoFile, flagStatuses, apiKey, openAiApiKey]);

  const openChatWithFlag = useCallback((flag) => {
    const statusLabel = getStatusLabel(flagStatuses.get(flag.id));
    const preMsg = `I'd like to discuss Flag #${flag.id} (${flag.risk_level} risk, ${getCategoryLabel(flag.category)} at ${flag.timestamp_start}–${flag.timestamp_end}). Current auditor status: ${statusLabel}.\n\nFlagged text: "${flag.text}"\n\nAI explanation: ${flag.explanation}\n\nHelp me assess this finding and draft appropriate audit report language.`;
    setChatMessages([]);
    setChatInput(preMsg);
    setMode('chat');
    setTimeout(() => chatInputRef.current?.focus(), 100);
  }, [flagStatuses]);

  // ─── EXPORT ───────────────────────────────────────────────────────────────
  const exportReport = useCallback(() => {
    if (!analysisResult) return;
    const totalFlags = analysisResult.total_flags || 0;
    const confirmed  = [...flagStatuses.values()].filter(s => s === 'confirmed').length;
    const fp         = [...flagStatuses.values()].filter(s => s === 'false_positive').length;
    const ni         = [...flagStatuses.values()].filter(s => s === 'needs_investigation').length;
    const unreviewed = totalFlags - [...flagStatuses.keys()].length + [...flagStatuses.values()].filter(s => s === 'unreviewed').length;

    const report = {
      report_title: 'CredScan AI — Credential Exposure Analysis Report',
      generated_at: new Date().toISOString(),
      video_metadata: {
        filename:  videoFile?.name || 'Sample Transcript',
        duration:  formatTime(videoDuration),
        file_size: videoFile ? formatFileSize(videoFile.size) : 'N/A',
      },
      transcription_method: isSampleMode ? 'sample' : transcriptionMethod,
      transcription_language: (transcriptionMethod === 'browser' || transcriptionMethod === 'openai')
        ? (transcriptionLanguage === 'auto' ? `auto:${resolvedTranscriptionLanguage}` : transcriptionLanguage)
        : null,
      analysis_summary: {
        overall_risk:       analysisResult.overall_risk,
        total_flags:        totalFlags,
        confirmed_findings: confirmed,
        false_positives:    fp,
        needs_investigation: ni,
        unreviewed:         Math.max(0, totalFlags - confirmed - fp - ni),
      },
      flags: (analysisResult.flags || []).map(f => ({
        id:              f.id,
        timestamp:       `${f.timestamp_start} — ${f.timestamp_end}`,
        risk_level:      f.risk_level,
        category:        f.category,
        flagged_text:    f.text,
        ai_explanation:  f.explanation,
        auditor_status:  flagStatuses.get(f.id) || 'unreviewed',
        auditor_notes:   flagNotes.get(f.id) || '',
        frameworks:      analysisResult.frameworks || [],
      })),
      remediation_recommendations: analysisResult.remediation || [],
      disclaimer: 'This report was generated with AI assistance. CredScan AI flags potential risks; the auditor renders final judgment.',
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const fname = (videoFile?.name || 'sample').replace(/\.[^.]+$/, '');
    const date  = new Date().toISOString().slice(0, 10);
    a.download  = `CredScan_Report_${fname}_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [
    analysisResult,
    videoFile,
    videoDuration,
    isSampleMode,
    transcriptionMethod,
    transcriptionLanguage,
    resolvedTranscriptionLanguage,
    flagStatuses,
    flagNotes,
  ]);

  // ─── DERIVED STATE ────────────────────────────────────────────────────────
  const displayedFlags = analysisResult?.flags
    ? [...analysisResult.flags]
        .filter(f => filterRisk === 'ALL' || f.risk_level === filterRisk)
        .sort((a, b) => {
          if (sortBy === 'risk') {
            return ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.risk_level] ?? 3) - ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[b.risk_level] ?? 3);
          }
          return parseTimestamp(a.timestamp_start) - parseTimestamp(b.timestamp_start);
        })
    : [];

  const selectedFlag   = analysisResult?.flags?.find(f => f.id === selectedFlagId);
  const selectedFrames = extractedFrames.get(selectedFlagId) || [];
  const fullTranscriptText = transcript?.length
    ? transcript.map((s) => `[${formatTime(s.start)}] ${s.text}`).join('\n')
    : '';

  const statsConfirmed = [...flagStatuses.values()].filter(s => s === 'confirmed').length;
  const statsFP        = [...flagStatuses.values()].filter(s => s === 'false_positive').length;
  const statsNI        = [...flagStatuses.values()].filter(s => s === 'needs_investigation').length;
  const statsUnreview  = (analysisResult?.total_flags || 0) - [...flagStatuses.values()].filter(s => s !== 'unreviewed').length;


  // ─── RENDER: WELCOME ─────────────────────────────────────────────────────
  const renderWelcome = () => (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>

      {/* Settings button */}
      <div style={{ position: 'fixed', top: 20, right: 20 }}>
        <button onClick={() => setShowSettings(s => !s)}
          style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', color: T.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <GearIcon size={14} /> Settings
        </button>
        {showSettings && (
          <div style={{ position: 'absolute', right: 0, top: 44, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, width: 320, zIndex: 100 }} className="fadeIn">
            <div style={{ fontSize: 13, fontWeight: 600, color: T.goldLight, marginBottom: 10 }}>API Settings</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8 }}>
              Configure Anthropic and/or OpenAI keys for analysis, chat, and transcription.
              <span style={{ color: T.gold }}> console.anthropic.com </span>or
              <span style={{ color: T.gold }}> platform.openai.com</span>.
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                style={{ flex: 1, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: '7px 10px', color: T.text, fontSize: 12, fontFamily: T.mono, outline: 'none' }}
              />
              <button onClick={() => setShowApiKey(s => !s)}
                style={{ background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '7px 10px', color: T.textMuted, cursor: 'pointer', fontSize: 11 }}>
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: T.textDim }}>
              Anthropic key (analysis/chat primary)
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              <input
                type={showOpenAiApiKey ? 'text' : 'password'}
                value={openAiApiKey}
                onChange={e => setOpenAiApiKey(e.target.value)}
                placeholder="OpenAI key (optional override)"
                style={{ flex: 1, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: '7px 10px', color: T.text, fontSize: 12, fontFamily: T.mono, outline: 'none' }}
              />
              <button onClick={() => setShowOpenAiApiKey(s => !s)}
                style={{ background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '7px 10px', color: T.textMuted, cursor: 'pointer', fontSize: 11 }}>
                {showOpenAiApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: T.textDim }}>
              OpenAI key (transcription + Anthropic fallback). Large videos are auto-converted to compact audio for Whisper.
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Transcription engine</div>
              <select
                value={transcriptionEngine}
                onChange={e => setTranscriptionEngine(e.target.value)}
                style={{
                  width: '100%',
                  background: T.bgInput,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  padding: '7px 10px',
                  color: T.text,
                  fontSize: 12,
                  fontFamily: T.serif,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {TRANSCRIPTION_ENGINE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Transcription language</div>
              <select
                value={transcriptionLanguage}
                onChange={e => setTranscriptionLanguage(e.target.value)}
                style={{
                  width: '100%',
                  background: T.bgInput,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  padding: '7px 10px',
                  color: T.text,
                  fontSize: 12,
                  fontFamily: T.serif,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {TRANSCRIPTION_LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 5 }}>
                Auto mode uses OpenAI language detection (or browser locale when browser engine is active).
              </div>
            </div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 8 }}>
              Only the text transcript is sent to the API — no video data is transmitted.
            </div>
          </div>
        )}
      </div>

      {/* Logo + Title */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{
          width: 72, height: 72, background: `linear-gradient(135deg, ${T.bgCard}, ${T.bgSurface})`,
          border: `2px solid ${T.gold}`, borderRadius: 18, display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 20px', boxShadow: `0 0 30px ${T.gold}20`,
        }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: T.gold, fontFamily: T.serif, letterSpacing: '-1px' }}>CS</span>
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 600, color: T.goldLight, letterSpacing: '-0.5px', marginBottom: 8 }}>CredScan AI</h1>
        <p style={{ fontSize: 16, color: T.textMuted, maxWidth: 480, lineHeight: 1.5 }}>
          AI-powered credential exposure audit assistant for internal auditors.
          Detect inadvertently exposed login credentials in corporate training videos.
        </p>
      </div>

      {/* Upload Zone */}
      {!showManualInput ? (
        <div style={{ width: '100%', maxWidth: 580 }}>
          <div
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragOver ? T.gold : T.goldBorder}`,
              borderRadius: 14,
              padding: '48px 32px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: isDragOver ? `${T.gold}08` : T.bgCard,
            }}
          >
            <UploadIcon />
            <div style={{ fontSize: 18, color: T.goldLight, marginTop: 16, marginBottom: 6, fontWeight: 500 }}>
              Drop a training video here
            </div>
            <div style={{ fontSize: 14, color: T.textMuted, marginBottom: 20 }}>
              or
            </div>
            <Btn variant="primary" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              Browse files
            </Btn>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 16 }}>
              Accepted: MP4, WebM, MOV, AVI, MKV
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".mp4,.webm,.mov,.avi,.mkv,video/*" style={{ display: 'none' }} onChange={handleFileSelect} />

          {uploadError && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: T.redDim, border: `1px solid ${T.red}40`, borderRadius: 8, color: T.redLight, fontSize: 13 }}>
              {uploadError}
            </div>
          )}

          {/* Alternative options */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '24px 0 20px' }}>
            <div style={{ flex: 1, height: 1, background: T.border }} />
            <span style={{ color: T.textDim, fontSize: 13 }}>or</span>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Btn variant="outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowManualInput(true)}>
              📋 Paste a transcript manually
            </Btn>
            <Btn variant="outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => runPipeline('sample')}>
              🎬 Load sample transcript
            </Btn>
            <Btn variant="ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setMode('chat'); }}>
              <ChatIcon size={14} /> Start with a question
            </Btn>
          </div>
        </div>
      ) : (
        /* Manual transcript input */
        <div style={{ width: '100%', maxWidth: 580 }} className="fadeIn">
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.goldLight, marginBottom: 6 }}>Paste Transcript</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 14 }}>
              Paste a transcript with timestamps like <code style={{ fontFamily: T.mono, color: T.gold }}>[00:22] text here</code>, or plain text without timestamps.
            </div>
            <textarea
              value={manualTranscript}
              onChange={e => setManualTranscript(e.target.value)}
              placeholder={"[00:00] Welcome to the training module...\n[00:15] I'll log in now.\n[00:22] My username is..."}
              style={{
                width: '100%', minHeight: 200, background: T.bgInput, border: `1px solid ${T.border}`,
                borderRadius: 8, padding: '12px 14px', color: T.text, fontSize: 13,
                fontFamily: T.mono, resize: 'vertical', outline: 'none', lineHeight: 1.6,
              }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Btn variant="primary" disabled={!manualTranscript.trim()} onClick={() => runPipeline('manual')}>
                Analyze transcript
              </Btn>
              <Btn variant="ghost" onClick={() => setShowManualInput(false)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {/* How it works */}
      <div style={{ width: '100%', maxWidth: 580, marginTop: 32 }}>
        <button onClick={() => setShowHowItWorks(s => !s)}
          style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
          <span style={{ transform: showHowItWorks ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▶</span>
          How it works
        </button>
        {showHowItWorks && (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="fadeIn">
            {[
              { step: '1', icon: '🎥', title: 'Upload video', desc: 'Upload any corporate training or onboarding video. All processing is done locally in your browser.' },
              { step: '2', icon: '🎙', title: 'Transcribe audio', desc: 'OpenAI Whisper (or browser speech recognition) converts audio to timestamped text. Or paste your own transcript.' },
              { step: '3', icon: '🔍', title: 'AI analysis', desc: 'The configured AI model analyzes the transcript for credential exposure risks and flags suspicious segments with detailed explanations.' },
              { step: '4', icon: '🖼', title: 'Review & audit', desc: 'Review flagged segments, view extracted frames, mark findings, and export a complete audit report.' },
            ].map(item => (
              <div key={item.step} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.goldLight, marginBottom: 4 }}>
                  <span style={{ color: T.gold, fontFamily: T.mono, fontSize: 11 }}>Step {item.step} — </span>{item.title}
                </div>
                <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Privacy notice */}
      <div style={{ marginTop: 32, fontSize: 11, color: T.textDim, textAlign: 'center', maxWidth: 480 }}>
        🔒 Privacy: Video files are processed entirely in your browser. Only the text transcript is sent to the Anthropic API for analysis. No video data is transmitted to any server.
      </div>
    </div>
  );


  // ─── RENDER: PROCESSING ──────────────────────────────────────────────────
  const renderProcessing = () => {
    const browserLanguageLabel = transcriptionLanguage === 'auto'
      ? `Auto (${resolvedTranscriptionLanguage})`
      : resolvedTranscriptionLanguage;
    const step1Sublabel = isSampleMode
      ? 'Loading sample transcript'
      : transcriptionMethod === 'manual'
        ? 'Parsing manual transcript'
        : transcriptionMethod === 'openai'
          ? `Using OpenAI transcription (${browserLanguageLabel})`
          : `Using browser speech recognition (${browserLanguageLabel})`;
    const steps = [
      { num: 1, label: 'Transcribing audio', sublabel: step1Sublabel },
      { num: 2, label: 'Analyzing transcript', sublabel: 'Scanning for credential exposure risks with configured AI model' },
      { num: 3, label: 'Extracting frames', sublabel: isSampleMode ? 'Skipped (no video in sample mode)' : `Processing ${analysisResult?.flags?.length || 0} flagged window${(analysisResult?.flags?.length || 0) !== 1 ? 's' : ''} (±15s around each flagged time)` },
      { num: 4, label: 'Compiling results', sublabel: 'Building audit workspace' },
    ];

    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 640 }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ fontSize: 26, fontWeight: 600, color: T.goldLight }}>Analyzing video…</div>
            <div style={{ fontSize: 14, color: T.textMuted, marginTop: 6 }}>This may take a few minutes depending on video length.</div>
          </div>

          {/* Video info */}
          {(videoThumbnail || videoFile || isSampleMode) && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 28 }}>
              {videoThumbnail ? (
                <img src={videoThumbnail} alt="thumbnail" style={{ width: 100, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 100, height: 56, background: T.bgSurface, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                  {isSampleMode ? '🎬' : '🎥'}
                </div>
              )}
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.goldLight }}>
                  {isSampleMode ? 'SAP S/4HANA Training Module (Sample)' : videoFile?.name}
                </div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 3 }}>
                  {isSampleMode ? 'Demo transcript — no video file' : `${formatTime(videoDuration)} · ${formatFileSize(videoFile?.size || 0)}`}
                </div>
              </div>
            </div>
          )}

          {/* Steps */}
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: '4px 0', marginBottom: 24 }}>
            {steps.map((step, idx) => {
              const isDone    = processingStep > step.num;
              const isActive  = processingStep === step.num;
              const isPending = processingStep < step.num;
              return (
                <div key={step.num} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 20px',
                  borderBottom: idx < steps.length - 1 ? `1px solid ${T.border}` : 'none',
                  opacity: isPending ? 0.45 : 1, transition: 'opacity 0.3s',
                }}>
                  <div style={{ marginTop: 2, flexShrink: 0 }}>
                    {isDone    && <CheckIcon size={18} />}
                    {isActive  && <Spinner  size={18} />}
                    {isPending && <CircleIcon size={18} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: isActive ? T.goldLight : isDone ? T.green : T.textMuted }}>
                      {step.label}
                      {stepTimes[step.num] && isDone && (
                        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.textDim, fontWeight: 400, marginLeft: 8 }}>
                          {(stepTimes[step.num] / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>{step.sublabel}</div>

                    {/* Step 1: live transcript preview */}
                    {isActive && step.num === 1 && liveTranscript && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, color: T.textDim, marginBottom: 4 }}>Live transcript</div>
                        <div style={{
                          background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
                          padding: '8px 12px', fontSize: 12, color: T.text, fontFamily: T.mono,
                          maxHeight: 80, overflowY: 'auto', lineHeight: 1.6,
                        }}>
                          {liveTranscript}
                          <span style={{ animation: 'pulse 1s infinite', color: T.gold }}>▌</span>
                        </div>
                        {videoDuration > 0 && (
                          <div style={{ marginTop: 6 }}>
                            <div style={{ height: 3, background: T.border, borderRadius: 2 }}>
                              <div style={{ height: '100%', background: T.gold, borderRadius: 2, width: `${transcriptionProgress}%`, transition: 'width 0.3s' }} />
                            </div>
                            <div style={{ fontSize: 11, color: T.textDim, marginTop: 3 }}>{Math.round(transcriptionProgress)}% complete</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Step 3: frame preview grid */}
                    {isActive && step.num === 3 && extractedPreviewFrames.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6 }}>
                          Extracted frames: {frameExtractionProgress.current}/{frameExtractionProgress.total} flags processed
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {extractedPreviewFrames.slice(-8).map((f, i) => (
                            <img key={i} src={f.dataUrl} alt={f.timestamp}
                              style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 4, border: `1px solid ${T.border}` }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error state */}
          {processingError && (
            <div style={{ background: T.redDim, border: `1px solid ${T.red}40`, borderRadius: 10, padding: 16, marginBottom: 20 }} className="fadeIn">
              <div style={{ fontSize: 14, fontWeight: 600, color: T.redLight, marginBottom: 6 }}>Processing failed</div>
              <div style={{ fontSize: 13, color: T.text, fontFamily: T.mono, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{processingError}</div>
              <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                <Btn variant="danger" onClick={() => {
                  const method = isSampleMode ? 'sample' : videoFile ? 'browser' : 'manual';
                  runPipeline(method);
                }}>Retry</Btn>
                <Btn variant="ghost" onClick={() => { cancelledRef.current = true; setMode('welcome'); setProcessingError(''); }}>Back</Btn>
              </div>
            </div>
          )}

          {/* Cancel */}
          {!processingError && (
            <div style={{ textAlign: 'center' }}>
              <Btn variant="ghost" small onClick={() => { cancelledRef.current = true; recognitionRef.current?.abort(); setMode('welcome'); }}>
                Cancel
              </Btn>
            </div>
          )}
        </div>
      </div>
    );
  };


  // ─── RENDER: RESULTS ─────────────────────────────────────────────────────
  const renderResults = () => {
    const overallRisk = analysisResult?.overall_risk || 'NONE';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: T.bg }}>

        {/* Top Bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', height: 52, borderBottom: `1px solid ${T.border}`,
          background: T.bgCard, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.gold, letterSpacing: '-0.3px' }}>CredScan AI</div>
            <div style={{ width: 1, height: 18, background: T.border }} />
            <div style={{ fontSize: 13, color: T.textMuted }}>
              {videoFile?.name || 'Sample Transcript'}
            </div>
            <RiskBadge risk={overallRisk} small />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" small onClick={() => setMode('welcome')}>
              <ArrowLeftIcon size={13} /> New video
            </Btn>
            <Btn variant="outline" small onClick={() => setMode('chat')}>
              <ChatIcon size={13} /> Open chat
            </Btn>
            <Btn variant="primary" small onClick={exportReport}>
              <DownloadIcon size={13} /> Export report
            </Btn>
          </div>
        </div>

        {/* Main 3-panel layout */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ── LEFT PANEL: Flag List ── */}
          <div style={{
            width: 290, flexShrink: 0, borderRight: `1px solid ${T.border}`,
            display: 'flex', flexDirection: 'column', background: T.bgCard,
          }}>
            {/* Panel header */}
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.goldLight }}>
                  Flagged Segments
                  <span style={{
                    marginLeft: 8, background: T.bgSurface, color: T.gold,
                    borderRadius: 20, padding: '1px 8px', fontSize: 11, fontFamily: T.mono,
                  }}>{analysisResult?.total_flags || 0}</span>
                </div>
                <RiskBadge risk={overallRisk} small />
              </div>
              {/* Filter + Sort */}
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}
                  style={{ flex: 1, background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: 5, color: T.text, padding: '5px 8px', fontSize: 11, fontFamily: T.serif, cursor: 'pointer', outline: 'none' }}>
                  <option value="ALL">All risks</option>
                  <option value="HIGH">HIGH only</option>
                  <option value="MEDIUM">MEDIUM only</option>
                  <option value="LOW">LOW only</option>
                </select>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                  style={{ flex: 1, background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: 5, color: T.text, padding: '5px 8px', fontSize: 11, fontFamily: T.serif, cursor: 'pointer', outline: 'none' }}>
                  <option value="timestamp">Sort: Time</option>
                  <option value="risk">Sort: Risk</option>
                </select>
              </div>
            </div>

            {/* Flag cards */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {displayedFlags.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: T.textDim, fontSize: 13 }}>
                  No flags match the current filter.
                </div>
              )}
              {displayedFlags.map(flag => {
                const isSelected = selectedFlagId === flag.id;
                const status     = flagStatuses.get(flag.id) || 'unreviewed';
                return (
                  <div
                    key={flag.id}
                    onClick={() => setSelectedFlagId(flag.id)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: `1px solid ${T.border}`,
                      background: isSelected ? T.bgHover : 'transparent',
                      borderLeft: isSelected ? `3px solid ${T.gold}` : '3px solid transparent',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <RiskBadge risk={flag.risk_level} small />
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>
                        {flag.timestamp_start}–{flag.timestamp_end}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 5 }}>
                      {getCategoryLabel(flag.category)}
                    </div>
                    <div style={{ fontSize: 12, color: T.text, lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      "{flag.text}"
                    </div>
                    {/* Status pill */}
                    <div style={{ marginTop: 8 }}>
                      <select
                        value={status}
                        onChange={e => { e.stopPropagation(); setFlagStatuses(prev => new Map(prev).set(flag.id, e.target.value)); }}
                        onClick={e => e.stopPropagation()}
                        style={{
                          background: 'transparent', border: `1px solid ${getStatusColor(status)}50`,
                          borderRadius: 4, color: getStatusColor(status), padding: '2px 6px',
                          fontSize: 10, fontFamily: T.serif, cursor: 'pointer', outline: 'none', width: '100%',
                        }}
                      >
                        <option value="unreviewed">Unreviewed</option>
                        <option value="confirmed">Confirmed Finding</option>
                        <option value="false_positive">False Positive</option>
                        <option value="needs_investigation">Needs Investigation</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── CENTER PANEL: Video + Frames ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

            {/* Video player */}
            <div style={{ flex: '0 0 auto', background: '#000', position: 'relative' }}>
              {videoUrl ? (
                <>
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    style={{ width: '100%', maxHeight: 340, display: 'block', background: '#000' }}
                    onLoadedMetadata={e => setVideoDuration(e.target.duration)}
                    crossOrigin="anonymous"
                  />
                  {/* Custom controls */}
                  <div style={{ background: '#000', padding: '6px 12px 10px', borderBottom: `1px solid ${T.border}` }}>
                    {/* Timeline with flag markers */}
                    <div style={{ position: 'relative', height: 20, marginBottom: 6, cursor: 'pointer' }}
                      onClick={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = (e.clientX - rect.left) / rect.width;
                        if (videoRef.current) videoRef.current.currentTime = pct * videoDuration;
                      }}>
                      <div style={{ position: 'absolute', top: 8, left: 0, right: 0, height: 4, background: '#333', borderRadius: 2 }}>
                        <div style={{ height: '100%', background: T.gold, borderRadius: 2, width: `${videoDuration > 0 ? (currentVideoTime / videoDuration) * 100 : 0}%`, pointerEvents: 'none' }} />
                      </div>
                      {/* Flag markers */}
                      {analysisResult?.flags?.map(f => {
                        const pct = videoDuration > 0 ? (parseTimestamp(f.timestamp_start) / videoDuration) * 100 : 0;
                        return (
                          <div key={f.id} title={`Flag #${f.id}: ${f.risk_level}`}
                            onClick={e => { e.stopPropagation(); setSelectedFlagId(f.id); }}
                            style={{
                              position: 'absolute', top: 4, left: `${pct}%`, transform: 'translateX(-50%)',
                              width: 10, height: 12, borderRadius: 2, cursor: 'pointer',
                              background: getRiskColor(f.risk_level), opacity: selectedFlagId === f.id ? 1 : 0.65,
                            }} />
                        );
                      })}
                    </div>
                    {/* Controls row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button onClick={() => { if (videoRef.current) { isPlaying ? videoRef.current.pause() : videoRef.current.play(); } }}
                        style={{ background: 'none', border: 'none', color: T.goldLight, cursor: 'pointer', padding: 0, display: 'flex' }}>
                        {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
                      </button>
                      <span style={{ fontSize: 12, fontFamily: T.mono, color: T.textMuted, minWidth: 90 }}>
                        {formatTime(currentVideoTime)} / {formatTime(videoDuration)}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                        <span style={{ fontSize: 11, color: T.textDim }}>Speed:</span>
                        {[0.5, 1, 1.5, 2].map(r => (
                          <button key={r} onClick={() => { setPlaybackRate(r); if (videoRef.current) videoRef.current.playbackRate = r; }}
                            style={{
                              background: playbackRate === r ? T.gold : T.bgSurface,
                              color: playbackRate === r ? '#0f0d0a' : T.textMuted,
                              border: `1px solid ${T.border}`, borderRadius: 4,
                              padding: '2px 6px', fontSize: 11, cursor: 'pointer', fontFamily: T.mono,
                            }}>
                            {r}x
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{
                  height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: T.bgCard, borderBottom: `1px solid ${T.border}`, flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ fontSize: 32 }}>🎬</div>
                  <div style={{ fontSize: 14, color: T.textMuted }}>Sample mode — no video file</div>
                  <div style={{ fontSize: 12, color: T.textDim }}>Upload a video to enable playback and frame extraction</div>
                  <Btn variant="outline" small onClick={() => setMode('welcome')}>Upload a video</Btn>
                </div>
              )}
            </div>

            {/* Frame filmstrip */}
            <div style={{ flex: 1, overflowY: 'auto', background: T.bg, padding: 16 }}>
              {selectedFlag ? (
                <>
                  <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>
                    Extracted frames — Flag #{selectedFlag.id} · {selectedFlag.timestamp_start}–{selectedFlag.timestamp_end}
                    {isSampleMode && <span style={{ color: T.textDim }}> · Frame extraction unavailable in sample mode</span>}
                  </div>
                  {selectedFrames.length > 0 ? (
                    <>
                      {/* Selected frame */}
                      <div style={{ marginBottom: 12 }}>
                        <img
                          src={selectedFrames[showFrameIndex]?.dataUrl}
                          alt={selectedFrames[showFrameIndex]?.timestamp}
                          style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8, border: `1px solid ${T.gold}40`, background: '#000' }}
                        />
                        <div style={{ textAlign: 'center', marginTop: 4, fontSize: 11, fontFamily: T.mono, color: T.gold }}>
                          {selectedFrames[showFrameIndex]?.timestamp}
                        </div>
                      </div>
                      {/* Filmstrip */}
                      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                        {selectedFrames.map((frame, idx) => (
                          <div key={idx} onClick={() => { setShowFrameIndex(idx); if (videoRef.current) videoRef.current.currentTime = frame.time; }}
                            style={{ flexShrink: 0, cursor: 'pointer', position: 'relative' }}>
                            <img src={frame.dataUrl} alt={frame.timestamp}
                              style={{
                                width: 80, height: 45, objectFit: 'cover', borderRadius: 5,
                                border: `2px solid ${idx === showFrameIndex ? T.gold : T.border}`,
                                transition: 'border-color 0.15s',
                              }} />
                            <div style={{ textAlign: 'center', fontSize: 9, fontFamily: T.mono, color: T.textDim, marginTop: 2 }}>{frame.timestamp}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{
                      border: `1px dashed ${T.border}`, borderRadius: 8, padding: '32px 20px',
                      textAlign: 'center', color: T.textDim, fontSize: 13,
                    }}>
                      {isSampleMode
                        ? '🖼 Frame extraction unavailable for sample transcript. Upload a video to enable visual analysis.'
                        : '⏳ No frames extracted for this segment. Frames are extracted automatically after analysis.'}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textDim, fontSize: 13 }}>
                  Select a flagged segment to view extracted frames.
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT PANEL: Detail ── */}
          <div style={{
            width: 280, flexShrink: 0, borderLeft: `1px solid ${T.border}`,
            background: T.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {selectedFlag ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {/* Risk + category */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <RiskBadge risk={selectedFlag.risk_level} />
                  <span style={{ fontSize: 11, color: T.textMuted }}>Flag #{selectedFlag.id}</span>
                </div>
                <div style={{
                  display: 'inline-block', background: T.bgSurface,
                  color: T.gold, border: `1px solid ${T.goldBorder}`,
                  borderRadius: 4, padding: '2px 8px', fontSize: 11, marginBottom: 14,
                }}>
                  {getCategoryLabel(selectedFlag.category)}
                </div>

                {/* Timestamp */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 12, color: T.textDim }}>Timestamp:</span>
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.goldLight }}>
                    {selectedFlag.timestamp_start} — {selectedFlag.timestamp_end}
                  </span>
                  {videoUrl && (
                    <button onClick={() => { if (videoRef.current) videoRef.current.currentTime = parseTimestamp(selectedFlag.timestamp_start); }}
                      style={{ background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '2px 6px', color: T.textMuted, cursor: 'pointer', fontSize: 10 }}>
                      ▶ Jump
                    </button>
                  )}
                </div>

                {/* Flagged text */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: T.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Flagged Text</div>
                  <div style={{
                    background: `${getRiskColor(selectedFlag.risk_level)}12`,
                    border: `1px solid ${getRiskColor(selectedFlag.risk_level)}30`,
                    borderRadius: 6, padding: '8px 10px', fontSize: 12, color: T.text,
                    fontFamily: T.mono, lineHeight: 1.6, wordBreak: 'break-word',
                  }}>
                    "{selectedFlag.text}"
                  </div>
                </div>

                {/* Explanation */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: T.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI Assessment</div>
                  <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>
                    {selectedFlag.explanation}
                  </div>
                </div>

                {/* Priority */}
                <div style={{ marginBottom: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: T.textDim }}>Frame priority:</span>
                  <span style={{
                    fontFamily: T.mono, fontSize: 10,
                    color: selectedFlag.frame_extraction_priority === 'CRITICAL' ? T.red : selectedFlag.frame_extraction_priority === 'HIGH' ? T.amber : T.green,
                    background: getRiskBg(selectedFlag.frame_extraction_priority === 'CRITICAL' ? 'HIGH' : selectedFlag.frame_extraction_priority === 'HIGH' ? 'MEDIUM' : 'LOW'),
                    padding: '1px 6px', borderRadius: 3,
                  }}>
                    {selectedFlag.frame_extraction_priority}
                  </span>
                </div>

                {/* Frameworks */}
                {analysisResult?.frameworks?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: T.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Frameworks</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {analysisResult.frameworks.map((fw, i) => (
                        <span key={i} style={{
                          background: T.bgSurface, border: `1px solid ${T.border}`,
                          borderRadius: 4, padding: '2px 7px', fontSize: 10, fontFamily: T.mono, color: T.textMuted,
                        }}>{fw}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ height: 1, background: T.border, margin: '16px 0' }} />

                {/* Auditor status */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Auditor Status</div>
                  <select
                    value={flagStatuses.get(selectedFlag.id) || 'unreviewed'}
                    onChange={e => setFlagStatuses(prev => new Map(prev).set(selectedFlag.id, e.target.value))}
                    style={{
                      width: '100%', background: T.bgInput, border: `1px solid ${T.border}`,
                      borderRadius: 6, color: T.text, padding: '8px 10px', fontSize: 13,
                      fontFamily: T.serif, cursor: 'pointer', outline: 'none',
                    }}
                  >
                    <option value="unreviewed">Unreviewed</option>
                    <option value="confirmed">Confirmed Finding</option>
                    <option value="false_positive">False Positive</option>
                    <option value="needs_investigation">Needs Investigation</option>
                  </select>
                </div>

                {/* Notes */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Auditor Notes</div>
                  <textarea
                    value={flagNotes.get(selectedFlag.id) || ''}
                    onChange={e => setFlagNotes(prev => new Map(prev).set(selectedFlag.id, e.target.value))}
                    placeholder="Add your observations, context, or next steps..."
                    style={{
                      width: '100%', minHeight: 80, background: T.bgInput,
                      border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 10px',
                      color: T.text, fontSize: 12, fontFamily: T.serif, resize: 'vertical',
                      outline: 'none', lineHeight: 1.5,
                    }}
                  />
                </div>

                {/* Ask AI */}
                <Btn variant="outline" style={{ width: '100%', justifyContent: 'center' }} onClick={() => openChatWithFlag(selectedFlag)}>
                  <ChatIcon size={13} /> Ask AI about this finding
                </Btn>

                <div style={{ height: 1, background: T.border, margin: '16px 0' }} />

                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Full Transcript
                  </div>
                  <textarea
                    readOnly
                    value={fullTranscriptText || 'No transcript available yet.'}
                    style={{
                      width: '100%',
                      minHeight: 180,
                      background: T.bgInput,
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      padding: '8px 10px',
                      color: T.text,
                      fontSize: 11,
                      fontFamily: T.mono,
                      resize: 'vertical',
                      outline: 'none',
                      lineHeight: 1.6,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                <div style={{ color: T.textDim, fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
                  Select a flagged segment to see details and AI assessment.
                </div>
                <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Full Transcript
                </div>
                <textarea
                  readOnly
                  value={fullTranscriptText || 'No transcript available yet.'}
                  style={{
                    width: '100%',
                    minHeight: 220,
                    background: T.bgInput,
                    border: `1px solid ${T.border}`,
                    borderRadius: 6,
                    padding: '8px 10px',
                    color: T.text,
                    fontSize: 11,
                    fontFamily: T.mono,
                    resize: 'vertical',
                    outline: 'none',
                    lineHeight: 1.6,
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 20px', borderTop: `1px solid ${T.border}`,
          background: T.bgCard, flexShrink: 0, gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
            {[
              { label: 'Total Flags', value: analysisResult?.total_flags || 0, color: T.goldLight },
              { label: 'Confirmed', value: statsConfirmed, color: T.red },
              { label: 'False Positive', value: statsFP, color: T.green },
              { label: 'Needs Investigation', value: statsNI, color: T.amber },
              { label: 'Unreviewed', value: statsUnreview, color: T.textMuted },
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: stat.color, fontFamily: T.mono }}>{stat.value}</div>
                <div style={{ color: T.textDim, fontSize: 10 }}>{stat.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="outline" small onClick={() => setMode('chat')}>
              <ChatIcon size={12} /> Open chat
            </Btn>
            <Btn variant="primary" small onClick={exportReport}>
              <DownloadIcon size={12} /> Export report
            </Btn>
          </div>
        </div>

        {/* Hidden video for frame extraction re-runs */}
        <video ref={hiddenVideoRef} src={videoUrl} style={{ display: 'none' }} crossOrigin="anonymous" muted playsInline />
      </div>
    );
  };


  // ─── RENDER: CHAT ─────────────────────────────────────────────────────────
  const renderChat = () => {
    const quickActions = analysisResult ? [
      { label: 'Draft audit finding', msg: `Please draft formal audit finding language for the confirmed credential exposure findings from this video analysis. Overall risk: ${analysisResult.overall_risk}. ${statsConfirmed} confirmed finding(s). Summary: ${analysisResult.summary}` },
      { label: 'Regulatory implications', msg: `What are the regulatory implications of the credential exposure findings in this video? Consider SOX, GDPR, and any applicable IT governance frameworks. Overall risk: ${analysisResult.overall_risk}.` },
      { label: 'Remediation steps', msg: `What are the recommended immediate and long-term remediation steps for the credential exposure issues found in this video? ${analysisResult.summary}` },
      { label: 'Scope a broader audit', msg: 'Help me plan a broader credential exposure audit across our organization\'s entire training video library. What should I look for, what tools should I use, and how should I prioritize?' },
    ] : [
      { label: 'What is CredScan AI?', msg: 'What is CredScan AI and what kind of credential exposure risks does it help identify?' },
      { label: 'Audit methodology', msg: 'Explain the two-stage AI pipeline methodology for detecting credential exposure in training videos.' },
      { label: 'Framework references', msg: 'Which internal audit and cybersecurity frameworks are relevant to credential exposure in corporate training videos?' },
      { label: 'Get started', msg: 'How should I start a credential exposure audit of our organization\'s training video library?' },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: T.bg }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', height: 52, borderBottom: `1px solid ${T.border}`,
          background: T.bgCard, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, background: T.bgSurface, border: `1px solid ${T.goldBorder}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.gold }}>CS</span>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.goldLight }}>CredScan AI — Audit Assistant</div>
              <div style={{ fontSize: 11, color: T.textDim }}>Powered by Claude · Human-in-the-loop audit support</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {analysisResult && (
              <Btn variant="ghost" small onClick={() => setMode('results')}>
                <ArrowLeftIcon size={13} /> Back to results
              </Btn>
            )}
            <Btn variant="ghost" small onClick={() => setMode('welcome')}>
              <ArrowLeftIcon size={13} /> New video
            </Btn>
          </div>
        </div>

        {/* Context banner */}
        {analysisResult && (
          <div style={{
            background: T.bgCard, borderBottom: `1px solid ${T.border}`,
            padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, color: T.textDim }}>Active context:</div>
            <div style={{ fontSize: 12, color: T.text }}>
              {videoFile?.name || 'Sample Transcript'}
            </div>
            <RiskBadge risk={analysisResult.overall_risk} small />
            <div style={{ fontSize: 11, color: T.textMuted }}>{analysisResult.total_flags} flags · {statsConfirmed} confirmed</div>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0' }}>
          {chatMessages.length === 0 && (
            <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 24px' }}>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: T.goldLight, marginBottom: 6 }}>
                  {analysisResult ? 'Ask about your analysis' : 'Ask CredScan AI'}
                </div>
                <div style={{ fontSize: 13, color: T.textMuted }}>
                  {analysisResult
                    ? 'I have full context of your video analysis. Ask me about findings, frameworks, remediation, or audit report drafting.'
                    : 'I\'m a specialized audit assistant for credential exposure detection. Ask me anything about the audit process, frameworks, or methodology.'}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {quickActions.map((qa, i) => (
                  <button key={i} onClick={() => sendChatMessage(qa.msg)}
                    style={{
                      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8,
                      padding: '12px 14px', color: T.text, cursor: 'pointer', textAlign: 'left',
                      fontSize: 13, lineHeight: 1.4, fontFamily: T.serif,
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = T.goldBorder}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                    {qa.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px' }}>
            {chatMessages.map((msg, i) => (
              <div key={i} className="fadeIn" style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 16,
              }}>
                {msg.role === 'assistant' && (
                  <div style={{
                    width: 28, height: 28, background: T.bgCard, border: `1px solid ${T.goldBorder}`,
                    borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: T.gold, flexShrink: 0, marginRight: 10, marginTop: 2,
                  }}>CS</div>
                )}
                <div style={{
                  maxWidth: '82%',
                  background: msg.role === 'user' ? T.gold : T.bgCard,
                  color: msg.role === 'user' ? '#0f0d0a' : T.text,
                  borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  padding: '10px 14px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  border: msg.role === 'user' ? 'none' : `1px solid ${T.border}`,
                }}>
                  {msg.role === 'user'
                    ? <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                    : renderMarkdown(msg.content)
                  }
                </div>
              </div>
            ))}

            {chatLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 28, height: 28, background: T.bgCard, border: `1px solid ${T.goldBorder}`,
                  borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: T.gold, flexShrink: 0,
                }}>CS</div>
                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '12px 12px 12px 4px', padding: '10px 14px' }}>
                  <Spinner size={14} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input */}
        <div style={{ borderTop: `1px solid ${T.border}`, background: T.bgCard, padding: '12px 20px', flexShrink: 0 }}>
          <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              ref={chatInputRef}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput); } }}
              placeholder="Ask about findings, frameworks, remediation, or draft audit language… (Enter to send, Shift+Enter for new line)"
              style={{
                flex: 1, background: T.bgInput, border: `1px solid ${T.border}`,
                borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13,
                fontFamily: T.serif, resize: 'none', outline: 'none', lineHeight: 1.5,
                minHeight: 44, maxHeight: 140, overflowY: 'auto',
              }}
              rows={1}
            />
            <Btn variant="primary" disabled={!chatInput.trim() || chatLoading} onClick={() => sendChatMessage(chatInput)}
              style={{ padding: '10px 14px', flexShrink: 0 }}>
              {chatLoading ? <Spinner size={14} color="#0f0d0a" /> : <SendIcon size={14} />}
            </Btn>
          </div>
          <div style={{ maxWidth: 680, margin: '6px auto 0', fontSize: 10, color: T.textDim }}>
            CredScan AI provides analysis support. The auditor renders final professional judgment.
          </div>
        </div>
      </div>
    );
  };

  // ─── MAIN RENDER ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>
      {mode === 'welcome'    && renderWelcome()}
      {mode === 'processing' && renderProcessing()}
      {mode === 'results'    && renderResults()}
      {mode === 'chat'       && renderChat()}

      {/* Hidden video element for processing pipeline */}
      {mode !== 'results' && (
        <video ref={hiddenVideoRef} src={videoUrl} style={{ display: 'none' }} crossOrigin="anonymous" muted playsInline />
      )}
    </div>
  );
}



