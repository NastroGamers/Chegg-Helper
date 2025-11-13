// Background service worker: provider API calls and model listing

// --- Google Sign-in + Firebase (REST) helpers ---
// Uses chrome.identity.launchWebAuthFlow to obtain a Google OAuth token and
// then exchanges it for a Firebase ID using the Identity Toolkit REST API.
// We avoid chrome.identity.getAuthToken (which needs a Chrome App client id)
// to prevent the common 'bad client id' error. We only store the
// minimal profile and tokens in chrome.storage.local under key 'chxAuth'.

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDeSh92uM91OoO9SqWDWCLeM-LwVJqFIPQ",
  authDomain: "chegg-helper-19803.firebaseapp.com",
  projectId: "chegg-helper-19803",
};
const FIREBASE_REQUEST_URI = `https://${FIREBASE_CONFIG.authDomain}/__/auth/handler`;
// Default Google Web Client ID (can be overridden via Options)
// Default Google Web Client ID (overridable via Options)
const GOOGLE_WEB_CLIENT_ID = '50824092843-criee1avdbbag538ieujoqof5amuusc7.apps.googleusercontent.com';
// Previous baked-in default (used for migration)
const PREV_DEFAULT_GOOGLE_CLIENT_ID = '266597585561-dsg41046arcj63p4udrsmn73pidvoca3.apps.googleusercontent.com';

async function getStoredAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ chxAuth: null }, (res) => resolve(res.chxAuth || null));
  });
}

async function setStoredAuth(auth) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ chxAuth: auth }, resolve);
  });
}

async function clearStoredAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.remove('chxAuth', resolve);
  });
}

function broadcastAuthChanged(isAuthed, user) {
  try {
    chrome.tabs.query({}, (tabs) => {
      for (const t of tabs) {
        try { chrome.tabs.sendMessage(t.id, { type: 'auth:changed', isAuthed, user }); } catch {}
      }
    });
  } catch {}
}

async function getGoogleClientId() {
  const fromLocal = await new Promise((resolve) => {
    chrome.storage.local.get({ chx_google_client_id: '' }, (res) => resolve(res.chx_google_client_id || ''));
  });
  if (fromLocal) return fromLocal;
  const fromSync = await new Promise((resolve) => {
    chrome.storage.sync.get({ chx_google_client_id: '' }, (res) => resolve(res.chx_google_client_id || ''));
  });
  return fromSync || GOOGLE_WEB_CLIENT_ID;
}

function parseFragment(fragment) {
  const out = {};
  fragment.replace(/^#/, '').split('&').forEach(kv => {
    const [k, v] = kv.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return out;
}

function getRedirectUri() {
  // Creates https://<ext-id>.chromiumapp.org/<path>
  return chrome.identity.getRedirectURL('oauth2');
}

function isLikelyValidClientId(cid) {
  if (!cid) return false;
  if (/REPLACE_WITH/i.test(cid)) return false;
  return /^[A-Za-z0-9\-.]+\.apps\.googleusercontent\.com$/.test(cid);
}

function randomString(len = 24) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

async function launchGoogleOAuth() {
  const clientId = await getGoogleClientId();
  if (!isLikelyValidClientId(clientId)) {
    throw new Error('Google Web Client ID is not set. Open Options and paste your client ID.');
  }
  const redirectUri = getRedirectUri();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  // We only need an access_token; id_token would require a nonce and is unnecessary here.
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('prompt', 'consent');
  // Add optional state for CSRF protection (nonce is only valid when requesting id_token)
  authUrl.searchParams.set('state', randomString(8));

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!responseUrl) return reject(new Error('Empty OAuth response'));
      const u = new URL(responseUrl);
      const params = parseFragment(u.hash || '');
      if (!params.access_token) return reject(new Error('No access_token in OAuth response'));
      resolve({ accessToken: params.access_token, idToken: params.id_token, expiresIn: Number(params.expires_in || '3600') });
    });
  });
}

async function fetchGoogleUserInfo(accessToken) {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) throw new Error(`userinfo HTTP ${r.status}`);
  return r.json();
}

async function exchangeWithFirebase(accessToken) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`;
  const body = {
    postBody: `access_token=${encodeURIComponent(accessToken)}&providerId=google.com`,
    requestUri: FIREBASE_REQUEST_URI,
    returnIdpCredential: true,
    returnSecureToken: true,
  };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Firebase exchange failed: HTTP ${r.status} ${t}`);
  }
  return r.json();
}

async function getAccessTokenAudience(accessToken) {
  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    return j.audience || j.aud || j.issued_to || null;
  } catch { return null; }
}

async function doInteractiveLogin() {
  const { accessToken, idToken, expiresIn } = await launchGoogleOAuth();
  const g = await fetchGoogleUserInfo(accessToken);
  let f;
  try {
    f = await exchangeWithFirebase(accessToken);
  } catch (e) {
    const aud = await getAccessTokenAudience(accessToken);
    const configured = await getGoogleClientId();
    const hint = aud && configured && aud !== configured
      ? `Token audience (${aud}) does not match configured client (${configured}). Update Firebase Google provider Web client ID to ${aud} OR change the extension Options to use ${configured}.`
      : 'Ensure Firebase Google provider is enabled and configured with the same Web client ID you used for the Google OAuth flow.';
    const msg = `${e && e.message ? e.message : 'Firebase exchange failed'}. ${hint}`;
    const err = new Error(msg);
    throw err;
  }
  const expiresAt = Date.now() + (parseInt(f.expiresIn || '3600', 10) * 1000);
  const auth = {
    uid: f.localId,
    idToken: f.idToken,
    refreshToken: f.refreshToken,
    expiresAt,
    email: g.email,
    name: g.name || g.given_name || '',
    picture: g.picture || '',
    accessToken,
    provider: 'google',
  };
  await setStoredAuth(auth);
  broadcastAuthChanged(true, { email: auth.email, name: auth.name, picture: auth.picture });
  try { await reloadCheggTabs(); } catch {}
  try { await ensureUsageDoc(auth); } catch {}
  return auth;
}

async function doLogout() {
  try { chrome.identity.clearAllCachedAuthTokens(() => {}); } catch {}
  await clearStoredAuth();
  broadcastAuthChanged(false, null);
}

// Email/Password login directly against Firebase Auth (no Google Cloud OAuth).
async function loginWithPassword(email, password) {
  if (!email || !password) throw new Error('Email and password are required');
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  if (!r.ok) {
    const t = await safeText(r);
    throw new Error(`Firebase password login failed: HTTP ${r.status} ${t}`);
  }
  const j = await r.json();
  const expiresAt = Date.now() + (parseInt(j.expiresIn || '3600', 10) * 1000);
  const auth = {
    uid: j.localId,
    idToken: j.idToken,
    refreshToken: j.refreshToken,
    expiresAt,
    email: j.email || email,
    name: j.displayName || '',
    picture: '',
    accessToken: null,
    provider: 'password',
  };
  await setStoredAuth(auth);
  broadcastAuthChanged(true, { email: auth.email, name: auth.name, picture: auth.picture });
  try { await ensureUsageDoc(auth); } catch {}
  return auth;
}

// WARNING: Hardcoding API keys is insecure. Added only per request.
const DEFAULT_DEEPSEEK_KEY = "sk-04ce1ceec3fe459ea8c5971d90ba7ecb";
const DEFAULT_SYSTEM_PROMPT = "You are a helpful expert. Answer comprehensively in well-structured Markdown with clear section headings, bold key terms, and code blocks where relevant. Provide the final answer directly (not just a plan). Avoid nested \"Step N:\" labels inside sections; use subheadings instead.";

chrome.runtime.onInstalled.addListener(() => maybeSeedKeys());
chrome.runtime.onStartup.addListener(() => maybeSeedKeys());

// Prevent multiple concurrent Google sign-in flows
let loginInProgress = null; // Promise resolving to auth or throwing error
let loginWaiters = [];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      // --- Auth routing ---
      if (msg.type === 'usage:get') {
        try { const u = await getUsage(); sendResponse({ ok: true, usage: u }); }
        catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        return;
      }
      if (msg.type === 'user:saveDeepseekKey') {
        try {
          const auth = await getStoredAuth(); if (!auth) throw new Error('Not signed in');
          await ensureUsageDoc(auth);
          const fields = { deepseekKey: fvString(String(msg.key || '')) };
          const writes = [ { update: { name: userDocName(auth.uid), fields }, updateMask: { fieldPaths: ['deepseekKey'] }, currentDocument: { exists: true } } ];
          if (auth.email) writes.push({ update: { name: emailDocName(auth.email), fields }, updateMask: { fieldPaths: ['deepseekKey'] }, currentDocument: { exists: true } });
          await fsCommit(writes);
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message || e) });
        }
        return;
      }
      if (msg.type === 'auth:redirectInfo') {
        const clientId = await getGoogleClientId();
        const redirectUri = getRedirectUri();
        sendResponse({ ok: true, clientId, redirectUri });
        return;
      }
      if (msg.type === 'auth:get') {
        const auth = await getStoredAuth();
        sendResponse({ ok: true, user: auth ? { email: auth.email, name: auth.name, picture: auth.picture, uid: auth.uid } : null });
        return;
      }
      if (msg.type === 'auth:status') {
        const auth = await getStoredAuth();
        sendResponse({ ok: true, isAuthed: !!(auth && auth.idToken) });
        return;
      }
      if (msg.type === 'auth:login' || msg.type === 'auth:ensureInteractive') {
        // If a login flow is already in progress, queue this responder and reuse the result
        if (loginInProgress) {
          loginWaiters.push(sendResponse);
          return; // response will be delivered when the in-flight login finishes
        }
        // Start a single interactive login flow
        loginInProgress = (async () => {
          return await doInteractiveLogin();
        })();
        loginInProgress.then((auth) => {
          const payload = { ok: true, user: { email: auth.email, name: auth.name, picture: auth.picture, uid: auth.uid } };
          try { sendResponse(payload); } catch {}
          for (const waiter of loginWaiters.splice(0)) { try { waiter(payload); } catch {} }
        }).catch((e) => {
          const payload = { ok: false, error: String((e && e.message) || e) };
          try { sendResponse(payload); } catch {}
          for (const waiter of loginWaiters.splice(0)) { try { waiter(payload); } catch {} }
        }).finally(() => { loginInProgress = null; });
        return;
      }
      if (msg.type === 'auth:loginPassword') {
        try {
          const auth = await loginWithPassword(String(msg.email||'').trim(), String(msg.password||''));
          sendResponse({ ok: true, user: { email: auth.email, name: auth.name, picture: auth.picture, uid: auth.uid } });
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message || e) });
        }
        return;
      }
      if (msg.type === 'auth:logout') {
        await doLogout();
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'usage:spend') {
        try { const u = await spendUsage(); sendResponse({ ok: true, usage: u }); }
        catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        return;
      }
      if (msg.type === 'usageFmt:spend') {
        try { const u = await spendUsageFmt(); sendResponse({ ok: true, usage: u }); }
        catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
        return;
      }

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
        try { await spendUsage(); } catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); return; }
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
  if (fromSync) { deepseekKeyCache = fromSync; return fromSync; }
  // 3) Try Firestore user doc field deepseekKey
  try {
    const auth = await getStoredAuth();
    if (auth) {
      let doc = null;
      if (auth.email) doc = await fsGet(`usage_emails/${emailKey(auth.email)}`).catch(() => null);
      if (!doc && auth.uid) doc = await fsGet(`usage/${auth.uid}`).catch(() => null);
      const key = doc && doc.fields && doc.fields.deepseekKey && (doc.fields.deepseekKey.stringValue || '');
      if (key) {
        deepseekKeyCache = key;
        try { chrome.storage.sync.set({ deepseek_api_key: key }, () => {}); } catch {}
        return key;
      }
    }
  } catch {}
  // 4) Fallback default (may be disabled by provider)
  deepseekKeyCache = DEFAULT_DEEPSEEK_KEY || '';
  return deepseekKeyCache;
}

async function maybeSeedKeys() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ deepseek_api_key: '', chx_google_client_id: '' }, (res) => {
      const patch = {};
      if (!res.deepseek_api_key && DEFAULT_DEEPSEEK_KEY) patch.deepseek_api_key = DEFAULT_DEEPSEEK_KEY;
      const cid = (res.chx_google_client_id || '').trim();
      const needsCid = !cid || /REPLACE_WITH/i.test(cid) || cid === PREV_DEFAULT_GOOGLE_CLIENT_ID;
      if (needsCid && isLikelyValidClientId(GOOGLE_WEB_CLIENT_ID)) patch.chx_google_client_id = GOOGLE_WEB_CLIENT_ID;
      if (Object.keys(patch).length) chrome.storage.sync.set(patch, resolve);
      else resolve();
    });
  });
}

async function reloadCheggTabs() {
  try {
    const q = { url: ['https://expert.chegg.com/*'] };
    chrome.tabs.query(q, (tabs) => {
      for (const t of tabs) {
        try { chrome.tabs.reload(t.id); } catch {}
      }
    });
  } catch {}
}

// ---------------- Firestore helpers (REST via Secure Token access) ----------------
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

async function getGcpAccessToken() {
  const auth = await getStoredAuth();
  if (!auth || !auth.refreshToken) throw new Error('Not signed in');
  const url = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refreshToken }).toString();
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) throw new Error(`STS token HTTP ${r.status}`);
  const j = await r.json();
  return { accessToken: j.access_token, expiresIn: Number(j.expires_in || '3600') };
}

async function fsCommit(writes) {
  const { accessToken } = await getGcpAccessToken();
  const url = `${FS_BASE}:commit`;
  const r = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
  if (!r.ok) {
    const t = await safeText(r);
    throw new Error(`Firestore commit HTTP ${r.status}: ${t}`);
  }
  return r.json();
}

async function fsGet(relativePath) {
  const { accessToken } = await getGcpAccessToken();
  const url = `${FS_BASE}/${relativePath}`;
  const r = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore get HTTP ${r.status}`);
  return r.json();
}

function fvString(v) { return { stringValue: String(v || '') }; }
function fvInt(n) { return { integerValue: String(parseInt(n || 0, 10)) }; }

function userDocName(uid) { return `projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/usage/${uid}`; }
function emailKey(email = '') {
  try {
    const norm = String(email || '').trim().toLowerCase();
    const b64 = btoa(unescape(encodeURIComponent(norm)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
  } catch { return ''; }
}
function emailDocName(email) {
  const key = emailKey(email);
  return `projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/usage_emails/${key}`;
}

async function ensureUsageDoc(auth) {
  const uid = auth && auth.uid; if (!uid) return;
  const email = auth && auth.email || '';
  const writes = [];
  const fields = { email: fvString(email), used: fvInt(0), limit: fvInt(100), usedFmt: fvInt(0), limitFmt: fvInt(500) };
  const userDocPath = `usage/${uid}`;
  const emailDocPath = `usage_emails/${emailKey(email)}`;
  const userExists = await fsGet(userDocPath).catch(() => null);
  if (!userExists) {
    writes.push({ update: { name: userDocName(uid), fields }, currentDocument: { exists: false } });
  }
  const emailExists = email ? await fsGet(emailDocPath).catch(() => null) : true;
  if (email && !emailExists) {
    writes.push({ update: { name: emailDocName(email), fields }, currentDocument: { exists: false } });
  }
  if (writes.length) await fsCommit(writes);
}

async function getUsage() {
  const auth = await getStoredAuth();
  if (!auth) throw new Error('Not signed in');
  try {
    // Prefer email-based record, then uid
    const email = auth.email || '';
    const emailPath = email ? `usage_emails/${emailKey(email)}` : '';
    let doc = null;
    if (emailPath) doc = await fsGet(emailPath).catch(() => null);
    if (!doc) doc = await fsGet(`usage/${auth.uid}`).catch(() => null);
    if (!doc) { await ensureUsageDoc(auth); return { used: 0, limit: 100, usedFmt: 0, limitFmt: 500 }; }
    const f = doc.fields || {};
    const used = parseInt((f.used && (f.used.integerValue || f.used.doubleValue)) || '0', 10) || 0;
    const limit = parseInt((f.limit && (f.limit.integerValue || f.limit.doubleValue)) || '100', 10) || 100;
    const usedFmt = parseInt((f.usedFmt && (f.usedFmt.integerValue || f.usedFmt.doubleValue)) || '0', 10) || 0;
    const limitFmt = parseInt((f.limitFmt && (f.limitFmt.integerValue || f.limitFmt.doubleValue)) || '500', 10) || 500;
    return { used, limit, usedFmt, limitFmt };
  } catch (e) {
    // Fall back to local usage when Firestore not permitted
    const u = await getLocalUsage(auth.uid);
    if (u) return u;
    await ensureLocalUsageDoc(auth.uid, auth.email || '');
    return { used: 0, limit: 100, usedFmt: 0, limitFmt: 500 };
  }
}

async function spendUsage() {
  const auth = await getStoredAuth();
  if (!auth) throw new Error('Not signed in');
  const { used, limit } = await getUsage();
  if (used >= limit) throw new Error('Usage limit reached');
  const writes = [];
  writes.push({ transform: { document: userDocName(auth.uid), fieldTransforms: [ { fieldPath: 'used', increment: fvInt(1) } ] } });
  if (auth.email) {
    writes.push({ transform: { document: emailDocName(auth.email), fieldTransforms: [ { fieldPath: 'used', increment: fvInt(1) } ] } });
  }
  try {
    await fsCommit(writes);
    return { used: used + 1, limit };
  } catch (e) {
    // Fallback to local storage so generation is not blocked
    const curr = await getLocalUsage(auth.uid) || { used: used, limit, usedFmt: 0, limitFmt: 500 };
    const next = { used: used + 1, limit, usedFmt: curr.usedFmt || 0, limitFmt: curr.limitFmt || 500 };
    await setLocalUsage(auth.uid, next);
    return next;
  }
}

// Spend one format usage (limit 500)
async function spendUsageFmt() {
  const auth = await getStoredAuth();
  if (!auth) throw new Error('Not signed in');
  const { usedFmt, limitFmt, used, limit } = await getUsage();
  if (usedFmt >= limitFmt) throw new Error('Format usage limit reached');
  const writes = [];
  writes.push({ transform: { document: userDocName(auth.uid), fieldTransforms: [ { fieldPath: 'usedFmt', increment: fvInt(1) } ] } });
  if (auth.email) {
    writes.push({ transform: { document: emailDocName(auth.email), fieldTransforms: [ { fieldPath: 'usedFmt', increment: fvInt(1) } ] } });
  }
  try {
    await fsCommit(writes);
    return { used, limit, usedFmt: usedFmt + 1, limitFmt };
  } catch (e) {
    const curr = await getLocalUsage(auth.uid) || { used: used || 0, limit: limit || 100, usedFmt: usedFmt, limitFmt };
    const next = { used: curr.used || 0, limit: curr.limit || 100, usedFmt: (usedFmt + 1), limitFmt };
    await setLocalUsage(auth.uid, next);
    return next;
  }
}

// -------- Local usage fallback (chrome.storage.local) --------
async function getLocalUsageObj() {
  return new Promise((resolve) => {
    try { chrome.storage.local.get({ chx_usage: {} }, (res) => resolve(res.chx_usage || {})); } catch { resolve({}); }
  });
}
async function setLocalUsageObj(obj) {
  return new Promise((resolve) => {
    try { chrome.storage.local.set({ chx_usage: obj }, resolve); } catch { resolve(); }
  });
}
async function ensureLocalUsageDoc(uid, email) {
  const obj = await getLocalUsageObj();
  if (!obj[uid]) { obj[uid] = { used: 0, limit: 100, usedFmt: 0, limitFmt: 500, email: email || '' }; await setLocalUsageObj(obj); }
}
async function getLocalUsage(uid) {
  const obj = await getLocalUsageObj();
  if (obj && obj[uid]) return { used: obj[uid].used || 0, limit: obj[uid].limit || 100, usedFmt: obj[uid].usedFmt || 0, limitFmt: obj[uid].limitFmt || 500 };
  return null;
}
async function setLocalUsage(uid, data) {
  const obj = await getLocalUsageObj();
  obj[uid] = Object.assign({}, obj[uid] || {}, { used: data.used || 0, limit: data.limit || 100, usedFmt: data.usedFmt || 0, limitFmt: data.limitFmt || 500 });
  await setLocalUsageObj(obj);
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
