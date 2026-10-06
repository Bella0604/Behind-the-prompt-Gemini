import http from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(directory, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function providerDiagnostic(response) {
  let data;
  try { data = await response.json(); } catch { data = {}; }
  // Only return error codes, never provider messages, headers, input text or keys.
  const status = /^[A-Z_]{1,60}$/.test(data?.error?.status || '') ? data.error.status : 'UNKNOWN';
  const item = data?.error?.details?.find(detail => /^[A-Z_]{1,80}$/.test(detail?.reason || ''));
  const reason = item?.reason || '';
  let help = 'Check the selected model and account permissions.';
  if (/API_KEY/.test(reason) || response.status === 401) help = 'Check that the private .env contains an active Gemini key and restart the backend after saving.';
  else if (response.status === 404) help = 'The configured model may not exist for this endpoint or account. Open /models to check available model IDs.';
  else if (response.status === 403) help = 'The key or project is not permitted. Check API enablement, key restrictions, and account access.';
  else if (response.status === 429) help = 'Free-tier quota is unavailable or exhausted. Wait or check AI Studio Rate Limit; do not enable paid billing.';
  else if (response.status === 400) help = 'Google rejected the request or key. Use the error codes below to identify which setting needs correction.';
  return { error:`Gemini HTTP ${response.status} / ${status}${reason ? ' / ' + reason : ''}. ${help}`, providerStatus:response.status, providerCode:status, providerReason:reason };
}

export function createApi({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const origins = new Set((env.ALLOWED_ORIGINS || 'http://127.0.0.1:5500,http://localhost:5500').split(',').map(s => s.trim()).filter(Boolean));
  const rates = new Map();
  let day = '', daily = 0;
  let modelCache;
  const maximum = Number(env.MAX_DAILY_REQUESTS || 100);
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error('MAX_DAILY_REQUESTS must be a positive integer.');
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (code, body) => {
      if (res.destroyed) return;
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    const origin = req.headers.origin;
    if (origin && origins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'GET' && req.url === '/health') {
      send(200, { status: 'ok', configured: Boolean(env.GEMINI_API_KEY && !env.GEMINI_API_KEY.startsWith('replace_')), provider: 'Google / Gemini', model:env.GEMINI_MODEL || 'gemini-3.5-flash-lite' });
      return;
    }
    if (req.method === 'GET' && req.url === '/models') {
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if (!local || (origin && !origins.has(origin))) { send(403, {error:'Model diagnostics are local-only.'}); return; }
      if (!env.GEMINI_API_KEY || env.GEMINI_API_KEY.startsWith('replace_')) { send(503, {error:'Gemini key is not configured.'}); return; }
      if (modelCache && now() - modelCache.time < 60000) { send(200, modelCache.data); return; }
      try {
        const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
          headers:{'x-goog-api-key':env.GEMINI_API_KEY}, signal:AbortSignal.timeout(15000)
        });
        if (!response.ok) { send(502, await providerDiagnostic(response)); return; }
        const result = await response.json();
        const all = (Array.isArray(result.models) ? result.models : []).filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name?.replace(/^models\//,'')).filter(m => typeof m === 'string' && /^[a-zA-Z0-9._-]+$/.test(m));
        const configured = env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const data = {configuredModel:configured, configuredModelListed:all.includes(configured), textModels:all.filter(m => !/image|tts|robotics|computer-use/.test(m)), note:'Listed models support text generation; this does not confirm free quota. No chat text or image was sent for this check.'};
        modelCache = {time:now(),data};
        send(200,data);
      } catch { send(502, {error:'Could not retrieve models from Google. Check the backend network connection.'}); }
      return;
    }
    if (!origin || !origins.has(origin)) { send(403, {error:'This website origin is not allowed.', transfer:'not-forwarded'}); return; }
    if (req.url !== '/api/chat') { send(404, { error:'Not found.', transfer:'not-forwarded' }); return; }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Max-Age':'600' });
      res.end(); return;
    }
    if (req.method !== 'POST') { send(405, {error:'Use POST.', transfer:'not-forwarded'}); return; }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
      send(415, {error:'JSON is required.', transfer:'not-forwarded'}); return;
    }
    if (!env.GEMINI_API_KEY || env.GEMINI_API_KEY.startsWith('replace_')) {
      send(503, {error:'AI is not configured yet. Add the API key to the private backend environment.', transfer:'not-forwarded'}); return;
    }
    let body;
    try {
      let size = 0, chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 150000) { send(413, {error:'Conversation is too large. Start a new conversation.', transfer:'not-forwarded'}); return; }
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { send(400, {error:'Invalid JSON.', transfer:'not-forwarded'}); return; }
    if (body?.consent !== true) { send(400, {error:'Consent is required before sending to AI.', transfer:'not-forwarded'}); return; }
    const messages = body.messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > 60 || messages.at(-1)?.role !== 'user' ||
        messages.some((m, i) => !m || m.role !== (i % 2 ? 'assistant' : 'user') || typeof m.content !== 'string' || !m.content.trim() || m.content.length > (m.role === 'user' ? 4000 : 16000) || Object.keys(m).some(k => !['role','content'].includes(k))) ||
        messages.reduce((sum, m) => sum + m.content.length, 0) > 40000) {
      send(400, {error:'Conversation is invalid or too long. Clear it and start a shorter conversation.', transfer:'not-forwarded'}); return;
    }
    const time = now(), today = new Date(time).toISOString().slice(0,10);
    if (today !== day) { daily = 0; day = today; }
    const ip = req.socket.remoteAddress; // Do not trust client-supplied forwarding headers.
    for (const [key, entries] of rates) {
      const fresh = entries.filter(t => time - t < 3600000);
      if (fresh.length) rates.set(key, fresh); else rates.delete(key);
    }
    const hits = rates.get(ip) || [];
    if (daily >= maximum || hits.length >= 20 || hits.filter(t => time - t < 60000).length >= 8) {
      send(429, {error:'The project request limit has been reached. Please try later or use Alex’s offline example.', transfer:'not-forwarded'}); return;
    }
    rates.set(ip, [...hits, time]); daily++;
    let response;
    try {
      response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL || 'gemini-3.5-flash-lite')}:generateContent`, {
        method:'POST',
        headers:{'Content-Type':'application/json', 'x-goog-api-key':env.GEMINI_API_KEY},
        body:JSON.stringify({
          systemInstruction:{parts:[{text:'You are OpenThread, a helpful conversational assistant within the student project Behind the Prompt. Answer the user’s actual question naturally in their language, using the conversation context. Be concise and empathetic. Do not claim to be a therapist, guarantee privacy, or claim that this project publishes links, searches the internet, edits uploaded images through AI, or activates privacy controls. The sharing and image-reuse portions of this project are fictional educational scenarios. Do not force every answer into a privacy lecture. Never say you are a scripted demo. Do not ask users for unnecessary identifying or sensitive details. This free-tier educational prototype is for adults using fictional or non-personal questions only. Never solicit sensitive, confidential, or personal information. Do not offer medical advice. If a user appears to introduce personal or confidential details, remind them to use a fictional, non-personal example rather than probing for more details.'}]},
          contents:messages.map(({role, content}) => ({role:role === 'assistant' ? 'model' : 'user', parts:[{text:content}]})),
          generationConfig:{maxOutputTokens:2048}

        }),
        signal:AbortSignal.timeout(55000)
      });
      if (!response.ok) {
        send(502, {...await providerDiagnostic(response), transfer:'provider-requested'}); return;
      }
      const result = await response.json();
      const reply = result.candidates?.[0]?.content?.parts?.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('\n').trim();
      if (!reply) { send(502, {error:'Gemini returned no displayable text. The response may have been blocked or exhausted its output limit. Try a shorter, non-personal question.', transfer:'provider-requested'}); return; }
      send(200, {reply, provider:'Google / Gemini', model:result.modelVersion || env.GEMINI_MODEL || 'gemini-3.5-flash-lite', transfer:'provider-requested'});
    } catch {
      send(502, {error:'The provider connection failed or timed out. Delivery is unconfirmed; retrying may resend the conversation.', transfer:response ? 'provider-requested' : 'unconfirmed'});
    }
  });
  server.requestTimeout = 70000;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  createApi().listen(port, '0.0.0.0', () => console.log(`Behind the Prompt API listening on port ${port}`));
}
