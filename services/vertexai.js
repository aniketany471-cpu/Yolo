/**
 * Vertex AI Grounding Service
 *
 * Uses the service account credentials stored in VERTEX_AI_CREDENTIALS (JSON string)
 * to call the Vertex AI Gemini API with Google Search grounding.
 *
 * This produces vertexaisearch.cloud.google.com citation URLs — more reliable
 * real-time grounding than the Google AI Studio googleSearch tool.
 *
 * Auth: Signs a JWT with RS256 (Node.js crypto — no extra packages needed),
 * exchanges it for a short-lived OAuth2 access token, caches the token for 55 min.
 */

import crypto from 'crypto';

// ── Token cache ───────────────────────────────────────────────────────────────
let _cachedToken = null;
let _tokenExpiresAt = 0;

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function getKeyJson() {
  const raw = process.env.VERTEX_AI_CREDENTIALS;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiresAt) return _cachedToken;

  const key = getKeyJson();
  if (!key) throw new Error('VERTEX_AI_CREDENTIALS not set');

  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss:   key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud:   key.token_uri,
    exp:   now + 3600,
    iat:   now,
  }));

  const sigInput = `${header}.${payload}`;
  const signer   = crypto.createSign('RSA-SHA256');
  signer.update(sigInput, 'utf8');
  const sig = base64url(signer.sign(key.private_key));
  const jwt = `${sigInput}.${sig}`;

  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  const json = await res.json();
  if (!json.access_token) throw new Error(`Vertex AI token error: ${JSON.stringify(json).slice(0, 200)}`);

  _cachedToken    = json.access_token;
  _tokenExpiresAt = Date.now() + 55 * 60 * 1000;
  console.log('[vertex] access token acquired (cached 55 min)');
  return _cachedToken;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isVertexAIAvailable() {
  return !!process.env.VERTEX_AI_CREDENTIALS;
}

/**
 * vertexGroundedSearch(prompt, systemInstruction?)
 *
 * Sends `prompt` to Vertex AI Gemini 2.0 Flash with Google Search grounding.
 * Returns { text, citations, searchQueries, groundingUsed }.
 */
export async function vertexGroundedSearch(prompt, systemInstruction = '') {
  const token  = await getAccessToken();
  const key    = getKeyJson();
  const project  = key.project_id;
  const location = 'us-central1';
  const model    = 'gemini-2.0-flash';
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools:    [{ googleSearchRetrieval: {} }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vertex AI ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data      = await res.json();
  const candidate = data.candidates?.[0];
  const text      = (candidate?.content?.parts || []).map(p => p.text || '').join('').trim();
  const gm        = candidate?.groundingMetadata;

  const citations = [];
  for (const chunk of gm?.groundingChunks || []) {
    const uri = chunk?.web?.uri || chunk?.web?.title;
    if (uri) citations.push(uri);
  }
  const searchQueries = gm?.webSearchQueries || [];
  const groundingUsed = citations.length > 0 || !!gm?.groundingChunks?.length;

  console.log(`[vertex] grounding_used=${groundingUsed} citations=${citations.length} queries=${JSON.stringify(searchQueries)}`);
  return { text, citations, searchQueries, groundingUsed };
}
