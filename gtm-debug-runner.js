(() => {
  const DELAY = 5000;

  const STORAGE_KEY_INDEX = 'gtm_debug_runner_index';
  const STORAGE_KEY_START = 'gtm_debug_runner_start_ts';
  const STORAGE_KEY_LAST = 'gtm_debug_runner_last_ts';
  const STORAGE_KEY_AVG = 'gtm_debug_runner_avg_step_ms';
  const STORAGE_KEY_STATE = 'gtm_debug_runner_state';
  const STORAGE_KEY_DEBUGVAL = 'gtm_debug_runner_debugval';
  const STORAGE_KEY_POS = 'gtm_debug_runner_pos';
  const STORAGE_KEY_URLS = 'gtm_debug_runner_urls';
  const STORAGE_KEY_FILENAME = 'gtm_debug_runner_filename';
  const STORAGE_KEY_ENABLED = 'gtm_debug_runner_enabled';
  const STORAGE_KEY_UPLOAD_INVALID = 'gtm_debug_runner_upload_invalid';
  let shadowRootRef = null;
  let shadowHostEl = null;
  const FALLBACK_MSG = {
    hdr_title: 'GTM Debug Runner',
    eta_label: 'ETA: $1',
    intro_upload: 'Please upload a CSV from Google Tag Manager or Google Analytics 4. Untagged URLs are filtered automatically.',
    intro_running: 'The process has started. Depending on the number of URLs and page load times this may take a while.',
    intro_paused: 'The process is paused. Click "Resume" to continue.',
    intro_done: 'Done! Check your Google Tag Manager or Google Analytics 4 account for current tag coverage and rerun if needed.',
    intro_idle_ready: 'CSV loaded successfully. Click "Start" to begin.',
    intro_idle_empty: 'Please upload a CSV (no URL list available).',
    upload_label: 'Select CSV',
    upload_filename_none: 'No file selected',
    upload_hint_valid: 'Found: $1 URLs (Not tagged)',
    upload_hint_invalid: 'The uploaded CSV is invalid and/or contains no untagged URLs.',
    upload_clear_title: 'Clear list',
    current_link: 'Current link',
    countdown_prefix: 'Next redirect in',
    countdown_suffix: 's',
    btn_cancel: 'Cancel',
    btn_start: 'Start',
    btn_pause: 'Pause',
    btn_resume: 'Resume',
    btn_done: 'Finish',
    btn_restart: 'Restart',
    btn_close_title: 'Close',
    progress_urls: 'URLs',
    done_url_label: 'Done',
    eta_prefix: 'ETA: $1'
  };

  function t(key, subs) {
    if (chrome?.i18n?.getMessage) {
      const msg = chrome.i18n.getMessage(key, subs);
      if (msg) return msg;
    }
    const fb = FALLBACK_MSG[key];
    if (!fb) return key;
    if (!subs) return fb;
    if (Array.isArray(subs)) {
      return fb.replace('$1', subs[0] || '');
    }
    return fb.replace('$1', subs || '');
  }

  function getEl(id) {
    return (shadowRootRef || document).getElementById(id);
  }

  function persistState(obj) {
    if (!chrome?.storage?.local) return;
    try {
      chrome.storage.local.set(obj);
    } catch {
      /* noop */
    }
  }

  function showToast() {
    /* toast removed */
  }

  function removePersisted(keys) {
    if (!chrome?.storage?.local) return;
    try {
      chrome.storage.local.remove(keys);
    } catch {
      /* noop */
    }
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve({});
        return;
      }
      try {
        chrome.storage.local.get(keys, (res) => {
          if (chrome.runtime?.lastError) {
            resolve({});
            return;
          }
          resolve(res || {});
        });
      } catch {
        resolve({});
      }
    });
  }

  function shouldRun() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve(false);
        return;
      }
      try {
        chrome.storage.local.get([STORAGE_KEY_ENABLED], (res) => {
          if (chrome.runtime?.lastError) {
            resolve(false);
            return;
          }
          const enabled = res?.[STORAGE_KEY_ENABLED];
          resolve(enabled !== false);
        });
      } catch {
        resolve(false);
      }
    });
  }

  window.__gtmRunnerTeardown?.();

  let hasRun = false;

  async function ensureEnabled() {
    if (hasRun) return true;
    const enabled = await shouldRun();
    if (!enabled) {
      window.__gtmRunnerCancelRedirect?.();
      removeModal();
      window.__gtmRunnerTeardown = () => {
        window.__gtmRunnerCancelRedirect?.();
        removeModal();
      };
      return false;
    }
    hasRun = true;
    return true;
  }

  function setRunnerState(state) {
    sessionStorage.setItem(STORAGE_KEY_STATE, state);
    persistState({ [STORAGE_KEY_STATE]: state });
  }

  function setRunnerIndex(idx) {
    sessionStorage.setItem(STORAGE_KEY_INDEX, String(idx));
    persistState({ [STORAGE_KEY_INDEX]: String(idx) });
  }

  function setRunnerUrls(urls) {
    sessionStorage.setItem(STORAGE_KEY_URLS, JSON.stringify(urls || []));
    persistState({ [STORAGE_KEY_URLS]: urls || [] });
    if (Array.isArray(urls) && urls.length) {
      sessionStorage.setItem(STORAGE_KEY_UPLOAD_INVALID, 'false');
      persistState({ [STORAGE_KEY_UPLOAD_INVALID]: 'false' });
    }
  }

  function setRunnerFilename(name) {
    const val = name || '';
    sessionStorage.setItem(STORAGE_KEY_FILENAME, val);
    persistState({ [STORAGE_KEY_FILENAME]: val });
  }

  function setRunnerDebugVal(val) {
    if (!val) return;
    sessionStorage.setItem(STORAGE_KEY_DEBUGVAL, val);
    persistState({ [STORAGE_KEY_DEBUGVAL]: val });
  }

  function setUploadInvalidFlag(flag) {
    const val = flag ? 'true' : 'false';
    sessionStorage.setItem(STORAGE_KEY_UPLOAD_INVALID, val);
    persistState({ [STORAGE_KEY_UPLOAD_INVALID]: val });
  }

  async function hydrateFromPersistent() {
    const res = await storageGet([
      STORAGE_KEY_URLS,
      STORAGE_KEY_INDEX,
      STORAGE_KEY_STATE,
      STORAGE_KEY_DEBUGVAL,
      STORAGE_KEY_FILENAME,
      STORAGE_KEY_POS,
      STORAGE_KEY_UPLOAD_INVALID,
    ]);

    const urls = res?.[STORAGE_KEY_URLS];
    if (Array.isArray(urls) && urls.length) {
      sessionStorage.setItem(STORAGE_KEY_URLS, JSON.stringify(urls));
    }

    const idx = res?.[STORAGE_KEY_INDEX];
    if (idx !== undefined) sessionStorage.setItem(STORAGE_KEY_INDEX, String(idx));

    const state = res?.[STORAGE_KEY_STATE];
    if (state) sessionStorage.setItem(STORAGE_KEY_STATE, state);

    const dbg = res?.[STORAGE_KEY_DEBUGVAL];
    if (dbg) sessionStorage.setItem(STORAGE_KEY_DEBUGVAL, dbg);

    const fname = res?.[STORAGE_KEY_FILENAME];
    if (fname) sessionStorage.setItem(STORAGE_KEY_FILENAME, fname);

    const pos = res?.[STORAGE_KEY_POS];
    if (pos) sessionStorage.setItem(STORAGE_KEY_POS, JSON.stringify(pos));

    const invalid = res?.[STORAGE_KEY_UPLOAD_INVALID];
    if (invalid !== undefined) sessionStorage.setItem(STORAGE_KEY_UPLOAD_INVALID, String(invalid));
  }

  function normalizeUrl(raw) {
    const v = String(raw || '').trim();
    if (!v) return null;
    if (!/^https?:\/\//i.test(v)) return 'https://' + v.replace(/^\/+/, '');
    return v;
  }

  function formatDuration(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
  }

  function getDebugValueFromCurrentUrl() {
    const url = new URL(window.location.href);
    const val = url.searchParams.get('gtm_debug');
    return val && val.trim() ? val.trim() : null;
  }

  function computeEta(remainingCount) {
    return remainingCount * DELAY;
  }

  function updateTimingStats(now) {
    const startTs = Number(sessionStorage.getItem(STORAGE_KEY_START) || 0);
    if (!startTs) sessionStorage.setItem(STORAGE_KEY_START, String(now));

    const lastTs = Number(sessionStorage.getItem(STORAGE_KEY_LAST) || 0);
    if (lastTs) {
      const stepMs = now - lastTs;
      const prevAvg = Number(sessionStorage.getItem(STORAGE_KEY_AVG) || 0);
      const nextAvg = prevAvg ? Math.round(prevAvg * 0.75 + stepMs * 0.25) : stepMs;
      sessionStorage.setItem(STORAGE_KEY_AVG, String(nextAvg));
    }

    sessionStorage.setItem(STORAGE_KEY_LAST, String(now));
  }

  function resetRunnerState() {
    sessionStorage.removeItem(STORAGE_KEY_INDEX);
    sessionStorage.removeItem(STORAGE_KEY_START);
    sessionStorage.removeItem(STORAGE_KEY_LAST);
    sessionStorage.removeItem(STORAGE_KEY_AVG);
    sessionStorage.removeItem(STORAGE_KEY_STATE);
    sessionStorage.removeItem(STORAGE_KEY_DEBUGVAL);
    sessionStorage.removeItem(STORAGE_KEY_URLS);
    sessionStorage.removeItem(STORAGE_KEY_FILENAME);
    sessionStorage.removeItem(STORAGE_KEY_POS);
    sessionStorage.removeItem(STORAGE_KEY_UPLOAD_INVALID);
    removePersisted([
      STORAGE_KEY_INDEX,
      STORAGE_KEY_STATE,
      STORAGE_KEY_DEBUGVAL,
      STORAGE_KEY_URLS,
      STORAGE_KEY_FILENAME,
      STORAGE_KEY_POS,
      STORAGE_KEY_UPLOAD_INVALID,
    ]);
    window.__gtmRunnerCancelRedirect?.();
  }

  function readSavedPos() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_POS);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  async function applySavedPos(modalEl) {
    let pos = readSavedPos();
    if (!pos) {
      const res = await storageGet([STORAGE_KEY_POS]);
      pos = res?.[STORAGE_KEY_POS];
      if (pos) sessionStorage.setItem(STORAGE_KEY_POS, JSON.stringify(pos));
    }
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
    modalEl.style.position = 'fixed';
    modalEl.style.left = `${pos.x}px`;
    modalEl.style.top = `${pos.y}px`;
    modalEl.style.transform = 'none';
  }

  function savePos(x, y) {
    const payload = { x, y };
    sessionStorage.setItem(STORAGE_KEY_POS, JSON.stringify(payload));
    persistState({ [STORAGE_KEY_POS]: payload });
  }

  function makeDraggable(modalEl, handleEl) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;

      const rect = modalEl.getBoundingClientRect();
      modalEl.style.position = 'fixed';
      modalEl.style.left = `${rect.left}px`;
      modalEl.style.top = `${rect.top}px`;
      modalEl.style.transform = 'none';

      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      handleEl.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!dragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const rect = modalEl.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 8;
      const maxY = window.innerHeight - rect.height - 8;

      const nextLeft = clamp(startLeft + dx, 8, maxX);
      const nextTop = clamp(startTop + dy, 8, maxY);

      modalEl.style.left = `${nextLeft}px`;
      modalEl.style.top = `${nextTop}px`;

      savePos(nextLeft, nextTop);
    };

    const onUp = () => {
      dragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    handleEl.style.cursor = 'grab';
    handleEl.addEventListener('pointerdown', onDown);
  }

  function getUrls() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_URLS);
      const arr = raw ? JSON.parse(raw) : null;
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function setUrls(urls) {
    setRunnerUrls(urls);
  }

  function getFilename() {
    return sessionStorage.getItem(STORAGE_KEY_FILENAME) || '';
  }

  function setFilename(name) {
    setRunnerFilename(name);
  }

  function parseNotTaggedUrlsFromCsvText(csvText) {
    const lines = String(csvText || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter(Boolean);

    if (lines.length < 2) return [];

    const header = lines[0].split(',').map((s) => s.trim().toLowerCase());
    const urlIdx = header.indexOf('url');
    const statusIdx = header.indexOf('tag status');

    if (urlIdx === -1 || statusIdx === -1) return [];

    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      const urlRaw = row[urlIdx];
      const status = (row[statusIdx] || '').trim().toLowerCase();
      if (status === 'not tagged') {
        const u = normalizeUrl(urlRaw);
        if (u) out.push(u);
      }
    }

    return Array.from(new Set(out));
  }

  function removeModal() {
    getEl('gtm-runner-overlay')?.remove();
  }

  function ensureModal() {
    if (getEl('gtm-runner-overlay')) return;

    if (!shadowHostEl) {
      shadowHostEl = document.createElement('div');
      shadowHostEl.id = 'gtm-runner-shadow-host';
      document.documentElement.appendChild(shadowHostEl);
    }
    if (!shadowRootRef) {
      shadowRootRef = shadowHostEl.attachShadow({ mode: 'open' });
    }

    const overlay = document.createElement('div');
    overlay.id = 'gtm-runner-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(0,0,0,.45);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: grid; place-items: center;
      opacity: 1 !important;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    `;

    const modal = document.createElement('div');
    modal.id = 'gtm-runner-modal';
    modal.style.cssText = `
      width: min(620px, calc(100vw - 32px));
      background: rgba(17,17,17,.92);
      color: #fff;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,.6);
      padding: 18px 18px 16px;
      opacity: 1 !important
    `;

    modal.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        #gtm-runner-overlay, #gtm-runner-overlay * {
          box-sizing: border-box;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        }
        #gtm-runner-overlay button, #gtm-runner-overlay input {
          all: unset;
          font-family: inherit;
          color: inherit;
        }
        #gtm-runner-overlay button { cursor: pointer; }
        @keyframes gtmRunnerBarShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      </style>
      <div id="gtm-runner-draghandle" style="display:flex; justify-content:space-between; align-items:center; margin: -20px; padding: 20px; gap:12px; user-select:none;">
        <div style="display:flex; align-items:center; gap:5px; margin-left: -5px">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" style="opacity:.9; position: relative; top: 1px">
            <circle cx="9.5" cy="6" r="0.5" stroke="#FFF" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="9.5" cy="10" r="0.5" stroke="#FFF" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="9.5" cy="14" r="0.5" stroke="#FFF" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="9.5" cy="18" r="0.5" stroke="#FFF" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="14.5" cy="6" r="0.5" stroke="#FFF" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="14.5" cy="10" r="0.5" stroke="#FFF" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="14.5" cy="14" r="0.5" stroke="#FFF" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="14.5" cy="18" r="0.5" stroke="#FFF" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 64 64" fill="none" style="position: relative; top: 1px">
            <defs>
              <linearGradient id="gradRed" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#EA4335"/>
                <stop offset="100%" stop-color="#EA4335"/>
              </linearGradient>
              <linearGradient id="gradYellow" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#FBBC05"/>
                <stop offset="100%" stop-color="#FBBC05"/>
              </linearGradient>
              <linearGradient id="gradBlue" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#4285F4"/>
                <stop offset="100%" stop-color="#4285F4"/>
              </linearGradient>
              <linearGradient id="gradGreen" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#34A853"/>
                <stop offset="100%" stop-color="#34A853"/>
              </linearGradient>
            </defs>
            <g transform="translate(1 2) scale(2.6)">
              <path d="M2 11.5a10 10 0 0 1 14.5-9.1" stroke="url(#gradRed)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16.5 2.4a10 10 0 0 1 4.3 4.8" stroke="url(#gradYellow)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M22 12.5a10 10 0 0 1-6.5 8.6" stroke="url(#gradBlue)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M15.5 21.1a10 10 0 0 1-12.3-4.4" stroke="url(#gradGreen)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
            </g>
          </svg>
          <div style="font-size:18px; opacity:.85;"><strong id="gtm-runner-title">${t('hdr_title')}</strong></div>
        </div>
        <div style="display: flex; align-items:center; gap:12px">
          <div id="gtm-runner-eta" style="display:none; font-size:12px; opacity:.85;">${t('eta_label', '–')}</div>
          <div id="gtm-runner-close-btn" title="${t('btn_close_title')}" style="cursor:pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </div>
        </div>
      </div>

      <div id="gtm-runner-intro" style="margin-top:30px; margin-bottom: 20px; font-size:14px; opacity:.5; line-height:1.35;"></div>

      <div id="gtm-runner-upload" style="margin-top:20px; display:none;">
        <div style="display: none; font-size:12px; opacity:.5; margin-bottom:8px;">
          Google&reg; Tag Coverage Export (CSV):
        </div>

          <div style="display:flex; gap:10px; align-items:stretch; width:100%;">
            <label id="gtm-runner-upload-label" style="
              flex:1;
              display:flex;
              align-items:center;
            gap:12px;
            margin-bottom: 0;
            padding:12px 14px;
            border-radius:12px;
            border:1px solid rgba(255,255,255,.18);
            background:rgba(255,255,255,.06);
            cursor:pointer;
          ">
            <input id="gtm-runner-file" type="file" accept=".csv" style="display:none;" />
            <span id="gtm-runner-upload-left" style="font-size:14px; opacity:.9;">${t('upload_label')}</span>
            <span id="gtm-runner-filename" style="font-size:12px; opacity:.6;">${t('upload_filename_none')}</span>
          </label>

          <button id="gtm-runner-clear" title="${t('upload_clear_title')}" style="
            appearance:none;
            display:flex;
            align-items:center;
            justify-content:center;
            width:44px;
            min-width:44px;
            border-radius:12px;
            border:1px solid rgba(255,255,255,.18);
            background:rgba(255,255,255,.06);
            cursor:pointer;
          ">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>

        <div id="gtm-runner-upload-hint" style="margin-top:12px; font-size:12px; opacity:1;"></div>
      </div>

      <div id="gtm-runner-running-ui" style="display:none;">
        <div id="gtm-runner-linkwrap" style="margin-top:10px;">
          <div style="display: flex; align-items: center; gap: 5px; font-size:12px; opacity:.85; margin-bottom:15px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" style="position: relative"><path fill="#FFF" d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm1 16.057v-3.057h2.994c-.059 1.143-.212 2.24-.456 3.279-.823-.12-1.674-.188-2.538-.222zm1.957 2.162c-.499 1.33-1.159 2.497-1.957 3.456v-3.62c.666.028 1.319.081 1.957.164zm-1.957-7.219v-3.015c.868-.034 1.721-.103 2.548-.224.238 1.027.389 2.111.446 3.239h-2.994zm0-5.014v-3.661c.806.969 1.471 2.15 1.971 3.496-.642.084-1.3.137-1.971.165zm2.703-3.267c1.237.496 2.354 1.228 3.29 2.146-.642.234-1.311.442-2.019.607-.344-.992-.775-1.91-1.271-2.753zm-7.241 13.56c-.244-1.039-.398-2.136-.456-3.279h2.994v3.057c-.865.034-1.714.102-2.538.222zm2.538 1.776v3.62c-.798-.959-1.458-2.126-1.957-3.456.638-.083 1.291-.136 1.957-.164zm-2.994-7.055c.057-1.128.207-2.212.446-3.239.827.121 1.68.19 2.548.224v3.015h-2.994zm1.024-5.179c.5-1.346 1.165-2.527 1.97-3.496v3.661c-.671-.028-1.329-.081-1.97-.165zm-2.005-.35c-.708-.165-1.377-.373-2.018-.607.937-.918 2.053-1.65 3.29-2.146-.496.844-.927 1.762-1.272 2.753zm-.549 1.918c-.264 1.151-.434 2.36-.492 3.611h-3.933c.165-1.658.739-3.197 1.617-4.518.88.361 1.816.67 2.808.907zm.009 9.262c-.988.236-1.92.542-2.797.9-.89-1.328-1.471-2.879-1.637-4.551h3.934c.058 1.265.231 2.488.5 3.651zm.553 1.917c.342.976.768 1.881 1.257 2.712-1.223-.49-2.326-1.211-3.256-2.115.636-.229 1.299-.435 1.999-.597zm9.924 0c.7.163 1.362.367 1.999.597-.931.903-2.034 1.625-3.257 2.116.489-.832.915-1.737 1.258-2.713zm.553-1.917c.27-1.163.442-2.386.501-3.651h3.934c-.167 1.672-.748 3.223-1.638 4.551-.877-.358-1.81-.664-2.797-.9zm.501-5.651c-.058-1.251-.229-2.46-.492-3.611.992-.237 1.929-.546 2.809-.907.877 1.321 1.451 2.86 1.616 4.518h-3.933z"/></svg>
            <span id="gtm-runner-next-label">${t('current_link')}</span>
          </div>
          <div id="gtm-runner-linkbox" style="
            background: rgba(255,255,255,.08);
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 12px;
            padding: 10px 12px;
            font-size: 14px;
            line-height: 1.35;
            word-break: break-all;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">–</div>
        </div>

        <div style="margin-top:14px;">
          <div style="display:flex; justify-content:space-between; font-size:12px; opacity:.85;">
            <div id="gtm-runner-progress">0 / 0</div>
            <div id="gtm-runner-percent">0%</div>
          </div>

          <div style="margin-top:8px; height:10px; background: rgba(255,255,255,.12); border-radius:999px; overflow:hidden;">
            <div id="gtm-runner-bar" style="
              height:100%;
              width:0%;
              background: linear-gradient(90deg,
                #EA4335 0%,
                #FBBC05 25%,
                #4285F4 50%,
                #34A853 75%,
                #EA4335 100%);
              background-size: 200% 100%;
              animation: gtmRunnerBarShimmer 5s linear infinite;
            "></div>
          </div>

          <!--<div id="gtm-runner-countdown-row" style="margin-top:10px; font-size:12px; opacity:.5;">
            ${t('countdown_prefix')} <span id="gtm-runner-countdown">3</span>${t('countdown_suffix')}
          </div>-->
        </div>
      </div>

      <div id="gtm-runner-actions" style="margin-top:30px; display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
        <button id="gtm-runner-cancel" style="
          appearance:none; border:1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.06); color:#fff;
          border-radius: 12px; padding: 10px 12px; font-size: 14px;
          cursor:pointer;
        ">${t('btn_cancel')}</button>

        <button id="gtm-runner-start" style="
          appearance:none; border:1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.85); color:#111;
          border-radius: 12px; padding: 10px 12px; font-size: 14px;
          cursor:pointer;
        ">${t('btn_start')}</button>

        <button id="gtm-runner-pause" style="
          display:none;
          appearance:none; border:1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.06); color:#fff;
          border-radius: 12px; padding: 10px 12px; font-size: 14px;
          cursor:pointer;
        ">${t('btn_pause')}</button>

        <button id="gtm-runner-resume" style="
          display:none;
          appearance:none; border:1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.85); color:#111;
          border-radius: 12px; padding: 10px 12px; font-size: 14px;
          cursor:pointer;
        ">${t('btn_resume')}</button>

        <button id="gtm-runner-done-close" style="
          display:none;
          appearance:none; border:1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.06); color:#fff;
          border-radius: 12px; padding: 10px 12px; font-size: 14px;
          cursor:pointer;
        ">${t('btn_done')}</button>

        <button id="gtm-runner-restart" style="
          display:none;
          appearance:none; border:1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.85); color:#111;
          border-radius: 12px; padding: 10px 12px; font-size: 14px;
          cursor:pointer;
        ">${t('btn_restart')}</button>
      </div>
    `;

    overlay.appendChild(modal);
    shadowRootRef.appendChild(overlay);

    modal.style.visibility = 'hidden';
    Promise.resolve(applySavedPos(modal)).finally(() => {
      modal.style.visibility = 'visible';
    });

    const applyStaticLabels = () => {
      const titleEl = getEl('gtm-runner-title');
      if (titleEl) titleEl.textContent = t('hdr_title');

      const etaEl = getEl('gtm-runner-eta');
      if (etaEl) etaEl.textContent = t('eta_label', '–');

      const uploadLeft = getEl('gtm-runner-upload-left');
      if (uploadLeft) uploadLeft.textContent = t('upload_label');

      const filenameEl = getEl('gtm-runner-filename');
      if (filenameEl && !getFilename()) filenameEl.textContent = t('upload_filename_none');

      const clearBtn = getEl('gtm-runner-clear');
      if (clearBtn) clearBtn.title = t('upload_clear_title');

      const closeBtn = getEl('gtm-runner-close-btn');
      if (closeBtn) closeBtn.title = t('btn_close_title');

      const nextLabel = getEl('gtm-runner-next-label');
      if (nextLabel) nextLabel.textContent = t('current_link');

      const cdRow = getEl('gtm-runner-countdown-row');
      if (cdRow) cdRow.innerHTML = `${t('countdown_prefix')} <span id="gtm-runner-countdown">3</span>${t('countdown_suffix')}`;

      const btnCancel = getEl('gtm-runner-cancel');
      const btnStart = getEl('gtm-runner-start');
      const btnPause = getEl('gtm-runner-pause');
      const btnResume = getEl('gtm-runner-resume');
      const btnDone = getEl('gtm-runner-done-close');
      const btnRestart = getEl('gtm-runner-restart');
      if (btnCancel) btnCancel.textContent = t('btn_cancel');
      if (btnStart) btnStart.textContent = t('btn_start');
      if (btnPause) btnPause.textContent = t('btn_pause');
      if (btnResume) btnResume.textContent = t('btn_resume');
      if (btnDone) btnDone.textContent = t('btn_done');
      if (btnRestart) btnRestart.textContent = t('btn_restart');
    };

    applyStaticLabels();

    const handle = getEl('gtm-runner-draghandle');
    if (handle) makeDraggable(modal, handle);

    const cancelBtn = getEl('gtm-runner-cancel');
    const closeBtn = getEl('gtm-runner-close-btn');
    const startBtn = getEl('gtm-runner-start');
    const pauseBtn = getEl('gtm-runner-pause');
    const resumeBtn = getEl('gtm-runner-resume');
    const doneCloseBtn = getEl('gtm-runner-done-close');
    const restartBtn = getEl('gtm-runner-restart');
    const fileInput = getEl('gtm-runner-file');
    const clearBtn = getEl('gtm-runner-clear');
    const filenameEl = getEl('gtm-runner-filename');

    const saved = getFilename();
    if (saved && filenameEl) filenameEl.textContent = saved;

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        resetRunnerState();
        removeModal();
      });
    }

    if (closeBtn) {
      const closeHandler = (e) => {
        e.stopPropagation();
        resetRunnerState();
        removeModal();
      };
      closeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      closeBtn.addEventListener('click', closeHandler);
    }

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        const list = getUrls();
        if (!list.length) {
          renderState('upload');
          return;
        }
        setRunnerState('running');
        renderState('running');
        loadNext(true);
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        setRunnerState('paused');
        renderState('paused');
        window.__gtmRunnerCancelRedirect?.();
      });
    }

    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        setRunnerState('running');
        renderState('running');
        loadNext(true);
      });
    }

    if (doneCloseBtn) {
      doneCloseBtn.addEventListener('click', () => {
        resetRunnerState();
        removeModal();
      });
    }

    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        sessionStorage.removeItem(STORAGE_KEY_START);
        sessionStorage.removeItem(STORAGE_KEY_LAST);
        sessionStorage.removeItem(STORAGE_KEY_AVG);
        setRunnerIndex(0);
        setRunnerState('running');
        renderState('running');
        loadNext(true);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        setUrls([]);
        setFilename('');
        setRunnerIndex(0);
        setUploadInvalidFlag(false);
        if (filenameEl) filenameEl.textContent = t('upload_filename_none');
        updateUploadHint();
        renderState('upload');
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;

        setFilename(file.name);
        if (filenameEl) filenameEl.textContent = file.name;

        const text = await file.text();
        const filtered = parseNotTaggedUrlsFromCsvText(text);

        setUrls(filtered);
        setRunnerIndex(0);

        if (!filtered.length) {
          setUploadInvalidFlag(true);
        } else {
          setUploadInvalidFlag(false);
        }

        updateUploadHint();
        renderState('idle');
      });
    }

    updateUploadHint();
  }

  function updateUploadHint() {
    const hint = getEl('gtm-runner-upload-hint');
    if (!hint) return;
    const list = getUrls();
    const hasList = list.length > 0;
    const invalid = sessionStorage.getItem(STORAGE_KEY_UPLOAD_INVALID) === 'true';
    if (hasList) {
      hint.textContent = t('upload_hint_valid', String(list.length));
      hint.style.color = '#34A853';
    } else if (invalid) {
      hint.textContent = t('upload_hint_invalid');
      hint.style.color = 'rgb(234, 67, 53)';
    } else {
      hint.textContent = '';
      hint.style.color = 'rgba(255,255,255,.7)';
    }
  }

  function setStartButtonEnabled(enabled) {
    const startBtn = getEl('gtm-runner-start');
    if (!startBtn) return;
    startBtn.disabled = !enabled;
    startBtn.style.opacity = enabled ? '1' : '0.4';
    startBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }

  function setButtonsForState(state) {
    const cancelBtn = getEl('gtm-runner-cancel');
    const startBtn = getEl('gtm-runner-start');
    const pauseBtn = getEl('gtm-runner-pause');
    const resumeBtn = getEl('gtm-runner-resume');
    const doneCloseBtn = getEl('gtm-runner-done-close');
    const restartBtn = getEl('gtm-runner-restart');

    if (!cancelBtn || !startBtn || !pauseBtn || !resumeBtn || !doneCloseBtn || !restartBtn) return;

    if (state === 'idle') {
      cancelBtn.style.display = 'inline-block';
      startBtn.style.display = 'inline-block';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'none';
      doneCloseBtn.style.display = 'none';
      restartBtn.style.display = 'none';
    }

    if (state === 'running') {
      cancelBtn.style.display = 'none';
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-block';
      resumeBtn.style.display = 'none';
      doneCloseBtn.style.display = 'none';
      restartBtn.style.display = 'none';
    }

    if (state === 'paused') {
      cancelBtn.style.display = 'none';
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'inline-block';
      doneCloseBtn.style.display = 'none';
      restartBtn.style.display = 'none';
    }

    if (state === 'upload') {
      cancelBtn.style.display = 'inline-block';
      startBtn.style.display = 'inline-block';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'none';
      doneCloseBtn.style.display = 'none';
      restartBtn.style.display = 'none';
    }

    if (state === 'done') {
      cancelBtn.style.display = 'none';
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'none';
      doneCloseBtn.style.display = 'inline-block';
      restartBtn.style.display = 'inline-block';
    }
  }

  function renderState(state) {
    const introEl = getEl('gtm-runner-intro');
    const uploadEl = getEl('gtm-runner-upload');
    const runningUiEl = getEl('gtm-runner-running-ui');
    const cdRow = getEl('gtm-runner-countdown-row');
    const etaEl = getEl('gtm-runner-eta');
    const filenameEl = getEl('gtm-runner-filename');
    const linkWrapEl = getEl('gtm-runner-linkwrap');
    const startBtn = getEl('gtm-runner-start');

    const list = getUrls();
    const hasList = list.length > 0;
    const storedName = getFilename();
    if (filenameEl) filenameEl.textContent = storedName || t('upload_filename_none');

    if (uploadEl) uploadEl.style.display = state === 'running' || state === 'paused' || state === 'done' ? 'none' : 'block';
    if (runningUiEl) runningUiEl.style.display = state === 'running' || state === 'paused' || state === 'done' ? 'block' : 'none';
    if (cdRow) cdRow.style.display = state === 'running' ? 'block' : 'none';
    if (etaEl) etaEl.style.display = state === 'running' ? 'block' : 'none';
    if (linkWrapEl) linkWrapEl.style.display = state === 'done' ? 'none' : 'block';

    if (introEl) {
      if (state === 'upload') introEl.textContent = t('intro_upload');
      else if (state === 'running') introEl.textContent = t('intro_running');
      else if (state === 'paused') introEl.textContent = t('intro_paused');
      else if (state === 'done') introEl.textContent = t('intro_done');
      else introEl.textContent = hasList ? t('intro_idle_ready') : t('intro_idle_empty');
    }

    updateUploadHint();
    if (startBtn) setStartButtonEnabled(hasList && state !== 'done');
    setButtonsForState(state);
  }

  function updateProgress({ currentIndex, total, url, etaMs, countdown, isLast, skipBar }) {
    ensureModal();

    const done = Math.min(currentIndex, total);
    let pct = total > 0 ? Math.round((done / total) * 100) : 0;
    if (isLast && pct >= 100) pct = 99;

    const linkBox = getEl('gtm-runner-linkbox');
    const progressEl = getEl('gtm-runner-progress');
    const percentEl = getEl('gtm-runner-percent');
    const barEl = getEl('gtm-runner-bar');
    const etaEl = getEl('gtm-runner-eta');
    const cdEl = getEl('gtm-runner-countdown');
    const cdRow = getEl('gtm-runner-countdown-row');
    const state = sessionStorage.getItem(STORAGE_KEY_STATE) || 'idle';

    if (linkBox) linkBox.textContent = url || '–';
    if (progressEl) progressEl.textContent = `${done} / ${total} ${t('progress_urls')}`;
    if (percentEl) percentEl.textContent = `${pct}%`;
    if (barEl && !skipBar) {
      barEl.style.width = `${pct}%`;
      if (pct >= 100) {
        barEl.style.background = '#34A853';
        barEl.style.backgroundSize = '';
        barEl.style.animation = 'none';
        barEl.style.transition = 'width 0.4s linear';
      } else {
        barEl.style.background = 'linear-gradient(90deg, #EA4335 0%, #FBBC05 25%, #4285F4 50%, #34A853 75%, #EA4335 100%)';
        barEl.style.backgroundSize = '200% 100%';
        barEl.style.animation = 'gtmRunnerBarShimmer 1.6s linear infinite';
      }
    }
    if (etaEl) etaEl.textContent = t('eta_prefix', formatDuration(etaMs));
    if (cdEl) cdEl.textContent = String(countdown);
    if (cdRow) {
      if (isLast) cdRow.style.display = 'none';
      else cdRow.style.display = state === 'running' ? 'block' : 'none';
    }
  }

  function scheduleRedirect(urlString, etaMs, total, remaining, currentNumber) {
    let secondsLeft = Math.ceil(DELAY / 1000);
    let etaRemaining = Math.max(0, etaMs);
    const isLast = remaining <= 0;
    const targetPct = Math.min(100, Math.round((currentNumber / total) * 100));
    const currentPct = Math.min(100, Math.round(((currentNumber - 1) / total) * 100));
    const barEl = getEl('gtm-runner-bar');
    if (barEl) {
      barEl.style.transition = 'none';
      barEl.style.width = `${currentPct}%`;
      // force reflow
      void barEl.offsetWidth;
      barEl.style.transition = `width ${DELAY}ms linear`;
      barEl.style.width = `${isLast ? 100 : targetPct}%`;
    }

    const tick = setInterval(() => {
      const state = sessionStorage.getItem(STORAGE_KEY_STATE) || 'idle';
      if (state !== 'running') {
        clearInterval(tick);
        return;
      }

      secondsLeft -= 1;
      etaRemaining = Math.max(0, etaRemaining - 1000);
      if (secondsLeft <= 0) {
        clearInterval(tick);
        return;
      }

      updateProgress({
        currentIndex: Number(sessionStorage.getItem(STORAGE_KEY_INDEX) || 0),
        total,
        url: urlString,
        etaMs: etaRemaining,
        countdown: secondsLeft,
        skipBar: true,
        isLast,
      });
    }, 1000);

    const timeoutId = setTimeout(() => {
      const stateNow = sessionStorage.getItem(STORAGE_KEY_STATE) || 'idle';
      if (stateNow !== 'running') return;
      window.location.href = urlString;
    }, DELAY);

    window.__gtmRunnerCancelRedirect = () => {
      clearInterval(tick);
      clearTimeout(timeoutId);
      window.__gtmRunnerCancelRedirect = null;
    };
  }

  function loadNext(fromUserAction = false) {
    const state = sessionStorage.getItem(STORAGE_KEY_STATE) || 'idle';
    if (state !== 'running' && !fromUserAction) return;
    if (state !== 'running') return;

    const list = getUrls();
    if (!list.length) {
      renderState('upload');
      return;
    }

    const now = Date.now();
    updateTimingStats(now);

    let index = Number(sessionStorage.getItem(STORAGE_KEY_INDEX) || 0);

    if (index >= list.length) {
      setRunnerState('done');
      updateProgress({
        currentIndex: list.length,
        total: list.length,
        url: 'Fertig',
        etaMs: 0,
        countdown: 0,
        isLast: false,
      });
      renderState('done');
      window.__gtmRunnerCancelRedirect?.();
      return;
    }

    const debugVal = sessionStorage.getItem(STORAGE_KEY_DEBUGVAL) || getDebugValueFromCurrentUrl();
    if (!debugVal) {
      resetRunnerState();
      removeModal();
      return;
    }
    setRunnerDebugVal(debugVal);

    const currentUrl = new URL(normalizeUrl(list[index]));
    currentUrl.searchParams.set('gtm_debug', debugVal);

    const total = list.length;
    const currentNumber = index + 1;
    const remaining = total - currentNumber;
    const etaMs = computeEta(remaining);

    setRunnerIndex(index + 1);

    updateProgress({
      currentIndex: currentNumber - 1,
      total,
      url: currentUrl.toString(),
      etaMs,
      countdown: Math.ceil(DELAY / 1000),
      isLast: remaining <= 0,
    });

    scheduleRedirect(currentUrl.toString(), etaMs, total, remaining, currentNumber);
  }

  function init() {
    const debugVal = getDebugValueFromCurrentUrl();
    if (!debugVal) return;

    setRunnerDebugVal(debugVal);

    if (!sessionStorage.getItem(STORAGE_KEY_STATE)) setRunnerState('idle');
    if (!sessionStorage.getItem(STORAGE_KEY_INDEX)) setRunnerIndex(0);

    ensureModal();

    const list = getUrls();
    const state = sessionStorage.getItem(STORAGE_KEY_STATE) || 'idle';

    renderState(!list.length ? 'upload' : state === 'running' ? 'running' : 'idle');

    if (state === 'running') loadNext();
  }

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY_ENABLED)) return;
      if (changes[STORAGE_KEY_ENABLED]?.newValue === false) {
        window.__gtmRunnerCancelRedirect?.();
        resetRunnerState();
        removeModal();
      }
    });
  }

  window.__gtmRunnerTeardown = () => {
    window.__gtmRunnerCancelRedirect?.();
    removeModal();
  };

  ensureEnabled().then(async (ok) => {
    if (!ok) return;
    await hydrateFromPersistent();
    init();
  });
})();
