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
      apiStatusEl.classList.add('active');
    } else {
      apiStatusEl.textContent = 'Not Set';
      apiStatusEl.classList.remove('active');
    }
  }

  // Open settings button
  const btnOptions = qs('btnOptions');
  if (btnOptions) {
    btnOptions.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Refresh Chegg page button
  const btnRefresh = qs('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      const originalText = btnRefresh.textContent;
      btnRefresh.textContent = 'Refreshing...';
      btnRefresh.disabled = true;

      const success = await refreshCheggTab();

      if (success) {
        btnRefresh.textContent = 'Refreshed!';
        setTimeout(() => {
          btnRefresh.textContent = originalText;
          btnRefresh.disabled = false;
        }, 1500);
      } else {
        btnRefresh.textContent = 'No Chegg tab found';
        setTimeout(() => {
          btnRefresh.textContent = originalText;
          btnRefresh.disabled = false;
        }, 2000);
      }
    });
  }
});
