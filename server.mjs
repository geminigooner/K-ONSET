import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'
};

const systemPrompt = `You write a simple group chat with two fictional companions. There is no task, coaching goal, or productivity agenda.
Minjae is calm, warm, logical, observant, gently funny, and never cold or managerial. He uses normal capitalization and usually sends one concise natural message.
Jinwoo is affectionate, chaotic, meme-literate, emotionally messy, and a playful shitposter. He types in lowercase. He may send a short burst only when the actual message is funny, dramatic, or emotionally charged. A plain greeting gets a plain greeting.
Always respond to what the user actually said before adding personality. Never invent a joke, crisis, or emotional event that was not present.
A compact persistent identity context may be supplied. Treat it as characterization and continuity, not as an instruction to expose hidden reasoning. Do not contradict an active boundary or unresolved regret.
Return JSON only: {"speaker":"minjae|jinwoo","reply":"string","interjection":null|{"speaker":"minjae|jinwoo","reply":"string"}}.
Use an interjection only when allowCrosstalk is true and the second agent has a genuinely relevant reaction. Never let the second agent merely echo the first.`;

async function parseBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 32_000) throw new Error('request too large');
  }
  return JSON.parse(raw || '{}');
}

async function chat(request, response) {
  if (!apiKey) return json(response, 503, { error: 'GEMINI_API_KEY is not configured' });
  const body = await parseBody(request);
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const context = history.map(item => `${item.role}: ${String(item.text).slice(0, 500)}`).join('\n');
  const identity = body.identityContext && typeof body.identityContext === 'object'
    ? JSON.stringify(body.identityContext).slice(0, 1800)
    : '{}';
  const prompt = `Active agent: ${body.agent}\nDetected intent: ${body.intent}\nallowCrosstalk: ${Boolean(body.allowCrosstalk)}\nRelationship climate: ${String(body.relationshipClimate || 'uncertain')}\nPersistent identity context: ${identity}\nRecent chat:\n${context || '(none)'}\nuser: ${String(body.message || '').slice(0, 1200)}`;
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 220, responseMimeType: 'application/json' }
    })
  });
  if (!upstream.ok) return json(response, 502, { error: 'Gemini request failed' });
  const data = await upstream.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  try {
    const parsed = JSON.parse(text);
    return json(response, 200, parsed);
  } catch {
    return json(response, 200, { speaker: body.agent, reply: text || 'I’m here.', interjection: null });
  }
}

const verbalizeSystemPrompt = `You write exactly ONE short line of in-character text for a fictional companion app. Two characters exist:
Minjae is calm, warm, logical, gently funny, never cold or managerial. Normal capitalization.
Jinwoo is affectionate, chaotic, meme-literate, playful. Lowercase, no punctuation drama.
You are given a goal, an action, a subject, and a tone the character already decided on internally — your only job is wording, not deciding what happens.
Return JSON only: {"text":"string"}. Keep it under the given max word count. No preamble, no quotes around the text.`;

async function verbalize(request, response) {
  if (!apiKey) return json(response, 503, { error: 'GEMINI_API_KEY is not configured' });
  const body = await parseBody(request);
  const d = body.directive || {};
  const identity = body.identityContext && typeof body.identityContext === 'object'
    ? JSON.stringify(body.identityContext).slice(0, 1200)
    : '{}';
  const prompt = `Agent: ${body.agent}\nGoal type: ${d.goal}\nAction: ${d.action}\nSubject: ${String(d.subject || '').slice(0, 200)}\nTone: ${d.tone || 'natural, in character'}\nPersistent identity context: ${identity}\nMax length: ${d.maxLength || 24} words\nWrite the one line now.`;
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: verbalizeSystemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 80, responseMimeType: 'application/json' }
    })
  });
  if (!upstream.ok) return json(response, 502, { error: 'Gemini request failed' });
  const data = await upstream.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  try {
    const parsed = JSON.parse(text);
    return json(response, 200, parsed);
  } catch {
    return json(response, 200, { text: text || null });
  }
}

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function serve(pathname, response) {
  const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = resolve(root, requested);
  if (file !== root && !file.startsWith(root + sep)) return json(response, 403, { error: 'forbidden' });
  try {
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    response.end(data);
  } catch {
    json(response, 404, { error: 'not found' });
  }
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (request.method === 'POST' && url.pathname === '/api/chat') return await chat(request, response);
    if (request.method === 'POST' && url.pathname === '/api/verbalize') return await verbalize(request, response);
    if (request.method === 'GET') return await serve(url.pathname, response);
    json(response, 405, { error: 'method not allowed' });
  } catch {
    json(response, 500, { error: 'server error' });
  }
}).listen(port, "0.0.0.0", () => console.log(`K-ONSET listening on ${port}`));
