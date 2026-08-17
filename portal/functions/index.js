/* ══════════════════════════════════════════════════════════
   Cloud Functions — إرسال إشعارات الدفع (FCM)
   جمعية إرث وحضارة بالقريات · البوابة الداخلية
   ──────────────────────────────────────────────────────────
   هذه هي الطبقة الخادمية المطلوبة لوصول الإشعارات حتى عند إغلاق
   البوابة كلياً. تستمع لإضافة مستند في portal_notifications،
   تُحضِر رموز FCM للمستهدفين، وترسل رسالة دفع، وتحذف الرموز
   غير الصالحة تلقائياً.

   النشر:
     cd portal/functions && npm install
     firebase deploy --only functions

   ملاحظة: لا حاجة لمفتاح VAPID الخاص هنا — Admin SDK يستخدم
   صلاحيات المشروع. المفتاح الخاص يبقى سرّاً ولا يُستخدم في الواجهة.
══════════════════════════════════════════════════════════ */
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

const envCandidates = [
  path.join(__dirname, ".env"),
  path.join(__dirname, ".env.txt"),
  path.join(__dirname, "..", ".env"),
  path.join(__dirname, "..", ".env.txt"),
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), ".env.txt"),
  path.join(process.cwd(), "portal", "functions", ".env"),
  path.join(process.cwd(), "portal", "functions", ".env.txt")
];

for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: true });
  }
}

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

const COL = {
  users:  "portal_users",
  tokens: "portal_fcm_tokens"
};

/* أيقونة الإشعار */
const ICON = "/assets/الشعار/الشعار.png";

/* حلّ المستهدفين: uid مباشر أو "dept:CODE" لكل أفراد إدارة */
async function resolveUids(userId, excludeUid){
  if(!userId) return [];
  let uids = [];
  if(userId.startsWith("dept:")){
    const dept = userId.slice(5);
    if(dept === "all") {
      // إشعار موجه للجميع: جلب كافة حسابات الموظفين
      const snap = await db.collection(COL.users).get();
      uids = snap.docs.map(d => d.id);
    } else {
      const snap = await db.collection(COL.users)
        .where("role", "in", dept === "executive"
          ? ["executive"]
          : [dept, "executive"])
        .get();
      uids = snap.docs.map(d => d.id);
    }
  } else {
    uids = [userId];
  }

  if(excludeUid) {
    uids = uids.filter(u => u !== excludeUid);
  }
  return uids;
}

/* جلب رموز FCM لمجموعة مستخدمين */
async function tokensForUids(uids){
  if(!uids.length) return [];
  const out = [];
  // Firestore "in" بحد 10 — نقسّم
  for(let i=0; i<uids.length; i+=10){
    const chunk = uids.slice(i, i+10);
    const snap = await db.collection(COL.tokens).where("uid", "in", chunk).get();
    snap.forEach(d => out.push({ token: d.id, ...d.data() }));
  }
  return out;
}

/* احترام تفضيلات المستخدم: هل يستقبل هذه الفئة؟ */
async function prefAllows(uid, pref){
  if(!pref) return true;
  const u = await db.collection(COL.users).doc(uid).get();
  const prefs = u.data()?.notifPrefs;
  if(!prefs) return true; // الافتراضي: مفعّل
  return prefs[pref] !== false;
}

exports.sendPushOnNotification = onDocumentCreated(
  "portal_notifications/{id}",
  async (event) => {
    const n = event.data?.data();
    if(!n) return;

    const uids = await resolveUids(n.userId, n.excludeUid);
    if(!uids.length){ console.log("no target uids for", n.userId); return; }

    // ترشيح حسب التفضيلات
    const allowed = [];
    for(const uid of uids){
      if(await prefAllows(uid, n.pref)) allowed.push(uid);
    }
    if(!allowed.length){ console.log("all recipients opted out of", n.pref); return; }

    const tokenDocs = await tokensForUids(allowed);
    if(!tokenDocs.length){ console.log("no tokens for recipients"); return; }

    const titleText = String(n.title || "إرث وحضارة");
    const bodyText = String(n.body || "");
    const deepLinkUrl = `/portal/#${n.link || "notifs"}${n.refId ? ":" + n.refId : ""}`;

    console.log(`[Push Debug] Notification created: id=${event.params.id}, type=${n.type || "general"}, link=${n.link || "notifs"}`);
    console.log(`[Push Debug] Target UIDs count: ${allowed.length}`);
    console.log(`[Push Debug] FCM Token docs count: ${tokenDocs.length}`);

    const message = {
      notification: {
        title: titleText,
        body: bodyText
      },
      data: {
        title: titleText,
        body:  bodyText,
        link:  String(n.link || "notifs"),
        refId: String(n.refId || ""),
        notifId: String(event.params.id),
        tag:   String(n.refId || event.params.id)
      },
      webpush: {
        notification: {
          title: titleText,
          body: bodyText,
          icon: ICON,
          badge: ICON,
          dir: "rtl",
          lang: "ar"
        },
        headers: {
          Urgency: "high",
          TTL: "86400"
        },
        fcmOptions: { link: deepLinkUrl }
      },
      android: { priority: "high" },
      apns: {
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert"
        },
        payload: {
          aps: {
            alert: {
              title: titleText,
              body: bodyText
            },
            sound: "default"
          }
        }
      }
    };

    const tokens = tokenDocs.map(t => t.token);
    const resp = await messaging.sendEachForMulticast({ ...message, tokens });

    // تنظيف الرموز غير الصالحة تلقائياً
    const toDelete = [];
    resp.responses.forEach((r, i) => {
      if(!r.success){
        const code = r.error?.code || "";
        if(code.includes("registration-token-not-registered") ||
           code.includes("invalid-registration-token") ||
           code.includes("invalid-argument")){
          toDelete.push(tokens[i]);
        }
      }
    });
    await Promise.all(toDelete.map(t =>
      db.collection(COL.tokens).doc(t).delete().catch(()=>{})
    ));

    console.log(`[Push Debug] FCM send result: ${resp.successCount}/${tokens.length} ok, ${toDelete.length} invalid tokens removed`);
  }
);

/* ════════ رفع السيرة الذاتية (CV) إلى Microsoft SharePoint ════════ */
const { onCall, HttpsError } = require("firebase-functions/v2/https");

exports.uploadCvToSharePoint = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const callerUid = request.auth.uid;
  const { targetUserId, fileName, fileBase64, mimeType } = request.data || {};

  if (!targetUserId || !fileName || !fileBase64) {
    throw new HttpsError("invalid-argument", "بيانات الملف غير مكتملة");
  }

  // التحقق من الصلاحيات: الموظف يرفع لنفسه فقط، أو المسؤول / الموارد البشرية / المسؤول التقني
  if (callerUid !== targetUserId) {
    const callerDoc = await db.collection(COL.users).doc(callerUid).get();
    const role = callerDoc.data()?.role;
    const isTechAdmin = callerDoc.data()?.isTechAdmin === true;
    if (!["executive", "hr", "tech_admin"].includes(role) && !isTechAdmin) {
      throw new HttpsError("permission-denied", "غير مصرح لك بتعديل السيرة الذاتية لهذا الموظف");
    }
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID || "5380057d-dc58-45d5-8ae2-230b3ef6a2ef";
  const clientId = process.env.MICROSOFT_CLIENT_ID || "e92632b0-43b5-40a0-a2e7-b3130aca7c35";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const driveId = process.env.MICROSOFT_DRIVE_ID || "b!vag-u0AS6keay7P1gHkP54gtpOO87ZdFmdHyFfCVxqyBUJAhWFk3TrtY3uYtcmis";

  console.log(`[CV] MICROSOFT_TENANT_ID loaded: ${!!(process.env.MICROSOFT_TENANT_ID || tenantId)}`);
  console.log(`[CV] MICROSOFT_CLIENT_ID loaded: ${!!(process.env.MICROSOFT_CLIENT_ID || clientId)}`);
  console.log(`[CV] MICROSOFT_CLIENT_SECRET loaded: ${Boolean(clientSecret)}`);
  console.log(`[CV] typeof MICROSOFT_CLIENT_SECRET: ${typeof clientSecret}`);
  console.log(`[CV] MICROSOFT_CLIENT_SECRET length: ${clientSecret ? clientSecret.length : 0}`);
  console.log(`[CV] MICROSOFT_DRIVE_ID loaded: ${!!(process.env.MICROSOFT_DRIVE_ID || driveId)}`);

  if (!clientSecret) {
    throw new HttpsError("failed-precondition", "مفتاح MICROSOFT_CLIENT_SECRET غير مضبوط في ملف .env الخادمي بعد");
  }

  // 1. طلب رمز الوصول من Microsoft Graph (App-Only Token)
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    scope: "https://graph.microsoft.com/.default",
    client_secret: clientSecret,
    grant_type: "client_credentials"
  });

  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString()
  });

  console.log(`[CV OAuth] Token request status: ${tokenRes.status}`);

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    const safeMsg = errText.replace(new RegExp(clientSecret, 'g'), '[SECRET_REDACTED]');
    console.error(`[CV OAuth Error ${tokenRes.status}]:`, safeMsg);
    throw new HttpsError("internal", `فشل المصادقة مع Microsoft OAuth (HTTP ${tokenRes.status}): ${safeMsg}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  console.log(`[SP Auth] Token status: ${tokenRes.status}`);

  try {
    const payloadBase64 = accessToken.split(".")[1];
    const payloadBuffer = Buffer.from(payloadBase64, "base64");
    const payload = JSON.parse(payloadBuffer.toString("utf8"));
    console.log(`[SP Auth] Token aud: ${payload.aud}`);
    console.log(`[SP Auth] Token appid: ${payload.appid || payload.azp}`);
    console.log(`[SP Auth] Token tid: ${payload.tid}`);
    console.log(`[SP Auth] Token roles: ${JSON.stringify(payload.roles || [])}`);
  } catch (e) {
    console.log("[SP Auth] Could not parse JWT payload claims");
  }

  // 2. اختبار الوصول إلى الـ Drive بحد ذاته
  const driveTestUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}?$select=id,name,webUrl,driveType`;
  const driveRes = await fetch(driveTestUrl, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  console.log(`[SP Drive] GET status: ${driveRes.status}`);
  if (driveRes.ok) {
    const driveInfo = await driveRes.json();
    console.log(`[SP Drive] Name: ${driveInfo.name || "N/A"}`);
  } else {
    const driveErr = await driveRes.text();
    console.error(`[SP Drive Error ${driveRes.status}]:`, driveErr);
  }

  // 3. اختبار الوصول إلى مجلد CV وإنشائه إذا كان غير موجود
  const folderTestUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/CV`;
  const folderRes = await fetch(folderTestUrl, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  console.log(`[SP CV Folder] GET status: ${folderRes.status}`);

  if (!folderRes.ok && folderRes.status === 404) {
    console.log("[SP CV Folder] Folder /CV does not exist yet. Attempting auto-creation...");
    const createFolderUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`;
    const createRes = await fetch(createFolderUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "CV",
        folder: {},
        "@microsoft.graph.conflictBehavior": "replace"
      })
    });
    console.log(`[SP CV Folder Creation] Status: ${createRes.status}`);
  }

  // 4. رفع الملف إلى المجلد المخصص (CV/) في مكتبة SharePoint
  const encodedFileName = encodeURIComponent(fileName);
  const fileBuffer = Buffer.from(fileBase64, "base64");

  const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/CV/${encodedFileName}:/content`;
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": mimeType || "application/octet-stream"
    },
    body: fileBuffer
  });

  console.log(`[SP Upload] POST status: ${uploadRes.status}`);

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    const safeMsg = errText.replace(new RegExp(accessToken, 'g'), '[TOKEN_REDACTED]');
    console.error(`[SP Upload Error ${uploadRes.status}]:`, safeMsg);
    throw new HttpsError("internal", `فشل رفع الملف إلى SharePoint (HTTP ${uploadRes.status}): ${safeMsg}`);
  }

  const item = await uploadRes.json();

  // 3. تجهيز بيانات المرجع لحفظها في Firestore
  const cvObj = {
    provider: "sharepoint",
    name: fileName,
    url: item.webUrl || "https://arthwhdarh.sharepoint.com/DocLib",
    downloadUrl: item["@microsoft.graph.downloadUrl"] || item.webUrl || "https://arthwhdarh.sharepoint.com/DocLib",
    driveItemId: item.id,
    driveId: driveId,
    sharePointPath: `CV/${fileName}`,
    updatedAt: new Date().toISOString()
  };

  await db.collection(COL.users).doc(targetUserId).update({ cv: cvObj });
  console.log(`[SharePoint] CV successfully updated for user: ${targetUserId}`);
  return cvObj;
});

/* ════════ رفع مرفقات المهام إلى Microsoft SharePoint ════════ */
exports.uploadTaskAttachmentToSharePoint = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const callerUid = request.auth.uid;
  const {
    taskType,       // "single" | "group"
    taskId,         // e.g. "task_123"
    subFolder,      // "admin" | "execution"
    employeeUid,    // required for group execution: e.g. "emp_456"
    fileName,
    fileBase64,
    mimeType
  } = request.data || {};

  if (!taskType || !subFolder || !fileName || !fileBase64) {
    throw new HttpsError("invalid-argument", "بيانات رفع مرفق المهمة غير مكتملة");
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID || "5380057d-dc58-45d5-8ae2-230b3ef6a2ef";
  const clientId = process.env.MICROSOFT_CLIENT_ID || "e92632b0-43b5-40a0-a2e7-b3130aca7c35";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const driveId = process.env.MICROSOFT_DRIVE_ID || "b!vag-u0AS6keay7P1gHkP54gtpOO87ZdFmdHyFfCVxqyBUJAhWFk3TrtY3uYtcmis";

  if (!clientSecret) {
    throw new HttpsError("failed-precondition", "مفتاح MICROSOFT_CLIENT_SECRET غير مضبوط في ملف .env الخادمي بعد");
  }

  // 1. OAuth App-Only Token
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    scope: "https://graph.microsoft.com/.default",
    client_secret: clientSecret,
    grant_type: "client_credentials"
  });

  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString()
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("[SharePoint Task OAuth Error]:", errText);
    throw new HttpsError("internal", "فشل الحصول على رمز الوصول من Microsoft Graph");
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // 2. بناء الهيكل المنظم للمجلد في SharePoint:
  // مكتبة ملفات بوابة الموظفين / المهام / (فردية|جماعية) / {taskId} / (المدير|التنفيذ/[employeeUid])
  const typeFolder = taskType === "group" ? "جماعية" : "فردية";
  const effectiveTaskId = taskId || `draft_${Date.now()}`;
  
  let relativePath = "";
  if (subFolder === "admin") {
    relativePath = `المهام/${typeFolder}/${effectiveTaskId}/المدير`;
  } else {
    if (taskType === "group" && employeeUid) {
      relativePath = `المهام/${typeFolder}/${effectiveTaskId}/التنفيذ/${employeeUid}`;
    } else {
      relativePath = `المهام/${typeFolder}/${effectiveTaskId}/التنفيذ`;
    }
  }

  const encodedFileName = encodeURIComponent(fileName);
  const fileBuffer = Buffer.from(fileBase64, "base64");
  const fullPath = `${relativePath}/${encodedFileName}`;
  const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${fullPath}:/content`;

  console.log(`[SP Task Upload] Target Path: ${relativePath}/${fileName}`);

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": mimeType || "application/octet-stream"
    },
    body: fileBuffer
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    const safeMsg = errText.replace(new RegExp(accessToken, 'g'), '[TOKEN_REDACTED]');
    console.error(`[SP Task Upload Error ${uploadRes.status}]:`, safeMsg);
    throw new HttpsError("internal", `فشل رفع مرفق المهمة إلى SharePoint (HTTP ${uploadRes.status}): ${safeMsg}`);
  }

  const item = await uploadRes.json();

  const attachmentObj = {
    provider: "sharepoint",
    name: fileName,
    url: item.webUrl || "https://arthwhdarh.sharepoint.com/DocLib",
    downloadUrl: item["@microsoft.graph.downloadUrl"] || item.webUrl || "https://arthwhdarh.sharepoint.com/DocLib",
    driveItemId: item.id,
    driveId: driveId,
    sharePointPath: `${relativePath}/${fileName}`,
    mimeType: mimeType || item.file?.mimeType || "",
    size: item.size || 0,
    updatedAt: new Date().toISOString()
  };

  console.log(`[SP Task Upload Success] File "${fileName}" stored in ${relativePath}`);
  return attachmentObj;
});

/* ════════ رفع مرفقات التعميمات إلى Microsoft SharePoint ════════ */
exports.uploadAnnouncementAttachmentToSharePoint = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const {
    announcementId,
    fileName,
    fileBase64,
    mimeType
  } = request.data || {};

  if (!fileName || !fileBase64) {
    throw new HttpsError("invalid-argument", "بيانات رفع مرفق التعميم غير مكتملة");
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID || "5380057d-dc58-45d5-8ae2-230b3ef6a2ef";
  const clientId = process.env.MICROSOFT_CLIENT_ID || "e92632b0-43b5-40a0-a2e7-b3130aca7c35";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const driveId = process.env.MICROSOFT_DRIVE_ID || "b!vag-u0AS6keay7P1gHkP54gtpOO87ZdFmdHyFfCVxqyBUJAhWFk3TrtY3uYtcmis";

  if (!clientSecret) {
    throw new HttpsError("failed-precondition", "مفتاح MICROSOFT_CLIENT_SECRET غير مضبوط");
  }

  // 1. OAuth App-Only Token
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    scope: "https://graph.microsoft.com/.default",
    client_secret: clientSecret,
    grant_type: "client_credentials"
  });

  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString()
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("[SharePoint Announcement OAuth Error]:", errText);
    throw new HttpsError("internal", "فشل الحصول على رمز الوصول من Microsoft Graph");
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // 2. المسار في SharePoint:
  // مكتبة ملفات بوابة الموظفين / التعميمات / {announcementId} / {fileName}
  const effectiveAnnouncementId = announcementId || `ann_${Date.now()}`;
  const relativePath = `التعميمات/${effectiveAnnouncementId}`;

  const encodedFileName = encodeURIComponent(fileName);
  const fileBuffer = Buffer.from(fileBase64, "base64");
  const fullPath = `${relativePath}/${encodedFileName}`;
  const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${fullPath}:/content`;

  console.log(`[SP Announcement Upload] Target Path: ${relativePath}/${fileName}`);

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": mimeType || "application/octet-stream"
    },
    body: fileBuffer
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    const safeMsg = errText.replace(new RegExp(accessToken, 'g'), '[TOKEN_REDACTED]');
    console.error(`[SP Announcement Upload Error ${uploadRes.status}]:`, safeMsg);
    throw new HttpsError("internal", `فشل رفع مرفق التعميم إلى SharePoint (HTTP ${uploadRes.status}): ${safeMsg}`);
  }

  const item = await uploadRes.json();

  const attachmentObj = {
    provider: "sharepoint",
    name: fileName,
    url: item.webUrl || "https://arthwhdarh.sharepoint.com/DocLib",
    downloadUrl: item["@microsoft.graph.downloadUrl"] || item.webUrl || "https://arthwhdarh.sharepoint.com/DocLib",
    driveItemId: item.id,
    driveId: driveId,
    sharePointPath: `${relativePath}/${fileName}`,
    mimeType: mimeType || item.file?.mimeType || "",
    size: item.size || 0,
    updatedAt: new Date().toISOString()
  };

  console.log(`[SP Announcement Upload Success] File "${fileName}" stored in ${relativePath}`);
  return attachmentObj;
});
