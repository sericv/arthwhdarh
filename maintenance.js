/* ═══════════════════════════════════════════════════════════════════
   MAINTENANCE.JS — جمعية إرث وحضارة بالقريات
   Reads settings/site from Firestore. If maintenance mode is enabled
   by the admin, it locks the whole site behind a heritage overlay
   showing the logo + a custom admin message.
   Include on every public page:  <script type="module" src="maintenance.js"></script>
═══════════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp({
  apiKey:"AIzaSyDnWUCjJKkMqORT8SeLYHszAIP0bv8PCSg",
  authDomain:"arthwhdarh-782ec.firebaseapp.com",
  projectId:"arthwhdarh-782ec",
  storageBucket:"arthwhdarh-782ec.firebasestorage.app",
  messagingSenderId:"597405952213",
  appId:"1:597405952213:web:5ffeab6adc7e451a265a5c"
});
const db = getFirestore(app);

/* Resolve the logo path relative to the current page.
   Public pages live at the site root, so this is the standard path. */
const LOGO_SRC = "assets/الشعار/الشعار.png";

const DEFAULT_MESSAGE =
  "نعمل حالياً على تطوير الموقع وتحسين تجربتكم.\nنعتذر عن الانقطاع المؤقت، وسنعود إليكم قريباً بإذن الله.";

function esc(s){
  return (s ?? '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildOverlay(data){
  const title   = (data && data.title)   ? esc(data.title)   : 'الموقع تحت الصيانة';
  const message = (data && data.message) ? esc(data.message) : esc(DEFAULT_MESSAGE);

  const overlay = document.createElement('div');
  overlay.className = 'mnt-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'الموقع تحت الصيانة');
  overlay.innerHTML = `
    <div class="mnt-inner">
      <div class="mnt-logo-rings" aria-hidden="true">
        <div class="mnt-ring r1"></div>
        <div class="mnt-ring r2"></div>
        <div class="mnt-ring r3"></div>
        <div class="mnt-orbit"><i></i><i></i><i></i><i></i></div>
        <div class="mnt-logo-disc">
          <img src="${LOGO_SRC}" alt="شعار جمعية إرث وحضارة بالقريات">
        </div>
      </div>

      <span class="mnt-eyebrow">
        <span class="dot"></span>
        Under Maintenance · صيانة الموقع
        <span class="dot"></span>
      </span>

      <h1 class="mnt-title">${title}</h1>
      <p class="mnt-message">${message}</p>

      <div class="mnt-foot">
        <div class="mnt-foot-orn">
          <div class="mnt-foot-line"></div>
          <div class="mnt-foot-diamond"></div>
          <div class="mnt-foot-line r"></div>
        </div>
        <div class="mnt-foot-name">جمعية إرث وحضارة بالقريات</div>
        <div class="mnt-foot-sub">Erth wa Hadarah · Al-Qurayyat</div>
      </div>
    </div>`;

  return overlay;
}

function lockSite(data){
  document.documentElement.classList.add('mnt-locked');
  document.body.classList.add('mnt-locked');
  const overlay = buildOverlay(data);
  document.body.appendChild(overlay);
}

async function checkMaintenance(){
  try{
    const snap = await getDoc(doc(db, 'settings', 'site'));
    if(!snap.exists()) return;
    const m = snap.data().maintenance;
    if(m && m.enabled === true){
      if(document.body){
        lockSite(m);
      }else{
        document.addEventListener('DOMContentLoaded', () => lockSite(m));
      }
    }
  }catch(e){
    /* On any error, fail open: keep the real site visible. */
    console.warn('Maintenance check skipped:', e);
  }
}

checkMaintenance();
