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

      <div class="mnt-contact">
        <span class="mnt-contact-label">
          <span class="ln"></span>
          للتواصل مع الجمعية
          <span class="ln r"></span>
        </span>

        <div class="mnt-contact-rows">
          <a class="mnt-contact-item" href="tel:+966556420066">
            <i class="fas fa-phone" aria-hidden="true"></i>
            <span class="val">+966 55 642 0066</span>
          </a>
          <a class="mnt-contact-item" href="mailto:arthwhdarh@gmail.com">
            <i class="fas fa-envelope" aria-hidden="true"></i>
            <span class="val">arthwhdarh@gmail.com</span>
          </a>
        </div>

        <div class="mnt-social">
          <a href="https://wa.me/message/YM2GI6MVFQ77P1" target="_blank" rel="noopener" aria-label="WhatsApp" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>
          <a href="https://www.instagram.com/arthwhdarh" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram"><i class="fab fa-instagram"></i></a>
          <a href="https://twitter.com/arthwhdarh" target="_blank" rel="noopener" aria-label="X (Twitter)" title="X"><i class="fab fa-twitter"></i></a>
          <a href="https://t.snapchat.com/E3VbZjui" target="_blank" rel="noopener" aria-label="Snapchat" title="Snapchat"><i class="fab fa-snapchat-ghost"></i></a>
          <a href="https://t.me/arthwhdarhx" target="_blank" rel="noopener" aria-label="Telegram" title="Telegram"><i class="fab fa-telegram"></i></a>
          <a href="https://www.tiktok.com/@arthwhdarh" target="_blank" rel="noopener" aria-label="TikTok" title="TikTok"><i class="fab fa-tiktok"></i></a>
        </div>
      </div>

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

/* Stop the inline failsafe timer once we've made a decision. */
function clearFailsafe(){
  if(window.__mntFailsafe){ clearTimeout(window.__mntFailsafe); window.__mntFailsafe = null; }
}

/* Reveal the real site (maintenance OFF or check failed). */
function revealSite(){
  clearFailsafe();
  document.documentElement.classList.remove('mnt-checking');
}

/* Lock the site and show the maintenance overlay (maintenance ON). */
function lockSite(data){
  clearFailsafe();
  const run = () => {
    document.documentElement.classList.add('mnt-locked');
    document.body.classList.add('mnt-locked');
    document.body.appendChild(buildOverlay(data));
    /* keep content hidden (mnt-checking stays); overlay covers everything */
  };
  if(document.body) run();
  else document.addEventListener('DOMContentLoaded', run);
}

async function checkMaintenance(){
  try{
    const snap = await getDoc(doc(db, 'settings', 'site'));
    const m = snap.exists() ? snap.data().maintenance : null;
    if(m && m.enabled === true){
      lockSite(m);          /* ON  → keep hidden + show overlay */
    }else{
      revealSite();         /* OFF → show the real site */
    }
  }catch(e){
    /* On any error, fail open: reveal the real site. */
    console.warn('Maintenance check skipped:', e);
    revealSite();
  }
}

checkMaintenance();
