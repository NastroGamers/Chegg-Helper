// Popup UI logic

function qs(id) {
  return document.getElementById(id);
}

async function checkAPIKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ deepseek_api_key: '' }, (res) => {
      const hasKey = !!(res.deepseek_api_key && res.deepseek_api_key.trim());
      resolve(hasKey);
    });
  });
}

async function refreshCheggTab() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://expert.chegg.com/*' });
    if (tabs && tabs.length > 0) {
      for (const tab of tabs) {
        chrome.tabs.reload(tab.id);
      }
      return true;
    }
    return false;
  } catch (e) {
    console.error('Error refreshing tab:', e);
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Check API key status
  const hasAPIKey = await checkAPIKey();
  const apiStatusEl = qs('apiStatus');
  if (apiStatusEl) {
    if (hasAPIKey) {
      apiStatusEl.textContent = 'Configured';
      apiStatusEl.classList.remove('is-warning');
      apiStatusEl.classList.add('is-configured');
      apiStatusEl.setAttribute('aria-label', 'API key is configured');
    } else {
      apiStatusEl.textContent = 'Not Set';
      apiStatusEl.classList.remove('is-configured');
      apiStatusEl.classList.add('is-warning');
      apiStatusEl.setAttribute('aria-label', 'API key is not configured');
    }
  }

  // Open settings button
  const btnOptions = qs('btnOptions');
  if (btnOptions) {
    btnOptions.addEventListener('click', () => {
      btnOptions.classList.add('is-loading');
      btnOptions.setAttribute('aria-busy', 'true');
      chrome.runtime.openOptionsPage();
      // Remove loading state after a short delay
      setTimeout(() => {
        btnOptions.classList.remove('is-loading');
        btnOptions.removeAttribute('aria-busy');
      }, 500);
    });
  }

  // Refresh Chegg page button
  const btnRefresh = qs('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      const textSpan = btnRefresh.querySelector('span:last-child');
      const originalText = textSpan.textContent;

      // Add loading state
      btnRefresh.classList.add('is-loading');
      btnRefresh.disabled = true;
      btnRefresh.setAttribute('aria-busy', 'true');
      textSpan.textContent = 'Refreshing...';

      const success = await refreshCheggTab();

      // Remove loading state
      btnRefresh.classList.remove('is-loading');
      btnRefresh.removeAttribute('aria-busy');

      if (success) {
        textSpan.textContent = 'Refreshed!';
        setTimeout(() => {
          textSpan.textContent = originalText;
          btnRefresh.disabled = false;
        }, 1500);
      } else {
        textSpan.textContent = 'No Chegg tab found';
        setTimeout(() => {
          textSpan.textContent = originalText;
          btnRefresh.disabled = false;
        }, 2000);
      }
    });
  }
});
