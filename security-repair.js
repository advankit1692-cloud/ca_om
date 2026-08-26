/* C&A security unlock compatibility repair — injected by the service worker. */
(function () {
  'use strict';

  const SECURITY_KEY = 'ca_solutions_security_v1';
  const SECURITY_VERSION = 1;
  const SECURITY_KDF = 'PBKDF2-SHA-256';
  const SECURITY_CIPHER = 'AES-GCM';
  const SECURITY_ITERATIONS = 600000;
  const SECURITY_AUTH_MARKER = 'C_AND_A_SOLUTIONS_AUTH_MARKER_V1';

  function readCompatibleMetadata() {
    const raw = localStorage.getItem(SECURITY_KEY);
    if (!raw) return null;

    let metadata;
    try {
      metadata = JSON.parse(raw);
    } catch (_) {
      throw new Error('Security metadata is corrupted. Existing data was not changed.');
    }

    if (!metadata || metadata.version !== SECURITY_VERSION ||
        metadata.kdf !== SECURITY_KDF || metadata.cipher !== SECURITY_CIPHER ||
        typeof metadata.salt !== 'string' || !metadata.salt ||
        !metadata.verifier || metadata.iterations !== SECURITY_ITERATIONS) {
      throw new Error('Unsupported or corrupted security metadata. Existing data was not changed.');
    }

    return metadata;
  }

  function assertUnlockDependencies() {
    if (typeof deriveSecurityKey !== 'function' ||
        typeof decryptSecurityValue !== 'function' ||
        typeof isEncryptedEnvelope !== 'function' ||
        typeof STORAGE_KEYS === 'undefined') {
      throw new Error('Security unlock dependencies are unavailable. Existing data was not changed.');
    }
  }

  async function directUnlock() {
    const button = document.getElementById('securityActionButton');
    const passwordInput = document.getElementById('securityPassword');
    const message = document.getElementById('securityMessage');
    if (!button || !passwordInput || !message || window.__caDirectUnlockBusy) return;

    window.__caDirectUnlockBusy = true;
    button.disabled = true;
    message.textContent = 'Checking password securely…';

    try {
      assertUnlockDependencies();
      const password = passwordInput.value;
      validatePassword(password);
      const metadata = readCompatibleMetadata();
      if (!metadata) {
        throw new Error('Security setup was not found. Existing data was not changed.');
      }

      message.textContent = 'Deriving secure key…';
      const key = await deriveSecurityKey(password, metadata.salt, metadata.iterations);

      message.textContent = 'Verifying protected data…';
      const marker = await decryptSecurityValue(metadata.verifier, key);
      if (marker !== SECURITY_AUTH_MARKER) throw new Error('Wrong password / PIN.');

      const decrypted = Object.create(null);
      for (const keyName of Object.values(STORAGE_KEYS)) {
        const raw = localStorage.getItem(keyName);
        if (!raw) {
          decrypted[keyName] = keyName === STORAGE_KEYS.attendance ? {} : [];
          continue;
        }

        let envelope;
        try {
          envelope = JSON.parse(raw);
        } catch (_) {
          throw new Error('Protected data is malformed. Existing data was not changed.');
        }
        if (!isEncryptedEnvelope(envelope)) {
          throw new Error('Protected data is not fully encrypted. Existing data was not changed.');
        }
        decrypted[keyName] = await decryptSecurityValue(envelope, key);
      }

      securityKey = key;
      securityCache = decrypted;
      securityUnlocked = true;
      securityInitialized = true;
      if (typeof resetSecurityIdleTimer === 'function') resetSecurityIdleTimer();
      message.textContent = 'Unlocked.';
      if (typeof hideSecurityGate === 'function') hideSecurityGate();
      if (typeof initializeApp === 'function') initializeApp();
    } catch (error) {
      console.error('Direct security unlock failed:', error);
      securityKey = null;
      securityUnlocked = false;
      securityCache = Object.create(null);
      message.textContent = error && error.message || 'Unlock failed. Existing data was not changed.';
    } finally {
      window.__caDirectUnlockBusy = false;
      button.disabled = false;
    }
  }

  function installDirectUnlock() {
    const button = document.getElementById('securityActionButton');
    if (!button || button.dataset.caDirectUnlock === '1') return;

    const originalAction = button.onclick;
    button.dataset.caDirectUnlock = '1';
    button.type = 'button';
    button.onclick = function (event) {
      // Setup and error modes must retain the application's original handler.
      if (typeof securityMode !== 'undefined' && securityMode !== 'unlock') {
        return typeof originalAction === 'function' ? originalAction.call(this, event) : undefined;
      }
      return directUnlock();
    };

    const input = document.getElementById('securityPassword');
    if (input && input.dataset.caDirectUnlockKey !== '1') {
      input.dataset.caDirectUnlockKey = '1';
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (typeof securityMode === 'undefined' || securityMode === 'unlock')) {
          event.preventDefault();
          void directUnlock();
        }
      });
    }
  }

  function boot() {
    installDirectUnlock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  const gate = document.getElementById('securityGate');
  if (gate) gate.dataset.securityRepair = 'active';
})();
