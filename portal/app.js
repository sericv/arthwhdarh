/* ══════════════════════════════════════════════════════════
   البوابة الداخلية — منطق التطبيق
   جمعية إرث وحضارة بالقريات
══════════════════════════════════════════════════════════ */
import {
  ROLES, DEPARTMENTS, FILE_STATUS, TASK_STATUS, TASK_PRIORITY,
  NOTIF_TYPE, NOTIF_PREFS, NOTIF_PREFS_DEFAULT, ACTIVITY_TYPE, COL
} from "./config.js";
import * as S from "./services.js";

/* ════════ الحالة العامة ════════ */
const State = {
  user: null,          // ملف المستخدم الحالي + الصلاحيات
  users: [],           // كل الموظفين
  files: [],
  tasks: [],
  notifs: [],
  activity: [],
  view: "dash",
  filesDept: null,     // الإدارة النشطة في قسم الملفات
  filesCat: "all",
  filesQuery: "",
  notifUnsub: null,
  notifMode: null,        // "fcm" | "browser" | null
  notifSeen: new Set(),   // مُعرّفات الإشعارات المعروضة محلياً (لمنع التكرار)
  notifPrefs: { ...NOTIF_PREFS_DEFAULT },  // تفضيلات الفئات
  deviceToken: null,      // رمز FCM لهذا الجهاز
  notifQuery: "",         // بحث مركز الإشعارات
  notifFilter: "all"      // فلتر الفئة في المركز
};

/* ════════ أدوات مساعدة ════════ */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => (s||"").toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const initials = n => (n||"؟").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("");
function fmtSize(b){ if(!b) return "—"; const u=["B","KB","MB","GB"]; let i=0; while(b>=1024&&i<3){b/=1024;i++;} return `${b.toFixed(b<10&&i>0?1:0)} ${u[i]}`; }
function tsToDate(ts){ if(!ts) return null; if(ts.toDate) return ts.toDate(); if(ts.seconds) return new Date(ts.seconds*1000); return new Date(ts); }
function timeAgo(ts){
  const d=tsToDate(ts); if(!d) return "—";
  const s=Math.floor((Date.now()-d.getTime())/1000);
  if(s<60) return "الآن";
  if(s<3600) return `قبل ${Math.floor(s/60)} د`;
  if(s<86400) return `قبل ${Math.floor(s/3600)} س`;
  if(s<604800) return `قبل ${Math.floor(s/86400)} ي`;
  return d.toLocaleDateString("ar-SA",{day:"numeric",month:"short"});
}
function fmtDate(ts){ const d=tsToDate(ts); return d?d.toLocaleDateString("ar-SA",{day:"numeric",month:"long",year:"numeric"}):"—"; }
function fileIconMeta(mime,name){
  const ext=(name||"").split(".").pop().toLowerCase();
  if(/image|png|jpe?g|gif|webp|svg/.test(mime+ext)) return {i:"fa-file-image",c:"#3a5e2e"};
  if(/video|mp4|mov|avi|mkv/.test(mime+ext))        return {i:"fa-file-video",c:"#7a3b52"};
  if(/pdf/.test(mime+ext))                          return {i:"fa-file-pdf",c:"#7a2518"};
  if(/word|doc/.test(mime+ext))                     return {i:"fa-file-word",c:"#2d4a63"};
  if(/excel|sheet|xls|csv/.test(mime+ext))          return {i:"fa-file-excel",c:"#3a5e2e"};
  if(/powerpoint|presentation|ppt/.test(mime+ext))  return {i:"fa-file-powerpoint",c:"#b8651a"};
  if(/zip|rar|7z/.test(mime+ext))                   return {i:"fa-file-zipper",c:"#6b4f35"};
  return {i:"fa-file-lines",c:"#9c6e38"};
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

/* ════════ Modal ════════ */
function openModal(html, wide){
  const m=$("#modal");
  m.className = "modal" + (wide?" preview-modal":"");
  m.innerHTML=html;
  $("#modalShroud").classList.add("open");
  document.body.style.overflow="hidden";
  $$("[data-close]",m).forEach(b=>b.addEventListener("click",closeModal));
}
function closeModal(){
  $("#modalShroud").classList.remove("open");
  document.body.style.overflow="";
}
$("#modalShroud").addEventListener("click",e=>{ if(e.target.id==="modalShroud") closeModal(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeModal(); });

/* ════════ تسجيل الدخول ════════ */
S.onAuthStateChanged(S.auth, async (fbUser)=>{
  if(!fbUser){ showLogin(); return; }
  const profile = await S.fetchUserProfile(fbUser.uid);
  if(!profile){
    await S.logout();
    showLogin("هذا الحساب غير مُصرّح له بالدخول إلى البوابة. تواصل مع الإدارة التنفيذية.");
    return;
  }
  State.user = profile;
  await enterApp();
});

function showLogin(err=""){
  $("#bootScreen").classList.add("hidden");
  $("#appShell").classList.remove("show");
  $("#loginScreen").classList.remove("hidden");
  $("#loginErr").innerHTML = err ? `<i class="fa-solid fa-circle-exclamation"></i><span>${esc(err)}</span>` : "";
}

$("#loginForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email=$("#loginEmail").value.trim();
  const pass=$("#loginPass").value;
  const btn=$("#loginBtn");
  $("#loginErr").innerHTML="";
  if(!email||!pass){ $("#loginErr").innerHTML=`<i class="fa-solid fa-circle-exclamation"></i><span>أدخل البريد وكلمة المرور</span>`; return; }
  btn.disabled=true;
  btn.innerHTML=`<i class="fa-solid fa-spinner spin"></i> جارٍ الدخول…`;
  try{
    await S.login(email,pass);
    // onAuthStateChanged يتولى الباقي
  }catch(err){
    const map={
      "auth/invalid-credential":"البريد أو كلمة المرور غير صحيحة",
      "auth/user-not-found":"لا يوجد حساب بهذا البريد",
      "auth/wrong-password":"كلمة المرور غير صحيحة",
      "auth/invalid-email":"صيغة البريد غير صحيحة",
      "auth/too-many-requests":"محاولات كثيرة — حاول لاحقاً"
    };
    $("#loginErr").innerHTML=`<i class="fa-solid fa-circle-exclamation"></i><span>${map[err.code]||"تعذّر تسجيل الدخول"}</span>`;
    btn.disabled=false;
    btn.innerHTML=`<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول`;
  }
});

/* ════════ دخول التطبيق ════════ */
async function enterApp(){
  $("#bootScreen").classList.add("hidden");
  $("#loginScreen").classList.add("hidden");
  $("#appShell").classList.add("show");

  renderSidebar();
  renderUserFooter();

  // تحميل البيانات الأولية
  await loadAllData();

  // الإشعارات اللحظية
  if(State.notifUnsub) State.notifUnsub();
  let firstNotifLoad = true;
  State.notifUnsub = S.watchNotifications(State.user, (list)=>{
    // عند الوصول الأول: سجّل المعروض مسبقاً دون تنبيه (تجنّب إغراق المستخدم)
    if(firstNotifLoad){
      list.forEach(n => State.notifSeen.add(n.id));
      firstNotifLoad = false;
    } else {
      // إشعار متصفح محلي للجديد غير المقروء (احتياطي يعمل بلا FCM)
      // يحترم تفضيلات الفئات؛ يظهر فقط حين يكون التبويب في الخلفية
      list.filter(n => !n.read && !State.notifSeen.has(n.id)).forEach(n=>{
        State.notifSeen.add(n.id);
        if(!prefAllows(n)) return;
        if(document.visibilityState !== "visible"){
          S.showLocalNotification(n.title, n.body, {
            tag: n.id,
            onClick: () => onNotifClick(n.id)
          });
        }
      });
    }
    State.notifs = list;
    renderNotifBadge();
    if(State.view==="notifs") renderNotifs();
    renderNotifPanel();
  });

  // تفضيلات الإشعارات (مع القيمة الافتراضية)
  State.notifPrefs = { ...NOTIF_PREFS_DEFAULT, ...(await S.getNotifPrefs(State.user.uid).catch(()=>null) || {}) };

  // FCM / إشعارات المتصفح — تهيئة صامتة عند الدخول (بلا أخطاء مزعجة)
  S.initMessaging(State.user.uid).then(res=>{
    State.notifMode = res.ok ? res.mode : null;   // "fcm" | "browser" | null
    if(res.token){ State.deviceToken = res.token; S.touchToken(res.token); }
    console.log("[Portal] notification mode:", State.notifMode || `inactive (${res.reason})`);
  });
  // رسائل FCM في المقدمة (إن وُجدت)
  S.onForegroundMessage((payload)=>{
    const d=payload.data||{}; const n=payload.notification||{};
    toast(n.title||d.title||"إشعار جديد","ok");
  });
  // جسر النقر على الإشعار من الـ Service Worker → تنقّل عميق
  S.onSwMessage((m)=>{
    if(m.kind==="notification-click"){
      if(m.notifId) S.markNotifRead(m.notifId).catch(()=>{});
      if(m.link) navigate(m.link);
    }
  });
  // تنقّل عميق من رابط الإشعار عند فتح نافذة جديدة (#tasks:ID)
  handleDeepLinkHash();

  // سجل الدخول
  S.logActivity({ type:"login", actorId:State.user.uid, actorName:State.user.name, detail:"تسجيل دخول إلى البوابة" });

  navigate("dash");
}

async function loadAllData(){
  const depts = State.user.perms.departments;
  const [users, files, tasks, activity] = await Promise.all([
    State.user.perms.canManage ? S.listUsers() : Promise.resolve([State.user]),
    S.listFiles(depts).catch(()=>[]),
    S.listTasks(State.user).catch(()=>[]),
    S.listActivity(60).catch(()=>[])
  ]);
  State.users = users;
  State.files = files;
  State.tasks = tasks;
  State.activity = activity;
  if(!State.filesDept) State.filesDept = depts[0];
}

/* ════════ الشريط الجانبي ════════ */
function renderSidebar(){
  const p=State.user.perms;
  let main = `
    <li><button class="nav-item" data-nav="dash"><i class="fa-solid fa-gauge-high"></i><span class="nlbl">الرئيسية</span></button></li>
    <li><button class="nav-item" data-nav="files"><i class="fa-solid fa-folder-open"></i><span class="nlbl">الملفات</span></button></li>
    <li><button class="nav-item" data-nav="tasks"><i class="fa-solid fa-list-check"></i><span class="nlbl">المهام</span><span class="nbadge" id="navTaskBadge" style="display:none"></span></button></li>
    <li><button class="nav-item" data-nav="notifs"><i class="fa-solid fa-bell"></i><span class="nlbl">الإشعارات</span><span class="nbadge" id="navNotifBadge" style="display:none"></span></button></li>
    <li><button class="nav-item" data-nav="activity"><i class="fa-solid fa-clock-rotate-left"></i><span class="nlbl">سجل النشاط</span></button></li>`;
  let admin = "";
  if(p.canManage){
    admin = `
    <div class="nav-sec">الإدارة · Management</div>
    <ul class="nav-list">
      <li><button class="nav-item" data-nav="members"><i class="fa-solid fa-users"></i><span class="nlbl">الموظفون</span></button></li>
      <li><button class="nav-item" data-nav="settings"><i class="fa-solid fa-gear"></i><span class="nlbl">الإعدادات</span></button></li>
    </ul>`;
  } else {
    admin = `
    <div class="nav-sec">الحساب · Account</div>
    <ul class="nav-list">
      <li><button class="nav-item" data-nav="settings"><i class="fa-solid fa-gear"></i><span class="nlbl">الإعدادات</span></button></li>
    </ul>`;
  }
  $("#navWrap").innerHTML = `
    <div class="nav-sec">البوابة · Portal</div>
    <ul class="nav-list">${main}</ul>
    ${admin}`;
  $$("[data-nav]").forEach(b=>b.addEventListener("click",()=>{ navigate(b.dataset.nav); closeSidebar(); }));
}

function renderUserFooter(){
  const u=State.user;
  $("#sidebarFoot").innerHTML=`
    <div class="sf-card">
      <div class="sf-avatar">${esc(initials(u.name))}</div>
      <div class="sf-who"><div class="n">${esc(u.name)}</div><div class="r">${esc(u.perms.label)}</div></div>
      <button class="sf-logout" id="footLogout" title="تسجيل الخروج"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
    </div>`;
  $("#footLogout").addEventListener("click",doLogout);
}

async function doLogout(){
  if(!confirm("هل تريد تسجيل الخروج من البوابة؟")) return;
  if(State.notifUnsub) State.notifUnsub();
  // إلغاء تسجيل رمز هذا الجهاز حتى لا تصله إشعارات بعد الخروج
  if(State.deviceToken){ await S.deleteFcmTokenDoc(State.deviceToken).catch(()=>{}); }
  await S.logout();
}

/* ════════ التنقّل ════════ */
const VIEW_META = {
  dash:     { la:"Dashboard", lbl:"الرئيسية",     fn:renderDash },
  files:    { la:"Files",     lbl:"الملفات",      fn:renderFiles },
  tasks:    { la:"Tasks",     lbl:"المهام",       fn:renderTasks },
  notifs:   { la:"Alerts",    lbl:"الإشعارات",    fn:renderNotifs },
  activity: { la:"Activity",  lbl:"سجل النشاط",   fn:renderActivity },
  members:  { la:"Members",   lbl:"الموظفون",     fn:renderMembers },
  settings: { la:"Settings",  lbl:"الإعدادات",    fn:renderSettings }
};

function navigate(view){
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

/* ════════ رأس الصفحة ════════ */
function pageHead(la, lbl, title, accent, sub){
  return `<div class="page-head">
    <div class="page-eyebrow"><span class="pe-dot"></span><span class="pe-la">${la}</span><span class="pe-lbl">${lbl}</span></div>
    <h1 class="page-title">${title} <span class="accent">${accent||""}</span></h1>
    ${sub?`<p class="page-sub">${sub}</p>`:""}
  </div>`;
}
function emptyState(msg, sub="لا يوجد ما يُعرض"){
  return `<div class="empty-state">
    <div class="es-orn"><div class="es-line"></div><div class="es-diamond"></div><div class="es-line r"></div></div>
    <div class="es-glyph">۞</div>
    <div class="es-msg">${esc(msg)}</div>
    <div class="es-sub">${esc(sub)}</div>
  </div>`;
}

/* ════════════════ لوحة المعلومات ════════════════ */
function renderDash(el){
  const u=State.user;
  const pendingTasks = State.tasks.filter(t=>t.status!=="completed");
  const pendingApprovals = State.files.filter(f=>f.status==="under_review");
  const recentFiles = State.files.slice(0,5);
  const unread = State.notifs.filter(n=>!n.read).length;

  el.innerHTML = `
    ${pageHead("Dashboard","الرئيسية", `مرحباً، ${esc(u.name.split(" ")[0])}`, "", `نظرة عامة على مهامك وملفاتك وآخر المستجدات في ${esc(u.perms.label)}.`)}

    <div class="stats-grid">
      ${statCard("fa-folder","Files","الملفات", State.files.length, "إجمالي الملفات المتاحة")}
      ${statCard("fa-list-check","Tasks","المهام المعلّقة", pendingTasks.length, "بانتظار الإنجاز")}
      ${statCard("fa-bell","Alerts","إشعارات غير مقروءة", unread, "تحتاج انتباهك")}
      ${statCard("fa-circle-check","Review","بانتظار الاعتماد", pendingApprovals.length, "ملفات قيد المراجعة")}
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head">
          <div><h3>آخر النشاطات</h3><div class="la">Recent Activity</div></div>
          <button class="card-link" data-goto="activity">عرض الكل <i class="fa-solid fa-arrow-left" style="font-size:10px"></i></button>
        </div>
        <div class="act-list">
          ${State.activity.length ? State.activity.slice(0,6).map(actRow).join("") : `<div style="padding:30px 0;text-align:center;color:var(--ink-muted);font-size:13px">لا يوجد نشاط بعد</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div><h3>مهام بانتظارك</h3><div class="la">Pending Tasks</div></div>
          <button class="card-link" data-goto="tasks">الكل <i class="fa-solid fa-arrow-left" style="font-size:10px"></i></button>
        </div>
        ${pendingTasks.length ? `<div style="display:flex;flex-direction:column;gap:10px">
          ${pendingTasks.slice(0,4).map(miniTask).join("")}
        </div>` : `<div style="padding:24px 0;text-align:center;color:var(--ink-muted);font-size:13px">لا مهام معلّقة 🎉</div>`}
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-head">
        <div><h3>أحدث الملفات</h3><div class="la">Recent Files</div></div>
        <button class="card-link" data-goto="files">إدارة الملفات <i class="fa-solid fa-arrow-left" style="font-size:10px"></i></button>
      </div>
      ${recentFiles.length ? `<div class="files-grid">${recentFiles.map(fileCard).join("")}</div>` : emptyState("لا توجد ملفات بعد","ابدأ برفع أول ملف")}
    </div>
  `;
  bindDashEvents(el);
}
function statCard(icon, la, label, value, foot){
  return `<div class="stat">
    <div class="stat-top"><div class="stat-ico"><i class="fa-solid ${icon}"></i></div><span class="stat-la">${la}</span></div>
    <div class="stat-value">${value}</div>
    <div class="stat-label">${esc(label)} · ${esc(foot)}</div>
  </div>`;
}
function actRow(a){
  const m=ACTIVITY_TYPE[a.type]||ACTIVITY_TYPE.edit;
  return `<div class="act-item">
    <div class="act-marker" style="color:${m.color}"><i class="fa-solid ${m.icon}"></i></div>
    <div class="act-body">
      <div class="act-title"><b>${esc(a.actorName||"موظف")}</b> · ${esc(m.label)}${a.resource?` — ${esc(a.resource)}`:""}</div>
      <div class="act-meta">${timeAgo(a.createdAt)}${a.detail?` · ${esc(a.detail)}`:""}</div>
    </div>
  </div>`;
}
function miniTask(t){
  const st=TASK_STATUS[t.status]||TASK_STATUS.pending;
  const pr=TASK_PRIORITY[t.priority]||TASK_PRIORITY.medium;
  return `<div class="task-card" data-task="${t.id}">
    <div class="tc-head"><div class="tc-title">${esc(t.title)}</div>
      <span class="prio-badge" style="color:${pr.color};border-color:${pr.color}55"><i class="fa-solid fa-flag"></i>${pr.label}</span></div>
    <div class="tc-foot">
      <span class="status-badge" style="color:${st.color};border-color:${st.color}55;background:${st.bg}">${st.label}</span>
      <span class="tc-due"><i class="fa-regular fa-calendar"></i>${t.dueDate?fmtDate(t.dueDate):"بدون موعد"}</span>
    </div>
  </div>`;
}
function bindDashEvents(el){
  $$("[data-goto]",el).forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.goto)));
  $$("[data-task]",el).forEach(c=>c.addEventListener("click",()=>openTaskDetail(c.dataset.task)));
  $$("[data-file]",el).forEach(c=>{}); // ملفات اللوحة عرض فقط
  bindFileCardEvents(el);
}

/* ════════════════ الملفات ════════════════ */
function renderFiles(el){
  const depts=State.user.perms.departments;
  if(!State.filesDept || !depts.includes(State.filesDept)) State.filesDept=depts[0];

  el.innerHTML = `
    ${pageHead("Files","الملفات","إدارة","الوثائق", "رفع الملفات وتنزيلها ومتابعة حالة اعتمادها حسب الإدارة والتصنيف.")}
    <div class="dept-tabs" id="deptTabs">
      ${depts.map(d=>{ const D=DEPARTMENTS[d]; return `<button class="dept-tab ${d===State.filesDept?"active":""}" data-dept="${d}"><i class="fa-solid ${D.icon}"></i>${D.label}</button>`; }).join("")}
    </div>
    <div class="toolbar">
      <div class="search-box"><i class="fa-solid fa-magnifying-glass"></i><input id="fileSearch" placeholder="ابحث في الملفات…" value="${esc(State.filesQuery)}"></div>
      <div class="filters" id="catFilters"></div>
      <div class="spacer"></div>
      <button class="btn btn-primary" id="uploadBtn"><i class="fa-solid fa-arrow-up-from-bracket"></i> رفع ملف</button>
    </div>
    <div id="filesArea"></div>
  `;
  renderCatFilters();
  renderFilesArea();

  $$("#deptTabs [data-dept]").forEach(b=>b.addEventListener("click",()=>{
    State.filesDept=b.dataset.dept; State.filesCat="all";
    $$("#deptTabs .dept-tab").forEach(t=>t.classList.toggle("active",t===b));
    renderCatFilters(); renderFilesArea();
  }));
  $("#fileSearch").addEventListener("input",e=>{ State.filesQuery=e.target.value; renderFilesArea(); });
  $("#uploadBtn").addEventListener("click",openUploadModal);
}
function renderCatFilters(){
  const cats=DEPARTMENTS[State.filesDept].categories;
  const counts={};
  State.files.filter(f=>f.department===State.filesDept).forEach(f=>counts[f.category]=(counts[f.category]||0)+1);
  const total=State.files.filter(f=>f.department===State.filesDept).length;
  $("#catFilters").innerHTML =
    `<button class="chip ${State.filesCat==="all"?"active":""}" data-cat="all">الكل<span class="chip-count">${total}</span></button>` +
    cats.map(c=>`<button class="chip ${State.filesCat===c.id?"active":""}" data-cat="${c.id}">${c.label}<span class="chip-count">${counts[c.id]||0}</span></button>`).join("");
  $$("#catFilters [data-cat]").forEach(b=>b.addEventListener("click",()=>{
    State.filesCat=b.dataset.cat;
    $$("#catFilters .chip").forEach(c=>c.classList.toggle("active",c===b));
    renderFilesArea();
  }));
}
function currentFiles(){
  const q=State.filesQuery.trim().toLowerCase();
  return State.files.filter(f=>
    f.department===State.filesDept &&
    (State.filesCat==="all"||f.category===State.filesCat) &&
    (!q || (f.name||"").toLowerCase().includes(q) || (f.note||"").toLowerCase().includes(q))
  );
}
function renderFilesArea(){
  const list=currentFiles();
  const area=$("#filesArea");
  if(!area) return;
  area.innerHTML = list.length
    ? `<div class="files-grid">${list.map(fileCard).join("")}</div>`
    : emptyState("لا توجد ملفات في هذا التصنيف","ارفع ملفاً جديداً للبدء");
  bindFileCardEvents(area);
}
function fileCard(f){
  const ic=fileIconMeta(f.mime,f.name);
  const st=FILE_STATUS[f.status]||FILE_STATUS.draft;
  const catLabel=(DEPARTMENTS[f.department]?.categories.find(c=>c.id===f.category)?.label)||f.category;
  const canApprove=State.user.perms.canApprove;
  return `<div class="file-card" data-file="${f.id}">
    <div class="fc-top">
      <div class="fc-ico" style="background:${ic.c}"><i class="fa-solid ${ic.i}"></i></div>
      <div class="fc-info">
        <div class="fc-name">${esc(f.name)}</div>
        <div class="fc-meta">${esc(catLabel)} · ${fmtSize(f.size)} · ${timeAgo(f.createdAt)}</div>
      </div>
    </div>
    <div class="fc-body">
      ${f.note?`<div class="fc-note">${esc(f.note)}</div>`:""}
      <span class="status-badge" style="color:${st.color};border-color:${st.color}55;background:${st.bg}">${st.label}</span>
    </div>
    <div class="fc-foot">
      <div class="fc-actions">
        <button class="fc-act" data-act="preview" data-id="${f.id}" title="معاينة"><i class="fa-solid fa-eye"></i></button>
        <button class="fc-act" data-act="download" data-id="${f.id}" title="تنزيل"><i class="fa-solid fa-download"></i></button>
        ${canApprove?`<button class="fc-act ok" data-act="review" data-id="${f.id}" title="مراجعة واعتماد"><i class="fa-solid fa-gavel"></i></button>`:""}
        ${(canApprove||f.uploadedBy===State.user.uid)?`<button class="fc-act danger" data-act="delete" data-id="${f.id}" title="حذف"><i class="fa-solid fa-trash"></i></button>`:""}
      </div>
      <span class="fc-meta">${esc((f.uploaderName||"").split(" ")[0]||"")}</span>
    </div>
  </div>`;
}
function bindFileCardEvents(scope){
  $$("[data-act]",scope).forEach(b=>b.addEventListener("click",e=>{
    e.stopPropagation();
    const f=State.files.find(x=>x.id===b.dataset.id);
    if(!f) return;
    const act=b.dataset.act;
    if(act==="preview")  openFilePreview(f);
    if(act==="download") downloadFile(f);
    if(act==="review")   openFileReview(f);
    if(act==="delete")   confirmDeleteFile(f);
  }));
}

function downloadFile(f){
  const a=document.createElement("a");
  a.href=f.url; a.target="_blank"; a.rel="noopener"; a.download=f.name;
  document.body.appendChild(a); a.click(); a.remove();
  S.logActivity({ type:"download", actorId:State.user.uid, actorName:State.user.name, resource:f.name });
  toast("جارٍ تنزيل الملف");
}

function openFilePreview(f){
  const isImg=/image|png|jpe?g|gif|webp|svg/.test((f.mime||"")+f.name);
  const isVid=/video|mp4|webm|mov/.test((f.mime||"")+f.name);
  const isPdf=/pdf/.test((f.mime||"")+f.name.toLowerCase());
  let body;
  if(isImg) body=`<div class="preview-frame"><img src="${f.url}" alt="${esc(f.name)}"></div>`;
  else if(isVid) body=`<div class="preview-frame"><video src="${f.url}" controls></video></div>`;
  else if(isPdf) body=`<div class="preview-frame"><iframe src="${f.url}"></iframe></div>`;
  else body=`<div class="preview-unsupported"><i class="fa-solid fa-file-lines"></i><div>لا يمكن معاينة هذا النوع مباشرة</div><button class="btn btn-gold" id="pvDl"><i class="fa-solid fa-download"></i> تنزيل الملف</button></div>`;
  const st=FILE_STATUS[f.status]||FILE_STATUS.draft;
  const comments=(f.comments||[]);
  openModal(`
    <div class="modal-head">
      <div><div class="la">File Preview · معاينة</div><h2>${esc(f.name)}</h2></div>
      <button class="close-btn" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <span class="status-badge" style="color:${st.color};border-color:${st.color}55;background:${st.bg}">${st.label}</span>
      <span class="fc-meta">${fmtSize(f.size)} · رفعه ${esc(f.uploaderName||"")} · ${fmtDate(f.createdAt)}</span>
    </div>
    ${body}
    ${comments.length?`<div style="margin-top:18px"><div class="field label" style="font-weight:700;margin-bottom:8px">ملاحظات الاعتماد <span class="la">Approval Notes</span></div>
      <div class="comments-list">${comments.map(c=>`<div class="comment"><div class="comment-head"><span class="comment-by">${esc(c.by)}</span><span class="comment-time">${timeAgo(c.at)}</span></div><div class="comment-text">${esc(c.text)}</div></div>`).join("")}</div></div>`:""}
    <div class="modal-foot">
      <button class="btn btn-gold" id="pvDownload"><i class="fa-solid fa-download"></i> تنزيل</button>
      <div class="spacer"></div>
      <button class="btn btn-ghost" data-close>إغلاق</button>
    </div>
  `, true);
  $("#pvDownload")?.addEventListener("click",()=>downloadFile(f));
  $("#pvDl")?.addEventListener("click",()=>downloadFile(f));
}

function openFileReview(f){
  openModal(`
    <div class="modal-head">
      <div><div class="la">Approval Workflow · سير الاعتماد</div><h2>مراجعة الملف</h2></div>
      <button class="close-btn" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div style="margin-bottom:18px;padding:14px 16px;background:var(--parchment-2);border:1px solid var(--line-soft);border-radius:var(--r-sm)">
      <div style="font-weight:700;font-size:14px;color:var(--ink);margin-bottom:4px">${esc(f.name)}</div>
      <div class="fc-meta">${fmtSize(f.size)} · ${esc(f.uploaderName||"")}</div>
    </div>
    <div class="form-grid">
      <div class="field full">
        <label>الحالة الجديدة <span class="la">New Status</span></label>
        <select id="rvStatus">
          ${Object.entries(FILE_STATUS).map(([k,v])=>`<option value="${k}" ${f.status===k?"selected":""}>${v.label}</option>`).join("")}
        </select>
      </div>
      <div class="field full">
        <label>ملاحظة أو تعليق <span class="la">Comment / Note</span></label>
        <textarea id="rvComment" placeholder="اكتب ملاحظة الاعتماد أو سبب طلب التعديل…"></textarea>
        <span class="field-help">تُحفظ الملاحظة في سجل الملف وتظهر لمن رفعه.</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-success" id="rvSave"><i class="fa-solid fa-check"></i> حفظ القرار</button>
      <div class="spacer"></div>
      <button class="btn btn-ghost" data-close>إلغاء</button>
    </div>
  `);
  $("#rvSave").addEventListener("click",async()=>{
    const status=$("#rvStatus").value;
    const comment=$("#rvComment").value.trim();
    const btn=$("#rvSave"); btn.disabled=true; btn.innerHTML=`<i class="fa-solid fa-spinner spin"></i> حفظ…`;
    try{
      await S.setFileStatus(f.id, status, comment, { name:State.user.name });
      // إشعار + سجل
      if(status==="approved"){
        await S.pushNotification({ userId:f.uploadedBy, type:"file_approved", title:"تم اعتماد ملفك", body:f.name, link:"files", refId:f.id });
        await S.logActivity({ type:"approve", actorId:State.user.uid, actorName:State.user.name, resource:f.name });
      } else if(status==="revision_required"){
        await S.pushNotification({ userId:f.uploadedBy, type:"file_revision", title:"ملف يحتاج تعديلاً", body:f.name+(comment?` — ${comment}`:""), link:"files", refId:f.id });
        await S.logActivity({ type:"revision", actorId:State.user.uid, actorName:State.user.name, resource:f.name, detail:comment });
      } else {
        await S.logActivity({ type:"edit", actorId:State.user.uid, actorName:State.user.name, resource:f.name, detail:`الحالة: ${FILE_STATUS[status].label}` });
      }
      f.status=status; f.comments=f.comments||[]; if(comment) f.comments.push({text:comment,by:State.user.name,status,at:{seconds:Date.now()/1000}});
      closeModal(); toast("تم حفظ قرار المراجعة"); refreshAfterMutation();
    }catch(e){ console.error(e); toast("تعذّر حفظ القرار","err"); btn.disabled=false; btn.innerHTML=`<i class="fa-solid fa-check"></i> حفظ القرار`; }
  });
}

function confirmDeleteFile(f){
  if(!confirm(`حذف الملف "${f.name}" نهائياً؟`)) return;
  S.deleteFile(f.id, f.storagePath).then(()=>{
    State.files=State.files.filter(x=>x.id!==f.id);
    toast("تم حذف الملف"); renderFilesArea(); renderCatFilters();
  }).catch(()=>toast("تعذّر حذف الملف","err"));
}

let pendingUpload=null;
function openUploadModal(){
  const cats=DEPARTMENTS[State.filesDept].categories;
  openModal(`
    <div class="modal-head">
      <div><div class="la">Upload · رفع ملف</div><h2>رفع ملف جديد</h2></div>
      <button class="close-btn" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="form-grid two">
      <div class="field">
        <label>الإدارة <span class="la">Department</span></label>
        <select id="upDept">
          ${State.user.perms.departments.map(d=>`<option value="${d}" ${d===State.filesDept?"selected":""}>${DEPARTMENTS[d].label}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>التصنيف <span class="la">Category</span></label>
        <select id="upCat">${cats.map(c=>`<option value="${c.id}">${c.label}</option>`).join("")}</select>
      </div>
      <div class="field full">
        <label>ملاحظة <span class="la">Note (optional)</span></label>
        <input id="upNote" placeholder="وصف مختصر للملف…">
      </div>
      <div class="field full">
        <div class="dropzone" id="dropzone">
          <div class="dz-ico"><i class="fa-solid fa-cloud-arrow-up"></i></div>
          <div class="dz-main">اسحب الملف هنا أو اضغط للاختيار</div>
          <div class="dz-sub">PDF · صور · فيديو · مستندات</div>
          <input type="file" id="fileInput">
        </div>
        <div id="dzFile"></div>
        <div class="prog-wrap" id="progWrap"><div class="prog-bar"><div class="prog-fill" id="progFill"></div></div><div class="prog-lbl" id="progLbl">0%</div></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-primary" id="upSubmit" disabled><i class="fa-solid fa-arrow-up-from-bracket"></i> رفع الملف</button>
      <div class="spacer"></div>
      <button class="btn btn-ghost" data-close>إلغاء</button>
    </div>
  `);
  pendingUpload=null;
  // ربط تغيير الإدارة بتحديث التصنيفات
  $("#upDept").addEventListener("change",e=>{
    const cs=DEPARTMENTS[e.target.value].categories;
    $("#upCat").innerHTML=cs.map(c=>`<option value="${c.id}">${c.label}</option>`).join("");
  });
  const dz=$("#dropzone"), input=$("#fileInput");
  dz.addEventListener("click",()=>input.click());
  ["dragover","dragenter"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("drag");}));
  ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("drag");}));
  dz.addEventListener("drop",e=>{ if(e.dataTransfer.files[0]) setUpFile(e.dataTransfer.files[0]); });
  input.addEventListener("change",e=>{ if(e.target.files[0]) setUpFile(e.target.files[0]); });
  $("#upSubmit").addEventListener("click",doUpload);
}
function setUpFile(file){
  pendingUpload=file;
  const ic=fileIconMeta(file.type,file.name);
  $("#dzFile").innerHTML=`<div class="dz-file"><i class="fa-solid ${ic.i}"></i><span>${esc(file.name)}</span><span class="fc-meta">${fmtSize(file.size)}</span><button class="rm" id="dzRm"><i class="fa-solid fa-xmark"></i></button></div>`;
  $("#dzRm").addEventListener("click",e=>{e.stopPropagation();pendingUpload=null;$("#dzFile").innerHTML="";$("#upSubmit").disabled=true;});
  $("#upSubmit").disabled=false;
}
async function doUpload(){
  if(!pendingUpload) return;
  const dept=$("#upDept").value, cat=$("#upCat").value, note=$("#upNote").value.trim();
  const btn=$("#upSubmit"); btn.disabled=true;
  $("#progWrap").classList.add("show");
  try{
    const id=await S.uploadFile(pendingUpload,{
      department:dept, category:cat, note,
      uploadedBy:State.user.uid, uploaderName:State.user.name
    },p=>{ $("#progFill").style.width=p+"%"; $("#progLbl").textContent=p+"%"; });

    await S.logActivity({ type:"upload", actorId:State.user.uid, actorName:State.user.name, resource:pendingUpload.name });
    // إشعار للإدارة التنفيذية للمراجعة
    await S.pushNotification({ userId:"dept:executive", type:"file_uploaded", title:"ملف جديد بانتظار المراجعة", body:`${pendingUpload.name} — ${DEPARTMENTS[dept].label}`, link:"files", refId:id });

    closeModal(); toast("تم رفع الملف بنجاح");
    State.files=await S.listFiles(State.user.perms.departments).catch(()=>State.files);
    if(State.view==="files"){ renderCatFilters(); renderFilesArea(); }
  }catch(e){
    console.error(e); toast(e.friendly || "تعذّر رفع الملف — تحقق من إعدادات التخزين","err");
    btn.disabled=false; $("#progWrap").classList.remove("show");
  }
}

/* ════════════════ المهام ════════════════ */
function renderTasks(el){
  const canCreate=State.user.perms.canCreateTask;
  el.innerHTML = `
    ${pageHead("Tasks","المهام","إدارة","المهام", "متابعة المهام حسب الحالة من التعليق حتى الإنجاز.")}
    <div class="toolbar">
      <div class="search-box"><i class="fa-solid fa-magnifying-glass"></i><input id="taskSearch" placeholder="ابحث في المهام…"></div>
      <div class="spacer"></div>
      ${canCreate?`<button class="btn btn-primary" id="newTaskBtn"><i class="fa-solid fa-plus"></i> مهمة جديدة</button>`:""}
    </div>
    <div class="tasks-board" id="tasksBoard"></div>
  `;
  renderTasksBoard();
  $("#taskSearch").addEventListener("input",()=>renderTasksBoard($("#taskSearch").value));
  if(canCreate) $("#newTaskBtn").addEventListener("click",openTaskModal);
}
function renderTasksBoard(q=""){
  const board=$("#tasksBoard"); if(!board) return;
  q=q.trim().toLowerCase();
  const list=State.tasks.filter(t=>!q||(t.title||"").toLowerCase().includes(q)||(t.description||"").toLowerCase().includes(q));
  board.innerHTML=Object.entries(TASK_STATUS).map(([key,st])=>{
    const items=list.filter(t=>t.status===key);
    return `<div class="task-col">
      <div class="task-col-head">
        <div class="t"><span class="dot" style="background:${st.color}"></span>${st.label}</div>
        <span class="c">${items.length}</span>
      </div>
      ${items.map(taskCard).join("")||`<div style="padding:18px 4px;text-align:center;color:var(--ink-faint);font-size:11.5px">—</div>`}
    </div>`;
  }).join("");
  $$("[data-task]",board).forEach(c=>c.addEventListener("click",()=>openTaskDetail(c.dataset.task)));
}
function taskCard(t){
  const pr=TASK_PRIORITY[t.priority]||TASK_PRIORITY.medium;
  const overdue=t.dueDate && tsToDate(t.dueDate)<new Date() && t.status!=="completed";
  return `<div class="task-card" data-task="${t.id}">
    <div class="tc-head">
      <div class="tc-title">${esc(t.title)}</div>
      <span class="prio-badge" style="color:${pr.color};border-color:${pr.color}55"><i class="fa-solid fa-flag"></i>${pr.label}</span>
    </div>
    ${t.description?`<div class="tc-desc">${esc(t.description)}</div>`:""}
    <div class="tc-foot">
      <span class="tc-assignee"><span class="av">${esc(initials(t.assignLabel))}</span>${esc((t.assignLabel||"").split(" ").slice(0,2).join(" "))}</span>
      <span class="tc-due ${overdue?"overdue":""}"><i class="fa-regular fa-calendar"></i>${t.dueDate?fmtDate(t.dueDate):"—"}</span>
    </div>
  </div>`;
}
function openTaskDetail(id){
  const t=State.tasks.find(x=>x.id===id); if(!t) return;
  const pr=TASK_PRIORITY[t.priority]||TASK_PRIORITY.medium;
  const canEdit=State.user.perms.canManage ||
    (t.assignType==="user"&&t.assignTo===State.user.uid) ||
    (t.assignType==="department"&&State.user.perms.departments.includes(t.assignTo));
  openModal(`
    <div class="modal-head">
      <div><div class="la">Task Details · تفاصيل المهمة</div><h2>${esc(t.title)}</h2></div>
      <button class="close-btn" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      <span class="prio-badge" style="color:${pr.color};border-color:${pr.color}55"><i class="fa-solid fa-flag"></i>أولوية ${pr.label}</span>
      <span class="tc-due"><i class="fa-regular fa-calendar"></i>${t.dueDate?fmtDate(t.dueDate):"بدون موعد"}</span>
      <span class="tc-assignee"><span class="av">${esc(initials(t.assignLabel))}</span>${esc(t.assignLabel||"")}</span>
    </div>
    ${t.description?`<div style="font-size:13.5px;color:var(--ink-mid);line-height:1.85;font-weight:300;margin-bottom:20px;padding:16px;background:var(--parchment-2);border-radius:var(--r-sm);border:1px solid var(--line-soft)">${esc(t.description)}</div>`:""}
    ${canEdit?`<div class="field full">
      <label>تحديث الحالة <span class="la">Update Status</span></label>
      <select id="tdStatus">${Object.entries(TASK_STATUS).map(([k,v])=>`<option value="${k}" ${t.status===k?"selected":""}>${v.label}</option>`).join("")}</select>
    </div>`:`<div class="status-badge" style="color:${TASK_STATUS[t.status].color};border-color:${TASK_STATUS[t.status].color}55;background:${TASK_STATUS[t.status].bg}">${TASK_STATUS[t.status].label}</div>`}
    <div class="modal-foot">
      ${canEdit?`<button class="btn btn-primary" id="tdSave"><i class="fa-solid fa-check"></i> حفظ</button>`:""}
      ${State.user.perms.canManage?`<button class="btn btn-danger" id="tdDel"><i class="fa-solid fa-trash"></i> حذف</button>`:""}
      <div class="spacer"></div>
      <button class="btn btn-ghost" data-close>إغلاق</button>
    </div>
  `);
  $("#tdSave")?.addEventListener("click",async()=>{
    const status=$("#tdStatus").value;
    try{
      await S.setTaskStatus(t.id,status);
      t.status=status;
      if(status==="completed"){
        await S.pushNotification({ userId:t.createdBy, type:"task_completed", title:"اكتملت مهمة", body:t.title, link:"tasks", refId:t.id });
        await S.logActivity({ type:"task_update", actorId:State.user.uid, actorName:State.user.name, resource:t.title, detail:"اكتملت المهمة" });
      } else {
        // إشعار "تحديث مهمة" لمنشئها (إن لم يكن هو من حدّثها)
        if(t.createdBy && t.createdBy!==State.user.uid){
          await S.pushNotification({ userId:t.createdBy, type:"task_updated", title:"تحديث حالة مهمة", body:`${t.title} — ${TASK_STATUS[status].label}`, link:"tasks", refId:t.id });
        }
        await S.logActivity({ type:"task_update", actorId:State.user.uid, actorName:State.user.name, resource:t.title, detail:`الحالة: ${TASK_STATUS[status].label}` });
      }
      closeModal(); toast("تم تحديث المهمة"); if(State.view==="tasks")renderTasksBoard(); renderTaskBadge();
    }catch(e){ toast("تعذّر التحديث","err"); }
  });
  $("#tdDel")?.addEventListener("click",async()=>{
    if(!confirm("حذف هذه المهمة؟")) return;
    await S.deleteTask(t.id);
    State.tasks=State.tasks.filter(x=>x.id!==t.id);
    closeModal(); toast("تم حذف المهمة"); if(State.view==="tasks")renderTasksBoard();
  });
}
function openTaskModal(){
  const users=State.users.filter(u=>u.uid!==State.user.uid||true);
  openModal(`
    <div class="modal-head">
      <div><div class="la">New Task · مهمة جديدة</div><h2>إنشاء مهمة</h2></div>
      <button class="close-btn" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="form-grid two">
      <div class="field full">
        <label>عنوان المهمة <span class="la">Title</span></label>
        <input id="ntTitle" placeholder="مثال: إعداد تقرير الربع الأول">
      </div>
      <div class="field full">
        <label>الوصف <span class="la">Description</span></label>
        <textarea id="ntDesc" placeholder="تفاصيل المهمة والمطلوب…"></textarea>
      </div>
      <div class="field">
        <label>الأولوية <span class="la">Priority</span></label>
        <select id="ntPrio">${Object.entries(TASK_PRIORITY).map(([k,v])=>`<option value="${k}" ${k==="medium"?"selected":""}>${v.label}</option>`).join("")}</select>
      </div>
      <div class="field">
        <label>تاريخ الاستحقاق <span class="la">Due Date</span></label>
        <input type="date" id="ntDue">
      </div>
      <div class="field">
        <label>نوع الإسناد <span class="la">Assign To</span></label>
        <select id="ntType"><option value="department">إدارة كاملة</option><option value="user">موظف محدد</option></select>
      </div>
      <div class="field">
        <label>الجهة <span class="la">Target</span></label>
        <select id="ntTarget"></select>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-primary" id="ntSave"><i class="fa-solid fa-plus"></i> إنشاء المهمة</button>
      <div class="spacer"></div>
      <button class="btn btn-ghost" data-close>إلغاء</button>
    </div>
  `);
  const fillTargets=()=>{
    const type=$("#ntType").value;
    if(type==="department"){
      $("#ntTarget").innerHTML=Object.entries(DEPARTMENTS).map(([k,d])=>`<option value="${k}">${d.label}</option>`).join("");
    } else {
      $("#ntTarget").innerHTML=users.map(u=>`<option value="${u.uid}">${esc(u.name)} — ${esc((ROLES[u.role]||{}).label||"")}</option>`).join("");
    }
  };
  fillTargets();
  $("#ntType").addEventListener("change",fillTargets);
  $("#ntSave").addEventListener("click",async()=>{
    const title=$("#ntTitle").value.trim();
    if(!title){ toast("أدخل عنوان المهمة","err"); return; }
    const type=$("#ntType").value;
    const target=$("#ntTarget").value;
    const label= type==="department" ? DEPARTMENTS[target].label : (users.find(u=>u.uid===target)?.name||"موظف");
    const btn=$("#ntSave"); btn.disabled=true; btn.innerHTML=`<i class="fa-solid fa-spinner spin"></i> إنشاء…`;
    try{
      const newTaskId=await S.createTask({
        title, description:$("#ntDesc").value.trim(),
        priority:$("#ntPrio").value, dueDate:$("#ntDue").value||null,
        assignType:type, assignTo:target, assignLabel:label,
        createdBy:State.user.uid, creatorName:State.user.name
      });
      // إشعار
      if(type==="department") await S.notifyDepartment(target,{ type:"task_assigned", title:"مهمة جديدة لإدارتك", body:title, link:"tasks", refId:newTaskId });
      else await S.pushNotification({ userId:target, type:"task_assigned", title:"أُسندت إليك مهمة", body:title, link:"tasks", refId:newTaskId });
      await S.logActivity({ type:"task_create", actorId:State.user.uid, actorName:State.user.name, resource:title, detail:`أُسندت إلى ${label}` });

      closeModal(); toast("تم إنشاء المهمة");
      State.tasks=await S.listTasks(State.user).catch(()=>State.tasks);
      if(State.view==="tasks")renderTasksBoard(); renderTaskBadge();
    }catch(e){ console.error(e); toast("تعذّر إنشاء المهمة","err"); btn.disabled=false; btn.innerHTML=`<i class="fa-solid fa-plus"></i> إنشاء المهمة`; }
  });
}

/* ════════════════ مركز الإشعارات ════════════════ */
function renderNotifs(el){
  if(!el) el=$("#viewHost");
  const unread=State.notifs.filter(n=>!n.read);
  // عدّادات لكل فئة
  const counts={ all:State.notifs.length, unread:unread.length };
  Object.keys(NOTIF_PREFS).forEach(p=>counts[p]=0);
  State.notifs.forEach(n=>{ const p=NOTIF_TYPE[n.type]?.pref; if(p&&counts[p]!=null)counts[p]++; });

  el.innerHTML=`
    ${pageHead("Notifications","مركز الإشعارات","مركز","الإشعارات", "سجلّ كامل للتنبيهات مع بحث وتصفية حسب الفئة والحالة.")}
    <div class="toolbar">
      <div class="search-box"><i class="fa-solid fa-magnifying-glass"></i><input id="notifSearch" placeholder="ابحث في الإشعارات…" value="${esc(State.notifQuery)}"></div>
      <div class="spacer"></div>
      ${unread.length?`<button class="btn btn-ghost" id="markAllBtn"><i class="fa-solid fa-check-double"></i> تعليم الكل كمقروء (${unread.length})</button>`:""}
    </div>
    <div class="filters" id="notifFilters" style="margin-bottom:18px">
      <button class="chip ${State.notifFilter==="all"?"active":""}" data-nf="all">الكل<span class="chip-count">${counts.all}</span></button>
      <button class="chip ${State.notifFilter==="unread"?"active":""}" data-nf="unread">غير مقروءة<span class="chip-count">${counts.unread}</span></button>
      ${Object.entries(NOTIF_PREFS).map(([k,v])=>`<button class="chip ${State.notifFilter===k?"active":""}" data-nf="${k}">${v.label}<span class="chip-count">${counts[k]||0}</span></button>`).join("")}
    </div>
    <div id="notifCenterArea"></div>
  `;
  renderNotifCenterList();
  $("#markAllBtn")?.addEventListener("click",async()=>{
    await S.markAllNotifsRead(unread.map(n=>n.id));
    toast("تم تعليم الكل كمقروء");
  });
  $("#notifSearch")?.addEventListener("input",e=>{ State.notifQuery=e.target.value; renderNotifCenterList(); });
  $$("#notifFilters [data-nf]").forEach(b=>b.addEventListener("click",()=>{
    State.notifFilter=b.dataset.nf;
    $$("#notifFilters .chip").forEach(c=>c.classList.toggle("active",c===b));
    renderNotifCenterList();
  }));
}
function filteredNotifs(){
  const q=State.notifQuery.trim().toLowerCase();
  return State.notifs.filter(n=>{
    if(State.notifFilter==="unread" && n.read) return false;
    if(State.notifFilter!=="all" && State.notifFilter!=="unread"){
      if((NOTIF_TYPE[n.type]?.pref) !== State.notifFilter) return false;
    }
    if(q && !((n.title||"").toLowerCase().includes(q)||(n.body||"").toLowerCase().includes(q))) return false;
    return true;
  });
}
function renderNotifCenterList(){
  const area=$("#notifCenterArea"); if(!area) return;
  const list=filteredNotifs();
  area.innerHTML = list.length
    ? `<div class="notif-list">${list.map(notifItem).join("")}</div>`
    : emptyState("لا إشعارات مطابقة","جرّب فلتراً أو بحثاً مختلفاً");
  $$("[data-notif]",area).forEach(it=>it.addEventListener("click",()=>onNotifClick(it.dataset.notif)));
}
function notifItem(n){
  const m=NOTIF_TYPE[n.type]||{icon:"fa-bell",color:"#9c6e38",label:"إشعار"};
  return `<div class="notif-item ${n.read?"":"unread"}" data-notif="${n.id}">
    <div class="notif-ico" style="background:${m.color}"><i class="fa-solid ${m.icon}"></i></div>
    <div class="notif-body">
      <div class="notif-title">${esc(n.title)}</div>
      ${n.body?`<div class="notif-text">${esc(n.body)}</div>`:""}
      <div class="notif-time">${timeAgo(n.createdAt)}</div>
    </div>
  </div>`;
}
/* هل تسمح تفضيلات المستخدم بإشعار هذه الفئة؟ */
function prefAllows(n){
  const pref = (NOTIF_TYPE[n.type]?.pref) || "system";
  return State.notifPrefs[pref] !== false;
}

/* تنقّل عميق من هاش الرابط: #tasks:ID أو #files:ID */
function handleDeepLinkHash(){
  const h = (location.hash || "").replace(/^#/, "");
  if(!h) return;
  const [view, refId] = h.split(":");
  if(VIEW_META[view]){
    navigate(view);
    if(refId){
      // افتح العنصر المعني بعد ريندر العرض
      setTimeout(()=>{
        if(view==="tasks") openTaskDetail(refId);
        else if(view==="files"){ const f=State.files.find(x=>x.id===refId); if(f) openFilePreview(f); }
      }, 350);
    }
    history.replaceState(null, "", location.pathname + location.search);
  }
}

function onNotifClick(id){
  const n=State.notifs.find(x=>x.id===id); if(!n) return;
  if(!n.read) S.markNotifRead(id).catch(()=>{});
  closeNotifPanel();
  if(n.link){
    navigate(n.link);
    if(n.refId){
      setTimeout(()=>{
        if(n.link==="tasks") openTaskDetail(n.refId);
        else if(n.link==="files"){ const f=State.files.find(x=>x.id===n.refId); if(f) openFilePreview(f); }
      }, 350);
    }
  }
}

/* لوحة الإشعارات المنسدلة */
function renderNotifBadge(){
  const c=State.notifs.filter(n=>!n.read).length;
  $("#tbDot").classList.toggle("show",c>0);
  renderNotifPanel();
  renderNavBadges();
}
function renderNavBadges(){
  const c=State.notifs.filter(n=>!n.read).length;
  const nb=$("#navNotifBadge");
  if(nb){ nb.style.display=c?"inline-block":"none"; nb.textContent=c; }
  renderTaskBadge();
}
function renderTaskBadge(){
  const c=State.tasks.filter(t=>t.status!=="completed" &&
    ((t.assignType==="user"&&t.assignTo===State.user.uid)||
     (t.assignType==="department"&&State.user.perms.departments.includes(t.assignTo)))).length;
  const tb=$("#navTaskBadge");
  if(tb){ tb.style.display=c?"inline-block":"none"; tb.textContent=c; }
}
function renderNotifPanel(){
  const panel=$("#notifPanel"); if(!panel) return;
  const top=State.notifs.slice(0,8);
  const unread=State.notifs.filter(n=>!n.read);
  panel.innerHTML=`
    <div class="np-head"><h4>الإشعارات</h4>${unread.length?`<button id="npMarkAll">تعليم الكل كمقروء</button>`:""}</div>
    <div class="np-list">
      ${top.length?top.map(n=>{const m=NOTIF_TYPE[n.type]||{icon:"fa-bell",color:"#9c6e38"};return `<div class="np-item ${n.read?"":"unread"}" data-notif="${n.id}"><div class="np-ico" style="background:${m.color}"><i class="fa-solid ${m.icon}"></i></div><div class="np-body"><div class="np-t">${esc(n.title)}</div>${n.body?`<div class="np-x">${esc(n.body)}</div>`:""}<div class="np-time">${timeAgo(n.createdAt)}</div></div></div>`;}).join(""):`<div style="padding:30px;text-align:center;color:var(--ink-muted);font-size:12.5px">لا إشعارات</div>`}
    </div>`;
  $("#npMarkAll")?.addEventListener("click",async()=>{ await S.markAllNotifsRead(unread.map(n=>n.id)); });
  $$("[data-notif]",panel).forEach(it=>it.addEventListener("click",()=>onNotifClick(it.dataset.notif)));
}
function toggleNotifPanel(){ $("#notifPanel").classList.toggle("open"); }
function closeNotifPanel(){ $("#notifPanel").classList.remove("open"); }
$("#bellBtn").addEventListener("click",e=>{ e.stopPropagation(); toggleNotifPanel(); });
document.addEventListener("click",e=>{ if(!e.target.closest("#notifPanel")&&!e.target.closest("#bellBtn")) closeNotifPanel(); });

/* ════════════════ سجل النشاط ════════════════ */
async function renderActivity(el){
  el.innerHTML=`
    ${pageHead("Activity Log","سجل النشاط","سجل","العمليات", "تتبّع كامل للرفع والتنزيل والتعديلات والاعتمادات وتحديثات المهام.")}
    <div class="table-wrap" id="actTable"><div style="padding:40px;text-align:center"><i class="fa-solid fa-spinner spin" style="color:var(--gold)"></i></div></div>
  `;
  const acts=await S.listActivity(80).catch(()=>State.activity);
  State.activity=acts;
  $("#actTable").innerHTML = acts.length ? `<table class="data">
    <thead><tr><th>الموظف</th><th>العملية</th><th>المورد</th><th>التفاصيل</th><th>الوقت</th></tr></thead>
    <tbody>${acts.map(a=>{const m=ACTIVITY_TYPE[a.type]||ACTIVITY_TYPE.edit;return `<tr>
      <td><div class="tbl-user"><div class="tbl-av">${esc(initials(a.actorName))}</div>${esc(a.actorName||"موظف")}</div></td>
      <td><span style="color:${m.color};font-weight:700"><i class="fa-solid ${m.icon}" style="margin-left:6px"></i>${m.label}</span></td>
      <td>${esc(a.resource||"—")}</td>
      <td style="font-weight:300">${esc(a.detail||"—")}</td>
      <td style="font-family:'Montserrat';font-size:11px;color:var(--ink-muted)">${timeAgo(a.createdAt)}</td>
    </tr>`;}).join("")}</tbody></table>` : emptyState("لا يوجد نشاط مسجّل بعد");
}

/* ════════════════ الموظفون (تنفيذي) ════════════════ */
async function renderMembers(el){
  if(!State.user.perms.canManage){ navigate("dash"); return; }
  const users=await S.listUsers().catch(()=>State.users);
  State.users=users;
  el.innerHTML=`
    ${pageHead("Team","الموظفون","فريق","العمل", "أعضاء البوابة وأدوارهم وإداراتهم.")}
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>الموظف</th><th>البريد</th><th>الدور</th><th>الإدارة</th></tr></thead>
        <tbody>${users.map(u=>{const r=ROLES[u.role]||ROLES.media;return `<tr>
          <td><div class="tbl-user"><div class="tbl-av">${esc(initials(u.name))}</div>${esc(u.name)}</div></td>
          <td style="font-family:'Montserrat';font-size:12px">${esc(u.email||"—")}</td>
          <td><span class="status-badge" style="color:${r.accent};border-color:${r.accent}55">${r.label}</span></td>
          <td style="font-weight:300">${esc(r.la)}</td>
        </tr>`;}).join("")}</tbody>
      </table>
    </div>
    <div class="card" style="margin-top:20px">
      <div class="card-head"><div><h3>إضافة موظف جديد</h3><div class="la">Add Employee</div></div></div>
      <p style="font-size:13px;color:var(--ink-mid);font-weight:300;line-height:1.85;margin-bottom:16px">
        لإضافة موظف: أنشئ حسابه في <strong>Firebase Console → Authentication</strong>، ثم أضِف مستنداً في مجموعة <code style="background:var(--parchment-2);padding:2px 6px;border-radius:4px">${COL.users}</code> بمُعرّف الحساب (UID) يحتوي الحقول:
      </p>
      <div style="background:var(--parchment-2);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:16px 18px;font-family:'Montserrat';font-size:12px;color:var(--ink-mid);line-height:1.9;direction:ltr;text-align:left">
        { name: "الاسم", email: "user@erth.sa", role: "finance | projects | media | executive" }
      </div>
    </div>
  `;
}

/* حالة الإشعارات الحيّة في الإعدادات */
async function paintNotifStatus(){
  const box=$("#notifStatus"); if(!box) return;
  const perm = ("Notification" in window) ? Notification.permission : "unsupported";
  const fcmOk = await S.fcmSupported();
  let txt, color, ic;
  if(perm==="granted"){
    if(State.notifMode==="fcm" || fcmOk){ txt="مفعّلة · إشعارات دفع (FCM)"; color="var(--success)"; ic="fa-circle-check"; }
    else { txt="مفعّلة · إشعارات المتصفح"; color="var(--success)"; ic="fa-circle-check"; }
  } else if(perm==="denied"){
    txt="محظورة من إعدادات المتصفح"; color="var(--danger)"; ic="fa-circle-xmark";
  } else if(perm==="unsupported"){
    txt="غير مدعومة في هذا المتصفح"; color="var(--ink-muted)"; ic="fa-circle-minus";
  } else {
    txt="غير مفعّلة بعد"; color="var(--ink-muted)"; ic="fa-circle-info";
  }
  box.innerHTML=`<span class="status-badge" style="color:${color};border-color:${color}55"><i class="fa-solid ${ic}" style="margin-left:5px"></i>${txt}</span>`;
}

/* ════════════════ الإعدادات ════════════════ */
function renderSettings(el){
  const u=State.user;
  el.innerHTML=`
    ${pageHead("Settings","الإعدادات","إعدادات","الحساب", "إدارة حسابك وكلمة المرور والإشعارات.")}
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><div><h3>الحساب الشخصي</h3><div class="la">Account</div></div></div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line-soft)"><div><div style="font-weight:700;font-size:13.5px">الاسم</div><div style="font-size:12px;color:var(--ink-muted)">${esc(u.name)}</div></div></div>
          <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line-soft)"><div><div style="font-weight:700;font-size:13.5px">البريد</div><div style="font-size:12px;color:var(--ink-muted)">${esc(u.email||"—")}</div></div></div>
          <div style="display:flex;justify-content:space-between;padding:12px 0"><div><div style="font-weight:700;font-size:13.5px">الدور</div><div style="font-size:12px;color:var(--ink-muted)">${esc(u.perms.label)} — ${esc(u.perms.la)}</div></div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>كلمة المرور</h3><div class="la">Change Password</div></div></div>
        <div class="form-grid">
          <div class="field"><label>كلمة المرور الجديدة</label><input type="password" id="pw1" placeholder="6 أحرف على الأقل"></div>
          <div class="field"><label>تأكيد كلمة المرور</label><input type="password" id="pw2" placeholder="أعِد الكتابة"></div>
        </div>
        <div style="margin-top:16px"><button class="btn btn-primary" id="chgPw"><i class="fa-solid fa-key"></i> تحديث</button></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>إشعارات المتصفح</h3><div class="la">Browser Notifications</div></div></div>
        <p style="font-size:13px;color:var(--ink-mid);font-weight:300;line-height:1.8;margin-bottom:14px">فعّل إشعارات المتصفح لتصلك التنبيهات حتى عند إغلاق البوابة.</p>
        <div id="notifStatus" style="margin-bottom:14px"></div>
        <button class="btn btn-gold" id="enableNotif"><i class="fa-solid fa-bell"></i> تفعيل الإشعارات</button>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>تفضيلات الإشعارات</h3><div class="la">Notification Preferences</div></div></div>
        <p style="font-size:13px;color:var(--ink-mid);font-weight:300;line-height:1.7;margin-bottom:14px">اختر فئات الإشعارات التي تريد استقبالها.</p>
        <div id="prefList" style="display:flex;flex-direction:column;gap:4px">
          ${Object.entries(NOTIF_PREFS).map(([k,v])=>`
            <label style="display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid var(--line-soft);cursor:pointer">
              <span style="width:30px;height:30px;border-radius:8px;background:var(--parchment-2);display:grid;place-items:center;color:var(--gold-deep);font-size:13px"><i class="fa-solid ${v.icon}"></i></span>
              <span style="flex:1"><span style="font-weight:700;font-size:13.5px;display:block">${v.label}</span><span style="font-family:'Montserrat';font-size:10px;color:var(--ink-muted)">${v.la}</span></span>
              <input type="checkbox" class="pref-toggle" data-pref="${k}" ${State.notifPrefs[k]!==false?"checked":""} style="width:18px;height:18px;accent-color:var(--gold-deep);cursor:pointer">
            </label>`).join("")}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>الأجهزة المسجّلة</h3><div class="la">Registered Devices</div></div></div>
        <p style="font-size:13px;color:var(--ink-mid);font-weight:300;line-height:1.7;margin-bottom:14px">الأجهزة والمتصفحات التي تستقبل إشعارات الدفع لحسابك.</p>
        <div id="deviceList"><div style="padding:14px;text-align:center;color:var(--ink-muted)"><i class="fa-solid fa-spinner spin"></i></div></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>تسجيل الخروج</h3><div class="la">Sign Out</div></div></div>
        <p style="font-size:13px;color:var(--ink-mid);font-weight:300;line-height:1.8;margin-bottom:16px">إنهاء الجلسة على هذا الجهاز.</p>
        <button class="btn btn-danger" id="settLogout"><i class="fa-solid fa-arrow-right-from-bracket"></i> تسجيل الخروج</button>
      </div>
    </div>
  `;
  $("#chgPw").addEventListener("click",async()=>{
    const p1=$("#pw1").value,p2=$("#pw2").value;
    if(!p1||!p2){toast("أدخل كلمة المرور وتأكيدها","err");return;}
    if(p1!==p2){toast("كلمتا المرور غير متطابقتين","err");return;}
    if(p1.length<6){toast("6 أحرف على الأقل","err");return;}
    try{ await S.updatePassword(S.auth.currentUser,p1); toast("تم تحديث كلمة المرور"); $("#pw1").value="";$("#pw2").value=""; }
    catch(e){ toast(e.code==="auth/requires-recent-login"?"سجّل الدخول مجدداً ثم حاول":"تعذّر التحديث","err"); }
  });
  paintNotifStatus();
  $("#enableNotif").addEventListener("click",async()=>{
    const btn=$("#enableNotif"); btn.disabled=true;
    btn.innerHTML=`<i class="fa-solid fa-spinner spin"></i> جارٍ التفعيل…`;
    const res=await S.initMessaging(State.user.uid);
    btn.disabled=false; btn.innerHTML=`<i class="fa-solid fa-bell"></i> تفعيل الإشعارات`;
    if(res.ok){
      State.notifMode=res.mode;
      toast(res.mode==="fcm" ? "تم تفعيل إشعارات الدفع بنجاح" : "تم تفعيل إشعارات المتصفح","ok");
      // إشعار تجريبي ليتأكد المستخدم من عملها
      S.showLocalNotification("تم تفعيل الإشعارات ✓","ستصلك تنبيهات المهام والملفات هنا.");
    } else {
      const m={
        denied:"الإشعارات محظورة من إعدادات المتصفح — فعّلها يدوياً من شريط العنوان 🔒",
        unsupported:"متصفحك لا يدعم الإشعارات",
        "no-sw":"متصفحك لا يدعم Service Worker",
        error:"تعذّر التفعيل — حاول مجدداً"
      };
      toast(m[res.reason]||"تعذّر تفعيل الإشعارات","err");
    }
    paintNotifStatus();
  });

  // تفضيلات الإشعارات — حفظ فوري عند التبديل
  $$(".pref-toggle").forEach(cb=>cb.addEventListener("change",async()=>{
    State.notifPrefs[cb.dataset.pref]=cb.checked;
    try{ await S.setNotifPrefs(State.user.uid, State.notifPrefs); toast("تم حفظ التفضيلات"); }
    catch(e){ toast("تعذّر حفظ التفضيلات","err"); }
  }));

  // قائمة الأجهزة المسجّلة
  loadDeviceList();

  $("#settLogout").addEventListener("click",doLogout);
}

/* تحميل وعرض أجهزة المستخدم المسجّلة للإشعارات */
async function loadDeviceList(){
  const box=$("#deviceList"); if(!box) return;
  const tokens=await S.listUserTokens(State.user.uid);
  if(!tokens.length){ box.innerHTML=`<div style="padding:10px;color:var(--ink-muted);font-size:12.5px">لا أجهزة مسجّلة بعد — فعّل الإشعارات أعلاه.</div>`; return; }
  box.innerHTML=tokens.map(t=>{
    const isThis = t.token===State.deviceToken;
    return `<div style="display:flex;align-items:center;gap:11px;padding:11px 4px;border-bottom:1px solid var(--line-soft)">
      <span style="width:30px;height:30px;border-radius:8px;background:var(--parchment-2);display:grid;place-items:center;color:var(--gold-deep);font-size:13px"><i class="fa-solid fa-mobile-screen"></i></span>
      <span style="flex:1"><span style="font-weight:700;font-size:13px;display:block">${esc(t.device||"جهاز")}${isThis?` <span style="color:var(--success);font-size:10px">(هذا الجهاز)</span>`:""}</span>
        <span style="font-family:'Montserrat';font-size:9.5px;color:var(--ink-muted)">آخر ظهور: ${timeAgo(t.lastSeen||t.createdAt)}</span></span>
      <button class="fc-act danger" data-rmtoken="${esc(t.id)}" title="إلغاء التسجيل"><i class="fa-solid fa-xmark"></i></button>
    </div>`;
  }).join("");
  $$("[data-rmtoken]",box).forEach(b=>b.addEventListener("click",async()=>{
    await S.deleteFcmTokenDoc(b.dataset.rmtoken);
    toast("تم إلغاء تسجيل الجهاز"); loadDeviceList();
  }));
}

/* ════════ تحديث بعد التعديلات ════════ */
async function refreshAfterMutation(){
  State.files=await S.listFiles(State.user.perms.departments).catch(()=>State.files);
  if(State.view==="files"){ renderCatFilters(); renderFilesArea(); }
  if(State.view==="dash") renderDash($("#viewHost"));
}

/* ════════ الشريط الجانبي للجوال ════════ */
const sidebar=$("#sidebar"), scrim=$("#scrim");
$("#menuToggle").addEventListener("click",()=>{ sidebar.classList.add("open"); scrim.classList.add("show"); });
function closeSidebar(){ sidebar.classList.remove("open"); scrim.classList.remove("show"); }
scrim.addEventListener("click",closeSidebar);
