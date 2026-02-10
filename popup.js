/**
 * popup.js — WebAdvisor Dashboard Logic
 * 
 * Manages: password lock, target list UI, chrome.storage persistence,
 * and communication with the background service worker.
 */

// ============================================================
// DOM References
// ============================================================
const lockScreen = document.getElementById('lockScreen');
const passwordInput = document.getElementById('passwordInput');
const unlockBtn = document.getElementById('unlockBtn');
const lockError = document.getElementById('lockError');
const mainApp = document.getElementById('mainApp');
const globalToggle = document.getElementById('globalToggle');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const domainInput = document.getElementById('domainInput');
const addBtn = document.getElementById('addBtn');
const targetList = document.getElementById('targetList');
const changePwBtn = document.getElementById('changePwBtn');
const pwModal = document.getElementById('pwModal');
const pwOld = document.getElementById('pwOld');
const pwNew = document.getElementById('pwNew');
const pwConfirm = document.getElementById('pwConfirm');
const pwModalError = document.getElementById('pwModalError');
const pwSaveBtn = document.getElementById('pwSaveBtn');
const pwCancelBtn = document.getElementById('pwCancelBtn');

// ============================================================
// State
// ============================================================
let targets = [];
let isActive = false;
const LOCK_GRACE_PERIOD_MS = 20000; // 20 seconds

// ============================================================
// Init — Check lock state, then load app
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['password', 'lastCloseTime', 'targets', 'isActive'], (data) => {
    const password = data.password;
    const lastClose = data.lastCloseTime || 0;
    const elapsed = Date.now() - lastClose;

    // If no password is set, skip lock entirely
    if (!password) {
      showMainApp(data);
      return;
    }

    // If within 20s grace period, skip lock
    if (elapsed < LOCK_GRACE_PERIOD_MS) {
      showMainApp(data);
      return;
    }

    // Otherwise, show lock screen
    lockScreen.classList.remove('lock-screen--hidden');
    mainApp.classList.add('main-app--hidden');
    passwordInput.focus();
  });
});

// Record close time when popup is about to close
window.addEventListener('beforeunload', () => {
  chrome.storage.local.set({ lastCloseTime: Date.now() });
});

// ============================================================
// Lock Screen Logic
// ============================================================

unlockBtn.addEventListener('click', attemptUnlock);
passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') attemptUnlock();
  // Clear error styling on new input
  lockError.textContent = '';
  passwordInput.classList.remove('lock-screen__input--error');
});

function attemptUnlock() {
  const entered = passwordInput.value;
  if (!entered) return;

  chrome.storage.local.get(['password'], (data) => {
    if (entered === data.password) {
      // Success — load the app
      chrome.storage.local.get(['targets', 'isActive'], (appData) => {
        showMainApp(appData);
      });
    } else {
      // Wrong password — shake + red flash
      passwordInput.classList.add('lock-screen__input--error');
      lockError.textContent = '×';
      passwordInput.value = '';
      passwordInput.focus();
    }
  });
}

function showMainApp(data) {
  lockScreen.classList.add('lock-screen--hidden');
  mainApp.classList.remove('main-app--hidden');

  targets = data.targets || [];
  isActive = data.isActive || false;

  globalToggle.checked = isActive;
  updateStatusUI();
  renderTargets();
}

// ============================================================
// Change Password Modal
// ============================================================

changePwBtn.addEventListener('click', () => {
  pwModal.classList.remove('pw-modal--hidden');
  pwOld.value = '';
  pwNew.value = '';
  pwConfirm.value = '';
  pwModalError.textContent = '';
  pwOld.focus();
});

pwCancelBtn.addEventListener('click', () => {
  pwModal.classList.add('pw-modal--hidden');
});

pwSaveBtn.addEventListener('click', () => {
  const oldVal = pwOld.value;
  const newVal = pwNew.value;
  const confirmVal = pwConfirm.value;

  chrome.storage.local.get(['password'], (data) => {
    const currentPw = data.password;

    // If a password exists, verify old password
    if (currentPw && oldVal !== currentPw) {
      pwModalError.textContent = 'WRONG CURRENT PASSWORD';
      return;
    }

    if (!newVal) {
      pwModalError.textContent = 'ENTER A NEW PASSWORD';
      return;
    }

    if (newVal !== confirmVal) {
      pwModalError.textContent = 'PASSWORDS DO NOT MATCH';
      return;
    }

    // Save new password
    chrome.storage.local.set({ password: newVal }, () => {
      pwModal.classList.add('pw-modal--hidden');
    });
  });
});

// ============================================================
// Event Listeners — Main App
// ============================================================

/** Global ON/OFF toggle */
globalToggle.addEventListener('change', () => {
  isActive = globalToggle.checked;
  saveState();
  updateStatusUI();

  if (isActive) {
    applyAllRules();
  } else {
    clearAllRules();
  }
});

/** Add target button */
addBtn.addEventListener('click', addTarget);

/** Enter key on input */
domainInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTarget();
});

// ============================================================
// Core Functions
// ============================================================

function addTarget() {
  let domain = domainInput.value.trim().toLowerCase();
  if (!domain) return;

  domain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  if (!/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i.test(domain)) {
    domainInput.style.borderColor = 'var(--accent-red)';
    setTimeout(() => { domainInput.style.borderColor = ''; }, 1500);
    return;
  }

  if (targets.some(t => t.domain === domain)) {
    domainInput.style.borderColor = 'var(--accent-amber)';
    setTimeout(() => { domainInput.style.borderColor = ''; }, 1500);
    return;
  }

  targets.push({ domain, mode: 'hang', redirectUrl: 'https://google.com' });
  domainInput.value = '';
  saveState();
  renderTargets();

  if (isActive) applyAllRules();
}

function removeTarget(index) {
  targets.splice(index, 1);
  saveState();
  renderTargets();
  if (isActive) {
    applyAllRules();
  } else {
    clearAllRules();
  }
}

function changeMode(index, newMode) {
  targets[index].mode = newMode;
  saveState();
  renderTargets();
  if (isActive) applyAllRules();
}

function changeRedirectUrl(index, newUrl) {
  let url = newUrl.trim();
  if (url && !/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  targets[index].redirectUrl = url;
  saveState();
  if (isActive) applyAllRules();
}

// ============================================================
// Rendering
// ============================================================

function renderTargets() {
  if (targets.length === 0) {
    targetList.innerHTML = '<p class="target-list__empty">No targets configured</p>';
    return;
  }

  targetList.innerHTML = targets.map((t, i) => `
    <div class="target-card" data-mode="${t.mode}">
      <div class="target-card__header">
        <span class="target-card__domain">${escapeHTML(t.domain)}</span>
        <button class="target-card__remove" data-index="${i}" title="Remove target">&times;</button>
      </div>
      <div class="target-card__controls">
        <span class="target-card__mode-label">MODE</span>
        <select class="target-card__select" data-index="${i}">
          <option value="hang"     ${t.mode === 'hang' ? 'selected' : ''}>⏳ INFINITE LOAD</option>
          <option value="redirect" ${t.mode === 'redirect' ? 'selected' : ''}>↪ REDIRECT</option>
          <option value="crash"    ${t.mode === 'crash' ? 'selected' : ''}>💀 TAB FREEZE</option>
        </select>
      </div>
      ${t.mode === 'redirect' ? `
      <div class="target-card__redirect-row">
        <span class="target-card__mode-label">REDIRECT TO</span>
        <input
          type="text"
          class="target-card__redirect-input"
          data-index="${i}"
          value="${escapeHTML(t.redirectUrl || 'https://google.com')}"
          placeholder="https://google.com"
          spellcheck="false"
        />
      </div>
      ` : ''}
    </div>
  `).join('');

  targetList.querySelectorAll('.target-card__remove').forEach(btn => {
    btn.addEventListener('click', () => removeTarget(parseInt(btn.dataset.index)));
  });

  targetList.querySelectorAll('.target-card__select').forEach(sel => {
    sel.addEventListener('change', () => changeMode(parseInt(sel.dataset.index), sel.value));
  });

  targetList.querySelectorAll('.target-card__redirect-input').forEach(input => {
    input.addEventListener('change', () => changeRedirectUrl(parseInt(input.dataset.index), input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
  });
}

function updateStatusUI() {
  if (isActive) {
    statusDot.classList.add('status-bar__dot--active');
    statusText.textContent = `ACTIVE — ${targets.length} TARGET${targets.length !== 1 ? 'S' : ''} LOADED`;
  } else {
    statusDot.classList.remove('status-bar__dot--active');
    statusText.textContent = 'SYSTEM STANDBY';
  }
}

// ============================================================
// Communication with Background Service Worker
// ============================================================

function applyAllRules() {
  chrome.runtime.sendMessage({
    action: 'updateRules',
    targets: targets,
    isActive: true
  });
}

function clearAllRules() {
  chrome.runtime.sendMessage({ action: 'clearRules' });
}

// ============================================================
// Persistence
// ============================================================

function saveState() {
  chrome.storage.local.set({ targets, isActive });
}

// ============================================================
// Utility
// ============================================================

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
