/* C&A emergency security compatibility repair — injected by service worker. */
(function () {
  const SECURITY_KEY = 'ca_solutions_security_v1';
  const SECURITY_VERSION = 1;
  const SECURITY_KDF = 'PBKDF2-SHA-256';
  const SECURITY_CIPHER = 'AES-GCM';
  // Firebase Web API keys are client identifiers, not secrets. The previously committed
  // key has been removed from source; Firebase recovery must be configured server-side.
  const FIREBASE_CONFIG = {
    authDomain: 'ca-solutions-e397a.firebaseapp.com',
    databaseURL: 'https://ca-solutions-e397a-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'ca-solutions-e397a',
    storageBucket: 'ca-solutions-e397a.firebasestorage.app',
    messagingSenderId: '866641199604',
    appId: '1:866641199604:web:cb57598d5ddfd32d8d79a1'
  };
  function getMeta(){
    const raw=localStorage.getItem(SECURITY_KEY); if(!raw) return null;
    const m=JSON.parse(raw); const it=Number(m?.iterations);
    if(!m || m.version!==SECURITY_VERSION || m.kdf!==SECURITY_KDF || m.cipher!==SECURITY_CIPHER || !m.salt || !m.verifier || !Number.isInteger(it) || it<10000 || it>2000000) throw new Error('Security metadata is invalid. Existing data was not changed.');
    m.iterations=it; return m;
  }

  // Compatibility helper for the existing PBKDF2/AES-GCM security metadata.
  // This restores the missing function used by the direct unlock repair without
  // changing the stored metadata, password/PIN rules, or encrypted records.
  function deriveSecurityKey(password,salt,iterations){
    const passwordBytes=new TextEncoder().encode(password);
    let saltBytes;
    if(salt instanceof Uint8Array) saltBytes=salt;
    else if(Array.isArray(salt)) saltBytes=new Uint8Array(salt);
    else if(typeof salt==='string'){
      try{
        const binary=atob(salt);
        saltBytes=Uint8Array.from(binary,character=>character.charCodeAt(0));
      }catch(_){
        saltBytes=new TextEncoder().encode(salt);
      }
    }else{
      throw new Error('Security metadata salt is invalid. Existing data was not changed.');
    }
    return crypto.subtle.importKey('raw',passwordBytes,{name:'PBKDF2'},false,['deriveKey']).then(keyMaterial=>
      crypto.subtle.deriveKey(
        {name:'PBKDF2',salt:saltBytes,iterations:Number(iterations),hash:'SHA-256'},
        keyMaterial,
        {name:'AES-GCM',length:256},
        false,
        ['encrypt','decrypt']
      )
    );
  }

  window.validatePassword = function (password) {
    if(typeof password!=='string' || !password) throw new Error('Password / PIN enter karein.');
    if(!/^\d{4,8}$/.test(password) && password.length<8) throw new Error('Password must contain at least 8 characters, or use a 4–8 digit PIN.');
    if(password.length>256) throw new Error('Password / PIN is too long.');
    return true;
  };
  window.readSecurityMetadata = getMeta;
  window.__CA_FIREBASE_REPAIR_CONFIG = FIREBASE_CONFIG;
  window.firebaseRecoveryReady = function(){ return false; };
  window.initFirebaseRecovery = function(){ return false; };
  window.sendEmailRecoveryLink = async function(){
    throw new Error('Email recovery service is not configured on the server. Current PIN unlock is still available.');
  };
  window.startSecurityRecovery = async function(){
    const message=document.getElementById('recoveryMessage');
    if(message) message.textContent='Email recovery service is not configured on the server. Current PIN unlock is still available.';
  };

  /*
     Production unlock repair.
     The original gate can remain visually stuck when its inline handler is blocked or
     takes too long without feedback. This path uses the same PBKDF2/AES-GCM metadata and
     decrypts the existing records in place. It never clears, rewrites, or resets storage.
  */
  async function directUnlock(){
    const button=document.getElementById('securityActionButton');
    const passwordInput=document.getElementById('securityPassword');
    const message=document.getElementById('securityMessage');
    if(!button || !passwordInput || !message) return;
    if(window.__caDirectUnlockBusy) return;
    window.__caDirectUnlockBusy=true;
    button.disabled=true;
    message.textContent='Checking password securely…';

    try{
      const password=passwordInput.value;
      window.validatePassword(password);
      const metadata=window.readSecurityMetadata();
      if(!metadata) throw new Error('Security setup was not found. Existing data was not changed.');

      message.textContent='Deriving secure key…';
      await new Promise(resolve=>setTimeout(resolve,0));
      const key=await deriveSecurityKey(password,metadata.salt,metadata.iterations);

      message.textContent='Verifying protected data…';
      const marker=await decryptSecurityValue(metadata.verifier,key);
      if(marker!=='C_AND_A_SOLUTIONS_AUTH_MARKER_V1') throw new Error('Wrong password / PIN.');

      const decrypted=Object.create(null);
      for(const keyName of Object.values(STORAGE_KEYS)){
        const raw=localStorage.getItem(keyName);
        if(!raw){
          decrypted[keyName]=keyName===STORAGE_KEYS.attendance?{}:[];
          continue;
        }
        const parsed=JSON.parse(raw);
        if(!isEncryptedEnvelope(parsed)) throw new Error('Protected data is not fully encrypted. Existing data was not changed.');
        decrypted[keyName]=await decryptSecurityValue(parsed,key);
      }

      securityKey=key;
      securityCache=decrypted;
      securityUnlocked=true;
      securityInitialized=true;
      if(typeof resetSecurityIdleTimer==='function') resetSecurityIdleTimer();
      message.textContent='Unlocked.';
      if(typeof hideSecurityGate==='function') hideSecurityGate();
      if(typeof initializeApp==='function') initializeApp();
    }catch(error){
      console.error('Direct security unlock failed:',error);
      securityKey=null;
      securityUnlocked=false;
      securityCache=Object.create(null);
      message.textContent=error?.message || 'Unlock failed. Existing data was not changed.';
    }finally{
      window.__caDirectUnlockBusy=false;
      button.disabled=false;
    }
  }

  function installDirectUnlock(){
    const button=document.getElementById('securityActionButton');
    if(!button || button.dataset.caDirectUnlock==='1') return;
    button.dataset.caDirectUnlock='1';
    button.type='button';
    button.onclick=directUnlock;
    const input=document.getElementById('securityPassword');
    if(input && input.dataset.caDirectUnlockKey!=='1'){
      input.dataset.caDirectUnlockKey='1';
      input.addEventListener('keydown',event=>{
        if(event.key==='Enter'){
          event.preventDefault();
          directUnlock();
        }
      });
    }
  }

  /* UI repair: keep Labour Master inside the Add Labor workflow only. */
  function installLabourLayout(){
    const section=document.getElementById('labourSection');
    const modal=document.getElementById('laborModal');
    const content=modal?.querySelector('.modal-content');
    if(!section || !content || section.dataset.caMoved==='1') return;

    const oldBody=Array.from(content.children).filter(el => !el.classList.contains('modal-header'));
    const labourMount=document.createElement('div');
    labourMount.id='caLabourMasterMount';
    labourMount.style.marginTop='10px';
    labourMount.appendChild(section);
    content.appendChild(labourMount);
    section.dataset.caMoved='1';

    const workerFormParts=oldBody.filter(el => el.id !== 'caLabourMasterMount');

    const originalRenderOptional=window.renderLabourOptionalSections;
    if(typeof originalRenderOptional==='function' && !originalRenderOptional.__caWrapped){
      const wrappedRender=function(){
        const result=originalRenderOptional.apply(this,arguments);
        setTimeout(()=>{
          const root=document.getElementById('labourOptionalSections');
          if(!root) return;
          const removeTitles=new Set(['Advances','Wage Payments','Worker-level Details','Detailed Audit History']);
          root.querySelectorAll('.list-box').forEach(box=>{
            const title=box.querySelector('.list-title')?.textContent?.trim();
            if(removeTitles.has(title)) box.remove();
          });
        },0);
        return result;
      };
      wrappedRender.__caWrapped=true;
      window.renderLabourOptionalSections=wrappedRender;
    }

    const setWorkerFormVisible=visible=>workerFormParts.forEach(el=>{ el.style.display=visible?'':'none'; });
    const setLabourVisible=visible=>{ labourMount.style.display=visible?'':'none'; };

    function syncMode(){
      const editing=document.getElementById('editingWorkerId')?.value;
      const title=document.getElementById('workerModalTitle');
      if(editing){
        setWorkerFormVisible(true); setLabourVisible(false);
        if(title) title.textContent='👥 Edit Worker';
      } else {
        setWorkerFormVisible(false); setLabourVisible(true);
        if(title) title.textContent='Labour Master & Daily Attendance';
      }
    }

    const originalOpenModal=window.openModal;
    if(typeof originalOpenModal==='function' && !originalOpenModal.__caWrapped){
      const wrapped=function(id){
        const result=originalOpenModal.apply(this,arguments);
        if(id==='laborModal') setTimeout(syncMode,0);
        return result;
      };
      wrapped.__caWrapped=true;
      window.openModal=wrapped;
    }

    const originalOpenWorkerForAdd=window.openWorkerForAdd;
    if(typeof originalOpenWorkerForAdd==='function' && !originalOpenWorkerForAdd.__caWrapped){
      const wrapped=function(){
        const result=originalOpenWorkerForAdd.apply(this,arguments);
        setTimeout(()=>{ setWorkerFormVisible(true); setLabourVisible(false); },0);
        return result;
      };
      wrapped.__caWrapped=true;
      window.openWorkerForAdd=wrapped;
    }

    syncMode();
  }

  function boot(){
    installDirectUnlock();
    installLabourLayout();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
  else setTimeout(boot,0);
  setTimeout(boot,500);
  setTimeout(boot,1500);
  setTimeout(boot,3000);

  const gate=document.getElementById('securityGate');
  if(gate) gate.dataset.securityRepair='active';
})();
