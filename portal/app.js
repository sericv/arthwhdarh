/* ══════════════════════════════════════════════════════════
   بوابة الموظفين — منطق التطبيق الكامل
   جمعية إرث وحضارة بالقريات
══════════════════════════════════════════════════════════ */
import {
  ROLES, DEPARTMENTS, FILE_STATUS, TASK_STATUS, TASK_PRIORITY,
  LEAVE_TYPES, LEAVE_STATUS, NOTIF_TYPE, NOTIF_PREFS, NOTIF_PREFS_DEFAULT,
  COL
} from "./config.js?v=5";
import * as S from "./services.js?v=5";
import { renderPdfEditor, checkUnsavedAndLeave } from "./pdf-editor.js";
import { renderFinancialCalc } from "./financial-calc.js";
import { renderAnnouncements } from "./announcements.js";
import { generateMasterDocumentPDF as masterPDFEngine, generatePrintablePDFReport as masterPrintReport, getLoggedUserRoleTitle as getLoggedUserRoleTitleDoc } from "./documents/master-template.js";
import { generateLeavePdf as generateLeavePdfDoc } from "./documents/leave-letter.js";
import { generateLeaveRequestPdf as generateLeaveRequestPdfDoc } from "./documents/leave-request.js";
import { downloadMonthlyAttendancePDF as downloadMonthlyAttendancePDFDoc, getPdfStatusBadge as getPdfStatusBadgeDoc } from "./documents/monthly-attendance.js";
import { downloadEmployeeAttendancePDF as downloadEmployeeAttendancePDFDoc } from "./documents/employee-attendance.js";

/* ════════ الحالة العامة (State) ════════ */
const State = {
  user: null,          // ملف المستخدم الحالي + الصلاحيات
  users: [],           // قائمة الموظفين
  files: [],
  tasks: [],
  leaves: [],          // طلبات الإجازات
  myLeaves: [],
  empLeaves: [],
  execLeaves: [],
  notifs: [],
  view: "dash",
  selectedEmp: null,   // الموظف المعروض حالياً في شاشة الملف الشخصي
  profileTab: "info",  // التبويب النشط في الملف الشخصي
  tempAdminTaskFile: null, // الملف المرفق المرفوع مؤقتاً من قبل المدير
  filesDept: null,
  filesCat: "all",
  filesQuery: "",
  leaveFilter: "all",
  taskFilter: "all",
  userSearchQuery: "",
  notifUnsub: null,
  notifMode: null,
  notifSeen: new Set(),
  notifPrefs: { ...NOTIF_PREFS_DEFAULT },
  deviceToken: null,
  notifQuery: "",
  notifFilter: "all",
  
  // المهام الشخصية (ملاحظاتي)
  personalTasks: [],
  myNotesViewMode: "board", // "board" | "list"
  myNotesFilterStatus: "all",
  myNotesFilterPriority: "all",
  myNotesSortBy: "createdAtDesc", // "createdAtDesc" | "createdAtAsc" | "dueDate" | "priority"
  myNotesFilterUser: "me" // "me" or a specific user's uid or "all" for admins
};

/* ════════ أدوات مساعدة ════════ */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => (s||"").toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const initials = n => (n||"؟").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("");
function fmtSize(b){ if(!b) return "—"; const u=["B","KB","MB","GB"]; let i=0; while(b>=1024&&i<3){b/=1024;i++;} return `${b.toFixed(b<10&&i>0?1:0)} ${u[i]}`; }
function tsToDate(ts){ if(!ts) return null; if(ts.toDate) return ts.toDate(); if(ts.seconds) return new Date(ts.seconds*1000); return new Date(ts); }
function timeAgo(ts) {
  const dateObj = tsToDate(ts);
  if (!dateObj) return "الآن";
  const seconds = Math.floor((Date.now() - dateObj.getTime()) / 1000);
  if (seconds < 60) return "الآن";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    if (minutes === 1) return "منذ دقيقة";
    if (minutes === 2) return "منذ دقيقتين";
    if (minutes <= 10) return `منذ ${minutes} دقائق`;
    return `منذ ${minutes} دقيقة`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    if (hours === 1) return "منذ ساعة";
    if (hours === 2) return "منذ ساعتين";
    if (hours <= 10) return `منذ ${hours} ساعات`;
    return `منذ ${hours} ساعة`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) return "أمس";
  if (days === 2) return "منذ يومين";
  if (days <= 10) return `منذ ${days} أيام`;
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function fmtDate(ts){
  const d = tsToDate(ts);
  if (!d) return "—";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function getHijriDate(ts) {
  const d = tsToDate(ts);
  if (!d) return "—";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function getGregorianDate(ts) {
  const d = tsToDate(ts);
  if (!d) return "—";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

async function generateLeavePdf(leaveId, btn) {
  return generateLeavePdfDoc(leaveId, btn, {
    State,
    S,
    LEAVE_TYPES,
    getGregorianDate,
    getHijriDate,
    esc,
    toast
  });
}

async function generateLeaveRequestPdf(leaveId, btn) {
  return generateLeaveRequestPdfDoc(leaveId, btn, {
    State,
    S,
    LEAVE_TYPES,
    getGregorianDate,
    getHijriDate,
    esc,
    toast
  });
}

function isTechAdmin(u = State.user){
  return u && (u.isTechAdmin === true || u.role === "tech_admin");
}
function isHR(u = State.user){
  return u && (u.role === "hr" || u.role === "executive" || isTechAdmin(u));
}
function isExec(u = State.user){
  return u && (u.role === "executive" || isTechAdmin(u));
}
function canManageLeaves(u = State.user){
  return u && (u.role === "hr" || (isTechAdmin(u) && u.role !== "executive"));
}

/* ════════ Toast ════════ */
let toastTimer;
function toast(msg, type="ok"){
  const t=$("#toast");
  $("#toastMsg").textContent=msg;
  const ic = type==="err"?"fa-circle-exclamation":"fa-circle-check";
  $("#toastIco").className=`fa-solid ${ic}`;
  t.className=`toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("show"),3200);
}

/* ════════ Modal System (Micro-interactions & Smooth Transitions) ════════ */
function openModal(html, wide){
  const m=$("#modal");
  m.className = "modal" + (wide?" preview-modal":"");
  m.innerHTML=html;
  const shroud = $("#modalShroud");
  shroud.classList.remove("closing");
  shroud.classList.add("open");
  document.body.style.overflow="hidden";
  $$("[data-close]",m).forEach(b=>b.addEventListener("click",closeModal));
}

function closeModal(){
  const shroud = $("#modalShroud");
  if(!shroud || !shroud.classList.contains("open")) return;
  shroud.classList.add("closing");
  setTimeout(()=>{
    shroud.classList.remove("open", "closing");
    document.body.style.overflow="";
  }, 200);
}
$("#modalShroud").addEventListener("click",e=>{ if(e.target.id==="modalShroud") closeModal(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && $("#modalShroud").classList.contains("open")) closeModal(); });

/* ════════ Success Feedback System (Centralized Micro-interactions) ════════ */
function showActionSuccess({ title = "تمت العملية بنجاح", message = "", inModal = true, duration = 850, onComplete } = {}) {
  return new Promise((resolve) => {
    const modalEl = $("#modal");
    const isModalOpen = $("#modalShroud") && $("#modalShroud").classList.contains("open");

    if (inModal && isModalOpen && modalEl) {
      modalEl.innerHTML = `
        <div class="action-success-card">
          <div class="action-success-icon-wrap">
            <svg class="action-success-svg" viewBox="0 0 52 52">
              <circle class="action-success-circle" cx="26" cy="26" r="24" fill="none"/>
              <path class="action-success-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
          </div>
          <h3 class="action-success-title">${esc(title)}</h3>
          ${message ? `<p class="action-success-sub">${esc(message)}</p>` : ''}
        </div>
      `;
      setTimeout(() => {
        closeModal();
        if (onComplete) onComplete();
        resolve();
      }, duration);
    } else {
      showSuccessBadge(title, message, duration + 1400);
      setTimeout(() => {
        if (onComplete) onComplete();
        resolve();
      }, duration);
    }
  });
}

function showSuccessBadge(title, message = "", duration = 2600) {
  let badge = $("#actionSuccessBadge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "actionSuccessBadge";
    badge.className = "action-success-badge";
    document.body.appendChild(badge);
  }
  badge.innerHTML = `
    <div class="badge-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
    </div>
    <div class="badge-text">
      <span class="badge-title">${esc(title)}</span>
      ${message ? `<span class="badge-sub">${esc(message)}</span>` : ''}
    </div>
  `;
  badge.classList.remove("show");
  void badge.offsetWidth; // Force reflow
  badge.classList.add("show");
  clearTimeout(badge._timer);
  badge._timer = setTimeout(() => {
    badge.classList.remove("show");
  }, duration);
}

function showSuccessAnimation(title, subtitle, onComplete){
  return showActionSuccess({ title, message: subtitle, inModal: true, duration: 850, onComplete });
}

/* Custom Professional Confirmation Modal */
function openConfirmModal({ title, message, confirmText = "حذف", confirmType = "danger", onConfirm }){
  openModal(`
    <div class="modal-head">
      <h2>${esc(title)}</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div style="font-size:14px;color:var(--ink-soft);line-height:1.6;margin-bottom:20px">
      ${esc(message)}
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px">
      <button class="btn btn-secondary" data-close>إلغاء</button>
      <button class="btn btn-${confirmType}" id="modalConfirmBtn">${esc(confirmText)}</button>
    </div>
  `);
  $("#modalConfirmBtn").addEventListener("click", async () => {
    const btn = $("#modalConfirmBtn");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ التنفيذ…`;
    try {
      await onConfirm();
      closeModal();
    } catch(e) {
      toast("حدث خطأ أثناء تنفيذ العملية", "err");
      closeModal();
    }
  });
}

/* Smooth Row Removal Animation Helper */
function animateRowRemoval(rowEl, onDone){
  if(!rowEl) { if(onDone) onDone(); return; }
  rowEl.classList.add("removing-row");
  setTimeout(() => {
    if(onDone) onDone();
  }, 260);
}

/* Skeleton Loading HTML Builder */
function renderSkeletons(count = 3, height = "80px"){
  return Array.from({length: count}).map(() => `
    <div class="skeleton-box" style="height:${height};margin-bottom:12px;width:100%"></div>
  `).join("");
}

/* ════════ مصادقة المستخدم (Authentication Lifecycle) ════════ */
console.log("%c[Portal] Boot started", "color:#9c6e38;font-weight:bold");
console.log("%c[Portal] Firebase initialized", "color:#9c6e38;font-weight:bold");
console.log("%c[Portal] Authentication ready", "color:#9c6e38;font-weight:bold");

S.onAuthStateChanged(S.auth, async (fbUser)=>{
  if(!fbUser){
    console.log("%c[Portal] No active session — showing login screen", "color:#6b4f35");
    stopLiveSync();
    showLogin();
    return;
  }

  console.log(`%c[Portal] User authenticated: ${fbUser.email || "User"} (UID: ${fbUser.uid})`, "color:#2d4a63;font-weight:bold");

  try {
    const profile = await S.fetchUserProfile(fbUser.uid);
    if(!profile){
      console.warn(`[Portal] Login failed: No user document in portal_users for UID ${fbUser.uid}`);
      await S.logout().catch(()=>{});
      showLogin(`لا يوجد مستند موظف مرتبط بحسابك في portal_users (UID: ${fbUser.uid}). يمكنك نسخته واستخدامه في أداة seed.html لتأسيس الحساب.`);
      return;
    }

    if(profile.status === "disabled"){
      console.warn(`[Portal] Login failed: User account ${fbUser.uid} is disabled`);
      await S.logout().catch(()=>{});
      showLogin("حسابك معطل حالياً. يرجى التواصل مع المسؤول التقني لإعادة تفعيله.");
      return;
    }

    State.user = profile;
    if (profile.themePreference) {
      applyTheme(profile.themePreference, false);
    } else {
      const localTheme = localStorage.getItem("portal_theme") || "classic";
      applyTheme(localTheme, false);
    }
    console.log(`%c[Portal] User profile loaded for UID: ${fbUser.uid}`, "color:#3a5e2e;font-weight:bold");
    await enterApp();
  } catch(err) {
    console.error("[Portal] Authentication error during profile fetch:", err);
    await S.logout().catch(()=>{});
    showLogin("حدث خطأ أثناء تحميل بيانات الملف الشخصي: " + (err.message || err));
  } finally {
    if (!isInitialRevealDone) {
      revealPortal(State.user ? "app" : "login");
    }
    resetLoginBtn();
  }
});

/* ════════ Progressive Reveal Transition Manager ════════ */
let isInitialRevealDone = false;

function revealPortal(target = "app") {
  const boot = $("#bootScreen");
  if (!boot) return;

  if (isInitialRevealDone) {
    boot.classList.add("hidden");
    return;
  }
  isInitialRevealDone = true;

  const targetEl = target === "app" ? $("#appShell") : $("#loginScreen");

  const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    boot.classList.add("hidden");
    return;
  }

  // الكشف التدريجي المنظم لعناصر الواجهة
  if (targetEl) {
    targetEl.classList.add("portal-revealing");
  }
  boot.classList.add("fading-out");

  setTimeout(() => {
    boot.classList.add("hidden");
    boot.classList.remove("fading-out");
    if (targetEl) {
      targetEl.classList.remove("portal-revealing");
    }
    console.log("%c[Portal] Progressive Reveal completed", "color:#3a5e2e;font-weight:bold");
  }, 480);
}

function showLogin(err=""){
  $("#appShell").classList.remove("show");
  $("#loginScreen").classList.remove("hidden");
  resetLoginBtn();
  $("#loginErr").innerHTML = err ? `<i class="fa-solid fa-circle-exclamation"></i><span>${esc(err)}</span>` : "";
  revealPortal("login");
}

function resetLoginBtn(){
  const btn = $("#loginBtn");
  if(btn){
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول`;
  }
}

$("#loginForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email=$("#loginEmail").value.trim();
  const pass=$("#loginPass").value;
  const btn=$("#loginBtn");
  $("#loginErr").innerHTML="";

  if(!email||!pass){
    $("#loginErr").innerHTML=`<i class="fa-solid fa-circle-exclamation"></i><span>أدخل البريد الإلكتروني وكلمة المرور</span>`;
    return;
  }

  btn.disabled=true;
  btn.innerHTML=`<i class="fa-solid fa-spinner spin"></i> جارٍ تسجيل الدخول…`;
  console.log("%c[Portal] Login request started...", "color:#9c6e38;font-weight:bold");

  try{
    const user = await S.login(email, pass);
    console.log(`%c[Portal] Login success for ${email} (UID: ${user.uid})`, "color:#3a5e2e;font-weight:bold");
  }catch(err){
    console.error("[Portal] Login failed:", err.code || err, err.message);
    const map={
      "auth/invalid-credential":"البريد الإلكتروني أو كلمة المرور غير صحيحة",
      "auth/user-not-found":"لا يوجد حساب بهذا البريد الإلكتروني",
      "auth/wrong-password":"كلمة المرور غير صحيحة",
      "auth/invalid-email":"صيغة البريد الإلكتروني غير صحيحة",
      "auth/too-many-requests":"محاولات كثيرة خاطئة — حاول لاحقاً"
    };
    $("#loginErr").innerHTML=`<i class="fa-solid fa-circle-exclamation"></i><span>${map[err.code]||("تعذّر تسجيل الدخول: "+(err.message||""))}</span>`;
    resetLoginBtn();
  }
});

/* ════════ الاستماعات اللحظية لـ Firestore (Live Sync) ════════ */
function startLiveSync(){
  const u = State.user;
  if(!u) return;

  stopLiveSync();

  const isHRUser = u && (u.role === "hr" || (isTechAdmin(u) && u.role !== "executive"));
  const isExecUser = u && (u.role === "executive" || isTechAdmin(u));

  // 1. Watch Tasks
  try {
    State.tasksUnsub = S.watchTasks(u, async (list) => {
      State.tasks = list || [];
      if(!isExec(u)) {
        if(!State.userExecutionsMap) State.userExecutionsMap = {};
        const groupTasks = (list || []).filter(t => t.isGroup === true);
        await Promise.all(groupTasks.map(async (t) => {
          const exec = await S.getTaskExecution(t.id, u.uid);
          State.userExecutionsMap[t.id] = exec?.status || "not_started";
        }));
      }
      triggerViewRefresh("tasks");
    });
  } catch(e){ console.warn("[Portal] watchTasks error:", e); }

  // 2. Watch My Leaves
  try {
    State.leavesUnsub = S.watchMyLeaves(u.uid, (list) => {
      State.leaves = list || [];
      State.myLeaves = list || [];
      triggerViewRefresh("leaves");
    });
  } catch(e){ console.warn("[Portal] watchMyLeaves error:", e); }

  // 3. Watch Exec Leaves (for approval)
  if(isExecUser){
    try {
      State.execLeavesUnsub = S.watchLeavesForExecApproval((list) => {
        State.execLeaves = list || [];
        triggerViewRefresh("exec_leaves_approval");
      });
    } catch(e){ console.warn("[Portal] watchLeavesForExecApproval error:", e); }
  }

  // 4. Watch HR/Exec Leaves (for Directory & Reviews)
  if(isHRUser || isExecUser){
    try {
      State.empLeavesUnsub = S.watchEmpLeavesForHR(u.uid, (list) => {
        State.empLeaves = list || [];
        triggerViewRefresh("emp_leaves");
        triggerViewRefresh("members");
      });
    } catch(e){ console.warn("[Portal] watchEmpLeavesForHR error:", e); }
  }

  // 5. Watch Suggestions & Complaints
  try {
    State.suggestionsUnsub = S.watchSuggestions(u.uid, (list) => {
      State.suggestions = list || [];
      triggerViewRefresh("suggestions");
      renderSidebar(); // Update sidebar notification dots in real-time
    });
  } catch(e){ console.warn("[Portal] watchSuggestions error:", e); }

  // 6. Watch Today Attendance & Attendance Settings
  try {
    State.todayAttendanceUnsub = S.watchAttendanceRecordForToday(u.uid, (record) => {
      State.todayAttendance = record;
      triggerViewRefresh("dash");
    });
  } catch(e){ console.warn("[Portal] watchAttendanceRecordForToday error:", e); }

  try {
    State.attendanceSettingsUnsub = S.watchAttendanceSettings((settings) => {
      State.attendanceSettings = settings;
      triggerViewRefresh("dash");
      triggerViewRefresh("settings");
    });
  } catch(e){ console.warn("[Portal] watchAttendanceSettings error:", e); }
}

function stopLiveSync(){
  if(State.tasksUnsub){ try { State.tasksUnsub(); }catch(e){} State.tasksUnsub = null; }
  if(State.leavesUnsub){ try { State.leavesUnsub(); }catch(e){} State.leavesUnsub = null; }
  if(State.execLeavesUnsub){ try { State.execLeavesUnsub(); }catch(e){} State.execLeavesUnsub = null; }
  if(State.empLeavesUnsub){ try { State.empLeavesUnsub(); }catch(e){} State.empLeavesUnsub = null; }
  if(State.suggestionsUnsub){ try { State.suggestionsUnsub(); }catch(e){} State.suggestionsUnsub = null; }
  if(State.notifUnsub){ try { State.notifUnsub(); }catch(e){} State.notifUnsub = null; }
  if(State.todayAttendanceUnsub){ try { State.todayAttendanceUnsub(); }catch(e){} State.todayAttendanceUnsub = null; }
  if(State.attendanceSettingsUnsub){ try { State.attendanceSettingsUnsub(); }catch(e){} State.attendanceSettingsUnsub = null; }
}

function triggerViewRefresh(dataContext){
  const host = $("#viewHost");
  if(!host) return;

  if(State.view === "dash"){
    renderDash(host);
  } else if(State.view === dataContext){
    const m = VIEW_META[State.view];
    if(m && m.fn) m.fn(host);
  }
}

/* ════════ دخول التطبيق (Enter Application) ════════ */
/* ════════ دخول التطبيق (Enter Application) ════════ */
async function enterApp(){
  try {
    $("#loginScreen").classList.add("hidden");
    $("#appShell").classList.add("show");

    // Render core UI components that do not depend on async data
    State.notifs = [];
    renderSidebar();
    renderUserFooter();
    console.log("%c[Portal] UI initialized (minimal)", "color:#3a5e2e;font-weight:bold");

    // Start real-time sync for tasks and leaves
    startLiveSync();

    // OPTIONAL: Load data in background – errors will not block UI
    (async () => {
      try {
        await loadAllData();
        // Re-render current view with the new data
        const host = $("#viewHost");
        if (host && State.view && VIEW_META[State.view]) {
          VIEW_META[State.view].fn(host);
        }
      } catch(e){
        console.warn("[Portal] loadAllData background error:", e);
      }
    })();

    // OPTIONAL: Setup notifications – ignore failures
    try {
      if(State.notifUnsub) State.notifUnsub();
      State.notifUnsub = S.watchNotifications(State.user, (list)=>{
        if(State.notifs && State.notifs.length > 0 && list && list.length > State.notifs.length){
          const oldIds = new Set(State.notifs.map(n => n.id));
          const newItems = list.filter(n => !oldIds.has(n.id) && !n.read);
          newItems.forEach(n => {
            S.showLocalNotification(n.title, n.body, {
              onClick: () => navigate(n.link || "notifs")
            });
          });
        }
        State.notifs = list;
        renderNotifBadge();
        if(State.view==="notifs") renderNotifs();
      });
    } catch(e){ console.warn("[Portal] watchNotifications error:", e); }

    // Only init messaging automatically if permission is already granted, else show soft banner.
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      S.initMessaging(State.user.uid).catch(e=>console.warn("[Portal] Messaging init error:", e));
    } else {
      setTimeout(checkAndShowNotificationBanner, 1200);
    }

    // Navigate to target view from deep link hash or query parameters
    const hasHashLink = checkUrlHashDeepLink();
    if (!hasHashLink) {
      const urlParams = new URLSearchParams(window.location.search);
      const targetView = urlParams.get("view");
      if (targetView && VIEW_META[targetView]) {
        navigate(targetView);
        window.history.replaceState({}, document.title, window.location.pathname);
        console.log(`%c[Portal] Navigated to query-param view: ${targetView}`, "color:#3a5e2e;font-weight:bold");
      } else {
        navigate("dash");
        console.log("%c[Portal] Dashboard rendered", "color:#3a5e2e;font-weight:bold");
      }
    }

    // Trigger Circle Reveal Transition
    revealPortal("app");
  } catch(err) {
    console.error("[Portal] Fatal error in enterApp:", err);
    showLogin("حدث خطأ غير متوقع. يرجى إعادة تسجيل الدخول.");
  } finally {
    if (!isInitialRevealDone) {
      revealPortal(State.user ? "app" : "login");
    }
  }
}

async function loadAllData(){
  try {
    const [users, personalTasks] = await Promise.all([
      S.listUsers().catch(err=>{ console.warn("[Portal] listUsers notice:", err); return [State.user]; }),
      S.listPersonalTasks(State.user).catch(err=>{ console.warn("[Portal] listPersonalTasks notice:", err); return []; })
    ]);
    State.users = users || [State.user];
    State.files = [];
    State.personalTasks = personalTasks || [];
  } catch(err) {
    console.error("[Portal] loadAllData error:", err);
  }
}

/* ════════ الشريط الجانبي (Sidebar) ════════ */
function renderSidebar(){
  const u = State.user;
  const isHRUser = u && (u.role === "hr" || (isTechAdmin(u) && u.role !== "executive"));
  const isExecUser = u && (u.role === "executive" || isTechAdmin(u));
  const canViewEmps = isHR(u) || isExec(u) || isTechAdmin(u);
  const unreadCount = State.notifs.filter(n => !n.read).length;

  const pendingHRCount = (State.empLeaves || []).filter(l => l.status === "submitted" || l.status === "in_hr_review").length;
  const pendingExecCount = (State.execLeaves || []).filter(l => l.status === "hr_approved").length;

  const pendingSuggestionsCount = (State.suggestions || []).filter(s => s.recipientId === u.uid && !s.isRead).length;

  let workNav = `
    <li><button class="nav-item ${State.view==='dash'?'active':''}" data-nav="dash"><i class="fa-solid fa-house"></i><span class="nlbl">الرئيسية</span></button></li>
    <li><button class="nav-item ${State.view==='announcements'?'active':''}" data-nav="announcements"><i class="fa-solid fa-bullhorn"></i><span class="nlbl">التعميمات</span></button></li>
    <li><button class="nav-item ${State.view==='profile'?'active':''}" data-nav="profile"><i class="fa-solid fa-user"></i><span class="nlbl">الملف الشخصي</span></button></li>
    <li><button class="nav-item ${State.view==='leaves'?'active':''}" data-nav="leaves"><i class="fa-solid fa-calendar-days"></i><span class="nlbl">إجازاتي</span></button></li>
    <li><button class="nav-item ${State.view==='tasks'?'active':''}" data-nav="tasks"><i class="fa-solid fa-check-double"></i><span class="nlbl">المهام</span></button></li>
    <li><button class="nav-item ${State.view==='my_notes'?'active':''}" data-nav="my_notes"><i class="fa-solid fa-note-sticky"></i><span class="nlbl">ملاحظاتي</span></button></li>
    <li><button class="nav-item ${State.view==='suggestions'?'active':''}" data-nav="suggestions">
      <i class="fa-solid fa-comments"></i><span class="nlbl">الاقتراحات والشكاوى</span>
      <span class="nav-dot ${pendingSuggestionsCount > 0 ? 'show' : ''}"></span>
    </button></li>
  `;

  let toolsNav = `
    <li><button class="nav-item ${State.view==='tools'?'active':''}" data-nav="tools"><i class="fa-solid fa-toolbox"></i><span class="nlbl">أدوات عامة</span></button></li>
  `;

  let mgmtNav = "";
  if(isHRUser || isExecUser || isTechAdmin){
    mgmtNav += `<li><button class="nav-item ${State.view==='emp_leaves'?'active':''}" data-nav="emp_leaves">
      <i class="fa-solid fa-clipboard-user"></i><span class="nlbl">إجازات الموظفين</span>
      <span class="nav-dot ${pendingHRCount > 0 ? 'show' : ''}"></span>
    </button></li>`;
    mgmtNav += `<li><button class="nav-item ${State.view==='attendance'?'active':''}" data-nav="attendance">
      <i class="fa-solid fa-user-clock"></i><span class="nlbl">الحضور والانصراف</span>
    </button></li>`;
  }
  if(isExecUser){
    mgmtNav += `<li><button class="nav-item ${State.view==='exec_leaves_approval'?'active':''}" data-nav="exec_leaves_approval">
      <i class="fa-solid fa-stamp"></i><span class="nlbl">اعتماد الإجازات</span>
      <span class="nav-dot ${pendingExecCount > 0 ? 'show' : ''}"></span>
    </button></li>`;
  }

  let updatesNav = `
    <li><button class="nav-item ${State.view==='notifs'?'active':''}" data-nav="notifs">
      <i class="fa-solid fa-bell"></i><span class="nlbl">الإشعارات</span>
      <span class="nav-dot ${unreadCount > 0 ? 'show' : ''}"></span>
    </button></li>
  `;

  let adminNav = "";
  if(canViewEmps){
    adminNav = `
      <div class="nav-sec">الإدارة والتنمية</div>
      <ul class="nav-list">
        ${mgmtNav}
        <li><button class="nav-item ${State.view==='members'?'active':''}" data-nav="members"><i class="fa-solid fa-users"></i><span class="nlbl">دليل الموظفين</span></button></li>
        <li><button class="nav-item ${State.view==='settings'?'active':''}" data-nav="settings"><i class="fa-solid fa-sliders"></i><span class="nlbl">الإعدادات</span></button></li>
      </ul>
    `;
  } else {
    adminNav = `
      <div class="nav-sec">النظام</div>
      <ul class="nav-list">
        <li><button class="nav-item ${State.view==='settings'?'active':''}" data-nav="settings"><i class="fa-solid fa-sliders"></i><span class="nlbl">الإعدادات</span></button></li>
      </ul>
    `;
  }

  $("#navWrap").innerHTML = `
    <div class="nav-sec">بيئة العمل</div>
    <ul class="nav-list">${workNav}</ul>
    
    <div class="nav-sec">أدوات عامة</div>
    <ul class="nav-list">${toolsNav}</ul>
    
    <div class="nav-sec">التحديثات</div>
    <ul class="nav-list">${updatesNav}</ul>
    
    ${adminNav}
  `;

  $$("[data-nav]").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.nav === "profile") State.selectedEmp = null;
    navigate(b.dataset.nav);
    closeSidebar();
  }));
}

function renderUserFooter(){
  const u=State.user;
  const roleLabel = ROLES[u.role]?.label || u.role;
  $("#sidebarFoot").innerHTML=`
    <div class="sf-card">
      <div class="sf-avatar">${u.avatar ? `<img src="${esc(u.avatar)}">` : esc(initials(u.name))}</div>
      <div class="sf-who">
        <div class="n">${esc(u.name)}</div>
        <div class="r">${esc(roleLabel)} ${isTechAdmin(u)?' · مسئول تقني':''}</div>
      </div>
      <button class="sf-logout" id="footLogout" title="تسجيل الخروج"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
    </div>`;
  $("#footLogout").addEventListener("click",doLogout);
}

async function doLogout(){
  if(!confirm("هل تريد تسجيل الخروج من البوابة؟")) return;
  if(State.notifUnsub) State.notifUnsub();
  if(State.deviceToken){ await S.deleteFcmTokenDoc(State.deviceToken).catch(()=>{}); }
  await S.logout();
}

/* ════════ التنقل بين الشاشات (Navigation) ════════ */
const VIEW_META = {
  dash:                 { la:"Dashboard",        lbl:"الرئيسية",             fn:renderDash },
  announcements:        { la:"Work",             lbl:"التعميمات",            fn:renderAnnouncements },
  profile:              { la:"Profile",          lbl:"الملف الشخصي",         fn:renderProfile },
  leaves:               { la:"My Leaves",        lbl:"إجازاتي",               fn:renderMyLeaves },
  emp_leaves:           { la:"Employee Leaves",  lbl:"إجازات الموظفين",      fn:renderEmpLeavesHR },
  exec_leaves_approval: { la:"Leave Approvals",  lbl:"اعتماد الإجازات",       fn:renderExecLeavesApproval },
  attendance:           { la:"HR Management",    lbl:"الحضور والانصراف",      fn:renderAttendance },
  tasks:                { la:"Tasks",            lbl:"المهام",               fn:renderTasks },
  my_notes:             { la:"My Notes",         lbl:"ملاحظاتي",             fn:renderMyNotes },
  members:              { la:"Employees",        lbl:"الموظفون",             fn:renderMembers },
  suggestions:          { la:"Suggestions",      lbl:"الاقتراحات والشكاوى",    fn:renderSuggestions },
  notifs:               { la:"Alerts",           lbl:"الإشعارات",            fn:renderNotifs },
  settings:             { la:"Settings",         lbl:"الإعدادات",            fn:renderSettings },
  tools:                { la:"Tools",            lbl:"أدوات عامة",            fn:renderTools },
  pdf_editor:           { la:"أدوات عامة",       lbl:"محرر PDF",             fn:renderPdfEditor },
  financial_calc:       { la:"أدوات عامة",       lbl:"حاسبة النسب المالية",   fn:renderFinancialCalc },
  pdf_compress:         { la:"أدوات عامة",       lbl:"ضغط ملفات PDF",        fn:renderPdfCompress },
  img_to_pdf:           { la:"أدوات عامة",       lbl:"دمج الصور إلى PDF",    fn:renderImgToPdf },
  qr_generator:         { la:"أدوات عامة",       lbl:"مولد الباركود",        fn:renderQrGenerator }
};

function navigate(view){
  if (State.view === "pdf_editor" && view !== "pdf_editor") {
    checkUnsavedAndLeave(() => {
      performNavigate(view);
    });
    return;
  }
  performNavigate(view);
}

function performNavigate(view){
  if(!VIEW_META[view]) view="dash";
  State.view=view;
  $$("[data-nav]").forEach(b=>b.classList.toggle("active", b.dataset.nav===view));
  const m=VIEW_META[view];
  $("#crumbLa").textContent=m.la;
  $("#crumbCur").textContent=m.lbl;
  const host=$("#viewHost");
  host.classList.remove("active");
  setTimeout(()=>{ m.fn(host); host.classList.add("active"); host.scrollTop=0; }, 60);
}

// تصدير دوال الواجهة الأساسية للاستخدام العام
if (typeof window !== "undefined") {
  window.State = State;
  window.navigate = navigate;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.toast = toast;
  window.openConfirmModal = openConfirmModal;
  window.showActionSuccess = showActionSuccess;
}

// ربط النقر بمسار التنقل (Breadcrumbs) للرجوع للأدوات العامة
if (typeof window !== "undefined") {
  const crumbParent = $("#crumbLa");
  if (crumbParent) {
    crumbParent.addEventListener("click", () => {
      const parentText = crumbParent.textContent.trim();
      if (parentText === "أدوات عامة" || parentText === "Tools") {
        navigate("tools");
      } else {
        navigate("dash");
      }
    });
  }
}

function pageHead(la, lbl, title, accent, sub){
  return `<div class="page-head">
    <h1 class="page-title">${title} <span style="color:var(--gold-deep)">${accent||""}</span></h1>
    ${sub?`<p class="page-sub">${sub}</p>`:""}
  </div>`;
}
function emptyState(msg, sub="لا يوجد ما يُعرض حالياً"){
  return `<div class="empty-state">
    <div class="es-msg">${esc(msg)}</div>
    <div class="es-sub">${esc(sub)}</div>
  </div>`;
}

/* ── دوال مساعدة لبطاقة الحضور والانصراف ── */
function getFormattedArabicDate() {
  const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const now = new Date();
  const dayName = days[now.getDay()];
  const dayNum = now.getDate();
  const monthName = months[now.getMonth()];
  const yearNum = now.getFullYear();
  return `${dayName}، ${dayNum} ${monthName} ${yearNum}`;
}

function formatTime12hDisplay(tStr) {
  if (!tStr) return "";
  const clean = tStr.trim().toLowerCase();
  if (clean.includes("ص") || clean.includes("م")) return clean;
  const parts = clean.split(":");
  if (parts.length < 2) return clean;
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  if (isNaN(h)) return clean;
  const isPM = h >= 12;
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  const period = isPM ? "م" : "ص";
  return `${String(h).padStart(2, "0")}:${m} ${period}`;
}

function renderAttendanceCardHtml(u, record, settings) {
  const dateStr = getFormattedArabicDate();
  const startDisp = formatTime12hDisplay(settings?.workStartTime || "08:00");
  const endDisp = formatTime12hDisplay(settings?.workEndTime || "16:00");

  const todayIso = new Date().toISOString().split("T")[0];
  const hasApprovedLeave = (State.myLeaves || []).some(l => 
    (l.status === "approved" || l.status === "exec_approved") &&
    l.startDate && l.endDate && todayIso >= l.startDate && todayIso <= l.endDate
  );

  let statusBadgeHtml = "";
  let bodyContentHtml = "";

  if (hasApprovedLeave) {
    statusBadgeHtml = `
      <span style="background:rgba(124, 58, 237, 0.12); color:#7c3aed; padding:6px 14px; border-radius:999px; font-size:12.5px; font-weight:800; display:inline-flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-umbrella-beach"></i> إجازة معتمدة
      </span>
    `;
    bodyContentHtml = `
      <div style="background:rgba(124, 58, 237, 0.06); border:1px solid rgba(124, 58, 237, 0.2); border-radius:var(--r-md); padding:16px; margin-top:14px; text-align:center;">
        <div style="font-size:14px; font-weight:800; color:#7c3aed; margin-bottom:4px;">🟣 لديك إجازة معتمدة لهذا اليوم</div>
        <div style="font-size:12.5px; color:var(--ink-soft);">لا يتطلب منك تسجيل الحضور والانصراف اليوم. نتمنى لك إجازة سعيدة.</div>
      </div>
    `;
  } else if (!record || (!record.checkInTime && record.status !== "present" && record.status !== "late")) {
    statusBadgeHtml = `
      <span style="background:rgba(34, 197, 94, 0.12); color:#16a34a; padding:6px 14px; border-radius:999px; font-size:12.5px; font-weight:800; display:inline-flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-circle" style="font-size:8px;"></i> لم يتم تسجيل الحضور
      </span>
    `;
    bodyContentHtml = `
      <div style="margin-top:16px;">
        <button id="btnEmployeeCheckIn" class="btn btn-primary" style="width:100%; padding:14px; font-size:15px; font-weight:800; border-radius:var(--r-md); display:flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg, var(--gold-deep) 0%, #b88e36 100%); color:#fff; box-shadow:0 4px 14px rgba(184,142,54,0.25); cursor:pointer; border:none; transition:all 0.2s ease;">
          <i class="fa-solid fa-location-dot" style="font-size:16px;"></i>
          <span>تسجيل الحضور</span>
        </button>
        <div style="text-align:center; margin-top:10px; font-size:12px; color:var(--ink-muted); display:flex; align-items:center; justify-content:center; gap:6px;">
          <i class="fa-solid fa-location-crosshairs" style="color:var(--gold-deep);"></i>
          <span>📍 يجب أن تكون داخل نطاق مقر الجمعية</span>
        </div>
      </div>
    `;
  } else if (record.checkInTime && !record.checkOutTime) {
    statusBadgeHtml = `
      <span style="background:rgba(34, 197, 94, 0.12); color:#16a34a; padding:6px 14px; border-radius:999px; font-size:12.5px; font-weight:800; display:inline-flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-circle-check"></i> تم تسجيل الحضور
      </span>
    `;
    bodyContentHtml = `
      <div style="background:rgba(34, 197, 94, 0.06); border:1px solid rgba(34, 197, 94, 0.2); border-radius:var(--r-md); padding:14px; margin-top:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
          <span style="font-size:13px; font-weight:700; color:var(--ink);">وقت الحضور:</span>
          <span style="font-size:16px; font-weight:900; color:#16a34a;">${esc(record.checkInTime)}</span>
        </div>
        <div style="font-size:12px; color:#15803d; display:flex; align-items:center; gap:6px;">
          <i class="fa-solid fa-circle-check"></i>
          <span>📍 تم التحقق من موقع مقر الجمعية</span>
        </div>
      </div>

      <div style="margin-top:16px; padding-top:14px; border-top:1px dashed var(--line-soft);">
        <div style="font-size:13px; font-weight:700; color:var(--ink); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <span style="width:8px; height:8px; border-radius:50%; background:#22c55e; display:inline-block;"></span>
          <span>🟢 جاهز لتسجيل الانصراف</span>
        </div>
        <button id="btnEmployeeCheckOut" class="btn btn-secondary" style="width:100%; padding:13px; font-size:14.5px; font-weight:800; border-radius:var(--r-md); display:flex; align-items:center; justify-content:center; gap:8px; background:rgba(220, 38, 38, 0.08); color:var(--danger); border:1px solid rgba(220, 38, 38, 0.25); cursor:pointer; transition:all 0.2s ease;">
          <i class="fa-solid fa-right-from-bracket"></i>
          <span>تسجيل الانصراف</span>
        </button>
      </div>
    `;
  } else if (record.checkInTime && record.checkOutTime) {
    statusBadgeHtml = `
      <span style="background:rgba(34, 197, 94, 0.12); color:#16a34a; padding:6px 14px; border-radius:999px; font-size:12.5px; font-weight:800; display:inline-flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-circle-check"></i> تم تسجيل الانصراف
      </span>
    `;
    bodyContentHtml = `
      <div style="background:rgba(34, 197, 94, 0.06); border:1px solid rgba(34, 197, 94, 0.2); border-radius:var(--r-md); padding:16px; margin-top:14px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; text-align:center; padding-bottom:12px; border-bottom:1px solid rgba(34, 197, 94, 0.15);">
          <div>
            <div style="font-size:11.5px; color:var(--ink-muted); margin-bottom:2px;">وقت الحضور</div>
            <div style="font-size:15px; font-weight:900; color:#16a34a;">${esc(record.checkInTime)}</div>
          </div>
          <div>
            <div style="font-size:11.5px; color:var(--ink-muted); margin-bottom:2px;">وقت الانصراف</div>
            <div style="font-size:15px; font-weight:900; color:#16a34a;">${esc(record.checkOutTime)}</div>
          </div>
        </div>
        <div style="margin-top:10px; font-size:12px; color:#15803d; text-align:center; display:flex; align-items:center; justify-content:center; gap:6px;">
          <i class="fa-solid fa-circle-check"></i>
          <span>📍 تم التحقق من موقع مقر الجمعية — اكتمل حضور وانصراف اليوم</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="card" id="employeeAttendanceHeroCard" style="margin-bottom:24px; border:1.5px solid var(--line); background:var(--bg-paper); border-radius:var(--r-lg); padding:20px; box-shadow:var(--shadow-card); position:relative; overflow:hidden;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:42px; height:42px; border-radius:12px; background:var(--gold-pale); color:var(--gold-deep); display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 2px 8px rgba(184,142,54,0.15);">
            <i class="fa-solid fa-user-clock"></i>
          </div>
          <div>
            <h3 style="margin:0; font-size:16.5px; font-weight:900; color:var(--ink);">الحضور والانصراف</h3>
            <p style="margin:2px 0 0 0; font-size:12.5px; font-weight:600; color:var(--ink-muted);">${dateStr}</p>
          </div>
        </div>
        <div>
          ${statusBadgeHtml}
        </div>
      </div>

      <div style="font-size:12.5px; color:var(--ink-muted); background:var(--bg-subtle); padding:8px 14px; border-radius:var(--r-sm); display:inline-flex; align-items:center; gap:8px;">
        <i class="fa-regular fa-clock" style="color:var(--gold-deep); font-size:14px;"></i>
        <span>وقت الدوام: <strong style="color:var(--ink);">${startDisp} — ${endDisp}</strong></span>
      </div>

      <div id="attLocationNoticeHost"></div>

      ${bodyContentHtml}
    </div>
  `;
}

async function handleEmployeeAttendanceAction(action) {
  const noticeHost = $("#attLocationNoticeHost");
  if (noticeHost) noticeHost.innerHTML = "";

  const btnId = action === "checkIn" ? "#btnEmployeeCheckIn" : "#btnEmployeeCheckOut";
  const btn = $(btnId);
  const origHtml = btn ? btn.innerHTML : "";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ تحديد موقعك الجغرافي…`;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    if (noticeHost) {
      noticeHost.innerHTML = `
        <div style="background:rgba(220, 38, 38, 0.08); border:1px solid rgba(220, 38, 38, 0.25); border-radius:var(--r-md); padding:14px; margin-top:14px;">
          <div style="font-weight:800; color:var(--danger); font-size:13.5px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-wifi"></i> ⚠️ لا يوجد اتصال بالإنترنت
          </div>
          <div style="font-size:12.5px; color:var(--ink-soft);">يرجى التأكد من اتصالك بشبكة الإنترنت والمحاولة مرة أخرى.</div>
        </div>
      `;
    }
    toast("لا يوجد اتصال بالإنترنت", "err");
    if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
    return;
  }

  try {
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({ code: "UNSUPPORTED", message: "متصفحك لا يدعم تحديد الموقع الجغرافي" });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p.coords),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });

    const latitude = pos.latitude;
    const longitude = pos.longitude;
    const accuracy = Math.round(pos.accuracy || 0);

    if (btn) {
      btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ التحقق من الخادم…`;
    }

    const res = await S.recordEmployeeAttendance({
      action: action,
      latitude: latitude,
      longitude: longitude,
      accuracy: accuracy
    });

    if (res && res.success) {
      toast(res.message || "تم التسجيل بنجاح", "ok");
      State.todayAttendance = res.record;
      triggerViewRefresh("dash");
    } else {
      const code = res?.code || "";
      const msg = res?.message || "تعذر إتمام العملية";

      if (code === "out_of_range") {
        if (noticeHost) {
          noticeHost.innerHTML = `
            <div style="background:rgba(220, 38, 38, 0.08); border:1px solid rgba(220, 38, 38, 0.25); border-radius:var(--r-md); padding:14px; margin-top:14px;">
              <div style="font-weight:800; color:var(--danger); font-size:14px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-location-dot"></i> 📍 خارج نطاق مقر الجمعية
              </div>
              <div style="font-size:12.5px; color:var(--ink-soft); line-height:1.5;">
                يجب أن تكون داخل مقر الجمعية لتسجيل الحضور والانصراف.
                ${res.distanceFromOffice ? `<div style="margin-top:6px; font-size:12px; font-weight:700; color:var(--danger);">المسافة الحالية من الجمعية: تقريباً <strong>${res.distanceFromOffice} متر</strong> (المسموح: ${res.allowedRadius || 100}م)</div>` : ''}
              </div>
            </div>
          `;
        }
        toast("أنت خارج نطاق مقر الجمعية", "err");
      } else {
        if (noticeHost) {
          noticeHost.innerHTML = `
            <div style="background:rgba(217, 119, 6, 0.08); border:1px solid rgba(217, 119, 6, 0.25); border-radius:var(--r-md); padding:14px; margin-top:14px;">
              <div style="font-weight:800; color:var(--gold-deep); font-size:13.5px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-circle-exclamation"></i> تنبيه
              </div>
              <div style="font-size:12.5px; color:var(--ink-soft);">${esc(msg)}</div>
            </div>
          `;
        }
        toast(msg, "err");
      }
      if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
    }

  } catch (err) {
    console.error("[handleEmployeeAttendanceAction] Error:", err);

    if (err.code === 1 || err.code === "PERMISSION_DENIED") {
      if (noticeHost) {
        noticeHost.innerHTML = `
          <div style="background:rgba(217, 119, 6, 0.08); border:1px solid rgba(217, 119, 6, 0.25); border-radius:var(--r-md); padding:14px; margin-top:14px;">
            <div style="font-weight:800; color:var(--gold-deep); font-size:14px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-triangle-exclamation"></i> ⚠️ تعذر تحديد موقعك
            </div>
            <div style="font-size:12.5px; color:var(--ink-soft); line-height:1.5;">
              يرجى السماح للمتصفح بالوصول إلى موقعك ثم المحاولة مرة أخرى.
            </div>
          </div>
        `;
      }
      toast("يرجى السماح بالوصول إلى الموقع الجغرافي", "err");
    } else if (err.code === 2 || err.code === "POSITION_UNAVAILABLE") {
      if (noticeHost) {
        noticeHost.innerHTML = `
          <div style="background:rgba(217, 119, 6, 0.08); border:1px solid rgba(217, 119, 6, 0.25); border-radius:var(--r-md); padding:14px; margin-top:14px;">
            <div style="font-weight:800; color:var(--gold-deep); font-size:13.5px; margin-bottom:4px;">
              ⚠️ يتعذر الحصول على موقع جهازك حالياً
            </div>
            <div style="font-size:12.5px; color:var(--ink-soft);">تأكد من تفعيل خدمة الـ GPS أو الموقع في جهازك.</div>
          </div>
        `;
      }
      toast("تعذر الحصول على إحداثيات الموقع", "err");
    } else if (err.code === 3 || err.code === "TIMEOUT") {
      if (noticeHost) {
        noticeHost.innerHTML = `
          <div style="background:rgba(217, 119, 6, 0.08); border:1px solid rgba(217, 119, 6, 0.25); border-radius:var(--r-md); padding:14px; margin-top:14px;">
            <div style="font-weight:800; color:var(--gold-deep); font-size:13.5px; margin-bottom:4px;">
              ⚠️ انتهت مهلة طلب الموقع
            </div>
            <div style="font-size:12.5px; color:var(--ink-soft);">يرجى إعادة المحاولة مرة أخرى.</div>
          </div>
        `;
      }
      toast("انتهت مهلة استجابة الموقع الجغرافي", "err");
    } else {
      const displayStr = err.message || "حدث خطأ غير متوقع في الخادم";
      if (noticeHost) {
        noticeHost.innerHTML = `
          <div style="background:rgba(220, 38, 38, 0.08); border:1px solid rgba(220, 38, 38, 0.25); border-radius:var(--r-md); padding:14px; margin-top:14px;">
            <div style="font-weight:800; color:var(--danger); font-size:13.5px; margin-bottom:4px;">
              ⚠️ خطأ في التسجيل
            </div>
            <div style="font-size:12.5px; color:var(--ink-soft);">${esc(displayStr)}</div>
          </div>
        `;
      }
      toast(displayStr, "err");
    }

    if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
  }
}

/* ════════════════ 1. الصفحة الرئيسية (Minimal Daily Workspace) ════════════════ */
function renderDash(el){
  const u = State.user;
  if(!u) return;

  const isHRUser = u.role === "hr" || (isTechAdmin(u) && u.role !== "executive");
  const isExecUser = u.role === "executive" || isTechAdmin(u);

  // 1. حساب الإجراءات المعلقة لتوليد بطاقات الملخص (Bento grid)
  let summaryCardsHtml = "";
  let totalPending = 0;

  if (isExecUser) {
    const pendingApprovalLeaves = (State.execLeaves || []).filter(l => l.status === "hr_approved").length;
    const pendingMyTasks = (State.tasks || []).filter(t => t.employeeId === u.uid && t.status === "pending").length;
    const sentTasksPending = (State.tasks || []).filter(t => t.adminId === u.uid && t.status === "pending").length;

    totalPending = pendingApprovalLeaves + pendingMyTasks;

    if (pendingApprovalLeaves > 0) {
      summaryCardsHtml += `
        <div class="stat-card" data-goto="exec_leaves_approval" style="cursor:pointer;background:rgba(255, 193, 7, 0.08);border:1px solid rgba(255, 193, 7, 0.2);padding:16px;border-radius:var(--r-md);flex:1;min-width:240px">
          <div style="display:flex;align-items:center;justify-space-between;margin-bottom:8px">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(255, 193, 7, 0.15);display:flex;align-items:center;justify-content:center;color:#b27e05">
              <i class="fa-solid fa-stamp"></i>
            </div>
            <span style="font-size:24px;font-weight:900;color:#b27e05">${pendingApprovalLeaves}</span>
          </div>
          <h4 style="font-size:13.5px;font-weight:700;margin-bottom:4px;color:var(--ink)">اعتمادات معلقة</h4>
          <p style="font-size:11.5px;color:var(--ink-muted)">طلبات إجازات بانتظار موافقتك التنفيذية</p>
        </div>
      `;
    }

    if (pendingMyTasks > 0) {
      summaryCardsHtml += `
        <div class="stat-card" data-goto="tasks" style="cursor:pointer;background:rgba(239, 83, 80, 0.08);border:1px solid rgba(239, 83, 80, 0.2);padding:16px;border-radius:var(--r-md);flex:1;min-width:240px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(239, 83, 80, 0.15);display:flex;align-items:center;justify-content:center;color:#c62828">
              <i class="fa-solid fa-list-check"></i>
            </div>
            <span style="font-size:24px;font-weight:900;color:#c62828">${pendingMyTasks}</span>
          </div>
          <h4 style="font-size:13.5px;font-weight:700;margin-bottom:4px;color:var(--ink)">مهام موجهة لك</h4>
          <p style="font-size:11.5px;color:var(--ink-muted)">مهام رسمية بانتظار استجابتك</p>
        </div>
      `;
    }

    if (sentTasksPending > 0) {
      summaryCardsHtml += `
        <div class="stat-card" data-goto="tasks" style="cursor:pointer;background:rgba(30, 136, 229, 0.08);border:1px solid rgba(30, 136, 229, 0.2);padding:16px;border-radius:var(--r-md);flex:1;min-width:240px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(30, 136, 229, 0.15);display:flex;align-items:center;justify-content:center;color:#1565c0">
              <i class="fa-solid fa-paper-plane"></i>
            </div>
            <span style="font-size:24px;font-weight:900;color:#1565c0">${sentTasksPending}</span>
          </div>
          <h4 style="font-size:13.5px;font-weight:700;margin-bottom:4px;color:var(--ink)">مهام أرسلتها</h4>
          <p style="font-size:11.5px;color:var(--ink-muted)">مهام قيد الانتظار لدى الموظفين</p>
        </div>
      `;
    }
  } else if (isHRUser) {
    const pendingHRLeaves = (State.empLeaves || []).filter(l => l.status === "submitted").length;
    const pendingMyTasks = (State.tasks || []).filter(t => t.employeeId === u.uid && t.status === "pending").length;

    totalPending = pendingHRLeaves + pendingMyTasks;

    if (pendingHRLeaves > 0) {
      summaryCardsHtml += `
        <div class="stat-card" data-goto="emp_leaves" style="cursor:pointer;background:rgba(255, 193, 7, 0.08);border:1px solid rgba(255, 193, 7, 0.2);padding:16px;border-radius:var(--r-md);flex:1;min-width:240px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(255, 193, 7, 0.15);display:flex;align-items:center;justify-content:center;color:#b27e05">
              <i class="fa-solid fa-user-check"></i>
            </div>
            <span style="font-size:24px;font-weight:900;color:#b27e05">${pendingHRLeaves}</span>
          </div>
          <h4 style="font-size:13.5px;font-weight:700;margin-bottom:4px;color:var(--ink)">مراجعات معلقة</h4>
          <p style="font-size:11.5px;color:var(--ink-muted)">طلبات إجازة تتطلب مراجعة الموارد البشرية</p>
        </div>
      `;
    }

    if (pendingMyTasks > 0) {
      summaryCardsHtml += `
        <div class="stat-card" data-goto="tasks" style="cursor:pointer;background:rgba(239, 83, 80, 0.08);border:1px solid rgba(239, 83, 80, 0.2);padding:16px;border-radius:var(--r-md);flex:1;min-width:240px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(239, 83, 80, 0.15);display:flex;align-items:center;justify-content:center;color:#c62828">
              <i class="fa-solid fa-list-check"></i>
            </div>
            <span style="font-size:24px;font-weight:900;color:#c62828">${pendingMyTasks}</span>
          </div>
          <h4 style="font-size:13.5px;font-weight:700;margin-bottom:4px;color:var(--ink)">مهام موجهة لك</h4>
          <p style="font-size:11.5px;color:var(--ink-muted)">مهام رسمية معلقة بانتظار ردّك</p>
        </div>
      `;
    }
  } else {
    // موظف عادي
    const pendingMyTasks = (State.tasks || []).filter(t => {
      if(t.isGroup === true){
        return State.userExecutionsMap?.[t.id] !== "completed";
      }
      return t.employeeId === u.uid && t.status !== "completed";
    }).length;
    const pendingMyLeaves = (State.myLeaves || []).filter(l => l.status === "submitted" || l.status === "hr_approved").length;

    totalPending = pendingMyTasks + pendingMyLeaves;

    if (pendingMyTasks > 0) {
      summaryCardsHtml += `
        <div class="stat-card" data-goto="tasks" style="cursor:pointer;background:rgba(239, 83, 80, 0.08);border:1px solid rgba(239, 83, 80, 0.2);padding:16px;border-radius:var(--r-md);flex:1;min-width:240px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(239, 83, 80, 0.15);display:flex;align-items:center;justify-content:center;color:#c62828">
              <i class="fa-solid fa-bell-slash"></i>
            </div>
            <span style="font-size:24px;font-weight:900;color:#c62828">${pendingMyTasks}</span>
          </div>
          <h4 style="font-size:13.5px;font-weight:700;margin-bottom:4px;color:var(--ink)">مهام تنتظر الرد</h4>
          <p style="font-size:11.5px;color:var(--ink-muted)">مهام رسمية موجهة لك لم تستجب لها بعد</p>
        </div>
      `;
    }

    if (pendingMyLeaves > 0) {
      summaryCardsHtml += `
        <div class="stat-card" data-goto="leaves" style="cursor:pointer;background:rgba(255, 193, 7, 0.08);border:1px solid rgba(255, 193, 7, 0.2);padding:16px;border-radius:var(--r-md);flex:1;min-width:240px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(255, 193, 7, 0.15);display:flex;align-items:center;justify-content:center;color:#b27e05">
              <i class="fa-solid fa-clock-rotate-left"></i>
            </div>
            <span style="font-size:24px;font-weight:900;color:#b27e05">${pendingMyLeaves}</span>
          </div>
          <h4 style="font-size:13.5px;font-weight:700;margin-bottom:4px;color:var(--ink)">طلبات إجازة جارية</h4>
          <p style="font-size:11.5px;color:var(--ink-muted)">طلبات إجازتك الخاصة التي تنتظر الاعتماد</p>
        </div>
      `;
    }
  }

  // 2. تجميع المحتوى الإجمالي للمهام والإجازات الجارية
  const activeTasks = (State.tasks || []).filter(t => {
    if (isExecUser || isHRUser) {
      return (t.adminId === u.uid || t.employeeId === u.uid || t.isGroup === true) && t.status !== "completed";
    } else {
      if(t.isGroup === true){
        return State.userExecutionsMap?.[t.id] !== "completed";
      }
      return t.employeeId === u.uid && t.status !== "completed";
    }
  });
  const recentLeaves = (State.leaves || []).filter(l => l.status === "submitted" || l.status === "hr_approved").slice(0, 1);

  const hasTasks = activeTasks.length > 0;
  const hasLeaves = recentLeaves.length > 0;

  const roleLabel = ROLES[u.role]?.label || u.role;
  const nowStr = new Date();
  const todayStr = `${nowStr.getFullYear()}/${String(nowStr.getMonth() + 1).padStart(2, "0")}/${String(nowStr.getDate()).padStart(2, "0")}`;

  let sectionsHtml = "";

  // أ. صفحة ملخص الإجراءات المعلقة (Grid bento responsive layout)
  if (summaryCardsHtml) {
    sectionsHtml += `
      <div style="margin-bottom:24px">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--ink)">نظرة عامة على الإجراءات المطلوبة</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:16px">
          ${summaryCardsHtml}
        </div>
      </div>
    `;
  }

  // ب. قسم المهام الفعلية الجارية
  if(hasTasks){
    sectionsHtml += `
      <div class="card" style="margin-bottom:20px">
        <div class="card-head">
          <div>
            <h3>جدول الأعمال والمهام المباشرة</h3>
            <span style="font-size:12px;color:var(--ink-muted)">المهام الرسمية المسندة إليك أو لإدارتك</span>
          </div>
          <button class="card-link" data-goto="tasks">جميع المهام <i class="fa-solid fa-arrow-left"></i></button>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${activeTasks.slice(0, 4).map(miniTaskCard).join("")}
        </div>
      </div>
    `;
  }

  // ج. قسم الإجازات
  if(hasLeaves){
    sectionsHtml += `
      <div style="margin-bottom:20px">
        <div class="card">
          <div class="card-head">
            <div>
              <h3>متابعة طلبات الإجازة</h3>
              <span style="font-size:12px;color:var(--ink-muted)">سريان خطة الاعتماد للطلب الأخير</span>
            </div>
            <button class="card-link" data-goto="leaves">عرض الإجازات <i class="fa-solid fa-arrow-left"></i></button>
          </div>
          ${renderLeaveStepperCard(recentLeaves[0])}
        </div>
      </div>
    `;
  }

  // د. حالة فارغة بالكامل (إذا لم توجد إجراءات معلقة ولا أي مهام أو إجازات جارية)
  if(!hasTasks && !hasLeaves && totalPending === 0){
    sectionsHtml = `
      <div class="card" style="text-align:center;padding:48px 24px">
        <div style="font-size:32px;margin-bottom:12px">✨</div>
        <h3 style="font-size:17px;font-weight:700;color:var(--ink);margin-bottom:6px">يومك هادئ ومكتمل</h3>
        <p style="font-size:13px;color:var(--ink-muted)">لا توجد مهام معلقة أو طلبات أو تحديثات جارية تتطلب انتباهك حالياً.</p>
      </div>
    `;
  }

  el.innerHTML = `
    <div style="margin-bottom:22px">
      <h1 class="page-title">مرحباً، ${esc(u.name.split(" ")[0])} 👋</h1>
      <p class="page-sub">${esc(u.jobTitle || roleLabel)} — <span style="color:var(--ink-faint)">${todayStr}</span></p>
    </div>

    <!-- بطاقة الحضور والانصراف الإلكتروني للموظف -->
    ${renderAttendanceCardHtml(u, State.todayAttendance, State.attendanceSettings)}

    ${sectionsHtml}
  `;

  const btnCheckIn = $("#btnEmployeeCheckIn", el);
  if (btnCheckIn) {
    btnCheckIn.addEventListener("click", () => handleEmployeeAttendanceAction("checkIn"));
  }

  const btnCheckOut = $("#btnEmployeeCheckOut", el);
  if (btnCheckOut) {
    btnCheckOut.addEventListener("click", () => handleEmployeeAttendanceAction("checkOut"));
  }

  $$("[data-goto]", el).forEach(b => b.addEventListener("click", () => navigate(b.dataset.goto)));
  $$("[data-task]", el).forEach(c => c.addEventListener("click", () => openTaskDetail(c.dataset.task)));
}

function statCard(icon, la, label, value, foot){
  return `<div class="stat">
    <div class="stat-top"><div class="stat-ico"><i class="fa-solid ${icon}"></i></div><span class="stat-la">${la}</span></div>
    <div class="stat-value">${value}</div>
    <div class="stat-label">${esc(label)} · ${esc(foot)}</div>
  </div>`;
}



function miniTaskCard(t){
  const st=TASK_STATUS[t.status]||TASK_STATUS.new;
  const pr=TASK_PRIORITY[t.priority]||TASK_PRIORITY.medium;
  return `<div class="task-card" data-task="${t.id}" style="margin-bottom:10px;">
    <div class="tc-head">
      <div class="tc-title">${esc(t.title)}</div>
      <span class="prio-badge" style="color:${pr.color};border-color:${pr.color}55"><i class="fa-solid fa-flag"></i>${pr.label}</span>
    </div>
    <div class="tc-foot">
      <span class="status-badge" style="color:${st.color};border-color:${st.color}55;background:${st.bg}">${st.label}</span>
      <span class="tc-due"><i class="fa-regular fa-calendar"></i> ${t.dueDate?fmtDate(t.dueDate):"بدون تاريخ"}</span>
    </div>
  </div>`;
}

/* ════════════════ 2. الملف الشخصي (Profile Redesign) ════════════════ */
function openViewLeaveModal(leave) {
  const typeLabel = LEAVE_TYPES[leave.type]?.label || leave.type;
  const statusLabel = LEAVE_STATUS[leave.status]?.label || leave.status;
  const statusColor = LEAVE_STATUS[leave.status]?.color || "var(--ink-mid)";
  const statusBg = LEAVE_STATUS[leave.status]?.bg || "var(--bg-subtle)";
  
  openModal(`
    <div class="modal-head">
      <h3>تفاصيل طلب الإجازة #${esc(leave.refNo || leave.id.substring(0,6).toUpperCase())}</h3>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body" style="padding: 20px; direction: rtl; text-align: right;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
        <div>
          <label style="font-size: 12px; color: var(--ink-muted); display: block; margin-bottom: 4px;">الموظف:</label>
          <div style="font-size: 14px; font-weight: 700; color: var(--ink);">${esc(leave.userName)}</div>
        </div>
        <div>
          <label style="font-size: 12px; color: var(--ink-muted); display: block; margin-bottom: 4px;">الحالة الحالية:</label>
          <div>
            <span class="status-badge" style="background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}44; display: inline-block;">
              ${esc(statusLabel)}
            </span>
          </div>
        </div>
        <div>
          <label style="font-size: 12px; color: var(--ink-muted); display: block; margin-bottom: 4px;">نوع الإجازة:</label>
          <div style="font-size: 14px; font-weight: 700; color: var(--ink);">${esc(typeLabel)}</div>
        </div>
        <div>
          <label style="font-size: 12px; color: var(--ink-muted); display: block; margin-bottom: 4px;">مدة الإجازة:</label>
          <div style="font-size: 14px; font-weight: 700; color: var(--ink);">${esc(leave.daysCount || leave.days)} أيام</div>
        </div>
        <div>
          <label style="font-size: 12px; color: var(--ink-muted); display: block; margin-bottom: 4px;">تاريخ البدء:</label>
          <div style="font-size: 14px; font-weight: 700; color: var(--ink);">${esc(leave.startDate)}</div>
        </div>
        <div>
          <label style="font-size: 12px; color: var(--ink-muted); display: block; margin-bottom: 4px;">تاريخ الانتهاء:</label>
          <div style="font-size: 14px; font-weight: 700; color: var(--ink);">${esc(leave.endDate)}</div>
        </div>
      </div>
      
      ${leave.reason ? `
        <div style="margin-bottom: 20px;">
          <label style="font-size: 12px; color: var(--ink-muted); display: block; margin-bottom: 4px;">سبب الإجازة / الملاحظات:</label>
          <div style="font-size: 13.5px; color: var(--ink-soft); background: var(--bg-app); padding: 12px; border-radius: var(--r-sm); border: 1px solid var(--line); white-space: pre-line;">${esc(leave.reason)}</div>
        </div>
      ` : ""}
      
      ${leave.notes ? `
        <div style="margin-bottom: 20px;">
          <label style="font-size: 12px; color: var(--ink-muted); display: block; margin-bottom: 4px;">ملاحظات الاعتماد / المراجعة:</label>
          <div style="font-size: 13.5px; color: var(--ink-soft); background: var(--bg-app); padding: 12px; border-radius: var(--r-sm); border: 1px solid var(--line); white-space: pre-line;">${esc(leave.notes)}</div>
        </div>
      ` : ""}

      <div style="margin-top: 20px; border-top: 1px solid var(--line-soft); padding-top: 20px;">
        <label style="font-size: 12px; color: var(--ink-muted); display: block; margin-bottom: 12px;">مسار حالة الطلب والتواريخ:</label>
        ${renderLeaveStepperCard(leave)}
      </div>

      <div style="text-align: center; margin-top: 24px;">
        <button class="btn btn-secondary" style="padding: 8px 30px; border-radius: var(--r-pill);" data-close>إغلاق النافذة</button>
      </div>
    </div>
  `);
}

function renderProfile(el){
  if(!el) el = $("#viewHost");
  const u = State.selectedEmp || State.user;
  const isSelf = u.uid === State.user.uid;
  const activeTab = State.profileTab || "info";
  const roleLabel = ROLES[u.role]?.label || u.role;
  const isStatusActive = u.status !== "disabled";

  const activeLeave = getUserActiveLeave(u.uid);
  let leaveAlertHtml = "";
  if (activeLeave && (isHR() || isExec() || isTechAdmin())) {
    const typeLabel = LEAVE_TYPES[activeLeave.type]?.label || activeLeave.type;
    const returnsText = getDaysUntilReturn(activeLeave.endDate);
    leaveAlertHtml = `
      <div class="card" style="background: rgba(217, 119, 6, 0.05); border: 1px solid rgba(217, 119, 6, 0.25); border-radius: var(--r-md); padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 280px; flex: 1;">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: rgba(217, 119, 6, 0.1); color: rgb(217, 119, 6); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;">
            <i class="fa-solid fa-umbrella-beach"></i>
          </div>
          <div>
            <h4 style="margin: 0 0 4px; font-size: 14px; font-weight: 700; color: rgb(217, 119, 6); text-align: right;">هذا الموظف في إجازة حاليًا</h4>
            <p style="margin: 0; font-size: 12.5px; color: var(--ink-soft); line-height: 1.4; text-align: right;">
              نوع الإجازة: <strong>${esc(typeLabel)}</strong> · من <strong>${esc(activeLeave.startDate)}</strong> إلى <strong>${esc(activeLeave.endDate)}</strong> · ${esc(returnsText)}
            </p>
          </div>
        </div>
        <button class="profile-leave-btn" id="btnViewLeaveDetails"><i class="fa-solid fa-eye"></i> عرض طلب الإجازة</button>
      </div>
    `;
  }

  el.innerHTML = `
    ${leaveAlertHtml}
    <!-- Top Hero Banner Card inside Double-Bezel Container -->
    <div class="double-bezel" style="margin-bottom:20px">
      <div class="card profile-hero" style="margin-bottom:0;padding:24px">
        <div class="profile-hero-top">
          <div class="profile-avatar-xl">
            ${u.avatar ? `<img src="${esc(u.avatar)}">` : esc(initials(u.name))}
            ${(isSelf || isTechAdmin()) ? `
              <label for="avatarInput" class="profile-avatar-upload">
                <i class="fa-solid fa-camera"></i>
                <span>تغيير</span>
              </label>
              <input type="file" id="avatarInput" accept="image/*" style="display:none">
            ` : ""}
          </div>

          <div class="profile-hero-meta">
            <h1 class="profile-hero-name">${esc(u.name)}</h1>
            <div class="profile-hero-badges">
              <span class="status-badge" style="background:var(--gold-pale);color:var(--gold-deep);border:1px solid var(--line)">
                <i class="fa-solid fa-briefcase"></i> ${esc(u.jobTitle || "موظف")}
              </span>
              <span class="status-badge" style="${isStatusActive ? 'background:var(--success-bg);color:var(--success)' : 'background:var(--danger-bg);color:var(--danger)'}">
                <i class="fa-solid ${isStatusActive ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${isStatusActive ? 'حساب نشط' : 'حساب معطل'}
              </span>
              ${isTechAdmin(u) ? `<span class="status-badge" style="background:rgba(30,64,175,0.08);color:var(--info)"><i class="fa-solid fa-shield-halved"></i> مسئول تقني</span>` : ''}
            </div>
            <div class="profile-hero-info">
              <span><i class="fa-solid fa-envelope"></i> ${esc(u.email)}</span>
              <span><i class="fa-solid fa-phone"></i> ${esc(u.phone || "غير محدد")}</span>
            </div>
          </div>

          <div class="profile-hero-actions">
            ${(isSelf || isTechAdmin()) ? `
              <button class="btn btn-secondary btn-capsule" id="editProfileHeaderBtn"><i class="fa-solid fa-pen"></i> تعديل البيانات</button>
            ` : ""}
            ${State.selectedEmp ? `
              <button class="btn btn-secondary btn-capsule" id="backToMembersBtn"><i class="fa-solid fa-arrow-right"></i> العودة للدليل</button>
            ` : ""}
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="hero-tabs" id="profileTabs">
      <button class="hero-tab ${activeTab==="info"?"active":""}" data-tab="info"><i class="fa-solid fa-user"></i> المعلومات الشخصية</button>
      <button class="hero-tab ${activeTab==="cv"?"active":""}" data-tab="cv"><i class="fa-solid fa-file-pdf"></i> السيرة الذاتية</button>
      <button class="hero-tab ${activeTab==="qual"?"active":""}" data-tab="qual"><i class="fa-solid fa-graduation-cap"></i> المؤهلات العلمية</button>
      <button class="hero-tab ${activeTab==="courses"?"active":""}" data-tab="courses"><i class="fa-solid fa-certificate"></i> الدورات والشهادات</button>
      <button class="hero-tab ${activeTab==="skills"?"active":""}" data-tab="skills"><i class="fa-solid fa-wand-magic-sparkles"></i> المهارات</button>
    </div>

    <div id="profileTabBody"></div>
  `;

  renderProfileTabBody();

  $$("#profileTabs [data-tab]").forEach(b => b.addEventListener("click", () => {
    State.profileTab = b.dataset.tab;
    $$("#profileTabs .hero-tab").forEach(t => t.classList.toggle("active", t === b));
    renderProfileTabBody();
  }));

  if ($("#editProfileHeaderBtn")) $("#editProfileHeaderBtn").addEventListener("click", () => openEditProfileModal(u));
  if ($("#backToMembersBtn")) $("#backToMembersBtn").addEventListener("click", () => { State.selectedEmp = null; navigate("members"); });
  if ($("#btnViewLeaveDetails")) {
    $("#btnViewLeaveDetails").addEventListener("click", () => openViewLeaveModal(activeLeave));
  }

  if (isSelf || isTechAdmin()) {
    const avInput = $("#avatarInput");
    if (avInput) {
      avInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        toast("جارٍ رفع الصورة الشخصية…");
        try {
          const url = await S.uploadAvatar(u.uid, file);
          u.avatar = url;
          showSuccessBadge("تم تحديث الصورة الشخصية", "تم حفظ وتحديث صورتك الشخصية بنجاح.");
          renderProfile(el);
        } catch (err) {
          toast("تعذّر رفع الصورة الشخصية", "err");
        }
      });
    }
  }
}

function renderProfileTabBody(){
  const u = State.selectedEmp || State.user;
  const isSelf = u.uid === State.user.uid;
  const tab = State.profileTab || "info";
  const body = $("#profileTabBody");
  if(!body) return;

  if(tab === "info"){
    body.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>النبذة والبيانات الأساسية</h3>
          ${(isSelf || isTechAdmin()) ? `<button class="btn btn-secondary" id="editBioBtn"><i class="fa-solid fa-pen"></i> تعديل</button>` : ""}
        </div>
        <p style="font-size:14px;color:var(--ink-mid);line-height:1.8;margin-bottom:20px;">${esc(u.bio || "لا توجد نبذة مختصرة مسجلة بعد.")}</p>
        
        <div style="background:var(--bg-subtle);padding:16px;border-radius:var(--r-md);border:1px solid var(--line-soft)">
          <div style="font-size:12px;color:var(--ink-muted);margin-bottom:4px">المسمى الوظيفي</div>
          <div style="font-size:14px;font-weight:700;color:var(--ink)">${esc(u.jobTitle || "موظف")}</div>
        </div>
      </div>
    `;
    if($("#editBioBtn")) $("#editBioBtn").addEventListener("click", ()=>openEditProfileModal(u));
  }

  else if(tab === "cv"){
    body.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>السيرة الذاتية (CV)</h3>
          ${(isSelf || isTechAdmin()) ? `<button class="btn btn-primary" id="uploadCvBtn"><i class="fa-solid fa-upload"></i> ${u.cv ? 'استبدال CV' : 'رفع CV'}</button>` : ""}
        </div>
        ${u.cv ? `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:var(--bg-subtle);border-radius:var(--r-md);border:1px solid var(--line);flex-wrap:wrap;gap:12px">
            <div style="display:flex;align-items:center;gap:12px">
              <i class="fa-solid fa-file-pdf" style="font-size:28px;color:var(--danger)"></i>
              <div>
                <div style="font-size:14px;font-weight:700;color:var(--ink)">${esc(u.cv.name)}</div>
                <div style="font-size:12px;color:var(--ink-muted)">آخر تحديث: ${esc(u.cv.updatedAt ? new Date(u.cv.updatedAt).toLocaleDateString("ar-SA") : "—")}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <a href="${esc(S.getCvPreviewUrl(u.cv))}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary"><i class="fa-solid fa-eye"></i> معاينة</a>
              <a href="${esc(S.getCvDownloadUrl(u.cv))}" target="_blank" download class="btn btn-primary"><i class="fa-solid fa-download"></i> تحميل</a>
            </div>
          </div>
        ` : `
          <div class="empty-state">
            <div class="es-msg">لم يتم رفع السيرة الذاتية بعد</div>
            ${(isSelf || isTechAdmin()) ? `<button class="btn btn-primary" id="uploadCvEmptyBtn" style="margin-top:10px"><i class="fa-solid fa-upload"></i> رفع السيرة الذاتية</button>` : ''}
          </div>
        `}
      </div>
    `;
    if($("#uploadCvBtn")) $("#uploadCvBtn").addEventListener("click", ()=>openCvUploadModal(u));
    if($("#uploadCvEmptyBtn")) $("#uploadCvEmptyBtn").addEventListener("click", ()=>openCvUploadModal(u));
  }

  else if(tab === "qual"){
    const list = u.qualifications || [];
    body.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>المؤهلات العلمية</h3>
          ${(isSelf || isTechAdmin()) ? `<button class="btn btn-secondary" id="addQualBtn"><i class="fa-solid fa-plus"></i> إضافة مؤهل</button>` : ""}
        </div>
        ${list.length ? `
          <div class="timeline">
            ${list.map((q, idx)=>`
              <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
                  <div>
                    <div style="font-size:15px;font-weight:800;color:var(--ink)">${esc(q.degree)} — ${esc(q.field)}</div>
                    <div style="font-size:12.5px;color:var(--ink-muted)">${esc(q.institution)} · سنة التخرج: ${esc(q.year)}</div>
                  </div>
                  ${(isSelf || isTechAdmin()) ? `<button class="btn btn-danger-soft" data-del-qual="${idx}"><i class="fa-solid fa-trash"></i></button>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        ` : `
          <div class="empty-state">
            <div class="es-msg">لا توجد مؤهلات مسجلة</div>
            ${(isSelf || isTechAdmin()) ? `<button class="btn btn-primary" id="addQualEmptyBtn" style="margin-top:10px"><i class="fa-solid fa-plus"></i> إضافة مؤهل علمي</button>` : ''}
          </div>
        `}
      </div>
    `;
    if($("#addQualBtn")) $("#addQualBtn").addEventListener("click", ()=>openAddQualModal(u));
    if($("#addQualEmptyBtn")) $("#addQualEmptyBtn").addEventListener("click", ()=>openAddQualModal(u));
    $$("[data-del-qual]", body).forEach(b=>b.addEventListener("click", (e)=>{
      const idx = parseInt(b.dataset.delQual);
      const rowEl = b.closest(".timeline-item") || b.closest("div");
      animateRowRemoval(rowEl, async ()=>{
        list.splice(idx, 1);
        await S.updateUserProfile(u.uid, { qualifications: list });
        toast("تم حذف المؤهل");
        renderProfileTabBody();
      });
    }));
  }

  else if(tab === "courses"){
    const list = u.courses || [];
    body.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>الدورات التدريبية والشهادات</h3>
          ${(isSelf || isTechAdmin()) ? `<button class="btn btn-secondary" id="addCourseBtn"><i class="fa-solid fa-plus"></i> إضافة دورة</button>` : ""}
        </div>
        ${list.length ? `
          <div style="display:flex;flex-direction:column;gap:12px">
            ${list.map((c, idx)=>`
              <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-subtle);border-radius:var(--r-md);border:1px solid var(--line);flex-wrap:wrap;gap:10px">
                <div>
                  <div style="font-size:14px;font-weight:700;color:var(--ink)">${esc(c.title)}</div>
                  <div style="font-size:12px;color:var(--ink-muted)">الجهة: ${esc(c.provider)} · التاريخ: ${esc(c.date || "—")}</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  ${c.certUrl ? `<a href="${esc(c.certUrl)}" target="_blank" class="btn btn-secondary"><i class="fa-solid fa-certificate"></i> معاينة الشهادة</a>` : `<span style="font-size:12px;color:var(--ink-faint)">بدون مرفق</span>`}
                  ${(isSelf || isTechAdmin()) ? `<button class="btn btn-danger-soft" data-del-course="${idx}"><i class="fa-solid fa-trash"></i></button>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        ` : `
          <div class="empty-state">
            <div class="es-msg">لا توجد دورات مسجلة</div>
            ${(isSelf || isTechAdmin()) ? `<button class="btn btn-primary" id="addCourseEmptyBtn" style="margin-top:10px"><i class="fa-solid fa-plus"></i> إضافة دورة جديدة</button>` : ''}
          </div>
        `}
      </div>
    `;
    if($("#addCourseBtn")) $("#addCourseBtn").addEventListener("click", ()=>openAddCourseModal(u));
    if($("#addCourseEmptyBtn")) $("#addCourseEmptyBtn").addEventListener("click", ()=>openAddCourseModal(u));
    $$("[data-del-course]", body).forEach(b=>b.addEventListener("click", (e)=>{
      const idx = parseInt(b.dataset.delCourse);
      const rowEl = b.closest("div");
      animateRowRemoval(rowEl, async ()=>{
        list.splice(idx, 1);
        await S.updateUserProfile(u.uid, { courses: list });
        toast("تم حذف الدورة");
        renderProfileTabBody();
      });
    }));
  }

  else if(tab === "skills"){
    const list = u.skills || [];
    body.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>المهارات والخبرات</h3>
          ${(isSelf || isTechAdmin()) ? `<button class="btn btn-secondary" id="addSkillBtn"><i class="fa-solid fa-plus"></i> إضافة مهارة</button>` : ""}
        </div>
        ${list.length ? `
          <div class="skills-flex">
            ${list.map((s, idx)=>`
              <span class="skill-chip">
                ${esc(s)}
                ${(isSelf || isTechAdmin()) ? `<i class="fa-solid fa-xmark" data-del-skill="${idx}" style="margin-right:6px;cursor:pointer;color:var(--danger)"></i>` : ""}
              </span>
            `).join("")}
          </div>
        ` : `
          <div class="empty-state">
            <div class="es-msg">لم تُضف مهارات بعد</div>
            ${(isSelf || isTechAdmin()) ? `<button class="btn btn-primary" id="addSkillEmptyBtn" style="margin-top:10px"><i class="fa-solid fa-plus"></i> إضافة مهارة</button>` : ''}
          </div>
        `}
      </div>
    `;
    if($("#addSkillBtn")) $("#addSkillBtn").addEventListener("click", ()=>openAddSkillModal(u));
    if($("#addSkillEmptyBtn")) $("#addSkillEmptyBtn").addEventListener("click", ()=>openAddSkillModal(u));
    $$("[data-del-skill]", body).forEach(b=>b.addEventListener("click", (e)=>{
      e.stopPropagation();
      const idx = parseInt(b.dataset.delSkill);
      const rowEl = b.closest(".skill-chip");
      animateRowRemoval(rowEl, async ()=>{
        list.splice(idx, 1);
        await S.updateUserProfile(u.uid, { skills: list });
        toast("تم حذف المهارة");
        renderProfileTabBody();
      });
    }));
  }
}

/* Modals for Profile Edit */
function openEditProfileModal(u){
  openModal(`
    <div class="modal-head">
      <h2>تعديل البيانات والنبذة</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="editProfileForm">
      <div class="form-group" style="margin-bottom:14px">
        <label>رقم الجوال</label>
        <input type="text" id="profPhone" value="${esc(u.phone||"")}" class="input">
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label>النبذة المختصرة</label>
        <textarea id="profBio" rows="4" class="input">${esc(u.bio||"")}</textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-primary"><i class="fa-solid fa-check"></i> حفظ التغييرات</button>
      </div>
    </form>
  `);
  $("#editProfileForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const phone = $("#profPhone").value.trim();
    const bio = $("#profBio").value.trim();
    await S.updateUserProfile(u.uid, { phone, bio });
    u.phone = phone; u.bio = bio;
    toast("تم حفظ البيانات بنجاح");
    closeModal();
    renderProfileTabBody();
  });
}

function openCvUploadModal(u){
  openModal(`
    <div class="modal-head">
      <h2>رفع / استبدال السيرة الذاتية (CV)</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="cvForm">
      <div class="form-group" style="margin-bottom:16px">
        <label>اختر ملف السيرة الذاتية (PDF, Word)</label>
        <input type="file" id="cvFileInput" accept=".pdf,.doc,.docx" required class="input">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-primary" id="cvSubmitBtn"><i class="fa-solid fa-upload"></i> رفع الملف</button>
      </div>
    </form>
  `);
  $("#cvForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const file = $("#cvFileInput").files[0];
    if(!file) return;
    const btn = $("#cvSubmitBtn");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الرفع…`;
    try{
      const cvObj = await S.uploadCV(u.uid, file);
      await showActionSuccess({
        title: "تم رفع السيرة الذاتية",
        message: "تم حفظ وتحديث ملف السيرة الذاتية في SharePoint بنجاح."
      });
      renderProfileTabBody();
    }catch(err){
      toast("تعذّر رفع الملف", "err");
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-upload"></i> رفع الملف`;
    }
  });
}

function openAddQualModal(u){
  openModal(`
    <div class="modal-head">
      <h2>إضافة مؤهل علمي</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="qualForm">
      <div class="form-group" style="margin-bottom:12px">
        <label>الدرجة العلمية (بكالوريوس، ماجستير...)</label>
        <input type="text" id="qDegree" required class="input">
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>التخصص</label>
        <input type="text" id="qField" required class="input">
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>الجامعة / المؤسسة التعليمية</label>
        <input type="text" id="qInst" required class="input">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label>سنة التخرج</label>
        <input type="text" id="qYear" required class="input">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-primary"><i class="fa-solid fa-plus"></i> إضافة</button>
      </div>
    </form>
  `);
  $("#qualForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const item = {
      degree: $("#qDegree").value.trim(),
      field: $("#qField").value.trim(),
      institution: $("#qInst").value.trim(),
      year: $("#qYear").value.trim()
    };
    const list = u.qualifications || [];
    list.push(item);
    await S.updateUserProfile(u.uid, { qualifications: list });
    u.qualifications = list;
    await showActionSuccess({
      title: "تمت إضافة المؤهل العلمي",
      message: "تم تحديث سجلك الأكاديمي بنجاح."
    });
    renderProfileTabBody();
  });
}

function openAddCourseModal(u){
  openModal(`
    <div class="modal-head">
      <h2>إضافة دورة تدريبية / شهادة</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="courseForm">
      <div class="form-group" style="margin-bottom:12px">
        <label>عنوان الدورة</label>
        <input type="text" id="cTitle" required class="input">
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>الجهة المنظمة</label>
        <input type="text" id="cProvider" required class="input">
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>تاريخ الحصول عليها</label>
        <input type="date" id="cDate" class="input">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label>إرفاق الشهادة (اختياري)</label>
        <input type="file" id="cCertFile" class="input">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-primary" id="cSubmitBtn"><i class="fa-solid fa-plus"></i> إضافة الدورة</button>
      </div>
    </form>
  `);
  $("#courseForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const btn = $("#cSubmitBtn");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الحفظ…`;
    let certUrl = "";
    const certFile = $("#cCertFile").files[0];
    if(certFile){
      try{ certUrl = await S.uploadCourseCert(u.uid, certFile); }catch(e){}
    }
    const item = {
      title: $("#cTitle").value.trim(),
      provider: $("#cProvider").value.trim(),
      date: $("#cDate").value || "",
      certUrl
    };
    const list = u.courses || [];
    list.push(item);
    await S.updateUserProfile(u.uid, { courses: list });
    u.courses = list;
    await showActionSuccess({
      title: "تمت إضافة الدورة التدريبية",
      message: "تم حفظ الدورة والشهادة في سجلك التدريبي بنجاح."
    });
    renderProfileTabBody();
  });
}

function openAddSkillModal(u){
  openModal(`
    <div class="modal-head">
      <h2>إضافة مهارة جديدة</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="skillForm">
      <div class="form-group" style="margin-bottom:16px">
        <label>اسم المهارة</label>
        <input type="text" id="skTitle" placeholder="مثال: إدارة المشاريع، التصميم، القيادة..." required class="input">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-primary"><i class="fa-solid fa-plus"></i> إضافة</button>
      </div>
    </form>
  `);
  $("#skillForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const val = $("#skTitle").value.trim();
    if(!val) return;
    const list = u.skills || [];
    list.push(val);
    await S.updateUserProfile(u.uid, { skills: list });
    u.skills = list;
    await showActionSuccess({
      title: "تمت إضافة المهارة",
      message: "تم تحديث قائمة مهاراتك بنجاح."
    });
    renderProfileTabBody();
  });
}


/* ════════════════ 3. نظام الإجازات والاعتمادات (Leaves System) ════════════════ */

function isLeaveCurrentlyActive(l) {
  if(!l || l.status !== "approved") return false;
  const today = new Date().setHours(0,0,0,0);
  const start = new Date(l.startDate).setHours(0,0,0,0);
  const end = new Date(l.endDate).setHours(23,59,59,999);
  return today >= start && today <= end;
}

function getUserActiveLeave(userId) {
  const allLeaves = State.empLeaves || [];
  return allLeaves.find(l => l.userId === userId && l.status === "approved" && isLeaveCurrentlyActive(l));
}

function getDaysUntilReturn(endDateStr) {
  const today = new Date().setHours(0,0,0,0);
  const returnDate = new Date(endDateStr);
  returnDate.setDate(returnDate.getDate() + 1); // Day after endDate
  returnDate.setHours(0,0,0,0);
  const returnDiffTime = returnDate - today;
  const returnDiffDays = Math.round(returnDiffTime / (1000 * 60 * 60 * 24));
  
  if (returnDiffDays <= 1) {
    return "يعود غداً";
  } else if (returnDiffDays === 2) {
    return "يعود بعد يومين";
  } else if (returnDiffDays >= 3 && returnDiffDays <= 10) {
    return `يعود بعد ${returnDiffDays} أيام`;
  } else {
    return `يعود بعد ${returnDiffDays} يوماً`;
  }
}

function getActiveOrPendingLeave(leavesList) {
  if(!Array.isArray(leavesList)) return null;
  return leavesList.find(l => 
    l.status === "submitted" || 
    l.status === "in_hr_review" || 
    l.status === "hr_approved" || 
    isLeaveCurrentlyActive(l)
  );
}

/* 1) صفحة إجازاتي الشخصية (مع الكارت التفاعلي وتقييد الطلبات و Segmented Control) */
function renderMyLeaves(el){
  if(!el) el = $("#viewHost");
  const tab = State.myLeaveTab || "current"; // "current" | "history"
  const allLeaves = State.myLeaves || [];

  // فحص ما إذا كان الموظف في إجازة قائمة حالياً
  const activeLeave = allLeaves.find(l => isLeaveCurrentlyActive(l));
  
  // فحص ما إذا كان هناك طلب معلق أو إجازة حالية (لتقييد التقديم)
  const pendingOrActiveRequest = getActiveOrPendingLeave(allLeaves);
  const isRequestRestricted = !!pendingOrActiveRequest;

  // تصفية القائمة حسب التبويب المختار
  let list = [];
  if (tab === "current") {
    list = allLeaves.filter(l => 
      l.status === "submitted" || 
      l.status === "in_hr_review" || 
      l.status === "hr_approved" || 
      isLeaveCurrentlyActive(l)
    );
  } else {
    list = allLeaves.filter(l => 
      l.status === "hr_rejected" || 
      l.status === "exec_rejected" || 
      (l.status === "approved" && !isLeaveCurrentlyActive(l))
    );
  }

  // حساب الأيام المتبقية للإجازة القائمة
  let remainingDays = 0;
  if (activeLeave) {
    const end = new Date(activeLeave.endDate).getTime();
    const now = new Date().getTime();
    remainingDays = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  }

  const currentCount = allLeaves.filter(l => l.status === "submitted" || l.status === "in_hr_review" || l.status === "hr_approved" || isLeaveCurrentlyActive(l)).length;
  const historyCount = allLeaves.filter(l => l.status === "hr_rejected" || l.status === "exec_rejected" || (l.status === "approved" && !isLeaveCurrentlyActive(l))).length;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <div>
        <h1 class="page-title" style="margin:0">الإجازات</h1>
        <p class="page-sub" style="margin:4px 0 0 0">متابعة ورصد رصيد وطلبات الإجازات الشخصية</p>
      </div>
      <button class="btn btn-primary btn-capsule" id="newLeaveBtn" ${isRequestRestricted ? 'disabled' : ''}>
        <i class="fa-solid fa-plus"></i> طلب إجازة
      </button>
    </div>

    <!-- كارت الإجازة القائمة الحالية (إن وجدت) -->
    ${activeLeave ? `
      <div class="leave-active-hero">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="width:12px;height:12px;border-radius:50%;background:var(--gold-soft);display:inline-block"></span>
            <h2 style="font-size:20px;font-weight:800;margin:0;color:#FFF">أنت في إجازة حالياً</h2>
          </div>
          <span class="status-badge" style="background:var(--gold-soft);color:#FFF;font-size:12px">معتمدة وقائمة</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:16px;margin-top:16px;font-size:13.5px;color:rgba(255,255,255,0.85)">
          <div><b>نوع الإجازة:</b> ${esc(LEAVE_TYPES[activeLeave.type]?.label || activeLeave.type)}</div>
          <div><b>تاريخ البداية:</b> ${esc(activeLeave.startDate)}</div>
          <div><b>تاريخ النهاية:</b> ${esc(activeLeave.endDate)}</div>
          <div><b>الأيام المتبقية:</b> <span style="color:var(--gold-soft);font-weight:800;font-size:16px">${remainingDays} يوم</span></div>
        </div>
      </div>
    ` : ""}

    <!-- تنبيه تقييد الطلب الجديد عند وجود طلب معلق أو إجازة قائمة -->
    ${isRequestRestricted && !activeLeave ? `
      <div class="restriction-banner">
        <i class="fa-solid fa-lock" style="font-size:18px"></i>
        <div>لا يمكنك تقديم طلب إجازة جديد حتى انتهاء إجازتك الحالية أو البت في الطلب المعلق (${esc(pendingOrActiveRequest.refNo)}).</div>
      </div>
    ` : ""}

    <!-- Segmented Control للتبديل بين الطلبات الحالية وسجل الإجازات -->
    <div class="segmented-control">
      <button class="seg-btn ${tab==="current"?"active":""}" data-seg-tab="current">
        <i class="fa-solid fa-clock-rotate-left"></i> الطلبات الحالية (${currentCount})
      </button>
      <button class="seg-btn ${tab==="history"?"active":""}" data-seg-tab="history">
        <i class="fa-solid fa-box-archive"></i> سجل الإجازات (${historyCount})
      </button>
    </div>

    <!-- منطقة عرض البطاقات -->
    <div id="leavesArea">
      ${list.length ? list.map(l => renderLeaveCard(l, "my")).join("") : emptyState(tab === "current" ? "لا توجد طلبات إجازة قائمة أو معلقة حالياً" : "لا يوجد سجل إجازات سابق")}
    </div>
  `;

  if($("#newLeaveBtn") && !isRequestRestricted) {
    $("#newLeaveBtn").addEventListener("click", openNewLeaveModal);
  }

  $$("[data-seg-tab]", el).forEach(b => b.addEventListener("click", () => {
    State.myLeaveTab = b.dataset.segTab;
    renderMyLeaves(el);
  }));
}

/* 2) صفحة طلبات إجازات الموظفين (للموارد البشرية) */
function renderEmpLeavesHR(el){
  if(!el) el = $("#viewHost");
  const filter = State.hrLeaveFilter || "all";
  let list = State.empLeaves || [];

  if(filter === "pending_hr") list = list.filter(l => l.status === "submitted" || l.status === "in_hr_review");
  if(filter === "pending_exec") list = list.filter(l => l.status === "hr_approved");
  if(filter === "approved") list = list.filter(l => l.status === "approved");
  if(filter === "rejected") list = list.filter(l => l.status === "hr_rejected" || l.status === "exec_rejected");

  const allCount = (State.empLeaves || []).length;
  const pendingHRCount = (State.empLeaves || []).filter(l => l.status === "submitted" || l.status === "in_hr_review").length;
  const pendingExecCount = (State.empLeaves || []).filter(l => l.status === "hr_approved").length;
  const approvedCount = (State.empLeaves || []).filter(l => l.status === "approved").length;
  const rejectedCount = (State.empLeaves || []).filter(l => l.status === "hr_rejected" || l.status === "exec_rejected").length;

  el.innerHTML = `
    ${pageHead("Employee Leaves", "طلبات الإجازات", "إدارة إجازات", "الموظفين", "مراجعة وتدقيق طلبات إجازات الموظفين وتحويلها للاعتماد التنفيذي.")}

    <!-- Modern App Filter Pills (Capsule Segmented Control) -->
    <div class="filter-pills-wrap">
      <button class="filter-pill ${filter==="all"?"active":""}" data-hr-lfilter="all">
        <span>الكل</span> <span class="pill-count">${allCount}</span>
      </button>
      <button class="filter-pill ${filter==="pending_hr"?"active":""}" data-hr-lfilter="pending_hr">
        <span>بانتظار مراجعتك</span> <span class="pill-count">${pendingHRCount}</span>
      </button>
      <button class="filter-pill ${filter==="pending_exec"?"active":""}" data-hr-lfilter="pending_exec">
        <span>بانتظار المدير التنفيذي</span> <span class="pill-count">${pendingExecCount}</span>
      </button>
      <button class="filter-pill ${filter==="approved"?"active":""}" data-hr-lfilter="approved">
        <span>المعتمدة نهائياً</span> <span class="pill-count">${approvedCount}</span>
      </button>
      <button class="filter-pill ${filter==="rejected"?"active":""}" data-hr-lfilter="rejected">
        <span>المرفوضة</span> <span class="pill-count">${rejectedCount}</span>
      </button>
    </div>

    <div id="leavesArea">
      ${list.length ? list.map(l => renderLeaveCard(l, "hr")).join("") : emptyState("لا توجد طلبات إجازات للموظفين في هذه الفئة")}
    </div>
  `;

  $$("[data-hr-lfilter]").forEach(b=>b.addEventListener("click", ()=>{
    State.hrLeaveFilter = b.dataset.hrLfilter;
    renderEmpLeavesHR(el);
  }));

  bindLeaveEvents(el);
}

/* 3) صفحة اعتماد طلبات الإجازات (للمدير التنفيذي) */
function renderExecLeavesApproval(el){
  if(!el) el = $("#viewHost");
  const filter = State.execLeaveFilter || "pending";
  let list = State.execLeaves || [];

  if (!State.execArchiveSearch) State.execArchiveSearch = "";
  if (!State.execArchiveStatus) State.execArchiveStatus = "all";

  if(filter === "pending") {
    list = list.filter(l => l.status === "hr_approved");
  }
  
  if(filter === "archive") {
    list = list.filter(l => l.status === "approved" || l.status === "exec_rejected");
    
    // Apply search query
    const sq = State.execArchiveSearch.trim().toLowerCase();
    if (sq) {
      list = list.filter(l => (l.userName || "").toLowerCase().includes(sq) || (l.refNo || "").toLowerCase().includes(sq));
    }
    
    // Apply status filter
    const sf = State.execArchiveStatus;
    if (sf === "approved") {
      list = list.filter(l => l.status === "approved");
    } else if (sf === "rejected") {
      list = list.filter(l => l.status === "exec_rejected");
    }
  }

  const pendingExecCount = (State.execLeaves || []).filter(l => l.status === "hr_approved").length;
  const archiveCount = (State.execLeaves || []).filter(l => l.status === "approved" || l.status === "exec_rejected").length;

  let archiveFiltersHtml = "";
  if (filter === "archive") {
    archiveFiltersHtml = `
      <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; background: var(--bg-paper); padding: 12px; border-radius: var(--r-md); border: 1px solid var(--line-soft);">
        <div style="flex: 1; min-width: 200px; position: relative;">
          <input type="text" id="execArchiveSearchInput" class="form-control input" style="width: 100%; padding: 8px 12px 8px 32px; font-size: 13px;" placeholder="ابحث باسم الموظف أو الرقم المرجعي..." value="${esc(State.execArchiveSearch)}">
          <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-muted); font-size: 13px;"></i>
        </div>
        <div style="width: 150px;">
          <select id="execArchiveStatusSelect" class="form-control input" style="width: 100%; padding: 7px 10px; font-size: 13px;">
            <option value="all" ${State.execArchiveStatus === 'all' ? 'selected' : ''}>جميع الحالات</option>
            <option value="approved" ${State.execArchiveStatus === 'approved' ? 'selected' : ''}>معتمدة نهائياً</option>
            <option value="rejected" ${State.execArchiveStatus === 'rejected' ? 'selected' : ''}>مرفوضة من المدير</option>
          </select>
        </div>
      </div>
    `;
  }

  el.innerHTML = `
    ${pageHead("Leave Approvals", "اعتماد الإجازات", "اعتماد طلبات", "الإجازات", "مراجعة واعتماد طلبات الإجازات المحالة من إدارة الموارد البشرية.")}

    <!-- Modern App Filter Pills (Capsule Segmented Control) -->
    <div class="filter-pills-wrap" style="margin-bottom: 16px;">
      <button class="filter-pill ${filter==="pending"?"active":""}" data-exec-lfilter="pending">
        <span>بانتظار اعتمادك</span> <span class="pill-count">${pendingExecCount}</span>
      </button>
      <button class="filter-pill ${filter==="archive"?"active":""}" data-exec-lfilter="archive">
        <span>أرشيف الاعتمادات السابقة</span> <span class="pill-count">${archiveCount}</span>
      </button>
    </div>

    ${archiveFiltersHtml}

    <div id="leavesArea">
      ${list.length ? list.map(l => renderLeaveCard(l, "exec")).join("") : emptyState(filter === "archive" ? "لا توجد طلبات في الأرشيف مطابقة للبحث" : "لا توجد طلبات إجازات بانتظار الاعتماد حالياً")}
    </div>
  `;

  $$("[data-exec-lfilter]").forEach(b=>b.addEventListener("click", ()=>{
    State.execLeaveFilter = b.dataset.execLfilter;
    State.execArchiveSearch = "";
    State.execArchiveStatus = "all";
    renderExecLeavesApproval(el);
  }));

  if (filter === "archive") {
    const searchInp = $("#execArchiveSearchInput", el);
    const statusSel = $("#execArchiveStatusSelect", el);
    
    if (searchInp) {
      searchInp.addEventListener("input", (e) => {
        State.execArchiveSearch = e.target.value;
        renderArchiveListOnly();
      });
    }
    
    if (statusSel) {
      statusSel.addEventListener("change", (e) => {
        State.execArchiveStatus = e.target.value;
        renderArchiveListOnly();
      });
    }
  }

  function renderArchiveListOnly() {
    let subList = State.execLeaves || [];
    subList = subList.filter(l => l.status === "approved" || l.status === "exec_rejected");
    
    const sq = State.execArchiveSearch.trim().toLowerCase();
    if (sq) {
      subList = subList.filter(l => (l.userName || "").toLowerCase().includes(sq) || (l.refNo || "").toLowerCase().includes(sq));
    }
    
    const sf = State.execArchiveStatus;
    if (sf === "approved") {
      subList = subList.filter(l => l.status === "approved");
    } else if (sf === "rejected") {
      subList = subList.filter(l => l.status === "exec_rejected");
    }
    
    const leavesArea = $("#leavesArea", el);
    if (leavesArea) {
      leavesArea.innerHTML = subList.length 
        ? subList.map(l => renderLeaveCard(l, "exec")).join("") 
        : emptyState("لا توجد طلبات مطابقة للبحث في الأرشيف");
      bindLeaveEvents(el);
    }
  }

  bindLeaveEvents(el);
}

/* ══════════════════════════════════════════════════════════
   17. نظام الحضور والانصراف (Attendance & Punctuality System)
 ══════════════════════════════════════════════════════════ */

let attendanceUnsub = null;

async function renderAttendance(host) {
  const u = State.user;
  const isHRUser = u && (u.role === "hr" || u.role === "executive" || u.role === "tech_admin" || u.role === "admin");

  if (!isHRUser) {
    host.innerHTML = `
      <div style="padding:40px; text-align:center; background:var(--bg-paper); border-radius:var(--r-lg); border:1px solid var(--line-soft); margin-top:20px;">
        <i class="fa-solid fa-lock" style="font-size:3rem; color:var(--gold); margin-bottom:16px;"></i>
        <h3 style="font-size:18px; font-weight:700; margin-bottom:8px;">عذراً، هذه الصفحة مخصصة لمدير النظام والموارد البشرية فقط</h3>
        <p style="color:var(--ink-muted); font-size:14px;">لا تملك الصلاحية لإدارة سجلات الحضور والانصراف.</p>
      </div>
    `;
    return;
  }

  const now = new Date();
  if (!State.attendanceYear) State.attendanceYear = now.getFullYear();
  if (!State.attendanceMonth) State.attendanceMonth = now.getMonth() + 1;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (!State.selectedAttendanceDate) State.selectedAttendanceDate = todayStr;

  if (!State.members || State.members.length === 0) {
    try {
      State.members = await (S.listUsers ? S.listUsers() : S.getUsers());
    } catch (e) {
      console.warn("فشل جلب قائمة الموظفين في الحضور:", e);
      State.members = [];
    }
  }

  if (!State.hrLeaves || State.hrLeaves.length === 0) {
    try {
      State.hrLeaves = await S.getEmpLeavesHR();
    } catch (e) {
      State.hrLeaves = [];
    }
  }

  host.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:20px; padding-bottom:40px;">
      
      <!-- شريط العنوان والتحكم في التاريخ -->
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; background:var(--bg-paper); padding:18px 24px; border-radius:var(--r-lg); border:1px solid var(--line-soft); box-shadow:var(--shadow-card);">
        <div>
          <h2 style="font-size:20px; font-weight:800; color:var(--ink); display:flex; align-items:center; gap:10px;">
            <i class="fa-solid fa-user-clock" style="color:var(--gold);"></i> الحضور والانصراف
          </h2>
          <p style="font-size:13px; color:var(--ink-muted); margin-top:2px;">إدارة ورصد وسجلات حضور وانصراف موظفي الجمعية دائمًا بحسب الأشهر</p>
        </div>

        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:6px; background:var(--bg-subtle); padding:6px 12px; border-radius:var(--r-md); border:1px solid var(--line-soft);">
            <label style="font-size:12px; font-weight:600; color:var(--ink-mid);">التاريخ:</label>
            <input type="date" id="attDateFilter" value="${State.selectedAttendanceDate}" style="border:none; background:transparent; font-size:13px; font-weight:700; color:var(--ink); outline:none; font-family:var(--font-base);">
          </div>

          <select id="attMonthFilter" style="padding:7px 12px; border-radius:var(--r-md); border:1px solid var(--line); background:var(--bg-paper); font-size:13px; font-weight:700; color:var(--ink); outline:none;">
            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${State.attendanceMonth === m ? 'selected' : ''}>شهر ${m} (${getMonthNameArabic(m)})</option>`).join('')}
          </select>

          <select id="attYearFilter" style="padding:7px 12px; border-radius:var(--r-md); border:1px solid var(--line); background:var(--bg-paper); font-size:13px; font-weight:700; color:var(--ink); outline:none;">
            ${[2024, 2025, 2026, 2027].map(y => `<option value="${y}" ${State.attendanceYear === y ? 'selected' : ''}>${y}</option>`).join('')}
          </select>

          <button class="btn btn-secondary" id="btnAttendanceArchive" style="gap:6px; font-size:12.5px;">
            <i class="fa-solid fa-box-archive"></i> الأرشيف
          </button>

          <button class="btn btn-primary" id="btnExportMonthlyPDF" style="gap:6px; font-size:12.5px;">
            <i class="fa-solid fa-file-pdf"></i> تقرير الشهر PDF
          </button>

          <button class="btn btn-secondary" id="btnAttConfigSettings" style="gap:6px; font-size:12.5px;" title="إعدادات الحضور والنطاق الجغرافي">
            <i class="fa-solid fa-sliders" style="color:var(--gold-deep);"></i> إعدادات النطاق
          </button>
        </div>
      </div>

      <!-- كروت الإحصائيات العامة للمحتوى -->
      <div id="attStatsContainer" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:14px;">
        <div class="stat-card" style="background:var(--bg-paper); padding:16px; border-radius:var(--r-md); border:1px solid var(--line-soft); box-shadow:var(--shadow-card);">
          <div style="display:flex; align-items:center; justify-content:space-between; color:var(--ink-muted); font-size:12px; font-weight:600;">
            إجمالي الموظفين <i class="fa-solid fa-users" style="color:var(--gold);"></i>
          </div>
          <div style="font-size:22px; font-weight:800; color:var(--ink); margin-top:8px;" id="statTotalEmps">${(State.members || []).length}</div>
        </div>

        <div class="stat-card" style="background:rgba(31, 122, 76, 0.06); padding:16px; border-radius:var(--r-md); border:1px solid rgba(31, 122, 76, 0.2);">
          <div style="display:flex; align-items:center; justify-content:space-between; color:var(--success); font-size:12px; font-weight:600;">
            الحاضرون اليوم <i class="fa-solid fa-circle-check"></i>
          </div>
          <div style="font-size:22px; font-weight:800; color:var(--success); margin-top:8px;" id="statPresentCount">0</div>
        </div>

        <div class="stat-card" style="background:rgba(184, 142, 54, 0.08); padding:16px; border-radius:var(--r-md); border:1px solid rgba(184, 142, 54, 0.25);">
          <div style="display:flex; align-items:center; justify-content:space-between; color:var(--gold-deep); font-size:12px; font-weight:600;">
            المتأخرون اليوم <i class="fa-solid fa-clock"></i>
          </div>
          <div style="font-size:22px; font-weight:800; color:var(--gold-deep); margin-top:8px;" id="statLateCount">0</div>
          <div style="font-size:11px; color:var(--ink-muted); margin-top:2px;" id="statLateMins">0 دقيقة تأخير</div>
        </div>

        <div class="stat-card" style="background:rgba(168, 42, 42, 0.06); padding:16px; border-radius:var(--r-md); border:1px solid rgba(168, 42, 42, 0.2);">
          <div style="display:flex; align-items:center; justify-content:space-between; color:var(--danger); font-size:12px; font-weight:600;">
            الغياب اليوم <i class="fa-solid fa-circle-xmark"></i>
          </div>
          <div style="font-size:22px; font-weight:800; color:var(--danger); margin-top:8px;" id="statAbsentCount">0</div>
        </div>

        <div class="stat-card" style="background:rgba(43, 94, 168, 0.06); padding:16px; border-radius:var(--r-md); border:1px solid rgba(43, 94, 168, 0.2);">
          <div style="display:flex; align-items:center; justify-content:space-between; color:var(--info); font-size:12px; font-weight:600;">
            الإجازات <i class="fa-solid fa-umbrella-beach"></i>
          </div>
          <div style="font-size:22px; font-weight:800; color:var(--info); margin-top:8px;" id="statLeaveCount">0</div>
        </div>
      </div>

      <!-- قائمة الموظفين والسجلات التفاعلية -->
      <div style="background:var(--bg-paper); border-radius:var(--r-lg); border:1px solid var(--line-soft); padding:20px; box-shadow:var(--shadow-card);">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <h3 style="font-size:16px; font-weight:700; color:var(--ink); display:flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-list-check" style="color:var(--gold);"></i> سجلات الموظفين لتاريخ (<span id="lblCurDate">${State.selectedAttendanceDate}</span>)
          </h3>
          <input type="text" id="attSearchEmp" placeholder="بحث باسم الموظف أو القسم…" style="padding:8px 14px; border-radius:var(--r-md); border:1px solid var(--line-soft); background:var(--bg-subtle); font-size:13px; width:240px; outline:none;">
        </div>

        <div id="attMainContentHost">
          <div style="text-align:center; padding:30px; color:var(--ink-muted);">
            <i class="fa-solid fa-spinner spin" style="font-size:24px;"></i>
            <p style="margin-top:10px; font-size:13px;">جارٍ تحميل سجلات الحضور والانصراف…</p>
          </div>
        </div>
      </div>

    </div>
  `;

  $("#attDateFilter").addEventListener("change", (e) => {
    State.selectedAttendanceDate = e.target.value;
    const parts = e.target.value.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (y !== State.attendanceYear || m !== State.attendanceMonth) {
        State.attendanceYear = y;
        State.attendanceMonth = m;
        $("#attYearFilter").value = y;
        $("#attMonthFilter").value = m;
        initAttendanceRealtimeListener();
        return;
      }
    }
    renderAttendanceTableAndStats();
  });

  $("#attMonthFilter").addEventListener("change", (e) => {
    State.attendanceMonth = parseInt(e.target.value, 10);
    initAttendanceRealtimeListener();
  });

  $("#attYearFilter").addEventListener("change", (e) => {
    State.attendanceYear = parseInt(e.target.value, 10);
    initAttendanceRealtimeListener();
  });

  $("#btnAttendanceArchive").addEventListener("click", () => {
    openAttendanceArchiveDrawer();
  });

  $("#btnExportMonthlyPDF").addEventListener("click", (e) => {
    downloadMonthlyAttendancePDF(e.currentTarget);
  });

  const btnSet = $("#btnAttConfigSettings");
  if (btnSet) {
    btnSet.addEventListener("click", () => navigate("settings"));
  }

  $("#attSearchEmp").addEventListener("input", () => {
    renderAttendanceTableAndStats();
  });

  initAttendanceRealtimeListener();
}

function getMonthNameArabic(m) {
  const names = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  return names[m - 1] || "";
}

function initAttendanceRealtimeListener() {
  if (attendanceUnsub) {
    attendanceUnsub();
    attendanceUnsub = null;
  }

  const y = State.attendanceYear;
  const m = State.attendanceMonth;

  attendanceUnsub = S.watchAttendanceForMonth(y, m, (records) => {
    State.attendanceRecords = records || [];
    renderAttendanceTableAndStats();
  });
}

function renderAttendanceTableAndStats() {
  const host = $("#attMainContentHost");
  if (!host) return;

  const targetDate = State.selectedAttendanceDate;
  const searchQ = ($("#attSearchEmp")?.value || "").trim().toLowerCase();
  const lbl = $("#lblCurDate");
  if (lbl) lbl.textContent = targetDate;

  const members = State.members || [];
  const recordsMap = new Map();
  (State.attendanceRecords || []).forEach(r => {
    if (r.date === targetDate) {
      recordsMap.set(r.employeeUid, r);
    }
  });

  const approvedLeaves = (State.hrLeaves || []).filter(l => l.status === "hr_approved" || l.status === "exec_approved" || l.status === "approved");
  const leaveUidSet = new Set();
  approvedLeaves.forEach(l => {
    if (l.startDate && l.endDate && l.userId) {
      if (targetDate >= l.startDate && targetDate <= l.endDate) {
        leaveUidSet.add(l.userId);
      }
    }
  });

  let presentCount = 0;
  let lateCount = 0;
  let totalLateMins = 0;
  let absentCount = 0;
  let leaveCount = 0;

  const rowItems = members.map(m => {
    let rec = recordsMap.get(m.uid);

    if (!rec && leaveUidSet.has(m.uid)) {
      rec = {
        employeeUid: m.uid,
        employeeName: m.name || m.email,
        department: m.department || "",
        date: targetDate,
        status: "leave",
        notes: "إجازة معتمدة تلقائية",
        isAuto: true
      };
    }

    const status = rec ? rec.status : "unregistered";

    if (status === "present") presentCount++;
    else if (status === "late") {
      lateCount++;
      totalLateMins += (rec.lateMinutes || 0);
    } else if (status === "absent") absentCount++;
    else if (status === "leave") leaveCount++;

    return { member: m, record: rec, status };
  });

  const elTot = $("#statTotalEmps"); if (elTot) elTot.textContent = members.length;
  const elPres = $("#statPresentCount"); if (elPres) elPres.textContent = presentCount;
  const elLate = $("#statLateCount"); if (elLate) elLate.textContent = lateCount;
  const elLateM = $("#statLateMins"); if (elLateM) elLateM.textContent = `${totalLateMins} دقيقة تأخير`;
  const elAbs = $("#statAbsentCount"); if (elAbs) elAbs.textContent = absentCount;
  const elLev = $("#statLeaveCount"); if (elLev) elLev.textContent = leaveCount;

  const filtered = rowItems.filter(item => {
    if (!searchQ) return true;
    const name = (item.member.name || item.member.email || "").toLowerCase();
    const dept = (item.member.department || "").toLowerCase();
    return name.includes(searchQ) || dept.includes(searchQ);
  });

  if (filtered.length === 0) {
    host.innerHTML = `
      <div style="text-align:center; padding:40px; color:var(--ink-muted);">
        <i class="fa-solid fa-users-slash" style="font-size:2.5rem; color:var(--ink-faint); margin-bottom:12px;"></i>
        <p style="font-size:14px;">لا توجد نتائج مطابقة لمحدادت البحث.</p>
      </div>
    `;
    return;
  }

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    host.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${filtered.map(item => {
          const m = item.member;
          const r = item.record;
          const statusBadge = getAttendanceStatusBadge(item.status, r?.lateMinutes);
          const methodTag = r?.method === "electronic" 
            ? `<span style="font-size:11px; padding:2px 8px; border-radius:999px; background:rgba(34,197,94,0.1); color:#16a34a; font-weight:700;"><i class="fa-solid fa-mobile-screen"></i> إلكتروني ${r?.distanceFromOffice !== undefined ? `(${r.distanceFromOffice}م)` : ''}</span>`
            : r ? `<span style="font-size:11px; padding:2px 8px; border-radius:999px; background:rgba(184,142,54,0.1); color:var(--gold-deep); font-weight:700;"><i class="fa-solid fa-pen"></i> يدوي</span>` : '';
          return `
            <div style="background:var(--bg-paper); border:1px solid var(--line-soft); border-radius:var(--r-md); padding:14px; display:flex; flex-direction:column; gap:10px; box-shadow:var(--shadow-card);">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:center; gap:10px;">
                  <div style="width:36px; height:36px; border-radius:50%; background:var(--gold-pale); color:var(--gold-deep); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px;">
                    ${(m.name || m.email || "م")[0]}
                  </div>
                  <div>
                    <div style="font-weight:700; font-size:14px; color:var(--ink);">${esc(m.name || m.email)}</div>
                    <div style="font-size:11.5px; color:var(--ink-muted);">${esc(m.department || "غير محدد")} ${methodTag}</div>
                  </div>
                </div>
                ${statusBadge}
              </div>

              <div style="font-size:12.5px; color:var(--ink-soft); background:var(--bg-subtle); padding:8px 10px; border-radius:var(--r-sm); display:flex; flex-direction:column; gap:4px;">
                <div><strong>وقت الحضور:</strong> ${r?.checkInTime ? esc(r.checkInTime) : "—"} | <strong>الانصراف:</strong> ${r?.checkOutTime ? esc(r.checkOutTime) : "—"}</div>
                ${r?.lateMinutes > 0 ? `<div style="color:var(--gold-deep); font-weight:700;"><strong>التأخير:</strong> ${r.lateMinutes} دقيقة</div>` : ''}
                <div><strong>الملاحظات:</strong> ${r?.notes ? esc(r.notes) : "—"}</div>
              </div>

              <div style="display:flex; items-center; justify-content:flex-end; gap:8px; margin-top:4px;">
                <button class="btn btn-secondary btn-sm btn-emp-rep" data-uid="${m.uid}" style="font-size:11.5px; gap:4px;">
                  <i class="fa-solid fa-chart-line"></i> تقرير الموظف
                </button>
                <button class="btn btn-primary btn-sm btn-edit-att" data-uid="${m.uid}" style="font-size:11.5px; gap:4px;">
                  <i class="fa-solid fa-pen-to-square"></i> ${r ? 'تعديل الحضور' : 'تسجيل الحضور'}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else {
    host.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:right;">
          <thead>
            <tr style="background:var(--bg-subtle); border-bottom:1px solid var(--line); color:var(--ink-mid);">
              <th style="padding:12px; font-weight:700;">الموظف</th>
              <th style="padding:12px; font-weight:700;">القسم</th>
              <th style="padding:12px; font-weight:700;">حالة اليوم</th>
              <th style="padding:12px; font-weight:700;">وقت الحضور</th>
              <th style="padding:12px; font-weight:700;">وقت الانصراف</th>
              <th style="padding:12px; font-weight:700;">الطريقة/الموقع</th>
              <th style="padding:12px; font-weight:700;">التأخير</th>
              <th style="padding:12px; font-weight:700;">الملاحظات</th>
              <th style="padding:12px; font-weight:700; text-align:left;">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(item => {
              const m = item.member;
              const r = item.record;
              const statusBadge = getAttendanceStatusBadge(item.status, r?.lateMinutes);
              const methodTag = r?.method === "electronic" 
                ? `<span style="font-size:11px; padding:3px 8px; border-radius:999px; background:rgba(34,197,94,0.1); color:#16a34a; font-weight:700;"><i class="fa-solid fa-mobile-screen"></i> إلكتروني ${r?.distanceFromOffice !== undefined ? `(${r.distanceFromOffice}م)` : ''}</span>`
                : r ? `<span style="font-size:11px; padding:3px 8px; border-radius:999px; background:rgba(184,142,54,0.1); color:var(--gold-deep); font-weight:700;"><i class="fa-solid fa-pen"></i> يدوي</span>` : `<span style="color:var(--ink-faint);">—</span>`;
              return `
                <tr style="border-bottom:1px solid var(--line-soft);">
                  <td style="padding:12px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                      <div style="width:32px; height:32px; border-radius:50%; background:var(--gold-pale); color:var(--gold-deep); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px;">
                        ${(m.name || m.email || "م")[0]}
                      </div>
                      <span style="font-weight:700; color:var(--ink);">${esc(m.name || m.email)}</span>
                    </div>
                  </td>
                  <td style="padding:12px; color:var(--ink-mid);">${esc(m.department || "—")}</td>
                  <td style="padding:12px;">${statusBadge}</td>
                  <td style="padding:12px; font-weight:600; color:var(--ink);">${r?.checkInTime ? esc(r.checkInTime) : "—"}</td>
                  <td style="padding:12px; font-weight:600; color:var(--ink);">${r?.checkOutTime ? esc(r.checkOutTime) : "—"}</td>
                  <td style="padding:12px;">${methodTag}</td>
                  <td style="padding:12px;">
                    ${r?.lateMinutes > 0 ? `<span style="color:var(--gold-deep); font-weight:800;">${r.lateMinutes} دقيقة</span>` : `<span style="color:var(--ink-faint);">0</span>`}
                  </td>
                  <td style="padding:12px; color:var(--ink-mid); max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${r?.notes ? esc(r.notes) : "<span style='color:var(--ink-faint);'>—</span>"}
                  </td>
                  <td style="padding:12px; text-align:left;">
                    <div style="display:flex; align-items:center; justify-content:flex-end; gap:6px;">
                      <button class="btn btn-secondary btn-sm btn-emp-rep" data-uid="${m.uid}" title="عرض تقرير الموظف للشهر">
                        <i class="fa-solid fa-user-gear"></i> التقرير
                      </button>
                      <button class="btn btn-primary btn-sm btn-edit-att" data-uid="${m.uid}">
                        <i class="fa-solid fa-pen-to-square"></i> ${r ? 'تعديل' : 'تسجيل'}
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  $$(".btn-edit-att").forEach(btn => {
    btn.addEventListener("click", () => {
      const uid = btn.dataset.uid;
      const emp = (State.members || []).find(x => x.uid === uid);
      const rec = (State.attendanceRecords || []).find(r => r.employeeUid === uid && r.date === targetDate);
      openRecordAttendanceModal(emp, targetDate, rec);
    });
  });

  $$(".btn-emp-rep").forEach(btn => {
    btn.addEventListener("click", () => {
      const uid = btn.dataset.uid;
      const emp = (State.members || []).find(x => x.uid === uid);
      openEmployeeAttendanceModal(emp);
    });
  });
}

function getAttendanceStatusBadge(status, lateMinutes) {
  if (status === "present") {
    return `<span style="background:rgba(31, 122, 76, 0.1); color:var(--success); border:1px solid rgba(31, 122, 76, 0.25); padding:4px 10px; border-radius:var(--r-full); font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid fa-circle" style="font-size:7px;"></i> حاضر</span>`;
  } else if (status === "late") {
    return `<span style="background:rgba(184, 142, 54, 0.12); color:var(--gold-deep); border:1px solid rgba(184, 142, 54, 0.3); padding:4px 10px; border-radius:var(--r-full); font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid fa-circle" style="font-size:7px;"></i> متأخر ${lateMinutes ? `(${lateMinutes} د)` : ''}</span>`;
  } else if (status === "absent") {
    return `<span style="background:rgba(168, 42, 42, 0.1); color:var(--danger); border:1px solid rgba(168, 42, 42, 0.25); padding:4px 10px; border-radius:var(--r-full); font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid fa-circle" style="font-size:7px;"></i> غائب</span>`;
  } else if (status === "leave") {
    return `<span style="background:rgba(43, 94, 168, 0.1); color:var(--info); border:1px solid rgba(43, 94, 168, 0.25); padding:4px 10px; border-radius:var(--r-full); font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid fa-circle" style="font-size:7px;"></i> إجازة</span>`;
  } else {
    return `<span style="background:var(--bg-subtle); color:var(--ink-muted); border:1px solid var(--line-soft); padding:4px 10px; border-radius:var(--r-full); font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:5px;"><i class="fa-regular fa-circle" style="font-size:7px;"></i> لم يسجل</span>`;
  }
}

function openRecordAttendanceModal(emp, targetDate, existingRecord) {
  if (!emp) return;

  const currentStatus = existingRecord ? existingRecord.status : "present";
  const currentCheckIn = existingRecord ? (existingRecord.checkInTime || "08:00") : "08:00";
  const currentCheckOut = existingRecord ? (existingRecord.checkOutTime || "") : "";
  const currentNotes = existingRecord ? (existingRecord.notes || "") : "";
  const currentLateMins = existingRecord ? (existingRecord.lateMinutes || 0) : 0;

  const content = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--line-soft); padding-bottom:14px;">
        <div style="width:42px; height:42px; border-radius:50%; background:var(--gold-pale); color:var(--gold-deep); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:16px;">
          ${(emp.name || emp.email || "م")[0]}
        </div>
        <div>
          <h3 style="font-size:16px; font-weight:700; color:var(--ink);">${esc(emp.name || emp.email)}</h3>
          <p style="font-size:12.5px; color:var(--ink-muted);">${esc(emp.department || "غير محدد")} — تاريخ: <strong style="color:var(--ink);">${targetDate}</strong></p>
        </div>
      </div>

      <form id="formRecordAtt" style="display:flex; flex-direction:column; gap:14px;">
        <div>
          <label style="display:block; font-size:13px; font-weight:700; color:var(--ink); margin-bottom:6px;">حالة اليوم:</label>
          <select id="modalAttStatus" style="width:100%; padding:10px; border-radius:var(--r-md); border:1px solid var(--line); background:var(--bg-paper); font-size:13.5px; font-weight:700; color:var(--ink); outline:none;">
            <option value="present" ${currentStatus === "present" ? "selected" : ""}>🟢 حاضر</option>
            <option value="late" ${currentStatus === "late" ? "selected" : ""}>🟡 متأخر</option>
            <option value="absent" ${currentStatus === "absent" ? "selected" : ""}>🔴 غائب</option>
            <option value="leave" ${currentStatus === "leave" ? "selected" : ""}>🟣 إجازة</option>
          </select>
        </div>

        <div id="wrapCheckInTime" style="display:${currentStatus === 'late' || currentStatus === 'present' ? 'block' : 'none'};">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="display:block; font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:6px;">
                وقت الحضور الفعلي: <span id="lblTimeReq" style="color:var(--danger); display:${currentStatus === 'late' ? 'inline' : 'none'};">*</span>
              </label>
              <input type="text" id="modalCheckInTime" value="${esc(currentCheckIn)}" placeholder="مثال: 08:04 ص" style="width:100%; padding:10px; border-radius:var(--r-md); border:1px solid var(--line-soft); background:var(--bg-paper); font-size:13.5px; font-weight:600; color:var(--ink); outline:none;">
            </div>
            <div>
              <label style="display:block; font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:6px;">وقت الانصراف (اختياري):</label>
              <input type="text" id="modalCheckOutTime" value="${esc(currentCheckOut)}" placeholder="مثال: 04:07 م" style="width:100%; padding:10px; border-radius:var(--r-md); border:1px solid var(--line-soft); background:var(--bg-paper); font-size:13.5px; font-weight:600; color:var(--ink); outline:none;">
            </div>
          </div>
          <div id="previewLateMins" style="margin-top:6px; font-size:12px; font-weight:700; color:var(--gold-deep); display:${currentStatus === 'late' ? 'block' : 'none'};">
            التأخير المحسوب: ${currentLateMins} دقيقة
          </div>
        </div>

        <div>
          <label style="display:block; font-size:13px; font-weight:700; color:var(--ink); margin-bottom:6px;">سبب التعديل اليدوي (يُسجل في سجل التدقيق):</label>
          <input type="text" id="modalAttReason" placeholder="أدخل سبب التعديل اليدوي (مثال: نسيان التسجيل إلكترونياً، مهمة خارجية…)" style="width:100%; padding:10px; border-radius:var(--r-md); border:1px solid var(--line-soft); background:var(--bg-paper); font-size:13px; color:var(--ink); outline:none;">
        </div>

        <div>
          <label style="display:block; font-size:13px; font-weight:700; color:var(--ink); margin-bottom:6px;">ملاحظات الموارد البشرية:</label>
          <textarea id="modalAttNotes" rows="2" placeholder="ملاحظة خاصة بهذا السجل (اختياري)…" style="width:100%; padding:10px; border-radius:var(--r-md); border:1px solid var(--line-soft); background:var(--bg-paper); font-size:13px; color:var(--ink); outline:none; font-family:var(--font-base); resize:vertical;">${esc(currentNotes)}</textarea>
        </div>

        <div style="margin-top:10px; display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
          <button type="submit" class="btn btn-primary" id="btnSaveAttendance">
            <i class="fa-solid fa-floppy-disk"></i> حفظ السجل
          </button>
        </div>
      </form>
    </div>
  `;

  openModal(content);

  const statusSel = $("#modalAttStatus");
  const wrapTime = $("#wrapCheckInTime");
  const timeReq = $("#lblTimeReq");
  const timeInput = $("#modalCheckInTime");
  const previewLate = $("#previewLateMins");

  const updateTimeVisibility = () => {
    const st = statusSel.value;
    if (st === "late") {
      wrapTime.style.display = "block";
      timeReq.style.display = "inline";
      previewLate.style.display = "block";
    } else if (st === "present") {
      wrapTime.style.display = "block";
      timeReq.style.display = "none";
      previewLate.style.display = "none";
    } else {
      wrapTime.style.display = "none";
      previewLate.style.display = "none";
    }
  };

  const updateLateCalc = () => {
    if (statusSel.value === "late") {
      const lateMins = S.calculateLateMinutes(timeInput.value, "08:00");
      previewLate.textContent = `التأخير المحسوب: ${lateMins} دقيقة (بداية الدوام 08:00 ص)`;
    }
  };

  statusSel.addEventListener("change", () => {
    updateTimeVisibility();
    updateLateCalc();
  });

  timeInput.addEventListener("input", updateLateCalc);

  $("#formRecordAtt").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = statusSel.value;
    const checkIn = timeInput.value.trim();
    const checkOut = $("#modalCheckOutTime") ? $("#modalCheckOutTime").value.trim() : "";
    const reason = $("#modalAttReason") ? $("#modalAttReason").value.trim() : "";
    const notes = $("#modalAttNotes").value.trim();

    if (status === "late" && !checkIn) {
      toast("يرجى إدخال وقت الوصول الفعلي للموظف المتأخر", "err");
      return;
    }

    const lateMins = status === "late" ? S.calculateLateMinutes(checkIn, "08:00") : 0;

    const btn = $("#btnSaveAttendance");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الحفظ…`;

    try {
      await S.saveAttendanceRecord({
        employeeUid: emp.uid,
        employeeName: emp.name || emp.email,
        department: emp.department || "",
        date: targetDate,
        status: status,
        checkInTime: checkIn,
        checkOutTime: checkOut,
        lateMinutes: lateMins,
        notes: notes,
        reason: reason || notes || "تعديل يدوي بواسطة الموارد البشرية",
        method: "manual"
      }, State.user);

      toast("تم حفظ سجل الحضور بنجاح");
      closeModal();
    } catch (err) {
      console.error("فشل حفظ الحضور:", err);
      toast(err.message || "حدث خطأ أثناء حفظ سجل الحضور", "err");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> حفظ السجل`;
    }
  });
}

function openAttendanceArchiveDrawer() {
  const years = [2026, 2025, 2024];
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];

  const content = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="border-bottom:1px solid var(--line-soft); padding-bottom:12px;">
        <h3 style="font-size:16px; font-weight:700; color:var(--ink); display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-box-archive" style="color:var(--gold);"></i> أرشيف الحضور والانصراف
        </h3>
        <p style="font-size:12.5px; color:var(--ink-muted); margin-top:2px;">اختر الشهر والسنة للرجوع إلى جميع سجلات الحضور التاريخية المحفوظة</p>
      </div>

      <div style="display:flex; flex-direction:column; gap:16px; max-height:400px; overflow-y:auto; padding-left:4px;">
        ${years.map(y => `
          <div style="background:var(--bg-subtle); border:1px solid var(--line-soft); border-radius:var(--r-md); padding:14px;">
            <div style="font-size:14px; font-weight:800; color:var(--ink); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-calendar" style="color:var(--gold);"></i> سنة ${y}
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(100px, 1fr)); gap:8px;">
              ${months.map(m => `
                <button class="btn btn-secondary btn-sm btn-select-archive-month" data-year="${y}" data-month="${m}" style="font-size:12px; font-weight:700; ${State.attendanceYear === y && State.attendanceMonth === m ? 'background:var(--gold); color:#ffffff; border-color:var(--gold);' : ''}">
                  ${getMonthNameArabic(m)} (${m})
                </button>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <div style="display:flex; justify-content:flex-end; margin-top:8px;">
        <button class="btn btn-secondary" data-close>إغلاق</button>
      </div>
    </div>
  `;

  openModal(content);

  $$(".btn-select-archive-month").forEach(btn => {
    btn.addEventListener("click", () => {
      const y = parseInt(btn.dataset.year, 10);
      const m = parseInt(btn.dataset.month, 10);
      State.attendanceYear = y;
      State.attendanceMonth = m;

      $("#attYearFilter").value = y;
      $("#attMonthFilter").value = m;

      closeModal();
      initAttendanceRealtimeListener();
      toast(`تم الانتقال إلى أرشيف ${getMonthNameArabic(m)} ${y}`);
    });
  });
}

function openEmployeeAttendanceModal(emp) {
  if (!emp) return;

  const y = State.attendanceYear;
  const m = State.attendanceMonth;
  const records = (State.attendanceRecords || []).filter(r => r.employeeUid === emp.uid);

  const daysInMonth = new Date(y, m, 0).getDate();
  const dayRecordsMap = new Map();
  records.forEach(r => dayRecordsMap.set(r.date, r));

  let presentCount = 0;
  let lateCount = 0;
  let totalLateMins = 0;
  let absentCount = 0;
  let leaveCount = 0;

  const dayRows = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const r = dayRecordsMap.get(dateStr);

    const status = r ? r.status : "unregistered";
    if (status === "present") presentCount++;
    else if (status === "late") {
      lateCount++;
      totalLateMins += (r.lateMinutes || 0);
    } else if (status === "absent") absentCount++;
    else if (status === "leave") leaveCount++;

    dayRows.push({ day: d, date: dateStr, record: r, status });
  }

  const content = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; border-bottom:1px solid var(--line-soft); padding-bottom:14px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:44px; height:44px; border-radius:50%; background:var(--gold-pale); color:var(--gold-deep); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:16px;">
            ${(emp.name || emp.email || "م")[0]}
          </div>
          <div>
            <h3 style="font-size:17px; font-weight:800; color:var(--ink);">${esc(emp.name || emp.email)}</h3>
            <p style="font-size:12.5px; color:var(--ink-muted);">${esc(emp.department || "غير محدد")} — شهر ${getMonthNameArabic(m)} ${y}</p>
          </div>
        </div>

        <button class="btn btn-primary btn-sm" id="btnExportEmpPDF" style="gap:6px;">
          <i class="fa-solid fa-file-pdf"></i> تحميل تقرير الموظف PDF
        </button>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:10px;">
        <div style="background:rgba(31, 122, 76, 0.06); padding:10px; border-radius:var(--r-md); text-align:center; border:1px solid rgba(31, 122, 76, 0.2);">
          <div style="font-size:18px; font-weight:800; color:var(--success);">${presentCount}</div>
          <div style="font-size:11px; color:var(--ink-mid);">أيام الحضور</div>
        </div>
        <div style="background:rgba(184, 142, 54, 0.08); padding:10px; border-radius:var(--r-md); text-align:center; border:1px solid rgba(184, 142, 54, 0.25);">
          <div style="font-size:18px; font-weight:800; color:var(--gold-deep);">${lateCount}</div>
          <div style="font-size:11px; color:var(--ink-mid);">أيام التأخير (${totalLateMins} د)</div>
        </div>
        <div style="background:rgba(168, 42, 42, 0.06); padding:10px; border-radius:var(--r-md); text-align:center; border:1px solid rgba(168, 42, 42, 0.2);">
          <div style="font-size:18px; font-weight:800; color:var(--danger);">${absentCount}</div>
          <div style="font-size:11px; color:var(--ink-mid);">أيام الغياب</div>
        </div>
        <div style="background:rgba(43, 94, 168, 0.06); padding:10px; border-radius:var(--r-md); text-align:center; border:1px solid rgba(43, 94, 168, 0.2);">
          <div style="font-size:18px; font-weight:800; color:var(--info);">${leaveCount}</div>
          <div style="font-size:11px; color:var(--ink-mid);">أيام الإجازة</div>
        </div>
      </div>

      <div style="max-height:320px; overflow-y:auto; border:1px solid var(--line-soft); border-radius:var(--r-md);">
        <table style="width:100%; border-collapse:collapse; font-size:12.5px; text-align:right;">
          <thead>
            <tr style="background:var(--bg-subtle); border-bottom:1px solid var(--line-soft); position:sticky; top:0;">
              <th style="padding:8px 12px;">اليوم / التاريخ</th>
              <th style="padding:8px 12px;">الحالة</th>
              <th style="padding:8px 12px;">وقت الحضور</th>
              <th style="padding:8px 12px;">التأخير</th>
              <th style="padding:8px 12px;">الملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${dayRows.map(row => `
              <tr style="border-bottom:1px solid var(--line-soft);">
                <td style="padding:8px 12px; font-weight:700;">${row.date}</td>
                <td style="padding:8px 12px;">${getAttendanceStatusBadge(row.status, row.record?.lateMinutes)}</td>
                <td style="padding:8px 12px;">${row.record?.checkInTime ? esc(row.record.checkInTime) : "—"}</td>
                <td style="padding:8px 12px;">${row.record?.lateMinutes > 0 ? `<span style="color:var(--gold-deep); font-weight:700;">${row.record.lateMinutes} دقيقة</span>` : "0"}</td>
                <td style="padding:8px 12px; color:var(--ink-mid);">${row.record?.notes ? esc(row.record.notes) : "—"}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="display:flex; justify-content:flex-end; margin-top:8px;">
        <button class="btn btn-secondary" data-close>إغلاق</button>
      </div>
    </div>
  `;

  openModal(content);

  $("#btnExportEmpPDF").addEventListener("click", (e) => {
    downloadEmployeeAttendancePDF(emp, y, m, dayRows, e.currentTarget);
  });
}

/* ══════════════════════════════════════════════════════════
   مستندات وتقارير الـ PDF الرسمية (Modular PDF System)
 ══════════════════════════════════════════════════════════ */
function downloadMonthlyAttendancePDF(btn) {
  return downloadMonthlyAttendancePDFDoc(btn, {
    State,
    S,
    getMonthNameArabic,
    esc,
    toast
  });
}

function downloadEmployeeAttendancePDF(emp, year, month, dayRows, btn) {
  return downloadEmployeeAttendancePDFDoc(emp, year, month, dayRows, btn, {
    State,
    S,
    getMonthNameArabic,
    esc,
    toast
  });
}

function getPdfStatusBadge(status) {
  return getPdfStatusBadgeDoc(status);
}

function getLoggedUserRoleTitle() {
  return getLoggedUserRoleTitleDoc(State.user);
}

function generateMasterDocumentPDF(options) {
  return masterPDFEngine({ ...options, userState: State.user });
}

function generatePrintablePDFReport(title, contentHtml) {
  return masterPrintReport(title, contentHtml);
}

function formatTimelineDate(timestamp) {
  if (!timestamp) return "";
  
  let dateObj;
  if (typeof timestamp.toDate === "function") {
    dateObj = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    dateObj = timestamp;
  } else if (timestamp.seconds) {
    dateObj = new Date(timestamp.seconds * 1000);
  } else {
    dateObj = new Date(timestamp);
  }
  
  if (isNaN(dateObj.getTime())) return "";

  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];
  
  const day = dateObj.getDate();
  const month = months[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  
  let hours = dateObj.getHours();
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "مساءً" : "صباحاً";
  hours = hours % 12;
  hours = hours ? hours : 12;
  
  return `${day} ${month} ${year} - ${hours}:${minutes} ${ampm}`;
}

function renderLeaveStepperCard(l){
  const st = LEAVE_STATUS[l.status] || LEAVE_STATUS.submitted;
  const isHRRejected = l.status === "hr_rejected" || l.status === "exec_rejected";
  const isHRApproved = l.status === "hr_approved" || l.status === "approved";
  const isFinalApproved = l.status === "approved";

  const dateSub = formatTimelineDate(l.createdAt);
  const dateHr = (l.hrReview && l.hrReview.at) ? formatTimelineDate(l.hrReview.at) : "";
  const dateExec = (l.execReview && l.execReview.at) ? formatTimelineDate(l.execReview.at) : "";

  return `
    <div style="padding:14px;background:var(--bg-card);border-radius:var(--r-md);border:1px solid var(--line);margin-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span class="leave-ref">${esc(l.refNo)}</span>
        <span class="status-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>
      </div>

      <div class="stepper-wrap">
        <div class="stepper">
          <div class="step ${l.status !== 'submitted' ? 'completed' : 'active'}">
            <div class="step-ico"><i class="fa-solid fa-paper-plane"></i></div>
            <div class="step-txt">تم الإرسال</div>
            ${dateSub ? `<div class="step-date" style="font-size:8px;color:var(--ink-muted);margin-top:2px;font-weight:normal;line-height:1.2;">${esc(dateSub)}</div>` : ""}
          </div>
          <div class="step ${isHRRejected ? 'rejected' : (isHRApproved ? 'completed' : 'active')}">
            <div class="step-ico"><i class="fa-solid fa-users-gear"></i></div>
            <div class="step-txt">مراجعة الموارد</div>
            ${dateHr ? `<div class="step-date" style="font-size:8px;color:var(--ink-muted);margin-top:2px;font-weight:normal;line-height:1.2;">${esc(dateHr)}</div>` : ""}
          </div>
          <div class="step ${isHRRejected ? '' : (isFinalApproved ? 'completed' : (l.status === 'hr_approved' ? 'active' : ''))}">
            <div class="step-ico"><i class="fa-solid fa-user-check"></i></div>
            <div class="step-txt">اعتماد المدير</div>
            ${dateExec ? `<div class="step-date" style="font-size:8px;color:var(--ink-muted);margin-top:2px;font-weight:normal;line-height:1.2;">${esc(dateExec)}</div>` : ""}
          </div>
          <div class="step ${isFinalApproved ? 'completed' : ''}">
            <div class="step-ico"><i class="fa-solid fa-circle-check"></i></div>
            <div class="step-txt">معتمد نهائياً</div>
            ${(isFinalApproved && dateExec) ? `<div class="step-date" style="font-size:8px;color:var(--ink-muted);margin-top:2px;font-weight:normal;line-height:1.2;">${esc(dateExec)}</div>` : ""}
          </div>
        </div>
      </div>

      ${isHRRejected ? `<div style="color:var(--danger);font-size:12.5px;margin-top:8px;"><i class="fa-solid fa-circle-exclamation"></i> سبب الرفض: ${esc(l.rejectionReason || "لم يذكر سبب")}</div>` : ""}
    </div>
  `;
}

function getSoftLeaveStatusBadge(l) {
  if (isLeaveCurrentlyActive(l)) {
    return `<span class="status-badge" style="background:var(--gold-soft);color:#FFF"><i class="fa-solid fa-umbrella-beach"></i> إجازة قائمة</span>`;
  }
  if (l.status === "submitted" || l.status === "in_hr_review") {
    return `<span class="status-badge" style="background:rgba(184, 142, 54, 0.12);color:var(--gold-deep)"><i class="fa-solid fa-clock"></i> بانتظار الموارد البشرية</span>`;
  }
  if (l.status === "hr_approved") {
    return `<span class="status-badge" style="background:rgba(43, 94, 168, 0.12);color:var(--info)"><i class="fa-solid fa-user-clock"></i> بانتظار المدير التنفيذي</span>`;
  }
  if (l.status === "approved") {
    return `<span class="status-badge" style="background:var(--success-bg);color:var(--success)"><i class="fa-solid fa-circle-check"></i> معتمدة نهائياً</span>`;
  }
  if (l.status === "hr_rejected" || l.status === "exec_rejected") {
    return `<span class="status-badge" style="background:var(--danger-bg);color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> مرفوضة</span>`;
  }
  const st = LEAVE_STATUS[l.status] || LEAVE_STATUS.submitted;
  return `<span class="status-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>`;
}

function renderLeaveCard(l, mode){
  const typeLabel = LEAVE_TYPES[l.type]?.label || l.type;
  const isHRReviewPending = (mode === "hr") && (l.status === "submitted" || l.status === "in_hr_review");
  const isExecApprovalPending = (mode === "exec") && (l.status === "hr_approved");

  return `
    <div class="card" style="margin-bottom:20px;padding:24px">
      <!-- Top Row: Name, Job Title, Department, Ref Badge, Soft Status -->
      <div class="card-head" style="margin-bottom:16px">
        <div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span class="leave-ref" style="font-size:11.5px;padding:3px 10px;border-radius:var(--r-full);background:var(--bg-subtle);color:var(--ink-muted);font-weight:700">${esc(l.refNo)}</span>
            <h3 style="margin:0;font-size:17px;font-weight:800;color:var(--ink)">${esc(l.userName)}</h3>
          </div>
          <div style="font-size:13px;color:var(--ink-muted);margin-top:4px">${esc(l.userJobTitle || "موظف")}</div>
        </div>
        ${getSoftLeaveStatusBadge(l)}
      </div>

      <!-- Core Scan-Friendly Metadata Grid -->
      <div class="leave-meta-grid">
        <div class="leave-meta-item">
          <span class="leave-meta-label"><i class="fa-solid fa-tag" style="color:var(--gold-deep)"></i> نوع الإجازة</span>
          <span class="leave-meta-val">${esc(typeLabel)}</span>
        </div>
        <div class="leave-meta-item">
          <span class="leave-meta-label"><i class="fa-solid fa-hourglass-half" style="color:var(--gold-deep)"></i> المدة</span>
          <span class="leave-meta-val">${esc(l.daysCount)} يوم</span>
        </div>
        <div class="leave-meta-item">
          <span class="leave-meta-label"><i class="fa-regular fa-calendar" style="color:var(--gold-deep)"></i> تاريخ البداية</span>
          <span class="leave-meta-val">${esc(l.startDate)}</span>
        </div>
        <div class="leave-meta-item">
          <span class="leave-meta-label"><i class="fa-regular fa-calendar-check" style="color:var(--gold-deep)"></i> تاريخ النهاية</span>
          <span class="leave-meta-val">${esc(l.endDate)}</span>
        </div>
      </div>

      <!-- Reason & Notes Box -->
      <div style="font-size:13px;color:var(--ink-soft);background:var(--bg-subtle);padding:12px 16px;border-radius:var(--r-md);margin-bottom:14px;border:1px solid var(--line-soft)">
        <b>السبب والملاحظات:</b> ${esc(l.reason || "لا توجد")}
      </div>

      <!-- Workflow Timeline Stepper -->
      ${renderLeaveStepperCard(l)}

      <!-- Action Buttons for HR / Executive -->
      ${isHRReviewPending ? `
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;padding-top:16px;border-top:1px dashed var(--line-soft);flex-wrap:wrap">
          <button class="btn btn-danger-soft btn-capsule" data-hr-reject="${l.id}"><i class="fa-solid fa-xmark"></i> رفض الطلب</button>
          <button class="btn btn-primary btn-capsule" data-hr-approve="${l.id}"><i class="fa-solid fa-arrow-left"></i> موافقة وتحويل للمدير التنفيذي</button>
        </div>
      ` : ""}

      ${isExecApprovalPending ? `
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;padding-top:16px;border-top:1px dashed var(--line-soft);flex-wrap:wrap">
          <button class="btn btn-danger-soft btn-capsule" data-exec-reject="${l.id}"><i class="fa-solid fa-xmark"></i> رفض الطلب</button>
          <button class="btn btn-primary btn-capsule" data-exec-approve="${l.id}"><i class="fa-solid fa-certificate"></i> اعتماد الطلب نهائياً</button>
        </div>
      ` : ""}

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;padding-top:16px;border-top:1px dashed var(--line-soft);flex-wrap:wrap">
        <button class="btn btn-secondary btn-capsule btn-pdf-download" data-download-request-pdf="${l.id}" style="background:#8C6840;color:#fff;border:none"><i class="fa-solid fa-file-invoice"></i> تحميل نموذج الطلب</button>
        ${(l.status === "approved" && (mode === "hr" || mode === "exec")) ? `<button class="btn btn-secondary btn-capsule btn-pdf-download" data-download-pdf="${l.id}" style="background:#2d4a63;color:#fff;border:none"><i class="fa-solid fa-file-pdf" style="color:#ff8a80"></i> تحميل خطاب الاعتماد</button>` : ""}
      </div>
    </div>
  `;
}

function bindLeaveEvents(el){
  $$("[data-download-request-pdf]", el).forEach(b=>b.addEventListener("click", ()=>{
    const id = b.dataset.downloadRequestPdf;
    generateLeaveRequestPdf(id, b);
  }));
  $$("[data-hr-approve]", el).forEach(b=>b.addEventListener("click", async ()=>{
    const id = b.dataset.hrApprove;
    b.disabled = true;
    b.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ التحويل…`;
    try {
      await S.reviewLeaveHR(id, State.user, "approve", "موافقة الموارد البشرية وتحويل الطلب للمدير التنفيذي");
      const leaveObj = State.empLeaves.find(l => l.id === id);
      await S.pushNotification({
        userId: "dept:executive",
        type: "leave_submitted",
        title: "طلب إجازة بانتظار اعتمادك 📝",
        body: `تمت موافقة الموارد البشرية على طلب إجازة الموظف ${leaveObj ? leaveObj.userName : ""}`
      }).catch(()=>{});

      if (leaveObj) {
        await S.pushNotification({
          userId: leaveObj.userId,
          type: "leave_hr_appr",
          title: "موافقة مبدئية على طلب إجازتك 🎉",
          body: `تمت موافقة الموارد البشرية على طلب إجازتك رقم ${leaveObj.refNo} وتحويله للاعتماد النهائي`
        }).catch(()=>{});
      }
      showSuccessBadge("تمت الموافقة المبدئية", "تمت موافقة الموارد البشرية وتحويل الطلب للمدير التنفيذي بنجاح");
      await loadAllData();
      renderEmpLeavesHR(el);
    } catch(err) {
      toast("تعذّر تحويل طلب الإجازة", "err");
      b.disabled = false;
    }
  }));

  $$("[data-hr-reject]", el).forEach(b=>b.addEventListener("click", ()=>{
    const id = b.dataset.hrReject;
    openRejectLeaveModal(id);
  }));

  $$("[data-exec-approve]", el).forEach(b=>b.addEventListener("click", async ()=>{
    const id = b.dataset.execApprove;
    b.disabled = true;
    b.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الاعتماد…`;
    try {
      await S.approveLeaveExec(id, State.user, "تم الاعتماد النهائي للإجازة من قبل المدير التنفيذي");
      const leaveObj = State.execLeaves.find(l => l.id === id);
      if (leaveObj) {
        await S.pushNotification({
          userId: leaveObj.userId,
          type: "leave_exec_appr",
          title: "تم الاعتماد النهائي لإجازتك",
          body: `تم الاعتماد النهائي لطلب إجازتك رقم ${leaveObj.refNo}`
        }).catch(()=>{});
      }
      showSuccessBadge("تم الاعتماد النهائي", "تم اعتماد طلب الإجازة وإشعار الموظف بنجاح.");
      await loadAllData();
      renderExecLeavesApproval(el);
    } catch(err) {
      toast("تعذّر اعتماد الإجازة", "err");
      b.disabled = false;
    }
  }));

  $$("[data-exec-reject]", el).forEach(b=>b.addEventListener("click", ()=>{
    const id = b.dataset.execReject;
    openRejectLeaveExecModal(id);
  }));

  $$("[data-download-pdf]", el).forEach(b=>b.addEventListener("click", ()=>{
    const id = b.dataset.downloadPdf;
    generateLeavePdf(id, b);
  }));
}

function openRejectLeaveModal(leaveId){
  openModal(`
    <div class="modal-head">
      <h2>رفض طلب الإجازة</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="rejectLeaveForm">
      <div class="form-group" style="margin-bottom:16px">
        <label>سبب الرفض</label>
        <textarea id="rejReasonText" rows="3" required class="input" placeholder="اكتب سبب رفض طلب الإجازة للموظف..."></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-danger" id="rejSubBtn">تأكيد الرفض</button>
      </div>
    </form>
  `);

  $("#rejectLeaveForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const reason = $("#rejReasonText").value.trim();
    if(!reason) return;
    const btn = $("#rejSubBtn");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الرفض…`;
    try {
      await S.reviewLeaveHR(leaveId, State.user, "reject", reason);
      const leaveObj = State.empLeaves.find(l => l.id === leaveId);
      if (leaveObj) {
        await S.pushNotification({
          userId: leaveObj.userId,
          type: "leave_hr_rej",
          title: "تم رفض طلب الإجازة",
          body: `تم رفض طلب الإجازة رقم ${leaveObj.refNo}. السبب: ${reason}`
        }).catch(()=>{});
      }
      toast("تم رفض طلب الإجازة وتنبيه الموظف");
      closeModal();
      await loadAllData();
      renderEmpLeavesHR(document.querySelector("#viewHost"));
    } catch(err) {
      toast("تعذّر رفض الطلب", "err");
      btn.disabled = false;
    }
  });
}

function openRejectLeaveExecModal(leaveId){
  openModal(`
    <div class="modal-head">
      <h2>رفض طلب الإجازة (المدير التنفيذي)</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="rejectLeaveExecForm">
      <div class="form-group" style="margin-bottom:16px">
        <label>سبب الرفض النهائي</label>
        <textarea id="rejExecReasonText" rows="3" required class="input" placeholder="اكتب سبب الرفض النهائي لطلب الإجازة..."></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-danger" id="rejExecSubBtn">تأكيد الرفض النهائي</button>
      </div>
    </form>
  `);

  $("#rejectLeaveExecForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const reason = $("#rejExecReasonText").value.trim();
    if(!reason) return;
    const btn = $("#rejExecSubBtn");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الرفض…`;
    try {
      await S.rejectLeaveExec(leaveId, State.user, reason);
      const leaveObj = State.execLeaves.find(l => l.id === leaveId);
      if (leaveObj) {
        await S.pushNotification({
          userId: leaveObj.userId,
          type: "leave_exec_rej",
          title: "تم رفض طلب إجازتك نهائياً",
          body: `تم رفض طلب إجازتك رقم ${leaveObj.refNo}. السبب: ${reason}`
        }).catch(()=>{});
      }
      toast("تم رفض طلب الإجازة وتنبيه الموظف");
      closeModal();
      await loadAllData();
      renderExecLeavesApproval(document.querySelector("#viewHost"));
    } catch(err) {
      toast("تعذّر رفض الإجازة", "err");
      btn.disabled = false;
    }
  });
}

function openNewLeaveModal(){
  openModal(`
    <div class="modal-head">
      <h2>تقديم طلب إجازة جديد</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="newLeaveForm">
      <div class="form-group" style="margin-bottom:12px">
        <label>نوع الإجازة</label>
        <select id="lType" required class="input">
          ${Object.entries(LEAVE_TYPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join("")}
        </select>
      </div>
      <div class="form-grid two" style="margin-bottom:12px">
        <div class="form-group">
          <label>تاريخ البداية</label>
          <input type="date" id="lStart" required class="input">
        </div>
        <div class="form-group">
          <label>تاريخ النهاية</label>
          <input type="date" id="lEnd" required class="input">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>عدد الأيام</label>
        <input type="number" id="lDays" min="1" value="0" required class="input" readonly style="background: var(--bg-surface-variant, #f5f5f5); cursor: not-allowed;">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label>سبب الإجازة والملاحظات</label>
        <textarea id="lReason" rows="3" required class="input" placeholder="وضح أسباب الطلب..."></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-primary" id="lSubBtn"><i class="fa-solid fa-paper-plane"></i> إرسال الطلب</button>
      </div>
    </form>
  `);

  const startEl = $("#lStart");
  const endEl = $("#lEnd");
  const daysEl = $("#lDays");

  function updateDays() {
    const startVal = startEl.value;
    const endVal = endEl.value;
    if (!startVal || !endVal) {
      daysEl.value = "0";
      return;
    }
    const start = new Date(startVal);
    const end = new Date(endVal);
    if (end < start) {
      daysEl.value = "0";
      toast("تاريخ النهاية يجب أن يكون بعد تاريخ البداية أو يساويه", "err");
      return;
    }
    const diffTime = end - start;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    daysEl.value = diffDays;
  }

  startEl.addEventListener("change", updateDays);
  endEl.addEventListener("change", updateDays);

  $("#newLeaveForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const btn = $("#lSubBtn");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الإرسال…`;

    const startVal = startEl.value;
    const endVal = endEl.value;
    if (!startVal || !endVal) {
      toast("يرجى اختيار تاريخ البداية والنهاية", "err");
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> إرسال الطلب`;
      return;
    }

    const start = new Date(startVal);
    const end = new Date(endVal);
    if (end < start) {
      toast("تاريخ النهاية يجب أن يكون بعد تاريخ البداية أو يساويه", "err");
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> إرسال الطلب`;
      return;
    }

    const calculatedDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

    try{
      const res = await S.createLeaveRequest({
        userId: State.user.uid,
        userName: State.user.name,
        userJobTitle: State.user.jobTitle || "موظف",
        type: $("#lType").value,
        startDate: startVal,
        endDate: endVal,
        daysCount: calculatedDays,
        reason: $("#lReason").value.trim()
      });

      await S.pushNotification({
        userId: `dept:hr`,
        type: "leave_submitted",
        title: "طلب إجازة جديد",
        body: `قام الموظف ${State.user.name} بتقديم طلب إجازة جديد برقم ${res.refNo}`
      });

      showSuccessAnimation("تم تقديم طلب الإجازة بنجاح", `رقم المرجعي للطلب: ${res.refNo}`, async () => {
        await loadAllData();
        navigate("leaves");
      });
    }catch(err){
      toast("تعذّر تقديم طلب الإجازة", "err");
      btn.disabled = false;
    }
  });
}

/* ════════════════ 4. دليل الموظفين والمسؤول التقني (Members) ════════════════ */
/* ════════════════ 4. دليل الموظفين والمسؤول التقني (Members Redesign) ════════════════ */
function openEmployeeProfileModal(emp) {
  if (!emp) return;

  const isSelf = emp.uid === State.user.uid;
  const isStatusActive = emp.status !== "disabled";
  const roleLabel = ROLES[emp.role]?.label || emp.role;
  const activeLeave = getUserActiveLeave(emp.uid);

  let leaveBadgeHtml = "";
  if (activeLeave) {
    const typeLabel = LEAVE_TYPES[activeLeave.type]?.label || activeLeave.type;
    const returnsText = getDaysUntilReturn(activeLeave.endDate);
    leaveBadgeHtml = `
      <div style="background: rgba(217,119,6,0.08); color: rgb(217,119,6); border: 1px solid rgba(217,119,6,0.25); font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 999px; display: inline-flex; align-items: center; gap: 6px; margin-top: 6px;">
        <i class="fa-solid fa-umbrella-beach"></i> في إجازة حالياً (${esc(typeLabel)} · العودة: ${esc(returnsText)})
      </div>
    `;
  }

  const existing = $("#empProfileModalOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "empProfileModalOverlay";
  overlay.className = "emp-profile-modal-overlay";

  overlay.innerHTML = `
    <div class="emp-profile-modal-card" style="background: #FFFFFF; border: 1px solid rgba(184, 142, 54, 0.3); border-radius: 20px; width: 100%; max-width: 580px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.18); position: relative; transform: scale(0.96) translateY(10px); transition: transform 0.25s ease; direction: rtl;">
      
      <!-- Modal Header Banner -->
      <div style="background: linear-gradient(135deg, #FAF7F2 0%, #F4ECDC 100%); padding: 28px 24px 20px 24px; border-bottom: 1.5px solid rgba(184, 142, 54, 0.25); text-align: center; position: relative; border-radius: 20px 20px 0 0;">
        <button id="closeEmpProfileModalBtn" style="position: absolute; top: 16px; left: 16px; background: rgba(255,255,255,0.85); border: 1px solid rgba(184,142,54,0.3); border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; color: #1F1A15; cursor: pointer; font-size: 14px; transition: all 0.2s;" title="إغلاق (Esc)">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <!-- Avatar -->
        <div style="width: 86px; height: 86px; border-radius: 50%; background: #F4ECDC; border: 3px solid #947124; overflow: hidden; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px auto; box-shadow: 0 6px 16px rgba(148, 113, 36, 0.2);">
          ${emp.avatar ? `<img src="${esc(emp.avatar)}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size: 30px; font-weight: 800; color: #947124;">${esc(initials(emp.name))}</span>`}
        </div>

        <h2 style="font-size: 20px; font-weight: 800; color: #1F1A15; margin: 0 0 8px 0;">${esc(emp.name)}</h2>

        <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; align-items: center; margin-bottom: 4px;">
          <span style="background: #F4ECDC; color: #947124; border: 1px solid rgba(184, 142, 54, 0.35); font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 999px;">
            <i class="fa-solid fa-briefcase"></i> ${esc(emp.jobTitle || "موظف")}
          </span>
          <span style="background: ${isStatusActive ? 'rgba(31, 122, 76, 0.08)' : 'rgba(168, 42, 42, 0.08)'}; color: ${isStatusActive ? '#1F7A4C' : '#A82A2A'}; border: 1px solid ${isStatusActive ? 'rgba(31, 122, 76, 0.25)' : 'rgba(168, 42, 42, 0.25)'}; font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 999px;">
            <i class="fa-solid ${isStatusActive ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${isStatusActive ? 'حساب نشط' : 'حساب معطل'}
          </span>
          ${isTechAdmin(emp) ? `<span style="background: rgba(30,64,175,0.08); color: #1E40AF; border: 1px solid rgba(30,64,175,0.25); font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 999px;"><i class="fa-solid fa-shield-halved"></i> مسئول تقني</span>` : ''}
        </div>

        ${leaveBadgeHtml}
      </div>

      <!-- Modal Body -->
      <div style="padding: 24px;">
        
        <!-- Contact Section -->
        <div style="margin-bottom: 20px;">
          <div style="font-size: 13px; font-weight: 800; color: #947124; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-address-card"></i> معلومات الاتصال والتنظيم
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
            <div style="background: #FAF7F2; border: 1px solid rgba(184, 142, 54, 0.2); border-radius: 10px; padding: 12px 14px;">
              <div style="font-size: 11px; color: #574E45; margin-bottom: 3px; font-weight: 600;">البريد الإلكتروني</div>
              <div style="font-size: 13px; font-weight: 700; color: #1F1A15; word-break: break-all; display: flex; align-items: center; justify-content: space-between;">
                <span>${esc(emp.email)}</span>
                <button class="btn-icon" id="copyEmpEmailBtn" title="نسخ البريد" style="background:none;border:none;color:#947124;cursor:pointer;padding:2px 6px;">
                  <i class="fa-regular fa-copy"></i>
                </button>
              </div>
            </div>
            <div style="background: #FAF7F2; border: 1px solid rgba(184, 142, 54, 0.2); border-radius: 10px; padding: 12px 14px;">
              <div style="font-size: 11px; color: #574E45; margin-bottom: 3px; font-weight: 600;">رقم الجوال</div>
              <div style="font-size: 13.5px; font-weight: 700; color: #1F1A15;">${esc(emp.phone || "غير محدد")}</div>
            </div>
            <div style="background: #FAF7F2; border: 1px solid rgba(184, 142, 54, 0.2); border-radius: 10px; padding: 12px 14px;">
              <div style="font-size: 11px; color: #574E45; margin-bottom: 3px; font-weight: 600;">القسم / الإدارة</div>
              <div style="font-size: 13.5px; font-weight: 700; color: #1F1A15;">${esc(emp.department || "جمعية إرث وحضارة")}</div>
            </div>
          </div>
        </div>

        <!-- Bio Section -->
        ${emp.bio ? `
          <div style="margin-bottom: 20px;">
            <div style="font-size: 13px; font-weight: 800; color: #947124; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-user-pen"></i> النبذة المختصرة
            </div>
            <div style="background: #FAF7F2; border: 1px solid rgba(184, 142, 54, 0.2); border-radius: 10px; padding: 14px; font-size: 13.5px; color: #1F1A15; line-height: 1.7;">
              ${esc(emp.bio)}
            </div>
          </div>
        ` : ''}

        <!-- CV Section -->
        <div style="margin-bottom: 20px;">
          <div style="font-size: 13px; font-weight: 800; color: #947124; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-file-pdf"></i> السيرة الذاتية (SharePoint)
          </div>
          ${emp.cv ? `
            <div style="display: flex; align-items: center; justify-content: space-between; background: #FAF7F2; border: 1px solid rgba(184, 142, 54, 0.25); border-radius: 10px; padding: 12px 16px; flex-wrap: wrap; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fa-solid fa-file-pdf" style="font-size: 24px; color: #A82A2A;"></i>
                <div>
                  <div style="font-size: 13.5px; font-weight: 700; color: #1F1A15;">${esc(emp.cv.name || "السيرة الذاتية")}</div>
                  <div style="font-size: 11px; color: #574E45;">مستند SharePoint رسمي</div>
                </div>
              </div>
              <a href="${esc(S.getCvPreviewUrl(emp.cv))}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="padding: 7px 14px; font-size: 12.5px; font-weight: 700; text-decoration: none;">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> فتح السيرة الذاتية
              </a>
            </div>
          ` : `
            <div style="background: #FAF7F2; border: 1px dashed rgba(184, 142, 54, 0.3); border-radius: 10px; padding: 14px; text-align: center; color: #857A6E; font-size: 12.5px;">
              لم يتم رفع سيرة ذاتية لهذا الموظف بعد
            </div>
          `}
        </div>

        <!-- Action Footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(31, 26, 21, 0.08);">
          ${(isSelf || isTechAdmin()) ? `
            <button class="btn btn-secondary" id="goToFullProfileBtn" style="font-size: 12.5px; font-weight: 700; color: #947124; background: #FAF7F2; border-color: rgba(184,142,54,0.3);">
              <i class="fa-solid fa-gear"></i> إدارة الملف الشخصي الكامل
            </button>
          ` : '<div></div>'}
          <button class="btn btn-secondary" id="closeModalBottomBtn" style="font-size: 12.5px; font-weight: 700;">
            إغلاق
          </button>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    const card = overlay.querySelector(".emp-profile-modal-card");
    if (card) card.style.transform = "scale(1) translateY(0)";
  });

  const closeModal = () => {
    overlay.style.opacity = "0";
    const card = overlay.querySelector(".emp-profile-modal-card");
    if (card) card.style.transform = "scale(0.96) translateY(10px)";
    setTimeout(() => {
      overlay.remove();
      document.removeEventListener("keydown", onEsc);
    }, 250);
  };

  const onEsc = (e) => {
    if (e.key === "Escape") closeModal();
  };

  document.addEventListener("keydown", onEsc);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  const closeBtn = $("#closeEmpProfileModalBtn", overlay);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  const closeBottomBtn = $("#closeModalBottomBtn", overlay);
  if (closeBottomBtn) closeBottomBtn.addEventListener("click", closeModal);

  const copyEmailBtn = $("#copyEmpEmailBtn", overlay);
  if (copyEmailBtn) {
    copyEmailBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(emp.email);
      toast("تم نسخ البريد الإلكتروني");
    });
  }

  const fullProfileBtn = $("#goToFullProfileBtn", overlay);
  if (fullProfileBtn) {
    fullProfileBtn.addEventListener("click", () => {
      closeModal();
      State.selectedEmp = emp;
      State.profileTab = "info";
      navigate("profile");
    });
  }
}

function renderMembers(el){
  const u = State.user;
  const canAdmin = isTechAdmin(u);

  if(!State.empDeptFilter) State.empDeptFilter = "all";
  if(!State.empRoleFilter) State.empRoleFilter = "all";
  if(!State.empStatusFilter) State.empStatusFilter = "all";
  if(!State.empLeaveFilter) State.empLeaveFilter = "all";

  el.innerHTML = `
    <!-- Header Hero banner -->
    <div style="background: linear-gradient(135deg, #FAF7F2 0%, #F4ECDC 100%); border: 1px solid rgba(184, 142, 54, 0.25); border-radius: 16px; padding: 26px 28px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; position: relative; overflow: hidden;">
      <div style="position: absolute; left: -20px; bottom: -20px; font-size: 140px; color: rgba(184, 142, 54, 0.04); pointer-events: none;"><i class="fa-solid fa-users"></i></div>
      <div style="position: relative; z-index: 1;">
        <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; color: #947124; letter-spacing: 0.5px; margin-bottom: 6px;">
          <i class="fa-solid fa-users-gear"></i> دليل فريق العمل
        </div>
        <h1 style="font-size: 22px; font-weight: 800; color: #1F1A15; margin: 0 0 6px 0;">دليل الموظفين</h1>
        <p style="font-size: 13.5px; color: #574E45; margin: 0;">تعرف على فريق جمعية إرث وحضارة بالقريات للتواصل الإداري والتنظيم</p>
      </div>
      ${canAdmin ? `<button class="btn btn-primary" id="addEmpBtn" style="position: relative; z-index: 1; padding: 10px 20px; font-weight: 700;"><i class="fa-solid fa-user-plus"></i> إضافة موظف جديد</button>` : ""}
    </div>

    <!-- شريط التحكم والفلترة -->
    <div style="background: #FFFFFF; border: 1px solid rgba(184, 142, 54, 0.2); border-radius: 14px; padding: 14px 18px; margin-bottom: 24px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
      <div style="flex: 1; min-width: 240px; position: relative;">
        <i class="fa-solid fa-magnifying-glass" style="position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: #947124; font-size: 14px;"></i>
        <input id="empSearchInput" class="input" style="padding-right: 40px; border-radius: 8px; border-color: rgba(184, 142, 54, 0.25); background: #FAF7F2; font-size: 13.5px;" placeholder="🔍 البحث عن موظف بالاسم، المسمى الوظيفي، أو البريد…" value="${esc(State.userSearchQuery)}">
      </div>

      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <select id="empRoleFilter" class="input" style="padding: 8px 12px; font-size: 12.5px; border-radius: 8px; background: #FAF7F2; border-color: rgba(184, 142, 54, 0.25);">
          <option value="all">جميع الصلاحيات</option>
          <option value="executive" ${State.empRoleFilter==='executive'?'selected':''}>مدير تنفيذي</option>
          <option value="hr" ${State.empRoleFilter==='hr'?'selected':''}>موارد بشرية</option>
          <option value="employee" ${State.empRoleFilter==='employee'?'selected':''}>موظف</option>
        </select>

        <select id="empStatusFilter" class="input" style="padding: 8px 12px; font-size: 12.5px; border-radius: 8px; background: #FAF7F2; border-color: rgba(184, 142, 54, 0.25);">
          <option value="all">جميع الحالات</option>
          <option value="active" ${State.empStatusFilter==='active'?'selected':''}>حسابات نشطة</option>
          <option value="disabled" ${State.empStatusFilter==='disabled'?'selected':''}>حسابات معطلة</option>
        </select>

        <select id="empLeaveFilter" class="input" style="padding: 8px 12px; font-size: 12.5px; border-radius: 8px; background: #FAF7F2; border-color: rgba(184, 142, 54, 0.25);">
          <option value="all" ${State.empLeaveFilter==='all'?'selected':''}>حالة الحضور (الكل)</option>
          <option value="on_leave" ${State.empLeaveFilter==='on_leave'?'selected':''}>في إجازة حالياً 🌴</option>
          <option value="active_work" ${State.empLeaveFilter==='active_work'?'selected':''}>على رأس العمل 💼</option>
        </select>
      </div>
    </div>

    <!-- شبكة بطاقات الموظفين -->
    <div class="emp-grid" id="empGridArea"></div>
  `;

  renderEmpGrid();

  $("#empSearchInput").addEventListener("input", (e)=>{
    State.userSearchQuery = e.target.value.trim().toLowerCase();
    renderEmpGrid();
  });
  $("#empRoleFilter").addEventListener("change", (e)=>{
    State.empRoleFilter = e.target.value;
    renderEmpGrid();
  });
  $("#empStatusFilter").addEventListener("change", (e)=>{
    State.empStatusFilter = e.target.value;
    renderEmpGrid();
  });
  $("#empLeaveFilter").addEventListener("change", (e)=>{
    State.empLeaveFilter = e.target.value;
    renderEmpGrid();
  });

  if(canAdmin && $("#addEmpBtn")){
    $("#addEmpBtn").addEventListener("click", openCreateUserModalTechAdmin);
  }
}

function renderEmpGrid(){
  const area = $("#empGridArea");
  if(!area) return;

  const q = State.userSearchQuery || "";
  const roleF = State.empRoleFilter || "all";
  const statusF = State.empStatusFilter || "all";
  const leaveF = State.empLeaveFilter || "all";

  const list = State.users.filter(u => {
    const matchesQ = !q || (u.name||"").toLowerCase().includes(q) || (u.jobTitle||"").toLowerCase().includes(q) || (u.email||"").toLowerCase().includes(q);
    const matchesRole = roleF === "all" || u.role === roleF;
    const matchesStatus = statusF === "all" || (statusF === "active" && u.status !== "disabled") || (statusF === "disabled" && u.status === "disabled");
    
    const hasActiveLeave = !!getUserActiveLeave(u.uid);
    const matchesLeave = leaveF === "all" || 
                         (leaveF === "on_leave" && hasActiveLeave) || 
                         (leaveF === "active_work" && !hasActiveLeave);

    return matchesQ && matchesRole && matchesStatus && matchesLeave;
  });

  if(!list.length){
    area.innerHTML = emptyState("لا يوجد موظفون ينطبق عليهم البحث والفلترة");
    return;
  }

  area.innerHTML = list.map(emp => {
    const roleLabel = ROLES[emp.role]?.label || emp.role;
    const isDisabled = emp.status === "disabled";
    
    const activeLeave = getUserActiveLeave(emp.uid);
    let leaveBadgeHtml = "";
    if (activeLeave) {
      const typeLabel = LEAVE_TYPES[activeLeave.type]?.label || activeLeave.type;
      const returnsText = getDaysUntilReturn(activeLeave.endDate);
      leaveBadgeHtml = `
        <span style="background:rgba(217,119,6,0.08);color:rgb(217,119,6);border:1px solid rgba(217,119,6,0.25);font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;" title="${esc(typeLabel)} · العودة: ${esc(returnsText)}">
          <i class="fa-solid fa-umbrella-beach"></i> إجازة
        </span>
      `;
    }

    return `
      <div class="emp-card" data-card-emp="${emp.uid}">
        <div style="position: absolute; top: 12px; right: 12px; display: flex; gap: 4px; align-items: center;">
          ${isDisabled ? `<span style="background:rgba(168,42,42,0.08);color:#A82A2A;border:1px solid rgba(168,42,42,0.2);font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;">معطل</span>` : ''}
          ${leaveBadgeHtml}
        </div>

        ${isTechAdmin() ? `
          <button class="btn-icon" data-admin-edit="${emp.uid}" title="إدارة الحساب" style="position: absolute; top: 12px; left: 12px; background: #FAF7F2; border: 1px solid rgba(184, 142, 54, 0.2); border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; color: #947124; cursor: pointer; z-index: 2;">
            <i class="fa-solid fa-gear" style="font-size: 11px;"></i>
          </button>
        ` : ''}

        <div class="emp-avatar-lg">
          ${emp.avatar ? `<img src="${esc(emp.avatar)}">` : esc(initials(emp.name))}
        </div>

        <div class="emp-name" style="font-size:15.5px;font-weight:800;color:#1F1A15;margin-bottom:4px">${esc(emp.name)}</div>
        
        <div style="background: #F4ECDC; color: #947124; border: 1px solid rgba(184, 142, 54, 0.3); font-size: 11.5px; font-weight: 700; padding: 3px 12px; border-radius: 999px; display: inline-flex; align-items: center; gap: 5px; margin-bottom: 8px;">
          <i class="fa-solid fa-briefcase" style="font-size: 10px;"></i> ${esc(emp.jobTitle || "موظف")}
        </div>

        <div style="font-size: 11.5px; color: #574E45; margin-bottom: 14px; font-weight: 600;">
          <i class="fa-solid fa-building" style="color: #947124; margin-left: 3px;"></i> ${esc(emp.department || "جمعية إرث وحضارة")}
        </div>

        <div class="emp-actions" style="margin-top:auto;width:100%">
          <button class="btn btn-secondary" style="width:100%;border-radius:8px;font-weight:700;font-size:12.5px;color:#947124;background:#FAF7F2;border-color:rgba(184,142,54,0.25)" data-view-emp="${emp.uid}">
            عرض الملف الشخصي <i class="fa-solid fa-arrow-left" style="margin-right: 4px; font-size: 11px;"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");

  $$("[data-card-emp]", area).forEach(card => {
    card.addEventListener("click", (e)=>{
      if (e.target.closest("[data-admin-edit]")) return;
      const empUid = card.dataset.cardEmp;
      const emp = State.users.find(x => x.uid === empUid);
      if (emp) openEmployeeProfileModal(emp);
    });
  });

  if(isTechAdmin()){
    $$("[data-admin-edit]", area).forEach(btn => {
      btn.addEventListener("click", (e)=>{
        e.stopPropagation();
        const emp = State.users.find(x => x.uid === btn.dataset.adminEdit);
        if(emp) openEditUserTechAdminModal(emp);
      });
    });
  }
}

function openCreateUserModalTechAdmin(){
  openModal(`
    <div class="modal-head">
      <h2>إنشاء / ربط مستند موظف جديد (المسؤول التقني)</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="createEmpForm">
      <div class="form-group" style="margin-bottom:12px">
        <label>الاسم الكامل</label>
        <input type="text" id="neName" required class="input">
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>البريد الإلكتروني</label>
        <input type="email" id="neEmail" required class="input">
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>Firebase Auth UID (مُعرّف حساب المصادقة)</label>
        <input type="text" id="neUid" class="input" placeholder="أدخل الـ UID الخاص بالمستخدم في Firebase Auth لتأسيس المستند">
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>المسمى الوظيفي</label>
        <input type="text" id="neTitle" required class="input" placeholder="مثال: أخصائي موارد بشرية">
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>الصلاحية والنظام</label>
        <select id="neRole" class="input">
          <option value="employee">موظف</option>
          <option value="hr">موارد بشرية</option>
          <option value="executive">مدير تنفيذي</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label>
          <input type="checkbox" id="neTechAdmin"> منح صلاحيات المسؤول التقني (تحديد وإدارة الحسابات)
        </label>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-primary" id="neBtn"><i class="fa-solid fa-user-plus"></i> حفظ وإنشاء المستند</button>
      </div>
    </form>
  `);

  $("#createEmpForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const btn = $("#neBtn");
    const uid = $("#neUid").value.trim();
    if(!uid){
      toast("يرجى إدخال الـ UID الخاص بحساب المستخدم في Firebase Auth (يمكن الحصول عليه من لوحة Firebase أو أداة seed.html)", "err");
      return;
    }
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الإنشاء…`;

    try{
      await S.createEmployeeAccountTechAdmin({
        uid,
        name: $("#neName").value.trim(),
        email: $("#neEmail").value.trim(),
        jobTitle: $("#neTitle").value.trim(),
        role: $("#neRole").value,
        isTechAdmin: $("#neTechAdmin").checked
      });

      await showActionSuccess({
        title: "تم إنشاء حساب الموظف",
        message: "تم تسجيل وتثبيت مستند الموظف في البوابة بنجاح."
      });
      await loadAllData();
      navigate("members");
    }catch(err){
      toast("تعذّر إنشاء الحساب: " + (err.message || err), "err");
      btn.disabled = false;
    }
  });
}

function openEditUserTechAdminModal(emp){
  openModal(`
    <div class="modal-head">
      <h2>إدارة حساب: ${esc(emp.name)}</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="editEmpTechForm">
      <div class="form-group" style="margin-bottom:12px">
        <label>الصلاحية الحالية</label>
        <select id="edRole" class="input">
          <option value="employee" ${emp.role==='employee'?'selected':''}>موظف</option>
          <option value="hr" ${emp.role==='hr'?'selected':''}>موارد بشرية</option>
          <option value="executive" ${emp.role==='executive'?'selected':''}>مدير تنفيذي</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>حالة الحساب</label>
        <select id="edStatus" class="input">
          <option value="active" ${emp.status!=='disabled'?'selected':''}>نشط</option>
          <option value="disabled" ${emp.status==='disabled'?'selected':''}>معطل</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label>
          <input type="checkbox" id="edTechAdmin" ${emp.isTechAdmin?'checked':''}> منح صلاحيات المسؤول التقني
        </label>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-primary"><i class="fa-solid fa-check"></i> حفظ التغييرات</button>
      </div>
    </form>
  `);

  $("#editEmpTechForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    await S.updateEmployeeAccountTechAdmin(emp.uid, {
      role: $("#edRole").value,
      status: $("#edStatus").value,
      isTechAdmin: $("#edTechAdmin").checked
    });
    toast("تم تحديث صلاحيات الحساب بنجاح");
    closeModal();
    await loadAllData();
    navigate("members");
  });
}

/* ════════════════ 5. المهام (Tasks) ════════════════ */
const OFFICIAL_TASK_STATUS = {
  pending:     { label: "لم تبدأ", color: "#6c757d", bg: "rgba(108,117,125,.10)" },
  not_started: { label: "لم تبدأ", color: "#6c757d", bg: "rgba(108,117,125,.10)" },
  completed:   { label: "مكتملة",  color: "#3a5e2e", bg: "rgba(58,94,46,.08)" },
  rejected:    { label: "مرفوضة",  color: "#7a2518", bg: "rgba(122,37,24,.10)" }
};

function renderTasks(el){
  if(!el) el = $("#viewHost");
  const u = State.user;
  const isAd = isExec(u);

  // تهيئة متغيرات الفلترة في حال عدم وجودها
  if(State.taskFilterStatus === undefined) State.taskFilterStatus = "all";
  if(State.taskFilterEmployee === undefined) State.taskFilterEmployee = "all";

  let list = [...State.tasks];

  // تصفية حسب الحالة
  if(State.taskFilterStatus !== "all"){
    list = list.filter(t => t.status === State.taskFilterStatus);
  }

  // تصفية حسب الموظف للمدير
  if(isAd && State.taskFilterEmployee !== "all"){
    list = list.filter(t => t.employeeId === State.taskFilterEmployee);
  }

  if(isAd){
    // واجهة المدير التنفيذي
    el.innerHTML = `
      ${pageHead("Tasks", "المهام", "إدارة وتتبع", "المهام", "إصدار المهام الرسمية للموظفين ومتابعة حالة تنفيذها ومرفقاتها.")}

      <div class="toolbar" style="margin-bottom:24px;gap:12px;display:flex;align-items:center;flex-wrap:wrap">
        <!-- تصفية الحالات -->
        <div class="form-group" style="min-width:140px">
          <label style="font-size:11px;font-weight:700;color:var(--ink-muted);display:block;margin-bottom:4px">حالة المهمة</label>
          <select class="input" id="taskFilterStatus" style="padding:6px 12px;font-size:12.5px;border-radius:var(--r-sm)">
            <option value="all" ${State.taskFilterStatus === "all" ? "selected" : ""}>الكل (${State.tasks.length})</option>
            <option value="pending" ${State.taskFilterStatus === "pending" ? "selected" : ""}>لم تبدأ</option>
            <option value="completed" ${State.taskFilterStatus === "completed" ? "selected" : ""}>مكتملة</option>
          </select>
        </div>

        <!-- تصفية الموظفين -->
        <div class="form-group" style="min-width:160px">
          <label style="font-size:11px;font-weight:700;color:var(--ink-muted);display:block;margin-bottom:4px">الموظف المستلم</label>
          <select class="input" id="taskFilterEmployee" style="padding:6px 12px;font-size:12.5px;border-radius:var(--r-sm)">
            <option value="all" ${State.taskFilterEmployee === "all" ? "selected" : ""}>جميع الموظفين</option>
            ${State.users.filter(usr => usr.uid !== u.uid).map(usr => `
              <option value="${usr.uid}" ${State.taskFilterEmployee === usr.uid ? "selected" : ""}>${esc(usr.name)}</option>
            `).join("")}
          </select>
        </div>

        <div class="spacer"></div>
        <button class="btn btn-primary" id="newTaskBtn" style="border-radius:var(--r-sm);padding:8px 16px"><i class="fa-solid fa-plus"></i> مهمة رسمية جديدة</button>
      </div>

      <div id="tasksArea">
        ${renderAdminTasksList(list)}
      </div>
    `;

    $("#taskFilterStatus").addEventListener("change", (e)=>{
      State.taskFilterStatus = e.target.value;
      renderTasks(el);
    });

    $("#taskFilterEmployee").addEventListener("change", (e)=>{
      State.taskFilterEmployee = e.target.value;
      renderTasks(el);
    });

    $("#newTaskBtn").addEventListener("click", openNewTaskModal);
  } else {
    // واجهة الموظف المستلم
    el.innerHTML = `
      ${pageHead("Tasks", "المهام", "المهام", "المسندة إليك", "تتبع واستجابة للمهام الإدارية الرسمية المسندة إليك من الإدارة التنفيذية.")}

      <div class="toolbar" style="margin-bottom:24px;gap:12px;display:flex;align-items:center;flex-wrap:wrap">
        <div class="form-group" style="min-width:140px">
          <label style="font-size:11px;font-weight:700;color:var(--ink-muted);display:block;margin-bottom:4px">تصفية حسب الحالة</label>
          <select class="input" id="taskFilterStatus" style="padding:6px 12px;font-size:12.5px;border-radius:var(--r-sm)">
            <option value="all" ${State.taskFilterStatus === "all" ? "selected" : ""}>الكل (${State.tasks.length})</option>
            <option value="pending" ${State.taskFilterStatus === "pending" ? "selected" : ""}>لم تبدأ</option>
            <option value="completed" ${State.taskFilterStatus === "completed" ? "selected" : ""}>مكتملة</option>
          </select>
        </div>
      </div>

      <div id="tasksArea">
        ${renderEmployeeTasksList(list)}
      </div>
    `;

    $("#taskFilterStatus").addEventListener("change", (e)=>{
      State.taskFilterStatus = e.target.value;
      renderTasks(el);
    });
  }

  // مستمع نقر البطاقات لفتح تفاصيل المهمة الفردية
  $$("[data-task-detail-id]", el).forEach(card => {
    card.addEventListener("click", () => {
      openTaskDetailModal(card.dataset.taskDetailId);
    });
  });

  // مستمع نقر بطاقات المهام الجماعية للمدير التنفيذي
  $$("[data-group-task-id]", el).forEach(card => {
    card.addEventListener("click", () => {
      openGroupTaskDetailModal(card.dataset.groupTaskId);
    });
  });

  // مستمع نقر بطاقات المهام الجماعية للموظف
  $$("[data-group-emp-task-id]", el).forEach(card => {
    card.addEventListener("click", () => {
      openEmployeeGroupTaskModal(card.dataset.groupEmpTaskId);
    });
  });
}

function renderAdminTasksList(list) {
  if(!list.length){
    return `<div class="card" style="text-align:center;padding:48px 24px">
      <div style="font-size:32px;margin-bottom:12px">📋</div>
      <h3 style="font-size:17px;font-weight:700;color:var(--ink);margin-bottom:6px">لا توجد مهام حالياً</h3>
      <p style="font-size:13px;color:var(--ink-muted)">قم بإنشاء مهمة جديدة لإسنادها وتتبع تنفيذها.</p>
    </div>`;
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:16px">
      ${list.map(t => {
        const pr = TASK_PRIORITY[t.priority] || TASK_PRIORITY.medium;
        const st = OFFICIAL_TASK_STATUS[t.status] || OFFICIAL_TASK_STATUS.pending;
        const isGroup = t.isGroup === true;

        if(isGroup){
          return `
            <div class="card note-task-card" data-group-task-id="${t.id}" style="border:1px solid rgba(192,154,98,0.3);background:linear-gradient(180deg, var(--bg-paper) 0%, rgba(192,154,98,0.03) 100%);cursor:pointer">
              <div class="ntc-head">
                <h4 class="ntc-title" style="display:flex;align-items:center;gap:6px">
                  <i class="fa-solid fa-users" style="color:var(--gold-deep)"></i> ${esc(t.title)}
                </h4>
                <span class="prio-badge" style="color:${pr.color};background:${pr.color}15;border-color:transparent;font-size:10px;padding:2px 6px;">
                  <i class="fa-solid fa-flag"></i> ${pr.label}
                </span>
              </div>
              <p class="ntc-desc" style="margin-bottom:12px">${t.description ? esc(t.description) : "بدون وصف تفصيلي"}</p>
              
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:12px;color:var(--ink-soft);flex-wrap:wrap;gap:6px">
                <span><strong>المستلمون:</strong> جميع الموظفين</span>
                <span class="badge" style="background:rgba(192,154,98,0.15);color:var(--gold-deep);border:1px solid rgba(192,154,98,0.3);font-size:11px;padding:3px 8px;border-radius:var(--r-full);font-weight:700;">
                  <i class="fa-solid fa-layer-group"></i> مهمة جماعية · ${t.targetCount || "عدة"} موظفين
                </span>
              </div>

              <div class="ntc-meta" style="padding-top:10px;border-top:1px dashed rgba(192,154,98,0.2)">
                <div class="ntc-meta-item">
                  <i class="fa-regular fa-calendar-check" style="color:var(--gold-deep)"></i>
                  <span>${t.dueDate ? fmtDate(t.dueDate) : "بدون موعد"}</span>
                </div>
                <div class="ntc-meta-item">
                  <i class="fa-solid fa-paperclip" style="color:${t.attachmentRequired ? 'var(--danger)' : 'var(--ink-faint)'}"></i>
                  <span>${t.attachmentRequired ? 'مرفق إلزامي' : 'مرفق اختياري'}</span>
                </div>
                ${t.adminAttachmentUrl ? `
                  <div class="ntc-meta-item" style="color:var(--gold-deep)">
                    <i class="fa-solid fa-paperclip"></i>
                    <span>مرفق من المدير</span>
                  </div>
                ` : ""}
              </div>
            </div>
          `;
        }

        return `
          <div class="card note-task-card" data-task-detail-id="${t.id}" style="cursor:pointer">
            <div class="ntc-head">
              <h4 class="ntc-title">${esc(t.title)}</h4>
              <span class="prio-badge" style="color:${pr.color};background:${pr.color}15;border-color:transparent;font-size:10px;padding:2px 6px;">
                <i class="fa-solid fa-flag"></i> ${pr.label}
              </span>
            </div>
            <p class="ntc-desc" style="margin-bottom:12px">${t.description ? esc(t.description) : "بدون وصف تفصيلي"}</p>
            
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:12px;color:var(--ink-soft)">
              <span><strong>المستلم:</strong> ${esc(t.employeeName)}</span>
              <span class="status-badge" style="color:${st.color};background:${st.bg};border-color:transparent;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:var(--r-full);">
                <i class="fa-solid fa-circle-info"></i> ${st.label}
              </span>
            </div>

            <div class="ntc-meta" style="padding-top:10px;border-top:1px dashed var(--line-soft)">
              <div class="ntc-meta-item">
                <i class="fa-regular fa-calendar-check" style="color:var(--gold-deep)"></i>
                <span>${t.dueDate ? fmtDate(t.dueDate) : "بدون موعد"}</span>
              </div>
              <div class="ntc-meta-item">
                <i class="fa-solid fa-paperclip" style="color:${t.attachmentRequired ? 'var(--danger)' : 'var(--ink-faint)'}"></i>
                <span>${t.attachmentRequired ? 'مرفق إلزامي' : 'مرفق اختياري'}</span>
              </div>
              ${t.adminAttachmentUrl ? `
                <div class="ntc-meta-item" style="color:var(--gold-deep)">
                  <i class="fa-solid fa-paperclip"></i>
                  <span>مرفق من المدير</span>
                </div>
              ` : ""}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderEmployeeTasksList(list) {
  if(!list.length){
    return `<div class="card" style="text-align:center;padding:48px 24px">
      <div style="font-size:32px;margin-bottom:12px">🎉</div>
      <h3 style="font-size:17px;font-weight:700;color:var(--ink);margin-bottom:6px">لا توجد مهام مسندة حالياً</h3>
      <p style="font-size:13px;color:var(--ink-muted)">أنت مواكب لجميع مهامك الرسمية، تمنياتنا لك بالتوفيق!</p>
    </div>`;
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:16px">
      ${list.map(t => {
        const pr = TASK_PRIORITY[t.priority] || TASK_PRIORITY.medium;
        const st = OFFICIAL_TASK_STATUS[t.status] || OFFICIAL_TASK_STATUS.pending;
        const isGroup = t.isGroup === true;

        if(isGroup){
          return `
            <div class="card note-task-card" data-group-emp-task-id="${t.id}" style="border:1px solid rgba(192,154,98,0.3);background:linear-gradient(180deg, var(--bg-paper) 0%, rgba(192,154,98,0.03) 100%);cursor:pointer">
              <div class="ntc-head">
                <h4 class="ntc-title" style="display:flex;align-items:center;gap:6px">
                  <i class="fa-solid fa-users" style="color:var(--gold-deep)"></i> ${esc(t.title)}
                </h4>
                <span class="prio-badge" style="color:${pr.color};background:${pr.color}15;border-color:transparent;font-size:10px;padding:2px 6px;">
                  <i class="fa-solid fa-flag"></i> ${pr.label}
                </span>
              </div>
              <p class="ntc-desc" style="margin-bottom:12px">${t.description ? esc(t.description) : "بدون وصف تفصيلي"}</p>
              
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:12px;color:var(--ink-soft)">
                <span><strong>المرسل:</strong> ${esc(t.adminName)}</span>
                <span class="badge" style="background:rgba(192,154,98,0.15);color:var(--gold-deep);font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:var(--r-full);">
                  <i class="fa-solid fa-users"></i> مهمة جماعية
                </span>
              </div>

              <div class="ntc-meta" style="padding-top:10px;border-top:1px dashed rgba(192,154,98,0.2)">
                <div class="ntc-meta-item">
                  <i class="fa-regular fa-calendar-check" style="color:var(--gold-deep)"></i>
                  <span>${t.dueDate ? fmtDate(t.dueDate) : "بدون موعد"}</span>
                </div>
                <div class="ntc-meta-item">
                  <i class="fa-solid fa-paperclip" style="color:${t.attachmentRequired ? 'var(--danger)' : 'var(--ink-faint)'}"></i>
                  <span>${t.attachmentRequired ? 'يتطلب مرفق' : 'مرفق اختياري'}</span>
                </div>
                ${t.adminAttachmentUrl ? `
                  <div class="ntc-meta-item" style="color:var(--gold-deep)">
                    <i class="fa-solid fa-paperclip"></i>
                    <span>مرفق من المدير</span>
                  </div>
                ` : ""}
              </div>
            </div>
          `;
        }

        return `
          <div class="card note-task-card" data-task-detail-id="${t.id}" style="cursor:pointer">
            <div class="ntc-head">
              <h4 class="ntc-title">${esc(t.title)}</h4>
              <span class="prio-badge" style="color:${pr.color};background:${pr.color}15;border-color:transparent;font-size:10px;padding:2px 6px;">
                <i class="fa-solid fa-flag"></i> ${pr.label}
              </span>
            </div>
            <p class="ntc-desc" style="margin-bottom:12px">${t.description ? esc(t.description) : "بدون وصف تفصيلي"}</p>
            
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:12px;color:var(--ink-soft)">
              <span><strong>المرسل:</strong> ${esc(t.adminName)}</span>
              <span class="status-badge" style="color:${st.color};background:${st.bg};border-color:transparent;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:var(--r-full);">
                <i class="fa-solid fa-circle-info"></i> ${st.label}
              </span>
            </div>

            <div class="ntc-meta" style="padding-top:10px;border-top:1px dashed var(--line-soft)">
              <div class="ntc-meta-item">
                <i class="fa-regular fa-calendar-check" style="color:var(--gold-deep)"></i>
                <span>${t.dueDate ? fmtDate(t.dueDate) : "بدون موعد"}</span>
              </div>
              <div class="ntc-meta-item">
                <i class="fa-solid fa-paperclip" style="color:${t.attachmentRequired ? 'var(--danger)' : 'var(--ink-faint)'}"></i>
                <span>${t.attachmentRequired ? 'يتطلب مرفق' : 'مرفق اختياري'}</span>
              </div>
              ${t.adminAttachmentUrl ? `
                <div class="ntc-meta-item" style="color:var(--gold-deep)">
                  <i class="fa-solid fa-paperclip"></i>
                  <span>مرفق من المدير</span>
                </div>
              ` : ""}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function openNewTaskModal(){
  State.tempAdminTaskFile = null; // تصفير الملف المرفوع مؤقتاً عند الفتح

  openModal(`
    <div class="modal-head">
      <h2>إنشاء وإسناد مهمة رسمية جديدة</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="newTaskForm">
      <div class="form-group" style="margin-bottom:14px">
        <label style="font-weight:700">عنوان المهمة</label>
        <input type="text" id="tTitle" required class="input" placeholder="مثال: إعداد مسودة تقرير إنجاز المشاريع">
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label style="font-weight:700">الوصف والتعليمات التفصيلية</label>
        <textarea id="tDesc" rows="3" class="input" placeholder="اكتب التعليمات والنتائج المطلوبة بوضوح..." required></textarea>
      </div>
      <div class="form-grid two" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div class="form-group">
          <label style="font-weight:700">الأولوية</label>
          <select id="tPriority" class="input">
            <option value="low">منخفضة</option>
            <option value="medium" selected>متوسطة</option>
            <option value="high">عالية</option>
          </select>
        </div>
        <div class="form-group">
          <label style="font-weight:700">تاريخ الاستحقاق (اختياري)</label>
          <input type="date" id="tDueDate" class="input">
        </div>
      </div>
      
      <div class="form-group" style="margin-bottom:14px">
        <label style="font-weight:700">تحديد المستلم</label>
        <select id="tAssignType" class="input">
          <option value="user">موظف محدد</option>
          <option value="all">جميع الموظفين</option>
        </select>
      </div>

      <div class="form-group" id="tAssignTargetWrap" style="margin-bottom:14px">
        <label style="font-weight:700">اختر الموظف</label>
        <select id="tAssignTarget" class="input">
          ${State.users.filter(u => u.uid !== State.user.uid).map(u => `
            <option value="${u.uid}">${esc(u.name)} (${esc(u.jobTitle || "موظف")})</option>
          `).join("")}
        </select>
      </div>

      <div class="form-group" style="margin-bottom:14px">
        <label style="font-weight:700">مرفق من المدير (اختياري)</label>
        <div id="tAdminAttachmentStatus" style="margin-bottom:8px;font-size:12px;color:var(--ink-soft)">
          <span style="color:var(--ink-faint)">لم يتم إرفاق ملف.</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <input type="file" id="tAdminFileInput" style="display:none">
          <button type="button" class="btn btn-secondary btn-sm" id="btnTriggerAdminFile" style="padding:4px 10px;font-size:12px"><i class="fa-solid fa-file-import"></i> اختيار ملف</button>
          <div id="tAdminUploadProgress" style="font-size:12px;color:var(--ink-muted);font-weight:700"></div>
        </div>
      </div>

      <div class="form-group" style="margin-bottom:18px;flex-direction:row;align-items:center;gap:10px;display:flex">
        <input type="checkbox" id="tAttachmentRequired" style="width:18px;height:18px;cursor:pointer">
        <label for="tAttachmentRequired" style="cursor:pointer;font-weight:700;font-size:13px;color:var(--ink-soft);user-select:none">المهمة تتطلب رفع ملف مرفق لإتمامها</label>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-primary" id="tSubmitBtn"><i class="fa-solid fa-paper-plane"></i> إسناد المهمة</button>
      </div>
    </form>
  `);

  const bindRemoveAdminFile = () => {
    const btnRemove = $("#btnRemoveAdminFile");
    if(btnRemove){
      btnRemove.addEventListener("click", () => {
        State.tempAdminTaskFile = null;
        $("#tAdminAttachmentStatus").innerHTML = `<span style="color:var(--ink-faint)">لم يتم إرفاق ملف.</span>`;
      });
    }
  };

  $("#btnTriggerAdminFile").addEventListener("click", () => $("#tAdminFileInput").click());

  $("#tAdminFileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if(!file) return;

    const triggerBtn = $("#btnTriggerAdminFile");
    const progressTxt = $("#tAdminUploadProgress");
    triggerBtn.disabled = true;
    triggerBtn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الرفع…`;
    progressTxt.textContent = "0%";

    try {
      const assignTypeVal = $("#tAssignType") ? $("#tAssignType").value : "single";
      const isGroupTask = assignTypeVal === "all";
      const res = await S.uploadTaskAttachment(
        { taskType: isGroupTask ? "group" : "single", taskId: "draft", subFolder: "admin" },
        file,
        (pct) => {
          progressTxt.textContent = `${pct}%`;
        },
        (status) => {
          if (status === "compressing") {
            triggerBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles spin"></i> جاري تجهيز الملف…`;
            progressTxt.textContent = "";
          } else if (status === "uploading") {
            triggerBtn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الرفع…`;
            progressTxt.textContent = "0%";
          }
        }
      );
      
      State.tempAdminTaskFile = res;

      $("#tAdminAttachmentStatus").innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-paper);padding:6px 10px;border-radius:var(--r-sm);border:1px solid var(--line-soft)">
          <span style="font-weight:700;font-size:12.5px;"><i class="fa-solid fa-file-circle-check" style="color:var(--success)"></i> ${esc(file.name)}</span>
          <button type="button" id="btnRemoveAdminFile" style="color:var(--danger);font-weight:700;border:none;background:none;cursor:pointer"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;

      bindRemoveAdminFile();
      toast("تم رفع المرفق بنجاح");
    } catch(err) {
      toast(err.message || "فشل رفع الملف إلى الخادم", "err");
    } finally {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = `<i class="fa-solid fa-file-import"></i> اختيار ملف`;
      progressTxt.textContent = "";
    }
  });

  $("#tAssignType").addEventListener("change", (e)=>{
    const val = e.target.value;
    const wrap = $("#tAssignTargetWrap");
    if(val === "all"){
      wrap.style.display = "none";
    } else {
      wrap.style.display = "block";
    }
  });

  $("#newTaskForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const btn = $("#tSubmitBtn");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الإسناد…`;

    const title = $("#tTitle").value.trim();
    const description = $("#tDesc").value.trim();
    const priority = $("#tPriority").value;
    const dueDate = $("#tDueDate").value || null;
    const assignType = $("#tAssignType").value;
    const attachmentRequired = $("#tAttachmentRequired").checked;

    const adminAttachmentUrl = State.tempAdminTaskFile ? State.tempAdminTaskFile.url : null;
    const adminAttachmentName = State.tempAdminTaskFile ? (State.tempAdminTaskFile.name || State.tempAdminTaskFile.fileName) : null;
    const adminAttachmentType = State.tempAdminTaskFile ? (State.tempAdminTaskFile.mimeType || State.tempAdminTaskFile.fileType) : null;
    const adminAttachmentProvider = State.tempAdminTaskFile ? State.tempAdminTaskFile.provider : null;
    const adminAttachmentDriveItemId = State.tempAdminTaskFile ? State.tempAdminTaskFile.driveItemId || null : null;
    const adminAttachmentDownloadUrl = State.tempAdminTaskFile ? State.tempAdminTaskFile.downloadUrl || null : null;
    const adminAttachmentPath = State.tempAdminTaskFile ? State.tempAdminTaskFile.sharePointPath || null : null;

    try {
      if(assignType === "all"){
        const targetUsers = State.users.filter(u => u.uid !== State.user.uid);
        if(!targetUsers.length){
          throw new Error("لا يوجد موظفون نشطون لإسناد المهمة لهم حالياً");
        }
        
        const taskId = await S.createTask({
          title,
          description,
          priority,
          dueDate,
          attachmentRequired,
          adminId: State.user.uid,
          adminName: State.user.name,
          recipientAll: true,
          isGroup: true,
          targetUsers,
          adminAttachmentUrl,
          adminAttachmentName,
          adminAttachmentType,
          adminAttachmentProvider,
          adminAttachmentDriveItemId,
          adminAttachmentDownloadUrl,
          adminAttachmentPath,
          adminAttachmentObj: State.tempAdminTaskFile || null
        });

        // إرسال إشعار فوري لكل موظف مستهدف
        targetUsers.forEach(u => {
          S.pushNotification({
            userId: u.uid,
            type: "task_new",
            title: "مهمة رسمية جديدة مسندة إليك",
            body: `تم إسناد مهمة جماعية جديدة لك: "${title}"`,
            link: "tasks",
            refId: taskId
          }).catch(()=>{});
        });

        await showActionSuccess({
          title: "تم إرسال المهمة الجماعية",
          message: "تم إسناد المهمة إلى جميع الموظفين المستهدفين بنجاح."
        });
      } else {
        const sel = $("#tAssignTarget");
        if(!sel || sel.selectedIndex === -1){
          throw new Error("يرجى اختيار الموظف المستهدف أولاً");
        }
        const empId = sel.value;
        const empName = sel.options[sel.selectedIndex].text.split(" (")[0];

        const taskId = await S.createTask({
          title,
          description,
          priority,
          dueDate,
          attachmentRequired,
          adminId: State.user.uid,
          adminName: State.user.name,
          employeeId: empId,
          employeeName: empName,
          adminAttachmentUrl,
          adminAttachmentName,
          adminAttachmentType,
          adminAttachmentProvider,
          adminAttachmentDriveItemId,
          adminAttachmentDownloadUrl,
          adminAttachmentPath,
          adminAttachmentObj: State.tempAdminTaskFile || null
        });

        // إرسال إشعار فوري
        await S.pushNotification({
          userId: empId,
          type: "task_new",
          title: "مهمة رسمية جديدة مسندة إليك",
          body: `تم إسناد مهمة جديدة لك: "${title}"`,
          link: "tasks",
          refId: taskId
        }).catch(()=>{});

        await showActionSuccess({
          title: "تم إرسال المهمة",
          message: `تم إسناد المهمة إلى "${empName}" بنجاح.`
        });
      }

      await loadAllData();
      renderTasks();
    } catch(err) {
      toast(err.message || "تعذّر إسناد المهمة", "err");
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> إسناد المهمة`;
    }
  });
}

function openTaskDetailModal(taskId){
  const t = State.tasks.find(x => x.id === taskId);
  if(!t) return;

  const isAd = isExec(State.user);
  const pr = TASK_PRIORITY[t.priority] || TASK_PRIORITY.medium;
  const st = OFFICIAL_TASK_STATUS[t.status] || OFFICIAL_TASK_STATUS.pending;

  let adminAttachmentBlock = "";
  if(t.adminAttachmentUrl){
    const previewUrl = S.getTaskAttachmentPreviewUrl(t.adminAttachmentUrl, t.adminAttachmentObj || t);
    const downloadUrl = S.getTaskAttachmentDownloadUrl(t.adminAttachmentUrl, t.adminAttachmentObj || t);
    adminAttachmentBlock = `
      <div style="background:rgba(192,154,98,0.06);border:1px solid rgba(192,154,98,0.2);border-radius:var(--r-md);padding:14px;margin-bottom:16px">
        <span style="font-size:12.5px;color:var(--gold-deep);font-weight:700"><i class="fa-solid fa-paperclip"></i> مرفق من المدير:</span>
        <div style="margin-top:8px;font-size:13px;color:var(--ink-soft);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <span style="font-weight:700"><i class="fa-regular fa-file" style="color:var(--gold-deep)"></i> ${esc(t.adminAttachmentName || "ملف مرفق")}</span>
          <div style="display:flex;gap:6px">
            <a href="${esc(previewUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="padding:4px 10px;font-size:11.5px"><i class="fa-solid fa-eye"></i> معاينة</a>
            <a href="${esc(downloadUrl)}" target="_blank" download class="btn btn-primary btn-sm" style="padding:4px 10px;font-size:11.5px"><i class="fa-solid fa-download"></i> تحميل</a>
          </div>
        </div>
      </div>
    `;
  }

  let detailsHtml = "";

  if(isAd){
    // تفاصيل المهمة للمدير
    let rejectionBlock = "";
    if(t.status === "rejected"){
      rejectionBlock = `
        <div style="background:rgba(220,53,69,0.06);border:1px solid rgba(220,53,69,0.15);border-radius:var(--r-md);padding:14px;margin-bottom:16px;color:var(--danger)">
          <h4 style="font-weight:800;margin-bottom:4px;font-size:13px"><i class="fa-solid fa-triangle-exclamation"></i> سبب الرفض المكتوب:</h4>
          <p style="font-size:12.5px;line-height:1.5;white-space:pre-wrap;margin:0">${esc(t.rejectionReason || "لم يتم تدوين سبب للرفض")}</p>
        </div>
      `;
    }

    const taskAtt = t.attachment || (t.attachmentUrl ? { url: t.attachmentUrl, name: t.attachmentName, provider: t.attachmentProvider, downloadUrl: t.attachmentDownloadUrl } : null);
    let attachmentBlock = `
      <div style="background:var(--bg-subtle);border:1px solid var(--line);border-radius:var(--r-md);padding:14px;margin-bottom:16px">
        <span style="font-size:12.5px;color:var(--ink-muted);font-weight:700"><i class="fa-solid fa-paperclip"></i> المرفقات المستلمة من الموظف:</span>
        <div style="margin-top:8px;font-size:13px;color:var(--ink-soft)">
          ${taskAtt ? `
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="font-weight:700"><i class="fa-regular fa-file" style="color:var(--gold-deep)"></i> ${esc(taskAtt.name || taskAtt.fileName || "ملف مرفق")}</span>
              <a href="${esc(S.getTaskAttachmentDownloadUrl(taskAtt.url, taskAtt))}" target="_blank" class="btn btn-secondary btn-sm" style="padding:4px 10px;font-size:11.5px" download><i class="fa-solid fa-download"></i> تنزيل المرفق</a>
            </div>
          ` : `
            <span style="color:var(--ink-faint)"><i class="fa-solid fa-ban"></i> لم يتم رفع أي ملف مرفق حتى الآن.</span>
          `}
        </div>
      </div>
    `;

    detailsHtml = `
      <div class="modal-head">
        <h2>تفاصيل المهمة الرسمية</h2>
        <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
      </div>

      <div style="margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:800;color:var(--ink);margin:0 0 8px 0">${esc(t.title)}</h3>
        <p style="font-size:13px;color:var(--ink-soft);line-height:1.6;white-space:pre-wrap;background:var(--bg-app);padding:14px;border-radius:var(--r-md);border:1px solid var(--line-soft);margin:0">${esc(t.description || "بدون تفاصيل إضافية")}</p>
      </div>

      <div class="form-grid two" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;font-size:13px;color:var(--ink-soft)">
        <div><strong>الموظف المستلم:</strong> ${esc(t.employeeName)}</div>
        <div><strong>تاريخ الاستحقاق:</strong> ${t.dueDate ? fmtDate(t.dueDate) : "بدون موعد"}</div>
        <div><strong>الأولوية:</strong> <span style="color:${pr.color};font-weight:700"><i class="fa-solid fa-flag"></i> ${pr.label}</span></div>
        <div><strong>حالة المهمة:</strong> <span style="color:${st.color};font-weight:700"><i class="fa-solid fa-circle-info"></i> ${st.label}</span></div>
      </div>

      ${adminAttachmentBlock}
      ${rejectionBlock}
      ${attachmentBlock}

      <div style="display:flex;justify-content:flex-end;align-items:center;padding-top:14px;border-top:1px solid var(--line-soft)">
        <button type="button" class="btn btn-secondary" data-close>إغلاق</button>
      </div>
    `;
  } else {
    // تفاصيل المهمة للموظف
    let actionArea = "";
    let uploadArea = "";

    if(t.status !== "completed"){
      uploadArea = `
        <div style="background:var(--bg-subtle);border:1px solid var(--line);border-radius:var(--r-md);padding:14px;margin-bottom:16px" id="empUploadBox">
          <label style="font-size:12.5px;color:var(--ink-soft);font-weight:700;display:block;margin-bottom:8px">
            <i class="fa-solid fa-upload"></i> ${t.attachmentRequired ? 'رفع المرفق المطلوب (إلزامي)' : 'إرفاق ملف (اختياري)'}
          </label>
          <div id="attachmentStatusWrap" style="margin-bottom:8px;font-size:12px;color:var(--ink-soft)">
            ${State.tempTaskFile ? `
              <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-paper);padding:6px 10px;border-radius:var(--r-sm);border:1px solid var(--line-soft)">
                <span style="font-weight:700"><i class="fa-solid fa-file-circle-check" style="color:var(--success)"></i> ${esc(State.tempTaskFile.fileName)}</span>
                <button type="button" id="btnRemoveTempFile" style="color:var(--danger);font-weight:700;border:none;background:none;cursor:pointer"><i class="fa-solid fa-trash"></i></button>
              </div>
            ` : `
              <span style="color:var(--ink-faint)">لم يتم رفع أي ملف.</span>
            `}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="file" id="taskFileInput" style="display:none">
            <button type="button" class="btn btn-secondary btn-sm" id="btnTriggerSelectFile" style="padding:4px 10px;font-size:12px"><i class="fa-solid fa-file-import"></i> اختيار ملف</button>
            <div id="uploadProgressText" style="font-size:12px;color:var(--ink-muted);font-weight:700"></div>
          </div>
        </div>
      `;

      actionArea = `
        <div style="display:flex;justify-content:flex-end;gap:10px;padding-top:14px;border-top:1px solid var(--line-soft)">
          <button type="button" class="btn btn-primary" id="btnCompleteTask" style="padding:8px 16px;border-radius:var(--r-sm)"><i class="fa-solid fa-circle-check"></i> إنجاز المهمة</button>
          <button type="button" class="btn btn-secondary" data-close>إغلاق</button>
        </div>
      `;
    } else {
      let attachmentBlock = "";
      if(t.attachment){
        attachmentBlock = `
          <div style="background:var(--bg-subtle);border:1px solid var(--line);border-radius:var(--r-md);padding:14px;margin-bottom:16px">
            <span style="font-size:12.5px;color:var(--ink-muted);font-weight:700"><i class="fa-solid fa-paperclip"></i> المرفق الخاص بك:</span>
            <div style="margin-top:6px;font-size:13px;color:var(--ink-soft);display:flex;align-items:center;justify-content:space-between">
              <span style="font-weight:700"><i class="fa-regular fa-file" style="color:var(--gold-deep)"></i> ${esc(t.attachment.fileName)}</span>
              <a href="${esc(t.attachment.url)}" target="_blank" class="btn btn-secondary btn-sm" style="padding:4px 10px;font-size:11.5px" download><i class="fa-solid fa-download"></i> تحميل / عرض</a>
            </div>
          </div>
        `;
      }

      actionArea = `
        ${attachmentBlock}
        <div style="display:flex;justify-content:flex-end;padding-top:14px;border-top:1px solid var(--line-soft)">
          <button type="button" class="btn btn-secondary" data-close>إغلاق</button>
        </div>
      `;
    }

    detailsHtml = `
      <div class="modal-head">
        <h2>تفاصيل المهمة المستلمة</h2>
        <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
      </div>

      <div style="margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:800;color:var(--ink);margin:0 0 8px 0">${esc(t.title)}</h3>
        <p style="font-size:13px;color:var(--ink-soft);line-height:1.6;white-space:pre-wrap;background:var(--bg-app);padding:14px;border-radius:var(--r-md);border:1px solid var(--line-soft);margin:0">${esc(t.description || "بدون وصف تفصيلي")}</p>
      </div>

      <div class="form-grid two" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;font-size:13px;color:var(--ink-soft)">
        <div><strong>المرسل:</strong> ${esc(t.adminName)}</div>
        <div><strong>تاريخ الاستحقاق:</strong> ${t.dueDate ? fmtDate(t.dueDate) : "بدون موعد"}</div>
        <div><strong>الأولوية:</strong> <span style="color:${pr.color};font-weight:700"><i class="fa-solid fa-flag"></i> ${pr.label}</span></div>
        <div><strong>الحالة:</strong> <span style="color:${st.color};font-weight:700"><i class="fa-solid fa-circle-info"></i> ${st.label}</span></div>
      </div>

      ${adminAttachmentBlock}
      ${uploadArea}
      ${actionArea}
    `;
  }

  // تصفير المرفق المؤقت أو وضع المرفق الحالي
  if(!isAd) State.tempTaskFile = t.attachment || null;

  openModal(detailsHtml, true);

  // ربط الأزرار والمستمعات
  if(!isAd && t.status !== "completed") {
    const fileInput = $("#taskFileInput");
    const progressTxt = $("#uploadProgressText");

    const bindRemoveTempFile = () => {
      const btnRemove = $("#btnRemoveTempFile");
      if(btnRemove){
        btnRemove.addEventListener("click", () => {
          State.tempTaskFile = null;
          $("#attachmentStatusWrap").innerHTML = `<span style="color:var(--ink-faint)">لم يتم رفع أي ملف.</span>`;
        });
      }
    };

    bindRemoveTempFile();

    $("#btnTriggerSelectFile")?.addEventListener("click", () => fileInput.click());

    fileInput?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if(!file) return;

      const triggerBtn = $("#btnTriggerSelectFile");
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الرفع…`;
      progressTxt.textContent = "0%";

      try {
        const res = await S.uploadTaskAttachment(
          { taskType: "single", taskId: t.id, subFolder: "execution", employeeUid: State.user.uid },
          file,
          (pct) => {
            progressTxt.textContent = `${pct}%`;
          },
          (status) => {
            if (status === "compressing") {
              triggerBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles spin"></i> جاري تجهيز الملف…`;
              progressTxt.textContent = "";
            } else if (status === "uploading") {
              triggerBtn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الرفع…`;
              progressTxt.textContent = "0%";
            }
          }
        );
        
        State.tempTaskFile = res;

        $("#attachmentStatusWrap").innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-paper);padding:6px 10px;border-radius:var(--r-sm);border:1px solid var(--line-soft)">
            <span style="font-weight:700;font-size:12.5px;"><i class="fa-solid fa-file-circle-check" style="color:var(--success)"></i> ${esc(file.name)}</span>
            <button type="button" id="btnRemoveTempFile" style="color:var(--danger);font-weight:700;border:none;background:none;cursor:pointer"><i class="fa-solid fa-trash"></i></button>
          </div>
        `;

        bindRemoveTempFile();
        toast("تم رفع الملف بنجاح");
      } catch(err) {
        toast(err.message || "فشل رفع الملف إلى الخادم", "err");
      } finally {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = `<i class="fa-solid fa-file-import"></i> اختيار ملف`;
        progressTxt.textContent = "";
      }
    });

    // إنهاء المهمة
    $("#btnCompleteTask")?.addEventListener("click", async () => {
      if(t.attachmentRequired && !State.tempTaskFile && !t.attachment){
        toast("يجب إرفاق ملف التنفيذ قبل إنجاز المهمة.", "err");
        return;
      }

      const btn = $("#btnCompleteTask");
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الإرسال…`;

      try {
        await S.updateTask(taskId, {
          status: "completed",
          attachment: State.tempTaskFile || t.attachment || null,
          attachmentUrl: State.tempTaskFile ? State.tempTaskFile.url : (t.attachmentUrl || null),
          attachmentName: State.tempTaskFile ? (State.tempTaskFile.name || State.tempTaskFile.fileName) : (t.attachmentName || null),
          attachmentType: State.tempTaskFile ? (State.tempTaskFile.mimeType || State.tempTaskFile.fileType) : (t.attachmentType || null),
          attachmentProvider: State.tempTaskFile ? State.tempTaskFile.provider : (t.attachmentProvider || null),
          attachmentDriveItemId: State.tempTaskFile ? (State.tempTaskFile.driveItemId || null) : (t.attachmentDriveItemId || null),
          attachmentDownloadUrl: State.tempTaskFile ? (State.tempTaskFile.downloadUrl || null) : (t.attachmentDownloadUrl || null),
          attachmentPath: State.tempTaskFile ? (State.tempTaskFile.sharePointPath || null) : (t.attachmentPath || null)
        });

        await S.pushNotification({
          userId: t.adminId,
          type: "task_completed",
          title: "اكتملت مهمة رسمية",
          body: `أنجز الموظف "${State.user.name}" المهمة الرسمية: "${t.title}"`,
          link: "tasks",
          refId: taskId
        }).catch(()=>{});

        await showActionSuccess({
          title: "تم إنجاز المهمة",
          message: "أحسنت، تم تسجيل إنجاز المهمة بنجاح."
        });
        await loadAllData();
        renderTasks();
      } catch(err) {
        toast("تعذّر تحديث حالة المهمة", "err");
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> تم إنهاء المهمة`;
      }
    });
  }
}

/* ════════════════ متابعة المهام الجماعية (Executive & Employee Modals) ════════════════ */

/* ════════════════ متابعة المهام الجماعية (Executive & Employee Modals) ════════════════ */

async function openGroupTaskDetailModal(taskId){
  const t = State.tasks.find(x => x.id === taskId);
  if(!t) return;

  const pr = TASK_PRIORITY[t.priority] || TASK_PRIORITY.medium;

  let adminAttachmentBlock = "";
  if(t.adminAttachmentUrl){
    const previewUrl = S.getTaskAttachmentPreviewUrl(t.adminAttachmentUrl, t.adminAttachmentObj || t);
    const downloadUrl = S.getTaskAttachmentDownloadUrl(t.adminAttachmentUrl, t.adminAttachmentObj || t);
    adminAttachmentBlock = `
      <div style="margin-top:10px;padding:10px 14px;background:rgba(192,154,98,0.06);border:1px solid rgba(192,154,98,0.2);border-radius:var(--r-md);display:flex;align-items:center;justify-content:space-between;font-size:12.5px">
        <span style="font-weight:700;color:var(--gold-deep)"><i class="fa-solid fa-paperclip"></i> مرفق المدير: ${esc(t.adminAttachmentName || "ملف مرفق")}</span>
        <div style="display:flex;gap:6px">
          <a href="${esc(previewUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="padding:3px 10px;font-size:11.5px"><i class="fa-solid fa-eye"></i> معاينة</a>
          <a href="${esc(downloadUrl)}" target="_blank" download class="btn btn-primary btn-sm" style="padding:3px 10px;font-size:11.5px"><i class="fa-solid fa-download"></i> تحميل</a>
        </div>
      </div>
    `;
  }
  
  openModal(`
    <div class="modal-head">
      <h2><i class="fa-solid fa-users" style="color:var(--gold-deep)"></i> متابعة تنفيذ المهمة الجماعية</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>

    <div style="margin-bottom:16px;background:var(--bg-app);padding:14px;border-radius:var(--r-md);border:1px solid var(--line-soft)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:8px">
        <h3 style="font-size:16px;font-weight:800;color:var(--ink);margin:0">${esc(t.title)}</h3>
        <span style="color:${pr.color};background:${pr.color}15;padding:2px 8px;border-radius:var(--r-full);font-weight:700;font-size:11.5px"><i class="fa-solid fa-flag"></i> ${pr.label}</span>
      </div>
      <p style="font-size:13px;color:var(--ink-soft);line-height:1.6;margin:0 0 10px 0;white-space:pre-wrap">${esc(t.description || "بدون وصف تفصيلي")}</p>
      
      <div style="display:flex;gap:16px;font-size:12px;color:var(--ink-muted);flex-wrap:wrap">
        <span><i class="fa-regular fa-calendar-check" style="color:var(--gold-deep)"></i> <strong>تاريخ الاستحقاق:</strong> ${t.dueDate ? fmtDate(t.dueDate) : "بدون موعد"}</span>
        <span><i class="fa-solid fa-paperclip" style="color:${t.attachmentRequired ? 'var(--danger)' : 'var(--ink-faint)'}"></i> <strong>المرفق:</strong> ${t.attachmentRequired ? 'مرفق إلزامي' : 'اختياري'}</span>
      </div>

      ${adminAttachmentBlock}
    </div>

    <!-- شريط ملخص الحالات (حالتان فقط: مكتملة / لم تبدأ) -->
    <div id="groupStatsContainer" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:20px;text-align:center">
      <div style="background:var(--bg-paper);padding:10px;border-radius:var(--r-md);border:1px solid var(--line-soft)">
        <div style="font-size:18px;font-weight:900;color:var(--ink)" id="statTotal">—</div>
        <div style="font-size:11px;color:var(--ink-muted);font-weight:700">إجمالي الموظفين</div>
      </div>
      <div style="background:rgba(40,167,69,0.06);padding:10px;border-radius:var(--r-md);border:1px solid rgba(40,167,69,0.2)">
        <div style="font-size:18px;font-weight:900;color:var(--success)" id="statCompleted">—</div>
        <div style="font-size:11px;color:var(--success);font-weight:700">مكتملة</div>
      </div>
      <div style="background:rgba(108,117,125,0.06);padding:10px;border-radius:var(--r-md);border:1px solid rgba(108,117,125,0.2)">
        <div style="font-size:18px;font-weight:900;color:var(--ink-muted)" id="statNotStarted">—</div>
        <div style="font-size:11px;color:var(--ink-muted);font-weight:700">لم تبدأ</div>
      </div>
    </div>

    <!-- قائمة الموظفين وحالة التنفيذ لكل منهم -->
    <div style="margin-bottom:20px">
      <h4 style="font-size:14px;font-weight:800;color:var(--ink);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
        <span><i class="fa-solid fa-list-check"></i> حالة تنفيذ الموظفين</span>
        <span style="font-size:12px;color:var(--ink-muted);font-weight:normal" id="execsLoadingState"><i class="fa-solid fa-spinner spin"></i> جاري التحميل...</span>
      </h4>

      <div id="groupExecutionsList" style="display:flex;flex-direction:column;gap:10px;max-height:360px;overflow-y:auto;padding-left:4px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;align-items:center;padding-top:14px;border-top:1px solid var(--line-soft)">
      <button type="button" class="btn btn-secondary" data-close>إغلاق</button>
    </div>
  `);

  const listContainer = $("#groupExecutionsList");
  const loadingState = $("#execsLoadingState");

  const renderExecutionsList = (execs) => {
    let completedCount = 0;
    let notStartedCount = 0;

    execs.forEach(x => {
      if(x.status === "completed") completedCount++;
      else notStartedCount++;
    });

    if($("#statTotal")) $("#statTotal").textContent = execs.length;
    if($("#statCompleted")) $("#statCompleted").textContent = completedCount;
    if($("#statNotStarted")) $("#statNotStarted").textContent = notStartedCount;
    if(loadingState) loadingState.style.display = "none";

    if(!execs.length){
      if(listContainer) listContainer.innerHTML = `<div style="text-align:center;color:var(--ink-muted);padding:20px;font-size:13px">لم يتم العثور على سجلات تنفيذ لهذا الطلب.</div>`;
      return;
    }

    if(listContainer) {
      listContainer.innerHTML = execs.map(exec => {
        let statusBadge = "";
        if(exec.status === "completed"){
          statusBadge = `<span style="background:rgba(40,167,69,0.12);color:var(--success);padding:4px 12px;border-radius:var(--r-full);font-weight:800;font-size:12px;"><i class="fa-solid fa-circle-check"></i> مكتملة</span>`;
        } else {
          statusBadge = `<span style="background:rgba(108,117,125,0.1);color:var(--ink-muted);padding:4px 12px;border-radius:var(--r-full);font-weight:800;font-size:12px;"><i class="fa-regular fa-clock"></i> لم تبدأ</span>`;
        }

        let dateStr = "—";
        if(exec.completedAt){
          dateStr = fmtDate(exec.completedAt);
        } else if(exec.updatedAt){
          dateStr = fmtDate(exec.updatedAt);
        }

        let fileBlock = `<span style="color:var(--ink-faint);font-size:12px"><i class="fa-solid fa-minus"></i> لا يوجد</span>`;
        const attObj = exec.attachment || (exec.attachmentUrl ? { url: exec.attachmentUrl, name: exec.attachmentName, provider: exec.attachmentProvider, downloadUrl: exec.attachmentDownloadUrl } : null);
        if(attObj && (attObj.url || attObj.downloadUrl)){
          const downloadUrl = S.getTaskAttachmentDownloadUrl(attObj.url, attObj);
          fileBlock = `
            <a href="${esc(downloadUrl)}" target="_blank" download class="btn btn-secondary btn-sm" style="padding:4px 10px;font-size:11.5px;font-weight:700">
              <i class="fa-solid fa-download" style="color:var(--gold-deep)"></i> تحميل الملف
            </a>
          `;
        }

        return `
          <div style="background:var(--bg-paper);border:1px solid var(--line-soft);border-radius:var(--r-md);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div>
              <div style="font-weight:800;font-size:13.5px;color:var(--ink)"><i class="fa-solid fa-user-tie" style="color:var(--gold-deep);margin-left:6px"></i>${esc(exec.employeeName || "موظف")}</div>
              <div style="font-size:11.5px;color:var(--ink-muted);margin-top:2px">${esc(exec.employeeJobTitle || "موظف")}</div>
            </div>

            <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
              <div>${statusBadge}</div>
              <div style="font-size:12px;color:var(--ink-soft)"><i class="fa-regular fa-calendar"></i> ${dateStr}</div>
              <div>${fileBlock}</div>
            </div>
          </div>
        `;
      }).join("");
    }
  };

  const unsubExecs = S.watchTaskExecutions(taskId, (execs) => {
    renderExecutionsList(execs);
  });

  const btnClose = $$("[data-close]");
  btnClose.forEach(b => b.addEventListener("click", () => unsubExecs()));
}

async function openEmployeeGroupTaskModal(taskId){
  const t = State.tasks.find(x => x.id === taskId);
  if(!t) return;

  State.tempTaskFile = null;
  const pr = TASK_PRIORITY[t.priority] || TASK_PRIORITY.medium;
  const empExec = await S.getTaskExecution(taskId, State.user.uid) || { status: "not_started", attachment: null };

  let currentStatusBadge = "";
  if(empExec.status === "completed"){
    currentStatusBadge = `<span style="background:rgba(40,167,69,0.12);color:var(--success);padding:4px 12px;border-radius:var(--r-full);font-weight:800;font-size:12px;"><i class="fa-solid fa-circle-check"></i> مكتملة</span>`;
  } else {
    currentStatusBadge = `<span style="background:rgba(108,117,125,0.1);color:var(--ink-muted);padding:4px 12px;border-radius:var(--r-full);font-weight:800;font-size:12px;"><i class="fa-regular fa-clock"></i> لم تبدأ</span>`;
  }

  let adminAttachmentBlock = "";
  if(t.adminAttachmentUrl){
    const previewUrl = S.getTaskAttachmentPreviewUrl(t.adminAttachmentUrl, t.adminAttachmentObj || t);
    const downloadUrl = S.getTaskAttachmentDownloadUrl(t.adminAttachmentUrl, t.adminAttachmentObj || t);
    adminAttachmentBlock = `
      <div style="background:rgba(192,154,98,0.06);border:1px solid rgba(192,154,98,0.2);border-radius:var(--r-md);padding:14px;margin-bottom:16px">
        <span style="font-size:12.5px;color:var(--gold-deep);font-weight:700"><i class="fa-solid fa-paperclip"></i> مرفق من المدير:</span>
        <div style="margin-top:8px;font-size:13px;color:var(--ink-soft);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <span style="font-weight:700"><i class="fa-regular fa-file" style="color:var(--gold-deep)"></i> ${esc(t.adminAttachmentName || "ملف مرفق")}</span>
          <div style="display:flex;gap:6px">
            <a href="${esc(previewUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="padding:4px 10px;font-size:11.5px"><i class="fa-solid fa-eye"></i> معاينة</a>
            <a href="${esc(downloadUrl)}" target="_blank" download class="btn btn-primary btn-sm" style="padding:4px 10px;font-size:11.5px"><i class="fa-solid fa-download"></i> تحميل</a>
          </div>
        </div>
      </div>
    `;
  }

  let fileUploadArea = `
    <div style="background:var(--bg-subtle);border:1px solid var(--line);border-radius:var(--r-md);padding:14px;margin-bottom:16px" id="empGroupUploadBox">
      <label style="font-size:12.5px;color:var(--ink-soft);font-weight:700;display:block;margin-bottom:8px">
        <i class="fa-solid fa-upload"></i> ${t.attachmentRequired ? 'رفع مرفق التنفيذ (إلزامي)' : 'إرفاق ملف التنفيذ (اختياري)'}
      </label>
      <div id="groupAttachmentStatusWrap" style="margin-bottom:8px;font-size:12px;color:var(--ink-soft)">
        ${empExec.attachment ? `
          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-paper);padding:6px 10px;border-radius:var(--r-sm);border:1px solid var(--line-soft)">
            <span style="font-weight:700"><i class="fa-solid fa-file-circle-check" style="color:var(--success)"></i> ${esc(empExec.attachment.fileName || empExec.attachment.name || "ملف منفّذ")}</span>
            <a href="${esc(empExec.attachment.url)}" target="_blank" download class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:11px"><i class="fa-solid fa-eye"></i> معاينة</a>
          </div>
        ` : `
          <span style="color:var(--ink-faint)">لم يتم رفع أي ملف حتى الآن.</span>
        `}
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <input type="file" id="groupTaskFileInput" style="display:none">
        <button type="button" class="btn btn-secondary btn-sm" id="btnTriggerSelectGroupFile" style="padding:4px 10px;font-size:12px"><i class="fa-solid fa-file-import"></i> اختيار ملف جديد</button>
        <div id="groupUploadProgressText" style="font-size:12px;color:var(--ink-muted);font-weight:700"></div>
      </div>
    </div>
  `;

  openModal(`
    <div class="modal-head">
      <h2><i class="fa-solid fa-users" style="color:var(--gold-deep)"></i> المهمة الرسمية الجماعية</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>

    <div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h3 style="font-size:16px;font-weight:800;color:var(--ink);margin:0">${esc(t.title)}</h3>
        <span style="color:${pr.color};background:${pr.color}15;padding:2px 8px;border-radius:var(--r-full);font-weight:700;font-size:11.5px"><i class="fa-solid fa-flag"></i> ${pr.label}</span>
      </div>
      <p style="font-size:13px;color:var(--ink-soft);line-height:1.6;white-space:pre-wrap;background:var(--bg-app);padding:14px;border-radius:var(--r-md);border:1px solid var(--line-soft);margin:0">${esc(t.description || "بدون تفاصيل إضافية")}</p>
    </div>

    <div class="form-grid two" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;font-size:13px;color:var(--ink-soft)">
      <div><strong>المرسل:</strong> ${esc(t.adminName)}</div>
      <div><strong>تاريخ الاستحقاق:</strong> ${t.dueDate ? fmtDate(t.dueDate) : "بدون موعد"}</div>
      <div><strong>حالتك في تنفيذ المهمة:</strong> ${currentStatusBadge}</div>
    </div>

    ${adminAttachmentBlock}
    ${fileUploadArea}

    <div style="display:flex;justify-content:flex-end;gap:10px;padding-top:14px;border-top:1px solid var(--line-soft)">
      ${empExec.status !== "completed" ? `
        <button type="button" class="btn btn-primary" id="btnCompleteGroupTask" style="padding:8px 16px;border-radius:var(--r-sm)"><i class="fa-solid fa-circle-check"></i> إنجاز المهمة</button>
      ` : ''}
      <button type="button" class="btn btn-secondary" data-close>إغلاق</button>
    </div>
  `);

  $("#btnTriggerSelectGroupFile")?.addEventListener("click", () => $("#groupTaskFileInput").click());

  $("#groupTaskFileInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if(!file) return;

    const btn = $("#btnTriggerSelectGroupFile");
    const progressTxt = $("#groupUploadProgressText");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الرفع…`;
    progressTxt.textContent = "0%";

    try {
      const res = await S.uploadTaskAttachment(
        { taskType: "group", taskId: t.id, subFolder: "execution", employeeUid: State.user.uid },
        file,
        (pct) => progressTxt.textContent = `${pct}%`,
        (status) => {
          if (status === "compressing") {
            btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles spin"></i> جاري التجهيز…`;
            progressTxt.textContent = "";
          } else if (status === "uploading") {
            btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الرفع…`;
          }
        }
      );

      State.tempTaskFile = res;

      $("#groupAttachmentStatusWrap").innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-paper);padding:6px 10px;border-radius:var(--r-sm);border:1px solid var(--line-soft)">
          <span style="font-weight:700"><i class="fa-solid fa-file-circle-check" style="color:var(--success)"></i> ${esc(file.name)}</span>
          <span style="font-size:11px;color:var(--success);font-weight:700">تم الرفع ✓</span>
        </div>
      `;
      toast("تم رفع المرفق بنجاح");
    } catch(err) {
      toast(err.message || "فشل رفع الملف", "err");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-file-import"></i> تغيير الملف`;
      progressTxt.textContent = "";
    }
  });

  $("#btnCompleteGroupTask")?.addEventListener("click", async () => {
    if(t.attachmentRequired && !State.tempTaskFile && !empExec.attachment){
      toast("يجب إرفاق ملف التنفيذ قبل إنجاز المهمة.", "err");
      return;
    }

    const btn = $("#btnCompleteGroupTask");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ التسجيل…`;

    try {
      const updateData = {
        status: "completed",
        completedAt: new Date().toISOString()
      };
      if(State.tempTaskFile){
        updateData.attachment = State.tempTaskFile;
        updateData.attachmentUrl = State.tempTaskFile.url || null;
        updateData.attachmentName = State.tempTaskFile.name || State.tempTaskFile.fileName || null;
        updateData.attachmentType = State.tempTaskFile.mimeType || State.tempTaskFile.fileType || null;
        updateData.attachmentProvider = State.tempTaskFile.provider || null;
        updateData.attachmentDriveItemId = State.tempTaskFile.driveItemId || null;
        updateData.attachmentDownloadUrl = State.tempTaskFile.downloadUrl || null;
        updateData.attachmentPath = State.tempTaskFile.sharePointPath || null;
      }
      await S.updateTaskExecution(taskId, State.user.uid, updateData);
      if(!State.userExecutionsMap) State.userExecutionsMap = {};
      State.userExecutionsMap[taskId] = "completed";

      await S.pushNotification({
        userId: t.adminId,
        type: "task_completed",
        title: "اكتملت المهمة الجماعية من موظف",
        body: `أنجز الموظف "${State.user.name}" المهمة الجماعية: "${t.title}"`,
        link: "tasks",
        refId: taskId
      }).catch(()=>{});

      await showActionSuccess({
        title: "تم إنجاز المهمة الجماعية",
        message: "أحسنت، تم تسجيل إنجازك للمهمة بنجاح."
      });
      await loadAllData();
      renderTasks();
    } catch(err) {
      toast("فشل تسجيل إنجاز المهمة", "err");
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> إنجاز المهمة`;
    }
  });
}

/* ════════════════ 5.5. ملاحظاتي (Personal Notes & Tasks) ════════════════ */
function renderMyNotes(el) {
  if (!el) el = $("#viewHost");
  
  // تصفية القائمة
  let list = [...State.personalTasks];
  
  // تصفية حسب المستخدم (المستخدم يرى مهامه الشخصية فقط لخصوصية القسم)
  list = list.filter(t => t.userId === State.user.uid);

  // الفرز الافتراضي (الأحدث إنشاءً أولاً)
  list.sort((a, b) => tsToDate(b.createdAt) - tsToDate(a.createdAt));

  el.innerHTML = `
    ${pageHead("My Notes", "ملاحظاتي", "مساحة المهام", "والملاحظات", "سجل ونظم ملاحظاتك ومهامك اليومية وسير أعمالك بكل ترتيب.")}

    <div class="toolbar" style="margin-bottom:24px;gap:12px;display:flex;align-items:center;flex-wrap:wrap">
      <!-- زر تبديل طريقة العرض -->
      <div class="segmented-control" style="display:flex;background:var(--bg-subtle);padding:3px;border-radius:var(--r-md);border:1px solid var(--line-soft)">
        <button class="chip ${State.myNotesViewMode === "board" ? "active" : ""}" id="viewModeBoard" style="border:none;border-radius:var(--r-sm);padding:6px 12px;font-size:12px;margin:0">
          <i class="fa-solid fa-grip-vertical"></i> لوحة الأعمدة
        </button>
        <button class="chip ${State.myNotesViewMode === "list" ? "active" : ""}" id="viewModeList" style="border:none;border-radius:var(--r-sm);padding:6px 12px;font-size:12px;margin:0">
          <i class="fa-solid fa-list"></i> قائمة/جدول
        </button>
      </div>

      <div class="spacer"></div>
      
      <!-- زر إضافة ملاحظة -->
      <button class="btn btn-primary" id="newNoteBtn" style="border-radius:var(--r-sm);padding:8px 16px"><i class="fa-solid fa-plus"></i> ملاحظة جديدة</button>
    </div>

    <!-- مساحة عرض البيانات -->
    <div id="notesViewContent">
      ${State.myNotesViewMode === "board" ? renderNotesBoard(list) : renderNotesList(list)}
    </div>
  `;

  // مستمعو الأحداث
  $("#viewModeBoard").addEventListener("click", () => {
    State.myNotesViewMode = "board";
    renderMyNotes(el);
  });
  $("#viewModeList").addEventListener("click", () => {
    State.myNotesViewMode = "list";
    renderMyNotes(el);
  });

  $("#newNoteBtn").addEventListener("click", openNewPersonalTaskModal);

  // نقرات البطاقات لفتح المودال
  $$("[data-personal-task]").forEach(card => {
    card.addEventListener("click", (e) => {
      if(e.target.closest("[data-toggle-task]")) return;
      openPersonalTaskDetailModal(card.dataset.personalTask);
    });
  });

  // تفاعل الإنجاز السريع المباشر للملاحظة الشخصية (Micro-interaction)
  $$("[data-toggle-task]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.toggleTask;
      const card = $(`#ptCard_${taskId}`);
      const t = State.personalTasks.find(x => x.id === taskId);
      if(!t) return;

      const nextStatus = t.status === "completed" ? "in_progress" : "completed";
      
      if(card && nextStatus === "completed") {
        card.classList.add("task-item-completing");
        showSuccessBadge("أحسنت!", `تم إنجاز المهمة الشخصية: "${t.title}"`);
      } else {
        toast("تمت إعادة المهمة إلى قيد التنفيذ");
      }

      try {
        await S.updatePersonalTask(taskId, { status: nextStatus });
        t.status = nextStatus;
        setTimeout(async () => {
          await loadAllData();
          renderMyNotes();
        }, 450);
      } catch(err) {
        toast("تعذّر تحديث حالة المهمة", "err");
        if(card) card.classList.remove("task-item-completing");
      }
    });
  });
}

function renderPersonalTaskCard(t) {
  const pr = TASK_PRIORITY[t.priority] || TASK_PRIORITY.medium;
  const desc = t.description ? esc(t.description) : "بدون وصف تفصيلي";
  const notesCount = t.notes ? t.notes.length : 0;
  const isCompleted = t.status === "completed";
  
  const ownerHtml = isExec(State.user) ? `
    <div class="ntc-meta-item" style="color:var(--gold-deep)">
      <i class="fa-solid fa-user-tag"></i>
      <span>${esc(t.userName || "موظف")}</span>
    </div>
  ` : "";

  return `
    <div class="note-task-card ${isCompleted ? 'completed' : ''}" data-personal-task="${t.id}" id="ptCard_${t.id}">
      <div class="ntc-head">
        <div style="display:flex;align-items:center;gap:10px;">
          <button type="button" class="ntc-check-btn" data-toggle-task="${t.id}" title="${isCompleted ? 'مكتملة (اضغط للتراجع)' : 'تحديد كمكتملة'}">
            <i class="fa-solid fa-check"></i>
          </button>
          <h4 class="ntc-title">${esc(t.title)}</h4>
        </div>
        <span class="prio-badge" style="color:${pr.color};background:${pr.color}15;border-color:transparent;font-size:10px;padding:2px 6px;">
          <i class="fa-solid fa-flag"></i> ${pr.label}
        </span>
      </div>
      <p class="ntc-desc">${desc}</p>
      <div class="ntc-meta">
        <div class="ntc-meta-item">
          <i class="fa-regular fa-calendar-check" style="color:var(--gold-deep)"></i>
          <span>${t.dueDate ? fmtDate(t.dueDate) : "بدون موعد"}</span>
        </div>
        <div class="ntc-meta-item">
          <i class="fa-regular fa-comment" style="color:var(--gold-deep)"></i>
          <span>${notesCount} ${notesCount === 1 ? 'ملاحظة' : 'ملاحظات'}</span>
        </div>
        ${ownerHtml}
      </div>
    </div>
  `;
}

function renderNotesBoard(list) {
  const newTasks = list.filter(t => t.status === "new" || t.status === "pending");
  const progressTasks = list.filter(t => t.status === "in_progress");
  const completedTasks = list.filter(t => t.status === "completed");

  const colData = [
    { key: "new", title: "قيد الانتظار", icon: "fa-solid fa-hourglass-start", list: newTasks, color: "var(--info)" },
    { key: "in_progress", title: "قيد التنفيذ", icon: "fa-solid fa-spinner fa-spin-pulse", list: progressTasks, color: "var(--gold)" },
    { key: "completed", title: "مكتملة", icon: "fa-solid fa-circle-check", list: completedTasks, color: "var(--success)" }
  ];

  return `
    <div class="notes-board">
      ${colData.map(c => `
        <div class="board-col">
          <div class="col-header">
            <span class="col-title" style="color:${c.color}">
              <i class="${c.icon}"></i> ${c.title}
            </span>
            <span class="col-count">${c.list.length}</span>
          </div>
          <div class="col-cards" style="display:flex;flex-direction:column;gap:12px;min-height:150px;" data-status-col="${c.key}">
            ${c.list.length ? c.list.map(renderPersonalTaskCard).join("") : `
              <div style="text-align:center;padding:32px 10px;color:var(--ink-faint);font-size:12.5px;border:1px dashed var(--line-soft);border-radius:var(--r-md);background:var(--bg-paper)">
                لا توجد مهام حالياً
              </div>
            `}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderNotesList(list) {
  if (!list.length) {
    return `<div class="card" style="text-align:center;padding:48px 24px">
      <div style="font-size:32px;margin-bottom:12px">🗒️</div>
      <h3 style="font-size:17px;font-weight:700;color:var(--ink);margin-bottom:6px">لا توجد مهام مطابقة للبحث</h3>
      <p style="font-size:13px;color:var(--ink-muted)">حاول تغيير خيارات التصفية أو أضف مهمة جديدة.</p>
    </div>`;
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:16px">
      ${list.map(renderPersonalTaskCard).join("")}
    </div>
  `;
}

function openNewPersonalTaskModal() {
  openModal(`
    <div class="modal-head">
      <h2>إضافة مهمة وملاحظة شخصية جديدة</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="newPersonalTaskForm">
      <div class="form-group" style="margin-bottom:14px">
        <label>عنوان المهمة / الموضوع</label>
        <input type="text" id="ntTitle" required class="input" placeholder="مثال: مراجعة الميزانية السنوية أو النشر اليومي">
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label>الوصف والتفاصيل (اختياري)</label>
        <textarea id="ntDesc" rows="3" class="input" placeholder="سجل تفاصيل وملاحظات المهمة..."></textarea>
      </div>
      <div class="form-grid two" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px">
        <div class="form-group">
          <label>الأولوية</label>
          <select id="ntPriority" class="input">
            <option value="low">منخفضة</option>
            <option value="medium" selected>متوسطة</option>
            <option value="high">عالية</option>
          </select>
        </div>
        <div class="form-group">
          <label>تاريخ الاستحقاق (اختياري)</label>
          <input type="date" id="ntDueDate" class="input">
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-primary" id="ntSubmitBtn"><i class="fa-solid fa-save"></i> حفظ المهمة</button>
      </div>
    </form>
  `);

  $("#newPersonalTaskForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#ntSubmitBtn");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الحفظ…`;

    try {
      await S.createPersonalTask({
        title: $("#ntTitle").value.trim(),
        description: $("#ntDesc").value.trim(),
        priority: $("#ntPriority").value,
        dueDate: $("#ntDueDate").value || null,
        userId: State.user.uid,
        userName: State.user.name,
        notes: []
      });
      
      await showActionSuccess({
        title: "تمت إضافة المهمة الشخصية",
        message: "تم حفظ المهمة بنجاح في سجلك الشخصي."
      });
      await loadAllData();
      renderMyNotes();
    } catch (err) {
      toast("عذراً، فشل إضافة المهمة", "err");
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-save"></i> حفظ المهمة`;
    }
  });
}

function openPersonalTaskDetailModal(taskId) {
  const t = State.personalTasks.find(x => x.id === taskId);
  if (!t) return;

  const dueDateVal = t.dueDate ? tsToDate(t.dueDate).toISOString().split("T")[0] : "";

  openModal(`
    <div class="modal-head">
      <h2>تفاصيل المهمة والملاحظات</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    
    <div class="form-group" style="margin-bottom:12px">
      <label>العنوان / الموضوع</label>
      <input type="text" id="edTitle" class="input" value="${esc(t.title)}" required>
    </div>

    <div class="form-group" style="margin-bottom:12px">
      <label>وصف المهمة</label>
      <textarea id="edDesc" rows="3" class="input">${esc(t.description || "")}</textarea>
    </div>

    <div class="form-grid two" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <div class="form-group">
        <label>الأولوية</label>
        <select id="edPriority" class="input">
          <option value="low" ${t.priority === 'low' ? 'selected' : ''}>منخفضة</option>
          <option value="medium" ${t.priority === 'medium' ? 'selected' : ''}>متوسطة</option>
          <option value="high" ${t.priority === 'high' ? 'selected' : ''}>عالية</option>
        </select>
      </div>
      <div class="form-group">
        <label>الحالة</label>
        <select id="edStatus" class="input">
          <option value="new" ${t.status === 'new' ? 'selected' : ''}>قيد الانتظار</option>
          <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>قيد التنفيذ</option>
          <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>مكتملة</option>
        </select>
      </div>
    </div>

    <div class="form-group" style="margin-bottom:16px">
      <label>تاريخ الاستحقاق (اختياري)</label>
      <input type="date" id="edDueDate" class="input" value="${dueDateVal}">
    </div>

    <!-- قسم الملاحظات المقيدة داخل المهمة -->
    <div style="margin-bottom:18px">
      <label style="font-size:12.5px;font-weight:700;color:var(--ink-soft);display:block;margin-bottom:6px">
        <i class="fa-solid fa-comments"></i> الملاحظات والتعليقات المكتوبة (${t.notes ? t.notes.length : 0})
      </label>
      
      <div class="notes-container" id="modalNotesContainer">
        ${renderModalNotesList(t.notes || [])}
      </div>

      <div class="add-note-box" style="display:flex;flex-direction:column;gap:6px">
        <textarea id="edNewNoteText" placeholder="اكتب ملاحظة أو إضافة جديدة..." class="input" rows="2" style="font-size:12.5px;resize:none"></textarea>
        <div style="display:flex;justify-content:flex-end">
          <button type="button" class="btn btn-secondary btn-sm" id="btnSaveNote" style="padding:6px 12px;font-size:12px"><i class="fa-solid fa-plus"></i> إضافة ملاحظة</button>
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid var(--line-soft)">
      <button type="button" class="btn btn-danger-soft" id="btnDeletePersonalTask" title="حذف المهمة نهائياً"><i class="fa-solid fa-trash"></i> حذف</button>
      <div style="display:flex;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="button" class="btn btn-primary" id="btnSavePersonalTask"><i class="fa-solid fa-check"></i> حفظ التغييرات</button>
      </div>
    </div>
  `, true);

  // زر إضافة ملاحظة
  $("#btnSaveNote").addEventListener("click", async () => {
    const txtArea = $("#edNewNoteText");
    const val = txtArea.value.trim();
    if (!val) return;

    const btn = $("#btnSaveNote");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الإضافة…`;

    try {
      const newNote = {
        text: val,
        createdAt: new Date().toISOString(),
        authorId: State.user.uid,
        authorName: State.user.name
      };

      const currentTask = State.personalTasks.find(x => x.id === taskId);
      const updatedNotes = [...(currentTask.notes || []), newNote];

      await S.updatePersonalTask(taskId, { notes: updatedNotes });
      txtArea.value = "";
      
      currentTask.notes = updatedNotes;
      
      // إعادة رسم الملاحظات داخل المودال فوراً
      $("#modalNotesContainer").innerHTML = renderModalNotesList(updatedNotes);
      
      toast("تمت إضافة الملاحظة بنجاح");
      
      // التحديث في الخلفية للمزامنة وتحديث الصفحة خلف المودال
      loadAllData().then(() => {
        renderMyNotes();
      });
    } catch (err) {
      toast("عذراً، فشل إضافة الملاحظة", "err");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-plus"></i> إضافة ملاحظة`;
    }
  });

  // حفظ التغييرات
  $("#btnSavePersonalTask").addEventListener("click", async () => {
    const btn = $("#btnSavePersonalTask");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الحفظ…`;

    try {
      await S.updatePersonalTask(taskId, {
        title: $("#edTitle").value.trim(),
        description: $("#edDesc").value.trim(),
        priority: $("#edPriority").value,
        status: $("#edStatus").value,
        dueDate: $("#edDueDate").value || null
      });

      await showActionSuccess({
        title: "تم حفظ التعديلات",
        message: "تم تحديث بيانات المهمة الشخصية بنجاح."
      });
      await loadAllData();
      renderMyNotes();
    } catch (err) {
      toast("عذراً، فشل تعديل المهمة", "err");
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-check"></i> حفظ التغييرات`;
    }
  });

  // حذف المهمة
  $("#btnDeletePersonalTask").addEventListener("click", () => {
    openConfirmModal({
      title: "حذف المهمة الشخصية",
      message: "هل أنت متأكد من رغبتك في حذف هذه المهمة وجميع الملاحظات المرتبطة بها نهائياً؟ لا يمكن التراجع عن هذا الإجراء.",
      confirmText: "نعم، حذف",
      confirmType: "danger",
      onConfirm: async () => {
        await S.deletePersonalTask(taskId);
        toast("تم حذف المهمة بنجاح");
        closeModal();
        await loadAllData();
        renderMyNotes();
      }
    });
  });
}

function renderModalNotesList(notes) {
  if (!notes.length) {
    return `<div style="text-align:center;padding:20px;color:var(--ink-muted);font-size:12.5px;">لا توجد ملاحظات مضافة بعد.</div>`;
  }

  // ترتيب تصاعدي لعرض المحادثة من الأقدم للأحدث
  const sorted = [...notes].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return sorted.map(n => {
    const dateStr = new Date(n.createdAt).toLocaleDateString("ar-SA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
    return `
      <div class="note-item" style="margin-bottom:8px">
        <div class="note-text">${esc(n.text)}</div>
        <div class="note-meta">
          <span style="font-weight:700;"><i class="fa-regular fa-user"></i> ${esc(n.authorName)}</span>
          <span><i class="fa-regular fa-clock"></i> ${dateStr}</span>
        </div>
      </div>
    `;
  }).join("");
}

/* ════════════════ 6. الإشعارات (Notifications) ════════════════ */
function renderNotifs(el){
  if(!el) el = $("#viewHost");
  const filter = State.notifFilter || "all";
  let list = State.notifs;
  if(filter === "unread") list = list.filter(n => !n.read);
  const unreadCount = State.notifs.filter(n => !n.read).length;

  el.innerHTML = `
    ${pageHead("Alerts", "الإشعارات", "مركز", "التنبيهات والإشعارات", "تتبع كافة التنبيهات المباشرة والإدارية المستلمة.")}
    <div class="toolbar">
      <div class="filters">
        <button class="chip ${filter==="all"?"active":""}" data-nfilter="all">الكل (${State.notifs.length})</button>
        <button class="chip ${filter==="unread"?"active":""}" data-nfilter="unread">غير المقروءة (${unreadCount})</button>
      </div>
      <div class="spacer"></div>
      ${unreadCount > 0 ? `<button class="btn btn-secondary" id="readAllNotifsBtn"><i class="fa-solid fa-check-double"></i> تحديد الكل كمقروء</button>` : ""}
    </div>
    <div style="margin-top:16px;">
      ${list.length ? list.map(n => `
        <div class="card notif-card-item" data-notif-id="${n.id}" data-notif-link="${esc(n.link||"")}" style="margin-bottom:10px;padding:16px;cursor:pointer;transition:all 0.15s;${!n.read?'border-right:4px solid var(--gold-deep);background:var(--bg-subtle)':''}">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <h4 style="margin:0;font-size:15px;color:var(--ink);display:flex;align-items:center;gap:8px">
              ${!n.read ? `<span style="width:8px;height:8px;border-radius:50%;background:var(--gold-deep)"></span>` : ""}
              ${esc(n.title)}
            </h4>
            <span style="font-size:11px;color:var(--ink-faint)">${timeAgo(n.createdAt)}</span>
          </div>
          <p style="font-size:13px;color:var(--ink-mid);margin-top:6px;">${esc(n.body)}</p>
        </div>
      `).join("") : emptyState("لا توجد إشعارات حالياً")}
    </div>
  `;

  $$("[data-nfilter]").forEach(b => b.addEventListener("click", () => {
    State.notifFilter = b.dataset.nfilter;
    renderNotifs(el);
  }));

  $$(".notif-card-item").forEach(card => card.addEventListener("click", async () => {
    const id = card.dataset.notifId;
    const link = card.dataset.notifLink;
    const item = State.notifs.find(n => n.id === id);
    if(item && !item.read){
      await S.markNotifRead(id).catch(()=>{});
    }
    if(link){
      navigate(link);
    }
  }));

  if($("#readAllNotifsBtn")){
    $("#readAllNotifsBtn").addEventListener("click", async ()=>{
      const unreadIds = State.notifs.filter(n=>!n.read).map(n=>n.id);
      if(unreadIds.length){
        await S.markAllNotifsRead(unreadIds).catch(()=>{});
        toast("تم تحديد الإشعارات كمقروءة");
        renderNotifs(el);
      }
    });
  }
}

function renderNotifBadge(){
  const count = State.notifs.filter(n => !n.read).length;
  const dot = $("#tbDot");
  if(dot){
    if(count > 0){
      dot.classList.add("show");
      dot.textContent = count > 9 ? "9+" : count;
    } else {
      dot.classList.remove("show");
      dot.textContent = "";
    }
  }
}



/* ════════════════ Theme Engine Manager ════════════════ */
function getSavedTheme() {
  return localStorage.getItem("portal_theme") || "classic";
}

function applyTheme(themeName, saveToFirestore = true) {
  const validThemes = ["classic", "light", "dark"];
  const theme = validThemes.includes(themeName) ? themeName : "classic";

  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("portal_theme", theme);

  if (State && State.user) {
    State.user.themePreference = theme;
    if (saveToFirestore && State.user.uid) {
      S.updateUserProfile(State.user.uid, { themePreference: theme }).catch(err => {
        console.warn("[Theme] Failed to sync theme to Firestore:", err);
      });
    }
  }
}

/* ════════════════ 8. الإعدادات (Settings) ════════════════ */
async function renderSettings(el){
  if(!el) el = $("#viewHost");
  const u = State.user;
  const currentTheme = getSavedTheme();

  // فحص بيئة آيفون ووضع الـ PWA
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || 
                (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

  // فحص حالة أذونات الإشعارات الحالية
  const perm = typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";

  // طباعة تشخيصية للكونسول لمساعدة الفحص عن بعد
  console.log("%c[Portal Diagnostic] Device Detection Details:", "color:#2563eb;font-weight:bold", {
    isIOS: isIOS,
    standaloneInNavigator: window.navigator ? window.navigator.standalone : undefined,
    displayModeStandalone: window.matchMedia?.("(display-mode: standalone)").matches,
    isStandaloneCalculated: isStandalone,
    permissionState: perm,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints
  });

  let notifStatusBadge = "";
  if(perm === "granted"){
    notifStatusBadge = `<span class="status-badge" style="background:var(--success-bg);color:var(--success)"><i class="fa-solid fa-circle-check"></i> الإشعارات مفعّلة</span>`;
  } else if(perm === "denied"){
    notifStatusBadge = `<span class="status-badge" style="background:var(--danger-bg);color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> الإشعارات محظورة</span>`;
  } else if(isIOS && !isStandalone){
    notifStatusBadge = `<span class="status-badge" style="background:rgba(217,119,6,0.12);color:var(--gold-deep)"><i class="fa-solid fa-circle-exclamation"></i> يتطلب تثبيت PWA</span>`;
  } else if(perm === "unsupported"){
    notifStatusBadge = `<span class="status-badge" style="background:var(--danger-bg);color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> غير مدعومة</span>`;
  } else {
    notifStatusBadge = `<span class="status-badge" style="background:rgba(217,119,6,0.12);color:var(--gold-deep)"><i class="fa-solid fa-clock"></i> بانتظار التفعيل</span>`;
  }

  // سنقوم ببناء الواجهة مباشرة مع حاوية فارغة (Skeleton) لقائمة الأجهزة لتفادي أي بطء في الانتقال
  el.innerHTML = `
    ${pageHead("Settings", "الإعدادات", "إعدادات", "الحساب والتطبيق", "تفضيلات الحساب والإشعارات والمظهر وتراخيص الأجهزة.")}

    <!-- قسم المظهر والثيمات -->
    <div class="card" style="margin-top:16px;">
      <div class="card-head">
        <div>
          <h3 style="margin:0"><i class="fa-solid fa-palette" style="color:var(--gold-deep);margin-left:8px"></i> المظهر</h3>
          <p style="font-size:12.5px;color:var(--ink-muted);margin:4px 0 0 0">اختر المظهر المناسب لك أثناء استخدام بوابة الموظفين.</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:16px;margin-top:18px">
        
        <!-- 1. Erth Classic -->
        <div class="theme-card-option ${currentTheme === 'classic' ? 'active' : ''}" data-theme-choice="classic" style="background: var(--bg-paper); border: 2px solid ${currentTheme === 'classic' ? 'var(--gold-deep)' : 'var(--line)'}; border-radius: 14px; padding: 18px 16px; cursor: pointer; transition: all 0.25s ease; position: relative; text-align: center;">
          ${currentTheme === 'classic' ? `<div style="position: absolute; top: 10px; left: 10px; background: var(--gold-deep); color: #fff; font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 999px;">✓ محدد</div>` : ''}
          <div style="height: 75px; background: #F8F5EE; border: 1.5px solid rgba(184,142,54,0.3); border-radius: 10px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px;">
            <div style="width: 28px; height: 100%; background: #FAF7F2; border-radius: 4px; border: 1px solid rgba(184,142,54,0.25);"></div>
            <div style="flex: 1; height: 100%; display: flex; flex-direction: column; gap: 5px;">
              <div style="height: 14px; background: #947124; border-radius: 3px; width: 60%;"></div>
              <div style="height: 24px; background: #FFFFFF; border-radius: 4px; border: 1px solid rgba(184,142,54,0.15);"></div>
            </div>
          </div>
          <div style="font-size: 14.5px; font-weight: 800; color: var(--ink); margin-bottom: 2px;">Erth Classic</div>
          <div style="font-size: 12px; color: var(--ink-muted);">الثيم الأساسي</div>
        </div>

        <!-- 2. Light Theme -->
        <div class="theme-card-option ${currentTheme === 'light' ? 'active' : ''}" data-theme-choice="light" style="background: var(--bg-paper); border: 2px solid ${currentTheme === 'light' ? 'var(--gold-deep)' : 'var(--line)'}; border-radius: 14px; padding: 18px 16px; cursor: pointer; transition: all 0.25s ease; position: relative; text-align: center;">
          ${currentTheme === 'light' ? `<div style="position: absolute; top: 10px; left: 10px; background: var(--gold-deep); color: #fff; font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 999px;">✓ محدد</div>` : ''}
          <div style="height: 75px; background: #F9F9F8; border: 1.5px solid rgba(0,0,0,0.12); border-radius: 10px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px;">
            <div style="width: 28px; height: 100%; background: #F3F2EF; border-radius: 4px; border: 1px solid rgba(0,0,0,0.08);"></div>
            <div style="flex: 1; height: 100%; display: flex; flex-direction: column; gap: 5px;">
              <div style="height: 14px; background: #947124; border-radius: 3px; width: 60%;"></div>
              <div style="height: 24px; background: #FFFFFF; border-radius: 4px; border: 1px solid rgba(0,0,0,0.1);"></div>
            </div>
          </div>
          <div style="font-size: 14.5px; font-weight: 800; color: var(--ink); margin-bottom: 2px;">Light</div>
          <div style="font-size: 12px; color: var(--ink-muted);">الثيم الأبيض</div>
        </div>

        <!-- 3. Dark Theme -->
        <div class="theme-card-option ${currentTheme === 'dark' ? 'active' : ''}" data-theme-choice="dark" style="background: var(--bg-paper); border: 2px solid ${currentTheme === 'dark' ? 'var(--gold-deep)' : 'var(--line)'}; border-radius: 14px; padding: 18px 16px; cursor: pointer; transition: all 0.25s ease; position: relative; text-align: center;">
          ${currentTheme === 'dark' ? `<div style="position: absolute; top: 10px; left: 10px; background: var(--gold-deep); color: #fff; font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 999px;">✓ محدد</div>` : ''}
          <div style="height: 75px; background: #141210; border: 1.5px solid rgba(212,175,55,0.3); border-radius: 10px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px;">
            <div style="width: 28px; height: 100%; background: #26221E; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06);"></div>
            <div style="flex: 1; height: 100%; display: flex; flex-direction: column; gap: 5px;">
              <div style="height: 14px; background: #D4AF37; border-radius: 3px; width: 60%;"></div>
              <div style="height: 24px; background: #1E1B18; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);"></div>
            </div>
          </div>
          <div style="font-size: 14.5px; font-weight: 800; color: var(--ink); margin-bottom: 2px;">Dark</div>
          <div style="font-size: 12px; color: var(--ink-muted);">الثيم الأسود</div>
        </div>

      </div>
    </div>

    <!-- تنبيه خاص لأجهزة الآيفون في حال عدم التثبيت كـ PWA -->
    ${(isIOS && !isStandalone) ? `
      <div class="card" style="margin-top:16px;border-right:4px solid var(--info);background:rgba(30,64,175,0.04);padding:18px">
        <div style="display:flex;align-items:flex-start;gap:14px">
          <i class="fa-solid fa-mobile-screen-button" style="font-size:26px;color:var(--info);margin-top:2px"></i>
          <div>
            <h4 style="margin:0 0 6px 0;font-size:15px;font-weight:800;color:var(--ink)">تنبيه هام لأجهزة آيفون (iPhone iOS)</h4>
            <p style="font-size:13px;color:var(--ink-mid);line-height:1.6;margin:0 0 12px 0">
              تتطلب أنظمة Apple iOS تثبيت البوابة كـ تطبيق (PWA) على الشاشة الرئيسية أولاً لتلقي الإشعارات في الخلفية وحالة إغلاق الشاشة.
            </p>
            <div style="font-size:12.5px;color:var(--ink);background:var(--bg-paper);padding:12px;border-radius:var(--r-md);border:1px solid var(--line-soft)">
              <strong>خطوات التثبيت والتفعيل السريعة:</strong><br>
              1. اضغط على زر المشاركة <i class="fa-solid fa-square-share-nodes" style="color:var(--info)"></i> أسفل متصفح Safari.<br>
              2. اختر <strong>"إضافة إلى الشاشة الرئيسية" (Add to Home Screen)</strong>.<br>
              3. افتح تطبيق البوابة الجديد من الشاشة الرئيسية واضغط زر "تفعيل الإشعارات الآن" أدناه.
            </div>
          </div>
        </div>
      </div>
    ` : ""}

    <!-- بطاقة التحكم الرئيسية بالإشعارات -->
    <div class="card" style="margin-top:16px;">
      <div class="card-head">
        <div>
          <h3 style="margin:0">مركز تفعيل وإدارة الإشعارات</h3>
          <p style="font-size:12.5px;color:var(--ink-muted);margin:4px 0 0 0">حالة التوصيل بالجهاز والتخزين السحابي للأذونات</p>
        </div>
        ${notifStatusBadge}
      </div>

      <div style="margin-top:16px;padding:16px;background:var(--bg-subtle);border-radius:var(--r-md);border:1px solid var(--line-soft)">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--ink)">حالة إذن المتصفح والجهاز الحالي</div>
            <div style="font-size:12.5px;color:var(--ink-muted);margin-top:2px">
              ${perm === "granted" ? "الإشعارات مفعّلة ومسجلة في هذا الجهاز." : (perm === "denied" ? "تم رفض الإذن سابقاً. يرجى إلغاء الحظر من إعدادات المتصفح." : (isIOS && !isStandalone ? "التنبيهات غير مدعومة في متصفح Safari العادي. يرجى تثبيت البوابة كـ PWA أولاً." : "لم يتم طلب الإذن بعد. اضغط تفعيل لبدء الاستلام."))}
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${perm === "granted" ? `
              <button class="btn btn-primary" id="sendTestNotifBtn"><i class="fa-solid fa-paper-plane"></i> إرسال إشعار تجريبي</button>
              <button class="btn btn-secondary" id="disableNotifsBtn"><i class="fa-solid fa-bell-slash"></i> إيقاف الإشعارات</button>
            ` : (perm === "denied" ? `
              <button class="btn btn-secondary" disabled><i class="fa-solid fa-lock"></i> الإذن محظور</button>
            ` : (isIOS && !isStandalone ? `
              <!-- لا يتم عرض أي زر لتفعيل الإشعارات في متصفح Safari العادي على iOS لتجنب المحاولات الخاطئة -->
            ` : `
              <button class="btn btn-primary btn-lg" id="enableNotifsBtn"><i class="fa-solid fa-bell"></i> تفعيل الإشعارات الآن</button>
            `))}
          </div>
        </div>

        <div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--line-soft); display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn btn-secondary btn-sm" id="testIosPermBtn" style="background: #9c6e38; color: #fff; border: none; font-size: 12px; padding: 6px 12px;"><i class="fa-solid fa-shield-halved"></i> TEST iOS PERMISSION</button>
          <button class="btn btn-secondary btn-sm" id="showNotifDebugBtn" style="font-size: 12px; padding: 6px 12px;"><i class="fa-solid fa-terminal"></i> لوحة التشخيص (Debug Panel)</button>
        </div>

        ${perm === "denied" ? `
          <div style="margin-top:14px;padding:12px;background:rgba(220,38,38,0.06);border-radius:var(--r-sm);border:1px solid rgba(220,38,38,0.2);font-size:12.5px;color:var(--danger)">
            <i class="fa-solid fa-circle-exclamation"></i> <strong>طريقة إلغاء الحظر:</strong> 
            ${isIOS ? `
              تم حظر الإشعارات لهذا التطبيق على آيفون. لإلغاء الحظر: اذهب إلى إعدادات الآيفون (Settings) ➔ الإشعارات (Notifications) ➔ اختر "بوابة إرث" ➔ قم بتفعيل "السماح بالإشعارات" (Allow Notifications). أو قم بحذف التطبيق من الشاشة الرئيسية وإعادة تثبيته.
            ` : `
              اضغط على أيقونة الإعدادات أو القفل <i class="fa-solid fa-sliders"></i> في شريط عنوان المتصفح ➔ اختر "إعدادات الموقع" (Site Settings) ➔ غيّر إذن الإشعارات إلى "سماح" (Allow) ثم أعد تحميل الصفحة.
            `}
          </div>
        ` : ""}
      </div>

      <!-- قائمة الأجهزة - سيتم تعبئتها لاحقاً بشكل غير متزامن لتفادي بطء الواجهة -->
      <div id="userDevicesContainer" style="margin-top:18px">
        <h4 style="font-size:14px;font-weight:700;color:var(--ink);margin-bottom:10px">الأجهزة المسجلة لتلقي الإشعارات</h4>
        <div style="font-size:12.5px;color:var(--ink-muted)">
          <i class="fa-solid fa-spinner fa-spin" style="margin-left:6px;color:var(--gold-deep)"></i> جاري تحميل قائمة الأجهزة المسجلة…
        </div>
      </div>
    </div>

    <!-- تفضيلات الإشعارات حسب النوع -->
    <div class="card" style="margin-top:16px;">
      <div class="card-head"><h3>تفضيلات أنواع التنبيهات</h3></div>
      <div style="display:flex;flex-direction:column;gap:14px;margin-top:12px">
        ${Object.entries(NOTIF_PREFS).map(([k,v])=>`
          <label style="display:flex;align-items:center;justify-content:space-between;font-size:14px;color:var(--ink)">
            <span><i class="fa-solid ${v.icon}" style="margin-left:8px;color:var(--gold-deep)"></i> ${v.label}</span>
            <input type="checkbox" data-npref="${k}" ${State.notifPrefs[k]!==false?'checked':''}>
          </label>
        `).join("")}
      </div>
    </div>

    <!-- قسم إعدادات الحضور والانصراف الجغرافي (للموارد البشرية والمدير التنفيذي والمسؤول التقني) -->
    ${(u.role === "hr" || u.role === "executive" || isTechAdmin(u)) ? `
      <div class="card" style="margin-top:16px;">
        <div class="card-head">
          <div>
            <h3 style="margin:0"><i class="fa-solid fa-location-dot" style="color:var(--gold-deep);margin-left:8px"></i> إعدادات الحضور والانصراف والنطاق الجغرافي</h3>
            <p style="font-size:12.5px;color:var(--ink-muted);margin:4px 0 0 0">تحديد إحداثيات مقر الجمعية ونصف القطر المسموح به وأوقات الدوام الرسمية.</p>
          </div>
        </div>

        <form id="formAttendanceSettings" style="display:flex; flex-direction:column; gap:16px; margin-top:16px;">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px;">
            <div>
              <label style="display:block; font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:6px;">خط العرض (Latitude):</label>
              <input type="number" step="any" id="attLat" value="${State.attendanceSettings?.officeLat ?? 31.334302}" required style="width:100%; padding:10px; border-radius:var(--r-md); border:1px solid var(--line-soft); background:var(--bg-paper); font-size:13.5px; font-weight:600; color:var(--ink); outline:none;">
            </div>
            <div>
              <label style="display:block; font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:6px;">خط الطول (Longitude):</label>
              <input type="number" step="any" id="attLng" value="${State.attendanceSettings?.officeLng ?? 37.338730}" required style="width:100%; padding:10px; border-radius:var(--r-md); border:1px solid var(--line-soft); background:var(--bg-paper); font-size:13.5px; font-weight:600; color:var(--ink); outline:none;">
            </div>
            <div>
              <label style="display:block; font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:6px;">نصف القطر المسموح (بالمتر):</label>
              <input type="number" min="10" max="5000" id="attRadius" value="${State.attendanceSettings?.allowedRadius ?? 100}" required style="width:100%; padding:10px; border-radius:var(--r-md); border:1px solid var(--line-soft); background:var(--bg-paper); font-size:13.5px; font-weight:600; color:var(--ink); outline:none;">
            </div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px;">
            <div>
              <label style="display:block; font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:6px;">وقت بداية الدوام الرسمي:</label>
              <input type="time" id="attStartTime" value="${State.attendanceSettings?.workStartTime ?? '08:00'}" required style="width:100%; padding:10px; border-radius:var(--r-md); border:1px solid var(--line-soft); background:var(--bg-paper); font-size:13.5px; font-weight:600; color:var(--ink); outline:none;">
            </div>
            <div>
              <label style="display:block; font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:6px;">وقت نهاية الدوام الرسمي:</label>
              <input type="time" id="attEndTime" value="${State.attendanceSettings?.workEndTime ?? '16:00'}" required style="width:100%; padding:10px; border-radius:var(--r-md); border:1px solid var(--line-soft); background:var(--bg-paper); font-size:13.5px; font-weight:600; color:var(--ink); outline:none;">
            </div>
            <div>
              <label style="display:block; font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:6px;">مهلة السماح للتأخير (بالدقائق):</label>
              <input type="number" min="0" max="120" id="attGraceMins" value="${State.attendanceSettings?.graceMinutes ?? 15}" required style="width:100%; padding:10px; border-radius:var(--r-md); border:1px solid var(--line-soft); background:var(--bg-paper); font-size:13.5px; font-weight:600; color:var(--ink); outline:none;">
            </div>
          </div>

          <div>
            <label style="display:block; font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:6px;">العنوان النصي لمقر الجمعية:</label>
            <input type="text" id="attAddress" value="${esc(State.attendanceSettings?.address || 'شركة حمود عيد للتجارة والتسويق، صلاح الدين، السديرية، القريات 77453')}" required style="width:100%; padding:10px; border-radius:var(--r-md); border:1px solid var(--line-soft); background:var(--bg-paper); font-size:13px; color:var(--ink); outline:none;">
          </div>

          <div style="display:flex; justify-content:flex-end;">
            <button type="submit" class="btn btn-primary" id="btnSaveAttendanceSettings" style="gap:8px;">
              <i class="fa-solid fa-floppy-disk"></i> حفظ إعدادات الحضور والنطاق
            </button>
          </div>
        </form>
      </div>
    ` : ""}
  `;

  const formAttSet = $("#formAttendanceSettings", el);
  if (formAttSet) {
    formAttSet.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#btnSaveAttendanceSettings");
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الحفظ…`;

      try {
        const payload = {
          officeLat: parseFloat($("#attLat").value),
          officeLng: parseFloat($("#attLng").value),
          allowedRadius: parseInt($("#attRadius").value, 10),
          workStartTime: $("#attStartTime").value.trim(),
          workEndTime: $("#attEndTime").value.trim(),
          graceMinutes: parseInt($("#attGraceMins").value, 10),
          address: $("#attAddress").value.trim()
        };
        const updated = await S.saveAttendanceSettings(payload, State.user);
        State.attendanceSettings = updated;
        toast("✅ تم حفظ إعدادات الحضور والنطاق الجغرافي بنجاح", "ok");
      } catch (err) {
        toast("فشل حفظ الإعدادات: " + err.message, "err");
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> حفظ إعدادات الحضور والنطاق`;
      }
    });
  }

  // ربط أحداث تغيير الثيم
  $$("[data-theme-choice]", el).forEach(card => {
    card.addEventListener("click", () => {
      const chosenTheme = card.dataset.themeChoice;
      applyTheme(chosenTheme, true);
      renderSettings(el);
      const labels = { classic: "Erth Classic (الأصلي)", light: "Light (الأبيض)", dark: "Dark (الأسود)" };
      toast(`تم تفعيل مظهر ${labels[chosenTheme] || chosenTheme}`);
    });
  });

  // نداء غير متزامن لجلب الأجهزة من Firestore دون تعطيل المعاينة الفورية
  S.listUserTokens(u.uid).then((userTokens) => {
    const container = $("#userDevicesContainer");
    if(!container) return;
    container.innerHTML = `
      <h4 style="font-size:14px;font-weight:700;color:var(--ink);margin-bottom:10px">الأجهزة المسجلة لتلقي الإشعارات (${userTokens.length})</h4>
      ${userTokens.length ? `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${userTokens.map(t => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-paper);border-radius:var(--r-sm);border:1px solid var(--line-soft);font-size:13px">
              <div style="display:flex;align-items:center;gap:10px">
                <i class="fa-solid fa-display" style="color:var(--gold-deep)"></i>
                <div>
                  <div style="font-weight:700;color:var(--ink)">${esc(t.device || "جهاز غير محدد")}</div>
                  <div style="font-size:11px;color:var(--ink-faint)">آخر تواجد: ${esc(t.lastSeen ? new Date(t.lastSeen.seconds * 1000).toLocaleString("ar-SA") : "—")}</div>
                </div>
              </div>
              <span class="status-badge" style="font-size:11px;background:var(--bg-subtle)">مُوثّق في Firestore</span>
            </div>
          `).join("")}
        </div>
      ` : `<div style="font-size:12.5px;color:var(--ink-muted)">لا توجد أجهزة مسجلة حالياً. قم بتفعيل الإشعارات أعلاه لتسجيل هذا الجهاز.</div>`}
    `;
  }).catch((err) => {
    console.warn("[Portal] listUserTokens async load failed:", err);
    const container = $("#userDevicesContainer");
    if(container) {
      container.innerHTML = `
        <h4 style="font-size:14px;font-weight:700;color:var(--ink);margin-bottom:10px">الأجهزة المسجلة لتلقي الإشعارات</h4>
        <div style="font-size:12.5px;color:var(--danger)">تعذّر تحميل قائمة الأجهزة المسجلة.</div>
      `;
    }
  });

  // ربط أحداث الإعدادات
  if($("#enableNotifsBtn")){
    $("#enableNotifsBtn").addEventListener("click", () => {
      console.log("[iOS Push Debug] Button clicked, starting permission flow");
      console.log("[iOS Push Debug] navigator.standalone value:", window.navigator ? window.navigator.standalone : "undefined");
      console.log("[iOS Push Debug] display-mode standalone matches:", window.matchMedia?.("(display-mode: standalone)").matches);
      console.log("[iOS Push Debug] Notification.permission BEFORE request:", typeof Notification !== "undefined" ? Notification.permission : "undefined");

      const btn = $("#enableNotifsBtn");
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري التفعيل...`;

      // 1. طلب إذن الإشعارات بشكل متزامن تماماً دون أي await
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        console.log("[iOS Push Debug] Requesting permission synchronously in user gesture context");
        Notification.requestPermission().then((perm) => {
          console.log("[iOS Push Debug] Notification.requestPermission resolved to:", perm);
          proceedWithActivation(perm);
        }).catch((err) => {
          console.error("[iOS Push Debug] requestPermission failed synchronously:", err);
          proceedWithActivation("denied");
        });
      } else {
        const currentPerm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
        console.log("[iOS Push Debug] Notification.permission is not 'default', proceeding directly with:", currentPerm);
        proceedWithActivation(currentPerm);
      }

      // 2. معالجة باقي العمليات غير المتزامنة بعد حسم الحصول على الإذن
      async function proceedWithActivation(perm) {
        if(perm === "denied"){
          toast("تم رفض إذن الإشعارات من المتصفح", "err");
          renderSettings(el);
          return;
        }
        if(perm !== "granted"){
          toast("تعذّر تفعيل الإشعارات في هذا المتصفح", "err");
          renderSettings(el);
          return;
        }

        try {
          console.log("[iOS Push Debug] Permission is granted. Calling S.initMessaging...");
          const res = await S.initMessaging(u.uid);
          console.log("[iOS Push Debug] S.initMessaging response:", res);

          if(res.ok){
            showSuccessAnimation("تم تفعيل الإشعارات بنجاح!", "تم تسجيل جهازك في الخدمة وحفظ رمز التوصيل في Firestore بنجاح.", () => {
              renderSettings(el);
            });
          } else {
            toast("تعذّر تفعيل الإشعارات في هذا المتصفح", "err");
            renderSettings(el);
          }
        } catch (error) {
          console.error("[iOS Push Debug] Error caught during post-permission setup:", error);
          console.error("[iOS Push Debug] Error details - message:", error.message, "stack:", error.stack);
          toast("تعذّر تفعيل الإشعارات بسبب خطأ داخلي", "err");
          renderSettings(el);
        }
      }
    });
  }

  if($("#testIosPermBtn")){
    $("#testIosPermBtn").addEventListener("click", () => {
      console.log("[TEST iOS PERMISSION] Clicked!");
      if (!("Notification" in window)) {
        alert("Notification API غير مدعومة");
        return;
      }

      console.log("permission before:", Notification.permission);
      alert("Permission before: " + Notification.permission);

      Notification.requestPermission()
        .then(permission => {
          console.log("permission result:", permission);
          alert("Permission: " + permission);
        })
        .catch(error => {
          console.error("permission error:", error);
          alert("Error: " + error);
        });
    });
  }

  if($("#showNotifDebugBtn")){
    $("#showNotifDebugBtn").addEventListener("click", async () => {
      const btn = $("#showNotifDebugBtn");
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري التشخيص...`;
      try {
        const d = await getNotifDebugData();
        openNotifDebugModal(d);
      } catch(e) {
        alert("Error gathering debug data: " + e.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-terminal"></i> لوحة التشخيص (Debug Panel)`;
      }
    });
  }

  if($("#disableNotifsBtn")){
    $("#disableNotifsBtn").addEventListener("click", async () => {
      await S.disableMessaging(u.uid);
      toast("تم إيقاف الإشعارات لهذا الجهاز");
      renderSettings(el);
    });
  }

  if($("#sendTestNotifBtn")){
    $("#sendTestNotifBtn").addEventListener("click", async () => {
      const btn = $("#sendTestNotifBtn");
      btn.disabled = true;
      try{
        await S.pushNotification({
          userId: u.uid,
          type: "system",
          title: "إشعار تجريبي من البوابة 🔔",
          body: `مرحباً ${u.name}، هذا إشعار تجريبي لتأكيد كفاءة وتوصيل الإشعارات على جهازك.`,
          link: "notifs"
        });
        S.showLocalNotification("إشعار تجريبي من البوابة 🔔", `مرحباً ${u.name}، هذا إشعار تجريبي لتأكيد كفاءة التوصيل.`);
        showSuccessAnimation("تم إرسال الإشعار التجريبي!", "وصل الإشعار التجريبي لمركز الإشعارات والجهاز بنجاح.");
      }catch(e){
        toast("تعذّر إرسال الإشعار التجريبي", "err");
      }finally{
        btn.disabled = false;
      }
    });
  }

  $$("[data-npref]", el).forEach(chk => {
    chk.addEventListener("change", async ()=>{
      State.notifPrefs[chk.dataset.npref] = chk.checked;
      await S.setNotifPrefs(u.uid, State.notifPrefs);
      toast("تم حفظ تفضيلات الإشعارات");
    });
  });
}

/* ════════════════ 9. الملفات (Files) ════════════════ */

/* ════════ مساعدة النافذة والشريط ════════ */
function openSidebar(){
  const sb = $("#sidebar");
  const sc = $("#scrim");
  if(sb) sb.classList.add("open");
  if(sc) sc.classList.add("show");
  document.body.classList.add("sidebar-menu-open");
}

function closeSidebar(){
  const sb = $("#sidebar");
  if(sb) sb.classList.remove("open");
  const sc = $("#scrim");
  if(sc) sc.classList.remove("show");
  document.body.classList.remove("sidebar-menu-open");
}

const menuToggleBtn = $("#menuToggle");
if(menuToggleBtn){
  menuToggleBtn.addEventListener("click", (e)=>{
    e.stopPropagation();
    const sb = $("#sidebar");
    if(sb){
      const isOpen = sb.classList.contains("open");
      if(isOpen){
        closeSidebar();
      } else {
        openSidebar();
      }
    }
  });
}

const scrimElement = $("#scrim");
if(scrimElement){
  scrimElement.addEventListener("click", (e) => {
    e.preventDefault();
    closeSidebar();
  });
  scrimElement.addEventListener("touchstart", (e) => {
    e.preventDefault();
    closeSidebar();
  }, { passive: false });

  // منع سحب وحركة الصفحة الخلفية عند اللمس على الشفافية
  scrimElement.addEventListener("touchmove", (e) => {
    e.preventDefault();
  }, { passive: false });
}

// إغلاق القائمة الجانبية فورياً عند الضغط أو اللمس خارج القائمة على الجوال والديسكتب
document.addEventListener("pointerdown", (e) => {
  const sb = $("#sidebar");
  if (!sb || !sb.classList.contains("open")) return;
  const isInsideSidebar = sb.contains(e.target);
  const isMenuToggle = $("#menuToggle")?.contains(e.target);
  if (!isInsideSidebar && !isMenuToggle) {
    closeSidebar();
  }
});

if($("#bellBtn")){
  $("#bellBtn").addEventListener("click", () => navigate("notifs"));
}

function renderNotifPanel(){}

/* ════════════════ المعالجة المباشرة للإشعارات والتنقّل العميق ════════════════ */
async function handleDeepLinkTarget(link, refId) {
  if (!link) return;
  let targetView = link;
  if (link === "feedback") targetView = "suggestions";

  if (VIEW_META[targetView]) {
    navigate(targetView);
  }

  if (!refId) return;

  if (targetView === "announcements") {
    setTimeout(async () => {
      let item = window.announcementsCache?.find(a => a.id === refId);
      if (!item) {
        const currentUser = window.State?.user;
        const list = await S.listAnnouncements(currentUser);
        item = list?.find(a => a.id === refId);
      }
      if (item && typeof openAnnouncementDetailsModal === "function") {
        openAnnouncementDetailsModal(item);
      }
    }, 450);
  } else if (targetView === "suggestions") {
    setTimeout(() => {
      const card = document.querySelector(`[data-suggestion-id="${refId}"]`) || document.getElementById(`suggestion_${refId}`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.style.outline = "2px solid var(--gold-deep)";
        card.style.outlineOffset = "2px";
        setTimeout(() => { card.style.outline = "none"; }, 3500);
      }
    }, 500);
  }
}

function checkUrlHashDeepLink() {
  const hash = window.location.hash.slice(1);
  if (!hash) return false;
  const parts = hash.split(":");
  const link = parts[0];
  const refId = parts[1] || "";
  if (link && (VIEW_META[link] || link === "feedback")) {
    handleDeepLinkTarget(link, refId);
    return true;
  }
  return false;
}

if (typeof S !== "undefined" && S.onSwMessage) {
  S.onSwMessage((data) => {
    if (data && data.kind === "notification-click") {
      handleDeepLinkTarget(data.link, data.refId);
    }
  });
}

window.addEventListener("hashchange", () => {
  checkUrlHashDeepLink();
});

/* ════════ طلب إذن الإشعارات الهادئ والأنيق ════════ */
function checkAndShowNotificationBanner() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  if (localStorage.getItem("erth_notif_banner_dismissed") === "true") return;

  const main = document.querySelector(".main");
  if (!main || document.getElementById("notifPermissionBanner")) return;

  const banner = document.createElement("div");
  banner.id = "notifPermissionBanner";
  banner.style.cssText = "background:var(--bg-paper);border:1px solid var(--line);border-radius:var(--r-md);padding:12px 18px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12.5px;color:var(--ink);box-shadow:var(--shadow-card);flex-wrap:wrap;";
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <i class="fa-solid fa-bell" style="color:var(--gold-deep);font-size:18px;"></i>
      <span>فعّل الإشعارات ليصلك الجديد من التعميمات والمهام والتنبيهات المهمة.</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <button id="btnAllowNotifBanner" class="btn btn-primary btn-sm" style="padding:6px 14px;font-size:12px;border-radius:var(--r-sm);">تفعيل الإشعارات</button>
      <button id="btnDismissNotifBanner" class="btn btn-secondary btn-sm" style="padding:6px 12px;font-size:11.5px;border-radius:var(--r-sm);">لاحقاً</button>
    </div>
  `;

  main.insertBefore(banner, main.firstChild);

  banner.querySelector("#btnAllowNotifBanner").addEventListener("click", async () => {
    const user = window.State?.user;
    if (user) {
      await S.initMessaging(user.uid);
    } else {
      await Notification.requestPermission();
    }
    banner.remove();
  });

  banner.querySelector("#btnDismissNotifBanner").addEventListener("click", () => {
    localStorage.setItem("erth_notif_banner_dismissed", "true");
    banner.remove();
  });
}

/* ════════════════ أدوات عامة (General Tools Hub) ════════════════ */
const GENERAL_TOOLS = [
  {
    id: "pdf_editor",
    title: "محرر PDF",
    desc: "حرّر ملفات PDF مباشرة من المتصفح، أضف النصوص والصور والتوقيع، ورتّب الصفحات وادمجها وقسّمها بسهولة.",
    icon: "fa-solid fa-file-pen",
    color: "var(--gold-deep)"
  },
  {
    id: "financial_calc",
    title: "حاسبة النسب المالية",
    desc: "احسب النسب والزيادات والخصومات والضريبة من أي مبلغ بسهولة.",
    icon: "fa-solid fa-calculator",
    color: "var(--gold-deep)"
  },
  {
    id: "pdf_compress",
    title: "ضغط ملفات PDF",
    desc: "قلل حجم ملفات PDF بجودة ممتازة مباشرة من متصفحك بشكل آمن وسريع دون رفعها لأي خادم.",
    icon: "fa-solid fa-file-pdf",
    color: "var(--danger)"
  },
  {
    id: "img_to_pdf",
    title: "دمج الصور إلى PDF",
    desc: "حوّل عدة صور إلى ملف PDF واحد مرتب بترتيبك الخاص مباشرة في متصفحك بشكل آمن.",
    icon: "fa-solid fa-images",
    color: "var(--success)"
  },
  {
    id: "qr_generator",
    title: "مولّد الباركود",
    desc: "حوّل أي رابط أو نص إلى باركود (QR Code) جاهز للتحميل محلياً بجودة عالية.",
    icon: "fa-solid fa-qrcode",
    color: "var(--info)"
  }
];

function renderTools(el) {
  if(!el) el = $("#viewHost");
  
  const toolsHtml = GENERAL_TOOLS.map(t => `
    <div class="card tool-card" data-tool-id="${t.id}" style="padding: 24px; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; align-items: center; text-align: center; border: 1px solid var(--line-soft); position: relative; overflow: hidden; background: var(--bg-paper);">
      <div class="tool-icon-wrapper" style="width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--bg-subtle); margin-bottom: 16px; transition: all 0.2s ease; border: 1px solid var(--line-soft);">
        <i class="${t.icon}" style="font-size: 28px; color: ${t.color || 'var(--gold-deep)'};"></i>
      </div>
      <h3 style="font-size: 16px; font-weight: 800; color: var(--ink); margin: 0 0 8px 0;">${t.title}</h3>
      <p style="font-size: 12.5px; color: var(--ink-muted); margin: 0; line-height: 1.6; flex-grow: 1;">${t.desc}</p>
    </div>
  `).join("");

  el.innerHTML = `
    ${pageHead("Tools", "أدوات عامة", "حقيبة الأدوات العامة للموظفين", "المحليّة", "أدوات مساعدة لضغط الملفات ومعالجتها بالكامل داخل متصفحك بسرية وسرعة فائقة.")}
    
    <div class="tools-grid-container" style="margin-top: 24px;">
      <div class="tools-grid">
        ${toolsHtml}
      </div>
    </div>
  `;

  // ربط أحداث النقر للبطاقات للانتقال للأداة المعنية
  $$(".tool-card", el).forEach(card => {
    card.addEventListener("click", () => {
      const toolId = card.dataset.toolId;
      navigate(toolId);
    });
  });
}

/* ════════ دمج الصور إلى PDF (Image to PDF Merge) ════════ */
let selectedImages = [];
let generatedPdfBytes = null;

function renderImgToPdf(el) {
  if(!el) el = $("#viewHost");
  selectedImages = [];
  generatedPdfBytes = null;

  el.innerHTML = `
    ${pageHead("Tools", "دمج الصور إلى PDF", "أداة دمج وتحويل الصور إلى PDF", "محلياً", "قم بتحويل وتجميع عدة صور إلى ملف PDF واحد مرتب بالترتيب الذي تفضله بالكامل داخل متصفحك.")}
    
    <div class="card" style="max-width: 800px; margin: 0 auto; padding: 24px;">
      <div id="imgToPdfApp">
        <!-- منطقة الرفع (Double-Bezel) -->
        <div class="double-bezel" style="margin-bottom: 20px;">
          <div class="card" id="imgDropZone" style="padding: 48px 24px; text-align: center; border: 2px dashed var(--line); border-radius: var(--r-md); background: var(--bg-paper); cursor: pointer; transition: all 0.22s var(--ease);">
            <div style="font-size: 56px; color: var(--success); margin-bottom: 16px;"><i class="fa-solid fa-images"></i></div>
            <h3 style="font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 8px;">اسحب وأفلت الصور هنا</h3>
            <p style="font-size: 12.5px; color: var(--ink-muted); margin-bottom: 16px;">تقبل صيغ JPG, PNG, WEBP (يمكنك اختيار صور متعددة)</p>
            <input type="file" id="imgFileInput" accept="image/*" multiple style="display: none;">
            <span class="btn btn-secondary btn-sm" style="pointer-events: none;"><i class="fa-solid fa-folder-open"></i> اختيار الصور</span>
          </div>
        </div>

        <!-- قسم المعاينة والترتيب -->
        <div id="imgPreviewSection" style="display: none; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
            <h4 style="font-size: 14px; font-weight: 700; color: var(--ink); margin: 0;">الصور المحددة (<span id="imgCount">0</span>)</h4>
            <button type="button" class="btn btn-secondary btn-sm" id="btnAddMoreImgs" style="padding: 6px 14px; font-size: 12px;"><i class="fa-solid fa-plus"></i> إضافة المزيد</button>
          </div>
          <div id="imgThumbnailsGrid" class="tools-grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px; background: var(--bg-subtle); padding: 16px; border-radius: var(--r-md); border: 1px solid var(--line-soft);">
            <!-- ستضاف الصور هنا ديناميكياً -->
          </div>
        </div>

        <!-- زر الإجراء الرئيسي -->
        <div id="imgMergeAction" style="display: none; text-align: center; margin-top: 24px;">
          <button type="button" class="btn btn-primary btn-lg" id="btnMergeImages" style="padding: 12px 40px; border-radius: var(--r-pill); font-size: 15px;"><i class="fa-solid fa-file-pdf"></i> دمج وتحويل الصور إلى PDF</button>
        </div>

        <!-- حالة معالجة الدمج -->
        <div id="imgMergeProgress" style="display: none; text-align: center; padding: 32px 0;">
          <div style="font-size: 48px; color: var(--gold-deep); margin-bottom: 16px;"><i class="fa-solid fa-spinner fa-spin"></i></div>
          <h3 style="font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 8px;">جاري دمج ومعالجة الصور…</h3>
          <p style="font-size: 13px; color: var(--ink-muted);">يرجى الانتظار، تتم المعالجة بالكامل محلياً داخل متصفحك.</p>
        </div>

        <!-- حالة النجاح والتحميل -->
        <div id="imgMergeSuccess" style="display: none; text-align: center; padding: 32px 0;">
          <div style="font-size: 64px; color: var(--success); margin-bottom: 20px;"><i class="fa-solid fa-circle-check"></i></div>
          <h3 style="font-size: 18px; font-weight: 800; color: var(--ink); margin-bottom: 8px;">تم دمج الصور بنجاح!</h3>
          <p style="font-size: 13px; color: var(--ink-muted); margin-bottom: 24px;">تم تحويل وتجميع كافة الصور في ملف PDF واحد بنجاح.</p>
          <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary" id="btnMergeAnother" style="padding: 10px 24px; border-radius: var(--r-pill);"><i class="fa-solid fa-rotate-left"></i> دمج صور أخرى</button>
            <button type="button" class="btn btn-primary" id="btnDownloadMerged" style="padding: 10px 32px; border-radius: var(--r-pill);"><i class="fa-solid fa-download"></i> تحميل ملف PDF الناتج</button>
          </div>
        </div>

      </div>
    </div>
  `;

  const dropZone = $("#imgDropZone", el);
  const fileInput = $("#imgFileInput", el);
  const btnAddMore = $("#btnAddMoreImgs", el);
  const btnMerge = $("#btnMergeImages", el);
  const btnMergeAnother = $("#btnMergeAnother", el);
  const btnDownload = $("#btnDownloadMerged", el);

  // إعداد مستمعات الأحداث لمنطقة الرفع
  dropZone.addEventListener("click", () => fileInput.click());
  btnAddMore.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    handleFilesSelected(e.target.files);
    fileInput.value = ""; // تفريغ القيمة للسماح بإعادة اختيار نفس الملف
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "var(--success)";
    dropZone.style.background = "var(--bg-subtle)";
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.style.borderColor = "var(--line)";
    dropZone.style.background = "var(--bg-paper)";
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "var(--line)";
    dropZone.style.background = "var(--bg-paper)";
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  });

  btnMerge.addEventListener("click", mergeSelectedImagesToPdf);
  
  // لإلغاء الارتباطات وعمل تنظيف عند مغادرة الصفحة أو الضغط على دمج آخر
  function resetMergeApp() {
    selectedImages.forEach(img => {
      if(img.previewUrl) URL.revokeObjectURL(img.previewUrl);
    });
    selectedImages = [];
    generatedPdfBytes = null;
    
    $("#imgPreviewSection", el).style.display = "none";
    $("#imgMergeAction", el).style.display = "none";
    $("#imgMergeSuccess", el).style.display = "none";
    $("#imgMergeProgress", el).style.display = "none";
    $("#imgToPdfApp > .double-bezel", el).style.display = "block";
  }

  btnMergeAnother.addEventListener("click", resetMergeApp);
  btnDownload.addEventListener("click", downloadMergedPdf);
}

function handleFilesSelected(fileList) {
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const extension = file.name.split('.').pop().toLowerCase();
    const isAllowedExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(extension);

    if (file.type.startsWith("image/") || isAllowedExt) {
      selectedImages.push({
        id: "img-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
        file: file,
        previewUrl: null
      });
    } else {
      toast(`الملف "${file.name}" ليس صورة صالحة.`, "err");
    }
  }
  
  if (selectedImages.length > 0) {
    const appContainer = document.querySelector("#imgToPdfApp");
    if(appContainer) {
      const bezel = appContainer.querySelector(".double-bezel");
      if(bezel) bezel.style.display = "none";
    }
  }
  renderThumbnailsList();
}

function renderThumbnailsList() {
  const container = document.querySelector("#imgThumbnailsGrid");
  const countSpan = document.querySelector("#imgCount");
  const appContainer = document.querySelector("#imgToPdfApp");
  
  if (!container) return;
  
  if (selectedImages.length === 0) {
    document.querySelector("#imgPreviewSection").style.display = "none";
    document.querySelector("#imgMergeAction").style.display = "none";
    if(appContainer) {
      const bezel = appContainer.querySelector(".double-bezel");
      if(bezel) bezel.style.display = "block";
    }
    return;
  }
  
  document.querySelector("#imgPreviewSection").style.display = "block";
  document.querySelector("#imgMergeAction").style.display = "block";
  countSpan.textContent = selectedImages.length;
  
  container.innerHTML = selectedImages.map((img, idx) => {
    if (!img.previewUrl) {
      img.previewUrl = URL.createObjectURL(img.file);
    }
    const isFirst = idx === 0;
    const isLast = idx === selectedImages.length - 1;
    
    return `
      <div class="img-thumbnail-item" draggable="true" data-index="${idx}" style="background: var(--bg-paper); border: 1px solid var(--line-soft); border-radius: var(--r-sm); padding: 8px; display: flex; flex-direction: column; gap: 8px; position: relative; cursor: move; transition: border-color 0.15s ease;">
        <!-- شارة الترتيب -->
        <span style="position: absolute; top: 6px; right: 6px; background: var(--ink); color: #fff; font-size: 10.5px; font-weight: 700; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10; border: 1.5px solid var(--bg-paper); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${idx + 1}</span>
        
        <!-- معاينة الصورة -->
        <div style="width: 100%; aspect-ratio: 1; border-radius: var(--r-xs); overflow: hidden; background: var(--bg-subtle); display: flex; align-items: center; justify-content: center; position: relative; border: 1px solid var(--line-soft);">
          <img src="${img.previewUrl}" style="width: 100%; height: 100%; object-fit: cover;">
        </div>
        
        <!-- بيانات الملف -->
        <div style="overflow: hidden;">
          <div style="font-size: 11.5px; font-weight: 700; color: var(--ink); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;" title="${esc(img.file.name)}">${esc(img.file.name)}</div>
          <div style="font-size: 10px; color: var(--ink-muted);">${(img.file.size / 1024).toFixed(1)} KB</div>
        </div>
        
        <!-- التحكم بالترتيب والحذف -->
        <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--line-soft); padding-top: 6px; margin-top: auto; gap: 4px;">
          <div style="display: flex; gap: 4px;">
            <button type="button" class="btn-thumbnail-move-prev" data-index="${idx}" ${isFirst ? 'disabled' : ''} style="border: none; background: none; color: ${isFirst ? 'var(--ink-faint)' : 'var(--ink-soft)'}; cursor: ${isFirst ? 'default' : 'pointer'}; padding: 4px; font-size: 11px;"><i class="fa-solid fa-chevron-right"></i></button>
            <button type="button" class="btn-thumbnail-move-next" data-index="${idx}" ${isLast ? 'disabled' : ''} style="border: none; background: none; color: ${isLast ? 'var(--ink-faint)' : 'var(--ink-soft)'}; cursor: ${isLast ? 'default' : 'pointer'}; padding: 4px; font-size: 11px;"><i class="fa-solid fa-chevron-left"></i></button>
          </div>
          <button type="button" class="btn-thumbnail-delete" data-index="${idx}" style="border: none; background: none; color: var(--danger); cursor: pointer; padding: 4px; font-size: 11px;" title="حذف الصورة"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    `;
  }).join("");
  
  // ربط السحب والإفلات لترتيب الصور
  document.querySelectorAll(".img-thumbnail-item", container).forEach(item => {
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", e.target.dataset.index);
      e.target.style.opacity = "0.4";
    });
    item.addEventListener("dragover", (e) => e.preventDefault());
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      const srcIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
      const target = e.target.closest(".img-thumbnail-item");
      if (!target) return;
      const targetIdx = parseInt(target.dataset.index, 10);
      
      if (srcIdx !== targetIdx && !isNaN(srcIdx)) {
        const moved = selectedImages.splice(srcIdx, 1)[0];
        selectedImages.splice(targetIdx, 0, moved);
        renderThumbnailsList();
      }
    });
    item.addEventListener("dragend", (e) => {
      e.target.style.opacity = "1";
    });
  });
  
  // ربط أزرار التحكم بالنقر
  document.querySelectorAll(".btn-thumbnail-move-prev", container).forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      if (idx > 0) {
        const moved = selectedImages.splice(idx, 1)[0];
        selectedImages.splice(idx - 1, 0, moved);
        renderThumbnailsList();
      }
    });
  });
  
  document.querySelectorAll(".btn-thumbnail-move-next", container).forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      if (idx < selectedImages.length - 1) {
        const moved = selectedImages.splice(idx, 1)[0];
        selectedImages.splice(idx + 1, 0, moved);
        renderThumbnailsList();
      }
    });
  });
  
  document.querySelectorAll(".btn-thumbnail-delete", container).forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      if (selectedImages[idx].previewUrl) {
        URL.revokeObjectURL(selectedImages[idx].previewUrl);
      }
      selectedImages.splice(idx, 1);
      renderThumbnailsList();
    });
  });
}

// تحويل أي صورة إلى JPG bytes باستخدام Canvas
async function imageToJpgBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            blob.arrayBuffer().then(resolve).catch(reject);
          } else {
            reject(new Error("تصدير Canvas كـ Blob فشل."));
          }
        }, "image/jpeg", 0.92);
      };
      img.onerror = () => reject(new Error("تحميل كائن الصورة فشل."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("قراءة الصورة فشلت."));
    reader.readAsDataURL(file);
  });
}

async function mergeSelectedImagesToPdf() {
  if (selectedImages.length === 0) return;
  
  document.querySelector("#imgPreviewSection").style.display = "none";
  document.querySelector("#imgMergeAction").style.display = "none";
  document.querySelector("#imgMergeProgress").style.display = "block";
  
  try {
    const pdfDoc = await window.PDFLib.PDFDocument.create();
    
    for (let i = 0; i < selectedImages.length; i++) {
      const imgItem = selectedImages[i];
      const file = imgItem.file;
      const extension = file.name.split('.').pop().toLowerCase();
      const isJpg = file.type === "image/jpeg" || file.type === "image/jpg" || extension === "jpg" || extension === "jpeg";
      const isPng = file.type === "image/png" || extension === "png";
      
      let pdfImg;
      if (isJpg) {
        const imgBytes = await file.arrayBuffer();
        pdfImg = await pdfDoc.embedJpg(imgBytes);
      } else if (isPng) {
        const imgBytes = await file.arrayBuffer();
        pdfImg = await pdfDoc.embedPng(imgBytes);
      } else {
        const imgBytes = await imageToJpgBytes(file);
        pdfImg = await pdfDoc.embedJpg(imgBytes);
      }
      
      const page = pdfDoc.addPage([pdfImg.width, pdfImg.height]);
      page.drawImage(pdfImg, {
        x: 0,
        y: 0,
        width: pdfImg.width,
        height: pdfImg.height
      });
    }
    
    generatedPdfBytes = await pdfDoc.save();
    
    document.querySelector("#imgMergeProgress").style.display = "none";
    document.querySelector("#imgMergeSuccess").style.display = "block";
    toast("تم إنشاء ملف PDF بنجاح!");
  } catch (err) {
    console.error("[Portal] merge images error:", err);
    document.querySelector("#imgMergeProgress").style.display = "none";
    document.querySelector("#imgPreviewSection").style.display = "block";
    document.querySelector("#imgMergeAction").style.display = "block";
    toast("فشل دمج الصور: " + (err.message || err), "err");
  }
}

function downloadMergedPdf() {
  if (!generatedPdfBytes) return;
  const blob = new Blob([generatedPdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `دمج-صور-${Date.now()}.pdf`;
  a.click();
  
  URL.revokeObjectURL(url);
  toast("تم تحميل ملف PDF المدمج");
}

/* ════════ مولّد الباركود (QR Code Generator) ════════ */
function renderQrGenerator(el) {
  if(!el) el = $("#viewHost");

  el.innerHTML = `
    ${pageHead("Tools", "مولّد الباركود", "أداة توليد الباركود (QR Code)", "محلياً", "قم بتحويل أي روابط أو نصوص إلى رمز استجابة سريعة (QR Code) بخلفية شفافة وتنزيله فوراً.")}
    
    <div class="card" style="max-width: 650px; margin: 0 auto; padding: 24px;">
      <div id="qrGeneratorApp">
        <!-- قسم الإدخال -->
        <div id="qrInputForm">
          <div style="margin-bottom: 20px;">
            <label style="font-size: 13.5px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 8px;">الرابط أو النص المطلوب تحويله:</label>
            <textarea id="qrTextVal" class="form-control" style="width: 100%; height: 110px; padding: 12px; border-radius: var(--r-sm); border: 1px solid var(--line); font-size: 14px; resize: none; background: var(--bg-app); color: var(--ink);" placeholder="اكتب الرابط (مثال: https://example.com) أو أي نص تريد تحويله لرمز باركود..."></textarea>
            <div id="qrLengthCounter" style="text-align: left; font-size: 11.5px; color: var(--ink-muted); margin-top: 4px;">0 حرف</div>
          </div>

          <!-- تحذيرات المدخلات -->
          <div id="qrWarningComplex" style="display: none; background: #fffcf0; border: 1px solid #e6c229; padding: 12px; border-radius: var(--r-sm); margin-bottom: 20px; color: #856404; font-size: 12.5px; line-height: 1.5; text-align: right;">
            <i class="fa-solid fa-triangle-exclamation"></i> النص المُدخل طويل جداً. الباركود الناتج سيكون مكثفاً ومكتظاً، مما قد يجعل مسحه صعباً ببعض كاميرات الهواتف.
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
            <!-- الحجم -->
            <div>
              <label style="font-size: 13px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 6px;">حجم الباركود (الدقة):</label>
              <select id="qrSizeSelect" class="form-control" style="width: 100%; padding: 8px; border-radius: var(--r-sm); border: 1px solid var(--line); font-size: 13px; background: var(--bg-app); color: var(--ink);">
                <option value="300" selected>صغير (300 × 300 بكسل)</option>
                <option value="600">متوسط (600 × 600 بكسل)</option>
                <option value="1000">كبير (1000 × 1000 بكسل)</option>
              </select>
            </div>
            
            <!-- اللون -->
            <div>
              <label style="font-size: 13px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 6px;">لون خطوط الباركود:</label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="color" id="qrColorPicker" value="#000000" style="width: 40px; height: 36px; padding: 0; border: 1px solid var(--line); border-radius: var(--r-xs); cursor: pointer; background: none;">
                <span id="qrColorHex" style="font-family: monospace; font-size: 13.5px; color: var(--ink-soft);">#000000</span>
              </div>
            </div>
          </div>

          <!-- تحذير لون ضعيف التباين -->
          <div id="qrWarningColor" style="display: none; background: #fffcf0; border: 1px solid #e6c229; padding: 12px; border-radius: var(--r-sm); margin-bottom: 20px; color: #856404; font-size: 12.5px; line-height: 1.5; text-align: right;">
            <i class="fa-solid fa-circle-exclamation"></i> اللون المختار فاتح جداً! التباين الضعيف قد يعطل مسح الرمز. ننصحك باختيار ألوان داكنة.
          </div>

          <div style="text-align: center;">
            <button type="button" class="btn btn-primary btn-lg" id="btnGenQr" style="padding: 12px 40px; border-radius: var(--r-pill); font-size: 15px;"><i class="fa-solid fa-qrcode"></i> توليد الباركود الآن</button>
          </div>
        </div>

        <!-- قسم المعاينة والتحميل -->
        <div id="qrPreviewSection" style="display: none; text-align: center; padding: 20px 0;">
          <h4 style="font-size: 14.5px; font-weight: 700; color: var(--ink); margin-bottom: 16px;">معاينة الباركود (خلفية شفافة)</h4>
          
          <div class="double-bezel" style="display: inline-block; margin-bottom: 24px; padding: 8px; background: repeating-conic-gradient(var(--bg-subtle) 0% 25%, var(--bg-paper) 0% 50%) 50% / 16px 16px; border-radius: var(--r-md);">
            <!-- canvas لعرض الرمز مخفياً وحفظه، وصورة image للمعاينة -->
            <canvas id="qrCanvas" style="display: none;"></canvas>
            <div class="card" style="padding: 16px; border: 1px solid var(--line-soft); background: transparent; border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <img id="qrPreviewImg" style="max-width: 250px; height: auto; display: block;" alt="الباركود المولد">
            </div>
          </div>
          
          <p style="font-size: 12.5px; color: var(--ink-muted); margin-bottom: 24px;">تم توليد الرمز محلياً بخلفية شفافة تماماً.</p>

          <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary" id="btnGenAnotherQr" style="padding: 10px 24px; border-radius: var(--r-pill);"><i class="fa-solid fa-rotate-left"></i> توليد باركود آخر</button>
            <button type="button" class="btn btn-primary" id="btnDownloadQr" style="padding: 10px 32px; border-radius: var(--r-pill);"><i class="fa-solid fa-download"></i> تحميل الباركود (PNG)</button>
          </div>
        </div>

      </div>
    </div>
  `;

  const inputForm = $("#qrInputForm", el);
  const previewSection = $("#qrPreviewSection", el);
  const textarea = $("#qrTextVal", el);
  const sizeSelect = $("#qrSizeSelect", el);
  const colorPicker = $("#qrColorPicker", el);
  const colorHex = $("#qrColorHex", el);
  const lenCounter = $("#qrLengthCounter", el);
  const warnComplex = $("#qrWarningComplex", el);
  const warnColor = $("#qrWarningColor", el);
  const btnGen = $("#btnGenQr", el);
  const btnGenAnother = $("#btnGenAnotherQr", el);
  const btnDownload = $("#btnDownloadQr", el);
  const qrCanvas = $("#qrCanvas", el);
  const previewImg = $("#qrPreviewImg", el);

  let qrDownloadUrl = "";
  let qrFileName = "qr-code.png";

  // مراقبة طول المدخلات
  textarea.addEventListener("input", () => {
    const len = textarea.value.length;
    lenCounter.textContent = `${len} حرف`;
    warnComplex.style.display = len > 150 ? "block" : "none";
  });

  // مراقبة اختيار الألوان وحساب التباين
  colorPicker.addEventListener("input", (e) => {
    const hex = e.target.value;
    colorHex.textContent = hex.toUpperCase();
    
    // حساب السطوع النسبي للون
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    
    // إذا كان السطوع عالياً (فاتح) ننبه الموظف
    warnColor.style.display = luminance > 0.65 ? "block" : "none";
  });

  btnGen.addEventListener("click", () => {
    const textVal = textarea.value.trim();
    if (!textVal) {
      toast("الرجاء إدخال نص أو رابط أولاً لتوليد الباركود.", "err");
      return;
    }

    if (typeof window.QRCode === "undefined" && typeof QRCode === "undefined") {
      toast("عذراً، مكتبة توليد الباركود لم تكتمل عملية تحميلها بعد. الرجاء الانتظار ثوانٍ والمحاولة مرة أخرى.", "err");
      return;
    }

    const qrLib = window.QRCode || QRCode;
    const size = parseInt(sizeSelect.value, 10);
    const darkColor = colorPicker.value;

    try {
      // استخدام المكتبة المحلية لتصيير الرمز على الـ Canvas مباشرة بخلفية شفافة
      qrLib.toCanvas(qrCanvas, textVal, {
        width: size,
        margin: 2,
        color: {
          dark: darkColor,
          light: "#00000000" // شفاف بالكامل
        }
      }, (error) => {
        if (error) {
          console.error("[Portal] QRCode generation failed:", error);
          toast("فشل توليد الباركود: " + error.message, "err");
          return;
        }

        // تحويل محتويات الـ Canvas لصورة للعرض في المعاينة وحفظها للتنزيل
        qrDownloadUrl = qrCanvas.toDataURL("image/png");
        previewImg.src = qrDownloadUrl;

        // توليد اسم ملف معبر من النص المدخل
        let clean = textVal
          .replace(/https?:\/\/(www\.)?/, "") // إزالة الرابط البروتوكول
          .replace(/[^a-zA-Z0-9أ-ي]/g, "-")  // تعويض الرموز الفاصلة بـ -
          .substring(0, 20);
        qrFileName = clean ? `qr-${clean}.png` : "qr-code.png";

        inputForm.style.display = "none";
        previewSection.style.display = "block";
        toast("تم توليد الباركود بنجاح!");
      });
    } catch (err) {
      console.error("[Portal] QR Code execution exception:", err);
      toast("حدث خطأ أثناء معالجة الباركود: " + err.message, "err");
    }
  });

  btnGenAnother.addEventListener("click", () => {
    textarea.value = "";
    lenCounter.textContent = "0 حرف";
    warnComplex.style.display = "none";
    warnColor.style.display = "none";
    colorPicker.value = "#000000";
    colorHex.textContent = "#000000";
    qrDownloadUrl = "";
    previewImg.src = "";
    
    previewSection.style.display = "none";
    inputForm.style.display = "block";
  });

  btnDownload.addEventListener("click", () => {
    if (!qrDownloadUrl) return;
    const a = document.createElement("a");
    a.href = qrDownloadUrl;
    a.download = qrFileName;
    a.click();
    toast("تم تنزيل صورة الباركود الشفافة");
  });
}

/* ════════════════ 10. ضغط الملفات (PDF Compression) ════════════════ */
function renderPdfCompress(el) {
  el.innerHTML = `
    ${pageHead("PDF Compress", "ضغط الملفات", "أداة ضغط مستندات PDF", "محلياً", "قم بضغط ملفات PDF الخاصة بك بالكامل داخل متصفحك بشكل آمن وسريع دون رفعها لأي خوادم.")}
    
    <div class="card" style="max-width: 700px; margin: 0 auto; padding: 24px;">
      <div id="pdfCompressApp">
        <!-- منطقة الرفع -->
        <div class="double-bezel" style="margin-bottom: 20px;">
          <div class="card" id="pdfDropZone" style="padding: 48px 24px; text-align: center; border: 2px dashed var(--line); border-radius: var(--r-md); background: var(--bg-paper); cursor: pointer; transition: all 0.22s var(--ease);">
            <div style="font-size: 56px; color: var(--gold); margin-bottom: 16px;"><i class="fa-solid fa-file-pdf"></i></div>
            <h3 style="font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 8px;">اسحب وأفلت ملف PDF هنا</h3>
            <p style="font-size: 12.5px; color: var(--ink-muted); margin-bottom: 16px;">أو اضغط لتصفح الملفات من جهازك</p>
            <input type="file" id="pdfFileInput" accept=".pdf" style="display: none;">
            <span class="btn btn-secondary btn-sm" style="pointer-events: none;"><i class="fa-solid fa-folder-open"></i> اختيار ملف</span>
          </div>
        </div>

        <div id="pdfFileInfo" style="display: none; margin-bottom: 20px; background: var(--bg-subtle); padding: 12px 16px; border-radius: var(--r-sm); border: 1px solid var(--line-soft); display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px; width: 85%;">
            <i class="fa-solid fa-file-pdf" style="font-size: 24px; color: var(--danger); flex-shrink: 0;"></i>
            <div style="overflow: hidden;">
              <div id="pdfFileName" style="font-size: 13.5px; font-weight: 700; color: var(--ink); word-break: break-all; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;"></div>
              <div id="pdfFileSizeOriginal" style="font-size: 11.5px; color: var(--ink-muted);"></div>
            </div>
          </div>
          <button type="button" id="btnRemovePdf" style="color: var(--danger); font-weight: 700; border: none; background: none; cursor: pointer; padding: 8px;"><i class="fa-solid fa-trash-can"></i></button>
        </div>

        <!-- خيارات مستوى الضغط -->
        <div id="pdfCompressConfig" style="display: none;">
          <label style="font-size: 13px; font-weight: 700; color: var(--ink-soft); display: block; margin-bottom: 8px; text-align: center;">اختر مستوى الضغط المطلوب:</label>
          <div class="segmented-control" style="max-width: 450px; margin: 0 auto 24px;">
            <button type="button" class="seg-btn active" data-level="balanced"><i class="fa-solid fa-scale-balanced"></i> ضغط متوازن</button>
            <button type="button" class="seg-btn" data-level="max"><i class="fa-solid fa-bolt"></i> ضغط قوي</button>
          </div>
          
          <div style="display: flex; justify-content: center; margin-top: 16px;">
            <button type="button" class="btn btn-primary" id="btnStartCompress" style="padding: 10px 32px; border-radius: var(--r-pill); width: 100%; max-width: 250px;"><i class="fa-solid fa-compress"></i> ضغط الملف الآن</button>
          </div>
        </div>

        <!-- مشهد معالجة الضغط -->
        <div id="pdfCompressingState" style="display: none; padding: 48px 24px; text-align: center;">
          <div style="position: relative; display: inline-block; margin-bottom: 24px;">
            <div style="font-size: 64px; color: var(--gold);"><i class="fa-solid fa-file-pdf"></i></div>
            <div style="position: absolute; top: -10px; right: -10px; width: 28px; height: 28px; border-radius: 50%; background: var(--bg-paper); border: 3px solid var(--gold); border-top-color: transparent; animation: spin 1s linear infinite;"></div>
          </div>
          <h3 id="pdfProgressTxt" style="font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 8px;">0%</h3>
          <p id="pdfStatusTxt" style="font-size: 12.5px; color: var(--ink-muted);">جاري تهيئة الملف المصدري للتصغير...</p>
        </div>

        <!-- مشهد بعد انتهاء الضغط -->
        <div id="pdfResultState" style="display: none; text-align: center; padding: 16px 0;">
        </div>
      </div>
    </div>
  `;

  let selectedFile = null;
  let compressionLevel = "balanced";
  let compressedPdfBytes = null;

  const dropZone = $("#pdfDropZone", el);
  const fileInput = $("#pdfFileInput", el);
  const fileInfo = $("#pdfFileInfo", el);
  const configArea = $("#pdfCompressConfig", el);
  const compressingState = $("#pdfCompressingState", el);
  const resultState = $("#pdfResultState", el);

  const fileNameEl = $("#pdfFileName", el);
  const fileSizeOriginalEl = $("#pdfFileSizeOriginal", el);
  const progressTxt = $("#pdfProgressTxt", el);
  const statusTxt = $("#pdfStatusTxt", el);

  // Drag & drop handlers
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "var(--gold)";
    dropZone.style.background = "var(--gold-pale)";
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.style.borderColor = "var(--line)";
    dropZone.style.background = "var(--bg-paper)";
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "var(--line)";
    dropZone.style.background = "var(--bg-paper)";
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  });
  dropZone.addEventListener("click", () => {
    fileInput.click();
  });
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelected(file);
  });

  $("#btnRemovePdf", el).addEventListener("click", resetCompressor);

  // Toggle presets
  const segBtns = $$(".seg-btn", el);
  segBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      segBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      compressionLevel = btn.dataset.level;
    });
  });

  // Action listeners
  $("#btnStartCompress", el).addEventListener("click", startCompressionProcess);

  function handleFileSelected(file) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast("الملف المختار ليس بصيغة PDF. يرجى اختيار ملف PDF فقط.", "err");
      return;
    }
    selectedFile = file;
    
    dropZone.parentElement.style.display = "none";
    fileInfo.style.display = "flex";
    configArea.style.display = "block";
    resultState.style.display = "none";
    
    fileNameEl.textContent = file.name;
    fileSizeOriginalEl.textContent = fmtSize(file.size);
  }

  function resetCompressor() {
    selectedFile = null;
    compressedPdfBytes = null;
    
    dropZone.parentElement.style.display = "block";
    fileInfo.style.display = "none";
    configArea.style.display = "none";
    compressingState.style.display = "none";
    resultState.style.display = "none";
    fileInput.value = "";
  }

  async function startCompressionProcess() {
    if (!selectedFile) return;

    fileInfo.style.display = "none";
    configArea.style.display = "none";
    compressingState.style.display = "block";
    progressTxt.textContent = "0%";
    statusTxt.textContent = "جاري تحميل المكتبة وتحضير الملف...";

    try {
      // Dynamic import of the local compression library
      const { compress } = await import("./pdf-compress.js");
      
      statusTxt.textContent = "جاري قراءة الملف وتجزئة الكائنات...";
      const buffer = await selectedFile.arrayBuffer();
      
      const result = await compress(buffer, {
        preset: compressionLevel === "max" ? "max" : "balanced",
        onProgress: (event) => {
          progressTxt.textContent = `${event.progress || 0}%`;
          if (event.message) {
            statusTxt.textContent = translateProgressMessage(event.message);
          }
        }
      });

      if (!result || !result.pdf) {
        throw new Error("فشلت المعالجة، لم يتم إرجاع ملف مضغوط.");
      }

      compressedPdfBytes = result.pdf;

      const originalSize = result.stats.originalSize || selectedFile.size;
      const compressedSize = result.stats.compressedSize || compressedPdfBytes.length;
      const savedPercentage = result.stats.percentageSaved || ((originalSize - compressedSize) / originalSize * 100);

      if (compressedSize >= originalSize) {
        showAlreadyCompressedResult(originalSize, compressedSize);
      } else {
        showSuccessResult(originalSize, compressedSize, savedPercentage);
      }

    } catch (err) {
      console.error("[PDF Compress Failure Details]:", err);
      if (err.stack) {
        console.error("[PDF Compress Stack Trace]:", err.stack);
      }
      showErrorResult(err.message || "فشلت عملية الضغط. يرجى التأكد من أن ملف الـ PDF غير محمي بكلمة مرور وغير تالف.");
    }
  }

  function translateProgressMessage(msg) {
    if (!msg) return "جاري معالجة الملف...";
    const m = msg.toLowerCase();
    if (m.includes("loading") || m.includes("load")) return "جاري تحميل كائنات المستند...";
    if (m.includes("parsing") || m.includes("parse")) return "جاري قراءة هيكل الـ PDF وتحليله...";
    if (m.includes("image") || m.includes("compressing")) return "جاري ضغط وإعادة ترميز الصور المضمنة...";
    if (m.includes("optimizing") || m.includes("optimize")) return "جاري ترتيب الجداول وبناء الهيكل الجديد...";
    if (m.includes("writing") || m.includes("save")) return "جاري كتابة الملف الجديد وتصديره...";
    return "جاري معالجة وتصغير حجم الملف...";
  }

  function showSuccessResult(orig, comp, pct) {
    compressingState.style.display = "none";
    resultState.style.display = "block";
    
    resultState.innerHTML = `
      <div style="font-size: 64px; color: var(--success); margin-bottom: 20px;"><i class="fa-solid fa-circle-check"></i></div>
      <h3 style="font-size: 18px; font-weight: 800; color: var(--ink); margin-bottom: 12px;">تمت عملية الضغط بنجاح!</h3>
      
      <div style="background: var(--bg-subtle); padding: 20px; border-radius: var(--r-md); border: 1px solid var(--line-soft); max-width: 480px; margin: 0 auto 24px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; border-bottom: 1px dashed var(--line-soft); padding-bottom: 16px;">
          <div>
            <div style="font-size: 12px; color: var(--ink-muted); margin-bottom: 4px;">الحجم الأصلي</div>
            <div style="font-size: 18px; font-weight: 800; color: var(--ink-soft);">${fmtSize(orig)}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: var(--ink-muted); margin-bottom: 4px;">الحجم بعد الضغط</div>
            <div style="font-size: 18px; font-weight: 800; color: var(--gold-deep);">${fmtSize(comp)}</div>
          </div>
        </div>
        
        <div style="display: flex; flex-direction: column; align-items: center;">
          <div style="font-size: 13px; color: var(--ink-muted); margin-bottom: 6px;">نسبة تقليل الحجم</div>
          <div style="font-size: 28px; font-weight: 800; color: var(--success);">${pct.toFixed(0)}% أقل</div>
          <div style="width: 100%; background: var(--bg-hover); height: 8px; border-radius: var(--r-full); margin-top: 10px; overflow: hidden;">
            <div id="resProgressBar" style="background: var(--success); height: 100%; width: 0%; transition: width 0.6s ease;"></div>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
        <button type="button" class="btn btn-secondary" id="btnCompressAnother" style="padding: 10px 24px; border-radius: var(--r-pill);"><i class="fa-solid fa-rotate-left"></i> ضغط ملف آخر</button>
        <button type="button" class="btn btn-primary" id="btnDownloadCompressed" style="padding: 10px 32px; border-radius: var(--r-pill);"><i class="fa-solid fa-download"></i> تحميل الملف المضغوط</button>
      </div>
    `;
    
    setTimeout(() => {
      const bar = $("#resProgressBar", el);
      if (bar) bar.style.width = `${pct}%`;
    }, 100);
    
    $("#btnCompressAnother", el).addEventListener("click", resetCompressor);
    $("#btnDownloadCompressed", el).addEventListener("click", downloadCompressedFile);
  }

  function showAlreadyCompressedResult(orig, comp) {
    compressingState.style.display = "none";
    resultState.style.display = "block";
    
    resultState.innerHTML = `
      <div style="font-size: 64px; color: var(--gold); margin-bottom: 20px;"><i class="fa-solid fa-circle-exclamation"></i></div>
      <h3 style="font-size: 18px; font-weight: 800; color: var(--ink); margin-bottom: 12px;">الملف مضغوط بالفعل!</h3>
      
      <div style="background: var(--bg-subtle); padding: 20px; border-radius: var(--r-md); border: 1px solid var(--line-soft); max-width: 480px; margin: 0 auto 24px; text-align: center;">
        <p style="font-size: 13.5px; color: var(--ink-soft); line-height: 1.6; margin-bottom: 14px;">
          هذا المستند مضغوط ومحسن بالفعل ولا يحتاج إلى ضغط إضافي. حجمه الحالي <strong>${fmtSize(orig)}</strong>. لن يؤدي الضغط إلى توفير مساحة مفيدة.
        </p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; border-top: 1px dashed var(--line-soft); padding-top: 14px;">
          <div>
            <div style="font-size: 11px; color: var(--ink-muted); margin-bottom: 2px;">الحجم الأصلي</div>
            <div style="font-size: 15px; font-weight: 700; color: var(--ink-soft);">${fmtSize(orig)}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: var(--ink-muted); margin-bottom: 2px;">الحجم بعد المحاولة</div>
            <div style="font-size: 15px; font-weight: 700; color: var(--ink-soft);">${fmtSize(comp)}</div>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
        <button type="button" class="btn btn-secondary" id="btnCompressAnother" style="padding: 10px 24px; border-radius: var(--r-pill);"><i class="fa-solid fa-rotate-left"></i> ضغط ملف آخر</button>
        <button type="button" class="btn btn-primary" id="btnDownloadCompressed" style="padding: 10px 32px; border-radius: var(--r-pill);"><i class="fa-solid fa-download"></i> تحميل الملف على أي حال</button>
      </div>
    `;
    
    $("#btnCompressAnother", el).addEventListener("click", resetCompressor);
    $("#btnDownloadCompressed", el).addEventListener("click", downloadCompressedFile);
  }

  function showErrorResult(errorMsg) {
    compressingState.style.display = "none";
    resultState.style.display = "block";
    
    resultState.innerHTML = `
      <div style="font-size: 64px; color: var(--danger); margin-bottom: 20px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
      <h3 style="font-size: 18px; font-weight: 800; color: var(--danger); margin-bottom: 12px;">فشل ضغط الملف</h3>
      
      <div style="background: var(--danger-bg); padding: 20px; border-radius: var(--r-md); border: 1px solid rgba(168, 42, 42, 0.15); max-width: 480px; margin: 0 auto 24px; text-align: center; color: var(--danger); font-size: 13.5px; line-height: 1.6;">
        ${esc(errorMsg)}
      </div>

      <div style="display: flex; justify-content: center;">
        <button type="button" class="btn btn-secondary" id="btnCompressAnother" style="padding: 10px 24px; border-radius: var(--r-pill);"><i class="fa-solid fa-rotate-left"></i> محاولة مرة أخرى</button>
      </div>
    `;
    
    $("#btnCompressAnother", el).addEventListener("click", resetCompressor);
  }

  function downloadCompressedFile() {
    if (!compressedPdfBytes) return;
    const blob = new Blob([compressedPdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    
    const origName = selectedFile.name;
    const extIdx = origName.lastIndexOf(".");
    const baseName = extIdx !== -1 ? origName.substring(0, extIdx) : origName;
    const newName = `${baseName}-مضغوط.pdf`;
    
    const a = document.createElement("a");
    a.href = url;
    a.download = newName;
    a.click();
    
    URL.revokeObjectURL(url);
    toast("تم بدء تحميل الملف المضغوط");
  }
}

/* ════════════════ 8. قسم الاقتراحات والشكاوى (Suggestions & Complaints) ════════════════ */

function renderSuggestions(el) {
  const u = State.user;
  if (!u) return;

  if (!State.suggestionTab) State.suggestionTab = "received";
  if (!State.suggestionFilter) State.suggestionFilter = "all";

  el.innerHTML = `
    <style>
      .sug-card {
        transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1);
        border: 1px solid var(--line-soft);
        background: var(--bg-paper);
        cursor: pointer;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        position: relative;
        border-radius: var(--r-md);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
      }
      .sug-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 12px 24px rgba(156, 110, 56, 0.08);
        border-color: var(--gold-soft);
      }
      @media (max-width: 768px) {
        .sug-fab {
          position: fixed !important;
          bottom: 24px !important;
          left: 24px !important;
          width: 56px !important;
          height: 56px !important;
          border-radius: 50% !important;
          box-shadow: 0 6px 20px rgba(156, 110, 56, 0.3) !important;
          z-index: 100 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 0 !important;
        }
        .sug-fab span {
          display: none !important;
        }
        .sug-fab i {
          font-size: 20px !important;
          margin: 0 !important;
        }
      }
    </style>

    ${pageHead("Suggestions & Complaints", "الاقتراحات والشكاوى", "صندوق الاقتراحات والشكاوى", "", "صندوق مخصص لإرسال واستقبال الاقتراحات والشكاوى الإدارية والتنظيمية.")}

    <!-- شريط التحكم والتبويبات والفلترة -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <div style="display:flex;gap:10px;background:var(--bg-subtle);padding:4px;border-radius:var(--r-full);border:1px solid var(--line-soft)">
        <button class="btn btn-sm ${State.suggestionTab==='received'?'btn-primary':'btn-secondary'}" id="tabSugRec" style="border-radius:var(--r-full);padding:6px 16px"><i class="fa-solid fa-inbox"></i> المستقبلة</button>
        <button class="btn btn-sm ${State.suggestionTab==='sent'?'btn-primary':'btn-secondary'}" id="tabSugSent" style="border-radius:var(--r-full);padding:6px 16px"><i class="fa-solid fa-paper-plane"></i> المرسلة</button>
      </div>
      
      <div style="display:flex;gap:10px;align-items:center">
        <select id="sugFilterSelect" class="input" style="padding:6px 12px;font-size:12.5px;border-radius:var(--r-md);height:36px">
          <option value="all" ${State.suggestionFilter==='all'?'selected':''}>عرض الكل</option>
          <option value="suggestion" ${State.suggestionFilter==='suggestion'?'selected':''}>اقتراحات فقط</option>
          <option value="complaint" ${State.suggestionFilter==='complaint'?'selected':''}>شكاوى فقط</option>
        </select>
        <button class="btn btn-primary sug-fab" id="btnNewSuggestion" style="padding:8px 16px;border-radius:var(--r-md);height:36px;display:flex;align-items:center;gap:6px"><i class="fa-solid fa-circle-plus"></i> <span>جديد</span></button>
      </div>
    </div>

    <!-- شبكة الرسائل -->
    <div class="emp-grid" id="sugGridArea"></div>
  `;

  renderSuggestionsGrid();

  $("#tabSugRec").addEventListener("click", () => {
    State.suggestionTab = "received";
    $("#tabSugRec").className = "btn btn-primary btn-sm";
    $("#tabSugSent").className = "btn btn-secondary btn-sm";
    renderSuggestionsGrid();
  });

  $("#tabSugSent").addEventListener("click", () => {
    State.suggestionTab = "sent";
    $("#tabSugRec").className = "btn btn-secondary btn-sm";
    $("#tabSugSent").className = "btn btn-primary btn-sm";
    renderSuggestionsGrid();
  });

  $("#sugFilterSelect").addEventListener("change", (e) => {
    State.suggestionFilter = e.target.value;
    renderSuggestionsGrid();
  });

  $("#btnNewSuggestion").addEventListener("click", openNewSuggestionModal);
}

function renderSuggestionsGrid() {
  const area = $("#sugGridArea");
  if (!area) return;

  const items = State.suggestions || [];
  const tab = State.suggestionTab;
  const filter = State.suggestionFilter;

  // Filter based on tab (Received vs Sent)
  let filtered = items.filter(x => {
    if (tab === "received") {
      return x.recipientId === State.user.uid;
    } else {
      return x.senderId === State.user.uid;
    }
  });

  // Filter based on type (All, Suggestion, Complaint)
  if (filter !== "all") {
    filtered = filtered.filter(x => x.type === filter);
  }

  if (!filtered.length) {
    area.innerHTML = `
      <div style="text-align:center;padding:48px 24px;color:var(--ink-muted);background:var(--bg-paper);border:1px dashed var(--line-soft);border-radius:var(--r-md);grid-column:1/-1">
        <div style="font-size:56px;opacity:0.18;margin-bottom:16px;color:var(--gold-deep)"><i class="fa-solid fa-comments"></i></div>
        <h3 style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--ink-soft)">الصندوق خالٍ تماماً</h3>
        <p style="font-size:12.5px;max-width:340px;margin:0 auto;color:var(--ink-muted);line-height:1.6">لا توجد أي اقتراحات أو شكاوى مسجلة في هذا التبويب حالياً.</p>
      </div>
    `;
    return;
  }

  area.innerHTML = filtered.map(item => {
    const isSug = item.type === "suggestion";
    const accentColor = isSug ? "#2d5a88" : "#c95c3b";
    
    const badge = isSug 
      ? `<span class="status-badge" style="background:rgba(45, 90, 136, 0.08);color:#2d5a88;border:1px solid rgba(45, 90, 136, 0.2);margin-left:0"><i class="fa-solid fa-lightbulb"></i> اقتراح</span>`
      : `<span class="status-badge" style="background:rgba(201, 92, 59, 0.08);color:#c95c3b;border:1px solid rgba(201, 92, 59, 0.2);margin-left:0"><i class="fa-solid fa-triangle-exclamation"></i> شكوى</span>`;

    const oppositeParty = tab === "received" ? `من: ${item.senderName}` : `إلى: ${item.recipientName}`;
    
    const unreadDot = (!item.isRead && item.recipientId === State.user.uid && tab === "received")
      ? `<span style="background:var(--danger);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:8px">جديد</span>`
      : "";

    const dateRelative = item.createdAt ? timeAgo(item.createdAt) : "قيد الإرسال…";
    const dateFull = item.createdAt ? new Date(item.createdAt.toDate ? item.createdAt.toDate() : item.createdAt).toLocaleString("ar-SA") : "";
    const attachmentIcon = item.attachment ? `<span style="font-size:11px;color:#9c6e38;background:rgba(156,110,56,0.06);padding:3px 8px;border-radius:var(--r-full);display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(156,110,56,0.15)"><i class="fa-solid fa-paperclip"></i> مرفق</span>` : "";

    const bodySnippet = item.content.length > 110 ? item.content.slice(0, 110) + "..." : item.content;

    return `
      <div class="sug-card" data-sug-id="${item.id}" title="${esc(dateFull)}" style="border-right: 4px solid ${accentColor}; ${!item.isRead && tab === "received" ? "border-color: var(--gold-soft) " + accentColor + " var(--gold-soft) var(--gold-soft);" : ""}">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
          <div style="display:flex;align-items:center;gap:6px">
            <h4 style="margin:0;font-size:14.5px;font-weight:800;color:var(--ink)">${esc(item.title || "بدون عنوان")}</h4>
            ${unreadDot}
          </div>
          ${badge}
        </div>
        
        <p style="font-size:12.5px;color:var(--ink-soft);line-height:1.6;margin:0">${esc(bodySnippet)}</p>

        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:var(--ink-muted);margin-top:6px;border-top:1px dashed var(--line-soft);padding-top:10px">
          <span style="font-weight:700;color:var(--ink-soft);display:flex;align-items:center;gap:6px">
            <i class="fa-solid ${tab === "received" ? "fa-user-circle" : "fa-user-tie"}" style="color:var(--gold-deep)"></i> 
            ${esc(oppositeParty)}
          </span>
          <div style="display:flex;align-items:center;gap:10px">
            ${attachmentIcon}
            <span style="display:flex;align-items:center;gap:4px"><i class="fa-regular fa-clock"></i> ${esc(dateRelative)}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  $$("[data-sug-id]", area).forEach(card => {
    card.addEventListener("click", () => {
      const item = filtered.find(x => x.id === card.dataset.sugId);
      if (item) {
        openSuggestionDetail(item, tab);
      }
    });
  });
}

function openSuggestionDetail(item, activeTab) {
  if (activeTab === "received" && !item.isRead) {
    S.markSuggestionAsRead(item.id).catch(err => console.error("Error marking read:", err));
    item.isRead = true;
    renderSuggestionsGrid();
  }

  const isSug = item.type === "suggestion";
  const accentColor = isSug ? "#2d5a88" : "#c95c3b";
  const typeText = isSug ? "تفاصيل الاقتراح" : "تفاصيل الشكوى";
  const typeIcon = isSug ? "fa-lightbulb" : "fa-triangle-exclamation";

  let attachmentHtml = "";
  if (item.attachment) {
    const isImg = item.attachment.fileType?.startsWith("image/");
    const previewUrl = item.attachment.url;
    attachmentHtml = `
      <div style="margin-top:16px;padding-top:16px;border-top:1px dashed var(--line-soft)">
        <div style="font-weight:700;font-size:13px;color:var(--ink);margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <i class="fa-solid fa-paperclip" style="color:var(--gold-deep)"></i> 
          <span>الملف المرفق: ${esc(item.attachment.fileName)}</span>
        </div>
        ${isImg ? `
          <div style="margin-bottom:12px;max-height:220px;overflow:hidden;border-radius:var(--r-md);border:1px solid var(--line-soft);text-align:center;background:var(--bg-subtle);display:flex;align-items:center;justify-content:center;padding:8px">
            <img src="${esc(previewUrl)}" style="max-width:100%;object-fit:contain;max-height:200px;border-radius:var(--r-sm)">
          </div>
        ` : `
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-subtle);border:1px solid var(--line-soft);border-radius:var(--r-md);margin-bottom:12px">
            <div style="font-size:32px;color:${item.attachment.fileType?.includes("pdf") ? "#c62828" : "var(--gold-deep)"}"><i class="fa-solid ${item.attachment.fileType?.includes("pdf") ? "fa-file-pdf" : "fa-file-lines"}"></i></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;font-weight:700;color:var(--ink);text-overflow:ellipsis;overflow:hidden;white-space:nowrap">${esc(item.attachment.fileName)}</div>
              <div style="font-size:10.5px;color:var(--ink-muted)">${esc(item.attachment.fileType || "ملف مستند")}</div>
            </div>
          </div>
        `}
        <div style="display:flex;gap:10px">
          <a href="${esc(previewUrl)}" target="_blank" class="btn btn-secondary btn-sm" style="flex:1;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px"><i class="fa-solid fa-eye"></i> معاينة</a>
          <a href="${esc(previewUrl)}" download="${esc(item.attachment.fileName)}" class="btn btn-secondary btn-sm" style="flex:1;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px"><i class="fa-solid fa-download"></i> تحميل</a>
        </div>
      </div>
    `;
  }

  const dateStr = item.createdAt ? new Date(item.createdAt.toDate ? item.createdAt.toDate() : item.createdAt).toLocaleString("ar-SA") : "قيد الإرسال…";

  const modalHtml = `
    <div style="margin:-18px -18px 0 -18px;background:rgba(${isSug ? '45,90,136' : '201,92,59'},0.05);border-bottom:1px solid rgba(${isSug ? '45,90,136' : '201,92,59'},0.1);padding:24px;border-radius:var(--r-md) var(--r-md) 0 0;text-align:center;position:relative">
      <button class="modal-close" data-close style="position:absolute;top:16px;left:16px;background:none;border:none;color:var(--ink-muted);font-size:18px;cursor:pointer"><i class="fa-solid fa-xmark"></i></button>
      <div style="width:52px;height:52px;background:rgba(${isSug ? '45,90,136' : '201,92,59'},0.1);color:${accentColor};border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:22px"><i class="fa-solid ${typeIcon}"></i></div>
      <h3 style="margin:0;color:${accentColor};font-size:16px;font-weight:800">${typeText}</h3>
    </div>
    
    <div style="display:flex;flex-direction:column;gap:14px;padding-top:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:var(--bg-subtle);padding:12px;border-radius:var(--r-md);border:1px solid var(--line-soft)">
        <div>
          <span style="font-size:11px;color:var(--ink-muted);display:block;margin-bottom:2px">المرسل</span>
          <span style="font-size:13px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:6px"><i class="fa-solid fa-user-circle" style="color:var(--gold-deep)"></i> ${esc(item.senderName)}</span>
        </div>
        <div>
          <span style="font-size:11px;color:var(--ink-muted);display:block;margin-bottom:2px">المستلم</span>
          <span style="font-size:13px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:6px"><i class="fa-solid fa-user-tie" style="color:var(--gold-deep)"></i> ${esc(item.recipientName)}</span>
        </div>
      </div>
      
      <div>
        <span style="font-size:11px;color:var(--ink-muted);display:block;margin-bottom:4px">الموضوع</span>
        <div style="font-size:15px;font-weight:800;color:var(--ink)">${esc(item.title || "بدون عنوان")}</div>
      </div>

      <div>
        <span style="font-size:11px;color:var(--ink-muted);display:block;margin-bottom:4px">المحتوى التفصيلي</span>
        <div style="font-size:13.5px;color:var(--ink-soft);line-height:1.8;background:var(--bg-subtle);padding:16px;border-radius:var(--r-md);border:1px solid var(--line-soft);white-space:pre-wrap">${esc(item.content)}</div>
      </div>

      ${attachmentHtml}

      <div style="margin-top:8px;padding-top:10px;border-top:1px solid var(--line-soft);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:var(--ink-muted)"><i class="fa-regular fa-clock"></i> تاريخ الإرسال: ${esc(dateStr)}</span>
        <button class="btn btn-secondary btn-sm" data-close style="padding:6px 16px">إغلاق</button>
      </div>
    </div>
  `;

  openModal(modalHtml);
}

function openNewSuggestionModal() {
  State.tempSuggestionAttachment = null;
  const exec = State.users.find(u => u.role === "executive") || { uid: "exec_uid", name: "المدير التنفيذي" };

  openModal(`
    <div class="modal-head">
      <h2>إنشاء وإرسال رسالة جديدة</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="newSugForm">
      <div class="form-group" style="margin-bottom:14px">
        <label style="font-weight:700">نوع الرسالة</label>
        <div style="display:flex;gap:20px;margin-top:6px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:normal">
            <input type="radio" name="sugType" value="suggestion" checked style="width:16px;height:16px">
            <span>اقتراح</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:normal">
            <input type="radio" name="sugType" value="complaint" style="width:16px;height:16px">
            <span>شكوى</span>
          </label>
        </div>
      </div>

      <div class="form-group" id="sugRecipientWrap" style="margin-bottom:14px">
        <label style="font-weight:700">المستلم</label>
        <select id="sugRecipient" class="input">
          <option value="${exec.uid}">${esc(exec.name)} (المدير التنفيذي)</option>
          ${State.users.filter(u => u.uid !== State.user.uid && u.role !== "executive").map(u => `
            <option value="${u.uid}">${esc(u.name)} (${esc(u.jobTitle || "موظف")})</option>
          `).join("")}
        </select>
      </div>

      <div class="form-group" style="margin-bottom:14px">
        <label style="font-weight:700">الموضوع</label>
        <input type="text" id="sugTitle" required class="input" placeholder="اكتب موضوعًا مختصرًا للرسالة...">
      </div>

      <div class="form-group" style="margin-bottom:14px">
        <label style="font-weight:700">المحتوى بالتفصيل</label>
        <textarea id="sugContent" rows="4" required class="input" placeholder="اكتب التفاصيل والمقترحات هنا بوضوح..."></textarea>
      </div>

      <div class="form-group" style="margin-bottom:16px">
        <label style="font-weight:700">إرفاق ملف (اختياري)</label>
        <div id="sugAttachmentStatus" style="margin-bottom:8px;font-size:12px;color:var(--ink-soft)">
          <span style="color:var(--ink-faint)">لم يتم إرفاق ملف.</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <input type="file" id="sugFileInput" style="display:none">
          <button type="button" class="btn btn-secondary btn-sm" id="btnTriggerSugFile" style="padding:4px 10px;font-size:12px;display:flex;align-items:center;gap:6px"><i class="fa-solid fa-file-import"></i> اختيار ملف</button>
          <div id="sugUploadProgress" style="font-size:12px;color:var(--ink-muted);font-weight:700"></div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-primary" id="sugSubmitBtn"><i class="fa-solid fa-paper-plane"></i> إرسال</button>
      </div>
    </form>
  `);

  const fileInput = $("#sugFileInput");
  const triggerBtn = $("#btnTriggerSugFile");
  const progressTxt = $("#sugUploadProgress");
  const attachStatus = $("#sugAttachmentStatus");

  triggerBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    triggerBtn.disabled = true;
    triggerBtn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الرفع…`;
    try {
      const res = await S.uploadSuggestionAttachment(file);

      State.tempSuggestionAttachment = {
        url: res,
        fileName: file.name,
        fileType: file.type
      };

      attachStatus.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-paper);padding:6px 10px;border-radius:var(--r-sm);border:1px solid var(--line-soft)">
          <span style="font-weight:700;font-size:12.5px;"><i class="fa-solid fa-file-circle-check" style="color:var(--success)"></i> ${esc(file.name)}</span>
          <button type="button" id="btnRemoveSugFile" style="color:var(--danger);font-weight:700;border:none;background:none;cursor:pointer"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;

      $("#btnRemoveSugFile").addEventListener("click", () => {
        State.tempSuggestionAttachment = null;
        attachStatus.innerHTML = `<span style="color:var(--ink-faint)">لم يتم إرفاق ملف.</span>`;
      });

      toast("تم رفع المرفق بنجاح");
    } catch (err) {
      toast(err.message || "فشل رفع الملف", "err");
    } finally {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = `<i class="fa-solid fa-file-import"></i> اختيار ملف`;
      progressTxt.textContent = "";
    }
  });

  const typeRadios = document.querySelectorAll('input[name="sugType"]');
  const recipientWrap = $("#sugRecipientWrap");
  const recipientSelect = $("#sugRecipient");

  typeRadios.forEach(radio => {
    radio.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val === "complaint") {
        recipientSelect.value = exec.uid;
        recipientWrap.style.display = "none";
      } else {
        recipientWrap.style.display = "block";
      }
    });
  });

  $("#newSugForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#sugSubmitBtn");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> جارٍ الإرسال…`;

    const type = document.querySelector('input[name="sugType"]:checked').value;
    
    let recId = recipientSelect.value;
    let recName = exec.name;

    if (type === "suggestion") {
      const targetUser = State.users.find(x => x.uid === recId);
      if (targetUser) {
        recName = targetUser.name;
      }
    } else {
      recId = exec.uid;
      recName = exec.name;
    }

    try {
      const resId = await S.createSuggestion({
        type,
        senderId: State.user.uid,
        senderName: State.user.name,
        realSenderName: State.user.name,
        recipientId: recId,
        recipientName: recName,
        title: $("#sugTitle").value.trim(),
        content: $("#sugContent").value.trim(),
        attachment: State.tempSuggestionAttachment
      });

      // إشعار فوري
      await S.pushNotification({
        userId: recId,
        type: type === "complaint" ? "complaint" : "suggestion",
        title: type === "complaint" ? "وصلك شكوى جديدة ⚠️" : "وصلك اقتراح جديد 💡",
        body: type === "complaint" 
          ? `لديك شكوى جديدة موجهة إليك من ${State.user.name}` 
          : `وصلك اقتراح جديد من ${State.user.name}`
      }).catch(err => console.warn("Error sending notification:", err));

      await showActionSuccess({
        title: type === "complaint" ? "تم إرسال الشكوى" : "تم إرسال الاقتراح",
        message: "شكراً لك، تم استلام رسالتك بسرية وعناية وسيتم متابعتها."
      });
      await loadAllData();
      renderSuggestions();
    } catch (err) {
      toast("تعذر إرسال الرسالة", "err");
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> إرسال`;
    }
  });
}

async function getNotifDebugData() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

  const data = {};
  data.userAgent = navigator.userAgent;
  data.platform = navigator.platform;
  data.matchMediaStandalone = window.matchMedia?.("(display-mode: standalone)").matches;
  data.navigatorStandalone = window.navigator ? window.navigator.standalone : undefined;
  data.isStandaloneCalculated = isStandalone;
  data.isHttps = window.location.protocol === "https:";
  data.notificationExists = "Notification" in window;
  data.notificationPermission = data.notificationExists ? Notification.permission : "N/A";
  data.serviceWorkerSupported = "serviceWorker" in navigator;
  data.pushManagerSupported = "PushManager" in window;
  data.pushManagerPresentInProto = typeof ServiceWorkerRegistration !== "undefined" && "pushManager" in ServiceWorkerRegistration.prototype;

  data.swCount = 0;
  data.swScopes = [];
  data.swActiveUrls = [];
  
  if (data.serviceWorkerSupported) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      data.swCount = regs.length;
      regs.forEach(reg => {
        data.swScopes.push(reg.scope);
        if (reg.active) {
          data.swActiveUrls.push(reg.active.scriptURL);
        }
      });
    } catch(e) {
      data.swError = e.message;
    }
  }

  try {
    data.fcmSupported = await S.fcmSupported();
  } catch(e) {
    data.fcmSupportedError = e.message;
  }

  return data;
}

function openNotifDebugModal(d) {
  const content = `
    <div class="modal-head">
      <h2>لوحة تشخيص الإشعارات (Debug Panel)</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div style="font-size:12px; direction:ltr; text-align:left; background:var(--bg-subtle); padding:12px; border-radius:var(--r-md); border:1px solid var(--line-soft); max-height:400px; overflow-y:auto; font-family:monospace; line-height:1.5; color:var(--ink)">
      <strong>--- USER AGENT ---</strong><br>
      ${esc(d.userAgent)}<br><br>
      
      <strong>--- PLATFORM ---</strong><br>
      ${esc(d.platform)}<br><br>
      
      <strong>--- PWA DETECTION ---</strong><br>
      standalone (matchMedia): ${d.matchMediaStandalone}<br>
      standalone (navigator): ${d.navigatorStandalone}<br>
      isStandalone PWA: ${d.isStandaloneCalculated}<br>
      HTTPS: ${d.isHttps}<br><br>
      
      <strong>--- NOTIFICATION API ---</strong><br>
      Notification in window: ${d.notificationExists}<br>
      Notification.permission: ${d.notificationPermission}<br><br>
      
      <strong>--- SERVICE WORKER ---</strong><br>
      serviceWorker in navigator: ${d.serviceWorkerSupported}<br>
      PushManager in window: ${d.pushManagerSupported}<br>
      pushManager in prototype: ${d.pushManagerPresentInProto}<br>
      SW Count: ${d.swCount}<br>
      ${d.swScopes.map((s, idx) => `SW #${idx+1} Scope: ${esc(s)}<br>Active URL: ${esc(d.swActiveUrls[idx] || "N/A")}`).join("<br>")}<br><br>
      
      <strong>--- FIREBASE MESSAGING ---</strong><br>
      FCM Supported: ${d.fcmSupported}<br>
      ${d.fcmSupportedError ? `FCM Check Error: ${esc(d.fcmSupportedError)}<br>` : ""}<br>
      
      <strong>--- ACTIVATION DETAIL ---</strong><br>
      activationResult: ${d.activationResult ? JSON.stringify(d.activationResult) : "none"}<br>
      exception: ${d.exception ? JSON.stringify(d.exception) : "none"}<br>
    </div>
    <div style="margin-top:14px; display:flex; justify-content:flex-end; gap:10px">
      <button class="btn btn-secondary" data-close>إغلاق</button>
    </div>
  `;
  openModal(content);
}

/* ══════════════════════════════════════════════════════════
   تتبع هالة مؤشر النظام الطبيعي (Native System Cursor Aura Listener)
 ══════════════════════════════════════════════════════════ */
(function initPortalCursorAura() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  
  const isFinePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!isFinePointer) return;

  const initAura = () => {
    // تنظيف أي عناصر ومصنفات قديمة كانت تخفي المؤشر
    const oldArrow = document.querySelector(".portal-cursor-arrow");
    const oldDot = document.querySelector(".portal-cursor-dot");
    if (oldArrow) oldArrow.remove();
    if (oldDot) oldDot.remove();
    document.body.classList.remove("has-custom-cursor");

    let ring = document.querySelector(".portal-cursor-ring");
    if (!ring) {
      ring = document.createElement("div");
      ring.className = "portal-cursor-ring";
      document.body.appendChild(ring);
    }

    let mouseX = -100, mouseY = -100;
    let ringX = -100, ringY = -100;
    let isMoving = false;
    let rafId = null;

    function render() {
      ringX += (mouseX - ringX) * 0.25;
      ringY += (mouseY - ringY) * 0.25;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;

      if (isMoving) {
        rafId = requestAnimationFrame(render);
      }
    }

    window.addEventListener("mousemove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (!document.body.classList.contains("cursor-active")) {
        document.body.classList.add("cursor-active");
        ringX = mouseX;
        ringY = mouseY;
      }

      if (!isMoving) {
        isMoving = true;
        rafId = requestAnimationFrame(render);
      }
    }, { passive: true });

    document.addEventListener("mouseleave", () => {
      document.body.classList.remove("cursor-active");
      isMoving = false;
      if (rafId) cancelAnimationFrame(rafId);
    });

    document.addEventListener("mousedown", () => {
      document.body.classList.add("cursor-down");
    });

    document.addEventListener("mouseup", () => {
      document.body.classList.remove("cursor-down");
    });

    document.addEventListener("mouseover", (e) => {
      const target = e.target;
      if (!target) return;

      const isText = target.closest("input, textarea, select, [contenteditable='true']");
      if (isText) {
        document.body.classList.add("cursor-text-hover");
        document.body.classList.remove("cursor-hover");
        return;
      } else {
        document.body.classList.remove("cursor-text-hover");
      }

      const isClickable = target.closest("a, button, [role='button'], .btn, .nav-item, .card-link, .sf-logout, .clickable, select, input[type='checkbox'], input[type='radio'], input[type='button'], input[type='submit']");
      if (isClickable) {
        document.body.classList.add("cursor-hover");
      } else {
        document.body.classList.remove("cursor-hover");
      }
    }, { passive: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAura);
  } else {
    initAura();
  }
})();
