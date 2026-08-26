/* C&A security gate state repair v2. Keeps setup/unlock mode aligned with storage. */
(function () {
  const SECURITY_KEY = 'ca_solutions_security_v1';
  const buttonId = 'securityActionButton';
  const confirmId = 'securityNewPasswordGroup';

  function hasMetadata() {
    try { return !!localStorage.getItem(SECURITY_KEY); } catch (_) { return false; }
  }

  function syncGate() {
    const gate = document.getElementById('securityGate');
    const button = document.getElementById(buttonId);
    if (!gate || !button) return;

    const desiredMode = hasMetadata() ? 'unlock' : 'setup';
    if (typeof window.setSecurityGate === 'function') {
      window.setSecurityGate(desiredMode);
    } else {
      const confirmGroup = document.getElementById(confirmId);
      if (confirmGroup) confirmGroup.style.display = desiredMode === 'setup' ? 'block' : 'none';
      button.textContent = desiredMode === 'setup' ? 'Create & Secure' : 'Unlock';
    }

    if (typeof window.handleSecurityAction === 'function') {
      button.onclick = window.handleSecurityAction;
    }
  }

  function install() {
    const gate = document.getElementById('securityGate');
    if (!gate) return;
    syncGate();
  }

  setTimeout(install, 3500);
  setTimeout(install, 5000);
  setTimeout(install, 8000);
  window.addEventListener('pageshow', install);
})();
