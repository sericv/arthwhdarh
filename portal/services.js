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
  serverTimestamp, Timestamp, or, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getMessaging, getToken, onMessage, isSupported as fcmIsSupported
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

import { FIREBASE_CONFIG, CLOUDINARY_CONFIG, VAPID_KEY, PUSH_ENDPOINT, COL, ROLES, NOTIF_TYPE, SHAREPOINT_CONFIG } from "./config.js";

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
  query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, writeBatch,
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
  const isGroup = t.recipientAll === true || t.isGroup === true;
  let usersToAssign = t.targetUsers || [];

  if (isGroup && (!Array.isArray(usersToAssign) || usersToAssign.length === 0)) {
    const usersSnap = await getDocs(collection(db, COL.users));
    usersToAssign = usersSnap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .filter(u => u.uid !== t.adminId && u.status !== "inactive");
  }

  const docRef = await addDoc(collection(db, COL.tasks), {
    title:              t.title,
    description:        t.description || "",
    priority:           t.priority || "medium",
    status:             isGroup ? "in_progress" : "pending",
    dueDate:            t.dueDate ? Timestamp.fromDate(new Date(t.dueDate)) : null,
    attachmentRequired: !!t.attachmentRequired,
    adminId:            t.adminId,
    adminName:          t.adminName,
    employeeId:         isGroup ? "all" : t.employeeId,
    employeeName:       isGroup ? "جميع الموظفين" : (t.employeeName || ""),
    isGroup:            isGroup,
    recipientAll:       isGroup,
    targetCount:        isGroup ? usersToAssign.length : 1,
    rejectionReason:    "",
    attachment:         null,
    adminAttachmentUrl:          t.adminAttachmentUrl || null,
    adminAttachmentName:         t.adminAttachmentName || null,
    adminAttachmentType:         t.adminAttachmentType || null,
    adminAttachmentProvider:     t.adminAttachmentProvider || null,
    adminAttachmentDriveItemId:  t.adminAttachmentDriveItemId || null,
    adminAttachmentDownloadUrl:  t.adminAttachmentDownloadUrl || null,
    adminAttachmentPath:         t.adminAttachmentPath || null,
    adminAttachmentObj:          t.adminAttachmentObj || null,
    createdAt:          serverTimestamp(),
    updatedAt:          serverTimestamp()
  });

  if (isGroup && usersToAssign.length > 0) {
    const batch = writeBatch(db);
    usersToAssign.forEach(u => {
      const execRef = doc(db, COL.tasks, docRef.id, "executions", u.uid);
      batch.set(execRef, {
        employeeId: u.uid,
        employeeName: u.name || "موظف",
        employeeJobTitle: u.jobTitle || "موظف",
        status: "not_started",
        attachment: null,
        notes: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        completedAt: null
      });
    });
    await batch.commit();
  }
  return docRef.id;
}

/* ═══════════════ متابعة تنفيذ المهام الجماعية ═══════════════ */
export async function getTaskExecutions(taskId){
  try {
    const snap = await getDocs(collection(db, COL.tasks, taskId, "executions"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.warn("[Firestore] getTaskExecutions error:", e);
    return [];
  }
}

export function watchTaskExecutions(taskId, cb){
  const colRef = collection(db, COL.tasks, taskId, "executions");
  return onSnapshot(colRef, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => console.warn("[Firestore] watchTaskExecutions error:", err));
}

export async function getTaskExecution(taskId, userId){
  try {
    const snap = await getDoc(doc(db, COL.tasks, taskId, "executions", userId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch(e) {
    console.warn("[Firestore] getTaskExecution error:", e);
    return null;
  }
}

export async function updateTaskExecution(taskId, userId, fields){
  const ref = doc(db, COL.tasks, taskId, "executions", userId);
  await setDoc(ref, {
    ...fields,
    updatedAt: serverTimestamp()
  }, { merge: true });
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
  throw new Error("حذف المهام غير مسموح به في النظام");
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
    userId: n.userId,            // uid أو رمز إدارة ("dept:finance" / "dept:all")
    excludeUid: n.excludeUid || "", // استثناء صاحب العمل من الدفع
    type:   n.type,
    pref:   NOTIF_TYPE[n.type]?.pref || "system",  // مجموعة التفضيل
    title:  n.title,
    body:   n.body || "",
    link:   n.link || "",        // وجهة التنقّل: "announcements" | "feedback" | "tasks" | "files"
    refId:  n.refId || "",       // مُعرّف التعميم/الشكوى/المهمة
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
  if(isExecOrTech){
    const base = collection(db, COL.tasks);
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
  } else {
    let listPersonal = [];
    let listGroup = [];
    const mergeAndEmit = () => {
      const map = new Map();
      [...listPersonal, ...listGroup].forEach(item => map.set(item.id, item));
      const merged = sortByCreatedDesc(Array.from(map.values()));
      cb(merged);
    };

    const q1 = query(collection(db, COL.tasks), where("employeeId", "==", user.uid));
    const unsub1 = onSnapshot(q1, snap => {
      listPersonal = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      mergeAndEmit();
    }, err => console.warn("[Firestore] emp personal tasks watch error:", err));

    const q2 = query(collection(db, COL.tasks), where("isGroup", "==", true));
    const unsub2 = onSnapshot(q2, snap => {
      listGroup = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      mergeAndEmit();
    }, err => console.warn("[Firestore] emp group tasks watch error:", err));

    return () => { unsub1(); unsub2(); };
  }
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
/* تشخيص حالة Web Push التلقائي والآمن لنظام iOS PWA */
export async function logPushDiagnostics(uid){
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const isPWA = Boolean(window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);
  const notifPerm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  const hasSW = "serviceWorker" in navigator;
  
  let swStatus = "not registered";
  let swScope = "N/A";
  let pushSubStatus = "none";
  let reg = null;

  if(hasSW){
    try {
      reg = await navigator.serviceWorker.getRegistration(SW_URL).catch(()=>null);
      if(reg){
        swStatus = "registered & ready";
        swScope = reg.scope;
        const sub = await reg.pushManager.getSubscription().catch(()=>null);
        if(sub && sub.endpoint){
          const epDomain = new URL(sub.endpoint).hostname;
          pushSubStatus = `exists (endpoint: ${epDomain})`;
        }
      }
    } catch(e){}
  }

  const fcmSupport = await fcmSupported();
  let tokenStatus = "none";

  if(hasSW && fcmSupport && notifPerm === "granted" && reg){
    try {
      const msg = await getMessagingLazy();
      if(msg){
        const token = await getToken(msg, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg }).catch(()=>null);
        if(token){
          tokenStatus = `exists (length: ${token.length}, prefix: ${token.slice(0, 8)}...)`;
        }
      }
    } catch(e){}
  }

  console.log("%c[IOS PUSH TEST]", "color:#9c6e38;font-weight:bold;font-size:13px;");
  console.log(`[IOS PUSH TEST] PWA: ${isPWA}`);
  console.log(`[IOS PUSH TEST] Service Worker: ${swStatus}`);
  console.log(`[IOS PUSH TEST] Service Worker scope: ${swScope}`);
  console.log(`[IOS PUSH TEST] Notification permission: ${notifPerm}`);
  console.log(`[IOS PUSH TEST] Push supported: ${fcmSupport}`);
  console.log(`[IOS PUSH TEST] Push subscription: ${pushSubStatus}`);
  console.log(`[IOS PUSH TEST] FCM token: ${tokenStatus}`);
  console.log(`[IOS PUSH TEST] Token saved: ${Boolean(tokenStatus !== "none" && uid)}`);

  return {
    isIOS, isPWA, notifPerm, swStatus, swScope, fcmSupport, pushSubStatus, tokenStatus
  };
}

export async function initMessaging(uid){
  LOG("initMessaging() start · uid =", uid || "—");

  // تشخيص تلقائي آمن
  setTimeout(() => logPushDiagnostics(uid), 800);

  // 0) دعم Notification API الأساسي
  if(!browserNotifSupported()){
    console.warn("[IOS PUSH TEST] Notification API not supported in this browser!");
    WARN("Notification API غير متوفر في هذا المتصفح");
    return { ok:false, reason:"unsupported" };
  }

  // 1) طلب الإذن (مطلوب لكلا المسارين)
  let perm = Notification.permission;
  if(perm === "default"){
    try{
      perm = await Notification.requestPermission();
    } catch(e){
      WARN("requestPermission threw:", e);
    }
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

  if(supported && hasSW){
    try{
      const reg = await navigator.serviceWorker.register(SW_URL);
      await navigator.serviceWorker.ready;

      const msg = await getMessagingLazy();
      if(msg){
        const token = await getToken(msg, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: reg
        });
        if(token){
          if(uid){
            await saveFcmToken(uid, token);
          }
          setTimeout(() => logPushDiagnostics(uid), 300);
          return { ok:true, mode:"fcm", token };
        }
        WARN("getToken returned empty — falling back to browser notifications");
      }
    }catch(e){
      WARN("FCM path failed (", e?.code || e?.message || e, ") — falling back to browser notifications");
    }
  }

  // 3) الاحتياطي: الإذن ممنوح لكن FCM غير متاح ⇒ إشعارات متصفح محلية تعمل
  return { ok:true, mode:"browser" };
}

/* عرض إشعار متصفح محلي متوافق مع iPhone PWA و Safari و Chrome و Android */
export async function showLocalNotification(title, body, opts = {}){
  if(!browserNotifSupported() || Notification.permission !== "granted") return false;
  try{
    const iconUrl = opts.icon || new URL("android-chrome-192x192.png", import.meta.url).href;
    const notifOptions = {
      body: body || "",
      icon: iconUrl,
      badge: opts.badge || iconUrl,
      dir: "rtl",
      lang: "ar",
      tag: opts.tag || ("erth-local-" + Date.now()),
      renotify: true,
      data: opts.data || { url: window.location.href, link: opts.link || "notifs", refId: opts.refId || "" }
    };

    // المسار المعتمد والوحيد لـ iOS WebKit و PWA: عبر Service Worker
    if("serviceWorker" in navigator){
      try {
        const reg = await navigator.serviceWorker.ready;
        if(reg && typeof reg.showNotification === "function"){
          await reg.showNotification(title, notifOptions);
          return true;
        }
      } catch(swErr){
        console.warn("[Local Notif] SW showNotification error:", swErr);
      }
    }

    // احتياطي للمتصفحات القديمة غير الداعمة لـ SW
    if(typeof Notification === "function"){
      const n = new Notification(title, notifOptions);
      if(opts.onClick){
        n.onclick = () => { window.focus(); opts.onClick(); n.close(); };
      }
      return true;
    }
    return false;
  }catch(e){
    WARN("showLocalNotification failed:", e);
    return false;
  }
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

export function getCvPreviewUrl(cv) {
  if (!cv) return "#";
  if (cv.provider === "sharepoint") {
    return cv.url || cv.webUrl || "#";
  }
  return cv.url || "#";
}

export function getCvDownloadUrl(cv) {
  if (!cv) return "#";
  if (cv.provider === "sharepoint") {
    return cv.downloadUrl || cv.url || cv.webUrl || "#";
  }
  return getCloudinaryDownloadUrl(cv.url);
}

let functionsEmulatorConnected = false;

export async function uploadCV(uid, file) {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  
  console.log("[CV] Upload provider: SharePoint");

  const reader = new FileReader();
  const base64Promise = new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
  });
  reader.readAsDataURL(file);
  const fileBase64 = await base64Promise;

  const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
  const functions = getFunctions(app);

  if (isLocal && !functionsEmulatorConnected) {
    try {
      connectFunctionsEmulator(functions, "127.0.0.1", 5001);
      functionsEmulatorConnected = true;
      console.log("%c[CV] Using Functions Emulator: http://127.0.0.1:5001/arthwhdarh-782ec/us-central1/uploadCvToSharePoint", "color:#b88e36;font-weight:bold");
    } catch (e) {
      functionsEmulatorConnected = true;
    }
  }

  try {
    const uploadFn = httpsCallable(functions, "uploadCvToSharePoint");
    const res = await uploadFn({
      targetUserId: uid,
      fileName: file.name,
      fileBase64: fileBase64,
      mimeType: file.type
    });

    console.log("[CV] SharePoint upload success via Functions Emulator/Backend!");
    console.log("[CV] Saved provider: sharepoint");

    return res.data;
  } catch (err) {
    console.error("[CV] SharePoint upload error:", err);
    if (isLocal) {
      throw new Error(`فشل رفع CV عبر محاكي الدالة محلياً: ${err.message || err}`);
    }
    console.warn("[SharePoint CV] Backend upload failed in production, falling back to legacy Cloudinary:", err);
    const url = await uploadToCloudinary(file);
    const cvObj = { provider: "cloudinary", name: file.name, url, updatedAt: new Date().toISOString() };
    await updateDoc(doc(db, COL.users, uid), { cv: cvObj });
    return cvObj;
  }
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
    isRead:         false,
    createdAt:      serverTimestamp()
  });

  // إرسال إشعار دفع فوري للمستقبل المحدد
  try {
    const isComplaint = data.type === "complaint";
    const notifTitle = isComplaint ? "شكوى جديدة" : "اقتراح جديد";
    const notifBody = isComplaint ? "لديك شكوى جديدة بانتظار المراجعة" : "لديك اقتراح جديد بانتظار المراجعة";

    if (data.recipientId) {
      await pushNotification({
        userId: data.recipientId,
        title: notifTitle,
        body: notifBody,
        type: "feedback",
        link: "suggestions",
        refId: docRef.id
      });
    }
  } catch (err) {
    console.warn("Failed to send suggestion/complaint push notification:", err);
  }

  return docRef.id;
}

export async function markSuggestionAsRead(id) {
  const ref = doc(db, COL.suggestions, id);
  await updateDoc(ref, { isRead: true });
}

/* ═══════════════ رفع وتتبع مرفقات المهام إلى SharePoint ═══════════════ */
export async function uploadTaskAttachment(params, file, onProgress, onStatus) {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  const reader = new FileReader();
  const base64Promise = new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
  });
  reader.readAsDataURL(file);
  const fileBase64 = await base64Promise;

  const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
  const functions = getFunctions(app);

  if (isLocal && !functionsEmulatorConnected) {
    try {
      connectFunctionsEmulator(functions, "127.0.0.1", 5001);
      functionsEmulatorConnected = true;
      console.log("%c[Task Attachment] Using Functions Emulator: http://127.0.0.1:5001/arthwhdarh-782ec/us-central1/uploadTaskAttachmentToSharePoint", "color:#b88e36;font-weight:bold");
    } catch (e) {
      functionsEmulatorConnected = true;
    }
  }

  try {
    const uploadFn = httpsCallable(functions, "uploadTaskAttachmentToSharePoint");
    const res = await uploadFn({
      taskType: params.taskType,
      taskId: params.taskId,
      subFolder: params.subFolder,
      employeeUid: params.employeeUid,
      fileName: file.name,
      fileBase64: fileBase64,
      mimeType: file.type
    });

    console.log("[Task Attachment] SharePoint upload success:", res.data);
    return res.data;
  } catch (err) {
    console.error("[Task Attachment] SharePoint upload error:", err);
    if (isLocal) {
      throw new Error(`فشل رفع مرفق المهمة محلياً: ${err.message || err}`);
    }
    console.warn("[Task Attachment] Backend upload failed in production, falling back to Cloudinary:", err);
    const url = await uploadToCloudinary(file, onProgress, onStatus);
    return {
      provider: "cloudinary",
      name: file.name,
      url: url,
      downloadUrl: getCloudinaryDownloadUrl(url),
      updatedAt: new Date().toISOString()
    };
  }
}

export function getTaskAttachmentPreviewUrl(url, itemObj) {
  if (itemObj && (itemObj.provider === "sharepoint" || itemObj.attachmentProvider === "sharepoint" || itemObj.adminAttachmentProvider === "sharepoint")) {
    return itemObj.url || itemObj.webUrl || url || "#";
  }
  return url || "#";
}

export function getTaskAttachmentDownloadUrl(url, itemObj) {
  if (itemObj && (itemObj.provider === "sharepoint" || itemObj.attachmentProvider === "sharepoint" || itemObj.adminAttachmentProvider === "sharepoint")) {
    return itemObj.downloadUrl || itemObj.url || itemObj.webUrl || url || "#";
  }
  return getCloudinaryDownloadUrl(url);
}

/* ═══════════════ 16. التعميمات والإعلانات الداخلية ═══════════════ */

export async function uploadAnnouncementAttachment(params, file, onProgress, onStatus) {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  const reader = new FileReader();
  const base64Promise = new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
  });
  reader.readAsDataURL(file);
  const fileBase64 = await base64Promise;

  const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
  const functions = getFunctions(app);

  if (isLocal && !functionsEmulatorConnected) {
    try {
      connectFunctionsEmulator(functions, "127.0.0.1", 5001);
      functionsEmulatorConnected = true;
      console.log("%c[Announcement Attachment] Using Functions Emulator", "color:#b88e36;font-weight:bold");
    } catch (e) {
      functionsEmulatorConnected = true;
    }
  }

  try {
    const uploadFn = httpsCallable(functions, "uploadAnnouncementAttachmentToSharePoint");
    const res = await uploadFn({
      announcementId: params.announcementId,
      fileName: file.name,
      fileBase64: fileBase64,
      mimeType: file.type
    });

    console.log("[Announcement Attachment] SharePoint upload success:", res.data);
    return res.data;
  } catch (err) {
    console.error("[Announcement Attachment] SharePoint upload error:", err);
    if (isLocal) {
      throw new Error(`فشل رفع مرفق التعميم محلياً: ${err.message || err}`);
    }
    console.warn("[Announcement Attachment] Backend upload failed, falling back to Cloudinary:", err);
    const url = await uploadToCloudinary(file, onProgress, onStatus);
    return {
      provider: "cloudinary",
      name: file.name,
      url: url,
      downloadUrl: getCloudinaryDownloadUrl(url),
      updatedAt: new Date().toISOString()
    };
  }
}

export function getAnnouncementAttachmentPreviewUrl(url, itemObj) {
  if (itemObj && (itemObj.provider === "sharepoint" || itemObj.attachmentProvider === "sharepoint")) {
    return itemObj.url || itemObj.webUrl || url || "#";
  }
  return url || "#";
}

export function getAnnouncementAttachmentDownloadUrl(url, itemObj) {
  if (itemObj && (itemObj.provider === "sharepoint" || itemObj.attachmentProvider === "sharepoint")) {
    return itemObj.downloadUrl || itemObj.url || itemObj.webUrl || url || "#";
  }
  return getCloudinaryDownloadUrl(url);
}

export async function listAnnouncements(currentUser) {
  try {
    const q = query(collection(db, COL.announcements), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const isAuthorized = currentUser && (
      currentUser.role === "executive" ||
      currentUser.role === "hr" ||
      currentUser.isTechAdmin === true ||
      currentUser.role === "tech_admin"
    );

    if (isAuthorized) return list;

    // تصفية التعميمات للموظف العادي: يرى الموجه للكل أو الموجه له شخصياً
    return list.filter(item => {
      if (item.targetAudience === "all") return true;
      if (Array.isArray(item.targetUids) && item.targetUids.includes(currentUser?.uid)) return true;
      return false;
    });
  } catch (e) {
    console.warn("listAnnouncements error:", e);
    return [];
  }
}

export async function createAnnouncement(data, currentUser) {
  const docRef = await addDoc(collection(db, COL.announcements), {
    title: data.title,
    content: data.content,
    type: data.type || "general",
    targetAudience: data.targetAudience || "all", // "all" | "specific"
    targetUids: data.targetUids || [],
    attachment: data.attachment || null,
    createdById: currentUser.uid,
    createdByName: currentUser.name || "الإدارة",
    createdAt: serverTimestamp(),
    createdAtIso: new Date().toISOString()
  });

  // إرسال إشعارات فورية للمستهدفين
  try {
    const notifTitle = "تعميم جديد";
    const notifBody = `وصل تعميم جديد من المدير التنفيذي\n"${data.title}"`;

    if (data.targetAudience === "all") {
      await pushNotification({
        userId: "dept:all",
        excludeUid: currentUser?.uid || "",
        title: notifTitle,
        body: notifBody,
        type: "announcement",
        link: "announcements",
        refId: docRef.id
      });
    } else if (Array.isArray(data.targetUids)) {
      for (const targetUid of data.targetUids) {
        await pushNotification({
          userId: targetUid,
          title: notifTitle,
          body: notifBody,
          type: "announcement",
          link: "announcements",
          refId: docRef.id
        });
      }
    }
  } catch (err) {
    console.warn("Failed to create announcement notifications:", err);
  }

  return docRef.id;
}

export async function deleteAnnouncement(announcementId) {
  const ref = doc(db, COL.announcements, announcementId);
  await deleteDoc(ref);
}

const viewedAnnouncementsCache = new Set();

export async function recordAnnouncementView(announcementId, currentUser) {
  if (!announcementId || !currentUser || !currentUser.uid) return;
  const cacheKey = `${announcementId}_${currentUser.uid}`;

  // 1. فحص حامي التكرار السريع في الذاكرة
  if (viewedAnnouncementsCache.has(cacheKey)) {
    return;
  }

  try {
    const viewRef = doc(db, COL.announcements, announcementId, "views", currentUser.uid);

    // 2. فحص المستند في Firestore: إذا تم تسجيل المشاهدة الأولى سابقاً لا تُعدل ولا تُحدث اطلاقاً
    const snap = await getDoc(viewRef);
    if (snap.exists()) {
      viewedAnnouncementsCache.add(cacheKey);
      return;
    }

    // 3. تسكيل المشاهدة الأولى فقط بحسب أول وقت فتح للتعميم
    await setDoc(viewRef, {
      announcementId: announcementId,
      employeeUid: currentUser.uid,
      employeeName: currentUser.name || "موظف",
      department: currentUser.department || "",
      viewedAt: new Date().toISOString(),
      firstViewedTimestamp: serverTimestamp()
    });

    viewedAnnouncementsCache.add(cacheKey);
    console.log(`[Announcement View] First view recorded for user ${currentUser.uid}`);
  } catch (err) {
    console.warn("recordAnnouncementView error (may be protected or offline):", err);
  }
}

export async function listAnnouncementViews(announcementId) {
  if (!announcementId) return [];
  try {
    const viewsRef = collection(db, COL.announcements, announcementId, "views");
    const snap = await getDocs(viewsRef);
    const rawList = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 1. ضمان حظر التكرار في العرض وإظهار كل موظف مرة واحدة فقط بوقت أول مشاهدة
    const uniqueMap = new Map();
    for (const item of rawList) {
      const empId = item.employeeUid || item.id;
      if (!uniqueMap.has(empId)) {
        uniqueMap.set(empId, item);
      } else {
        // في حال وجود سجلات قديمة مكررة، الاحتفاظ بالوقت الأقدم (أول مشاهدة)
        const existing = uniqueMap.get(empId);
        const existingTime = new Date(existing.viewedAt || 0).getTime();
        const currentTime = new Date(item.viewedAt || 0).getTime();
        if (currentTime < existingTime) {
          uniqueMap.set(empId, item);
        }
      }
    }

    const uniqueList = Array.from(uniqueMap.values());
    // 2. عرض المشاهدات مرتبة
    return uniqueList.sort((a, b) => new Date(b.viewedAt || 0) - new Date(a.viewedAt || 0));
  } catch (err) {
    console.error("listAnnouncementViews error:", err);
    return [];
  }
}

