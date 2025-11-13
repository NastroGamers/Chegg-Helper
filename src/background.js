// Background service worker: provider API calls and model listing

const DEFAULT_SYSTEM_PROMPT = "You are a helpful expert. Answer comprehensively in well-structured Markdown with clear section headings, bold key terms, and code blocks where relevant. Provide the final answer directly (not just a plan). Avoid nested \"Step N:\" labels inside sections; use subheadings instead.";

chrome.runtime.onInstalled.addListener(() => {
  console.log('Chegg Helper extension installed');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Chegg Helper extension started');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'listAllModels') {
        const providers = ['deepseek', 'openai', 'gemini', 'claude'];
        let list = [];

        // Fetch models from all providers
        for (const provider of providers) {
          const apiKey = await getKey(provider);
          if (apiKey) {
            const result = await fetchModels(provider, apiKey);
            if (result.models && result.models.length) {
              for (const id of result.models) {
                list.push({ id, provider });
              }
            }
          }
        }

        // Fallback to default models if no models found
        if (!list.length) {
          list = [
            { id: 'deepseek-chat', provider: 'deepseek' },
            { id: 'deepseek-reasoner', provider: 'deepseek' },
            { id: 'gpt-4o', provider: 'openai' },
            { id: 'gpt-4o-mini', provider: 'openai' },
            { id: 'gemini-2.0-flash-exp', provider: 'gemini' },
            { id: 'gemini-1.5-pro', provider: 'gemini' },
            { id: 'claude-3-5-sonnet-20241022', provider: 'claude' }
          ];
        }

        sendResponse({ ok: true, models: list });
        return;
      }
      if (msg.type === 'listModels') {
        const { provider } = msg;
        const apiKey = await getKey(provider);
        if (!apiKey) {
          sendResponse({ ok: false, error: `${provider} API key not set`, models: [] });
          return;
        }
        const res = await fetchModels(provider, apiKey);
        sendResponse(res);
        return;
      }
      if (msg.type === 'generate') {
        const { provider, model, system, user, history } = msg;
        const apiKey = await getKey(provider);
        if (!apiKey) { sendResponse({ ok: false, error: `${provider} API key not set` }); return; }
        const finalSystem = combineSystem(system, provider);
        const res = await generate(provider, apiKey, model, finalSystem, user || '', history);
        sendResponse(res);
        return;
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err && err.message || err) });
    }
  })();
  // Keep the message channel open for async reply
  return true;
});

// Long‑lived port for live streaming
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'chx-stream') return;
  let controller = null;
  port.onMessage.addListener(async (msg) => {
    try {
      if (msg.type === 'generateStream') {
        const { provider, model, system, user, history } = msg;
        const apiKey = await getKey(provider);
        if (!apiKey) { port.postMessage({ type: 'error', error: `${provider} API key not set` }); return; }
        controller = new AbortController();
        const finalSystem = combineSystem(system, provider);
        const result = await streamGenerate({ provider, apiKey, model, system: finalSystem, user: user || '', history }, port, controller);
        if (!result.ok && result.error) port.postMessage({ type: 'error', error: result.error });
      } else if (msg.type === 'abort') {
        if (controller) controller.abort();
      }
    } catch (e) {
      port.postMessage({ type: 'error', error: String(e && e.message || e) });
    }
  });
  port.onDisconnect.addListener(() => {
    if (controller) controller.abort();
  });
});

// API key caches for all providers
let deepseekKeyCache = '';
let openaiKeyCache = '';
let geminiKeyCache = '';
let claudeKeyCache = '';

async function getKey(provider) {
  const keyMap = {
    'deepseek': 'deepseek_api_key',
    'openai': 'openai_api_key',
    'gemini': 'gemini_api_key',
    'claude': 'claude_api_key'
  };

  const cacheMap = {
    'deepseek': deepseekKeyCache,
    'openai': openaiKeyCache,
    'gemini': geminiKeyCache,
    'claude': claudeKeyCache
  };

  const storageKey = keyMap[provider];
  if (!storageKey) return '';

  // 1) Prefer cached
  if (cacheMap[provider]) return cacheMap[provider];

  // 2) Try sync storage
  const fromSync = await new Promise((resolve) => {
    const obj = {};
    obj[storageKey] = '';
    chrome.storage.sync.get(obj, (res) => resolve(res[storageKey] || ''));
  });
  if (fromSync) {
    if (provider === 'deepseek') deepseekKeyCache = fromSync;
    if (provider === 'openai') openaiKeyCache = fromSync;
    if (provider === 'gemini') geminiKeyCache = fromSync;
    if (provider === 'claude') claudeKeyCache = fromSync;
    return fromSync;
  }

  // 3) Try local storage
  const fromLocal = await new Promise((resolve) => {
    const obj = {};
    obj[storageKey] = '';
    chrome.storage.local.get(obj, (res) => resolve(res[storageKey] || ''));
  });
  if (fromLocal) {
    if (provider === 'deepseek') deepseekKeyCache = fromLocal;
    if (provider === 'openai') openaiKeyCache = fromLocal;
    if (provider === 'gemini') geminiKeyCache = fromLocal;
    if (provider === 'claude') claudeKeyCache = fromLocal;
    return fromLocal;
  }

  // No API key found
  return '';
}

async function fetchModels(provider, apiKey) {
  try {
    if (provider === 'deepseek') {
      const r = await fetch('https://api.deepseek.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const models = (j.data || []).map(m => m.id).filter(Boolean);
      return { ok: true, models };
    }

    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const models = (j.data || []).map(m => m.id).filter(id => id.includes('gpt'));
      return { ok: true, models };
    }

    if (provider === 'gemini') {
      // Gemini uses a different API structure - list available models
      const r = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const models = (j.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .filter(Boolean);
      return { ok: true, models };
    }

    if (provider === 'claude') {
      // Anthropic doesn't have a models endpoint, return hardcoded list
      const models = [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307'
      ];
      return { ok: true, models };
    }

    return { ok: false, error: `Unknown provider: ${provider}`, models: [] };
  } catch (e) {
    return { ok: false, error: `Model list failed: ${e.message}`, models: [] };
  }
}

async function generate(provider, apiKey, model, system, user) {
  try {
    // OpenAI and DeepSeek use the same format
    if (provider === 'deepseek' || provider === 'openai') {
      const baseUrl = provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com';
      const url = `${baseUrl}/v1/chat/completions`;
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
      const body = {
        model: model,
        temperature: tempForModel(model),
        messages: buildMessages(system, user)
      };
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!r.ok) {
        const txt = await safeText(r);
        if (r.status === 401 || r.status === 403) {
          throw new Error(`${provider} API key invalid or unauthorized (HTTP ${r.status}). Set your key in Options.`);
        }
        throw new Error(`HTTP ${r.status}: ${txt}`);
      }
      const j = await r.json();
      const msg = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message : {};
      const text = (msg.content || msg.reasoning_content || '') || '';
      return { ok: true, text };
    }

    // Google Gemini
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
      const headers = { 'Content-Type': 'application/json' };
      const parts = [];
      if (system) parts.push({ text: system });
      if (user) parts.push({ text: user });
      const body = {
        contents: [{ parts }],
        generationConfig: { temperature: tempForModel(model) }
      };
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!r.ok) {
        const txt = await safeText(r);
        if (r.status === 401 || r.status === 403) {
          throw new Error(`Gemini API key invalid or unauthorized (HTTP ${r.status}). Set your key in Options.`);
        }
        throw new Error(`HTTP ${r.status}: ${txt}`);
      }
      const j = await r.json();
      const text = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { ok: true, text };
    }

    // Anthropic Claude
    if (provider === 'claude') {
      const url = 'https://api.anthropic.com/v1/messages';
      const headers = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      };
      const messages = [];
      if (user) messages.push({ role: 'user', content: user });
      const body = {
        model: model,
        max_tokens: 4096,
        temperature: tempForModel(model),
        messages: messages
      };
      if (system) body.system = system;
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!r.ok) {
        const txt = await safeText(r);
        if (r.status === 401 || r.status === 403) {
          throw new Error(`Claude API key invalid or unauthorized (HTTP ${r.status}). Set your key in Options.`);
        }
        throw new Error(`HTTP ${r.status}: ${txt}`);
      }
      const j = await r.json();
      const text = j.content?.[0]?.text || '';
      return { ok: true, text };
    }

    return { ok: false, error: `Unknown provider: ${provider}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function safeText(r) { try { return await r.text(); } catch { return ''; } }

// Streaming generation using SSE
async function streamGenerate({ provider, apiKey, model, system, user, history }, port, controller) {
  try {
    // OpenAI and DeepSeek use the same SSE format
    if (provider === 'deepseek' || provider === 'openai') {
      const baseUrl = provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com';
      const url = `${baseUrl}/v1/chat/completions`;
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
      const body = {
        model,
        temperature: tempForModel(model),
        stream: true,
        messages: buildMessages(system, user, history)
      };
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok) {
        const txt = await safeText(res);
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          const lines = chunk.split('\n');
          for (const line of lines) {
            const m = line.match(/^data: *(.*)$/);
            if (!m) continue;
            const data = m[1];
            if (data === '[DONE]') { port.postMessage({ type: 'done' }); return { ok: true }; }
            try {
              const j = JSON.parse(data);
              const d = j.choices?.[0]?.delta || {};
              const delta = d.content ?? d.reasoning_content ?? j.choices?.[0]?.text ?? '';
              if (typeof delta === 'string' && delta) port.postMessage({ type: 'chunk', delta });
            } catch (e) {
              // ignore non-json lines
            }
          }
        }
      }
      port.postMessage({ type: 'done' });
      return { ok: true };
    }

    // Google Gemini streaming
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
      const headers = { 'Content-Type': 'application/json' };
      const parts = [];
      if (system) parts.push({ text: system });
      if (user) parts.push({ text: user });
      const body = {
        contents: [{ parts }],
        generationConfig: { temperature: tempForModel(model) }
      };
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok) {
        const txt = await safeText(res);
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          const lines = chunk.split('\n');
          for (const line of lines) {
            const m = line.match(/^data: *(.*)$/);
            if (!m) continue;
            const data = m[1];
            try {
              const j = JSON.parse(data);
              const delta = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (typeof delta === 'string' && delta) port.postMessage({ type: 'chunk', delta });
            } catch (e) {
              // ignore non-json lines
            }
          }
        }
      }
      port.postMessage({ type: 'done' });
      return { ok: true };
    }

    // Anthropic Claude streaming
    if (provider === 'claude') {
      const url = 'https://api.anthropic.com/v1/messages';
      const headers = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      };
      const messages = [];
      if (user) messages.push({ role: 'user', content: user });
      const body = {
        model: model,
        max_tokens: 4096,
        temperature: tempForModel(model),
        messages: messages,
        stream: true
      };
      if (system) body.system = system;
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok) {
        const txt = await safeText(res);
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          const lines = chunk.split('\n');
          for (const line of lines) {
            const m = line.match(/^data: *(.*)$/);
            if (!m) continue;
            const data = m[1];
            try {
              const j = JSON.parse(data);
              if (j.type === 'content_block_delta') {
                const delta = j.delta?.text || '';
                if (typeof delta === 'string' && delta) port.postMessage({ type: 'chunk', delta });
              } else if (j.type === 'message_stop') {
                port.postMessage({ type: 'done' });
                return { ok: true };
              }
            } catch (e) {
              // ignore non-json lines
            }
          }
        }
      }
      port.postMessage({ type: 'done' });
      return { ok: true };
    }

    return { ok: false, error: `Unknown provider: ${provider}` };
  } catch (e) {
    if (e && e.name === 'AbortError') { port.postMessage({ type: 'done' }); return { ok: true }; }
    return { ok: false, error: e.message || String(e) };
  }
}

function buildMessages(system, user, history) {
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  if (Array.isArray(history) && history.length) {
    for (const m of history) {
      if (m && m.role && m.content != null) msgs.push({ role: m.role, content: m.content });
    }
  } else if (user) {
    msgs.push({ role: 'user', content: user });
  }
  return msgs;
}

function combineSystem(custom, provider) {
  // If no custom prompt selected, generate with the default only (normal AI behavior)
  if (!custom) return DEFAULT_SYSTEM_PROMPT;
  const common = `\n\n[MANDATORY]\n- Follow the above prompt EXACTLY.\n- If an instruction conflicts, the selected prompt takes priority.\n- Use clear headings, short paragraphs, bold labels where useful.\n- Provide the final answer (not just a plan).`;
  // Keep previous structure but WITHOUT bullet points (plain lines only)
  const deepseekExtras = provider === 'deepseek'
    ? `\n- Start directly with "Step 1" (no preface like Title/Overview/Solution).\n- TOP‑LEVEL STEPS ONLY: Use "Step 1", "Step 2", "Step 3" strictly for the main sections.\n- Do NOT write any nested "Step N:" inside Step 3 or other sections. For sub‑steps, use mini‑headings or plain lines (no lists).\n- Display equations must use \\[ ... \\] only. Keep labels/units OUTSIDE the brackets. Inline math uses \\( ... \\).\n- Mirror any section names in the selected prompt EXACTLY (same words and casing). Do not rename.\n- Do not add extra sections not requested. No disclaimers, prefaces, or summaries beyond "Final Answer".\n- IMPORTANT: Do not use numbered lists or bullet points; use plain lines.\n\n[STRUCTURE — REPRODUCE EXACTLY]\n# Step 1: Conceptual Introduction\n<2–5 sentences context>\n\n### Explanation Block\n<line 1>\n<line 2>\n\n# Step 2: Formulas Used in the Solution\nFormulas:\n\\[ <formula 1> \\]\n\\[ <formula 2> \\]\n(define each symbol briefly; one line per symbol)\n\n### Explanation Block\n<line 1>\n<line 2>\n\n# Step 3: Step-by-Step Calculation\n## Given:\n<given 1 with optional \\( ... \\)>\n<given 2>\n\n### Calculation\nUse display math for each calculation:\n\\[ <equation> \\]\nKeep any words/units OUTSIDE the math brackets; use **bold** for labels as needed.\n\n### Explanation Block\n<line 1>\n<line 2>\n\n# Final Answer\n<key result 1 with **bold** value>\n<key result 2 with **bold** value>`
    : '';
  return `${custom}${common}${deepseekExtras}`;
}

function tempForModel(model = '') {
  const m = String(model).toLowerCase();
  if (m.includes('deepseek')) return 0.1; // nudge DeepSeek toward stricter compliance
  if (m.includes('o1') || m.includes('o3')) return 1; // OpenAI reasoning models require temperature 1
  if (/(gpt-5|pro)/.test(m)) return 1; // some models require default temperature
  if (m.includes('claude')) return 0.3; // Claude models work well with slightly higher temperature
  if (m.includes('gemini')) return 0.2; // Gemini models
  if (m.includes('gpt')) return 0.2; // OpenAI GPT models
  return 0.2;
}
