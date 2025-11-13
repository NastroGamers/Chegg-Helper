async function get(k) {
  return new Promise(r => chrome.storage.sync.get(k, r));
}

async function set(obj) {
  return new Promise(r => chrome.storage.sync.set(obj, r));
}

async function init() {
  const { deepseek_api_key = '', chx_prompts = [] } = await get(['deepseek_api_key', 'chx_prompts']);
  document.getElementById('deepseekKey').value = deepseek_api_key;

  const promptCountEl = document.getElementById('promptCount');
  const promptText = promptCountEl.querySelector('.status-text');
  if (promptText) {
    promptText.textContent = `${chx_prompts.length} prompt(s) saved`;
  }

  // Save button
  document.getElementById('save').onclick = async () => {
    const key = document.getElementById('deepseekKey').value.trim();
    await set({
      deepseek_api_key: key,
    });
    showStatus('Settings saved successfully!', true);
  };

  // Test button
  document.getElementById('test').onclick = async () => {
    showStatus('Testing connection to DeepSeek API...', null);
    const ds = await ping('deepseek');
    if (ds.ok) {
      showStatus(`Connection successful! Found ${ds.models ? ds.models.length : 0} models.`, true);
    } else {
      showStatus(`Connection failed: ${ds.error || 'Unknown error'}`, false);
    }
  };

  // Export prompts
  document.getElementById('exportPrompts').onclick = async () => {
    const { chx_prompts = [] } = await get(['chx_prompts']);
    if (chx_prompts.length === 0) {
      showStatus('No prompts to export', false);
      return;
    }
    const blob = new Blob([JSON.stringify(chx_prompts, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chegg-helper-prompts.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showStatus(`Exported ${chx_prompts.length} prompts successfully!`, true);
  };

  // Import prompts
  document.getElementById('importFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) {
        await set({ chx_prompts: arr });
        const promptText = document.getElementById('promptCount').querySelector('.status-text');
        if (promptText) {
          promptText.textContent = `${arr.length} prompt(s) saved`;
        }
        showStatus(`Imported ${arr.length} prompts successfully!`, true);
      } else {
        showStatus('Invalid format: Expected an array of prompts', false);
      }
    } catch (err) {
      showStatus(`Import failed: ${err.message || 'Invalid JSON'}`, false);
    }
    // Reset file input
    e.target.value = '';
  };

  // Clear prompts
  document.getElementById('clearPrompts').onclick = async () => {
    const { chx_prompts = [] } = await get(['chx_prompts']);
    if (chx_prompts.length === 0) {
      showStatus('No prompts to clear', false);
      return;
    }
    if (!confirm(`Are you sure you want to delete all ${chx_prompts.length} prompts? This cannot be undone.`)) {
      return;
    }
    await set({ chx_prompts: [] });
    const promptText = document.getElementById('promptCount').querySelector('.status-text');
    if (promptText) {
      promptText.textContent = '0 prompt(s) saved';
    }
    showStatus('All prompts cleared successfully', true);
  };
}

async function ping(provider) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'listModels', provider }, (res) => resolve(res || { ok: false }));
  });
}

function showStatus(msg, success) {
  const el = document.getElementById('status');
  const iconEl = el.querySelector('.status-icon');
  const textEl = el.querySelector('.status-text');

  el.classList.remove('success', 'error');
  el.classList.add('visible');

  if (success === true) {
    el.classList.add('success');
    iconEl.textContent = '✅';
  } else if (success === false) {
    el.classList.add('error');
    iconEl.textContent = '❌';
  } else {
    iconEl.textContent = '⏳';
  }

  textEl.textContent = msg;

  // Auto-hide after 5 seconds for success/error messages
  if (success !== null) {
    setTimeout(() => {
      el.classList.remove('visible');
    }, 5000);
  }
}

init();
