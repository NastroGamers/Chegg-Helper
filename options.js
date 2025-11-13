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
  const promptText = promptCountEl.querySelector('.options-status-text');
  if (promptText) {
    promptText.textContent = `${chx_prompts.length} prompt(s) saved`;
  }

  // Save button
  document.getElementById('save').onclick = async () => {
    const button = document.getElementById('save');
    const key = document.getElementById('deepseekKey').value.trim();

    // Add loading state
    button.classList.add('is-loading');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');

    try {
      await set({
        deepseek_api_key: key,
      });
      showStatus('Settings saved successfully!', true);
    } catch (error) {
      showStatus(`Failed to save settings: ${error.message}`, false);
    } finally {
      // Remove loading state
      button.classList.remove('is-loading');
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  };

  // Test button
  document.getElementById('test').onclick = async () => {
    const button = document.getElementById('test');

    // Add loading state
    button.classList.add('is-loading');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');

    showStatus('Testing connection to DeepSeek API...', null);

    try {
      const ds = await ping('deepseek');
      if (ds.ok) {
        showStatus(`Connection successful! Found ${ds.models ? ds.models.length : 0} models.`, true);
      } else {
        showStatus(`Connection failed: ${ds.error || 'Unknown error'}`, false);
      }
    } catch (error) {
      showStatus(`Test failed: ${error.message}`, false);
    } finally {
      // Remove loading state
      button.classList.remove('is-loading');
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  };

  // Export prompts
  document.getElementById('exportPrompts').onclick = async () => {
    const button = document.getElementById('exportPrompts');

    // Add loading state
    button.classList.add('is-loading');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');

    try {
      const { chx_prompts = [] } = await get(['chx_prompts']);
      if (chx_prompts.length === 0) {
        showStatus('No prompts to export', false);
        return;
      }
      const blob = new Blob([JSON.stringify(chx_prompts, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chegg-helper-prompts-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showStatus(`Exported ${chx_prompts.length} prompts successfully!`, true);
    } catch (error) {
      showStatus(`Export failed: ${error.message}`, false);
    } finally {
      // Remove loading state
      button.classList.remove('is-loading');
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  };

  // Import prompts
  document.getElementById('importFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showStatus('Importing prompts...', null);

    try {
      const text = await file.text();
      const arr = JSON.parse(text);

      if (!Array.isArray(arr)) {
        showStatus('Invalid format: Expected an array of prompts', false);
        e.target.value = '';
        return;
      }

      await set({ chx_prompts: arr });
      const promptText = document.getElementById('promptCount').querySelector('.options-status-text');
      if (promptText) {
        promptText.textContent = `${arr.length} prompt(s) saved`;
      }
      showStatus(`Imported ${arr.length} prompts successfully!`, true);
    } catch (err) {
      showStatus(`Import failed: ${err.message || 'Invalid JSON'}`, false);
    } finally {
      // Reset file input
      e.target.value = '';
    }
  };

  // Clear prompts
  document.getElementById('clearPrompts').onclick = async () => {
    const button = document.getElementById('clearPrompts');

    try {
      const { chx_prompts = [] } = await get(['chx_prompts']);
      if (chx_prompts.length === 0) {
        showStatus('No prompts to clear', false);
        return;
      }

      if (!confirm(`Are you sure you want to delete all ${chx_prompts.length} prompts? This cannot be undone.`)) {
        return;
      }

      // Add loading state
      button.classList.add('is-loading');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');

      await set({ chx_prompts: [] });
      const promptText = document.getElementById('promptCount').querySelector('.options-status-text');
      if (promptText) {
        promptText.textContent = '0 prompt(s) saved';
      }
      showStatus('All prompts cleared successfully', true);
    } catch (error) {
      showStatus(`Clear failed: ${error.message}`, false);
    } finally {
      // Remove loading state
      button.classList.remove('is-loading');
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  };

  // Keyboard shortcuts for accessibility
  document.getElementById('deepseekKey').addEventListener('keydown', (e) => {
    // Ctrl+Enter or Cmd+Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('save').click();
    }
  });
}

async function ping(provider) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'listModels', provider }, (res) => {
      resolve(res || { ok: false, error: 'No response from background script' });
    });
  });
}

function showStatus(msg, success) {
  const el = document.getElementById('status');
  const iconEl = el.querySelector('.options-status-icon');
  const textEl = el.querySelector('.options-status-text');

  // Remove all status classes
  el.classList.remove('success', 'error', 'info');
  el.classList.add('visible');

  if (success === true) {
    el.classList.add('success');
    iconEl.textContent = '✅';
    el.setAttribute('aria-label', 'Success: ' + msg);
  } else if (success === false) {
    el.classList.add('error');
    iconEl.textContent = '❌';
    el.setAttribute('aria-label', 'Error: ' + msg);
  } else {
    el.classList.add('info');
    iconEl.textContent = '⏳';
    el.setAttribute('aria-label', 'Info: ' + msg);
  }

  textEl.textContent = msg;

  // Auto-hide after 6 seconds for success/error messages
  if (success !== null) {
    setTimeout(() => {
      el.classList.remove('visible');
      el.removeAttribute('aria-label');
    }, 6000);
  }
}

// Initialize when DOM is ready
init();
