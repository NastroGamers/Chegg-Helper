// Popup UI logic for Google Sign-In via background auth helpers

function qs(id){ return document.getElementById(id); }

async function getUser(){
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'auth:get' }, resolve));
}

async function login(){
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'auth:login' }, resolve));
}

async function logout(){
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'auth:logout' }, resolve));
}

async function hasGoogleClientId(){
  return new Promise((resolve) => {
    chrome.storage.sync.get({ chx_google_client_id: '' }, (res) => {
      const cid = res.chx_google_client_id || '';
      const ok = cid && /^[A-Za-z0-9\-.]+\.apps\.googleusercontent\.com$/.test(cid) && !/REPLACE_WITH/i.test(cid);
      resolve(!!ok);
    });
  });
}

function render(user){
  const out = qs('loggedOut');
  const inn = qs('loggedIn');
  if (user && user.user) user = user.user; // normalize
  if (user) {
    out.style.display = 'none';
    inn.style.display = '';
    qs('name').textContent = user.name || user.email || 'Signed in';
    qs('email').textContent = user.email || '';
    const img = qs('avatar');
    if (user.picture) { img.src = user.picture; img.style.display = ''; }
    else { img.style.display = 'none'; }
    // Show usage section immediately, then pull latest values
    try { const wrap = qs('usageWrap'); if (wrap) { wrap.style.display = ''; const txt = qs('usageTxt'); if (txt) txt.textContent = 'Loading…'; } } catch {}
    // Pull usage info
    try {
      chrome.runtime.sendMessage({ type: 'usage:get' }, (res) => {
        const wrap = qs('usageWrap');
        if (!wrap) return;
        if (res && res.ok && res.usage) {
          // Generate usage
          wrap.style.display = '';
          const used = Number(res.usage.used||0);
          const limit = Number(res.usage.limit||100);
          const left = Math.max(0, limit - used);
          const pct = Math.max(0, Math.min(100, Math.round((used/Math.max(1,limit))*100)));
          const bar = qs('usageBar'); const txt = qs('usageTxt');
          if (bar) bar.style.width = pct + '%';
          if (txt) txt.textContent = `${used}/${limit} used (${left} left)`;
        } else {
          wrap.style.display = '';
          const bar = qs('usageBar'); const txt = qs('usageTxt');
          if (bar) bar.style.width = '0%';
          if (txt) txt.textContent = `0/100 used (100 left)`;
        }
      });
    } catch {}
  } else {
    out.style.display = '';
    inn.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const res = await getUser();
  render(res && res.user);
  // Configure buttons visibility based on Google Client presence
  try {
    const hasCid = await hasGoogleClientId();
    const btnGoogle = qs('btnLogin');
    if (btnGoogle) btnGoogle.style.display = hasCid ? '' : 'none';
  } catch {}
  qs('btnLogin').addEventListener('click', async () => {
    const r = await login();
    if (r && r.ok) render(r.user);
    else if (r && r.error) alert(r.error);
  });
  // Options button removed from popup per request
  qs('btnLogout').addEventListener('click', async () => {
    await logout();
    render(null);
  });
});
