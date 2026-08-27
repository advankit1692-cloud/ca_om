/* CA Solutions OM — Task #12 Firebase Auth + Database bridge
 * Preserves the existing local encrypted storage as the offline source of truth.
 * Cloud records remain encrypted envelopes; Firebase rules enforce uid ownership.
 */
(() => {
  'use strict';
  const PROJECT_ID = 'ca-solutions-e397a';
  const AUTH_DOMAIN = PROJECT_ID + '.firebaseapp.com';
  const DB_URL = 'https://' + PROJECT_ID + '-default-rtdb.asia-southeast1.firebasedatabase.app';
  const APP_NAME = 'CA_SOLUTIONS_OM';
  const MARK = 'ca_solutions_om_task12_v1';
  const CATEGORY_BY_KEY = {
    workers: 'workers', attendance: 'attendance', finance: 'finance',
    expenses: 'expenses', payments: 'payments', transactions: 'payments',
    purchases: 'purchases', materials: 'materials', stock: 'materials',
    reports: 'reports', sites: 'sites', bills: 'reports'
  };

  const cfgFromWindow = () => window.CA_FIREBASE_CONFIG || {
    apiKey: '', authDomain: AUTH_DOMAIN, databaseURL: DB_URL,
    projectId: PROJECT_ID, storageBucket: PROJECT_ID + '.firebasestorage.app',
    messagingSenderId: '866641199604', appId: '1:866641199604:web:cb57598d5ddfd32d8d79a1'
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const safeJson = (v, fallback = null) => { try { return JSON.parse(v); } catch { return fallback; } };
  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const keyCategory = key => {
    const k = String(key || '').toLowerCase();
    for (const [needle, category] of Object.entries(CATEGORY_BY_KEY)) if (k.includes(needle)) return category;
    return 'appData';
  };

  let auth = null, db = null, firebaseApp = null, unsubscribe = null;
  let initialized = false, authReady = false, currentUser = null, syncing = false;

  function setStatus(text, kind='info') {
    const e = document.getElementById('caTask12Status');
    if (!e) return;
    e.textContent = text || '';
    e.dataset.kind = kind;
  }

  function ensureStyles() {
    if (document.getElementById('caTask12Styles')) return;
    const s = document.createElement('style'); s.id = 'caTask12Styles';
    s.textContent = `
      #caTask12Gate{position:fixed;inset:0;z-index:120000;background:rgba(15,23,42,.985);display:flex;align-items:center;justify-content:center;padding:16px}
      #caTask12Gate[hidden]{display:none!important}.ca12-card{width:100%;max-width:420px;background:#1e293b;border:1px solid #475569;border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
      .ca12-title{font-size:20px;font-weight:800;color:#f59e0b;margin-bottom:4px}.ca12-sub{font-size:11px;color:#94a3b8;margin-bottom:16px}.ca12-field{margin-bottom:10px}.ca12-field label{display:block;font-size:11px;color:#94a3b8;margin-bottom:4px}.ca12-field input{width:100%;padding:10px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#fff}
      .ca12-row{display:flex;gap:8px;margin-top:10px}.ca12-row button{flex:1;padding:10px;border:0;border-radius:8px;font-weight:700;cursor:pointer}.ca12-primary{background:#2563eb;color:#fff}.ca12-secondary{background:#334155;color:#fff}.ca12-danger{background:#dc2626;color:#fff}
      #caTask12Status{min-height:18px;font-size:11px;color:#f59e0b;margin:8px 0;text-align:center}.ca12-account{font-size:10px;color:#94a3b8;margin-top:8px;text-align:center}.ca12-link{border:0;background:none;color:#60a5fa;text-decoration:underline;cursor:pointer;font-size:11px;padding:4px}
      #caTask12Bar{position:fixed;right:10px;top:10px;z-index:110000;display:none;gap:6px;align-items:center;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:6px 8px;font-size:10px;color:#94a3b8}.ca12-online{color:#10b981}.ca12-offline{color:#f59e0b}.ca12-logout{border:0;background:#dc2626;color:#fff;border-radius:6px;padding:5px 8px;font-size:10px;font-weight:700}
    `;
    document.head.appendChild(s);
  }

  function ensureUI() {
    ensureStyles();
    if (!document.getElementById('caTask12Gate')) {
      const gate = document.createElement('div'); gate.id = 'caTask12Gate';
      gate.innerHTML = `<div class="ca12-card">
        <div class="ca12-title">C &amp; A SOLUTIONS</div>
        <div class="ca12-sub">Secure account login. Your existing offline data is preserved on this device.</div>
        <div class="ca12-field"><label>Email</label><input id="ca12Email" type="email" autocomplete="email" inputmode="email"></div>
        <div class="ca12-field"><label>Password</label><input id="ca12Password" type="password" autocomplete="current-password"></div>
        <div id="caTask12Status"></div>
        <div class="ca12-row"><button id="ca12Login" class="ca12-primary">Login</button><button id="ca12Signup" class="ca12-secondary">Create Account</button></div>
        <div class="ca12-row"><button id="ca12Reset" class="ca12-link">Forgot password?</button></div>
        <div class="ca12-account" id="ca12AccountInfo"></div>
      </div>`;
      document.body.appendChild(gate);
      gate.querySelector('#ca12Login').onclick = () => login(false);
      gate.querySelector('#ca12Signup').onclick = () => login(true);
      gate.querySelector('#ca12Reset').onclick = resetPassword;
    }
    if (!document.getElementById('caTask12Bar')) {
      const bar = document.createElement('div'); bar.id = 'caTask12Bar';
      bar.innerHTML = `<span id="ca12Net" class="ca12-offline">Offline</span><span id="ca12User"></span><button id="ca12Logout" class="ca12-logout">Logout</button>`;
      document.body.appendChild(bar); bar.querySelector('#ca12Logout').onclick = logout;
    }
  }

  function setGate(show) {
    const gate = document.getElementById('caTask12Gate'); if (gate) gate.hidden = !show;
    const bar = document.getElementById('caTask12Bar'); if (bar) bar.style.display = show ? 'none' : 'flex';
    if (show) document.getElementById('ca12Email')?.focus();
  }

  async function loadConfig() {
    let cfg = cfgFromWindow();
    if (cfg.apiKey) return cfg;
    try {
      const r = await fetch(AUTH_DOMAIN + '/__/firebase/init.json', {cache:'no-store'});
      if (r.ok) { const remote = await r.json(); if (remote?.apiKey) cfg = {...cfg, ...remote}; }
    } catch {}
    return cfg;
  }

  async function initFirebase() {
    if (initialized) return true;
    const cfg = await loadConfig();
    if (!cfg.apiKey) { setStatus('Firebase Web API key/config is not available. Existing local data remains untouched.', 'error'); setGate(true); return false; }
    try {
      const appMod = await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js');
      const authMod = await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js');
      const dbMod = await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js');
      const existing = appMod.getApps().find(a => a.name === '[DEFAULT]');
      firebaseApp = existing || appMod.initializeApp(cfg);
      auth = authMod.getAuth(firebaseApp); db = dbMod.getDatabase(firebaseApp, cfg.databaseURL || DB_URL);
      await authMod.setPersistence(auth, authMod.browserLocalPersistence);
      authMod.onAuthStateChanged(auth, async user => {
        currentUser = user || null; authReady = true;
        if (!user) { setGate(true); setStatus('Login required.'); return; }
        document.getElementById('ca12User').textContent = user.email || user.uid;
        setGate(false); setStatus('');
        await syncCloud(user);
      });
      window.CATask12 = {auth, db, user: () => currentUser, login, logout, resetPassword, sync: () => currentUser ? syncCloud(currentUser) : false};
      initialized = true; return true;
    } catch (e) { console.error('Task 12 Firebase init failed', e); setStatus('Firebase initialization failed. Local/offline data is preserved.', 'error'); setGate(true); return false; }
  }

  async function login(create) {
    const email = document.getElementById('ca12Email')?.value.trim();
    const password = document.getElementById('ca12Password')?.value || '';
    if (!email || !password) { setStatus('Email and password are required.','error'); return; }
    if (!auth) return;
    setStatus(create ? 'Creating account…' : 'Signing in…');
    try {
      if (create) await (await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js')).createUserWithEmailAndPassword(auth,email,password);
      else await (await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js')).signInWithEmailAndPassword(auth,email,password);
    } catch(e) { console.error(e); setStatus(e?.message || 'Authentication failed.','error'); }
  }

  async function resetPassword() {
    const email = document.getElementById('ca12Email')?.value.trim();
    if (!email) { setStatus('Enter your account email first.','error'); return; }
    try { await (await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js')).sendPasswordResetEmail(auth,email); setStatus('Password reset email sent. Check inbox/spam.'); }
    catch(e) { setStatus(e?.message || 'Password reset failed.','error'); }
  }

  async function logout() {
    if (!auth) return; try { await (await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js')).signOut(auth); } catch(e) { console.error(e); }
  }

  function storageKeys() { return Object.values(window.STORAGE_KEYS || {}).filter(Boolean); }
  function path(uid, category, key) { return `users/${uid}/${category}/${encodeURIComponent(key)}`; }

  async function writeEnvelope(uid, key, raw) {
    if (!db) return;
    const value = safeJson(raw, raw);
    const category = keyCategory(key);
    const payload = {encryptedData:value, updatedAt:Date.now(), key, category, schemaVersion:1, app:APP_NAME};
    await dbMod().then(({ref,set}) => set(ref(db,path(uid,category,key)),payload));
    await dbMod().then(({ref,set}) => set(ref(db,path(uid,'appData',key)),payload));
  }
  async function dbMod() { return await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js'); }

  async function syncCloud(user) {
    if (!user || !db || syncing) return; syncing = true;
    try {
      const {ref,get,set} = await dbMod();
      const root = ref(db, `users/${user.uid}`);
      const snap = await get(root); const cloud = snap.exists() ? (snap.val() || {}) : {};
      // Existing device data wins when present. Cloud restores only missing/empty local keys.
      for (const key of storageKeys()) {
        const raw = localStorage.getItem(key);
        const node = cloud.appData?.[encodeURIComponent(key)] || cloud.appData?.[key];
        if (!raw && node) {
          const env = node.encryptedData ?? node;
          localStorage.setItem(key, JSON.stringify(env));
          try { window.CAApplyRemoteEncryptedRecord?.(key, env, Number(node.updatedAt)||0); } catch {}
        } else if (raw) {
          await set(ref(db,path(user.uid,'appData',key)),{encryptedData:safeJson(raw,raw),updatedAt:Date.now(),key,category:keyCategory(key),schemaVersion:1,app:APP_NAME});
        }
      }
      // Preserve the existing Task #11 cloud bridge if present, without creating another database.
      if (window.CAUnifiedCloud?.pushLocal) { try { await window.CAUnifiedCloud.pushLocal(); } catch {} }
      localStorage.setItem(MARK, JSON.stringify({uid:user.uid,lastSyncAt:Date.now(),version:1}));
      setStatus(navigator.onLine ? 'Cloud sync complete.' : 'Offline — changes remain local and will sync when online.');
    } catch(e) { console.warn('Task 12 sync deferred',e); setStatus(navigator.onLine ? 'Cloud sync deferred; local data preserved.' : 'Offline — local changes preserved.'); }
    finally { syncing = false; }
  }

  function patchSaveStorage() {
    if (window.__caTask12SavePatched) return;
    const original = window.saveStorage;
    if (typeof original !== 'function') return;
    window.saveStorage = function(key,value) {
      const result = original.apply(this, arguments);
      if (currentUser && db && navigator.onLine) writeEnvelope(currentUser.uid,key,localStorage.getItem(key)).catch(()=>{});
      return result;
    };
    window.__caTask12SavePatched = true;
  }

  function networkUI() {
    const e = document.getElementById('ca12Net'); if (!e) return;
    e.textContent = navigator.onLine ? 'Online' : 'Offline'; e.className = navigator.onLine ? 'ca12-online' : 'ca12-offline';
  }

  async function boot() {
    ensureUI(); networkUI(); window.addEventListener('online',()=>{networkUI(); if(currentUser) syncCloud(currentUser);}); window.addEventListener('offline',networkUI);
    // Let the existing Task #11 bridge initialize first; then share its auth/database instances.
    for (let i=0;i<20 && !window.CAUnifiedCloud;i++) await sleep(100);
    if (window.CAUnifiedCloud?.primaryAuth) {
      auth = window.CAUnifiedCloud.primaryAuth; db = window.CAUnifiedCloud.primaryDb; initialized = true;
      const authMod = await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js');
      await authMod.setPersistence(auth, authMod.browserLocalPersistence);
      authMod.onAuthStateChanged(auth, async user => { currentUser=user||null; authReady=true; if(!user)setGate(true); else {document.getElementById('ca12User').textContent=user.email||user.uid;setGate(false);await syncCloud(user);} });
      window.CATask12 = {auth,db,user:()=>currentUser,login,logout,resetPassword,sync:()=>currentUser?syncCloud(currentUser):false};
    } else {
      await initFirebase();
    }
    patchSaveStorage();
    networkUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
