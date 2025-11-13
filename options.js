async function get(k) { return new Promise(r => chrome.storage.sync.get(k, r)); }
async function set(obj) { return new Promise(r => chrome.storage.sync.set(obj, r)); }

async function init() {
  const { deepseek_api_key = '', chx_prompts = [], chx_google_client_id = '' } = await get(['deepseek_api_key','chx_prompts','chx_google_client_id']);
  document.getElementById('deepseekKey').value = deepseek_api_key;
  document.getElementById('googleClientId').value = chx_google_client_id;
  document.getElementById('promptCount').textContent = `${chx_prompts.length} prompt(s) saved`;

  // Fetch computed redirect URI and show it for easy copy
  try {
    chrome.runtime.sendMessage({ type: 'auth:redirectInfo' }, (res) => {
      if (res && res.ok) {
        const el = document.getElementById('redirectUri');
        if (el) el.value = res.redirectUri || '';
        // Prefill clientId if storage is empty
        if (!document.getElementById('googleClientId').value && res.clientId) {
          document.getElementById('googleClientId').value = res.clientId;
        }
      }
    });
  } catch {}

  document.getElementById('save').onclick = async () => {
    const key = document.getElementById('deepseekKey').value.trim();
    await set({
      deepseek_api_key: key,
      chx_google_client_id: document.getElementById('googleClientId').value.trim(),
    });
    // Attempt to mirror the DeepSeek key to Firebase for this user (if signed in)
    try {
      if (key) {
        chrome.runtime.sendMessage({ type: 'user:saveDeepseekKey', key }, (res) => {
          // ignore response; status shown regardless
        });
      }
    } catch {}
    status(`Saved`, true);
  };

  document.getElementById('test').onclick = async () => {
    status('Testing model access…');
    const ds = await ping('deepseek');
    status(`DeepSeek: ${ds.ok ? 'ok' : ds.error || 'no key'}`);
  };

  const copyBtn = document.getElementById('copyRedirect');
  if (copyBtn) copyBtn.onclick = async () => {
    try {
      const v = document.getElementById('redirectUri').value || '';
      await navigator.clipboard.writeText(v);
      status('Redirect URI copied', true);
    } catch { status('Copy failed', false); }
  };

  document.getElementById('exportPrompts').onclick = async () => {
    const { chx_prompts = [] } = await get(['chx_prompts']);
    const blob = new Blob([JSON.stringify(chx_prompts, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'prompts.json'; a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById('importFile').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    try { const arr = JSON.parse(text); if (Array.isArray(arr)) { await set({ chx_prompts: arr }); status('Imported prompts', true); document.getElementById('promptCount').textContent = `${arr.length} prompt(s) saved`; } }
    catch { status('Invalid JSON', false); }
  };
  document.getElementById('clearPrompts').onclick = async () => {
    if (!confirm('Clear all prompts?')) return;
    await set({ chx_prompts: [] });
    document.getElementById('promptCount').textContent = '0 prompt(s) saved';
    status('Cleared', true);
  };
}

async function ping(provider) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'listModels', provider }, (res) => resolve(res || { ok: false }));
  });
}

function status(msg, ok) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = ok === undefined ? 'muted' : ok ? 'ok' : 'err';
}

init();
