// Content script: injects UI next to Chegg's "Check Structure" button

(async function () {
  const ID_PROMPTS_BTN = 'chx-prompts-btn';
  const ID_ANSWER_BTN = 'chx-answer-btn';
  const SELECTOR_TARGET_BTN = 'button[data-test="check-structure"]';
  const MODAL_ID = 'chx-modal-root';
  // New: No-question helpers
  const NOQ_SELECTOR = '[data-test="no-question"]';
  const NOQ_BANNER_ID = 'chx-noq-banner';
  const STORAGE_KEYS = {
    autoRefreshEnabled: 'chx_auto_refresh_enabled',
    autoRefreshMs: 'chx_auto_refresh_ms',
    autoStartEnabled: 'chx_auto_start_enabled',
    autoRefreshTrusted: 'chx_auto_refresh_trusted',
    autoStartCooldownUntil: 'chx_auto_start_cooldown_until',
    soundEnabled: 'chx_sound_enabled',
  };
  const START_SOLVING_SELECTOR = 'button[data-test-id="answerButton"]';
  const ANSWER_PAGE = /:\/\/expert\.chegg\.com\/qna\/authoring\/answer/;
  let refreshTimer = null;
  let countdownTimer = null;
  let autoStartTimer = null;
  let autoStartTimerPeriod = 0;
  let autoClickedOnce = false;
  let chipKeepAliveTimer = null;
  let autoStartCooldownUntil = 0;
  let soundEnabledGlobal = false;
  // Allow auto-accept (Start Solving) only in a short window after an auto-refresh
  let autoReloadAllowUntil = 0;
  // High-frequency burst window after any navigation/refresh
  const START_BURST_WINDOW_MS = 10000;
  let startBurstAllowUntil = Date.now() + START_BURST_WINDOW_MS;
  let burstRafId = 0;

  // Initialize auto-accept window from previous reload marker
  try {
    const last = Number(sessionStorage.getItem('chx_last_auto_reload')) || 0;
    if (last) autoReloadAllowUntil = last + 30000; // 30s window after reload
  } catch {}

  // Prime settings cache early so auto-accept can fire without waiting for UI injection
  try {
    (async () => {
      try {
        const s = await getSettings();
        window.__chx_settings_cache = Object.assign({}, window.__chx_settings_cache || {}, {
          autoAcceptEnabled: !!(s.autoAcceptEnabled ?? s.autoStartEnabled),
          autoStartEnabled: !!s.autoStartEnabled,
          autoRefreshEnabled: !!s.autoRefreshEnabled,
          autoRefreshMs: Number(s.autoRefreshMs) || 60000,
          soundEnabled: !!s.soundEnabled,
        });
        soundEnabledGlobal = !!s.soundEnabled;
      } catch {}
    })();
  } catch {}

  function findHeaderMount() {
    const header = document.querySelector('header') || document.querySelector('body header');
    if (!header) return { container: document.body, afterEl: null };
    const nav = header.querySelector('nav') || header.querySelector('.sc-5332c1dc-0');
    const left = header.querySelector('.sc-9076964b-1') || header.querySelector('[class*="sc-9076964b-1"]');
    const walkme = (nav || header).querySelector('.walkme-launcher-container, .walkme-to-remove, [class*="walkme-launcher-container"]');
    // Prefer after HCV Help if present, otherwise within nav, then left cluster, then header
    if (walkme && walkme.parentNode) return { container: walkme.parentNode, afterEl: walkme };
    if (nav) return { container: nav, afterEl: null };
    if (left) return { container: left, afterEl: null };
    return { container: header, afterEl: null };
  }

  function stopAutoRefreshGlobal() {
    try { if (refreshTimer) clearTimeout(refreshTimer); } catch {}
    try { if (countdownTimer) clearInterval(countdownTimer); } catch {}
    refreshTimer = null; countdownTimer = null;
    const c = document.getElementById('chx-noq-countdown');
    if (c) c.textContent = '';
  }

  // Run injection once DOM is ready and also watch for SPA changes
  const observer = new MutationObserver(() => { tryInject(); tryInjectNoQuestionUI(); try { tryAutoClickStartSolving(); } catch {} });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => { tryInject(); tryInjectNoQuestionUI(); setupAutoStartObserver(); startChipKeepAlive(); attachSkipHooks(); try { tryAutoClickStartSolving(); } catch {}; kickBurstClicker(); });
  window.addEventListener('load', () => { tryInject(); tryInjectNoQuestionUI(); setupAutoStartObserver(); startChipKeepAlive(); attachSkipHooks(); try { tryAutoClickStartSolving(); } catch {}; kickBurstClicker(); });
  // In case we injected after DOMContentLoaded, kick burst clicking now
  kickBurstClicker();
  // Re-arm burst scanner on visibility/page show
  window.addEventListener('pageshow', () => { startBurstAllowUntil = Date.now() + START_BURST_WINDOW_MS; kickBurstClicker(); setupAutoStartObserver(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { startBurstAllowUntil = Date.now() + START_BURST_WINDOW_MS; kickBurstClicker(); setupAutoStartObserver(); } });

  function tryInject() {
    const target = document.querySelector(SELECTOR_TARGET_BTN);
    if (!target) return;
    const container = target.parentElement || target.closest('div');
    if (!container) return;
    if (document.getElementById(ID_PROMPTS_BTN)) return; // already added

    // Prompts button
    const promptsBtn = document.createElement('button');
    promptsBtn.id = ID_PROMPTS_BTN;
    promptsBtn.type = 'button';
    promptsBtn.className = 'chx-btn chx-btn-secondary';
    promptsBtn.textContent = 'Prompts';
    promptsBtn.addEventListener('click', openPromptModal);

    // Answer button
    const answerBtn = document.createElement('button');
    answerBtn.id = ID_ANSWER_BTN;
    answerBtn.type = 'button';
    answerBtn.className = 'chx-btn chx-btn-primary';
    answerBtn.textContent = 'Answer';
    answerBtn.addEventListener('click', openAnswerModal);

    // Format-only button (manual formatting of existing answer text)
    const formatOnlyBtn = document.createElement('button');
    formatOnlyBtn.id = 'chx-format-only-btn';
    formatOnlyBtn.type = 'button';
    formatOnlyBtn.className = 'chx-btn chx-btn-outline';
    formatOnlyBtn.textContent = 'Format Answer';
    formatOnlyBtn.title = 'Format existing answer text and paste';
    formatOnlyBtn.addEventListener('click', openFormatOnlyModal);

    // Guidelines Check button
    const guidelinesBtn = document.createElement('button');
    guidelinesBtn.id = 'chx-guidelines-btn';
    guidelinesBtn.type = 'button';
    guidelinesBtn.className = 'chx-btn chx-btn-outline';
    guidelinesBtn.textContent = 'Guidelines Check';
    guidelinesBtn.title = 'Analyze the visible question against Chegg guidelines';
    guidelinesBtn.addEventListener('click', openGuidelinesModal);

    // Place our buttons just to the left of the target
    container.appendChild(promptsBtn);
    container.appendChild(answerBtn);
    container.appendChild(formatOnlyBtn);
    container.appendChild(guidelinesBtn);
  }

  // ---------- Prompt Modal ----------
  async function openPromptModal() {
    const prompts = await getPrompts();
    const root = ensureModalRoot();
    root.innerHTML = '';
    const modal = document.createElement('div');
    modal.className = 'chx-modal';
    modal.innerHTML = `
      <div class="chx-modal__header">
        <div class="chx-modal__title">Prompts</div>
        <button class="chx-icon-btn" data-close>&times;</button>
      </div>
      <div class="chx-modal__body">
        <div class="chx-prompt-list" id="chx-prompt-list"></div>
        <div class="chx-row">
          <button class="chx-btn chx-btn-outline" id="chx-add-prompt">Add Prompt</button>
        </div>
      </div>
    `;
    root.appendChild(modal);
    root.classList.add('is-open');
    modal.querySelector('[data-close]').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => e.stopPropagation());
    root.addEventListener('click', closeModal);

    const list = modal.querySelector('#chx-prompt-list');
    renderPromptList(list, prompts);
    modal.querySelector('#chx-add-prompt').addEventListener('click', () => openCreatePromptForm());
  }

  function renderPromptList(listEl, prompts) {
    if (!prompts || prompts.length === 0) {
      listEl.innerHTML = '<div class="chx-empty">No prompts yet. Click "Add Prompt" below.</div>';
      return;
    }
    listEl.innerHTML = '';
    for (const p of prompts) {
      const item = document.createElement('div');
      item.className = 'chx-prompt-item';
      item.innerHTML = `
        <div class="chx-prompt-item__meta">
          <div class="chx-prompt-item__name">${escapeHtml(p.name)}</div>
        </div>
        <div class="chx-prompt-item__actions">
          <button class="chx-btn chx-btn-ghost" data-copy>Copy</button>
          <button class="chx-btn chx-btn-ghost" data-edit>Edit</button>
          <button class="chx-btn chx-btn-danger" data-del>Delete</button>
        </div>`;
      // Copy
      item.querySelector('[data-copy]').addEventListener('click', async () => {
        await copyToClipboard(p.text);
        toast('Prompt copied to clipboard');
      });
      // Edit
      item.querySelector('[data-edit]').addEventListener('click', () => openCreatePromptForm(p));
      // Delete
      item.querySelector('[data-del]').addEventListener('click', async () => {
        const ok = confirm(`Delete prompt "${p.name}"?`);
        if (!ok) return;
        const prompts = await getPrompts();
        const next = prompts.filter(x => x.id !== p.id);
        await setPrompts(next);
        renderPromptList(listEl, next);
        toast('Prompt deleted');
      });
      listEl.appendChild(item);
    }
  }

  async function openCreatePromptForm(existing) {
    const root = ensureModalRoot();
    root.innerHTML = '';
    const modal = document.createElement('div');
    modal.className = 'chx-modal';
    modal.innerHTML = `
      <div class="chx-modal__header">
        <div class="chx-modal__title">${existing ? 'Edit Prompt' : 'Create Prompt'}</div>
        <button class="chx-icon-btn" data-close>&times;</button>
      </div>
      <div class="chx-modal__body">
        <label class="chx-label">Prompt Name</label>
        <input class="chx-input" id="chx-prompt-name" placeholder="e.g., Structured Math Solution" value="${existing ? escapeAttr(existing.name) : ''}">
        <label class="chx-label">Prompt</label>
        <textarea class="chx-textarea" id="chx-prompt-text" rows="8" placeholder="Write your prompt here...">${existing ? escapeHtml(existing.text) : ''}</textarea>
        <div class="chx-row chx-right">
          <button class="chx-btn chx-btn-secondary" data-cancel>Cancel</button>
          <button class="chx-btn chx-btn-primary" id="chx-save-prompt">Save</button>
        </div>
      </div>`;
    root.appendChild(modal);
    root.classList.add('is-open');
    modal.querySelector('[data-close]').addEventListener('click', () => { try { stopAll(); } catch {} closeModal(); });
    modal.querySelector('[data-cancel]').addEventListener('click', () => { try { stopAll(); } catch {} closeModal(); });
    modal.addEventListener('click', (e) => e.stopPropagation());
    root.addEventListener('click', closeModal);

    modal.querySelector('#chx-save-prompt').addEventListener('click', async () => {
      const name = modal.querySelector('#chx-prompt-name').value.trim();
      const text = modal.querySelector('#chx-prompt-text').value.trim();
      if (!name || !text) {
        toast('Name and prompt required', true);
        return;
      }
      let prompts = await getPrompts();
      if (existing) {
        prompts = prompts.map(p => p.id === existing.id ? { ...p, name, text } : p);
      } else {
        prompts.push({ id: `p_${Date.now()}`, name, text, createdAt: Date.now() });
      }
      await setPrompts(prompts);
      toast('Prompt saved');
      openPromptModal();
    });
  }

  // ---------- Answer Modal ----------
  async function openAnswerModal() {
    const prompts = await getPrompts();
    const root = ensureModalRoot();
    root.innerHTML = '';
    const modal = document.createElement('div');
    modal.className = 'chx-modal chx-modal--lg';
    modal.innerHTML = `
      <div class="chx-modal__header">
        <div class="chx-modal__title">Generate Answer</div>
        <button class="chx-icon-btn" data-close>&times;</button>
      </div>
      <div class="chx-modal__body">
        <label class="chx-label">Your Text / Question</label>
        <textarea class="chx-textarea" id="chx-user-text" rows="8" placeholder="Paste the question or text here..."></textarea>

        <div class="chx-grid">
          <div>
            <label class="chx-label">Prompt</label>
            <select class="chx-select" id="chx-prompt-select">
              <option value="">None</option>
              ${prompts.map(p => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </div>
          <div style="grid-column: span 2;">
            <label class="chx-label">Models</label>
            <div class="chx-models-list" id="chx-models"></div>
          </div>
        </div>

        <div class="chx-bar">
          <div class="chx-tabs" id="chx-tabs"></div>
          <div class="chx-row chx-right">
            <button class="chx-btn chx-btn-secondary" data-cancel>Close</button>
            <button class="chx-btn chx-btn-outline" id="chx-refresh">Refresh</button>
            <button class="chx-btn chx-btn-outline" id="chx-copy">Copy</button>
            <button class="chx-btn chx-btn-outline" id="chx-format">Format Answer</button>
            <button class="chx-btn chx-btn-outline" id="chx-guidelines">Guidelines Check</button>
            <button class="chx-btn chx-btn-outline" id="chx-paste" style="display:none">Paste</button>
            <button class="chx-btn chx-btn-primary" id="chx-generate">Generate</button>
          </div>
        </div>
        <div id="chx-answer" class="chx-answer"></div>
      </div>`;
    root.appendChild(modal);
    root.classList.add('is-open');
    modal.querySelector('[data-close]').addEventListener('click', closeModal);
    modal.querySelector('[data-cancel]').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => e.stopPropagation());
    root.addEventListener('click', closeModal);

    const modelsSel = modal.querySelector('#chx-models');
    const answerBox = modal.querySelector('#chx-answer');
    const generateBtn = modal.querySelector('#chx-generate');
    const userTextEl = modal.querySelector('#chx-user-text');
    const promptSel = modal.querySelector('#chx-prompt-select');
    const copyBtnTop = modal.querySelector('#chx-copy');
    const formatBtn = modal.querySelector('#chx-format');
    const pasteBtnTop = modal.querySelector('#chx-paste');
    const guidelinesBtnTop = modal.querySelector('#chx-guidelines');
    const refreshBtn = modal.querySelector('#chx-refresh');
    const tabsEl = modal.querySelector('#chx-tabs');

    let allModels = [];
    async function loadModels() {
      modelsSel.innerHTML = '<div class="chx-empty">Loading…</div>';
      const res = await sendMsg({ type: 'listAllModels' });
      const list = (res && res.models) ? res.models : [];
      allModels = filterModelsForUI(list);
      modelsSel.innerHTML = allModels.map(m => modelRowHtml(m)).join('');
    }
    await loadModels();
    modelsSel.addEventListener('click', (e) => {
      const row = e.target.closest('.chx-model-row');
      if (!row) return;
      if (e.target.tagName.toLowerCase() === 'input') return; // native click
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb) { cb.checked = !cb.checked; }
    });

    let sessions = {}; // key -> { provider, port, buffer, streaming, paused }
    let activeKey = null;
    let raf = null;
    let lastUserInput = '';
    let lastSystemPrompt = '';

    function scheduleRender() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const buf = activeKey && sessions[activeKey] ? sessions[activeKey].buffer : '';
        answerBox.innerHTML = renderMarkdown(buf || '');
      });
    }

    function buildTabs() {
      tabsEl.innerHTML = '';
      const keys = Object.keys(sessions);
      for (const key of keys) {
        const s = sessions[key];
        const tab = document.createElement('button');
        tab.className = 'chx-tab' + (key === activeKey ? ' is-active' : '');
        tab.textContent = s.model;
        tab.addEventListener('click', () => { activeKey = key; scheduleRender(); buildTabs(); });
        tabsEl.appendChild(tab);
      }
    }

    function updateButtons() {
      const anyStreaming = Object.values(sessions).some(s => s.streaming);
      const anyPaused = Object.values(sessions).some(s => s.paused);
      if (anyStreaming) generateBtn.textContent = 'Pause';
      else if (anyPaused) generateBtn.textContent = 'Resume';
      else generateBtn.textContent = 'Generate';
    }

    function startSessions(models, system, user) {
      lastUserInput = user; lastSystemPrompt = system;
      sessions = {}; activeKey = null; answerBox.innerHTML = '';
      for (const m of models) {
        const key = m.provider + ':' + m.id;
        const port = chrome.runtime.connect({ name: 'chx-stream' });
        sessions[key] = { provider: m.provider, model: m.id, port, buffer: '', streaming: true, paused: false };
        if (!activeKey) activeKey = key;
        port.onMessage.addListener((msg) => {
          const s = sessions[key]; if (!s) return;
          if (msg.type === 'chunk') { s.buffer += msg.delta || ''; if (key === activeKey) scheduleRender(); }
          else if (msg.type === 'done') { s.streaming = false; updateButtons(); }
          else if (msg.type === 'error') { s.streaming = false; s.buffer += `\n\n[Error] ${msg.error || ''}`; if (key === activeKey) scheduleRender(); updateButtons(); }
        });
        const history = [ { role: 'user', content: user } ];
        port.postMessage({ type: 'generateStream', provider: m.provider, model: m.id, system, user, history });
      }
      buildTabs(); updateButtons(); scheduleRender();
    }

    function pauseAll() {
      for (const key of Object.keys(sessions)) {
        const s = sessions[key];
        if (s.streaming && s.port) { try { s.port.postMessage({ type: 'abort' }); } catch {} try { s.port.disconnect(); } catch {} s.streaming = false; s.paused = true; s.port = null; }
      }
      updateButtons();
    }

    function resumeAll() {
      for (const key of Object.keys(sessions)) {
        const s = sessions[key];
        if (s.paused && !s.streaming) {
          const port = chrome.runtime.connect({ name: 'chx-stream' });
          s.port = port; s.paused = false; s.streaming = true;
          port.onMessage.addListener((msg) => {
            const ss = sessions[key]; if (!ss) return;
            if (msg.type === 'chunk') { ss.buffer += msg.delta || ''; if (key === activeKey) scheduleRender(); }
            else if (msg.type === 'done') { ss.streaming = false; updateButtons(); }
            else if (msg.type === 'error') { ss.streaming = false; ss.buffer += `\n\n[Error] ${msg.error || ''}`; if (key === activeKey) scheduleRender(); updateButtons(); }
          });
          const history = [ { role: 'user', content: lastUserInput }, { role: 'assistant', content: s.buffer }, { role: 'user', content: 'Continue.' } ];
          port.postMessage({ type: 'generateStream', provider: s.provider, model: s.model, system: lastSystemPrompt, user: '', history });
        }
      }
      updateButtons();
    }

    function stopAll() {
      for (const key of Object.keys(sessions)) {
        const s = sessions[key];
        if (s.port) { try { s.port.postMessage({ type: 'abort' }); } catch {} try { s.port.disconnect(); } catch {} }
      }
      sessions = {}; activeKey = null; updateButtons(); answerBox.innerHTML = '';
      buildTabs();
    }

    function getSelectedModels() {
      const cbs = Array.from(modelsSel.querySelectorAll('input[type="checkbox"]:checked'));
      return cbs.map(cb => {
        const v = cb.value; const idx = v.indexOf(':');
        return { provider: v.slice(0, idx), id: v.slice(idx + 1) };
      });
    }

    generateBtn.addEventListener('click', async () => {
      const input = userTextEl.value.trim();
      const models = getSelectedModels();
      if (!models.length && !Object.keys(sessions).length) { toast('Select at least one model', true); return; }
      const anyStreaming = Object.values(sessions).some(s => s.streaming);
      const anyPaused = Object.values(sessions).some(s => s.paused) && !anyStreaming;
      const promptId = promptSel.value; const prompts = await getPrompts(); const sysPrompt = (prompts.find(p => p.id === promptId) || {}).text || '';
      if (anyStreaming) { pauseAll(); return; }
      if (anyPaused) { resumeAll(); return; }
      if (!input) { toast('Enter some text', true); return; }
      // Spend one usage for this click (counts once even if multiple models)
      try {
        const spend = await sendMsg({ type: 'usage:spend' });
        if (!spend || !spend.ok) { toast(spend && spend.error ? spend.error : 'Usage error', true); return; }
      } catch (e) { toast('Usage error', true); return; }
      startSessions(models, sysPrompt, input);
    });

    copyBtnTop.addEventListener('click', async () => {
      const s = activeKey && sessions[activeKey];
      const text = s ? s.buffer.trim() : '';
      if (text) { await copyToClipboard(text); toast('Answer copied'); } else { toast('Nothing to copy', true); }
    });

    refreshBtn.addEventListener('click', () => {
      stopAll(); answerBox.innerHTML = ''; userTextEl.value = ''; toast('Cleared');
    });

    // Formatting + Pasting pipeline
    let formattedPlan = null;
    if (formatBtn) {
      formatBtn.addEventListener('click', async () => {
        try {
          // Stop live streaming updates so preview is not overwritten
          pauseAll();
          if (raf) { try { cancelAnimationFrame(raf); } catch {} raf = null; }
        } catch {}
        const s = activeKey && sessions[activeKey];
        const ai = s ? (s.buffer || '').trim() : '';
        const manual = (userTextEl.value || '').trim();
        const text = ai || manual;
        if (!text) { toast('Enter text or generate first', true); return; }
        // Prefer AI splitter to identify unlimited steps; fallback to heuristics instantly
        let aiPlan = null;
        try { toast('Splitting steps with AI…'); aiPlan = await aiSplitSteps(text); } catch {}
        if (aiPlan && Array.isArray(aiPlan.steps) && aiPlan.steps.length) {
          formattedPlan = aiPlan;
        } else {
          formattedPlan = parseIntoSteps(text);
          formattedPlan.final = extractFinalAnswer(text, formattedPlan);
        }
        renderPlanSimple(formattedPlan, answerBox);
        pasteBtnTop.style.display = '';
        toast('Formatted. Review and click Paste');
      });
    }

    if (guidelinesBtnTop) {
      guidelinesBtnTop.addEventListener('click', () => openGuidelinesModal());
    }

    pasteBtnTop.addEventListener('click', async () => {
      const s = activeKey && sessions[activeKey];
      const fullText = s ? s.buffer.trim() : '';
      if (!formattedPlan || !formattedPlan.steps.length) { toast('Format first', true); return; }
      closeModal();
      await pasteStepsIntoChegg(formattedPlan, fullText);
    });
  }

  // ---------- Format-only Modal ----------
  async function openFormatOnlyModal() {
    const root = ensureModalRoot();
    root.innerHTML = '';
    const modal = document.createElement('div');
    modal.className = 'chx-modal chx-modal--lg';
    modal.innerHTML = `
      <div class="chx-modal__header">
        <div class="chx-modal__title">Format Answer</div>
        <button class="chx-icon-btn" data-close>&times;</button>
      </div>
      <div class="chx-modal__body">
        <label class="chx-label">Answer Text</label>
        <textarea class="chx-textarea" id="chx-user-text2" rows="10" placeholder="Paste the full answer here..."></textarea>

        <div class="chx-bar">
          <div></div>
          <div class="chx-row chx-right">
            <button class="chx-btn chx-btn-secondary" data-cancel>Close</button>
            <button class="chx-btn chx-btn-outline" id="chx-copy2">Copy</button>
            <button class="chx-btn chx-btn-outline" id="chx-format2">Format</button>
            <button class="chx-btn chx-btn-outline" id="chx-paste2" style="display:none">Paste</button>
          </div>
        </div>
        <div id="chx-answer2" class="chx-answer"></div>
      </div>`;
    root.appendChild(modal);
    root.classList.add('is-open');
    modal.querySelector('[data-close]').addEventListener('click', closeModal);
    modal.querySelector('[data-cancel]').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => e.stopPropagation());
    root.addEventListener('click', closeModal);

    const answerBox = modal.querySelector('#chx-answer2');
    const formatBtn = modal.querySelector('#chx-format2');
    const copyBtn = modal.querySelector('#chx-copy2');
    const pasteBtn = modal.querySelector('#chx-paste2');
    const userTextEl = modal.querySelector('#chx-user-text2');

    let formattedPlan = null;
    copyBtn.addEventListener('click', async () => {
      const text = userTextEl.value || '';
      if (!text.trim()) { toast('Nothing to copy', true); return; }
      await copyToClipboard(text);
      toast('Copied');
    });

    formatBtn.addEventListener('click', async () => {
      const text = (userTextEl.value || '').trim();
      if (!text) { toast('Enter text first', true); return; }
      // AI step split, fallback to heuristic
      let aiPlan = null;
      try { toast('Splitting steps with AI…'); aiPlan = await aiSplitSteps(text); } catch {}
      if (aiPlan && Array.isArray(aiPlan.steps) && aiPlan.steps.length) {
        formattedPlan = aiPlan;
      } else {
        formattedPlan = parseIntoSteps(text);
        formattedPlan.final = extractFinalAnswer(text, formattedPlan);
      }
      renderPlanSimple(formattedPlan, answerBox);
      pasteBtn.style.display = '';
      toast('Formatted. Review and click Paste');
    });

    pasteBtn.addEventListener('click', async () => {
      const fullText = (userTextEl.value || '').trim();
      if (!formattedPlan || !formattedPlan.steps.length) { toast('Format first', true); return; }
      closeModal();
      await pasteStepsIntoChegg(formattedPlan, fullText);
    });
  }

  // ---------- Utilities ----------
  function ensureModalRoot() {
    let root = document.getElementById(MODAL_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = MODAL_ID;
      root.className = 'chx-modal-root';
      document.body.appendChild(root);
    }
    return root;
  }

  // ---------- Guidelines Check ----------
  async function openGuidelinesModal() {
    const root = ensureModalRoot();
    root.innerHTML = '';
    const modal = document.createElement('div');
    modal.className = 'chx-modal chx-modal--lg';
    modal.innerHTML = `
      <div class="chx-modal__header">
        <div class="chx-modal__title">Guidelines Check</div>
        <button class="chx-icon-btn" data-close>&times;</button>
      </div>
      <div class="chx-modal__body">
        <div class="chx-bar">
          <div class="chx-row">
            <button class="chx-btn chx-btn-outline" id="chx-guidelines-addimg">Add Image(s)</button>
            <input type="file" id="chx-guidelines-files" accept="image/*" multiple style="display:none" />
          </div>
          <div class="chx-row chx-right">
            <button class="chx-btn chx-btn-secondary" data-close>Close</button>
            <button class="chx-btn chx-btn-outline" id="chx-guidelines-run">Analyze</button>
            <button class="chx-btn chx-btn-outline" id="chx-guidelines-copy">Copy</button>
          </div>
        </div>
        <div id="chx-guidelines-imgs" class="chx-answer"></div>
        <div id="chx-guidelines-out" class="chx-answer"></div>
      </div>`;
    root.appendChild(modal);
    root.classList.add('is-open');
    const out = modal.querySelector('#chx-guidelines-out');
    const runBtn = modal.querySelector('#chx-guidelines-run');
    const copyBtn = modal.querySelector('#chx-guidelines-copy');
    const addImgBtn = modal.querySelector('#chx-guidelines-addimg');
    const fileInput = modal.querySelector('#chx-guidelines-files');
    const imgsBox = modal.querySelector('#chx-guidelines-imgs');
    const closer = () => closeModal();
    modal.querySelector('[data-close]').addEventListener('click', closer);
    modal.addEventListener('click', (e) => e.stopPropagation());
    root.addEventListener('click', closer);

    const uploaded = [];

    function renderUploads() {
      if (!imgsBox) return;
      if (!uploaded.length) { imgsBox.innerHTML = ''; return; }
      imgsBox.innerHTML = `<div class="chx-answer__content">${uploaded.map((u,i)=>`<p><b>Upload ${i+1}:</b> ${escapeHtml(u.name)}${u.text?`<br/><em>${escapeHtml(u.text.slice(0,300))}</em>`:''}</p>`).join('')}</div>`;
    }

    async function addFiles(files) {
      if (!files || !files.length) return;
      for (const f of files) {
        try {
          const dataUrl = await fileToDataURL(f);
          const text = await ocrImageDataUrl(dataUrl);
          uploaded.push({ name: f.name, src: dataUrl, alt: f.name, text });
        } catch {}
      }
      renderUploads();
    }

    if (addImgBtn) addImgBtn.addEventListener('click', () => fileInput && fileInput.click());
    if (fileInput) fileInput.addEventListener('change', () => addFiles(fileInput.files));
    if (imgsBox) {
      imgsBox.addEventListener('dragover', (e)=>{ e.preventDefault(); imgsBox.classList.add('is-drag'); });
      imgsBox.addEventListener('dragleave', ()=> imgsBox.classList.remove('is-drag'));
      imgsBox.addEventListener('drop', (e)=>{ e.preventDefault(); imgsBox.classList.remove('is-drag'); addFiles(e.dataTransfer && e.dataTransfer.files); });
    }

    async function run() {
      out.innerHTML = '<div class="chx-empty">Analyzing…</div>';
      const q = await extractQuestionFromPage();
      if (uploaded.length) q.images = (q.images || []).concat(uploaded);
      const { system, user } = buildGuidelinesPrompt(q);
      try {
        const res = await sendMsg({ type: 'generate', provider: 'deepseek', model: 'deepseek-chat', system, user });
        const text = (res && res.text) ? res.text : (res && res.error ? `Error: ${res.error}` : 'No response');
        out.innerHTML = renderMarkdown(text);
      } catch (e) {
        out.innerHTML = `<div class="chx-empty">Failed: ${escapeHtml(e.message || String(e))}</div>`;
      }
    }
    runBtn.addEventListener('click', run);
    copyBtn.addEventListener('click', async () => {
      const html = out.innerHTML || '';
      const text = htmlText(html);
      await copyToClipboard(text);
      toast('Copied');
    });
    // auto-run
    run();
  }

  async function extractQuestionFromPage() {
    // Scope strictly to the Student question section
    const root = findStudentQuestionRoot() || document.querySelector('[data-test="question"]')
      || document.querySelector('.sc-bzyl94-1, .mathContainer, [aria-label="editorInput"]')
      || document.querySelector('.sc-f22aef55-3')
      || document.body;
    const text = root ? (getVisibleText(root) || '').trim() : '';
    const imgs = Array.from(root.querySelectorAll('img'))
      .filter(img => isVisible(img) && (img.src || img.alt) && (img.width >= 24 && img.height >= 24))
      .map(img => ({ el: img, src: img.src || '', alt: img.alt || '' }));
    const out = [];
    for (const im of imgs) {
      const t = await extractImageText(im.el);
      out.push({ src: im.src, alt: im.alt, text: t });
    }
    return { text, images: out };
  }

  function findStudentQuestionRoot() {
    // 1) Primary stable hook
    const q = document.querySelector('[data-test="question"]');
    if (q) return q;
    // 2) Look for a visible header that says "Student question" and then find the question container nearby
    const header = Array.from(document.querySelectorAll('.sc-b84f97c0-4, [data-test*="student" i], [class*="student" i]'))
      .find(n => /student\s*question/i.test((n.textContent || '').trim()));
    if (header) {
      const panel = header.closest('.sc-f22aef55-3') || header.parentElement || document;
      const within = panel.querySelector('[data-test="question"]')
        || panel.querySelector('.mathContainer, .renderer, [aria-label="editorInput"], .newQuestionRenderer-editor')
        || panel;
      return within;
    }
    // 3) Fallbacks around known containers
    return document.querySelector('.mathContainer, .renderer, [aria-label="editorInput"], .newQuestionRenderer-editor');
  }

  async function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = (e) => reject(e);
      r.readAsDataURL(file);
    });
  }

  async function ocrImageDataUrl(dataUrl) {
    try {
      if (!('TextDetector' in window)) return '';
      const det = new window.TextDetector();
      const img = new Image();
      img.decoding = 'async';
      img.src = dataUrl;
      await new Promise((res, rej) => { img.onload = () => res(); img.onerror = rej; });
      const results = await det.detect(img);
      if (Array.isArray(results) && results.length) {
        const lines = results.map(x => (x.rawValue || x.data || x.text || '').toString()).filter(Boolean);
        return Array.from(new Set(lines)).join(' ');
      }
      return '';
    } catch { return ''; }
  }

  async function extractImageText(img) {
    try {
      // 1) If a transcription toggle exists near the image, click it to reveal text
      const root = img.closest('[data-test="question"], .mathContainer, .sc-f22aef55-3') || document;
      const btn = (root.querySelector("button[aria-label*='Transcription' i], button:has(svg[aria-label*='Transcription' i])")
        || closestTextButton(img, /(view|show|open)\s+transcription/i));
      if (btn) { try { btn.click(); await delay(200); } catch {} }

      // 2) Read any visible transcription/caption blocks
      const block = findTranscriptionBlockNear(img);
      const cap = findCaptionNear(img);
      const tx1 = block ? getVisibleText(block).trim() : '';
      const tx2 = cap ? getVisibleText(cap).trim() : '';
      const txAlt = (img.alt || '').trim();
      const joined = [tx1, tx2, txAlt].filter(Boolean).join('\n').trim();
      if (joined) return joined;
      // 3) As a last resort, describe the image path so model can try to infer (no OCR locally)
      return `Image: ${img.src || '(no-src)'}${img.alt ? ` | alt: ${img.alt}` : ''}`;
    } catch { return img.alt || ''; }
  }

  function findTranscriptionBlockNear(img) {
    const root = img.closest('[data-test="question"], .mathContainer, .sc-f22aef55-3') || document;
    const candidates = [
      img.parentElement,
      img.closest('figure, .sc-sj7gtn-1, .renderer, .editor, .image, .attachment, .viewer'),
      ...Array.from(root.querySelectorAll('[data-test*="transcript" i], [data-test*="transcription" i], [id*="transcript" i], [class*="transcript" i], [class*="transcription" i]')),
    ].filter(Boolean);
    for (const el of candidates) {
      const block = el.querySelector && el.querySelector('[data-test*="transcript" i], [data-test*="transcription" i], .transcription, .transcript, [role="dialog"], [role="region"]');
      if (block && isVisible(block) && getVisibleText(block).trim().length > 10) return block;
    }
    return null;
  }

  function findCaptionNear(img) {
    const fig = img.closest('figure');
    if (fig) {
      const cap = fig.querySelector('figcaption, .caption, [data-test*="caption" i]');
      if (cap && isVisible(cap)) return cap;
    }
    const sib = img.nextElementSibling;
    if (sib && /caption|label|alt/i.test(sib.className || '') && isVisible(sib)) return sib;
    return null;
  }

  function closestTextButton(from, re) {
    const root = from.closest('[data-test="question"], .mathContainer, .sc-f22aef55-3') || document;
    const list = Array.from(root.querySelectorAll('button, [role="button"], a'));
    return list.find(b => re.test((b.textContent || '').trim()));
  }

  function getVisibleText(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => n.textContent && n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    });
    let out = '';
    while (walker.nextNode()) out += walker.currentNode.textContent + ' ';
    return out.replace(/\s+/g, ' ').trim();
  }

  function buildGuidelinesPrompt(q) {
    const system = [
      'You are an assistant that checks Chegg authoring guideline compliance for the student question content.',
      'Analyze only the student question text and related image transcriptions provided below (ignore other page chrome or links).',
      'Return a concise, structured report with clear reasons and the exact skip reason if applicable.',
      'Classify each rule as Pass/Fail with short justification.',
      'Rules to check:',
      '- Exam/Test/Quiz or explicitly graded current/future assignments: skip.',
      '- Proctored/exam software mentions (Proctorio/Honorlock/Respondus): skip.',
      '- External links/URLs or references to external material: skip.',
      '- Points/marks/grades, rubric/marking schemes, or academy/institution indicators implying graded work: skip as Spam/Points.',
      '- Vague/incomplete/blank question: skip as Incomplete.',
      '- Plagiarism risks: do not copy external content.',
      '- IMPORTANT: Pure images/screenshots alone are OK. Do NOT auto-fail because an image exists. Only fail image content if there is clear copyrighted branding/watermark/logo or explicit exam/proctoring evidence.',
      'If OK to solve: highlight any missing info and feasibility.',
      'Output sections: Summary; Violations; Completeness; Recommendation; Safe-to-Solve: Yes/No.',
    ].join('\n');
    const imgLines = (q.images || []).map((im, i) => {
      const t = (im.text || '').slice(0, 1200);
      return `${i + 1}. src=${im.src}${im.alt ? ` alt=${im.alt}` : ''}${t ? `\n   text: ${t}` : ''}`;
    });
    const user = [
      'Student Question Text:',
      q.text || '(none)',
      '',
      'Images (OCR or nearby text if any):',
      ...imgLines,
    ].join('\n');
    return { system, user };
  }

  function closeModal() {
    const root = document.getElementById(MODAL_ID);
    if (root) {
      root.classList.remove('is-open');
      root.innerHTML = '';
    }
  }

  // ======== No-question UI + Auto Refresh / Auto Start ========
  async function tryInjectNoQuestionUI() {
    // Only render on Chegg authoring answer page
    if (!ANSWER_PAGE.test(location.href)) {
      stopAutoRefreshGlobal();
      const ex = document.getElementById(NOQ_BANNER_ID);
      if (ex) ex.remove();
      return;
    }
    const noqPresent = !!document.querySelector(NOQ_SELECTOR);
    // Deduplicate any existing chips
    const dupChips = Array.from(document.querySelectorAll('#' + NOQ_BANNER_ID));
    if (dupChips.length > 1) dupChips.slice(1).forEach(n => n.remove());

    // Ensure a single chip exists in the header near HCV Help/Guide me
    let banner = document.getElementById(NOQ_BANNER_ID);
    if (!banner) {
      // Always mount as a fixed, centered control over the header bar
      const container = document.body;
      const afterEl = null;

      const settings = await getSettings();
      const { autoRefreshEnabled, autoRefreshMs } = settings;

      banner = document.createElement('div');
      banner.id = NOQ_BANNER_ID;
      banner.className = 'chx-noq-chip chx-noq-chip--fixedCenter chx-noq-chip--compact';
      banner.innerHTML = `
        <label class="chx-toggle">
          <input class="chx-toggle-input" type="checkbox" id="chx-noq-autorefresh">
          <span class="chx-toggle-label">Auto‑refresh</span>
        </label>
        <div class="chx-interval">
          <input type="number" id="chx-refresh-num" min="5" max="3600" step="1" />
          <span class="chx-select-wrap">
            <select id="chx-refresh-unit">
              <option value="sec">sec</option>
              <option value="min">min</option>
              <option value="hr">hour</option>
            </select>
          </span>
        </div>
        <span class="chx-chip-divider"></span>
        <label class="chx-toggle">
          <input class="chx-toggle-input" type="checkbox" id="chx-auto-accept">
          <span class="chx-toggle-label">Auto‑accept</span>
        </label>
        <span class="chx-chip-divider"></span>
        <button class="chx-btn" id="chx-guidelines-chip">Guidelines</button>
        <span class="chx-chip-divider"></span>
        <span id="chx-sound" class="chx-bell" title="Sound alerts">
          <svg class="chx-bell-svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path class="bell" fill="currentColor" d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 1 0-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2Z"/>
            <line class="slash" x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="chx-status-dot" title="Extension active"></span>
        <span class="chx-countdown" id="chx-noq-countdown"></span>`;

      if (afterEl && afterEl.parentNode) afterEl.parentNode.insertBefore(banner, afterEl.nextSibling);
      else if (container) container.appendChild(banner);
      else { document.body.appendChild(banner); }
      try { positionChipCentered(banner); } catch {}

      // Initialize controls
      const elAuto = banner.querySelector('#chx-noq-autorefresh');
      const elNum = banner.querySelector('#chx-refresh-num');
      const elUnit = banner.querySelector('#chx-refresh-unit');
      const countdown = banner.querySelector('#chx-noq-countdown');
      const elAutoAccept = banner.querySelector('#chx-auto-accept');
      const elBell = banner.querySelector('#chx-sound');
      const elGuide = banner.querySelector('#chx-guidelines-chip');

      elAuto.checked = !!autoRefreshEnabled;
      banner.classList.toggle('is-on', !!autoRefreshEnabled);
      const { value, unit } = msToValueUnit(autoRefreshMs || 60000);
      elNum.value = String(value);
      elUnit.value = unit;
      // init auto-accept state
      try {
        const s = await getSettings();
        if (elAutoAccept) elAutoAccept.checked = !!(s.autoAcceptEnabled ?? s.autoStartEnabled);
        // Prime runtime cache so auto-accept works after reload
        window.__chx_settings_cache = Object.assign({}, window.__chx_settings_cache || {}, {
          autoAcceptEnabled: !!(s.autoAcceptEnabled ?? s.autoStartEnabled),
          autoStartEnabled: !!s.autoStartEnabled,
          autoRefreshEnabled: !!s.autoRefreshEnabled,
          autoRefreshMs: Number(s.autoRefreshMs) || 60000,
          soundEnabled: !!s.soundEnabled,
        });
        soundEnabledGlobal = !!s.soundEnabled; setBellUI(soundEnabledGlobal);
      } catch {}

      elAuto.addEventListener('change', async () => {
        const enabled = elAuto.checked;
        // Direct enable/disable without confirmation popups
        await setSettings({ autoRefreshTrusted: true, autoRefreshEnabled: enabled });
        const fns = ensureBannerFns(banner);
        if (enabled) fns.startAutoRefresh(fns.getIntervalMsFromControls());
        else fns.stopAutoRefresh();
        banner.classList.toggle('is-on', enabled);
      });
      if (elGuide) {
        elGuide.addEventListener('click', () => { try { openGuidelinesModal(); } catch (e) { console.error(e); } });
      }
      if (elAutoAccept) {
        elAutoAccept.addEventListener('change', async () => {
          const enabled = elAutoAccept.checked;
          window.__chx_settings_cache = Object.assign({}, window.__chx_settings_cache || {}, { autoAcceptEnabled: enabled, autoStartEnabled: enabled });
          try { sessionStorage.setItem('chx_auto_accept_on', enabled ? '1' : '0'); } catch {}
          await setSettings({ autoAcceptEnabled: enabled, autoStartEnabled: enabled });
          // Start/stop watcher accordingly
          if (enabled) { if (!autoStartTimer) setupAutoStartObserver(); }
          else { if (autoStartTimer) { clearInterval(autoStartTimer); autoStartTimer = null; } }
        });
      }
      if (elBell) {
        elBell.addEventListener('click', async () => {
          soundEnabledGlobal = !soundEnabledGlobal;
          window.__chx_settings_cache = Object.assign({}, window.__chx_settings_cache || {}, { soundEnabled: soundEnabledGlobal });
          await setSettings({ soundEnabled: soundEnabledGlobal });
          setBellUI(soundEnabledGlobal);
        });
      }
      function onIntervalChange() {
        const ms = banner._chxFns.getIntervalMsFromControls();
        setSettings({ autoRefreshMs: ms });
        if (elAuto.checked) banner._chxFns.startAutoRefresh(ms);
        else banner._chxFns.stopAutoRefresh();
      }
      elNum.addEventListener('change', onIntervalChange);
      elNum.addEventListener('input', onIntervalChange);
      elUnit.addEventListener('change', onIntervalChange);

      // Helpers bound to this banner
      function getIntervalMsFromControls() {
        let v = parseInt(elNum.value, 10);
        if (isNaN(v)) v = 60;
        const clamped = Math.min(3600, Math.max(5, v));
        elNum.value = String(clamped);
        const u = elUnit.value;
        if (u === 'hr') return clamped * 60 * 60 * 1000;
        if (u === 'min') return clamped * 60 * 1000;
        return clamped * 1000; // sec
      }
      function startAutoRefresh(ms) {
        stopAutoRefresh();
        let remaining = ms;
        const render = () => { if (countdown) countdown.textContent = `Next refresh in ${fmtDur(remaining)}`; };
        render();
        countdownTimer = setInterval(() => { remaining -= 1000; if (remaining < 0) remaining = 0; render(); }, 1000);
        refreshTimer = setTimeout(() => { stopAutoRefresh(); location.reload(); }, ms);
      }
      function stopAutoRefresh() {
        if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        if (countdown) countdown.textContent = '';
      }
      banner._chxFns = { getIntervalMsFromControls, startAutoRefresh, stopAutoRefresh };
    }

    // Apply enabled/disabled state based on whether no-question is visible
    const elAuto = banner.querySelector('#chx-noq-autorefresh');
    const elNum = banner.querySelector('#chx-refresh-num');
    const elUnit = banner.querySelector('#chx-refresh-unit');
    // Ensure visible even if site toggles and keep centered within the header bar
    banner.style.display = 'inline-flex';
    banner.style.visibility = 'visible';
    try { positionChipCentered(banner); } catch {}
    const settingsNow = await getSettings();
    elAuto.disabled = false; elNum.disabled = false; elUnit.disabled = false;
    // Respect user's saved toggle on any page (including while solving)
    elAuto.checked = !!settingsNow.autoRefreshEnabled;
    if (elAuto.checked) {
      // Do not restart countdown if already running; let it tick down
      if (!refreshTimer && !countdownTimer) (ensureBannerFns(banner).startAutoRefresh)(settingsNow.autoRefreshMs);
    } else {
      ensureBannerFns(banner).stopAutoRefresh();
    }
    setupAutoStartObserver();
    attachStartSolvingHook();
  }

  async function setupAutoStartObserver() {
    // read setting
    const { autoAcceptEnabled, autoStartEnabled, autoStartCooldownUntil: cd } = await getSettings();
    autoStartCooldownUntil = Number(cd) || 0;
    const enabled = typeof autoAcceptEnabled === 'boolean' ? autoAcceptEnabled : !!autoStartEnabled;
    if (!enabled) { if (autoStartTimer) { clearInterval(autoStartTimer); autoStartTimer = null; autoStartTimerPeriod = 0; } return; }
    const inBurst = (autoReloadAllowUntil && Date.now() <= autoReloadAllowUntil) || (Date.now() <= startBurstAllowUntil);
    const period = inBurst ? 60 : 300;
    if (autoStartTimer && autoStartTimerPeriod === period) return;
    if (autoStartTimer) { clearInterval(autoStartTimer); autoStartTimer = null; }
    autoStartTimerPeriod = period;
    autoStartTimer = setInterval(() => {
      tryAutoClickStartSolving();
      // If the post-reload window expires, continue polling at a steady pace
      if (autoReloadAllowUntil && Date.now() > autoReloadAllowUntil) { autoReloadAllowUntil = 0; }
      if (startBurstAllowUntil && Date.now() > startBurstAllowUntil) { startBurstAllowUntil = 0; /* adjust cadence next tick */ }
    }, period);
  }

  function tryAutoClickStartSolving() {
    // Respect Auto-accept toggle (read from runtime cache or session marker)
    let aa = false;
    if (window.__chx_settings_cache && (typeof window.__chx_settings_cache.autoAcceptEnabled === 'boolean' || typeof window.__chx_settings_cache.autoStartEnabled === 'boolean')) {
      aa = !!(window.__chx_settings_cache.autoAcceptEnabled ?? window.__chx_settings_cache.autoStartEnabled);
    } else {
      try { aa = sessionStorage.getItem('chx_auto_accept_on') === '1'; } catch { aa = false; }
    }
    if (!aa) return false;
    // Click whenever enabled; prefer immediate response after refresh, but do not block otherwise
    // Strict: prefer official button
    let btn = document.querySelector(START_SOLVING_SELECTOR);
    // Fallback: any element containing the exact phrase
    if (!btn) {
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], a, span, div'));
      const el = candidates.find(n => /\bstart\s*solving\b/i.test(n.textContent || ''));
      btn = el ? (el.closest('button') || el.closest('[role="button"]') || el) : null;
    }
    if (!btn) return false;

    // Honor cooldown after a Skip/Release action
    if (Date.now() < autoStartCooldownUntil) return false;

    // Only on the intended page or if the button exists visibly elsewhere
    const onAnswerPage = ANSWER_PAGE.test(location.href);
    if (!onAnswerPage && !btn) return false;

    if (!isClickable(btn)) return false;
    if (autoClickedOnce) return false;

    try { btn.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch {}
    try {
      // Only mark as clicked if we can observe acceptance
      const ok = safeClickAndConfirm(btn);
      if (ok) { autoClickedOnce = true; onStartSolvingClicked(); }
    } catch {}
    return true;
  }

  function isClickable(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.pointerEvents !== 'none' && Number(style.opacity || '1') > 0.01;
    const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
    const text = (el.textContent || '').trim();
    const okText = /start\s*solving/i.test(text);
    const okBySelector = el.matches && el.matches(START_SOLVING_SELECTOR);
    return visible && !disabled && (okText || okBySelector);
  }

  function safeClick(el) {
    try {
      if (!el) return false;
      if (el.focus) el.focus();
      if (el.click) el.click();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    } catch { return false; }
  }

  function safeClickAndConfirm(btn) {
    const beforeHref = String(location.href);
    const okClick = safeClick(btn);
    if (!okClick) return false;
    // Observe short window for any acceptance signals
    const start = Date.now();
    while (Date.now() - start < 1200) {
      // 1) Navigated to answer page
      if (ANSWER_PAGE.test(location.href)) return true;
      // 2) Start button disappeared or became disabled
      const b = document.querySelector(START_SOLVING_SELECTOR);
      if (!b) return true;
      const disabled = b.disabled || b.getAttribute('aria-disabled') === 'true';
      if (disabled) return true;
      // 3) URL changed (SPA navigation)
      if (String(location.href) !== beforeHref) return true;
      // 4) Minor wait
      // eslint-disable-next-line no-empty
      try { /* spin */ } catch {}
    }
    return false;
  }

  function kickBurstClicker() {
    if (burstRafId) return;
    const loop = () => {
      burstRafId = 0;
      if (autoClickedOnce || (startBurstAllowUntil && Date.now() > startBurstAllowUntil)) return;
      try { tryAutoClickStartSolving(); } catch {}
      burstRafId = requestAnimationFrame(loop);
    };
    burstRafId = requestAnimationFrame(loop);
  }

  function attachStartSolvingHook() {
    let btn = document.querySelector(START_SOLVING_SELECTOR);
    if (!btn) {
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], a, span, div'));
      const el = candidates.find(n => /\bstart\s*solving\b/i.test(n.textContent || ''));
      btn = el ? (el.closest('button') || el.closest('[role="button"]') || el) : null;
    }
    if (!btn) return;
    if (!btn.dataset.chxStartHooked && /start\s*solving/i.test((btn.textContent||''))) {
      btn.dataset.chxStartHooked = '1';
      btn.addEventListener('click', onStartSolvingClicked, { once: true });
    }
  }

  function onStartSolvingClicked() {
    const banner = document.getElementById(NOQ_BANNER_ID);
    if (banner) {
      const elAuto = banner.querySelector('#chx-noq-autorefresh');
      const elNum = banner.querySelector('#chx-refresh-num');
      const elUnit = banner.querySelector('#chx-refresh-unit');
      if (elAuto) { elAuto.checked = false; }
    }
    // Persistently disable auto-refresh so it stays OFF until user manually re-enables
    try { setSettings({ autoRefreshEnabled: false }); } catch {}
    // Clear any auto-start cooldown once we accept
    autoStartCooldownUntil = 0; try { setSettings({ autoStartCooldownUntil: 0 }); } catch {}
    try { sessionStorage.removeItem('chx_last_auto_reload'); } catch {}
    autoReloadAllowUntil = 0;
    if (autoStartTimer) { clearInterval(autoStartTimer); autoStartTimer = null; }
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    // Play horn if enabled
    try { if (soundEnabledGlobal) playHorn(); } catch {}
    tryInjectNoQuestionUI();
  }

  function attachSkipHooks() {
    if (document.body.dataset.chxSkipHooked) return; // ensure once
    document.body.dataset.chxSkipHooked = '1';
    document.addEventListener('click', (e) => {
      const btn = (e.target && (e.target.closest('button, [role="button"], a')));
      if (!btn) return;
      const text = (btn.textContent || '').toLowerCase();
      const dt = (btn.getAttribute('data-test-id') || btn.getAttribute('data-test') || '').toLowerCase();
      if (/\bskip\b|\brelease\b|\bgive up\b|back to queue|cancel question/.test(text) || /skip|release/.test(dt)) {
        autoStartCooldownUntil = Date.now() + 60000; // 60s cooldown after skip/release
        try { setSettings({ autoStartCooldownUntil: autoStartCooldownUntil }); } catch {}
      }
    }, true);
  }

  function startChipKeepAlive() {
    if (chipKeepAliveTimer) return;
    chipKeepAliveTimer = setInterval(() => {
      try {
        // If banner missing or removed by SPA re-render, recreate/repair it
        const banner = document.getElementById(NOQ_BANNER_ID);
        if (!banner) {
          tryInjectNoQuestionUI();
        } else {
          // Keep state in sync (enable/disable based on no-question panel)
          tryInjectNoQuestionUI();
          try { positionChipCentered(banner); } catch {}
        }
      } catch {}
    }, 1500);
  }

  function positionChipCentered(banner) {
    const header = document.querySelector('header');
    const rect = header ? header.getBoundingClientRect() : { top: 0, height: 54 };
    const chipH = banner.offsetHeight || 28;
    // Slight additional upward nudge per request
    const y = Math.max(0, Math.round(rect.top + (rect.height - chipH) / 5 - 05));
    banner.style.top = y + 'px';
    banner.style.left = '50%';
    banner.style.transform = 'translateX(-50%)';
    banner.style.position = 'fixed';
    banner.style.zIndex = '2147483646';
  }

  function setBellUI(on) {
    const el = document.getElementById('chx-sound');
    if (!el) return;
    el.classList.toggle('is-on', !!on);
    el.classList.toggle('is-off', !on);
  }

  function ensureBannerFns(banner) {
    if (banner && banner._chxFns) return banner._chxFns;
    if (!banner) return {
      getIntervalMsFromControls: () => 60000,
      startAutoRefresh: () => {},
      stopAutoRefresh: () => stopAutoRefreshGlobal(),
    };
    const elNum = banner.querySelector('#chx-refresh-num');
    const elUnit = banner.querySelector('#chx-refresh-unit');
    const countdown = banner.querySelector('#chx-noq-countdown');
    function getIntervalMsFromControls() {
      let v = parseInt(elNum && elNum.value, 10);
      if (isNaN(v)) v = 60;
      const clamped = Math.min(3600, Math.max(5, v));
      if (elNum) elNum.value = String(clamped);
      const u = elUnit ? elUnit.value : 'sec';
      if (u === 'hr') return clamped * 60 * 60 * 1000;
      if (u === 'min') return clamped * 60 * 1000;
      return clamped * 1000;
    }
    function startAutoRefresh(ms) {
      stopAutoRefresh();
      let remaining = ms;
      const render = () => { if (countdown) countdown.textContent = `Next refresh in ${fmtDur(remaining)}`; };
      render();
      countdownTimer = setInterval(() => { remaining -= 1000; if (remaining < 0) remaining = 0; render(); }, 1000);
      refreshTimer = setTimeout(() => {
        stopAutoRefresh();
        try { sessionStorage.setItem('chx_last_auto_reload', String(Date.now())); } catch {}
        location.reload();
      }, ms);
    }
    function stopAutoRefresh() {
      if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
      if (countdown) countdown.textContent = '';
    }
    const fns = { getIntervalMsFromControls, startAutoRefresh, stopAutoRefresh };
    try { banner._chxFns = fns; } catch {}
    return fns;
  }

  function playHorn() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o1 = ctx.createOscillator();
    const g = ctx.createGain();
    o1.type = 'square';
    o1.frequency.setValueAtTime(520, ctx.currentTime);
    o1.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.45);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
    o1.connect(g).connect(ctx.destination);
    o1.start();
    o1.stop(ctx.currentTime + 0.6);
    // Close context after sound to free resources
    setTimeout(() => { try { ctx.close(); } catch {} }, 700);
  }

  function fmtDur(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s >= 3600) { const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return `${h}h ${m}m`; }
    if (s >= 60) { const m = Math.floor(s/60); const r = s%60; return `${m}m ${r}s`; }
    return `${s}s`;
  }

  function msToValueUnit(ms) {
    if (!ms || ms < 1000) return { value: 60, unit: 'sec' };
    if (ms % (3600*1000) === 0) return { value: Math.floor(ms / (3600*1000)), unit: 'hr' };
    if (ms >= 60*1000) return { value: Math.floor(ms / (60*1000)), unit: 'min' };
    return { value: Math.floor(ms / 1000), unit: 'sec' };
  }

  function getSettings() {
    const defaults = {
      [STORAGE_KEYS.autoRefreshEnabled]: false,
      [STORAGE_KEYS.autoRefreshMs]: 60000,
      [STORAGE_KEYS.autoStartEnabled]: false,
      chx_auto_accept_enabled: false,
      [STORAGE_KEYS.soundEnabled]: false,
      [STORAGE_KEYS.autoRefreshTrusted]: false,
      [STORAGE_KEYS.autoStartCooldownUntil]: 0,
    };
    return new Promise(resolve => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync && chrome.storage.sync.get) {
          let settled = false;
          const cache = window.__chx_settings_cache || {};
          const fallback = {
            autoRefreshEnabled: !!cache.autoRefreshEnabled,
            autoRefreshMs: Number(cache.autoRefreshMs) || defaults[STORAGE_KEYS.autoRefreshMs],
            autoStartEnabled: typeof cache.autoStartEnabled === 'boolean' ? cache.autoStartEnabled : defaults[STORAGE_KEYS.autoStartEnabled],
            autoRefreshTrusted: !!cache.autoRefreshTrusted,
            autoStartCooldownUntil: Number(cache.autoStartCooldownUntil) || 0,
          };
          const watchdog = setTimeout(() => { if (!settled) { settled = true; resolve(fallback); } }, 600);
          chrome.storage.sync.get(defaults, (res) => {
            if (settled) return; settled = true; clearTimeout(watchdog);
            const out = {
              autoRefreshEnabled: !!res[STORAGE_KEYS.autoRefreshEnabled],
              autoRefreshMs: Number(res[STORAGE_KEYS.autoRefreshMs]) || 60000,
              autoStartEnabled: !!res[STORAGE_KEYS.autoStartEnabled],
              autoAcceptEnabled: typeof res.chx_auto_accept_enabled === 'boolean' ? res.chx_auto_accept_enabled : !!res[STORAGE_KEYS.autoStartEnabled],
              soundEnabled: !!res[STORAGE_KEYS.soundEnabled],
              autoRefreshTrusted: !!res[STORAGE_KEYS.autoRefreshTrusted],
              autoStartCooldownUntil: Number(res[STORAGE_KEYS.autoStartCooldownUntil]) || 0,
            };
            if (window.__chx_settings_cache) Object.assign(out, window.__chx_settings_cache);
            resolve(out);
          });
          return;
        }
      } catch (e) {
        // Extension context may be invalidated; fall through to fallback
      }
      // Fallback to in-memory cache
      const cache = window.__chx_settings_cache || {};
      resolve({
        autoRefreshEnabled: !!cache.autoRefreshEnabled,
        autoRefreshMs: Number(cache.autoRefreshMs) || defaults[STORAGE_KEYS.autoRefreshMs],
        autoStartEnabled: typeof cache.autoStartEnabled === 'boolean' ? cache.autoStartEnabled : defaults[STORAGE_KEYS.autoStartEnabled],
        autoAcceptEnabled: typeof cache.autoAcceptEnabled === 'boolean' ? cache.autoAcceptEnabled : (typeof cache.autoStartEnabled === 'boolean' ? cache.autoStartEnabled : defaults.chx_auto_accept_enabled),
        soundEnabled: typeof cache.soundEnabled === 'boolean' ? cache.soundEnabled : defaults[STORAGE_KEYS.soundEnabled],
        autoRefreshTrusted: !!cache.autoRefreshTrusted,
        autoStartCooldownUntil: Number(cache.autoStartCooldownUntil) || 0,
      });
    });
  }

  function setSettings(partial) {
    // Update volatile cache immediately
    window.__chx_settings_cache = Object.assign({}, window.__chx_settings_cache || {}, partial);
    const payload = {};
    if ('autoRefreshEnabled' in partial) payload[STORAGE_KEYS.autoRefreshEnabled] = !!partial.autoRefreshEnabled;
    if ('autoRefreshMs' in partial) payload[STORAGE_KEYS.autoRefreshMs] = Number(partial.autoRefreshMs) || 60000;
    if ('autoStartEnabled' in partial) payload[STORAGE_KEYS.autoStartEnabled] = !!partial.autoStartEnabled;
    if ('autoAcceptEnabled' in partial) { payload['chx_auto_accept_enabled'] = !!partial.autoAcceptEnabled; }
    if ('soundEnabled' in partial) payload[STORAGE_KEYS.soundEnabled] = !!partial.soundEnabled;
    if ('autoRefreshTrusted' in partial) payload[STORAGE_KEYS.autoRefreshTrusted] = !!partial.autoRefreshTrusted;
    if ('autoStartCooldownUntil' in partial) payload[STORAGE_KEYS.autoStartCooldownUntil] = Number(partial.autoStartCooldownUntil) || 0;
    return new Promise(resolve => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync && chrome.storage.sync.set) {
          let settled = false;
          const watchdog = setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 600);
          chrome.storage.sync.set(payload, () => { if (!settled) { settled = true; clearTimeout(watchdog); resolve(); } });
          return;
        }
      } catch (e) {
        // fallthrough
      }
      resolve();
    });
  }

  function toast(msg, isError) {
    const div = document.createElement('div');
    div.className = 'chx-toast' + (isError ? ' chx-toast--err' : '');
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.classList.add('show'), 10);
    setTimeout(() => { div.classList.remove('show'); div.remove(); }, 2500);
  }

  function sendMsg(payload) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(payload, resolve);
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  }

  function getPrompts() {
    return new Promise(resolve => {
      chrome.storage.sync.get({ chx_prompts: [] }, (res) => resolve(res.chx_prompts || []));
    });
  }

  function setPrompts(prompts) {
    return new Promise(resolve => {
      chrome.storage.sync.set({ chx_prompts: prompts }, resolve);
    });
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
  }

  function escapeHtml(str = '') {
    return str.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function escapeAttr(str = '') { return escapeHtml(str).replace(/'/g, '&#39;'); }

  function fallbackModels(provider) {
    return ['deepseek-chat', 'deepseek-reasoner'];
  }

  function keyMissingHtml(provider) {
    return `<div class="chx-empty">${escapeHtml(provider)} API key not set. <button class="chx-btn chx-btn-outline" id="chx-open-options">Open Options</button></div>`;
  }

  function attachOptionsLink() {
    const btn = document.getElementById('chx-open-options');
    if (btn) btn.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    });
  }

  // ---------- AI splitter (steps + explanation only) ----------
  async function aiSplitSteps(text, opts) {
    const src = String(text || '').trim();
    if (!src) return null;
    const timeoutMs = (opts && opts.timeoutMs) || 8000;
    const system = [
      'You split an existing answer into steps for Chegg authoring. Output strictly JSON only.',
      '{"steps":[{"matter":"...","explanation":"..."}],"final":"..."}',
      'Rules:',
      '- Do NOT rewrite content. Only cut and group existing text.',
      '- Preserve LaTeX math markers (\\[...\\], \\(...\\)).',
      '- Each step must have two fields: matter (main content for the step) and explanation (reasoning for that step). Use empty string if not present.',
      '- Determine the natural step boundaries from headings like Step N, Given, Formulas, Calculation, or paragraphs.',
      '- Include a "final" field with only the Final Answer text if present; otherwise empty string.',
      '- Return ONLY valid minified JSON (no markdown, no commentary).'
    ].join('\n');
    const user = src;
    try {
      const req = sendMsg({ type: 'generate', provider: 'deepseek', model: 'deepseek-chat', system, user });
      const to = new Promise(resolve => setTimeout(() => resolve({ ok: false, error: 'timeout' }), timeoutMs));
      const res = await Promise.race([req, to]);
      if (!res || !res.ok || !res.text) return null;
      const j = parseAiStepsResponse(res.text);
      if (j && Array.isArray(j.steps)) {
        const plan = { steps: [], final: String(j.final || '') };
        for (const s of j.steps) {
          plan.steps.push({ matter: String(s.matter || ''), explanation: String(s.explanation || '') });
        }
        return plan;
      }
      return null;
    } catch { return null; }
  }

  function parseAiStepsResponse(rawText) {
    try {
      let t = String(rawText || '').trim();
      const fence = t.match(/```json\s*([\s\S]*?)```/i) || t.match(/```\s*([\s\S]*?)```/i);
      if (fence) t = fence[1].trim();
      // If multiple characters around JSON, try to extract the first top-level JSON object
      const obj = extractFirstJsonObject(t);
      if (obj) return JSON.parse(obj);
      return JSON.parse(t);
    } catch { return null; }
  }

  function extractFirstJsonObject(s) {
    const str = String(s || '');
    let start = str.indexOf('{');
    while (start !== -1) {
      let depth = 0; let inStr = false; let esc = false;
      for (let i = start; i < str.length; i++) {
        const ch = str[i];
        if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; }
        else {
          if (ch === '"') inStr = true;
          else if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) return str.slice(start, i + 1); }
        }
      }
      start = str.indexOf('{', start + 1);
    }
    return null;
  }

  // Lightweight math-ish detector to skip unnecessary AI calls
  function looksMathish(s) {
    if (!s) return false;
    const t = String(s);
    return /\d|[=+\-×x*/·÷^%]|\\\\|\$|\\\(|\\\)|\\\[|\\\]|\\[a-zA-Z]+/.test(t);
  }

  // Detect chemistry-like content (molecular formulas, reactions, states)
  function looksChemistry(s) {
    if (!s) return false;
    const t = String(s);
    // Reaction arrows or state symbols strongly indicate chemistry
    if (/(?:->|→|⇌|↔)/.test(t)) return true;
    if (/\((?:aq|s|l|g)\)/i.test(t)) return true;
    // Count element tokens like H2, Na, Cl2, CH3 etc.
    const tokenRe = /\b([A-Z][a-z]?)(?:\d{0,3})\b/g;
    let c = 0; let m;
    while ((m = tokenRe.exec(t)) !== null) { c++; if (c >= 2) return true; }
    // Latex form like \text{H}_2\text{O}
    if (/\\text\{[A-Za-z]+\}/.test(t)) {
      const plain = t.replace(/\\text\{([^}]*)\}/g, '$1');
      let cc = 0; let mm;
      tokenRe.lastIndex = 0;
      while ((mm = tokenRe.exec(plain)) !== null) { cc++; if (cc >= 2) return true; }
    }
    return false;
  }

  // Simple modal busy overlay
  function showModalBusy(modal, label) {
    try {
      if (!modal) return;
      try { if (!/relative|absolute|fixed|sticky/i.test(modal.style.position || '')) modal.style.position = 'relative'; } catch {}
      let mask = modal.querySelector('#chx-busy-mask');
      if (!mask) {
        mask = document.createElement('div');
        mask.id = 'chx-busy-mask';
        mask.setAttribute('role', 'status');
        mask.style.cssText = 'position:absolute;inset:0;background:rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px 16px;box-shadow:0 2px 8px rgba(0,0,0,0.08);font:13px/1.4 system-ui,Segoe UI,Arial';
        const text = document.createElement('div'); text.className = 'chx-busy-text'; text.textContent = label || 'Formatting… Please wait';
        box.appendChild(text); mask.appendChild(box); modal.appendChild(mask);
      } else {
        const t = mask.querySelector('.chx-busy-text'); if (t) t.textContent = label || 'Formatting… Please wait';
        mask.style.display = 'flex';
      }
    } catch {}
  }
  function hideModalBusy(modal) {
    try { const mask = modal && modal.querySelector('#chx-busy-mask'); if (mask) mask.style.display = 'none'; } catch {}
  }

  // Ask DeepSeek to annotate tool usage with explicit markers [[X2]]...[[/X2]] and [[H2]]...[[/H2]]
  async function aiAnnotateMathTools(text, opts) {
    const src = String(text || '').trim();
    if (!src) return src;
    try {
      const timeoutMs = (opts && opts.timeoutMs) || 6000;
      const system = [
        'You annotate math/text lines with tool markers for a Chegg editor.',
        'Rules:',
        '- Use [[X2]]...[[/X2]] around pure calculation fragments only (numbers, operators, %, simple fractions like (a)/(b) or a/b).',
        '- Use [[H2]]...[[/H2]] around formula fragments when the line also contains words/units (text + formula).',
        '- Prefer X2 for fractions and percentages even if mixed with text.',
        '- Do NOT wrap whole lines if only part is formula; wrap only the formula part.',
        '- For display TeX blocks [\\[ ... \\]] or $$ ... $$ leave them as-is (no markers).',
        '- Return ONLY the original text with markers inserted. No extra commentary or formatting.',
      ].join('\n');
      const user = src;
      const req = sendMsg({ type: 'generate', provider: 'deepseek', model: 'deepseek-chat', system, user });
      const to = new Promise(resolve => setTimeout(() => resolve({ ok: false, error: 'timeout' }), timeoutMs));
      const res = await Promise.race([req, to]);
      if (res && res.ok && res.text) {
        const out = String(res.text || '').trim();
        // Basic safety: ensure it’s not a markdown code block or explanation
        const cleaned = out.replace(/^```[\s\S]*?```\s*$/g, '').trim();
        // Only use if it contains at least one marker, otherwise keep original
        if (/\[\[(?:X2|H2)\]\]/i.test(cleaned)) return cleaned;
      }
    } catch {}
    return src;
  }

  // Annotate all plan sections concurrently with a modest limit
  async function annotatePlanSections(plan) {
    if (!plan || !Array.isArray(plan.steps)) return plan;
    const tasks = [];
    for (const step of plan.steps) {
      if (step.matter && looksMathish(step.matter)) {
        tasks.push((async () => { step.matterAnnotated = await aiAnnotateMathTools(step.matter); })());
      }
      if (step.explanation && looksMathish(step.explanation)) {
        tasks.push((async () => { step.explanationAnnotated = await aiAnnotateMathTools(step.explanation); })());
      }
    }
    if (plan.final && looksMathish(plan.final)) {
      tasks.push((async () => { plan.finalAnnotated = await aiAnnotateMathTools(plan.final); })());
    }
    // Run all; if any fail they simply won’t set annotations
    try { await Promise.all(tasks); } catch {}
    return plan;
  }

  function parseIntoSteps(text) {
    const clean = text.replace(/\r/g, '').trim();
    // First, separate out Final Answer/Summary so it doesn't leak into step blocks
    const sf = splitFinalFromText(clean);
    let body = sf.body;
    // Drop a single leading mini-title/header before Step 1 if present (DeepSeek sometimes adds this)
    body = dropLeadingMiniTitle(body);
    // Prefer strict splitting by explicit "Step N" headings
    let steps = parseByStepHeadings(body);
    if (!steps.length) {
      // Fallback: split by H2 headings
      const parts = splitByPattern(body, /(^|\n)##\s+[^\n]+\n/);
      steps = parts.map(part => splitMatterExplanation(part));
    }
    if (!steps.length) {
      // Heuristic final fallback
      steps = heuristicChunk(body).map(part => splitMatterExplanation(part));
    }
    return { steps, final: sf.final };
  }

  function parseByStepHeadings(text) {
    // Match lines like:
    // Step 1: Title
    // **Step 2: Title**
    // ### Step 3 – Title
    // Normalize patterns like "Step1" -> "Step 1" for easier matching
    const normalized = text.replace(/\b(Step|STEP)\s*(?=\d)/g, '$1 ');
    const re = /(\n|^)\s*(?:\*{0,3}\s*)?(?:#{1,6}\s*)?(?:>\s*)?(?:Step|STEP)\s*(?:[-#:\.]?\s*)?\(?\s*(\d{1,3})\s*\)?(?:\s*(?:of|\/|\\)\s*\d+)?\s*(?:[:\-–—\.]|\))?[^\n]*\n/g;
    const matches = [];
    let m;
    while ((m = re.exec(normalized)) !== null) {
      const idx = m.index + (m[1] ? m[1].length : 0);
      // Heuristic: ignore nested "Step N:" inside Calculation/Step-by-Step sections
      const ctx = normalized.slice(Math.max(0, idx - 220), idx).toLowerCase();
      const nested = /(calculation|step\-?by\-?step|procedure|workflow|given\s*:?)\s*$/i.test(ctx);
      if (nested) continue;
      matches.push({ idx, num: parseInt(m[2], 10) });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (!matches.length) return [];
    // Build raw blocks between matches, and preserve the Step title text as the first line
    const raw = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].idx;
      const end = i + 1 < matches.length ? matches[i + 1].idx : normalized.length;
      const blockWhole = normalized.slice(start, end);
      const nl = blockWhole.indexOf('\n');
      const headerLine = nl !== -1 ? blockWhole.slice(0, nl) : blockWhole;
      const bodyPart = nl !== -1 ? blockWhole.slice(nl + 1) : '';
      // Clean markdown adornments then take the trailing title after "Step <n>"
      const headerClean = headerLine.replace(/^\s*(?:\*{0,3}\s*)?(?:#{1,6}\s*)?(?:>\s*)?/, '');
      const mt = headerClean.match(/^(?:Step|STEP)\s*(?:[-#:\.]?\s*)?\(?\s*\d{1,3}\s*\)?(?:\s*(?:of|\/|\\)\s*\d+)?\s*(?:[:\-–—\.]|\))?\s*(.*)$/);
      const stepTitle = mt && mt[1] ? mt[1].trim() : '';
      let block = (bodyPart || '').trim();
      if (stepTitle) block = stepTitle + (block ? '\n\n' + block : '');
      raw.push({ num: matches[i].num, content: block.trim() });
    }
    // Capture preamble (content before first step); merge into Step 1 if present
    const preStart = 0;
    const firstIdx = matches[0].idx;
    const preamble = normalized.slice(preStart, firstIdx).trim();
    // Merge blocks by step number (handle duplicates)
    const byNum = new Map();
    for (const r of raw) {
      const key = r.num;
      byNum.set(key, (byNum.get(key) || '') + (byNum.has(key) ? '\n\n' : '') + r.content);
    }
    if (preamble) {
      if (byNum.has(1)) byNum.set(1, preamble + '\n\n' + byNum.get(1));
      else byNum.set(1, preamble);
    }
    // Keep all detected steps as-is (no folding), to support unlimited steps
    const orderedNums = Array.from(byNum.keys()).sort((a,b)=>a-b);
    // Convert to sorted blocks by step number (after folding extras)
    const orderedFinal = Array.from(byNum.keys()).sort((a,b)=>a-b);
    const blocks = orderedFinal.map(n => splitMatterExplanation(byNum.get(n)));
    return blocks;
  }

  function splitMatterExplanation(block) {
    const s = String(block || '').trim();
    if (!s) return { matter: '', explanation: '' };
    // Look for explicit Explanation-like section headers (allow optional markdown/blockquote prefixes)
    const expRe = /(^|\n)\s*(?:\*\*\s*)?(?:#{1,4}\s*)?(?:>\s*)?(?:Explanation\s*Block|Explanation|Reasoning|Approach|Method|Working|Analysis|Discussion|Elaboration|Explain(?:ation)?|Notes?)\s*(?:[:\-–—\.]|)?\s*(?:\*\*)?\s*/i;
    const m = expRe.exec(s);
    if (m) {
      const matter = s.slice(0, m.index).trim();
      const explanation = s.slice(m.index + m[0].length).trim();
      return { matter, explanation };
    }
    // Fallback split on first blank line
    const sep = s.indexOf('\n\n');
    if (sep !== -1) return { matter: s.slice(0, sep).trim(), explanation: s.slice(sep + 2).trim() };
    return { matter: s, explanation: '' };
  }

  function splitByPattern(text, re) {
    const indices = [];
    let m;
    const rx = new RegExp(re.source, re.flags + (re.flags.includes('g') ? '' : 'g'));
    while ((m = rx.exec(text)) !== null) {
      indices.push(m.index + (m[1] ? m[1].length : 0));
      if (m.index === rx.lastIndex) rx.lastIndex++;
    }
    if (!indices.length) return [text];
    const parts = [];
    for (let i = 0; i < indices.length; i++) {
      const start = indices[i];
      const end = i + 1 < indices.length ? indices[i + 1] : text.length;
      parts.push(text.slice(start, end));
    }
    return parts;
  }

  // If the very first line is a short header (e.g., Title/Overview) before any Step header,
  // remove it so that parsing and pasting remain consistent.
  function dropLeadingMiniTitle(s) {
    const t = String(s || '');
    // If a Step line exists anywhere, and the content before it is a single short line, drop it.
    const stepRe = /(\n|^)\s*(?:\*{0,3}\s*)?(?:#{1,6}\s*)?(?:>\s*)?(?:Step|STEP)\s*(?:[-#:\.]?\s*)?\(?\s*\d{1,3}\s*\)?/;
    const m = stepRe.exec(t);
    if (!m) return t;
    const pre = t.slice(0, m.index + (m[1] ? m[1].length : 0));
    // Consider only the first non-empty line before Step
    const firstLine = pre.split(/\n/).map(x => x.trim()).find(x => x.length);
    if (!firstLine) return t;
    const looksHeader = /^#{1,6}\s+/.test(firstLine) || /^(title|overview|solution)\s*[:\-–—]?/i.test(firstLine) || /\*\*[^*]{1,80}\*\*/.test(firstLine);
    const shortish = firstLine.length <= 80;
    if (looksHeader && shortish) {
      // Remove only this first line occurrence
      const idxLine = pre.indexOf(firstLine);
      if (idxLine !== -1) {
        const before = pre.slice(0, idxLine);
        const after = pre.slice(idxLine + firstLine.length).replace(/^\s*\n?/, '');
        return before + after + t.slice(pre.length);
      }
    }
    return t;
  }

  function heuristicChunk(text) {
    if (text.length < 1500) return [text];
    const mid = Math.floor(text.length / 2);
    const cut = text.indexOf('\n\n', mid);
    if (cut !== -1) return [text.slice(0, cut), text.slice(cut + 2)];
    return [text];
  }

  function splitFinalFromText(text) {
    const re = /(\n|^)\s*(?:\*\*\s*)?(?:#{1,3}\s*)?(?:Final\s+(?:Answer|Solution)|Summary)\s*:?\s*(?:\*\*)?\s*(?:\n|$)/i;
    const m = re.exec(text);
    if (!m) return { body: text, final: '' };
    const headerStart = m.index + (m[1] ? m[1].length : 0);
    const finalStart = headerStart + (m[0].length - (m[1] ? m[1].length : 0));
    return { body: text.slice(0, headerStart).trim(), final: text.slice(finalStart).trim() };
  }

  function extractFinalAnswer(fullText, plan) {
    if (!fullText) return '';
    const t = String(fullText).replace(/\r/g, '');
    // Match Final Answer / Final Solution headers with optional markdown styling
    const re = /(\n|^)\s*(?:\*\*\s*)?(?:#{1,3}\s*)?(?:Final\s+(?:Answer|Solution))\s*:?\s*(?:\*\*)?\s*(?:\n|$)/i;
    const m = re.exec(t);
    if (m) {
      const start = m.index + (m[1] ? m[1].length : 0) + (m[0].length - (m[1] ? m[1].length : 0));
      const content = t.slice(start).trim();
      if (content) return content;
    }
    // Fallback: if plan exists, try last step's explanation as final
    if (plan && Array.isArray(plan.steps) && plan.steps.length) {
      const last = plan.steps[plan.steps.length - 1];
      if (last && last.explanation) return last.explanation;
      if (last && last.matter) return last.matter;
    }
    return '';
  }

  function toolLabelFromBlock(b) {
    try {
      if (b && b.kind === 'h2' && (b.tool === 'x2' || b.viaTool)) return 'X2';
      if (b && b.kind === 'h2' && (b.tool === 'h2' || b.forH2)) return 'H2';
      const html = String(b && (b.pasteHtml || b.html) || '');
      if (/<ul/i.test(html)) return 'UL';
      if (/<ol/i.test(html)) return 'OL';
      if (/^<p><strong>/i.test(html)) return 'Bold';
      if (/^<p><u>/i.test(html)) return 'Under';
      return 'Plain';
    } catch { return 'Plain'; }
  }

  // Small helpers for inline chips reflecting per-block/segment tools
  function chipHtml(label) {
    return `<button class=\"chx-chip\" data-chip=\"true\" title=\"Change tool\" style=\"float:right;margin-left:8px;margin-top:2px;font-size:11px;padding:2px 6px;border:1px solid #ddd;border-radius:8px;background:#f8f8f8;cursor:pointer\">${label}</button>`;
  }
  function blockChipsHtml(b) {
    try {
      if (b && Array.isArray(b.segments) && (b.kind === 'seq' || b.kind === 'list-seq')) {
        const have = new Set();
        for (const s of b.segments) {
          if (!s || !s.type) continue;
          if (s.type === 'x2') have.add('X2');
          else if (s.type === 'h2') have.add('H2');
          else if (s.type === 'bold') have.add('Bold');
          else if (s.type === 'underline') have.add('Under');
        }
        const labels = Array.from(have);
        if (!labels.length) return chipHtml(toolLabelFromBlock(b));
        return labels.map(chipHtml).join('');
      }
      return chipHtml(toolLabelFromBlock(b));
    } catch { return chipHtml('Plain'); }
  }

  // Build safe preview HTML for any block, even when html is not set (e.g., merged seq)
  function previewHtmlForBlock(b) {
    try {
      const html = b && (b.html || b.pasteHtml);
      if (html) return html;
      if (b && Array.isArray(b.segments)) {
        const inner = b.segments.map((sg) => {
          const t = sg && typeof sg.text === 'string' ? sg.text : '';
          if (!t) return '';
          if (sg.type === 'x2' || sg.type === 'h2') return `<span class=\"chx-math-inline\">${escapeHtml(normalizeX2Text(t))}</span>`;
          if (sg.type === 'bold') return `<b>${inline(t)}</b>`;
          if (sg.type === 'underline') return `<u>${inline(t)}</u>`;
          return inline(t);
        }).join('');
        return `<p>${inner}</p>`;
      }
      if (b && typeof b.raw === 'string') return `<p>${inline(b.raw)}</p>`;
      return '';
    } catch { return ''; }
  }

  function renderPlanPreview(plan, container) {
    const steps = plan.steps || [];
    if (!steps.length) { container.innerHTML = '<div class="chx-empty">Could not split answer into steps.</div>'; return; }
    const html = steps.map((s, i) => {
      const opts = s.opts || { useH2: true, useX2: true, allowBullets: true, allowNumbered: true, overrides: s.overrides || null };
      const matterSrc = s.matterAnnotated || s.matter;
      const blocks = buildH2Blocks(matterSrc, opts);
      const m = blocks.map((b, bi) => {
        const _idx = (typeof b.idx === 'number') ? b.idx : bi;
        const raw = (b.raw != null ? String(b.raw) : (b.plain != null ? String(b.plain) : htmlText(previewHtmlForBlock(b) || '')));
        const chips = blockChipsHtml(b);
        return `<div class=\"chx-block\" data-step=\"${i}\" data-part=\"matter\" data-block=\"${bi}\" data-idx=\"${_idx}\" data-raw=\"${raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;')}\">${chips}${previewHtmlForBlock(b)}</div>`;
      }).join('');
      // Explanation with per-block tool options
      const optsExp = Object.assign({ useH2: true, useX2: true, allowBullets: true, allowNumbered: true }, s.opts || {});
      optsExp.overrides = s.expOverrides || null;
      const eSrc = s.explanationAnnotated || s.explanation;
      const eBlocks = eSrc ? buildH2Blocks(eSrc, optsExp) : [];
      const e = eBlocks.length
        ? eBlocks.map((b, bi) => {
            {const _idx=(typeof b.idx === "number") ? b.idx : bi; const raw=(b.raw != null ? String(b.raw) : (b.plain != null ? String(b.plain) : htmlText(previewHtmlForBlock(b) || ""))); const chips=blockChipsHtml(b); return `<div class=\"chx-block\" data-step=\"${i}\" data-block=\"${bi}\" data-idx=\"${_idx}\" data-raw=\"${raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;')}\" data-part=\"explanation\">${chips}${previewHtmlForBlock(b)}</div>`;}
          }).join('')
        : '<em>Explanation not generated. Simply follow the selected prompt properly.</em>';
      return `<div class=\"chx-preview-step\">`
        + `<h3>Step ${i + 1}</h3>`
        + `<div class=\"chx-step-matter\" data-step-index=\"${i}\" data-part=\"matter\">`
        +   `<div class=\"chx-section-header\"><span class=\"chx-section-label\">Matter</span><button class=\"chx-edit-btn\" data-step-index=\"${i}\" data-part=\"matter\" title=\"Edit\">✎</button></div>`
        +   `<div class=\"chx-section-body\">${m}</div>`
        + `</div>`
        + `<div class=\"chx-step-explanation\" data-step-index=\"${i}\" data-part=\"explanation\">`
        +   `<div class=\"chx-section-header\"><span class=\"chx-section-label\">Explanation</span><button class=\"chx-edit-btn\" data-step-index=\"${i}\" data-part=\"explanation\" title=\"Edit\">✎</button></div>`
        +   `<div class=\"chx-section-body\">${e}</div>`
        + `</div>`
        + `</div>`;
    }).join('\n');
    // Final Answer with per-block tool options
    let finalHtml = '';
    if (plan.final && plan.final.trim()) {
      const finalOpts = Object.assign({ useH2: true, useX2: true, allowBullets: true, allowNumbered: true }, plan.finalOpts || {});
      finalOpts.overrides = plan.finalOverrides || null;
      const annotatedFinal = plan.finalAnnotated || plan.final;
      const fBlocks = buildH2Blocks(annotatedFinal, finalOpts);
      const f = fBlocks.map((b, bi) => {
        {const _idx=(typeof b.idx === "number") ? b.idx : bi; const raw=(b.raw != null ? String(b.raw) : (b.plain != null ? String(b.plain) : htmlText(previewHtmlForBlock(b) || ""))); const chips=blockChipsHtml(b); return `<div class=\"chx-block\" data-step=\"final\" data-block=\"${bi}\" data-idx=\"${_idx}\" data-raw=\"${raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;')}\" data-part=\"final\">${chips}${previewHtmlForBlock(b)}</div>`;}
      }).join('');
      finalHtml = `
        <div class="chx-preview-step">
          <h3>Final Answer</h3>
          <div class="chx-section-body">${f}</div>
        </div>`;
    }
    container.innerHTML = `<div class="chx-answer__content">${html}${finalHtml}</div>`;

    // Wire up edit buttons to allow inline editing of plan
    const openEditor = (idx, part) => {
      const block = container.querySelector(`[data-step-index="${idx}"][data-part="${part}"]`);
      if (!block) return;
      const body = block.querySelector('.chx-section-body');
      if (!body) return;
      const raw = part === 'matter' ? (plan.steps[idx].matter || '') : (plan.steps[idx].explanation || '');
      const ta = document.createElement('textarea');
      ta.className = 'chx-edit-ta';
      ta.value = raw;
      const actions = document.createElement('div');
      actions.className = 'chx-row chx-right chx-edit-actions';
      actions.innerHTML = '<button class="chx-btn chx-btn-secondary chx-edit-cancel">Cancel</button><button class="chx-btn chx-btn-primary chx-edit-save">Save</button>';
      body.innerHTML = '';
      body.appendChild(ta);
      body.appendChild(actions);
      const cancel = actions.querySelector('.chx-edit-cancel');
      const save = actions.querySelector('.chx-edit-save');
      if (cancel) cancel.addEventListener('click', () => renderPlanPreview(plan, container));
      if (save) save.addEventListener('click', () => {
        const newVal = ta.value.trim();
        if (part === 'matter') plan.steps[idx].matter = newVal;
        else plan.steps[idx].explanation = newVal;
        renderPlanPreview(plan, container);
      });
    };
    const btns = container.querySelectorAll('.chx-edit-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-step-index') || '0', 10);
        const part = btn.getAttribute('data-part') || 'matter';
        openEditor(idx, part);
      });
    });

    // Per-block tool picker: right-click, Alt+click, or click the chip on a preview block
    container.addEventListener('contextmenu', (ev) => {
      const blk = ev.target.closest('.chx-block');
      if (!blk) return;
      ev.preventDefault();
      openToolMenu(plan, container, blk);
    });
    container.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.chx-chip');
      const blk = chip ? chip.closest('.chx-block') : (ev.altKey ? ev.target.closest('.chx-block') : null);
      if (blk) { ev.preventDefault(); openToolMenu(plan, container, blk); }
    });
  }

  // Simple/direct preview: render a single markdown document composed from steps
  function renderPlanSimple(plan, container) {
    try {
      const steps = plan.steps || [];
      const parts = [];
      const deriveTitle = (s) => {
        try {
          const t = String(s || '').trim();
          if (!t) return '';
          const first = (t.split(/\n/)[0] || '').trim();
          if (/^#{1,6}\s+/.test(first)) return first.replace(/^#{1,6}\s+/, '').trim();
          if (first.length <= 80 && !/[.:;]$/.test(first) && !/[\\$]/.test(first)) return first;
          return '';
        } catch { return ''; }
      };
      for (let i = 0; i < steps.length; i++) {
        const m = (steps[i].matterAnnotated || steps[i].matter || '').trim();
        const e = (steps[i].explanationAnnotated || steps[i].explanation || '').trim();
        const title = deriveTitle(m);
        const body = title ? (m.replace(/^#{1,6}\s+/, '').replace(new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'), '').trim()) : m;
        const stepHead = title ? `# Step ${i + 1}: ${title}` : `# Step ${i + 1}`;
        parts.push(stepHead);
        if (body) parts.push(body);
        parts.push('');
        parts.push('### Explanation Block');
        parts.push(e || '');
        parts.push('');
      }
      if (plan.final) {
        const fin = (plan.final || '').trim();
        if (fin) { parts.push('# Final Answer'); parts.push(fin); }
      }
      const md = parts.join('\n');
      container.innerHTML = convertLikeRenderToHtml(md);
    } catch {
      container.innerHTML = '<div class="chx-empty">Preview failed to render.</div>';
    }
  }

  // -------- Render.js-style converter (no AI, plain HTML) --------
  // ENHANCED: Now supports all Chegg Authoring Tools including %%, ==, code blocks
  function convertLikeRenderToHtml(text) {
    try {
      let t = String(text == null ? '' : text);
      if (!t.trim()) return '';

      // NEW: Step 0 - Handle code snippets FIRST (before other processing)
      // Code blocks: ```language\ncode\n```
      const codeBlocks = [];
      t = t.replace(/```(\w+)?(?::linenos)?\n([\s\S]+?)```/g, (match, lang, code) => {
        const placeholder = `<<<CODE_BLOCK_${codeBlocks.length}>>>`;
        codeBlocks.push({ lang: lang || 'text', code: code.trim() });
        return placeholder;
      });

      // NEW: Handle Chemistry Equation Tool markers (%%)
      const chemEquations = [];
      t = t.replace(/%%(.+?)%%/g, (match, equation) => {
        const placeholder = `<<<CHEM_EQ_${chemEquations.length}>>>`;
        chemEquations.push(equation);
        return placeholder;
      });

      // NEW: Handle Inline Equation Tool markers (==)
      const inlineEquations = [];
      t = t.replace(/==(.+?)==/g, (match, equation) => {
        const placeholder = `<<<INLINE_EQ_${inlineEquations.length}>>>`;
        inlineEquations.push(equation);
        return placeholder;
      });

      // Step 1: tables to LaTeX blocks
      t = convertTablesToLatex_simple(t);
      // Step 2: $$..$$ -> \[ .. \] and $..$ -> \(..\) (currency safeguarded later)
      t = convertDollarToAngleBrackets_simple(t);
      // Step 3: protect currency and normalize LaTeX wrappers
      let input = t
        .replace(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g, '¤$1')
        .replace(/(\d+(?:,\d{3})*(?:\.\d{2})?)\$/g, '$1¤')
        .replace(/\$([A-Z]{2,4})/g, '¤$1')
        .replace(/\[4pt\]/g, '')
        .replace(/\[2pt\]/g, '')
        .replace(/\[1pt\]/g, '')
        .replace(/\\\[/g, '<span data-math-type="mhchem">')
        .replace(/\\\]/g, '</span>')
        .replace(/\\\(/g, '<span data-math-type="mhchem">')
        .replace(/\\\)/g, '</span>')
        .replace(/\[\(/g, '<span data-math-type="mhchem">')
        .replace(/\)\]/g, '</span>')
        .replace(/right\]\./g, 'right]')
        .replace(/bmatrix\}\./g, 'bmatrix}')
        .replace(/\\tilde/g, '')
        .replace(/\\bar/g, '')
        .replace(/\\hat/g, '')
        .replace(/\+/g, ' +')
        .replace(/\\theta/g, '\\theta ')
        .replace(/\\pi/g, '\\pi ')
        .replace(/\\mathbf/g, '');

      const lines = input.split(/\n/);
      let output = '';
      let pcontinue = true;
      let p = true;
      let inlist = false;
      let inlist1 = false;
      for (let raw of lines) {
        let line = String(raw || '').trim();
        if (pcontinue) p = true;
        // bold **..** -> <strong>
        const segs = line.split('**');
        for (let i = 1; i < segs.length; i += 2) segs[i] = `<strong>${segs[i]}</strong>`;
        line = segs.join('');
        if (line === '' || line === '---') { p = false; line = ''; }
        // headings
        if (/^####\s+/.test(line)) { line = `<h4>${line.replace(/^####\s+/, '').trim()}</h4>`; p = false; }
        else if (/^###\s+/.test(line)) { line = `<h3>${line.replace(/^###\s+/, '').trim()}</h3>`; p = false; }
        else if (/^##\s+/.test(line)) { line = `<h2>${line.replace(/^##\s+/, '').trim()}</h2>`; p = false; }
        else if (/^#\s+/.test(line)) { line = `<h1>${line.replace(/^#\s+/, '').trim()}</h1>`; p = false; }
        // ordered lists
        if (/^\d+\.\s/.test(line)) {
          if (!inlist) line = `<ol><li>${line.replace(/^\d+\.\s*/, '')}</li>`; else line = `<li>${line.replace(/^\d+\.\s*/, '')}</li>`;
          inlist = true; p = false; pcontinue = false;
        } else if (!/^\d+\.\s/.test(line) && inlist) {
          line = `</ol>${line}`; inlist = false; p = true; pcontinue = true;
        }
        // unordered
        if (/^(?:\* |- )/.test(line)) {
          if (!inlist1) line = `<ul><li>${line.replace(/^[*\-]\s*/, '')}</li>`; else line = `<li>${line.replace(/^[*\-]\s*/, '')}</li>`;
          inlist1 = true; p = false; pcontinue = false;
        } else if (!/^(?:\* |- )/.test(line) && inlist1) {
          line = `</ul>${line}`; inlist1 = false; p = true; pcontinue = true;
        }
        // paragraphs
        if (p && !line.includes('</ol>') && !line.includes('</ul>') && !/^<h\d>/.test(line) && line !== '') {
          line = `<p>${line}</p><p>&nbsp;</p>`;
        }
        // block math tokens §§§§
        if (((/^<p>§§§§/.test(line)) || (/^</.test(line) && /§§§§/.test(line)) || (/^§§§§/.test(line))) && pcontinue) {
          pcontinue = false; p = false; line = line.replace('§§§§', '<span data-math-type="mhchem">').replace('</p>', '');
        } else if (line.includes('§§§§') && !pcontinue) {
          pcontinue = true; p = true; line = line.replace('§§§§', '</span></p>');
        }
        // inline §§
        if (line.includes('§§')) line = processInlineMath_simple(line);
        output += line + '\n';
      }
      if (inlist) output += '</ol>\n';
      if (inlist1) output += '</ul>\n';
      output = cleanSpanContent_simple(output)
        .replace(/<br\/?\>/g, '');

      // NEW: Restore code blocks with proper formatting
      output = output.replace(/<<<CODE_BLOCK_(\d+)>>>/g, (match, index) => {
        const block = codeBlocks[parseInt(index)];
        if (!block) return match;
        // Format as pre/code block for Chegg
        const escapedCode = block.code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre><code class="language-${block.lang}">${escapedCode}</code></pre>`;
      });

      // NEW: Restore chemistry equations with Chegg's chemistry tool marker
      output = output.replace(/<<<CHEM_EQ_(\d+)>>>/g, (match, index) => {
        const equation = chemEquations[parseInt(index)];
        if (!equation) return match;
        // Use Chegg's chemistry equation format
        return `<span data-chem-equation="true">${equation}</span>`;
      });

      // NEW: Restore inline equations with Chegg's inline math format
      output = output.replace(/<<<INLINE_EQ_(\d+)>>>/g, (match, index) => {
        const equation = inlineEquations[parseInt(index)];
        if (!equation) return match;
        // Use Chegg's inline math format
        return `<span data-math-type="mhchem">${equation}</span>`;
      });

      return output.replace(/¤/g, '$');
    } catch { return ''; }
  }

  function processInlineMath_simple(line) {
    let res = ''; let inMath = false;
    for (let i = 0; i < line.length; i++) {
      if (line.substr(i,2) === '§§') { res += inMath ? '</span>' : '<span data-math-type="mhchem">'; inMath = !inMath; i++; }
      else res += line[i];
    }
    if (inMath) res += '</span>';
    return res;
  }

  function convertDollarToAngleBrackets_simple(text) {
    let result = String(text || '');
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (m, c) => `\\[${c}\\]`);
    result = result.replace(/\$([^$\n]+)\$/g, (m, c) => isMathContent_simple(c) ? `\\(${c}\\)` : m);
    return result;
  }
  function isMathContent_simple(content) {
    const trimmed = String(content || '').trim();
    if (/^[\d,.\s]+$/.test(trimmed)) return false;
    if (/^[A-Z]{2,4}$/.test(trimmed)) return false;
    const pats = [
      /^[a-zA-Z]$/, /\d+/, /[a-zA-Z]'+/, /[+\-*/=<>()[\]{}]/, /[a-zA-Z]\^/, /\\[a-zA-Z]+/, /[a-zA-Z]_/,
      /sqrt|frac|sum|int|lim|alpha|beta|gamma|theta|pi|sigma/i, /begin\{|end\{/, /\d+\.\d+.*[+\-*/=]/, /[+\-*/=].*\d+\.\d+/
    ];
    return pats.some(rx => rx.test(trimmed));
  }

  function convertTablesToLatex_simple(text) {
    const lines = String(text || '').split(/\n/);
    const out = []; let i = 0; let inEq = false;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line.includes('$$')) { const c = (line.match(/\$\$/g) || []).length; if (c % 2 === 1) inEq = !inEq; }
      if (inEq) { out.push(lines[i++]); continue; }
      if (/(^|\|).+\|.+/.test(line) && !/\\\|/.test(line)) {
        let found = false;
        for (let j = i + 1; j <= i + 2 && j < lines.length; j++) { if (/^[\|\s\-:]+$/.test(lines[j].trim())) { found = true; break; } }
        if (found) {
          const tbl = parseTable_simple(lines, i);
          if (tbl.isValid) { out.push('\\[' + generateLatexTable_simple(tbl.table) + '\\]'); i = tbl.endIndex; continue; }
        }
      }
      out.push(lines[i]); i++;
    }
    return out.join('\n');
  }
  function parseTable_simple(lines, start) {
    const table = []; let idx = start;
    while (idx < lines.length) {
      const line = lines[idx].trim();
      if (!line.includes('|')) break;
      if (/^[\|\s\-:]+$/.test(line)) { idx++; continue; }
      const cells = line.split('|').map(c => c.trim().replace(/^\$|\$/g,'').replace(/,/g,'')).filter(Boolean);
      if (!cells.length) break; table.push(cells); idx++;
    }
    return { isValid: table.length > 0, table, endIndex: idx };
  }
  function generateLatexTable_simple(table) {
    if (!table.length) return '';
    const numCols = Math.max(...table.map(r => r.length));
    const colSpec = '|' + 'c|'.repeat(numCols);
    let latex = `\\begin{array}{${colSpec}}\n\\hline\n`;
    table.forEach(row => {
      const processed = row.map(c => `\\text{${c.trim()}}`);
      while (processed.length < numCols) processed.push('\\text{}');
      latex += processed.join(' & ') + ' \\n\\hline\n';
    });
    latex += '\\end{array}';
    return latex;
  }
  function cleanSpanContent_simple(str) {
    let result = ''; let i = 0;
    while (i < str.length) {
      const open = str.indexOf('<span data-math-type="mhchem">', i);
      if (open !== -1 && open === i) {
        result += '<span data-math-type="mhchem">'; i += 30;
        let content = ''; let nested = 0;
        while (i < str.length) {
          const nextOpen = str.indexOf('<span data-math-type="mhchem">', i);
          const close = str.indexOf('</span>', i);
          if (nextOpen !== -1 && (close === -1 || nextOpen < close)) { content += str.substring(i, nextOpen); nested++; i = nextOpen + 30; }
          else if (close !== -1) { if (nested > 0) { content += str.substring(i, close); nested--; i = close + 7; } else { content += str.substring(i, close); i = close; break; } }
          else { content += str.substring(i); break; }
        }
        const clean = content.replace(/<p>/g,'').replace(/<\/p>/g,'').replace(/<ul>/g,'').replace(/<\/ul>/g,'').replace(/<ol>/g,'').replace(/<\/ol>/g,'').replace(/<li>/g,'- ').replace(/<\/li>/g,'').replace(/</g,'&lt;');
        result += clean + '</span>'; i += 7;
      } else if (open !== -1) { result += str.substring(i, open); i = open; }
      else { result += str.substring(i); break; }
    }
    return result;
  }

  // Summarize intended tool usage for a step's matter text
  function summarizeTools(markdown, opts) {
    const blocks = buildH2Blocks(markdown || '', opts);
    let h2 = 0, x2 = 0, ul = 0, ol = 0;
    for (const b of blocks) {
      if (b.kind === 'h2' && b.tool === 'h2') h2++;
      if (b.kind === 'h2' && (b.tool === 'x2' || b.viaTool)) x2++;
      if (b.kind === 'html' && /<ul/.test(b.html)) ul++;
      if (b.kind === 'html' && /<ol/.test(b.html)) ol++;
    }
    return { h2, x2, ul, ol };
  }

  function openToolMenu(plan, container, blockEl) {
    const part = blockEl.getAttribute('data-part') || 'matter';
    const stepAttr = blockEl.getAttribute('data-step') || '0';
    const si = stepAttr === 'final' ? -1 : parseInt(stepAttr || '0', 10);
    const bi = parseInt(blockEl.getAttribute('data-block') || '0', 10);
    const idxKey = parseInt(blockEl.getAttribute('data-idx') || String(bi) || '0', 10);
    const rect = blockEl.getBoundingClientRect();
    const old = document.getElementById('chx-tool-menu'); if (old) old.remove();
    const menu = document.createElement('div');
    menu.id = 'chx-tool-menu'; menu.className = 'chx-tool-menu';
    menu.innerHTML = [
      ['h2','Chem Equation (H2)'],
      ['x2','Inline Equation (X2)'],
      ['p','Plain Text'],
      ['ul','Bullet Item'],
      ['ol','Numbered Item'],
      ['bold','Bold Text'],
      ['underline','Underline Text']
    ].map(([k,l])=>`<button class=\"chx-tool-menu-item\" data-choice=\"${k}\">${l}</button>`).join('');
    document.body.appendChild(menu);
    menu.style.position = 'fixed';
    menu.style.top = Math.max(12, rect.top + 8) + 'px';
    menu.style.left = Math.min(window.innerWidth - 220, rect.right - 140) + 'px';
    const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
    document.addEventListener('mousedown', close);
    menu.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-choice]');
      if (!btn) return;
      const choice = btn.getAttribute('data-choice');
      // If user has selection inside this block, wrap selection with markers to force tool on that span
      try {
        const sel = window.getSelection && window.getSelection();
        const selected = sel && sel.rangeCount ? String(sel.toString() || '').trim() : '';
        if (selected && blockEl && blockEl.contains(sel.getRangeAt(0).commonAncestorContainer)) {
          const rawEsc = blockEl.getAttribute('data-raw') || '';
          const raw = rawEsc ? rawEsc.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
          const wrap = (txt) => {
            if (choice === 'h2') return `[[H2]]${txt}[[/H2]]`;
            if (choice === 'x2') return `[[X2]]${txt}[[/X2]]`;
            if (choice === 'bold' || choice === 'b') return `[[B]]${txt}[[/B]]`;
            if (choice === 'underline' || choice === 'u') return `[[U]]${txt}[[/U]]`;
            return txt;
          };
          const wrapped = wrap(selected);
          if (wrapped !== selected && raw && raw.includes(selected)) {
            const replacedRaw = raw.replace(selected, wrapped);
            if (si === -1 || part === 'final') {
              plan.final = replaceOnce(plan.final || '', raw, replacedRaw) || (plan.final || '').replace(raw, replacedRaw);
            } else if (part === 'explanation') {
              const before = plan.steps[si].explanation || '';
              plan.steps[si].explanation = replaceOnce(before, raw, replacedRaw) || before.replace(raw, replacedRaw);
            } else {
              const before = plan.steps[si].matter || '';
              plan.steps[si].matter = replaceOnce(before, raw, replacedRaw) || before.replace(raw, replacedRaw);
            }
            menu.remove(); document.removeEventListener('mousedown', close);
            renderPlanPreview(plan, container);
            return; // done via inline markers
          }
        }
      } catch {}
      if (si === -1 || part === 'final') {
        if (!plan.finalOverrides) plan.finalOverrides = {};
        plan.finalOverrides[idxKey] = choice;
      } else if (part === 'explanation') {
        if (!plan.steps[si].expOverrides) plan.steps[si].expOverrides = {};
        plan.steps[si].expOverrides[idxKey] = choice;
      } else {
        if (!plan.steps[si].overrides) plan.steps[si].overrides = {};
        plan.steps[si].overrides[idxKey] = choice;
      }
      menu.remove(); document.removeEventListener('mousedown', close);
      renderPlanPreview(plan, container);
    });
  }

  async function pasteStepsIntoChegg(plan, fullText) {
    const steps = plan.steps || [];
    if (!steps.length) return;
    try {
      for (let i = 0; i < steps.length; i++) {
        const stepNum = i + 1;
        showStatus(`Pasting Step ${stepNum}/${steps.length} (matter)`);
        const container = await ensureStepExists(i);
        if (!container) { showStatus('Step area not found', true); return; }
        const matterEditor = await waitForMatterEditor(container);
        const matterSrc = steps[i].matter || '';
        const matterHtml = convertLikeRenderToHtml(matterSrc);
        if (matterEditor) { await clearEditor(matterEditor); await pasteHtml(matterEditor, compatHtml(matterHtml)); }
        await delay(250);
        showStatus(`Pasting Step ${stepNum}/${steps.length} (explanation)`);
        const expEditor = await ensureExplanationEditorForStep(container, i);
        const fallbackExp = 'Simply follow the selected prompt properly.';
        const expText = (steps[i].explanation && steps[i].explanation.trim()) ? steps[i].explanation : fallbackExp;
        const expHtml = convertLikeRenderToHtml(expText);
        if (expEditor) { await clearEditor(expEditor); await pasteHtml(expEditor, compatHtml(expHtml)); }
        await delay(280);
        if (i < steps.length - 1) {
          const addBtn = await waitForAddStepEnabled();
          if (addBtn) { try { addBtn.scrollIntoView({ block: 'center' }); } catch {}; addBtn.click(); await delay(800); }
        }
      }

      // Try to go to Final solution and paste whole answer
      const nextBtn = document.querySelector("button[data-test='answer-next-btn']");
      if (nextBtn && !nextBtn.disabled) nextBtn.click();
      await delay(400);
      const finalTab = document.querySelector("[data-test='step-container-Final solution']");
      if (finalTab) { finalTab.click(); await delay(300); }
      const editor = pickVisibleEditor();
      if (editor) {
        const finalOnly = (plan && plan.final) ? plan.final : extractFinalAnswer(fullText, plan);
        showStatus('Pasting Final solution');
        const finalHtml = convertLikeRenderToHtml(finalOnly);
        await clearEditor(editor);
        await pasteHtml(editor, compatHtml(finalHtml));
      }
      showStatus('Pasted ✓'); setTimeout(clearStatus, 1500);
    } catch (e) {
      console.error(e);
      showStatus('Paste failed', true);
    }
  }

  function pickVisibleEditor() {
    const nodes = Array.from(document.querySelectorAll('.ProseMirror'));
    for (const n of nodes.reverse()) { if (n.offsetParent !== null) return n; }
    return nodes[0] || null;
  }

  async function ensureStepExists(index0) {
    // Ensure the requested step index exists; click "Add another step" until it does
    for (let attempt = 0; attempt < 20; attempt++) {
      const steps = Array.from(document.querySelectorAll("div[id^='step-'][data-test^='step-']"));
      if (steps.length > index0) return steps[index0];
      const btn = await waitForAddStepEnabled();
      if (btn) { try { btn.scrollIntoView({ block: 'center' }); } catch {}; btn.click(); await delay(700); }
      else await delay(300);
    }
    // Fallback to last available step
    const steps = Array.from(document.querySelectorAll("div[id^='step-'][data-test^='step-']"));
    return steps[index0] || steps[steps.length - 1] || null;
  }

  async function addExplanationToStep(stepEl, index0) {
    if (!stepEl) stepEl = await ensureStepExists(index0);
    // Expand the step if collapsed and scroll into view
    try { stepEl.scrollIntoView({ block: 'center' }); } catch {}
    const collapsed = stepEl.getAttribute('data-collapsed');
    if (collapsed !== null) {
      const toggle = stepEl.querySelector('[data-test*="collapse"], button[aria-expanded="false"], button[aria-label*="Expand" i]');
      if (toggle) { toggle.click(); await delay(250); }
    }
    // If explanation editor already exists, nothing to click
    const existing = stepEl.querySelector('p[data-placeholder*="Add explanation" i], p[data-placeholder*="Explanation" i], p[aria-label*="Explanation" i]');
    if (existing) return;
    // Close stray popovers/tool dialogs that could steal focus
    try {
      const overlays = Array.from(document.querySelectorAll('[role="dialog"], .popover, .popup, .menu, .portal, .walkme-window, .walkme-tooltip, .walkme-menu'));
      overlays.forEach(el => {
        try { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } catch {}
        try { el.remove(); } catch {}
      });
      await delay(120);
    } catch {}
    // Focus the step's matter editor to set active step context, then place caret at end
    try {
      const m = stepEl.querySelector('.ProseMirror');
      if (m) { m.click(); m.focus(); placeCaretAtEnd(m); }
      await delay(120);
    } catch {}
    // Prefer bottom-most Insert Explanation control within this step
    const collect = () => Array.from(stepEl.querySelectorAll(
      `button[data-test='step-${index0}-toolbar-insert-explanation-button'],`+
      `button[data-test$='insert-explanation-button'],`+
      `button[data-test*='insert-explanation' i],`+
      `button[aria-label*='Explanation' i],`+
      `button, [role="button"]`
    )).filter(el => /(add|insert)\s*explanation/i.test((el.getAttribute('aria-label')||el.getAttribute('data-test')||el.textContent||'').toLowerCase()));
    let candidates = collect();
    if (!candidates.length) {
      const root = stepEl.ownerDocument || document;
      candidates = Array.from(root.querySelectorAll(
        "button[data-test$='insert-explanation-button'], button[data-test*='insert-explanation' i], button[aria-label*='Explanation' i]"
      ));
      // keep only those belonging to this step if possible
      candidates = candidates.filter(b => (b.closest("div[id^='step-'][data-test^='step-']") || stepEl) === stepEl);
    }
    if (candidates.length) {
      candidates.sort((a,b)=> (a.getBoundingClientRect().top||0) - (b.getBoundingClientRect().top||0));
      const bottomMost = candidates[candidates.length-1];
      bottomMost.click();
      await delay(600);
    }
  }

  function findExplanationEditable(stepEl) {
    const ph = stepEl.querySelector("p[data-placeholder*='Add explanation' i], p[data-placeholder*='Explanation' i], p[aria-label*='Explanation' i]");
    if (ph) {
      const ce = ph.closest('[contenteditable="true"]');
      return ce || ph;
    }
    const ce2 = stepEl.querySelector("[aria-label*='Explanation' i][contenteditable='true']");
    if (ce2) return ce2;
    const area = stepEl.querySelector("[data-test*='explanation' i] [contenteditable='true']");
    if (area) return area;
    return null;
  }

  function stepChildContainer(stepEl, node) {
    if (!stepEl || !node) return null;
    let cur = node;
    while (cur && cur.parentElement && cur.parentElement !== stepEl) cur = cur.parentElement;
    return cur && cur.parentElement === stepEl ? cur : node;
  }

  function findContainerWithKeyword(stepEl, startEl, keyword) {
    const kw = (keyword || '').toLowerCase();
    let cur = startEl;
    while (cur && cur !== stepEl) {
      const dt = (cur.getAttribute && (cur.getAttribute('data-test') || '').toLowerCase()) || '';
      const cls = (cur.className || '').toLowerCase();
      if (dt.includes(kw) || cls.includes(kw)) return cur;
      cur = cur.parentElement;
    }
    // Scan step children for a section with an explicit label
    const kids = Array.from(stepEl.children);
    for (const k of kids) {
      const label = k.querySelector('.chx-section-label, [class*="section-label" i], h2, h3, h4');
      if (label && /explanation/i.test((label.textContent || ''))) return k;
      const dt = (k.getAttribute && (k.getAttribute('data-test') || '')) || '';
      if (/explanation/i.test(dt)) return k;
    }
    return stepChildContainer(stepEl, startEl);
  }

  function findMatterContainer(stepEl) {
    const firstPM = stepEl.querySelector('.ProseMirror');
    if (!firstPM) return null;
    // favor a container with 'matter' semantic if present
    const byKw = findContainerWithKeyword(stepEl, firstPM, 'matter');
    return byKw || stepChildContainer(stepEl, firstPM);
  }

  function findExplanationContainer(stepEl, explEditor) {
    const byKw = findContainerWithKeyword(stepEl, explEditor, 'explanation');
    return byKw || stepChildContainer(stepEl, explEditor);
  }

  function ensureExplanationBelow(stepEl, explEditor) {
    try {
      const matterBox = findMatterContainer(stepEl);
      const explBox = findExplanationContainer(stepEl, explEditor);
      if (!matterBox || !explBox || matterBox === explBox) return;
      const isAbove = explBox.compareDocumentPosition(matterBox) & Node.DOCUMENT_POSITION_PRECEDING;
      if (isAbove) {
        // Move explanation container immediately after matter
        if (matterBox.nextSibling) stepEl.insertBefore(explBox, matterBox.nextSibling);
        else stepEl.appendChild(explBox);
      }
    } catch {}
  }

  async function waitForExplanationEditor(stepEl) {
    for (let i = 0; i < 18; i++) {
      const target = findExplanationEditable(stepEl);
      if (target) return target;
      await delay(220);
    }
    return findExplanationEditable(stepEl);
  }

  async function waitForMatterEditor(stepEl) {
    for (let i = 0; i < 12; i++) {
      const editors = stepEl.querySelectorAll('.ProseMirror');
      if (editors.length) return editors[0];
      await delay(200);
    }
    return stepEl.querySelector('.ProseMirror');
  }

  // More robust: ensure an explanation editor exists for this step and return it
  async function ensureExplanationEditorForStep(stepEl, index0) {
    if (!stepEl) stepEl = await ensureStepExists(index0);
    if (!stepEl) return null;
    try { stepEl.scrollIntoView({ block: 'center' }); } catch {}
    // Expand if collapsed
    const collapsed = stepEl.getAttribute('data-collapsed');
    if (collapsed !== null) {
      const toggle = stepEl.querySelector('[data-test*="collapse"], button[aria-expanded="false"], button[aria-label*="Expand" i]');
      if (toggle) { toggle.click(); await delay(250); }
    }
    // Try existing explanation editable first
    const existingEditable = findExplanationEditable(stepEl);
    if (existingEditable) { try { ensureExplanationBelow(stepEl, existingEditable); } catch {} return existingEditable; }
    // Click insert explanation using local or global button scoped to this step
    const beforeEditors = Array.from(stepEl.querySelectorAll('.ProseMirror'));
    await addExplanationToStep(stepEl, index0);
    // Prefer the explicit explanation placeholder first
    for (let tries = 0; tries < 15; tries++) {
      const ph = stepEl.querySelector("p[data-placeholder*='Add explanation' i], p[data-placeholder*='Explanation' i]");
      const ce = ph ? (ph.closest('[contenteditable="true"]') || ph) : null;
      if (ce) { try { ensureExplanationBelow(stepEl, ce); } catch {} return ce; }
      await delay(120);
    }
    // Fallback: detect the newly inserted editor by diffing before/after lists
    for (let tries = 0; tries < 12; tries++) {
      const afterEditors = Array.from(stepEl.querySelectorAll('.ProseMirror'));
      const beforeSet = new Set(beforeEditors);
      const diff = afterEditors.filter(n => !beforeSet.has(n));
      if (diff.length) {
        const candidate = diff[diff.length - 1];
        if (candidate) { try { ensureExplanationBelow(stepEl, candidate); } catch {} return candidate; }
      }
      await delay(120);
    }
    // Last fallback: wait for any explanation editor to appear
    const found = await waitForExplanationEditor(stepEl);
    if (found) { try { ensureExplanationBelow(stepEl, found); } catch {} return found; }
    // Fallback: last visible editable element in step
    const allEditable = stepEl.querySelectorAll('[contenteditable="true"], .ProseMirror');
    return allEditable.length ? allEditable[allEditable.length - 1] : null;
  }

  async function pasteIntoStep(stepEl, markdown, isExplanation, index0, explicitEditor, stepOptions) {
    if (!stepEl) return;
    // Build H2-promoted blocks for formulas/calculations
    const blocks = buildH2Blocks(markdown, stepOptions);
    let editor = null;
    const isExplNode = (node) => {
      if (!node) return false;
      try {
        if (node.closest && node.closest("[data-test*='explanation' i]")) return true;
        if (node.closest && node.closest("[aria-label*='Explanation' i]")) return true;
        if (node.querySelector && node.querySelector("p[data-placeholder*='Add explanation' i], p[data-placeholder*='Explanation' i]")) return true;
        return false;
      } catch { return false; }
    };
    if (explicitEditor && (!isExplanation || isExplNode(explicitEditor))) {
      editor = explicitEditor;
    } else if (isExplanation) {
      editor = findExplanationEditable(stepEl);
      if (!editor) {
        // Ensure the UI created the editor
        await addExplanationToStep(stepEl, index0);
        editor = await waitForExplanationEditor(stepEl);
      }
    } else {
      const editors = stepEl.querySelectorAll('.ProseMirror');
      editor = editors[0] || null;
    }
    // Ensure explanation container is positioned below matter, not above
    if (isExplanation && editor) {
      try {
        ensureExplanationBelow(stepEl, editor);
      } catch {}
    }
    // If targeting Explanation, try to focus the explanation placeholder so paste lands inside it
    if (isExplanation) {
      try {
        const ph = stepEl.querySelector("p[data-placeholder*='Add explanation' i], p[data-placeholder*='Explanation' i], p[aria-label*='Explanation' i]");
        if (ph) { try { ph.click(); } catch {}; try { (ph.closest('[contenteditable="true"]')||ph).focus(); } catch {}; await delay(140); }
        // Re-resolve editor after the explanation placeholder is active
        const e2 = findExplanationEditable(stepEl);
        if (e2) editor = e2;
        try { placeCaretAtEnd(editor); } catch {}
      } catch {}
    }
    // Do NOT fallback to an arbitrary visible editor for Explanation; abort instead
    if (!editor) { if (!isExplanation) editor = pickVisibleEditor(); }
    if (!editor) return;
    // Use the tool pipeline for both matter and explanation so formatting matches preview
    await pasteBlocksWithH2(editor, blocks, stepEl, { allowTools: true });
    // If targeting Explanation and it still appears empty, fallback to plain-text paste
    if (isExplanation) {
      try {
        await delay(120);
        const target = findExplanationEditable(stepEl) || getEditableTarget(editor);
        const txt = (target.textContent || '').trim();
        if (txt.length < 5) {
          const plain = blocks.map(b => (b.raw ? String(b.raw) : htmlText(b.html || ''))).join('\n').trim();
          if (plain) {
            // Try a more direct HTML paste into the explanation box
            const ok = await pasteExplanationBlocks(stepEl, blocks);
            if (!ok) await pastePlainText(editor, plain);
          }
        }
      } catch {}
    }
  }

  function blocksToHtml(blocks) {
    const parts = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const html = compatHtml(b.pasteHtml || b.html || `<span>${escapeHtml(b.raw || '')}</span>`);
      parts.push(html);
      if (i < blocks.length - 1) parts.push('<br/>');
    }
    return parts.join('');
  }

  async function pasteExplanationBlocks(stepEl, blocks) {
    try {
      const ph = stepEl.querySelector("p[data-placeholder*='Add explanation' i], p[data-placeholder*='Explanation' i], p[aria-label*='Explanation' i]");
      const ce = findExplanationEditable(stepEl) || (ph ? ph.closest('[contenteditable="true"]') : null);
      if (!ph && !ce) return false;
      const html = blocksToHtml(blocks);
      const target = ce || ph;
      // Try to paste using selection at the placeholder to ensure insertion inside the explanation box
      try {
        const selTarget = ce || ph;
        selTarget.focus();
        const range = document.createRange();
        if (ph) range.selectNode(ph);
        else range.selectNodeContents(selTarget);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
        const ok = document.execCommand && document.execCommand('insertHTML', false, html);
        if (!ok) throw new Error('execCommand failed');
      } catch (e) {
        // Fallback: insert right after placeholder within the explanation area, then remove placeholder
        if (ph) {
          ph.insertAdjacentHTML('afterend', html);
          try { ph.remove(); } catch {}
        } else {
          target.insertAdjacentHTML('beforeend', html);
        }
      }
      // Fire editor events
      try { target.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
      try { target.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
      try { target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true })); } catch {}
      return true;
    } catch { return false; }
  }

  async function pasteHtml(editor, html) {
    // Place selection inside this editor, then use execCommand to fire proper editor events
    const target = getEditableTarget(editor);
    target.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(target);
      // Append to end by collapsing to end
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertHTML', false, html);
    } catch (e) {
      // Fallback to direct innerHTML if execCommand blocked
      target.insertAdjacentHTML('beforeend', html);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }
  }

  // Split content into blocks; ONLY use H2 tool for \[ ... \] display math blocks
  function buildH2Blocks(markdown = '', opts) {
    const options = Object.assign({ useH2: true, useX2: true, allowBullets: true, allowNumbered: true, overrides: null, splitInlineMath: true }, (opts || {}));
    let src = String(markdown || '').replace(/\r/g, '');
    // Fix: if a line starts with a list marker before a display-math block,
    // e.g., "- \\[ ... \\]", the previous logic created a stray "-" line.
    // Strip such leading markers so the formula remains a single block.
    src = src.replace(/(^|\n)[\t ]*[-*•]\s*(?=\\\[)/g, '$1');
    src = src.replace(/(^|\n)[\t ]*[-*•]\s*(?=\$\$)/g, '$1');
    const blocks = [];
    // Break by lines, but keep display-math blocks intact
    const parts = [];
    const re = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g; // $$...$$ or \[...\]
    let last = 0; let m;
    while ((m = re.exec(src)) !== null) {
      const before = src.slice(last, m.index);
      if (before) parts.push({ type: 'text', value: before });
      const mathRaw = m[0];
      const isDollars = mathRaw.startsWith('$$');
      const inner = isDollars ? mathRaw.slice(2, -2) : mathRaw.slice(2, -2);
      parts.push({ type: 'math', value: inner, via: isDollars ? 'dollars' : 'bracket' });
      last = re.lastIndex;
    }
    const tail = src.slice(last);
    if (tail) parts.push({ type: 'text', value: tail });

    // Recognize common side headings and tolerate small typos (Intro*, Head*)
    const headingRe = /^(?:Formula|Formulas|Calculation|Calculations|Given|Result|Final Answer|Final Solution|(?:Conce\w+|Conceptual)\s+Intro\w*|Introduction|Conceptual\s+Intro|Side\s+Head\w*)\s*[:\-—–]?\s*.*$/i;

    let blockIndex = 0;
    for (const p of parts) {
      if (p.type === 'math') {
        const plain = toPlainMathText(p.value);
        if (p.via === 'bracket' || p.via === 'dollars') {
          // Prefer H2 tool for display math; fallback paragraph
          blocks.push({ kind: 'h2', html: `<p><span class=\"chx-math chx-math-block\">${renderTex(p.value)}</span></p>`, forH2: true, textPlain: plain });
        } else {
          blocks.push({ kind: 'p', html: `<p><span class=\"chx-math chx-math-block\">${renderTex(p.value)}</span></p>` });
        }
        continue;
      }
      const lines = p.value.split(/\n+/);
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        // Drop orphan list markers that were separated from a following math block
        if (/^[-*•]$/.test(line)) continue;

        // Bullet/numbered list lines – keep as list items, but still route inline equations via X2
        if (/^[-*•]\s+/.test(line)) {
          const body = line.replace(/^[-*•]\s+/, '').trim();
          // Chemistry in list items → prefer H2 tool for the whole body
          if (looksChemistry(body)) {
            const html = `<p>${escapeHtml(body)}</p>`;
            blocks.push({ idx: blockIndex++, kind: 'list-seq', list: 'ul', segments: [{ type: 'h2', text: body }], html, raw: body, preferH2: true });
            continue;
          }
          // Explicit tool markers inside list body
          const mkSegs = splitByToolMarkers(body);
          if (mkSegs && mkSegs.length) {
            const htmlBody = mkSegs.map(sg => sg.type === 'x2'
              ? `<span class=\"chx-math-inline\">${escapeHtml(normalizeX2Text(sg.text))}</span>`
              : sg.type === 'h2'
                ? `<span class=\"chx-math-inline\">${escapeHtml(normalizeX2Text(sg.text))}</span>`
                : sg.type === 'bold'
                  ? `<b>${inline(sg.text)}</b>`
                  : sg.type === 'underline'
                    ? `<u>${inline(sg.text)}</u>`
                    : inline(sg.text)).join('');
            const html = `<p>${htmlBody}</p>`;
            blocks.push({ idx: blockIndex++, kind: 'list-seq', list: 'ul', segments: mkSegs, raw: body, html, preferH2: wantsH2ForMixed(body) });
            continue;
          }
          // If the bullet item itself is a known textual heading, treat as heading
          if (headingRe.test(body)) {
            const m = body.match(/^(.*?)([:\-—–])\s*(.*)$/);
            if (m && m[1]) {
              const head = m[1].trim().replace(/[:\-—–]\s*$/, '');
              const tail = (m[3] || '').trim();
              blocks.push({ idx: blockIndex++, kind: 'p', html: `<p><strong>${escapeHtml(head + ':')}</strong></p>`, raw: head + ':' });
              if (tail) {
                const hasMathish = /[=+\-×x*/÷^]|\\\\|\$|\\\(|\\\)|\\\[|\\\]|\\[a-zA-Z]+|\d\s*%|%\s*\d/.test(tail);
                const forceX2 = /%/.test(tail) || /\\?frac\b/i.test(tail);
                if (options.useX2 && (hasMathish || forceX2)) {
                  // Prefer inline segmentation to keep units as plain text
                  const segs = splitMixedMathText(tail);
            if (segs && segs.length) {
              const preview = `<p>${escapeHtml(tail)}</p>`;
              blocks.push({ idx: blockIndex++, kind: 'seq', segments: segs, html: preview, raw: tail, preferH2: wantsH2ForMixed(tail) });
            } else {
              const mUnits = tail.match(/^\s*([A-Za-z0-9\s=+\-×x*/·\.()^_\\]+?)\s{1,3}([A-Za-z][A-Za-z0-9\-_/ ]{1,64})\s*$/);
              if (mUnits && /[=)(^\d]/.test(mUnits[1])) {
                const calc = mUnits[1].trim();
                const units = mUnits[2].trim();
                const segs2 = [ { type: 'x2', text: calc }, { type: 'text', text: ' ' + units } ];
                const preview2 = `<p>${escapeHtml(calc)} ${escapeHtml(units)}</p>`;
                blocks.push({ idx: blockIndex++, kind: 'seq', segments: segs2, html: preview2, raw: tail, preferH2: true });
              } else {
                blocks.push({ idx: blockIndex++, kind: 'h2', tool: 'x2', html: `<p>${escapeHtml(tail)}</p>`, plain: tail, raw: tail });
              }
            }
                } else if (options.useH2 && /^\s*(\$\$|\\\[)/.test(tail)) {
                  const inner = tail.replace(/^\$\$|\$\$$|^\\\[|\\\]$/g, '');
                  blocks.push({ idx: blockIndex++, kind: 'h2', tool: 'h2', html: `<p><span class=\"chx-math chx-math-block\">${renderTex(inner)}</span></p>`, plain: toPlainMathText(inner), raw: inner });
                } else {
                  blocks.push({ idx: blockIndex++, kind: 'p', html: `<p>${inline(tail)}</p>`, raw: tail });
                }
              }
              continue;
            } else {
              const content = body.replace(/[:\-—–]\s*$/, '');
              blocks.push({ idx: blockIndex++, kind: 'p', html: `<p><strong>${escapeHtml(content)}</strong></p>`, raw: content });
              continue;
            }
          }
          const segs = splitMixedMathText(body);
          const htmlBody = segs && segs.length
            ? segs.map(sg => sg.type === 'x2' ? `<span class=\"chx-math-inline\">${escapeHtml(normalizeX2Text(sg.text))}</span>` : inline(sg.text)).join('')
            : inline(body);
          // Preview as plain line (no bullets)
          const html = `<p>${htmlBody}</p>`;
          blocks.push({ idx: blockIndex++, kind: 'list-seq', list: 'ul', segments: segs || [], raw: body, html, preferH2: wantsH2ForMixed(body) });
          continue;
        }
        if (/^\d+\.\s+/.test(line)) {
          const body = line.replace(/^\d+\.\s+/, '').trim();
          if (looksChemistry(body)) {
            const html = `<p>${escapeHtml(body)}</p>`;
            blocks.push({ idx: blockIndex++, kind: 'list-seq', list: 'ol', segments: [{ type: 'h2', text: body }], html, raw: body, preferH2: true });
            continue;
          }
          const mkSegs2 = splitByToolMarkers(body);
          if (mkSegs2 && mkSegs2.length) {
            const htmlBody = mkSegs2.map(sg => sg.type === 'x2'
              ? `<span class=\"chx-math-inline\">${escapeHtml(normalizeX2Text(sg.text))}</span>`
              : sg.type === 'h2'
                ? `<span class=\"chx-math-inline\">${escapeHtml(normalizeX2Text(sg.text))}</span>`
                : sg.type === 'bold'
                  ? `<b>${inline(sg.text)}</b>`
                  : sg.type === 'underline'
                    ? `<u>${inline(sg.text)}</u>`
                    : inline(sg.text)).join('');
            const html = `<p>${htmlBody}</p>`;
            blocks.push({ idx: blockIndex++, kind: 'list-seq', list: 'ol', segments: mkSegs2, raw: body, html, preferH2: wantsH2ForMixed(body) });
            continue;
          }
          if (headingRe.test(body)) {
            const m = body.match(/^(.*?)([:\-—–])\s*(.*)$/);
            if (m && m[1]) {
              const head = m[1].trim().replace(/[:\-—–]\s*$/, '');
              const tail = (m[3] || '').trim();
              blocks.push({ idx: blockIndex++, kind: 'p', html: `<p><strong>${escapeHtml(head + ':')}</strong></p>`, raw: head + ':' });
              if (tail) {
                const hasMathish = /[=+\-×x*/÷^]|\\\\|\$|\\\(|\\\)|\\\[|\\\]|\\[a-zA-Z]+|\d\s*%|%\s*\d/.test(tail);
                const forceX2 = /%/.test(tail) || /\\?frac\b/i.test(tail);
                if (options.useX2 && (hasMathish || forceX2)) {
                  blocks.push({ idx: blockIndex++, kind: 'h2', tool: 'x2', html: `<p>${escapeHtml(tail)}</p>`, plain: tail, raw: tail });
                } else if (options.useH2 && /^\s*(\$\$|\\\[)/.test(tail)) {
                  const inner = tail.replace(/^\$\$|\$\$$|^\\\[|\\\]$/g, '');
                  blocks.push({ idx: blockIndex++, kind: 'h2', tool: 'h2', html: `<p><span class=\"chx-math chx-math-block\">${renderTex(inner)}</span></p>`, plain: toPlainMathText(inner), raw: inner });
                } else {
                  blocks.push({ idx: blockIndex++, kind: 'p', html: `<p>${inline(tail)}</p>`, raw: tail });
                }
              }
              continue;
            } else {
              const content = body.replace(/[:\-—–]\s*$/, '');
              blocks.push({ idx: blockIndex++, kind: 'p', html: `<p><strong>${escapeHtml(content)}</strong></p>`, raw: content });
              continue;
            }
          }
          const segs = splitMixedMathText(body);
          const htmlBody = segs && segs.length
            ? segs.map(sg => sg.type === 'x2' ? `<span class=\"chx-math-inline\">${escapeHtml(normalizeX2Text(sg.text))}</span>` : inline(sg.text)).join('')
            : inline(body);
          const html = `<p>${htmlBody}</p>`;
          blocks.push({ idx: blockIndex++, kind: 'list-seq', list: 'ol', segments: segs || [], raw: body, html, preferH2: wantsH2ForMixed(body) });
          continue;
        }

        // Textual headings (e.g., "Formulas:")
        if (headingRe.test(line)) {
          // If trailing content after ':' looks like a calculation/formula, split into two blocks
          const sepIdx = (() => { const m = line.match(/[:\-—–]/); return m ? m.index : -1; })();
          if (sepIdx !== -1 && sepIdx < line.length - 1) {
            const head = line.slice(0, sepIdx + 1).trim().replace(/[:\-—–]\s*$/, ':');
            const tail = line.slice(sepIdx + 1).trim();
            const hasMathish = /[=+\-×x*/÷^]|\\\\|\$|\\\(|\\\)|\\\[|\\\]|\\[a-zA-Z]+|\d\s*%|%\s*\d/.test(tail);
            const forceX2 = /%/.test(tail) || /\\?frac\b/i.test(tail);
            // Always push the heading in bold
            blocks.push({ idx: blockIndex++, kind: 'p', html: `<p><strong>${escapeHtml(head)}</strong></p>`, raw: head });
            if (tail) {
              if (looksChemistry(tail)) {
                blocks.push({ idx: blockIndex++, kind: 'h2', tool: 'h2', html: `<p>${escapeHtml(tail)}</p>`, plain: tail, raw: tail });
              } else
              if (options.useX2 && (hasMathish || forceX2)) {
                // Prefer inline segmentation to keep units as plain text
                const segs = splitMixedMathText(tail);
                if (segs && segs.length) {
                  const preview = `<p>${escapeHtml(tail)}</p>`;
                  blocks.push({ idx: blockIndex++, kind: 'seq', segments: segs, html: preview, raw: tail, preferH2: wantsH2ForMixed(tail) });
                } else {
                  const mUnits = tail.match(/^\s*([A-Za-z0-9\s=+\-×x*/·\.()^_\\]+?)\s{1,3}([A-Za-z][A-Za-z0-9\-_/ ]{1,64})\s*$/);
                  if (mUnits && /[=)(^\d]/.test(mUnits[1])) {
                    const calc = mUnits[1].trim();
                    const units = mUnits[2].trim();
                    const segs2 = [ { type: 'x2', text: calc }, { type: 'text', text: ' ' + units } ];
                    const preview2 = `<p>${escapeHtml(calc)} ${escapeHtml(units)}</p>`;
                    blocks.push({ idx: blockIndex++, kind: 'seq', segments: segs2, html: preview2, raw: tail, preferH2: true });
                  } else {
                    blocks.push({ idx: blockIndex++, kind: 'h2', tool: 'x2', html: `<p>${escapeHtml(tail)}</p>`, plain: tail, raw: tail });
                  }
                }
              } else if (options.useH2 && /^\s*(\$\$|\\\[)/.test(tail)) {
                // display math tail
                const inner = tail.replace(/^\$\$|\$\$$|^\\\[|\\\]$/g, '');
                blocks.push({ idx: blockIndex++, kind: 'h2', tool: 'h2', html: `<p><span class=\"chx-math chx-math-block\">${renderTex(inner)}</span></p>`, plain: toPlainMathText(inner), raw: inner });
              } else {
                // Plain paragraph tail
                blocks.push({ idx: blockIndex++, kind: 'p', html: `<p>${inline(tail)}</p>`, raw: tail });
              }
            }
            continue;
          }
          // No trailing content: keep as bold paragraph
          const content = line.replace(/[:\-—–]\s*$/, '');
          blocks.push({ idx: blockIndex++, kind: 'p', html: `<p><strong>${escapeHtml(content)}</strong></p>`, raw: content });
          continue;
        }

        // Chemistry line without explicit markers → prefer H2
        if (looksChemistry(line)) {
          blocks.push({ idx: blockIndex++, kind: 'h2', tool: 'h2', html: `<p>${escapeHtml(line)}</p>`, plain: line, raw: line });
          continue;
        }
        // Explicit tool markers take precedence for plain lines
        const mkSegs3 = splitByToolMarkers(line);
        if (mkSegs3 && mkSegs3.length) {
          const htmlBody = mkSegs3.map(sg => sg.type === 'x2'
            ? `<span class=\"chx-math-inline\">${escapeHtml(normalizeX2Text(sg.text))}</span>`
            : sg.type === 'h2'
              ? `<span class=\"chx-math-inline\">${escapeHtml(normalizeX2Text(sg.text))}</span>`
              : sg.type === 'bold'
                ? `<b>${inline(sg.text)}</b>`
                : sg.type === 'underline'
                  ? `<u>${inline(sg.text)}</u>`
                  : inline(sg.text)).join('');
          blocks.push({ idx: blockIndex++, kind: 'seq', segments: mkSegs3, html: `<p>${htmlBody}</p>`, raw: line, preferH2: wantsH2ForMixed(line) });
          continue;
        }

        // Mixed inline math/text segmentation: treat numeric/formula runs as X2, preserving same-line order
        if (options.useX2) {
          const segs = splitMixedMathText(line);
          if (segs && segs.length) {
            const preview = `<p>${escapeHtml(line)}</p>`;
            blocks.push({ idx: blockIndex++, kind: 'seq', segments: segs, html: preview, raw: line, preferH2: wantsH2ForMixed(line) });
            continue;
          }
        }

        // Heuristic percent rule (kept minimal): if percent with digits or equals/operators
        const hasPercentCalc = /\d\s*%|%\s*\d|%.*[=+\-×x*/÷]/.test(line);
        if (options.useX2 && hasPercentCalc) {
          const text = line;
          blocks.push({ idx: blockIndex++, kind: 'h2', tool: 'x2', html: `<p>${escapeHtml(text)}</p>`, plain: text, raw: text });
          continue;
        }

        // Split inline math segments \( ... \) or $...$ (optional)
        if (options.splitInlineMath) {
          const segments = []; let pos = 0; let mA; const reA = /\\\(([\s\S]+?)\\\)/g; const reB = /\$([\s\S]+?)\$/g; const reC = /\/\(([\s\S]+?)\/\)/g; const mm = [];
          while ((mA = reA.exec(line)) !== null) mm.push({ s: mA.index, e: reA.lastIndex, inner: mA[1] });
          let mB; while ((mB = reB.exec(line)) !== null) { const inn = mB[1]; if (/(\\|\^|_|\{|\}|\d\s*[+\-×x*/÷=]|\\frac|\\sqrt)/.test(inn)) mm.push({ s: mB.index, e: reB.lastIndex, inner: inn }); }
          let mC; while ((mC = reC.exec(line)) !== null) { const inn = mC[1]; if (/(\\|\^|_|\{|\}|\d\s*[+\-×x*/÷=]|\\frac|\\sqrt)/.test(inn)) mm.push({ s: mC.index, e: reC.lastIndex, inner: inn }); }
          mm.sort((a,b)=>a.s-b.s);
          if (mm.length) {
            for (const mt of mm) {
              const before = line.slice(pos, mt.s);
              if (before.trim()) blocks.push({ idx: blockIndex++, kind: 'p', html: `<p>${inline(before.trim())}</p>`, raw: before.trim() });
              const mathTxt = mt.inner.trim();
              const chem = looksChemistry(mathTxt);
              if (chem && options.useH2) {
                blocks.push({ idx: blockIndex++, kind: 'h2', tool: 'h2', html: `<p>${escapeHtml(mathTxt)}</p>`, plain: mathTxt, raw: mathTxt });
              } else if (options.useX2) {
                blocks.push({ idx: blockIndex++, kind: 'h2', tool: 'x2', html: `<p>${escapeHtml(mathTxt)}</p>`, plain: mathTxt, raw: mathTxt });
              } else {
                blocks.push({ idx: blockIndex++, kind: 'p', html: `<p>${escapeHtml(mathTxt)}</p>`, raw: mathTxt });
              }
              pos = mt.e;
            }
            const tail = line.slice(pos);
            if (tail.trim()) blocks.push({ idx: blockIndex++, kind: 'p', html: `<p>${inline(tail.trim())}</p>`, raw: tail.trim() });
            continue;
          }
        }

        // Optional split: calc + trailing units (disabled by default to preserve structure)
        if (options.splitInlineMath) {
          const calcUnits = line.match(/^\s*([A-Za-z0-9\s=+\-×x*/·\.()^_\\]+?)\s{1,3}([A-Za-z][A-Za-z0-9\-_/ ]{1,64})\s*$/);
          if (calcUnits && /[=)(^\d]/.test(calcUnits[1])) {
            const calc = calcUnits[1].trim();
            const units = calcUnits[2].trim();
            // Keep calculation and units on one line: paste X2 for calc, then plain text units
            if (options.useX2) {
              const segs = [ { type: 'x2', text: calc }, { type: 'text', text: ' ' + units } ];
              const preview = `<p>${escapeHtml(calc)} ${escapeHtml(units)}</p>`;
              blocks.push({ idx: blockIndex++, kind: 'seq', segments: segs, html: preview, raw: line });
            } else {
              blocks.push({ idx: blockIndex++, kind: 'p', html: `<p>${inline(calc + ' ' + units)}</p>`, raw: calc + ' ' + units });
            }
            continue;
          }
        }

        const renderedLine = renderMarkdown(line).replace(/^<div class=\"chx-answer__content\">|<\/div>$/g, '');
        blocks.push({ idx: blockIndex++, kind: 'p', html: renderedLine, raw: line });
      }
    }
    // Merge adjacent simple inline blocks into a single paragraph
    const __merged = mergeInlineBlocks(blocks);
    blocks.length = 0; Array.prototype.push.apply(blocks, __merged);
    // Ensure every block has a stable idx for overrides
    for (const b of blocks) { if (typeof b.idx !== 'number') { b.idx = blockIndex++; } }
    // Apply per-block overrides (h2, x2, p, ul, ol)
    if (options.overrides && typeof options.overrides === 'object') {
      for (const b of blocks) {
        const ov = options.overrides[b.idx];
        if (!ov) continue;
        const choice = String(ov).toLowerCase();
        const text = ((b.raw != null ? String(b.raw) : (b.plain != null ? String(b.plain) : htmlText(b.html || ''))) || '').trim();
        if (choice === 'h2') {
          // Keep preview visual as plain text; mark tool for paste
          b.kind = 'h2'; b.tool = 'h2'; b.plain = text; b.html = `<p>${escapeHtml(text)}</p>`;
        } else if (choice === 'x2') {
          // X2 preview as plain text; paste will use X2
          b.kind = 'h2'; b.tool = 'x2'; b.plain = text; b.html = `<p>${escapeHtml(text)}</p>`;
        } else if (choice === 'p' || choice === 'plain' || choice === 'text') {
          b.kind = 'p'; delete b.tool; delete b.plain; b.html = `<p>${inline(text)}</p>`;
        } else if (choice === 'ul') {
          // Keep preview as plain text; prepare list HTML for paste
          b.kind = 'p'; delete b.tool; delete b.plain; b.pasteHtml = `<ul><li>${inline(text)}</li></ul>`; b.html = `<p>${inline(text)}</p>`;
        } else if (choice === 'ol') {
          b.kind = 'p'; delete b.tool; delete b.plain; b.pasteHtml = `<ol><li>${inline(text)}</li></ol>`; b.html = `<p>${inline(text)}</p>`;
        } else if (choice === 'bold' || choice === 'b') {
          // Show bold in preview; paste bold HTML
          b.kind = 'p'; delete b.tool; delete b.plain; b.html = `<p><strong>${inline(text)}</strong></p>`; b.pasteHtml = `<p><strong>${inline(text)}</strong></p>`;
        } else if (choice === 'underline' || choice === 'u') {
          b.kind = 'p'; delete b.tool; delete b.plain; b.html = `<p><u>${inline(text)}</u></p>`; b.pasteHtml = `<p><u>${inline(text)}</u></p>`;
        }
      }
    }
    return blocks;
  }

  // Identify numeric/formula runs within a line for inline X2 insertion
  function splitMixedMathText(line) {
    if (!line || !(/\d|[≈≃≅∼~><≥≤→←↔=±]/.test(line))) return null;
    const s = String(line);
    // Numbers only for X2; exclude trailing letter units like "capsules", "km", "ml", etc.
    // Allow a trailing percent or degree (°C/°F) to remain inside X2.
    const num = String.raw`(?:>\s*)?\d[\d,\s]*(?:\.\d+)?(?:\s*%|\s*°[CF])?`;
    const op = String.raw`(?:→|←|↔|[+\-×x*/·÷=><≥≤≈±])`;
    const prefix = String.raw`(?:\s*(?:≈|~|≥|≤|>|<|→|←|↔|±)\s*)?`;
    const numRun = new RegExp(`${prefix}${num}(?:\s*${op}\s*${num})*`, 'g');
    const brackets = [];
    const r1 = /\\\(([\s\S]+?)\\\)/g;
    const r2 = /\\\[([\s\S]+?)\\\]/g;
    const r3 = /\\$([\s\S]+?)\\$/g;
    // Slash-wrapped inline math: /( ... /)
    const r4 = /\/\(([^)]{1,300})\s*\/\)/g;
    const r5 = /\(([^)]{1,300})\)/g;
    let m;
    const add = (sIdx, eIdx) => { if (eIdx > sIdx) brackets.push({ s: sIdx, e: eIdx }); };
    while ((m = r1.exec(s)) !== null) add(m.index, r1.lastIndex);
    while ((m = r2.exec(s)) !== null) add(m.index, r2.lastIndex);
    while ((m = r3.exec(s)) !== null) add(m.index, r3.lastIndex);
    while ((m = r4.exec(s)) !== null) add(m.index, r4.lastIndex);
    let m5; while ((m5 = r5.exec(s)) !== null) { if (/[0-9=+\-×x*/·÷^><≥≤]/.test(m5[1])) add(m5.index, r5.lastIndex); }
    brackets.sort((a,b)=>a.s-b.s);
    const segs = [];
    let last = 0;
    const consume = (start, end, type) => {
      if (start > last) segs.push({ type: 'text', text: s.slice(last, start) });
      segs.push({ type, text: s.slice(start, end) });
      last = end;
    };
    for (const b of brackets) consume(b.s, b.e, 'x2');
    let mm; numRun.lastIndex = last;
    while ((mm = numRun.exec(s)) !== null) {
      if (mm.index >= last) consume(mm.index, numRun.lastIndex, 'x2');
    }
    if (last < s.length) segs.push({ type: 'text', text: s.slice(last) });
    return segs.some(seg => seg.type === 'x2') ? segs : null;
  }

  // Split a line into segments based on explicit tool markers like [[H2]]text[[/H2]]
  function splitByToolMarkers(line) {
    if (!line) return null;
    let s = String(line);
    s = s.replace(/\[(h2|x2|b|u)\s*\{([^}]+)\}\s*\1\]/gi, (m, tag, body) => `[[${tag.toUpperCase()}]]${body}[[/${tag.toUpperCase()}]]`);
    if (s.indexOf('[[') === -1) return null;
    const rx = /\[\[(H2|X2|B|U)\]\]([\s\S]+?)\[\[\/\1\]\]/g;
    let last = 0; let m; const segs = [];
    while ((m = rx.exec(s)) !== null) {
      const before = s.slice(last, m.index);
      if (before) segs.push({ type: 'text', text: before });
      const kind = m[1].toUpperCase();
      const val = m[2];
      if (kind === 'H2') segs.push({ type: 'h2', text: val });
      else if (kind === 'X2') segs.push({ type: 'x2', text: val });
      else if (kind === 'B') segs.push({ type: 'bold', text: val });
      else if (kind === 'U') segs.push({ type: 'underline', text: val });
      last = rx.lastIndex;
    }
    const tail = s.slice(last);
    if (tail) segs.push({ type: 'text', text: tail });
    return segs.length ? segs : null;
  }

  // Merge adjacent simple inline blocks (plain text + inline tools) into one paragraph
  function mergeInlineBlocks(blocks) {
    const out = [];
    let cur = null;
    const flush = () => { if (cur) { out.push(cur); cur = null; } };
    const segFromBlock = (b) => {
      if (!b) return null;
      if (b.kind === 'p') {
        // skip headings/underline/strong paragraphs from merging
        if (/^<p><strong>|^<p><u>/.test(b.html || '')) return null;
        const t = htmlText(b.html || '') || '';
        return { type: 'text', text: t };
      }
      if (b.kind === 'h2' && (b.tool === 'x2' || b.viaTool)) {
        return { type: 'x2', text: b.plain || b.textPlain || htmlText(b.html || '') };
      }
      if (b.kind === 'h2' && b.tool === 'h2') {
        return { type: 'h2', text: b.plain || b.textPlain || htmlText(b.html || '') };
      }
      return null;
    };
    const pushSeg = (seg) => {
      if (!cur) cur = { kind: 'seq', segments: [], html: '', raw: '' };
      const last = cur.segments[cur.segments.length - 1];
      if (last && last.type === 'text' && seg.type === 'text' && !/\s$/.test(last.text || '')) {
        last.text += ' ';
      }
      cur.segments.push(seg);
    };
    for (const b of blocks) {
      const seg = segFromBlock(b);
      if (seg) { pushSeg(seg); continue; }
      flush();
      out.push(b);
    }
    flush();
    return out;
  }

  // Decide tool for mixed lines: use H2 if the line contains real words/units,
  // but still prefer X2 for pure calculations and math functions like sqrt/sin/ln.
  function wantsH2ForMixed(line) {
    if (!line) return false;
    const s = String(line);
    // If there's an explicit unit pattern like "/day" or trailing units, prefer H2
    if (/\/[A-Za-z]/.test(s)) return true;
    if (/\b(caps?|capsule[s]?|day[s]?|week[s]?|month[s]?|unit[s]?|inventory|level|period|order|quantity)\b/i.test(s)) return true;
    // Whitelist common math words/functions and short symbols
    const allow = new Set(['sqrt','sin','cos','tan','cot','sec','csc','ln','log','exp','min','max','floor','ceil','sigma','alpha','beta','gamma','delta','theta','lambda','mu','nu','rho','phi','psi','omega']);
    const words = s.match(/[A-Za-z]{2,}/g) || [];
    for (const w of words) {
      const lw = w.toLowerCase();
      if (allow.has(lw)) continue;
      // Variables of length <= 3 are likely fine (T, L, Tar)
      if (w.length <= 3) continue;
      return true; // A longer non-whitelisted word suggests text/units → prefer H2
    }
    return false;
  }

  function normalizeX2Text(s) {
    try {
      let t = String(s || '').trim();
      // Remove LaTeX inline/display wrappers
      const unwrap = (rx) => { const m = t.match(rx); if (m) t = m[1]; };
      unwrap(/^\\\(([\s\S]+)\\\)$/); // \( ... \)
      unwrap(/^\\\[([\s\S]+)\\\]$/); // \[ ... \]
      unwrap(/^\$\$([\s\S]+)\$\$$/);   // $$ ... $$
      unwrap(/^\$([\s\S]+)\$$/);       // $ ... $
      // /( ... /) → treat as formula content
      // /( ... /) — treat as inline math wrapper
      const mSlash = t.match(/^\/\(([^)]{1,400})\s*\/\)$/);
      if (mSlash) t = mSlash[1];
      // Plain parentheses when contents looks math‑ish
      const mPar = t.match(/^\(([^)]{1,400})\)$/);
      if (mPar && /[0-9=+\-×x*/·÷^><≥≤]/.test(mPar[1])) t = mPar[1];
      // Convert common LaTeX to plain for inline tool
      t = toPlainMathText(t);
      return t;
    } catch { return String(s || ''); }
  }

  async function pasteBlocksWithH2(editor, blocks, stepEl, opts) {
    const options = Object.assign({ allowTools: true }, opts || {});
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      // New: handle mixed inline sequences (text + X2) on the same line
      if (b && b.kind === 'seq' && Array.isArray(b.segments)) {
        let prevWasX2 = false;
        const preferH2 = !!b.preferH2 || wantsH2ForMixed(b.raw || '');
        for (const seg of b.segments) {
          const t = seg && typeof seg.text === 'string' ? seg.text : '';
          if (!t) continue;
          // Re-anchor caret before each segment to avoid sticking inside the last X2 node
          try { placeCaretAtEnd(editor); } catch {}
          // Auto-upgrade percent fragments to X2
          const forceX2 = options.allowTools && seg.type === 'text' && /%/.test(t);
          if (options.allowTools && (seg.type === 'x2' || forceX2)) {
            const isInlineWrapped = /^\s*(?:\\\([\s\S]{1,800}\\\)|\$[\s\S]{1,800}\$|\/\([^)]{1,800}\/\))\s*$/.test(t);
            const chemPreferH2 = looksChemistry(t);
            const expr = normalizeX2Text(t);
            let ok = false;
            const isFraction = /\\frac\b|\b\d[\d\s.,]*\s*\/\s*\d[\d\s.,]*\b|\([^)]{1,200}\)\s*\/\s*\([^)]{1,200}\)/.test(expr);
            const preferX2First = (isFraction || isInlineWrapped) && !chemPreferH2;
            if ((preferH2 && !preferX2First) || chemPreferH2) {
              ok = await openH2AndPaste(expr, stepEl, editor);
              if (!ok) ok = await openX2AndPaste(expr, stepEl, editor);
            } else {
              ok = await openX2AndPaste(expr, stepEl, editor);
              if (!ok && preferH2) ok = await openH2AndPaste(expr, stepEl, editor);
              else if (!ok) ok = await openH2AndPaste(expr, stepEl, editor);
            }
            if (!ok) await pastePlainText(editor, expr);
          } else if (options.allowTools && seg.type === 'h2') {
            const expr = normalizeX2Text(t);
            let ok = await openH2AndPaste(expr, stepEl, editor);
            if (!ok) ok = await openX2AndPaste(expr, stepEl, editor);
            if (!ok) await pastePlainText(editor, expr);
          } else if (seg.type === 'bold') {
            await pasteHtml(editor, `<span><b>${inline(t)}</b></span>`);
          } else if (seg.type === 'underline') {
            await pasteHtml(editor, `<span><u>${inline(t)}</u></span>`);
          } else {
            // If plain text follows immediately after an X2 segment, ensure a space
            const needsSpace = prevWasX2 && /^[A-Za-z]/.test(t);
            const txt = needsSpace ? (' ' + t) : t;
            await pasteHtml(editor, `<span>${inline(txt)}</span>`);
          }
          prevWasX2 = seg.type === 'x2';
          await delay(seg.type === 'x2' ? 140 : 30);
        }
      } else if (b && b.kind === 'list-seq' && Array.isArray(b.segments)) {
        // Paste list lines as plain lines (no bullets)
        let prevWasX2 = false;
        const preferH2 = !!b.preferH2 || wantsH2ForMixed(b.raw || '');
        for (const seg of b.segments) {
          const t = seg && typeof seg.text === 'string' ? seg.text : '';
          if (!t) continue;
          try { placeCaretAtEnd(editor); } catch {}
          const forceX2 = options.allowTools && seg.type === 'text' && /%/.test(t);
          if (options.allowTools && (seg.type === 'x2' || forceX2)) {
            const isInlineWrapped = /^\s*(?:\\\([\s\S]{1,800}\\\)|\$[\s\S]{1,800}\$|\/\([^)]{1,800}\/\))\s*$/.test(t);
            const chemPreferH2 = looksChemistry(t);
            const expr = normalizeX2Text(t);
            let ok = false;
            const isFraction = /\\frac\b|\b\d[\d\s.,]*\s*\/\s*\d[\d\s.,]*\b|\([^)]{1,200}\)\s*\/\s*\([^)]{1,200}\)/.test(expr);
            const preferX2First = (isFraction || isInlineWrapped) && !chemPreferH2;
            if ((preferH2 && !preferX2First) || chemPreferH2) {
              ok = await openH2AndPaste(expr, stepEl, editor);
              if (!ok) ok = await openX2AndPaste(expr, stepEl, editor);
            } else {
              ok = await openX2AndPaste(expr, stepEl, editor);
              if (!ok && preferH2) ok = await openH2AndPaste(expr, stepEl, editor);
              else if (!ok) ok = await openH2AndPaste(expr, stepEl, editor);
            }
            if (!ok) await pastePlainText(editor, expr);
          } else if (options.allowTools && seg.type === 'h2') {
            const expr = normalizeX2Text(t);
            let ok = await openH2AndPaste(expr, stepEl, editor);
            if (!ok) ok = await openX2AndPaste(expr, stepEl, editor);
            if (!ok) await pastePlainText(editor, expr);
          } else if (seg.type === 'bold') {
            await pasteHtml(editor, `<span><b>${inline(t)}</b></span>`);
          } else if (seg.type === 'underline') {
            await pasteHtml(editor, `<span><u>${inline(t)}</u></span>`);
          } else {
            const needsSpace = prevWasX2 && /^[A-Za-z]/.test(t);
            const txt = needsSpace ? (' ' + t) : t;
            await pasteHtml(editor, `<span>${inline(txt)}</span>`);
          }
          prevWasX2 = seg.type === 'x2';
          await delay(seg.type === 'x2' ? 130 : 20);
        }
      } else if (options.allowTools && b.kind === 'h2' && (b.tool === 'x2' || b.viaTool) && b.plain) {
        // Use X2 for calculations
        const expr = normalizeX2Text(b.plain || '');
        const ok = await openX2AndPaste(expr, stepEl, editor);
        if (!ok) await pasteHtml(editor, compatHtml(b.pasteHtml || b.html));
      } else if (options.allowTools && b.kind === 'h2' && b.forH2 && (b.textPlain || b.plain)) {
        // Display/formula blocks — use H2 first; fallback to X2, then HTML
        const expr = normalizeX2Text(b.textPlain || b.plain || '');
        let ok = await openH2AndPaste(b.textPlain || b.plain || expr, stepEl, editor);
        if (!ok) ok = await openX2AndPaste(expr, stepEl, editor);
        if (!ok) await pasteHtml(editor, compatHtml(b.pasteHtml || b.html));
      } else if (options.allowTools && b.kind === 'h2' && b.tool === 'h2' && b.plain) {
        // Use H2 for textual headings/labels
        const ok = await openH2AndPaste(b.plain, stepEl, editor);
        if (!ok) await pasteHtml(editor, compatHtml(b.pasteHtml || b.html));
      } else if (b.kind === 'html') {
        await pasteHtml(editor, compatHtml(b.pasteHtml || b.html));
      } else if (b.kind === 'p' && /^<p><strong>/.test(b.html)) {
        // Bold block — prefer toolbar bold to ensure Chegg applies style
        const text = htmlText(b.html);
        let ok = false;
        try { placeCaretAtEnd(editor); } catch {}
        try { ok = await applyStyleAndPaste(editor, text, 'bold', stepEl); } catch {}
        if (!ok) {
          // Fallback to direct HTML paste
          await pasteHtml(editor, compatHtml(b.pasteHtml || b.html));
        }
      } else if (b.kind === 'p' && /^<p><u>/.test(b.html)) {
        // Underline block — paste exact HTML
        await pasteHtml(editor, compatHtml(b.pasteHtml || b.html));
      } else {
        await pasteHtml(editor, compatHtml(b.pasteHtml || b.html));
      }
      // Add a break between blocks (not after the last one)
      if (i < blocks.length - 1) {
        const next = blocks[i + 1];
        // For inline sequence lines, avoid creating a new paragraph. Use a simple line break instead.
        if (b && next && b.kind === 'seq' && next.kind === 'seq') {
          await pasteHtml(editor, '<br/>');
        } else {
          await pasteHtml(editor, '<p><br/></p>');
        }
        await delay(35);
      }
    }
  }

  // Normalize HTML for better editor compatibility (e.g., Chegg sometimes prefers <b>/<i>)
  function compatHtml(html) {
    return String(html || '')
      .replace(/<strong>/g, '<b>')
      .replace(/<\/strong>/g, '</b>')
      .replace(/<em>/g, '<i>')
      .replace(/<\/em>/g, '</i>');
  }

  function htmlText(html) {
    try { const div = document.createElement('div'); div.innerHTML = html; return (div.textContent || '').trim(); } catch { return String(html || '').replace(/<[^>]+>/g, '').trim(); }
  }

  async function applyStyleAndPaste(editor, text, type, scope) {
    try {
      const root = (scope && scope.ownerDocument) ? scope.ownerDocument : document;
      const btn = findStyleButton(scope || document, type);
      const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
      const pressHotkey = () => {
        try {
          const kd = new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', bubbles: true, cancelable: true, ctrlKey: !isMac, metaKey: isMac });
          const ku = new KeyboardEvent('keyup', { key: 'b', code: 'KeyB', bubbles: true, cancelable: true, ctrlKey: !isMac, metaKey: isMac });
          const target = getEditableTarget(editor) || editor || root.body;
          target.dispatchEvent(kd); target.dispatchEvent(ku);
        } catch {}
      };
      // Ensure caret is in editor
      try { placeCaretAtEnd(editor); } catch {}
      // Try toggle-on via toolbar or hotkey
      if (btn && !btn.disabled) { btn.click(); }
      else { pressHotkey(); }
      await delay(100);
      await pastePlainText(editor, text);
      await delay(60);
      // Toggle off to prevent style leaking
      if (btn && !btn.disabled) { btn.click(); }
      else { pressHotkey(); }
      await delay(30);
      return true;
    } catch { return false; }
  }

  function findStyleButton(scope, type) {
    const root = (scope && scope.ownerDocument) ? scope.ownerDocument : document;
    if (type === 'bold') return (scope || root).querySelector("button[data-test='format-bold'], button[aria-label*='Bold' i]") || root.querySelector("button[data-test='format-bold'], button[aria-label*='Bold' i]");
    if (type === 'underline') return (scope || root).querySelector("button[data-test='format-underline'], button[aria-label*='Underline' i]") || root.querySelector("button[data-test='format-underline'], button[aria-label*='Underline' i]");
    return null;
  }

  async function pastePlainText(editor, text) {
    try {
      const target = getEditableTarget(editor);
      target.focus();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      if (document.execCommand) {
        const ok = document.execCommand('insertText', false, text);
        if (ok) return;
      }
      // Fallback
      target.insertAdjacentText('beforeend', text);
      target.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {}
  }

  function placeCaretAtEnd(editor) {
    try {
      const target = getEditableTarget(editor);
      target.focus();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    } catch {}
  }

  function getEditableTarget(node) {
    if (!node) return node;
    try {
      if (node.getAttribute && node.getAttribute('contenteditable') === 'true') return node;
      const ce = node.querySelector && node.querySelector('[contenteditable="true"]');
      if (ce) return ce;
      // Prefer explicit Explanation placeholder if present
      const ph = node.querySelector && node.querySelector("p[data-placeholder*='Add explanation' i], p[data-placeholder*='Explanation' i], p[aria-label*='Explanation' i]");
      if (ph) return ph.closest('[contenteditable="true"]') || ph;
      return node;
    } catch { return node; }
  }

  async function openH2AndPaste(text, stepEl, preferEditor) {
    try {
      const scope = stepEl || document;
      const before = listSmallInputs();
      // Ensure caret is anchored inside the intended editor before opening toolbar widgets
      if (preferEditor) { try { placeCaretAtEnd(preferEditor); } catch {} }
      const btn = findH2Button(scope, preferEditor) || findH2Button(scope);
      if (!btn) return false;
      btn.click();
      let target = await waitForNewSmallInput(before, 2400);
      if (!target) {
        const ae = (scope && scope.ownerDocument ? scope.ownerDocument : document).activeElement;
        if (ae && isVisible(ae) && (ae.getAttribute?.('contenteditable') === 'true' || /^(input|textarea)$/i.test(ae.tagName))) {
          target = ae;
        }
      }
      if (!target) return false;
      await pasteIntoNode(target, text);
      // Try typical confirm buttons or press Enter
      const container = target.closest('[role="dialog"], .popover, .popup, .portal, .menu, .walkme-window, .walkme-custom-balloon, .walkme-tooltip') || target.parentElement;
      if (container) {
        const okBtn = Array.from(container.querySelectorAll('button, [role="button"]')).find(b => /insert|apply|add|done|ok|save|submit/i.test((b.textContent||'').trim()));
        if (okBtn) okBtn.click();
      }
      try { target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } catch {}
      try { target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })); } catch {}
      try { await waitForGone(target, 1600); } catch {}
      try {
        if (preferEditor) { placeCaretAtEnd(preferEditor); }
        else { const ed = pickVisibleEditor(); if (ed) placeCaretAtEnd(ed); }
      } catch {}
      return true;
    } catch (e) { return false; }
  }

  function findH2Button(scope, preferEditor) {
    const root = (scope && scope.ownerDocument) ? scope.ownerDocument : document;
    // Prefer toolbar closest to the preferred editor
    if (preferEditor) {
      const near = preferEditor.closest('[data-test*="explanation" i]') || preferEditor.closest("div[id^='step-'][data-test^='step-']") || scope || root;
      let b = near.querySelector('button[data-test="insert-chem-inline-equation"], button[data-test*="insert-chem-inline-equation" i]');
      if (!b) b = (preferEditor.parentElement || near).querySelector('button[aria-label*="Chem Inline Equation" i], button[aria-label*="Chemdraw" i]');
      if (b) return b;
    }
    // CHEM Inline Equation tool (H2 per your naming)
    let btn = (scope || root).querySelector('button[data-test="insert-chem-inline-equation"], button[data-test*="insert-chem-inline-equation" i]');
    if (btn) return btn;
    btn = (scope || root).querySelector('button[aria-label*="Chem Inline Equation" i], button[aria-label*="Chemdraw" i]');
    if (btn) return btn;
    // Global fallback
    btn = root.querySelector('button[data-test="insert-chem-inline-equation"], button[data-test*="insert-chem-inline-equation" i]');
    if (btn) return btn;
    return null;
  }

  // Build blocks from markdown distinguishing headings, math/formulas and normal paragraphs
  function buildCheggBlocks(markdown = '') {
    let src = String(markdown || '').replace(/\r/g, '');
    // Same normalization as buildH2Blocks: remove list markers directly before display math
    src = src.replace(/(^|\n)[\t ]*[-*•]\s*(?=\\\[)/g, '$1');
    src = src.replace(/(^|\n)[\t ]*[-*•]\s*(?=\$\$)/g, '$1');
    const parts = [];
    const re = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g; // display math chunks
    let last = 0; let m;
    while ((m = re.exec(src)) !== null) {
      const before = src.slice(last, m.index);
      if (before.trim()) parts.push({ type: 'text', value: before.trim() });
      const mathRaw = m[0];
      const isDollars = mathRaw.startsWith('$$');
      const inner = isDollars ? mathRaw.slice(2, -2) : mathRaw.slice(2, -2);
      parts.push({ type: 'math', via: isDollars ? 'dollars' : 'bracket', value: inner.trim() });
      last = re.lastIndex;
    }
    const tail = src.slice(last);
    if (tail.trim()) parts.push({ type: 'text', value: tail.trim() });

    // Further split text parts into lines
    const blocks = [];
    for (const p of parts) {
      
if (p.type === 'math') {
        const plain = toPlainMathText(p.value);
        if (p.via === 'bracket' || p.via === 'dollars') {
          // Prefer H2 tool for display math; fallback paragraph
          blocks.push({ kind: 'h2', html: `<p><span class=\"chx-math chx-math-block\">${renderTex(p.value)}</span></p>`, forH2: true, textPlain: plain });
        } else {
          blocks.push({ kind: 'p', html: `<p><span class=\"chx-math chx-math-block\">${renderTex(p.value)}</span></p>` });
        }
        continue;
      }

      const lines = p.value.split(/\n+/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^[-*•]$/.test(trimmed)) continue; // skip stray markers
        const headingRe = /^(?:Formula|Formulas|Calculation|Calculations|Given|Result|Final Answer|Final Solution|(?:Conce\w+|Conceptual)\s+Intro\w*|Introduction|Conceptual\s+Intro|Side\s+Head\w*)\s*[:\-—–]?\s*.*$/i;
        if (headingRe.test(trimmed)) {
          // Support ':' or dashes as separators
          const sepIdx = (() => { const m = trimmed.match(/[:\-—–]/); return m ? m.index : -1; })();
          if (sepIdx !== -1 && sepIdx < trimmed.length - 1) {
            const head = trimmed.slice(0, sepIdx + 1).trim().replace(/[:\-—–]\s*$/, ':');
            const tail = trimmed.slice(sepIdx + 1).trim();
            const hasMathish = /[=+\-×x*/÷^]|\\\\|\$|\\\(|\\\)|\\\[|\\\]|\\[a-zA-Z]+|\d\s*%|%\s*\d/.test(tail);
            blocks.push({ kind: 'p', html: `<p><strong>${escapeHtml(head)}</strong></p>` });
            if (tail) {
              if (hasMathish) {
                // Inline equation via X2-like conversion is handled by paste phase; here keep plain for preview
                blocks.push({ kind: 'p', html: `<p>${escapeHtml(tail)}</p>` });
              } else {
                const rendered = renderMarkdown(tail).replace(/^<div class=\"chx-answer__content\">|<\/div>$/g, '');
                blocks.push({ kind: 'p', html: rendered });
              }
            }
          } else {
            const content = trimmed.replace(/[:\-—–]\s*$/, '');
            blocks.push({ kind: 'p', html: `<p><strong>${escapeHtml(content)}</strong></p>` });
          }
        } else {
          const rendered = renderMarkdown(trimmed).replace(/^<div class=\"chx-answer__content\">|<\/div>$/g, '');
          blocks.push({ kind: 'p', html: rendered });
        }
      }
    }
    return blocks;
  }

  async function pasteBlocksIntoEditor(editor, blocks, stepEl) {
    if (!Array.isArray(blocks) || !blocks.length) return;
    for (const b of blocks) {
      if (b.kind === 'h2') {
        // Use toolbar tools for math blocks
        let done = false;
        if (b.tool === 'x2' && b.textPlain) {
          done = await openX2AndPaste(b.textPlain, stepEl, editor);
        } else if (b.forH2 && (b.textPlain || b.plain)) {
          // Display math: use H2 first; fallback to X2
          const expr = normalizeX2Text(b.textPlain || b.plain || '');
          done = await openH2AndPaste(b.textPlain || b.plain || expr, stepEl, editor);
          if (!done) done = await openX2AndPaste(expr, stepEl, editor);
        }
        if (!done) {
          await pasteHtml(editor, b.html);
        }
      } else {
        await pasteHtml(editor, b.html);
      }
      await delay(80);
    }
  }

  async function openX2AndPaste(text, stepEl, preferEditor) {
    try {
      const scope = stepEl || document;
      const before = listSmallInputs();
      if (preferEditor) { try { placeCaretAtEnd(preferEditor); } catch {} }
      const btn = findX2Button(scope, preferEditor) || findX2Button(scope);
      if (!btn) return false;
      btn.click();
      // Wait for a new small input to appear
      let target = await waitForNewSmallInput(before, 2400);
      // Fallback: use newly focused editable element if any
      if (!target) {
        const ae = (scope && scope.ownerDocument ? scope.ownerDocument : document).activeElement;
        if (ae && isVisible(ae) && (ae.getAttribute?.('contenteditable') === 'true' || /^(input|textarea)$/i.test(ae.tagName))) {
          target = ae;
        }
      }
      if (!target) return false;
      await pasteIntoNode(target, text);
      // Try to confirm/insert
      const container = target.closest('[role="dialog"], .popover, .popup, .portal, .menu, .walkme-custom-launcher-outer-div, .walkme-tooltip, .walkme-menu, .walkme-window, .walkme-custom-balloon') || target.parentElement;
      if (container) {
        const okBtn = Array.from(container.querySelectorAll('button, [role="button"]')).find(b => /insert|add|apply|done|ok|save|submit/i.test((b.textContent||'').trim()));
        if (okBtn) { okBtn.click(); }
      }
      // Enter as a fallback
      try { target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } catch {}
      try { target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })); } catch {}
      // Wait for the tool input to close before continuing
      try { await waitForGone(target, 1600); } catch {}
      // Ensure caret is placed after the inserted node so following text stays plain
      try {
        if (preferEditor) { placeCaretAtEnd(preferEditor); }
        else {
          const ed = pickVisibleEditor();
          if (ed) placeCaretAtEnd(ed);
        }
      } catch {}
      return true;
    } catch (e) { return false; }
  }

  function findX2Button(scope, preferEditor) {
    const root = (scope && scope.ownerDocument) ? scope.ownerDocument : document;
    const search = (node) => {
      // Strictly target the Inline Equation (X2) button only
      let b = node.querySelector('button[data-test="insert-inline-equation"], button[data-test*="insert-inline-equation" i]');
      if (!b) b = node.querySelector('button[data-test="insert-math-in-text"], button[data-test*="insert-math-in-text" i]');
      if (!b) b = node.querySelector('button[data-test*="inline-math" i], button[data-test*="inline-equation" i]');
      if (!b) b = node.querySelector('button[aria-label="Insert Inline Equation"], button[aria-label*="Inline Equation" i], button[aria-label*="Math in text" i], button[aria-label*="Inline math" i]');
      // Never select Equation Renderer menu
      if (b && (b.getAttribute('data-test') || '').includes('equation-renderer')) b = null;
      return b;
    };
    // Prefer toolbar nearest to the preferred editor
    if (preferEditor) {
      const near = preferEditor.closest('[data-test*="explanation" i]') || preferEditor.closest("div[id^='step-'][data-test^='step-']") || scope || root;
      const local = search(preferEditor.parentElement || near);
      if (local) return local;
    }
    // Prefer button inside the provided scope (step toolbar)
    let btn = search(scope || root);
    if (!btn && scope) {
      // Fallback to global search, but prefer buttons whose closest step container matches scope
      const all = Array.from(root.querySelectorAll('button[data-test*="insert-inline-equation" i], button[data-test*="insert-math-in-text" i], button[aria-label*="Inline Equation" i], button[aria-label*="Math in text" i]'));
      btn = all.find(el => el.closest("div[id^='step-'][data-test^='step-']") === scope) || all[0];
    }
    return btn || null;
  }

  function listSmallInputs() {
    const all = Array.from(document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]'));
    return all.filter(n => isVisible(n) && !n.closest('.ProseMirror'));
  }

  async function waitForNewSmallInput(beforeList, timeoutMs) {
    const beforeSet = new Set(beforeList);
    const start = Date.now();
    while (Date.now() - start < (timeoutMs || 1500)) {
      const now = listSmallInputs();
      for (const n of now) {
        if (!beforeSet.has(n)) {
          const r = n.getBoundingClientRect();
          if (r.width <= 640 && r.height <= 320) return n;
        }
      }
      await delay(120);
    }
    return null;
  }

  async function waitForGone(el, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < (timeoutMs || 1200)) {
      if (!el || !el.isConnected) return true;
      try {
        const r = el.getBoundingClientRect();
        const hidden = el.offsetParent === null || r.width === 0 || r.height === 0;
        if (hidden) return true;
      } catch {}
      await delay(60);
    }
    return false;
  }

  async function pasteIntoNode(node, text) {
    const t = String(text || '').trim();
    if (!t) return;
    if (node.tagName === 'TEXTAREA' || (node.tagName === 'INPUT' && /text|search|email|url|tel/.test(node.type))) {
      node.focus();
      node.value = t;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (node.getAttribute && node.getAttribute('contenteditable') === 'true') {
      node.focus();
      try { document.execCommand('selectAll', false, null); } catch {}
      try { document.execCommand('insertText', false, t); } catch { node.textContent = t; }
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    // Fallback: try to paste into a child input
    const inner = node.querySelector('input[type="text"], textarea, [contenteditable="true"]');
    if (inner) return pasteIntoNode(inner, t);
  }

  function toPlainMathText(tex) {
    let s = String(tex || '');
    s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, (m, a, b) => `(${a})/(${b})`);
    s = s.replace(/\\times/g, '×').replace(/\\cdot/g, '·').replace(/\\div/g, '÷');
    s = s.replace(/\\sqrt\{([^}]*)\}/g, (m, x) => `sqrt(${x})`);
    s = s.replace(/\\text\{([^}]*)\}/g, (m, x) => x);
    s = s.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '');
    s = s.replace(/\\/g, '');
    return s.trim();
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && r.bottom > 0 && r.right > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  }

  async function tryClickH2(scope) {
    try {
      const root = (scope && scope.ownerDocument) ? scope.ownerDocument : document;
      // Prefer buttons with clear labels
      let btn = (scope || root).querySelector('button[aria-label*="Heading 2" i], button[aria-label="H2"], button[data-test*="h2" i]');
      if (!btn) {
        // Find any button that visibly says H2
        const buttons = Array.from(root.querySelectorAll('button'));
        btn = buttons.find(b => /(^|\b)h2(\b|$)/i.test((b.textContent || '').trim()));
      }
      if (!btn) {
        // Try matching by SVG path provided
        const path = root.querySelector('path[d^="M35.506 13.16c1.815-1.929"]');
        if (path) btn = path.closest('button');
      }
      if (btn) { btn.click(); return true; }
    } catch {}
    return false;
  }

  async function waitForAddStepEnabled() {
    const findBtn = () => {
      const root = document;
      const trySelectors = [
        "button[data-test='add-step-button']",
        "button[data-test*='add-step' i]",
        "button[aria-label*='Add step' i]",
        "button[aria-label*='Add another step' i]",
      ];
      for (const sel of trySelectors) { const b = root.querySelector(sel); if (b && !b.disabled) return b; }
      // Search by visible text
      const buttons = Array.from(root.querySelectorAll('button'));
      const byText = buttons.find(b => /add\s+(another\s+)?step/i.test((b.textContent||'').trim()) && !b.disabled);
      if (byText) return byText;
      // Prefer a button near the last step container
      const steps = Array.from(root.querySelectorAll("div[id^='step-'][data-test^='step-']"));
      const last = steps[steps.length - 1];
      if (last) {
        const local = last.querySelector("button[data-test*='add-step' i], button[aria-label*='Add step' i]");
        if (local && !local.disabled) return local;
      }
      return null;
    };
    for (let i = 0; i < 18; i++) { const b = findBtn(); if (b) return b; await delay(220); }
    return findBtn();
  }

  async function pasteIntoChegg(markdownText) {
    try {
      showStatus('Updating… Step 1/3');
      // Ensure step container exists and explanation block is available
      const step = document.querySelector("div[id^='step-'][data-test^='step-'][data-collapsed]") || document.querySelector("[data-test='structured-answer-container']");
      if (!step) { showStatus('Step area not found', true); return; }

      // Click "Insert Explanation" if available
      const explainBtn = document.querySelector("button[data-test$='insert-explanation-button']");
      if (explainBtn) explainBtn.click();

      await delay(300);
      showStatus('Updating… Step 2/3');

      // Find the ProseMirror editor inside the current step
      const editor = step.querySelector('.ProseMirror') || document.querySelector('.ProseMirror');
      if (!editor) { showStatus('Editor not found', true); return; }

      // Convert markdown to simple HTML and inject (normalize strong/em for Chegg)
      const html = compatHtml(
        renderMarkdown(markdownText).replace(/^<div class=\"chx-answer__content\">|<\/div>$/g, '')
      );
      editor.focus();
      // Try privileged paste via execCommand first
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertHTML', false, html);
      } catch (e) {
        editor.innerHTML = html;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }

      showStatus('Updating… Step 3/3');
      // Try to enable "Add another step" automatically
      const addStep = document.querySelector("button[data-test='add-step-button']");
      if (addStep && !addStep.disabled) {
        // optional: do nothing now; user can add more steps if needed
      }

      showStatus('Pasted ✓');
      setTimeout(clearStatus, 1200);
    } catch (e) {
      showStatus('Paste failed', true);
      console.error('Paste error', e);
    }
  }

  function showStatus(text, isErr) {
    const anchor = document.getElementById('chx-answer-btn');
    if (!anchor || !anchor.parentElement) return;
    let pill = document.getElementById('chx-status-pill');
    if (!pill) {
      pill = document.createElement('span');
      pill.id = 'chx-status-pill';
      pill.className = 'chx-status-pill is-busy';
      const dot = document.createElement('span'); dot.className = 'dot'; pill.appendChild(dot);
      const label = document.createElement('span'); label.className = 'label'; pill.appendChild(label);
      anchor.parentElement.appendChild(pill);
    }
    pill.querySelector('.label').textContent = text;
    pill.classList.toggle('is-busy', !/✓|failed|not found/i.test(text));
    if (isErr) pill.style.background = '#c62828';
  }
  function clearStatus() { const pill = document.getElementById('chx-status-pill'); if (pill) pill.remove(); }
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  function labelForModel(m) {
    const name = m.id;
    return `DeepSeek — ${name}`;
  }

  function filterModelsForUI(_list) {
    // Always show a curated set as requested
    const curated = [
      { id: 'deepseek-chat', provider: 'deepseek' },
      { id: 'deepseek-reasoner', provider: 'deepseek' }
    ];
    return curated;
  }

  function modelRowHtml(m) {
    const label = labelForModel(m);
    const value = `${m.provider}:${m.id}`;
    return `<div class="chx-model-row"><div class="chx-model-label">${escapeHtml(label)}</div><input type="checkbox" class="chx-model-check" value="${escapeAttr(value)}"></div>`;
  }

  // ---------- Post‑Paste Structure Review ----------
  function collectAnswerStructure() {
    const steps = [];
    const stepEls = Array.from(document.querySelectorAll("div[id^='step-'][data-test^='step-']"));
    for (const el of stepEls) {
      try {
        const matter = (() => { const box = findMatterContainer(el) || el; return box ? getVisibleText(box) : ''; })();
        const explBox = findExplanationContainer(el, findExplanationEditable(el));
        const explanation = explBox ? getVisibleText(explBox) : '';
        steps.push({ matter: (matter || '').trim(), explanation: (explanation || '').trim() });
      } catch { steps.push({ matter: '', explanation: '' }); }
    }
    const finalEl = document.querySelector("[data-test='step-container-Final solution']") || document.querySelector("[data-test*='final' i]");
    const final = finalEl ? getVisibleText(finalEl) : '';
    return { steps, final: (final || '').trim() };
  }

  function buildStructureReviewPrompt(struct) {
    const system = [
      'You are an assistant that reviews Chegg step-by-step answers for structure and formatting quality.',
      'Check that:',
      '- Steps are logically organized and labeled clearly.',
      '- Mixed text+formula lines do not place words (e.g., units like "capsules", "km", "mL") inside math; only the numeric/formula portion should be in an inline equation tool.',
      '- Display equations are on their own lines and are formatted consistently.',
      '- The Final Answer is present and clearly stated.',
      'Point out exact lines that need fixes and provide the corrected line where words remain plain text and only the formula part is wrapped.',
      'Output sections: Summary; Issues (bullet list with the original line then Corrected line); Recommendations.',
    ].join('\n');
    const lines = [];
    struct.steps.forEach((s, i) => {
      lines.push(`Step ${i + 1} Matter: ${s.matter || '(none)'}`);
      lines.push(`Step ${i + 1} Explanation: ${s.explanation || '(none)'}`);
    });
    lines.push(`Final: ${struct.final || '(none)'}`);
    const user = lines.join('\n');
    return { system, user };
  }

  function stripTicksQuotes(s) {
    return String(s || '').trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
  }

  function parseFixesFromReview(text) {
    const src = String(text || '').replace(/\r/g, '');
    const lines = src.split(/\n+/);
    const fixes = [];
    let curOrig = null;
    for (let raw of lines) {
      const line = raw.trim(); if (!line) continue;
      const mO = line.match(/^(?:[-*]\s*)?(?:Original|Before|Line)\s*:\s*(.+)$/i);
      if (mO) { curOrig = stripTicksQuotes(mO[1]); continue; }
      const mC = line.match(/^(?:[-*]\s*)?(?:Corrected|Fix(?:ed)?|After|Use)\s*:\s*(.+)$/i);
      if (mC) {
        const corr = stripTicksQuotes(mC[1]);
        if (curOrig && corr) fixes.push({ original: curOrig, corrected: corr });
        curOrig = null; continue;
      }
      // Single-line bullet with both
      const both = line.match(/^(?:[-*]\s*)?(?:Original|Before)[^:]*:\s*(.+?)\s*;\s*(?:Corrected|Fix(?:ed)?|After)[^:]*:\s*(.+)$/i);
      if (both) { fixes.push({ original: stripTicksQuotes(both[1]), corrected: stripTicksQuotes(both[2]) }); curOrig = null; continue; }
    }
    return fixes;
  }

  function normText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .trim();
  }

  function replaceOnce(hay, needle, repl) {
    const idx = hay.indexOf(needle);
    if (idx === -1) return null;
    return hay.slice(0, idx) + repl + hay.slice(idx + needle.length);
  }

  async function clearEditor(editor) {
    if (!editor) return;
    try {
      editor.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
    } catch {
      try { editor.innerHTML = ''; } catch {}
    }
    try { editor.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
    try { editor.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
  }

  async function applyFixesFromReview(pairs) {
    const struct = collectAnswerStructure();
    const newSteps = struct.steps.map(s => ({ matter: s.matter, explanation: s.explanation }));
    let newFinal = struct.final;
    for (const fix of pairs) {
      const orig = String(fix.original || '').trim();
      const corr = String(fix.corrected || '').trim();
      if (!orig || !corr) continue;
      let done = false;
      for (let i = 0; i < newSteps.length && !done; i++) {
        const m = newSteps[i];
        const r1 = replaceOnce(m.matter, orig, corr);
        if (r1 != null) { m.matter = r1; done = true; break; }
        const r2 = replaceOnce(m.explanation, orig, corr);
        if (r2 != null) { m.explanation = r2; done = true; break; }
        // Try normalized contains
        const nm = normText(m.matter); const ne = normText(m.explanation); const no = normText(orig);
        if (!done && nm.includes(no)) { m.matter = m.matter.replace(new RegExp(orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), corr); done = true; break; }
        if (!done && ne.includes(no)) { m.explanation = m.explanation.replace(new RegExp(orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), corr); done = true; break; }
      }
      if (!done) {
        const rf = replaceOnce(newFinal, orig, corr);
        if (rf != null) newFinal = rf;
      }
    }

    // Apply to page: replace per step
    for (let i = 0; i < newSteps.length; i++) {
      const stepEl = await ensureStepExists(i);
      if (!stepEl) continue;
      const matterEditor = await waitForMatterEditor(stepEl);
      if (matterEditor) {
        await clearEditor(matterEditor);
        const opts = { useH2: true, useX2: true, allowBullets: true, allowNumbered: true, splitInlineMath: true };
        await pasteIntoStep(stepEl, newSteps[i].matter || '', false, i, matterEditor, opts);
      }
      const explEditor = await ensureExplanationEditorForStep(stepEl, i);
      if (explEditor) {
        await clearEditor(explEditor);
        const opts = { useH2: true, useX2: true, allowBullets: true, allowNumbered: true, splitInlineMath: true };
        await pasteIntoStep(stepEl, newSteps[i].explanation || '', true, i, explEditor, opts);
      }
      await delay(200);
    }

    // Final answer paste
    const nextBtn = document.querySelector("button[data-test='answer-next-btn']");
    if (nextBtn && !nextBtn.disabled) nextBtn.click();
    await delay(300);
    const finalTab = document.querySelector("[data-test='step-container-Final solution']");
    if (finalTab) { finalTab.click(); await delay(250); }
    const editor = pickVisibleEditor();
    if (editor && newFinal && newFinal.trim()) {
      await clearEditor(editor);
      const opts = { useH2: true, useX2: true, allowBullets: true, allowNumbered: true, splitInlineMath: true };
      let annotated = newFinal;
      try { annotated = await aiAnnotateMathTools(newFinal); } catch {}
      const blocks = buildH2Blocks(annotated, opts);
      const finalContainer = document.querySelector("[data-test='step-container-Final solution']") || editor.closest("div[id^='step-'][data-test^='step-']");
      await pasteBlocksWithH2(editor, blocks, finalContainer || document, { allowTools: true });
    }
  }

  // Auto‑polish: iterate steps and re-apply tools (X2/H2) and bold headings
  async function autoPolishAllSteps() {
    const stepEls = Array.from(document.querySelectorAll("div[id^='step-'][data-test^='step-']"));
    for (let i = 0; i < stepEls.length; i++) {
      const stepEl = stepEls[i];
      try { stepEl.scrollIntoView({ block: 'center' }); } catch {}
      showStatus(`Polishing Step ${i + 1}/${stepEls.length}`);
      const matterText = (() => { const box = findMatterContainer(stepEl) || stepEl; return box ? getVisibleText(box) : ''; })();
      const matterEditor = await waitForMatterEditor(stepEl);
      if (matterEditor && matterText && matterText.trim()) {
        await clearEditor(matterEditor);
        const opts = { useH2: true, useX2: true, allowBullets: true, allowNumbered: true, splitInlineMath: true };
        let mSrc = matterText; try { mSrc = await aiAnnotateMathTools(matterText); } catch {}
        const blocks = buildH2Blocks(mSrc, opts);
        await pasteBlocksWithH2(matterEditor, blocks, stepEl, { allowTools: true });
      }
      const expEditor = await ensureExplanationEditorForStep(stepEl, i);
      const explText = expEditor ? getVisibleText(expEditor) : '';
      if (expEditor && explText && explText.trim()) {
        await clearEditor(expEditor);
        const opts = { useH2: true, useX2: true, allowBullets: true, allowNumbered: true, splitInlineMath: true };
        let eSrc = explText; try { eSrc = await aiAnnotateMathTools(explText); } catch {}
        const blocks = buildH2Blocks(eSrc, opts);
        await pasteBlocksWithH2(expEditor, blocks, stepEl, { allowTools: true });
      }
      await delay(220);
    }
    // Final
    showStatus('Polishing Final solution');
    const finalEl = document.querySelector("[data-test='step-container-Final solution']");
    if (finalEl) { try { finalEl.click(); await delay(200); } catch {} }
    const finalEditor = pickVisibleEditor();
    if (finalEditor) {
      const finalText = getVisibleText(finalEl || finalEditor) || '';
      if (finalText && finalText.trim()) {
        await clearEditor(finalEditor);
        const opts = { useH2: true, useX2: true, allowBullets: true, allowNumbered: true, splitInlineMath: true };
        let annotated = finalText;
        try { annotated = await aiAnnotateMathTools(finalText); } catch {}
        const blocks = buildH2Blocks(annotated, opts);
        const finalContainer = document.querySelector("[data-test='step-container-Final solution']") || finalEditor.closest("div[id^='step-'][data-test^='step-']");
        await pasteBlocksWithH2(finalEditor, blocks, finalContainer || document, { allowTools: true });
      }
    }
  }

  async function openStructureReviewModal() {
    const root = ensureModalRoot();
    root.innerHTML = '';
    const modal = document.createElement('div');
    modal.className = 'chx-modal chx-modal--lg';
    modal.innerHTML = `
      <div class="chx-modal__header">
        <div class="chx-modal__title">Structure Review</div>
        <button class="chx-icon-btn" data-close>&times;</button>
      </div>
      <div class="chx-modal__body">
        <div class="chx-bar">
          <div></div>
          <div class="chx-row chx-right">
            <button class="chx-btn chx-btn-secondary" data-cancel>Close</button>
            <button class="chx-btn chx-btn-outline" id="chx-review-run">Run Review</button>
            <button class="chx-btn chx-btn-outline" id="chx-review-copy">Copy Report</button>
            <button class="chx-btn chx-btn-outline" id="chx-review-polish">Auto Polish</button>
            <button class="chx-btn chx-btn-primary" id="chx-review-apply">Apply Fixes</button>
          </div>
        </div>
        <div id="chx-review-box" class="chx-answer" style="white-space:pre-wrap"></div>
      </div>`;
    root.appendChild(modal);
    root.classList.add('is-open');
    modal.querySelector('[data-close]').addEventListener('click', closeModal);
    modal.querySelector('[data-cancel]').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => e.stopPropagation());
    root.addEventListener('click', closeModal);

    const box = modal.querySelector('#chx-review-box');
    const runBtn = modal.querySelector('#chx-review-run');
    const copyBtn = modal.querySelector('#chx-review-copy');
    const applyBtn = modal.querySelector('#chx-review-apply');
    const polishBtn = modal.querySelector('#chx-review-polish');

    let lastReviewRaw = '';

    runBtn.addEventListener('click', async () => {
      try {
        box.textContent = 'Running review…';
        const data = collectAnswerStructure();
        const { system, user } = buildStructureReviewPrompt(data);
        const res = await sendMsg({ type: 'generate', provider: 'deepseek', model: 'deepseek-chat', system, user });
        if (!res || !res.ok) { box.textContent = `Error: ${res && res.error ? res.error : 'Unknown error'}`; return; }
        lastReviewRaw = res.text || '';
        box.innerHTML = renderMarkdown(lastReviewRaw).replace(/^<div class=\"chx-answer__content\">|<\/div>$/g, '');
      } catch (e) {
        box.textContent = `Error: ${e && e.message || e}`;
      }
    });
    copyBtn.addEventListener('click', async () => {
      const t = box.textContent || box.innerText || '';
      if (!t.trim()) { toast('Nothing to copy', true); return; }
      await copyToClipboard(t.trim());
      toast('Review copied');
    });
    if (polishBtn) polishBtn.addEventListener('click', async () => {
      try {
        showStatus('Polishing…');
        await autoPolishAllSteps();
        showStatus('Polished ✓'); setTimeout(clearStatus, 1200);
      } catch (e) { showStatus('Polish failed', true); console.error(e); }
    });
    applyBtn.addEventListener('click', async () => {
      try {
        const raw = lastReviewRaw || (box.textContent || box.innerText || '');
        const fixes = parseFixesFromReview(raw);
        if (!fixes.length) { toast('No fixes found', true); return; }
        await applyFixesFromReview(fixes);
        toast('Fixes applied');
      } catch (e) {
        toast('Apply failed', true);
        console.error('apply-fixes error', e);
      }
    });
  }

  async function maybeOfferPostPasteReview() {
    try {
      const want = window.confirm('Polish formatting and run structure review now?');
      if (!want) return;
      try { showStatus('Polishing…'); await autoPolishAllSteps(); showStatus('Polished ✓'); setTimeout(clearStatus, 800); } catch {}
      openStructureReviewModal();
    } catch {}
  }

  // A more complete markdown renderer, resilient to streaming
  function renderMarkdown(text) {
    // Step 1: extract fenced code blocks (closed and possibly open)
    const placeholders = [];
    let src = text;
    src = src.replace(/```(\w+)?\n([\s\S]*?)```/g, (m, lang, body) => {
      const idx = placeholders.length;
      placeholders.push({ lang: lang || '', body });
      return `[[[CHX_CODE_${idx}]]]`;
    });
    // Detect trailing open fence
    const lastFence = src.lastIndexOf('```');
    if (lastFence !== -1) {
      const before = src.slice(0, lastFence);
      const after = src.slice(lastFence + 3);
      // Treat as open code block if there is no closing fence after
      if (after.indexOf('```') === -1) {
        const firstLineEnd = after.indexOf('\n');
        const lang = firstLineEnd !== -1 ? after.slice(0, firstLineEnd).trim() : '';
        const body = firstLineEnd !== -1 ? after.slice(firstLineEnd + 1) : '';
        const idx = placeholders.length;
        placeholders.push({ lang, body, open: true });
        src = before + `[[[CHX_CODE_${idx}]]]`;
      }
    }

    // Step 2: block parsing (headings, lists, quotes, paragraphs)
    const lines = src.split(/\r?\n/);
    const out = [];
    let i = 0;
    function flushPara(buf) {
      if (!buf.length) return;
      const paraStyle = 'margin: 10px 0; line-height: 1.6; color: #202124; font-size: 14px;';
      out.push(`<p style="${paraStyle}">${inline(buf.join(' '))}</p>`);
      buf.length = 0;
    }
    function parseList(start, ordered) {
      // Force unordered lists for better Chegg compatibility (avoid auto-numbering)
      const tag = 'ul';
      const items = [];
      let j = start;
      const re = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      while (j < lines.length) {
        const m = lines[j].match(re);
        if (!m) break;
        items.push(m[1]);
        j++;
      }
      // Single-item lists degrade to a normal paragraph to avoid unwanted bullets
      if (items.length <= 1) {
        const paraStyle = 'margin: 10px 0; line-height: 1.6; color: #202124; font-size: 14px;';
        out.push(`<p style="${paraStyle}">${inline(items[0] || '')}</p>`);
        return j - 1;
      }
      const listStyle = 'margin: 10px 0; padding-left: 24px; line-height: 1.8;';
      const liStyle = 'margin: 6px 0; color: #202124; font-size: 14px;';
      const li = items.map(x => `<li style="${liStyle}">${inline(x)}</li>`).join('');
      out.push(`<${tag} style="${listStyle}">${li}</${tag}>`);
      return j - 1;
    }
    function parseTable(start) {
      // Enhanced GitHub-flavored table parsing with inline styles for Chegg compatibility
      const header = lines[start];
      const sep = lines[start + 1] || '';
      if (!/\|/.test(header) || !/^\s*\|?\s*(:?-+\s*\|)+\s*:?-+\s*\|?\s*$/.test(sep)) return -1;
      const cells = row => row.replace(/^\s*\|?|\|?\s*$/g, '').split('|').map(s => inline(s.trim()));
      const thead = cells(header);
      const rows = [];
      let j = start + 2;
      while (j < lines.length && /\|/.test(lines[j])) { rows.push(cells(lines[j])); j++; }

      // Inline styles for perfect rendering in Chegg's editor
      const tableStyle = 'border-collapse: collapse; width: 100%; margin: 12px 0; border: 1px solid #e0e0e0;';
      const thStyle = 'border: 1px solid #dadce0; padding: 10px 12px; text-align: left; background: #f8f9fa; font-weight: 600; color: #202124;';
      const tdStyle = 'border: 1px solid #dadce0; padding: 10px 12px; text-align: left; color: #5f6368;';

      const theadHtml = `<tr>${thead.map(c => `<th style="${thStyle}">${c}</th>`).join('')}</tr>`;
      const bodyHtml = rows.map(r => `<tr>${r.map(c => `<td style="${tdStyle}">${c}</td>`).join('')}</tr>`).join('');
      out.push(`<table class="chx-table" style="${tableStyle}"><thead>${theadHtml}</thead><tbody>${bodyHtml}</tbody></table>`);
      return j - 1;
    }
    const paraBuf = [];
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) { flushPara(paraBuf); continue; }

      // headings ###### with inline styles for Chegg
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        flushPara(paraBuf);
        const level = h[1].length;
        const headingStyles = {
          1: 'font-size: 24px; font-weight: 700; color: #202124; margin: 16px 0 10px;',
          2: 'font-size: 20px; font-weight: 700; color: #202124; margin: 14px 0 8px; border-bottom: 2px solid #e0e0e0; padding-bottom: 6px;',
          3: 'font-size: 18px; font-weight: 600; color: #202124; margin: 12px 0 6px;',
          4: 'font-size: 16px; font-weight: 600; color: #5f6368; margin: 10px 0 6px;',
          5: 'font-size: 14px; font-weight: 600; color: #5f6368; margin: 8px 0 4px;',
          6: 'font-size: 13px; font-weight: 600; color: #80868b; margin: 6px 0 4px;'
        };
        const style = headingStyles[level] || headingStyles[3];
        out.push(`<h${level} style="${style}">${inline(h[2])}</h${level}>`);
        continue;
      }

      // hr
      if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) { flushPara(paraBuf); out.push('<hr/>'); continue; }

      // blockquote
      const bq = line.match(/^>\s?(.*)$/);
      if (bq) {
        flushPara(paraBuf);
        const quoteLines = [bq[1]];
        let j = i + 1;
        while (j < lines.length && /^>\s?/.test(lines[j])) { quoteLines.push(lines[j].replace(/^>\s?/, '')); j++; }
        out.push(`<blockquote>${inline(quoteLines.join(' '))}</blockquote>`);
        i = j - 1; continue;
      }

      // LaTeX display math blocks on a single line: $$ ... $$ or \[ ... \] with inline styles
      const mathBlock1 = line.match(/^\s*\$\$\s*(.*?)\s*\$\$\s*$/);
      const mathBlock2 = line.match(/^\s*\\\[\s*(.*?)\s*\\\]\s*$/);
      if (mathBlock1 || mathBlock2) {
        flushPara(paraBuf);
        const expr = (mathBlock1 ? mathBlock1[1] : mathBlock2[1]) || '';
        const mathBlockStyle = 'display: block; text-align: center; margin: 14px 0; font-size: 1.1em; font-family: "Times New Roman", serif;';
        out.push(`<div class="chx-math chx-math-block" style="${mathBlockStyle}">${renderTex(expr)}</div>`);
        continue;
      }

      // tables
      const tEnd = parseTable(i);
      if (tEnd !== -1) { flushPara(paraBuf); i = tEnd; continue; }

      // lists
      if (/^\s*[-*]\s+/.test(line)) { flushPara(paraBuf); i = parseList(i, false); continue; }
      if (/^\s*\d+\.\s+/.test(line)) { flushPara(paraBuf); i = parseList(i, true); continue; }

      // fallback paragraph buffer
      paraBuf.push(line.trim());
    }
    flushPara(paraBuf);

    let html = out.join('\n');
    // Early math conversion so block math inside paragraphs renders properly with inline styles
    const inlineMathStyle = 'display: inline-block; vertical-align: middle; font-family: "Times New Roman", serif; margin: 0 2px;';
    const blockMathStyle = 'display: block; text-align: center; margin: 14px 0; font-size: 1.1em; font-family: "Times New Roman", serif;';

    // Inline math: \( ... \), $...$, and /( ... /)
    html = html.replace(/\\\(([\s\S]+?)\\\)/g, (m, inner) => `<span class="chx-math chx-math-inline" style="${inlineMathStyle}">${renderTex(inner)}</span>`);
    html = html.replace(/\$([\s\S]+?)\$/g, (m, inner) => {
      // Avoid converting simple currency-like patterns
      if (!/(\\|\^|_|\{|\}|\d\s*[+\-×÷/*=]|\\frac|\\sqrt)/.test(inner)) return m;
      return `<span class="chx-math chx-math-inline" style="${inlineMathStyle}">${renderTex(inner)}</span>`;
    });
    html = html.replace(/\/\(([\s\S]+?)\/\)/g, (m, inner) => `<span class="chx-math chx-math-inline" style="${inlineMathStyle}">${renderTex(inner)}</span>`);
    // Display math anywhere: \[ ... \] and $$...$$
    html = html.replace(/\\\[([\s\S]+?)\\\]/g, (m, inner) => `<span class="chx-math chx-math-block" style="${blockMathStyle}">${renderTex(inner)}</span>`);
    html = html.replace(/\$\$([\s\S]+?)\$\$/g, (m, inner) => `<span class="chx-math chx-math-block" style="${blockMathStyle}">${renderTex(inner)}</span>`);

    // Step 3: replace code placeholders
    html = html.replace(/\[\[\[CHX_CODE_(\d+)\]\]\]/g, (m, n) => {
      const c = placeholders[Number(n)];
      const langClass = c.lang ? ` class="language-${escapeAttr(c.lang)}"` : '';
      const bodyEsc = escapeHtml(c.body);
      const closing = c.open ? '' : '';
      return `<pre class="chx-code"><code${langClass}>${bodyEsc}</code></pre>${closing}`;
    });

    // (math converted earlier to avoid interfering with code blocks)

    return `<div class="chx-answer__content">${html}</div>`;
  }

  function inline(s) {
    let t = escapeHtml(s);
    // inline code
    t = t.replace(/`([^`]+)`/g, '<code class="chx-inline-code">$1</code>');
    // links
    t = t.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1<\/a>');
    // bold then italic
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    return t;
  }

  // --- Minimal TeX to HTML renderer for common constructs ---
  function renderTex(tex) {
    let s = String(tex || '').trim();
    if (!s) return '';
    // Normalize whitespace
    s = s.replace(/\s+/g, ' ').replace(/~+/g, ' ');
    // Treat '\ ' spacing macro as a regular space
    s = s.replace(/\\ /g, ' ');
    // Normalize common fraction commands
    s = s.replace(/\\dfrac/g, '\\frac').replace(/\\tfrac/g, '\\frac');

    // Support line breaks inside math using \\ or \\newline
    s = s.replace(/\\\\|\\newline/g, '<br/>');

    // Recursively expand \frac{a}{b}
    function parseFrac(str) {
      let idx = str.indexOf('\\frac');
      while (idx !== -1) {
        // Find first { after \frac
        const brace1 = str.indexOf('{', idx);
        if (brace1 === -1) break;
        const g1 = readGroup(str, brace1);
        if (!g1) break;
        const brace2 = g1.end + 1 < str.length ? str.indexOf('{', g1.end + 1) : -1;
        if (brace2 === -1) break;
        const g2 = readGroup(str, brace2);
        if (!g2) break;
        const num = parseFrac(g1.content);
        const den = parseFrac(g2.content);
        const html = `<span class="chx-frac"><span class="top">${num}</span><span class="bottom">${den}</span></span>`;
        str = str.slice(0, idx) + html + str.slice(g2.end + 1);
        idx = str.indexOf('\\frac');
      }
      return str;
    }

    function readGroup(str, startIdx) {
      if (str[startIdx] !== '{') return null;
      let depth = 0;
      for (let i = startIdx; i < str.length; i++) {
        const ch = str[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return { content: str.slice(startIdx + 1, i), end: i }; }
      }
      return null;
    }

    s = parseFrac(s);

    // sqrt
    s = s.replace(/\\sqrt\{([^}]*)\}/g, (m, inner) => `<span class="chx-sqrt"><span class="rad">${inner}</span></span>`);

    // \text{...}
    s = s.replace(/\\text\{([^}]*)\}/g, (m, inner) => `${inner}`);

    // Accents and symbols
    s = s
      .replace(/\\times/g, '×')
      .replace(/\\cdot/g, '·')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≥');

    // Remove \left and \right which are visual only here
    s = s.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '');

    // Superscripts: handle numeric and single-char bases
    s = s.replace(/(\d+(?:\.\d+)?)\^\{([^}]*)\}/g, (m, base, exp) => `${base}<sup>${exp}</sup>`);
    s = s.replace(/(\d+(?:\.\d+)?)\^([A-Za-z0-9.+\-]+)/g, (m, base, exp) => `${base}<sup>${exp}</sup>`);
    s = s.replace(/([A-Za-z)\]\}])\^\{([^}]*)\}/g, (m, base, exp) => `${base}<sup>${exp}</sup>`);
    s = s.replace(/([A-Za-z)\]\}])\^([A-Za-z0-9.+\-]+)/g, (m, base, exp) => `${base}<sup>${exp}</sup>`);

    // Subscripts: handle numeric and single-char bases
    s = s.replace(/(\d+(?:\.\d+)?)_\{([^}]*)\}/g, (m, base, sub) => `${base}<sub>${sub}</sub>`);
    s = s.replace(/(\d+(?:\.\d+)?)_([A-Za-z0-9.+\-]+)/g, (m, base, sub) => `${base}<sub>${sub}</sub>`);
    s = s.replace(/([A-Za-z)\]\}])_\{([^}]*)\}/g, (m, base, sub) => `${base}<sub>${sub}</sub>`);
    s = s.replace(/([A-Za-z)\]\}])_([A-Za-z0-9.+\-]+)/g, (m, base, sub) => `${base}<sub>${sub}</sub>`);

    // Escape HTML in the remaining raw text parts to avoid HTML injection
    // We split by tags we already introduced to keep them intact
    s = s.split(/(<[^>]+>)/g).map((part, i) => i % 2 ? part : escapeHtml(part)).join('');

    return s;
  }
})();
