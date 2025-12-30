(function () {
  const STORAGE_KEY = 'gtm_debug_runner_enabled';
  const STATE_KEY = 'gtm_debug_runner_state';
  const toggle = document.getElementById('gtm-runner-toggle');
  const status = document.getElementById('gtm-runner-status');
  const yearEl = document.getElementById('gtm-runner-year');
  const versionEl = document.getElementById('gtm-runner-version');

  if (!toggle || !status || !chrome?.storage?.local) return;

  function updateStatus(on) {
    status.textContent = on ? 'GTM Debug Runner ist aktiviert' : 'GTM Debug Runner ist deaktiviert';
  }

  function setToggleDisabled(disabled) {
    toggle.disabled = disabled;
    const label = toggle.closest('.toggle');
    if (label) {
      label.style.opacity = disabled ? '0.45' : '1';
      label.style.cursor = disabled ? 'not-allowed' : 'pointer';
    }
    toggle.style.pointerEvents = disabled ? 'none' : 'auto';
  }

  if (yearEl) {
    const year = new Date().getFullYear();
    yearEl.textContent = `Copyright © ${year}`;
  }

  if (versionEl && chrome?.runtime?.getManifest) {
    const manifest = chrome.runtime.getManifest();
    const version = manifest?.version || '';
    versionEl.textContent = version ? `Version: ${version}` : '';
  }

  chrome.storage.local.get([STORAGE_KEY, STATE_KEY], (res) => {
    const enabled = res?.[STORAGE_KEY];
    const isOn = enabled !== false;
    toggle.checked = isOn;
    updateStatus(isOn);
    const state = res?.[STATE_KEY] || 'idle';
    setToggleDisabled(state === 'running');
  });

  toggle.addEventListener('change', () => {
    if (toggle.disabled) return;
    const isOn = toggle.checked;
    chrome.storage.local.set({ [STORAGE_KEY]: isOn }, () => {
      updateStatus(isOn);
      if (!isOn || !chrome.tabs?.query || !chrome.tabs?.reload) return;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const id = tabs && tabs[0] && tabs[0].id;
        if (typeof id !== 'number') return;
        chrome.tabs.reload(id);
      });
    });
  });

  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes[STATE_KEY]) {
        const nextState = changes[STATE_KEY].newValue;
        setToggleDisabled(nextState === 'running');
      }
    });
  }
})();
