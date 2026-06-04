/* ══════════════════════════════════════════════════════════
   طبقة الخدمات — Firebase Services
   Auth · Firestore · Storage · Messaging · Activity
══════════════════════════════════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  getMessaging, getToken, onMessage, isSupported as fcmIsSupported
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

import { FIREBASE_CONFIG, VAPID_KEY, PUSH_ENDPOINT, COL, ROLES, NOTIF_TYPE } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const stg  = getStorage(app);

/* messaging يُهيّأ كسولاً (lazy) بعد التأكد من دعم المتصفح عبر isSupported().
   استدعاء getMessaging() مباشرةً يرمي messaging/unsupported-browser في
   المتصفحات غير المدعومة (Safari قديم، وضع التصفح الخاص، بلا HTTPS…). */
let _messaging = null;
let _fcmSupported = null; // null = لم يُفحص بعد

/* مُصدّرات Firestore الخام للاستخدام عند الحاجة */
export {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp,
  onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword
};

/* ═══════════════ المصادقة ═══════════════ */
export async function login(email, password){
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}
export function logout(){ return signOut(auth); }

/* جلب ملف المستخدم وصلاحياته من Firestore */
export async function fetchUserProfile(uid){
  const snap = await getDoc(doc(db, COL.users, uid));
  if(!snap.exists()) return null;
  const data = snap.data();
  const role = ROLES[data.role] ? data.role : "media";
  return { uid, ...data, role, perms: ROLES[role] };
}

/* قائمة جميع الموظفين (للإسناد والإدارة) */
export async function listUsers(){
  const snap = await getDocs(query(collection(db, COL.users), orderBy("name")));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/* ═══════════════ الملفات ═══════════════ */
export async function uploadFile(file, meta, onProgress){
  // مسار التخزين بأحرف ASCII آمنة (الاسم الأصلي يُحفظ في حقل name)
  const ext = (file.name.match(/\.[^.]+$/)||[""])[0];
  const path = `portal/${meta.department}/${meta.category}/${Date.now()}_${Math.random().toString(36).slice(2,8)}${ext}`;
  const task = uploadBytesResumable(sRef(stg, path), file, {
    contentType: file.type || "application/octet-stream"
  });
  await new Promise((res, rej)=>{
    task.on("state_changed",
      s => onProgress && onProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      err => {
        // رسائل تشخيصية لأخطاء التخزين الشائعة
        const map = {
          "storage/unauthorized":"غير مصرّح — تحقّق من قواعد Storage (storage.rules)",
          "storage/unauthenticated":"الجلسة منتهية — سجّل الدخول مجدداً",
          "storage/retry-limit-exceeded":"تعذّر الرفع — تحقّق من الاتصال/CORS",
          "storage/quota-exceeded":"تجاوزت سعة التخزين المتاحة"
        };
        console.error("[Storage] upload error:", err?.code, err?.message);
        err.friendly = map[err?.code] || null;
        rej(err);
      },
      res);
  });
  const url = await getDownloadURL(task.snapshot.ref);
  const docRef = await addDoc(collection(db, COL.files), {
    name:        file.name,
    storagePath: path,
    url,
    size:        file.size,
    mime:        file.type || "",
    department:  meta.department,
    category:    meta.category,
    status:      "draft",
    note:        meta.note || "",
    comments:    [],
    uploadedBy:  meta.uploadedBy,
    uploaderName:meta.uploaderName,
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp()
  });
  return docRef.id;
}

export async function setFileStatus(fileId, status, comment, actor){
  const fdoc = doc(db, COL.files, fileId);
  const snap = await getDoc(fdoc);
  const comments = (snap.data()?.comments) || [];
  if(comment){
    comments.push({
      text: comment, by: actor.name, status,
      at: Timestamp.now()
    });
  }
  await updateDoc(fdoc, { status, comments, updatedAt: serverTimestamp() });
}

export async function deleteFile(fileId, storagePath){
  if(storagePath){ try{ await deleteObject(sRef(stg, storagePath)); }catch(e){} }
  await deleteDoc(doc(db, COL.files, fileId));
}

/* ترتيب تنازلي حسب createdAt في جهة العميل (احتياط عند غياب فهرس مركّب) */
function sortByCreatedDesc(arr){
  return arr.sort((a,b)=>{
    const ta=a.createdAt?.seconds||0, tb=b.createdAt?.seconds||0;
    return tb-ta;
  });
}

/* جلب ملفات الإدارات المسموح بها للدور.
   يحاول الاستعلام المركّب (where in + orderBy) أولاً؛ فإن لزم فهرس
   غير منشور (failed-precondition) يسقط تلقائياً إلى ترتيب العميل. */
export async function listFiles(departments){
  const base = query(
    collection(db, COL.files),
    where("department", "in", departments.slice(0, 10))
  );
  try{
    const snap = await getDocs(query(base, orderBy("createdAt", "desc")));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(e){
    if(e?.code === "failed-precondition"){
      console.warn("[Firestore] فهرس مركّب مفقود لـ portal_files — ترتيب في العميل. أنشئ الفهرس من رابط وحدة التحكم للأداء الأمثل.");
      const snap = await getDocs(base);
      return sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    throw e;
  }
}

/* ═══════════════ المهام ═══════════════ */
export async function createTask(t){
  const docRef = await addDoc(collection(db, COL.tasks), {
    title:       t.title,
    description: t.description || "",
    priority:    t.priority || "medium",
    status:      "pending",
    dueDate:     t.dueDate ? Timestamp.fromDate(new Date(t.dueDate)) : null,
    assignType:  t.assignType,            // "user" | "department"
    assignTo:    t.assignTo,              // uid أو رمز الإدارة
    assignLabel: t.assignLabel || "",
    attachments: t.attachments || [],
    createdBy:   t.createdBy,
    creatorName: t.creatorName,
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp()
  });
  return docRef.id;
}

export async function setTaskStatus(taskId, status){
  await updateDoc(doc(db, COL.tasks, taskId), { status, updatedAt: serverTimestamp() });
}

export async function deleteTask(taskId){
  await deleteDoc(doc(db, COL.tasks, taskId));
}

/* المهام المرئية للمستخدم: المسندة له شخصياً أو لإدارته أو المنشأة بواسطته */
export async function listTasks(user){
  const snap = await getDocs(query(collection(db, COL.tasks), orderBy("createdAt", "desc")));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if(user.perms.canManage) return all;            // الإدارة التنفيذية ترى الكل
  return all.filter(t =>
    (t.assignType === "user" && t.assignTo === user.uid) ||
    (t.assignType === "department" && user.perms.departments.includes(t.assignTo)) ||
    t.createdBy === user.uid
  );
}

/* ═══════════════ الإشعارات ═══════════════ */
export async function pushNotification(n){
  const ref = await addDoc(collection(db, COL.notifications), {
    userId: n.userId,            // uid أو رمز إدارة ("dept:finance")
    type:   n.type,
    pref:   NOTIF_TYPE[n.type]?.pref || "system",  // مجموعة التفضيل
    title:  n.title,
    body:   n.body || "",
    link:   n.link || "",        // وجهة التنقّل: "tasks" | "files" | "notifs"
    refId:  n.refId || "",       // مُعرّف المهمة/الملف للوصول المباشر
    read:   false,
    createdAt: serverTimestamp()
  });
  // طبقة الدفع الخلفي عبر Cloudflare Worker (لا تُعطّل المسار إن فشلت/غير مُعدّة)
  triggerPush(ref.id);
  return ref.id;
}

/* نداء غير حاجب للـ Worker لإرسال دفع FCM. صامت تماماً عند غياب
   الإعداد أو فشل الشبكة — الإشعار داخل التطبيق يبقى مصدر الحقيقة. */
function triggerPush(notifId){
  if(!PUSH_ENDPOINT) return;            // غير مُعدّ بعد ⇒ تجاهل بصمت
  try{
    fetch(PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifId }),
      keepalive: true                   // يُكمل الإرسال حتى لو أُغلق التبويب
    }).then(r => {
      if(!r.ok) console.warn("[Push] worker responded", r.status);
      else console.log("[Push] worker triggered for", notifId);
    }).catch(e => console.warn("[Push] worker call failed:", e?.message || e));
  }catch(e){ console.warn("[Push] trigger error:", e); }
}

/* بثّ إشعار لكل أفراد إدارة */
export async function notifyDepartment(deptCode, n){
  await pushNotification({ ...n, userId: `dept:${deptCode}` });
}

/* استماع لحظي لإشعارات المستخدم + إداراته.
   عند غياب الفهرس المركّب (userId in + createdAt desc) يسقط تلقائياً
   إلى استعلام بلا orderBy مع ترتيب في العميل، فلا تتعطّل الإشعارات. */
export function watchNotifications(user, cb){
  const targets = [user.uid, ...user.perms.departments.map(d => `dept:${d}`)].slice(0, 10);
  const base = query(collection(db, COL.notifications), where("userId", "in", targets));

  let active = null;

  const subscribePlain = () => {
    active = onSnapshot(base, snap => {
      const list = sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() }))).slice(0, 40);
      cb(list);
    }, err => console.warn("[Firestore] notif watch (plain) error:", err?.code || err));
  };

  active = onSnapshot(
    query(base, orderBy("createdAt", "desc"), limit(40)),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => {
      if(err?.code === "failed-precondition"){
        console.warn("[Firestore] فهرس مركّب مفقود لـ portal_notifications — استماع بلا ترتيب وترتيب في العميل.");
        subscribePlain();
      } else {
        console.warn("[Firestore] notif watch error:", err?.code || err);
      }
    }
  );

  return () => { if(active) active(); };
}

export async function markNotifRead(id){
  await updateDoc(doc(db, COL.notifications, id), { read: true });
}
export async function markAllNotifsRead(ids){
  await Promise.all(ids.map(id => markNotifRead(id)));
}

/* ═══════════════ سجل النشاط ═══════════════ */
export async function logActivity(a){
  await addDoc(collection(db, COL.activity), {
    type:     a.type,
    actorId:  a.actorId,
    actorName:a.actorName,
    resource: a.resource || "",
    detail:   a.detail || "",
    createdAt:serverTimestamp()
  });
}
export async function listActivity(max = 60){
  const snap = await getDocs(query(collection(db, COL.activity), orderBy("createdAt", "desc"), limit(max)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ═══════════════ Firebase Cloud Messaging ═══════════════
   منظومة الإشعارات تعمل على ثلاث طبقات متدرّجة:
   1) FCM Push    — للأجهزة المدعومة (إشعارات حتى عند إغلاق التبويب).
   2) Web Notification API — احتياطي محلي عند عدم دعم FCM.
   3) داخل التطبيق — يعمل دائماً عبر Firestore (watchNotifications).

   كل دالة تُرجع كائناً موصوفاً { ok, reason, ... } بدل null الغامض،
   لتمييز "غير مدعوم" عن "إذن مرفوض" عن "خطأ".
═══════════════════════════════════════════════════════ */

const LOG = (...a) => console.log("%c[FCM]", "color:#9c6e38;font-weight:700", ...a);
const WARN = (...a) => console.warn("[FCM]", ...a);

/* مسار الـ Service Worker بشكل نسبي ليعمل على أي مجلد نشر (root أو subpath).
   index.html داخل /portal/ ⇒ الملف بجواره. */
const SW_URL = new URL("firebase-sw.js", import.meta.url).href;

/* فحص دعم FCM مرة واحدة وتخزين النتيجة */
export async function fcmSupported(){
  if(_fcmSupported !== null) return _fcmSupported;
  try{
    _fcmSupported = await fcmIsSupported();
  }catch(e){
    WARN("isSupported() threw:", e);
    _fcmSupported = false;
  }
  LOG("isSupported() =", _fcmSupported);
  return _fcmSupported;
}

/* فحص دعم Web Notification API الأساسي */
export function browserNotifSupported(){
  return typeof window !== "undefined" && "Notification" in window;
}

/* الحصول على نسخة messaging كسولاً */
async function getMessagingLazy(){
  if(_messaging) return _messaging;
  if(!(await fcmSupported())) return null;
  try{
    _messaging = getMessaging(app);
    LOG("getMessaging() initialized");
  }catch(e){
    WARN("getMessaging() failed:", e?.code || e);
    _messaging = null;
    _fcmSupported = false;
  }
  return _messaging;
}

/* تهيئة الإشعارات — تُرجع كائناً موصوفاً بدل الرمي/الإرباك.
   النتائج المحتملة:
   { ok:true,  mode:"fcm",     token }     ← نجاح FCM كامل
   { ok:true,  mode:"browser" }            ← FCM غير مدعوم لكن إشعارات المتصفح فعّالة
   { ok:false, reason:"denied" }           ← المستخدم رفض الإذن
   { ok:false, reason:"unsupported" }      ← لا FCM ولا Notification API
   { ok:false, reason:"no-sw" }            ← لا دعم Service Worker
   { ok:false, reason:"error", error }     ← خطأ غير متوقع
*/
export async function initMessaging(uid){
  LOG("initMessaging() start · uid =", uid || "—");

  // 0) دعم Notification API الأساسي
  if(!browserNotifSupported()){
    WARN("Notification API غير متوفر في هذا المتصفح");
    return { ok:false, reason:"unsupported" };
  }

  // 1) طلب الإذن (مطلوب لكلا المسارين)
  let perm = Notification.permission;
  LOG("permission (before) =", perm);
  if(perm === "default"){
    try{ perm = await Notification.requestPermission(); }
    catch(e){ WARN("requestPermission threw:", e); }
    LOG("permission (after request) =", perm);
  }
  if(perm === "denied"){
    WARN("الإذن مرفوض من المستخدم/المتصفح");
    return { ok:false, reason:"denied" };
  }
  if(perm !== "granted"){
    return { ok:false, reason:"denied" };
  }

  // 2) محاولة مسار FCM الكامل
  const supported = await fcmSupported();
  const hasSW = "serviceWorker" in navigator;
  LOG("fcmSupported =", supported, "· serviceWorker =", hasSW);

  if(supported && hasSW){
    try{
      LOG("registering service worker:", SW_URL);
      const reg = await navigator.serviceWorker.register(SW_URL);
      await navigator.serviceWorker.ready;
      LOG("service worker registered · scope =", reg.scope);

      const msg = await getMessagingLazy();
      if(msg){
        LOG("requesting FCM token…");
        const token = await getToken(msg, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: reg
        });
        if(token){
          LOG("token acquired ✓", token.slice(0, 18) + "…");
          if(uid){
            await saveFcmToken(uid, token);   // تخزين متعدد الأجهزة
          }
          return { ok:true, mode:"fcm", token };
        }
        WARN("getToken returned empty — falling back to browser notifications");
      }
    }catch(e){
      WARN("FCM path failed (", e?.code || e?.message || e, ") — falling back to browser notifications");
    }
  } else {
    LOG("FCM غير مدعوم — استخدام إشعارات المتصفح القياسية");
  }

  // 3) الاحتياطي: الإذن ممنوح لكن FCM غير متاح ⇒ إشعارات متصفح محلية تعمل
  return { ok:true, mode:"browser" };
}

/* عرض إشعار متصفح محلي (يُستخدم في وضع fallback أو للإشعارات اللحظية) */
export function showLocalNotification(title, body, opts = {}){
  if(!browserNotifSupported() || Notification.permission !== "granted") return false;
  try{
    const n = new Notification(title, {
      body: body || "",
      icon: opts.icon || new URL("../assets/الشعار/الشعار.png", import.meta.url).href,
      badge: opts.badge,
      dir: "rtl", lang: "ar",
      tag: opts.tag || "erth-portal",
      ...opts
    });
    if(opts.onClick){
      n.onclick = () => { window.focus(); opts.onClick(); n.close(); };
    }
    return true;
  }catch(e){ WARN("showLocalNotification failed:", e); return false; }
}

/* استماع لرسائل FCM في المقدمة (التبويب مفتوح) */
export async function onForegroundMessage(cb){
  const msg = await getMessagingLazy();
  if(!msg){ LOG("onMessage skipped — FCM unavailable"); return; }
  onMessage(msg, (payload) => {
    LOG("foreground message received:", payload);
    cb(payload);
  });
}

/* ═══════════════ رموز FCM متعددة الأجهزة ═══════════════
   تُخزَّن في portal_fcm_tokens/{token} بدل حقل مفرد على المستخدم،
   فيدعم كل مستخدم عدة أجهزة/متصفحات. مُعرّف المستند = التوكن نفسه
   (فريد عالمياً) لمنع التكرار وتسهيل الحذف عند البطلان. */

/* بصمة جهاز بسيطة لتمييز الأجهزة في لوحة المستخدم */
function deviceLabel(){
  const ua = navigator.userAgent;
  let os = "جهاز", br = "متصفح";
  if(/Windows/i.test(ua)) os="Windows"; else if(/Android/i.test(ua)) os="Android";
  else if(/iPhone|iPad|iPod/i.test(ua)) os="iOS"; else if(/Mac/i.test(ua)) os="macOS";
  else if(/Linux/i.test(ua)) os="Linux";
  if(/Edg/i.test(ua)) br="Edge"; else if(/Chrome/i.test(ua)) br="Chrome";
  else if(/Firefox/i.test(ua)) br="Firefox"; else if(/Safari/i.test(ua)) br="Safari";
  const pwa = window.matchMedia?.("(display-mode: standalone)").matches ? " · PWA" : "";
  return `${br} على ${os}${pwa}`;
}

export async function saveFcmToken(uid, token){
  try{
    await setDoc(doc(db, COL.tokens, token), {
      uid, token,
      device: deviceLabel(),
      ua: navigator.userAgent.slice(0, 200),
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp()
    }, { merge: true });
    LOG("token stored (multi-device) ✓");
    // تنظيف الحقل القديم المفرد إن وُجد (هجرة سلسة دون كسر)
    updateDoc(doc(db, COL.users, uid), { fcmToken: token, fcmUpdatedAt: serverTimestamp() }).catch(()=>{});
  }catch(e){ WARN("saveFcmToken failed:", e?.code || e); }
}

/* حذف رمز عند البطلان أو تسجيل الخروج من الجهاز */
export async function deleteFcmTokenDoc(token){
  if(!token) return;
  try{ await deleteDoc(doc(db, COL.tokens, token)); LOG("token doc deleted"); }
  catch(e){ WARN("deleteFcmTokenDoc failed:", e?.code || e); }
}

/* الرمز الحالي للجهاز (إن أمكن) لإلغاء تسجيله عند الخروج */
export async function currentDeviceToken(){
  const msg = await getMessagingLazy();
  if(!msg) return null;
  try{
    if(Notification.permission!=="granted") return null;
    const reg = await navigator.serviceWorker.getRegistration(SW_URL).catch(()=>null);
    return await getToken(msg, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg || undefined });
  }catch(e){ return null; }
}

/* قائمة أجهزة المستخدم المسجّلة */
export async function listUserTokens(uid){
  try{
    const snap = await getDocs(query(collection(db, COL.tokens), where("uid","==",uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(e){ WARN("listUserTokens failed:", e?.code || e); return []; }
}

/* تحديث lastSeen للرمز الحالي (يُستدعى عند كل دخول) */
export async function touchToken(token){
  if(!token) return;
  updateDoc(doc(db, COL.tokens, token), { lastSeen: serverTimestamp() }).catch(()=>{});
}

/* ═══════════════ تفضيلات الإشعارات ═══════════════
   تُحفظ على مستند المستخدم في الحقل notifPrefs (لا يكسر البنية القائمة). */
export async function getNotifPrefs(uid){
  try{
    const snap = await getDoc(doc(db, COL.users, uid));
    return snap.data()?.notifPrefs || null;
  }catch(e){ return null; }
}
export async function setNotifPrefs(uid, prefs){
  await updateDoc(doc(db, COL.users, uid), { notifPrefs: prefs });
  LOG("notif prefs saved:", prefs);
}

/* ═══════════════ جسر رسائل الـ Service Worker ═══════════════
   يستقبل أحداث النقر على الإشعار القادمة من firebase-sw.js
   ليتمكّن التطبيق من التنقّل للوجهة الصحيحة. */
export function onSwMessage(cb){
  if(!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (e)=>{
    if(e.data && e.data.source === "erth-portal-sw"){
      LOG("SW message:", e.data);
      cb(e.data);
    }
  });
}
