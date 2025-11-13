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
        const dsKey = await getKey('deepseek');
        const ds = dsKey ? await fetchModels('deepseek', dsKey) : { ok: false, models: [] };
        let list = [];
        if (ds.models) for (const id of ds.models) list.push({ id, provider: 'deepseek' });
        if (!list.length) list = [{ id: 'deepseek-chat', provider: 'deepseek' }, { id: 'deepseek-reasoner', provider: 'deepseek' }];
        sendResponse({ ok: true, models: list });
        return;
      }
      if (msg.type === 'listModels') {
        const { provider } = msg; // expect 'deepseek'
        const apiKey = await getKey('deepseek');
        if (!apiKey) {
          sendResponse({ ok: false, error: `deepseek API key not set`, models: [] });
          return;
        }
        const res = await fetchModels('deepseek', apiKey);
        sendResponse(res);
        return;
      }
      if (msg.type === 'generate') {
        const { model, system, user, history } = msg;
        const apiKey = await getKey('deepseek');
        if (!apiKey) { sendResponse({ ok: false, error: `deepseek API key not set` }); return; }
        const finalSystem = combineSystem(system, 'deepseek');
        const res = await generate('deepseek', apiKey, model, finalSystem, user || '', history);
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

let deepseekKeyCache = '';
async function getKey(provider) {
  if (provider !== 'deepseek') return '';
  // 1) Prefer cached
  if (deepseekKeyCache) return deepseekKeyCache;
  // 2) Try sync storage
  const fromSync = await new Promise((resolve) => {
    chrome.storage.sync.get({ deepseek_api_key: '' }, (res) => resolve(res.deepseek_api_key || ''));
  });
  if (fromSync) {
    deepseekKeyCache = fromSync;
    return fromSync;
  }
  // 3) Try local storage
  const fromLocal = await new Promise((resolve) => {
    chrome.storage.local.get({ deepseek_api_key: '' }, (res) => resolve(res.deepseek_api_key || ''));
  });
  if (fromLocal) {
    deepseekKeyCache = fromLocal;
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
  } catch (e) {
    return { ok: false, error: `Model list failed: ${e.message}`, models: [] };
  }
}

async function generate(provider, apiKey, model, system, user) {
  try {
    const url = 'https://api.deepseek.com/v1/chat/completions';
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
        throw new Error('DeepSeek API key invalid or unauthorized (HTTP ' + r.status + '). Set your key in Options.');
      }
      throw new Error(`HTTP ${r.status}: ${txt}`);
    }
    const j = await r.json();
    const msg = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message : {};
    const text = (msg.content || msg.reasoning_content || '') || '';
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function safeText(r) { try { return await r.text(); } catch { return ''; } }

// Streaming generation using SSE
async function streamGenerate({ provider, apiKey, model, system, user, history }, port, controller) {
  try {
    const url = 'https://api.deepseek.com/v1/chat/completions';
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
            // OpenAI/DeepSeek delta shapes
            // DeepSeek Reasoner may stream reasoning_content before content
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
  if (/(gpt-5|pro)/.test(m)) return 1; // some models require default temperature
  return 0.2;
}
