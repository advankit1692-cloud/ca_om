// C&A Om Wingman client bridge.
// Keeps existing local Wingman actions intact and uses the secure server proxy
// only when the local command parser cannot understand the request.
(() => {
  const originalRunWingmanCommand = window.runWingmanCommand;
  if (typeof originalRunWingmanCommand !== 'function') return;

  const setStatus = (text, ok = true) => {
    const el = document.getElementById('wingmanStatus');
    if (el) {
      el.textContent = text;
      el.style.color = ok ? 'var(--accent-gold)' : 'var(--red)';
    }
  };

  const showResult = (text) => {
    const el = document.getElementById('wingmanResult');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `<div style="white-space:pre-wrap">${String(text).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div>`;
  };

  async function askServer(command) {
    const response = await fetch('/api/wingman', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        command,
        context: {
          app: 'C&A Solutions Om',
          language: 'Hindi/Hinglish',
          page: location.pathname
        }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Wingman API failed (${response.status})`);
    return data.text || 'Wingman returned no response.';
  }

  window.runWingmanCommand = async function runWingmanCommandWithAI(forcedText) {
    const command = String(forcedText || document.getElementById('wingmanCommand')?.value || '').trim();
    if (!command) return originalRunWingmanCommand(forcedText);

    // Preserve the existing deterministic app actions first.
    originalRunWingmanCommand(command);

    // Existing parser reports this exact status when it cannot route the command.
    const status = document.getElementById('wingmanStatus')?.textContent || '';
    if (!/Command samajh nahi aaya/i.test(status)) return;

    setStatus('Wingman AI is thinking...');
    try {
      const text = await askServer(command);
      showResult(text);
      setStatus('AI response ready.');
    } catch (error) {
      console.error('Wingman AI:', error);
      setStatus(error.message || 'Wingman AI request failed.', false);
      showResult('AI Wingman unavailable. Local commands are still working.');
    }
  };

  // Security-gate reliability patch.
  // The existing security logic remains authoritative; this only guarantees
  // that the visible Unlock button and Enter key reach handleSecurityAction.
  function bindSecurityGate() {
    const button = document.getElementById('securityActionButton');
    const password = document.getElementById('securityPassword');
    const gate = document.getElementById('securityGate');
    if (!button || !password || !gate || typeof window.handleSecurityAction !== 'function') return false;
    if (button.dataset.caSecurityBound === '1') return true;

    button.type = 'button';
    button.dataset.caSecurityBound = '1';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof window.handleSecurityAction === 'function') {
        window.handleSecurityAction();
      }
    });

    password.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (typeof window.handleSecurityAction === 'function') {
        window.handleSecurityAction();
      }
    });

    return true;
  }

  // Security code is declared later in the master HTML, so wait briefly for
  // those functions/DOM nodes to exist. Stop as soon as the patch is bound.
  let attempts = 0;
  const securityBinder = setInterval(() => {
    attempts += 1;
    if (bindSecurityGate() || attempts >= 120) clearInterval(securityBinder);
  }, 250);
  bindSecurityGate();
})();
