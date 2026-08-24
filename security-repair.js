/* C&A emergency security compatibility repair — injected by service worker. */
(function () {
  const SECURITY_KEY = 'ca_solutions_security_v1';
  const SECURITY_VERSION = 1;
  const SECURITY_KDF = 'PBKDF2-SHA-256';
  const SECURITY_CIPHER = 'AES-GCM';
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyCsH7y8A9i1tMPGfSUfXnC9flS5Hs4BLTo',
    authDomain: 'ca-solutions-e397a.firebaseapp.com',
    databaseURL: 'https://ca-solutions-e397a-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'ca-solutions-e397a',
    storageBucket: 'ca-solutions-e397a.firebasestorage.app',
    messagingSenderId: '866641199604',
    appId: '1:866641199604:web:cb57598d5ddfd32d8d79a1'
  };
  function bytes(s) { const b=atob(s); const a=new Uint8Array(b.length); for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i); return a; }
  function getMeta(){
    const raw=localStorage.getItem(SECURITY_KEY); if(!raw) return null;
    const m=JSON.parse(raw); const it=Number(m?.iterations);
    if(!m || m.version!==SECURITY_VERSION || m.kdf!==SECURITY_KDF || m.cipher!==SECURITY_CIPHER || !m.salt || !m.verifier || !Number.isInteger(it) || it<10000 || it>2000000) throw new Error('Security metadata is invalid. Existing data was not changed.');
    m.iterations=it; return m;
  }
  window.validatePassword = function (password) {
    if(typeof password!=='string' || !password) throw new Error('Password / PIN enter karein.');
    if(!/^\d{4,8}$/.test(password) && password.length<8) throw new Error('Password must contain at least 8 characters, or use a 4–8 digit PIN.');
    if(password.length>256) throw new Error('Password / PIN is too long.');
    return true;
  };
  window.readSecurityMetadata = getMeta;
  window.__CA_FIREBASE_REPAIR_CONFIG = FIREBASE_CONFIG;
  window.firebaseRecoveryReady = function(){ return !!(window.firebase && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId); };
  window.initFirebaseRecovery = function(){
    if(!window.firebaseRecoveryReady()) return false;
    try { if(!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG); window.caFirebaseAuth=firebase.auth(); return true; }
    catch(e){ console.error('Firebase Auth repair init failed',e); return false; }
  };
  window.sendEmailRecoveryLink = async function(email){
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Valid registered email enter karein.');
    if(!window.caFirebaseAuth && !window.initFirebaseRecovery()) throw new Error('Firebase Authentication initialize nahi ho saka.');
    await window.caFirebaseAuth.sendSignInLinkToEmail(email,{url:window.location.origin+window.location.pathname+'?ca_email_recovery=1',handleCodeInApp:true});
    localStorage.setItem('ca_email_recovery_email',email.trim().toLowerCase());
  };
  window.startSecurityRecovery = async function(){
    const message=document.getElementById('recoveryMessage');
    try{
      const email=(document.getElementById('recoveryContact')?.value||'').trim();
      if(!window.firebaseRecoveryReady()) throw new Error('Email recovery service could not initialize. Current PIN unlock is still available.');
      if(location.protocol==='file:'||location.protocol==='content:') throw new Error('C&A ko HTTPS hosting se open karein.');
      await window.sendEmailRecoveryLink(email);
      if(message) message.textContent='Recovery link email par bhej diya. Inbox/Spam check karein.';
    }catch(e){ console.error('Recovery repair failed',e); if(message) message.textContent=e.message||'Recovery link send nahi hua.'; }
  };
  const gate=document.getElementById('securityGate');
  if(gate) gate.dataset.securityRepair='active';
})();
