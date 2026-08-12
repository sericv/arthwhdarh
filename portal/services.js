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
  serverTimestamp, Timestamp, or
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getMessaging, getToken, onMessage, isSupported as fcmIsSupported
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

import { FIREBASE_CONFIG, CLOUDINARY_CONFIG, VAPID_KEY, PUSH_ENDPOINT, COL, ROLES, NOTIF_TYPE, EMAILJS_CONFIG } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
console.log("%c[Portal] Firebase initialized", "color:#3a5e2e;font-weight:bold;font-size:12px");

export const auth = getAuth(app);
export const db   = getFirestore(app);
console.log("%c[Portal] Authentication ready", "color:#3a5e2e;font-weight:bold;font-size:12px");

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
  console.log(`%c[Portal] Fetching portal_users document for UID: ${uid}`, "color:#2d4a63");
  const snap = await getDoc(doc(db, COL.users, uid));
  if(!snap.exists()){
    console.warn(`[Portal] User document NOT found in ${COL.users} for UID: ${uid}`);
    return null;
  }
  const data = snap.data();
  console.log(`%c[Portal] User document loaded for UID: ${uid}`, "color:#3a5e2e");
  const role = ROLES[data.role] ? data.role : "employee";
  console.log(`%c[Portal] Role detected: ${role} (isTechAdmin: ${!!(data.isTechAdmin || data.role === 'tech_admin')})`, "color:#9c6e38");
  return { uid, ...data, role, perms: ROLES[role] };
}

/* قائمة جميع الموظفين (للإسناد والإدارة) */
export async function listUsers(){
  const snap = await getDocs(query(collection(db, COL.users), orderBy("name")));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/* ═══════════════ الرفع إلى Cloudinary المباشر (Unsigned Upload) ═══════════════ */
async function compressImage(file, minSizeToCompress = 2 * 1024 * 1024) {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= minSizeToCompress) return file;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDim = 1920;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.8;
        const tryCompress = () => {
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error("فشل ضغط الصورة"));
              return;
            }
            if (blob.size <= 10 * 1024 * 1024 || quality <= 0.5) {
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                type: "image/jpeg",
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              quality -= 0.1;
              tryCompress();
            }
          }, "image/jpeg", quality);
        };

        tryCompress();
      };
      img.onerror = () => reject(new Error("تعذر تحميل ملف الصورة للمعالجة"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("تعذر قراءة ملف الصورة"));
    reader.readAsDataURL(file);
  });
}

export async function uploadToCloudinary(file, onProgress, onStatusChange) {
  const maxSize = 10 * 1024 * 1024;
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  // 1. التحقق من حجم الملفات غير المصورة
  if (!isImage && file.size > maxSize) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(`حجم الملف (${sizeInMB} ميجابايت) أكبر من الحد المسموح (10 ميجابايت). الرجاء ضغط الملف أو تصغيره يدويًا ثم إعادة المحاولة.`);
  }

  // 2. ضغط الصور تلقائياً إذا تجاوزت 2 ميجابايت
  let fileToUpload = file;
  if (isImage && file.size > 2 * 1024 * 1024) {
    if (onStatusChange) onStatusChange("compressing");
    try {
      fileToUpload = await compressImage(file);
      console.log(`[Cloudinary] Compressed image from ${(file.size / 1024 / 1024).toFixed(2)}MB to ${(fileToUpload.size / 1024 / 1024).toFixed(2)}MB`);
    } catch (e) {
      console.warn("[Cloudinary] Image compression failed, uploading original:", e);
    }
  }

  if (onStatusChange) onStatusChange("uploading");

  // PDF and images are uploaded as "image" resource type (allows correct Content-Type delivery). Other files remain "raw".
  const resourceType = (isImage || isPdf) ? "image" : "raw";
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/${resourceType}/upload`;
  const formData = new FormData();
  formData.append("file", fileToUpload);
  formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress(pct);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          console.log("[Cloudinary] Upload success:", data);
          const downloadUrl = data.secure_url || data.url;
          if (downloadUrl) {
            resolve(downloadUrl);
          } else {
            reject(new Error("لم يتم استلام رابط الملف من Cloudinary"));
          }
        } catch (err) {
          reject(new Error("خطأ في تحليل استجابة Cloudinary"));
        }
      } else {
        console.error("[Cloudinary] Upload failed:", xhr.status, xhr.responseText);
        reject(new Error(`فشل الرفع إلى Cloudinary (Status ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("حدث خطأ في شبكة الاتصال أثناء الرفع إلى Cloudinary"));
    xhr.send(formData);
  });
}

export function getCloudinaryDownloadUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/fl_attachment/");
  }
  return url;
}

/* ═══════════════ إدارة الملفات والمستندات ═══════════════ */
export async function uploadFile(file, meta, onProgress){
  const url = await uploadToCloudinary(file, onProgress);
  const docRef = await addDoc(collection(db, COL.files), {
    name:        file.name,
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

export async function deleteFile(fileId){
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
    title:              t.title,
    description:        t.description || "",
    priority:           t.priority || "medium",
    status:             "pending",
    dueDate:            t.dueDate ? Timestamp.fromDate(new Date(t.dueDate)) : null,
    attachmentRequired: !!t.attachmentRequired,
    adminId:            t.adminId,
    adminName:          t.adminName,
    employeeId:         t.employeeId,
    employeeName:       t.employeeName,
    rejectionReason:    "",
    attachment:         null,
    adminAttachmentUrl:  t.adminAttachmentUrl || null,
    adminAttachmentName: t.adminAttachmentName || null,
    adminAttachmentType: t.adminAttachmentType || null,
    createdAt:          serverTimestamp(),
    updatedAt:          serverTimestamp()
  });
  return docRef.id;
}

export async function updateTask(taskId, fields){
  const data = { ...fields, updatedAt: serverTimestamp() };
  if(fields.dueDate !== undefined){
    data.dueDate = fields.dueDate ? Timestamp.fromDate(new Date(fields.dueDate)) : null;
  }
  await updateDoc(doc(db, COL.tasks, taskId), data);
}

export async function setTaskStatus(taskId, status){
  await updateDoc(doc(db, COL.tasks, taskId), { status, updatedAt: serverTimestamp() });
}

export async function deleteTask(taskId){
  await deleteDoc(doc(db, COL.tasks, taskId));
}

/* ═══════════════ المهام الشخصية والملاحظات ═══════════════ */
export async function listPersonalTasks(user){
  const isExecOrTech = user.role === "executive" || user.role === "tech_admin" || user.isTechAdmin === true;
  if(isExecOrTech){
    // المدراء والمسؤول التقني يرون كل المهام الشخصية لجميع الموظفين للمتابعة الإدارية
    const snap = await getDocs(query(collection(db, COL.personalTasks), orderBy("createdAt", "desc")));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } else {
    // الموظف العادي يرى مهامه الشخصية فقط
    const q = query(
      collection(db, COL.personalTasks),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    try {
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) {
      if(e?.code === "failed-precondition"){
        console.warn("[Firestore] Composite index missing for portal_personal_tasks list. Sorting client side.");
        const plainQ = query(collection(db, COL.personalTasks), where("userId", "==", user.uid));
        const snap = await getDocs(plainQ);
        return sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      throw e;
    }
  }
}

export async function createPersonalTask(t){
  const docRef = await addDoc(collection(db, COL.personalTasks), {
    title:       t.title,
    description: t.description || "",
    priority:    t.priority || "medium", // "low" | "medium" | "high"
    status:      t.status || "new",      // "new" | "in_progress" | "completed"
    dueDate:     (t.dueDate && t.dueDate !== "") ? Timestamp.fromDate(new Date(t.dueDate)) : null,
    userId:      t.userId,
    userName:    t.userName,
    notes:       t.notes || [],          // مصفوفة الملاحظات: [{ text, createdAt: Date.now() / ISO string, authorId, authorName }]
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp()
  });
  return docRef.id;
}

export async function updatePersonalTask(taskId, fields){
  const data = { ...fields, updatedAt: serverTimestamp() };
  if(fields.dueDate !== undefined) {
    data.dueDate = (fields.dueDate && fields.dueDate !== "") ? Timestamp.fromDate(new Date(fields.dueDate)) : null;
  }
  await updateDoc(doc(db, COL.personalTasks, taskId), data);
}

export async function deletePersonalTask(taskId){
  await deleteDoc(doc(db, COL.personalTasks, taskId));
}

/* المهام المرئية للمستخدم: المسندة له شخصياً أو لإدارته أو المنشأة بواسطته */
export async function listTasks(user){
  const isExecOrTech = user.role === "executive" || user.role === "tech_admin" || user.isTechAdmin === true;
  if(isExecOrTech){
    const snap = await getDocs(query(collection(db, COL.tasks), orderBy("createdAt", "desc")));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } else {
    const q = query(
      collection(db, COL.tasks),
      where("employeeId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    try {
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) {
      if(e?.code === "failed-precondition"){
        console.warn("[Firestore] Composite index missing for portal_tasks list. Sorting client-side.");
        const plainQ = query(collection(db, COL.tasks), where("employeeId", "==", user.uid));
        const snap = await getDocs(plainQ);
        return sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      throw e;
    }
  }
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
  if(!user || !user.uid) return () => {};

  const targets = [user.uid, "dept:all"];
  if(user.department) targets.push(`dept:${user.department}`);
  if(user.role === "hr" || (user.perms && user.perms.canReviewLeave)) targets.push("dept:hr");
  if(user.role === "executive") targets.push("dept:executive");
  if(user.isTechAdmin || user.role === "tech_admin") targets.push("dept:tech_admin");

  const uniqueTargets = [...new Set(targets)].slice(0, 10);
  const base = query(collection(db, COL.notifications), where("userId", "in", uniqueTargets));

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

/* ═══════════════ الاستماعات اللحظية للـ Dashboard والـ State ═══════════════ */
export function watchTasks(user, cb){
  const isExecOrTech = user.role === "executive" || user.role === "tech_admin" || user.isTechAdmin === true;
  let base;
  if(isExecOrTech){
    base = collection(db, COL.tasks);
  } else {
    base = query(collection(db, COL.tasks), where("employeeId", "==", user.uid));
  }

  let active = null;
  const subscribePlain = () => {
    active = onSnapshot(base, snap => {
      const list = sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      cb(list);
    }, err => console.warn("[Firestore] tasks watch (plain) error:", err));
  };

  active = onSnapshot(
    query(base, orderBy("createdAt", "desc")),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => {
      if(err?.code === "failed-precondition"){
        console.warn("[Firestore] Composite index missing for portal_tasks list. Sorting client side.");
        subscribePlain();
      } else {
        console.warn("[Firestore] tasks watch error:", err);
      }
    }
  );

  return () => { if(active) active(); };
}

export function watchMyLeaves(userId, cb){
  const base = query(collection(db, COL.leaves), where("userId", "==", userId));
  let active = null;

  const subscribePlain = () => {
    active = onSnapshot(base, snap => {
      const list = sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      cb(list);
    }, err => console.warn("[Firestore] myLeaves watch (plain) error:", err));
  };

  active = onSnapshot(
    query(base, orderBy("createdAt", "desc")),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => {
      if(err?.code === "failed-precondition"){
        console.warn("[Firestore] Composite index missing for portal_leaves. Sorting client side.");
        subscribePlain();
      } else {
        console.warn("[Firestore] myLeaves watch error:", err);
      }
    }
  );

  return () => { if(active) active(); };
}

export function watchLeavesForExecApproval(cb){
  const base = collection(db, COL.leaves);
  let active = null;

  const subscribePlain = () => {
    active = onSnapshot(base, snap => {
      const list = sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      cb(list);
    }, err => console.warn("[Firestore] execLeaves watch (plain) error:", err));
  };

  active = onSnapshot(
    query(base, orderBy("createdAt", "desc")),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => {
      if(err?.code === "failed-precondition"){
        console.warn("[Firestore] Composite index missing for execLeaves approval. Sorting client side.");
        subscribePlain();
      } else {
        console.warn("[Firestore] execLeaves watch error:", err);
      }
    }
  );

  return () => { if(active) active(); };
}

export function watchEmpLeavesForHR(userId, cb){
  const base = collection(db, COL.leaves);
  let active = null;

  const subscribePlain = () => {
    active = onSnapshot(base, snap => {
      const list = sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      cb(list);
    }, err => console.warn("[Firestore] empLeaves watch (plain) error:", err));
  };

  active = onSnapshot(
    query(base, orderBy("createdAt", "desc")),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => {
      if(err?.code === "failed-precondition"){
        console.warn("[Firestore] Composite index missing for empLeaves for HR. Sorting client side.");
        subscribePlain();
      } else {
        console.warn("[Firestore] empLeaves watch error:", err);
      }
    }
  );

  return () => { if(active) active(); };
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
  console.log("[iOS Push Debug] S.initMessaging() started, uid:", uid || "—");
  LOG("initMessaging() start · uid =", uid || "—");

  // 0) دعم Notification API الأساسي
  if(!browserNotifSupported()){
    console.warn("[iOS Push Debug] Notification API not supported in this browser!");
    WARN("Notification API غير متوفر في هذا المتصفح");
    return { ok:false, reason:"unsupported" };
  }

  // 1) طلب الإذن (مطلوب لكلا المسارين)
  let perm = Notification.permission;
  console.log("[iOS Push Debug] S.initMessaging: Notification.permission BEFORE request:", perm);
  if(perm === "default"){
    console.log("[iOS Push Debug] S.initMessaging: Calling Notification.requestPermission...");
    try{
      perm = await Notification.requestPermission();
      console.log("[iOS Push Debug] S.initMessaging: Notification.requestPermission resolved to:", perm);
    } catch(e){
      console.error("[iOS Push Debug] S.initMessaging: Notification.requestPermission threw error:", e);
      console.error("[iOS Push Debug] requestPermission error details:", e ? { name: e.name, message: e.message, code: e.code } : "null");
      WARN("requestPermission threw:", e);
    }
  } else {
    console.log("[iOS Push Debug] S.initMessaging: Notification.permission is not 'default', bypassing requestPermission. Value:", perm);
  }

  if(perm === "denied"){
    console.warn("[iOS Push Debug] S.initMessaging: Notification permission is denied.");
    WARN("الإذن مرفوض من المستخدم/المتصفح");
    return { ok:false, reason:"denied" };
  }
  if(perm !== "granted"){
    console.warn("[iOS Push Debug] S.initMessaging: Notification permission is not granted (current value:", perm, ")");
    return { ok:false, reason:"denied" };
  }

  // 2) محاولة مسار FCM الكامل
  console.log("[iOS Push Debug] S.initMessaging: Notification permission is granted. Attempting FCM setup...");
  const supported = await fcmSupported();
  const hasSW = "serviceWorker" in navigator;
  console.log("[iOS Push Debug] S.initMessaging: fcmSupported =", supported, "· serviceWorker in navigator =", hasSW);

  if(supported && hasSW){
    try{
      console.log("[iOS Push Debug] S.initMessaging: Registering Service Worker at SW_URL:", SW_URL);
      const reg = await navigator.serviceWorker.register(SW_URL);
      console.log("[iOS Push Debug] S.initMessaging: Waiting for Service Worker to be ready...");
      await navigator.serviceWorker.ready;
      console.log("[iOS Push Debug] S.initMessaging: Service Worker registered and ready. Scope:", reg.scope);

      console.log("[iOS Push Debug] S.initMessaging: Lazy loading Firebase Messaging...");
      const msg = await getMessagingLazy();
      console.log("[iOS Push Debug] S.initMessaging: getMessagingLazy resolved to:", msg ? "Firebase Messaging Object" : "null");
      if(msg){
        console.log("[iOS Push Debug] S.initMessaging: Requesting FCM token via getToken...");
        const token = await getToken(msg, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: reg
        });
        if(token){
          console.log("[iOS Push Debug] S.initMessaging: getToken succeeded! Token acquired ✓ length:", token.length);
          if(uid){
            console.log("[iOS Push Debug] S.initMessaging: Saving FCM token to Firestore for uid:", uid);
            await saveFcmToken(uid, token);
            console.log("[iOS Push Debug] S.initMessaging: Token saved successfully.");
          }
          return { ok:true, mode:"fcm", token };
        }
        console.warn("[iOS Push Debug] S.initMessaging: getToken returned an empty token!");
        WARN("getToken returned empty — falling back to browser notifications");
      } else {
        console.warn("[iOS Push Debug] S.initMessaging: getMessagingLazy returned null.");
      }
    }catch(e){
      console.error("[iOS Push Debug] S.initMessaging: FCM setup route threw an error:", e);
      console.error("[iOS Push Debug] FCM error details:", e ? { name: e.name, message: e.message, code: e.code, stack: e.stack } : "null");
      WARN("FCM path failed (", e?.code || e?.message || e, ") — falling back to browser notifications");
    }
  } else {
    console.log("[iOS Push Debug] S.initMessaging: FCM path bypassed (not supported or no SW support).");
  }

  // 3) الاحتياطي: الإذن ممنوح لكن FCM غير متاح ⇒ إشعارات متصفح محلية تعمل
  console.log("[iOS Push Debug] S.initMessaging: Falling back to local browser notifications mode.");
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
  else if(/iPhone|iPad|iPod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)) os="iOS"; else if(/Mac/i.test(ua)) os="macOS";
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

export async function disableMessaging(uid){
  try{
    const token = await currentDeviceToken();
    if(token){
      await deleteFcmTokenDoc(token);
    }
    LOG("disableMessaging executed");
    return { ok: true };
  }catch(e){
    WARN("disableMessaging failed:", e);
    return { ok: false, error: e };
  }
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

/* ═══════════════ إدارة الإجازات (Leave Requests Workflow) ═══════════════ */
export async function createLeaveRequest(data) {
  const year = new Date().getFullYear();
  const randSeq = Math.floor(1000 + Math.random() * 9000);
  const refNo = `LV-${year}-${randSeq}`;

  const docRef = await addDoc(collection(db, COL.leaves), {
    refNo,
    userId:        data.userId,
    userName:      data.userName,
    userJobTitle:  data.userJobTitle || "",
    userDepartment:data.userDepartment || "",
    type:          data.type,
    reason:        data.reason || "",
    startDate:     data.startDate,
    endDate:       data.endDate,
    daysCount:     data.daysCount || 1,
    attachments:   data.attachments || [],
    notes:         data.notes || "",
    status:        "submitted",
    hrReview:      null,
    execReview:    null,
    rejectionReason: "",
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp()
  });
  return { id: docRef.id, refNo };
}

/* جلب إجازاتي الشخصية فقط (لكل أصحاب الصلاحيات) */
export async function listMyLeaves(userId) {
  const q = query(
    collection(db, COL.leaves),
    where("userId", "==", userId)
  );
  try {
    const snap = await getDocs(query(q, orderBy("createdAt", "desc")));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return list.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
  }
}

/* جلب طلبات إجازات الموظفين للموارد البشرية (جميع الموظفين باستثناء الموارد الشخصية) */
export async function listEmpLeavesForHR(currentUserId) {
  const snap = await getDocs(query(collection(db, COL.leaves), orderBy("createdAt", "desc")));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return all.filter(l => l.userId !== currentUserId);
}

/* جلب طلبات الإجازات المعلقة بانتظار اعتماد المدير التنفيذي (status === hr_approved) */
export async function listLeavesForExecApproval() {
  const q = query(
    collection(db, COL.leaves),
    where("status", "==", "hr_approved")
  );
  try {
    const snap = await getDocs(query(q, orderBy("createdAt", "desc")));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return list.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
  }
}

/* مراجعة الموارد البشرية: موافقة (تحويل للمدير hr_approved) أو رفض (hr_rejected) */
export async function reviewLeaveHR(leaveId, hrUser, action, notes) {
  const status = action === "approve" ? "hr_approved" : "hr_rejected";
  const leaveRef = doc(db, COL.leaves, leaveId);
  await updateDoc(leaveRef, {
    status,
    hrReview: {
      by: hrUser.uid,
      byName: hrUser.name,
      action,
      notes: notes || "",
      at: Timestamp.now()
    },
    rejectionReason: action === "reject" ? (notes || "مرفوض من الموارد البشرية") : "",
    updatedAt: serverTimestamp()
  });
}

/* اعتماد المدير التنفيذي: توقيع نهائي (approved) */
export async function approveLeaveExec(leaveId, execUser, notes) {
  const leaveRef = doc(db, COL.leaves, leaveId);
  await updateDoc(leaveRef, {
    status: "approved",
    execReview: {
      by: execUser.uid,
      byName: execUser.name,
      action: "approve",
      notes: notes || "تم الاعتماد النهائي من المدير التنفيذي",
      at: Timestamp.now()
    },
    updatedAt: serverTimestamp()
  });
}

export async function rejectLeaveExec(leaveId, execUser, notes) {
  const leaveRef = doc(db, COL.leaves, leaveId);
  await updateDoc(leaveRef, {
    status: "exec_rejected",
    execReview: {
      by: execUser.uid,
      byName: execUser.name,
      action: "reject",
      notes: notes || "تم الرفض النهائي من المدير التنفيذي",
      at: Timestamp.now()
    },
    rejectionReason: notes || "تم الرفض النهائي من المدير التنفيذي",
    updatedAt: serverTimestamp()
  });
}


/* ═══════════════ الملف الشخصي والدورات والشهادات ═══════════════ */
export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, COL.users, uid), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function uploadAvatar(uid, file) {
  const url = await uploadToCloudinary(file);
  await updateDoc(doc(db, COL.users, uid), { avatar: url });
  return url;
}

export async function uploadCV(uid, file) {
  const url = await uploadToCloudinary(file);
  const cvObj = { name: file.name, url, updatedAt: new Date().toISOString() };
  await updateDoc(doc(db, COL.users, uid), { cv: cvObj });
  return cvObj;
}

export async function uploadCourseCert(uid, file) {
  return await uploadToCloudinary(file);
}

export async function uploadLeaveAttachment(file) {
  const url = await uploadToCloudinary(file);
  return { name: file.name, url };
}

/* ═══════════════ إدارة الموظفين للمسؤول التقني (Tech Admin) ═══════════════ */
export async function createEmployeeAccountTechAdmin(userData) {
  const uid = userData.uid || `emp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  await setDoc(doc(db, COL.users, uid), {
    name:         userData.name,
    email:        userData.email,
    jobTitle:     userData.jobTitle || "موظف",
    role:         userData.role || "employee",
    isTechAdmin:  userData.isTechAdmin || false,
    status:       "active",
    phone:        userData.phone || "",
    hireDate:     userData.hireDate || new Date().toISOString().split('T')[0],
    bio:          userData.bio || "",
    cv:           null,
    qualifications: [],
    courses:      [],
    skills:       [],
    personalFiles:[],
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp()
  });
  return uid;
}

export async function updateEmployeeAccountTechAdmin(uid, updateData) {
  await updateDoc(doc(db, COL.users, uid), {
    ...updateData,
    updatedAt: serverTimestamp()
  });
}

/* جلب المستخدمين حسب الصلاحية لتحديد مستلمي البريد */
export async function getUsersByRole(role) {
  const q = query(collection(db, COL.users), where("role", "==", role));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/* إرسال إشعار بريدي عبر EmailJS عند تقديم/موافقة الإجازة */
export async function sendLeaveRequestEmail(recipientEmail, recipientName, employeeName, reviewLink) {
  if (!window.emailjs) {
    console.error("[EmailJS] SDK is not loaded in window.");
    throw new Error("EmailJS SDK not loaded");
  }

  // تهيئة المعرّف العام للمكتبة
  window.emailjs.init(EMAILJS_CONFIG.publicKey);

  const params = {
    to_email: recipientEmail,
    recipient_name: recipientName,
    employee_name: employeeName,
    review_link: reviewLink,
    company_name: "جمعية إرث وحضارة بالقريات"
  };

  return window.emailjs.send(
    EMAILJS_CONFIG.serviceId,
    EMAILJS_CONFIG.templateId,
    params
  );
}

/* إرسال إشعار بريدي عبر EmailJS عند إسناد مهمة جديدة للموظف */
export async function sendTaskAssignedEmail(recipientEmail, recipientName, senderName, taskTitle, taskPriority, reviewLink) {
  if (!window.emailjs) {
    console.error("[EmailJS] SDK is not loaded in window.");
    throw new Error("EmailJS SDK not loaded");
  }

  // تهيئة المعرّف العام للمكتبة
  window.emailjs.init(EMAILJS_CONFIG.publicKey);

  const params = {
    to_email: recipientEmail,
    recipient_name: recipientName,
    sender_name: senderName,
    task_title: taskTitle,
    task_priority: taskPriority,
    review_link: reviewLink,
    company_name: "جمعية إرث وحضارة بالقريات"
  };

  return window.emailjs.send(
    EMAILJS_CONFIG.serviceId,
    EMAILJS_CONFIG.taskAssignedTemplateId,
    params
  );
}

/* ════════ الاقتراحات والشكاوى ════════ */
export function watchSuggestions(userId, cb) {
  const q = query(
    collection(db, COL.suggestions),
    or(
      where("senderId", "==", userId),
      where("recipientId", "==", userId)
    ),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => {
    console.warn("[Firestore] watchSuggestions error:", err);
    // Fallback: query without orderBy in case a compound index is required and missing
    const fallbackQuery = query(
      collection(db, COL.suggestions),
      or(
        where("senderId", "==", userId),
        where("recipientId", "==", userId)
      )
    );
    onSnapshot(fallbackQuery, snap => {
      const sorted = sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      cb(sorted);
    }, err2 => console.error("[Firestore] watchSuggestions fallback error:", err2));
  });
}

export async function createSuggestion(data) {
  const docRef = await addDoc(collection(db, COL.suggestions), {
    type:           data.type, // "suggestion" | "complaint"
    senderId:       data.senderId,
    senderName:     data.senderName,
    realSenderName: data.realSenderName,
    recipientId:    data.recipientId,
    recipientName:  data.recipientName,
    title:          data.title,
    content:        data.content,
    attachment:     data.attachment || null, // { url, name, type }
    isAnonymous:    data.isAnonymous || false,
    isRead:         false,
    createdAt:      serverTimestamp()
  });
  return docRef.id;
}

export async function markSuggestionAsRead(id) {
  const ref = doc(db, COL.suggestions, id);
  await updateDoc(ref, { isRead: true });
}
