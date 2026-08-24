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

    console.log(`[Push Trace] Notification created: ${event.params.id}`);
    console.log(`[Push Trace] Function triggered`);

    const uids = await resolveUids(n.userId, n.excludeUid);
    if(!uids.length){
      console.log(`[Push Trace] Target UIDs: 0`);
      return;
    }

    // ترشيح حسب التفضيلات
    const allowed = [];
    for(const uid of uids){
      if(await prefAllows(uid, n.pref)) allowed.push(uid);
    }
    console.log(`[Push Trace] Target UIDs: ${allowed.length}`);
    if(!allowed.length){ return; }

    const tokenDocs = await tokensForUids(allowed);
    console.log(`[Push Trace] Tokens found: ${tokenDocs.length}`);
    if(!tokenDocs.length){ return; }

    const titleText = String(n.title || "إرث وحضارة");
    const bodyText = String(n.body || "");
    const deepLinkUrl = `/portal/#${n.link || "notifs"}${n.refId ? ":" + n.refId : ""}`;

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

    console.log(`[Push Trace] Sending FCM...`);
    const tokens = tokenDocs.map(t => t.token);
    const resp = await messaging.sendEachForMulticast({ ...message, tokens });

    console.log(`[Push Trace] FCM success: ${resp.successCount}`);
    console.log(`[Push Trace] FCM failure: ${resp.failureCount}`);

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
    if(toDelete.length > 0){
      await Promise.all(toDelete.map(t =>
        db.collection(COL.tokens).doc(t).delete().catch(()=>{})
      ));
      console.log(`[Push Trace] Cleaned ${toDelete.length} invalid tokens`);
    }
  }
);

/* ════════ رفع المرفقات وإدارتها عبر Microsoft SharePoint ════════ */
const { onCall, HttpsError } = require("firebase-functions/v2/https");

async function uploadToSharePointInternal(relativePath, fileName, fileBase64, mimeType) {
  const tenantId = process.env.MICROSOFT_TENANT_ID || "5380057d-dc58-45d5-8ae2-230b3ef6a2ef";
  const clientId = process.env.MICROSOFT_CLIENT_ID || "e92632b0-43b5-40a0-a2e7-b3130aca7c35";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const driveId = process.env.MICROSOFT_DRIVE_ID || "b!vag-u0AS6keay7P1gHkP54gtpOO87ZdFmdHyFfCVxqyBUJAhWFk3TrtY3uYtcmis";

  if (!clientSecret) {
    throw new HttpsError("failed-precondition", "مفتاح MICROSOFT_CLIENT_SECRET غير مضبوط في ملف .env الخادمي بعد");
  }

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
    const safeMsg = errText.replace(new RegExp(clientSecret, 'g'), '[SECRET_REDACTED]');
    console.error(`[SP OAuth Error ${tokenRes.status}]:`, safeMsg);
    throw new HttpsError("internal", `فشل المصادقة مع Microsoft OAuth (HTTP ${tokenRes.status}): ${safeMsg}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  const encodedFileName = encodeURIComponent(fileName);
  const fileBuffer = Buffer.from(fileBase64, "base64");
  const fullPath = `${relativePath}/${encodedFileName}`;
  const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${fullPath}:/content`;

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
    console.error(`[SP Upload Error ${uploadRes.status}]:`, safeMsg);
    throw new HttpsError("internal", `فشل رفع الملف إلى SharePoint (HTTP ${uploadRes.status}): ${safeMsg}`);
  }

  const item = await uploadRes.json();

  return {
    provider: "sharepoint",
    name: fileName,
    url: item.webUrl || "https://arthwhdarh.sharepoint.com/DocLib",
    downloadUrl: item["@microsoft.graph.downloadUrl"] || item.webUrl || "https://arthwhdarh.sharepoint.com/DocLib",
    driveItemId: item.id,
    driveId: driveId,
    sharePointPath: fullPath,
    mimeType: mimeType || item.file?.mimeType || "",
    size: item.size || 0,
    updatedAt: new Date().toISOString()
  };
}

const allowedCorsOrigins = [
  "https://arthwhdarh.com",
  "https://www.arthwhdarh.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:5001",
  "http://127.0.0.1:5001",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/
];

const sharePointCorsOptions = {
  cors: allowedCorsOrigins
};

/* 1. رفع السيرة الذاتية (CV) إلى SharePoint */
exports.uploadCvToSharePoint = onCall(sharePointCorsOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const callerUid = request.auth.uid;
  const { targetUserId, fileName, fileBase64, mimeType } = request.data || {};

  if (!targetUserId || !fileName || !fileBase64) {
    throw new HttpsError("invalid-argument", "بيانات الملف غير مكتملة");
  }

  if (callerUid !== targetUserId) {
    const callerDoc = await db.collection(COL.users).doc(callerUid).get();
    const role = callerDoc.data()?.role;
    const isTechAdmin = callerDoc.data()?.isTechAdmin === true;
    if (!["executive", "hr", "tech_admin"].includes(role) && !isTechAdmin) {
      throw new HttpsError("permission-denied", "غير مصرح لك بتعديل السيرة الذاتية لهذا الموظف");
    }
  }

  const relativePath = `الموظفون/${targetUserId}/السيرة الذاتية`;
  const cvObj = await uploadToSharePointInternal(relativePath, fileName, fileBase64, mimeType);

  await db.collection(COL.users).doc(targetUserId).update({ cv: cvObj });
  console.log(`[SharePoint] CV successfully updated for user: ${targetUserId}`);
  return cvObj;
});

/* 2. رفع الصورة الشخصية (Avatar) إلى SharePoint */
exports.uploadAvatarToSharePoint = onCall(sharePointCorsOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const callerUid = request.auth.uid;
  const { targetUserId, fileName, fileBase64, mimeType } = request.data || {};

  if (!targetUserId || !fileName || !fileBase64) {
    throw new HttpsError("invalid-argument", "بيانات الصورة غير مكتملة");
  }

  if (callerUid !== targetUserId) {
    const callerDoc = await db.collection(COL.users).doc(callerUid).get();
    const role = callerDoc.data()?.role;
    const isTechAdmin = callerDoc.data()?.isTechAdmin === true;
    if (!["executive", "hr", "tech_admin"].includes(role) && !isTechAdmin) {
      throw new HttpsError("permission-denied", "غير مصرح لك بتعديل صورة هذا الموظف");
    }
  }

  const relativePath = `الموظفون/${targetUserId}/الصورة الشخصية`;
  const avatarObj = await uploadToSharePointInternal(relativePath, fileName, fileBase64, mimeType);

  await db.collection(COL.users).doc(targetUserId).update({
    avatar: avatarObj.downloadUrl || avatarObj.url,
    avatarObj: avatarObj
  });

  console.log(`[SharePoint] Avatar successfully updated for user: ${targetUserId}`);
  return avatarObj;
});

/* 3. رفع شهادات الدورات إلى SharePoint */
exports.uploadCourseCertToSharePoint = onCall(sharePointCorsOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const callerUid = request.auth.uid;
  const { targetUserId, fileName, fileBase64, mimeType } = request.data || {};

  if (!fileName || !fileBase64) {
    throw new HttpsError("invalid-argument", "بيانات الشهادة غير مكتملة");
  }

  const effectiveUid = targetUserId || callerUid;

  if (callerUid !== effectiveUid) {
    const callerDoc = await db.collection(COL.users).doc(callerUid).get();
    const role = callerDoc.data()?.role;
    const isTechAdmin = callerDoc.data()?.isTechAdmin === true;
    if (!["executive", "hr", "tech_admin"].includes(role) && !isTechAdmin) {
      throw new HttpsError("permission-denied", "غير مصرح لك بإضافة شهادات لهذا الموظف");
    }
  }

  const relativePath = `الموظفون/${effectiveUid}/الشهادات`;
  return await uploadToSharePointInternal(relativePath, fileName, fileBase64, mimeType);
});

/* 4. رفع مرفقات الإجازات إلى SharePoint */
exports.uploadLeaveAttachmentToSharePoint = onCall(sharePointCorsOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const callerUid = request.auth.uid;
  const { fileName, fileBase64, mimeType } = request.data || {};

  if (!fileName || !fileBase64) {
    throw new HttpsError("invalid-argument", "بيانات مرفق الإجازة غير مكتملة");
  }

  const currentYear = new Date().getFullYear();
  const relativePath = `الإجازات/${currentYear}/${callerUid}`;
  return await uploadToSharePointInternal(relativePath, fileName, fileBase64, mimeType);
});

/* 5. رفع الملفات العامة (portal_files) إلى SharePoint */
exports.uploadGeneralFileToSharePoint = onCall(sharePointCorsOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const { fileName, fileBase64, mimeType, department } = request.data || {};

  if (!fileName || !fileBase64) {
    throw new HttpsError("invalid-argument", "بيانات الملف غير مكتملة");
  }

  const currentYear = new Date().getFullYear();
  const deptFolder = department || "عام";
  const relativePath = `الملفات العامة/${currentYear}/${deptFolder}`;
  return await uploadToSharePointInternal(relativePath, fileName, fileBase64, mimeType);
});

/* 6. رفع مرفقات الشكاوى والاقتراحات إلى SharePoint */
exports.uploadSuggestionAttachmentToSharePoint = onCall(sharePointCorsOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const { fileName, fileBase64, mimeType } = request.data || {};

  if (!fileName || !fileBase64) {
    throw new HttpsError("invalid-argument", "بيانات المرفق غير مكتملة");
  }

  const currentYear = new Date().getFullYear();
  const relativePath = `الشكاوى والاقتراحات/${currentYear}`;
  return await uploadToSharePointInternal(relativePath, fileName, fileBase64, mimeType);
});

/* 7. رفع مرفقات المهام إلى Microsoft SharePoint */
exports.uploadTaskAttachmentToSharePoint = onCall(sharePointCorsOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const {
    taskType,
    taskId,
    subFolder,
    employeeUid,
    fileName,
    fileBase64,
    mimeType
  } = request.data || {};

  if (!taskType || !subFolder || !fileName || !fileBase64) {
    throw new HttpsError("invalid-argument", "بيانات رفع مرفق المهمة غير مكتملة");
  }

  const typeFolder = taskType === "group" ? "جماعية" : "فردية";
  const effectiveTaskId = taskId || `draft_${Date.now()}`;
  const currentYear = new Date().getFullYear();
  
  let relativePath = "";
  if (subFolder === "admin") {
    relativePath = `المهام/${currentYear}/${typeFolder}/${effectiveTaskId}/المدير`;
  } else {
    if (taskType === "group" && employeeUid) {
      relativePath = `المهام/${currentYear}/${typeFolder}/${effectiveTaskId}/التنفيذ/${employeeUid}`;
    } else {
      relativePath = `المهام/${currentYear}/${typeFolder}/${effectiveTaskId}/التنفيذ`;
    }
  }

  return await uploadToSharePointInternal(relativePath, fileName, fileBase64, mimeType);
});

/* 8. رفع مرفقات التعميمات إلى Microsoft SharePoint */
exports.uploadAnnouncementAttachmentToSharePoint = onCall(sharePointCorsOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const { announcementId, fileName, fileBase64, mimeType } = request.data || {};

  if (!fileName || !fileBase64) {
    throw new HttpsError("invalid-argument", "بيانات رفع مرفق التعميم غير مكتملة");
  }

  const effectiveAnnouncementId = announcementId || `ann_${Date.now()}`;
  const currentYear = new Date().getFullYear();
  const relativePath = `التعميمات/${currentYear}/${effectiveAnnouncementId}`;

  return await uploadToSharePointInternal(relativePath, fileName, fileBase64, mimeType);
});

/* 9. المحرك الخادمي المشترك لتوليد مستندات PDF عبر Puppeteer / Headless Chromium */
async function executePuppeteerPdfRender(htmlString, customOptions = {}) {
  if (!htmlString) {
    throw new HttpsError("invalid-argument", "محتوى مستند HTML غير متوفر");
  }

  let browser = null;
  try {
    const puppeteer = require("puppeteer");

    const launchConfig = {
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--font-render-hinting=none"
      ],
      headless: "new"
    };

    let resolvedExecPath = undefined;

    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
      resolvedExecPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else if (typeof puppeteer.executablePath === "function") {
      try {
        const p = puppeteer.executablePath();
        if (p && fs.existsSync(p)) {
          resolvedExecPath = p;
        }
      } catch (e) {}
    }

    if (!resolvedExecPath) {
      const fallbackPaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium"
      ];
      resolvedExecPath = fallbackPaths.find(fp => fs.existsSync(fp));
    }

    if (resolvedExecPath) {
      launchConfig.executablePath = resolvedExecPath;
      console.log("[Puppeteer Engine] Launching browser at executablePath:", resolvedExecPath);
    }

    browser = await puppeteer.launch(launchConfig);
    const page = await browser.newPage();

    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.setContent(htmlString, { waitUntil: ["load", "networkidle0"] });

    // الانتظار الجازم لاكتمال تحميل الخطوط في صفحة Chromium
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch(e){}
      }
    });

    const pdfOptions = {
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      ...customOptions
    };

    const pdfBuffer = await page.pdf(pdfOptions);

    return {
      pdfBase64: Buffer.from(pdfBuffer).toString("base64")
    };
  } catch (err) {
    console.error("[Puppeteer Engine Error]:", err);
    throw new HttpsError("internal", `فشل توليد المستند عبر Puppeteer Chromium: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

exports.renderPdfWithPuppeteer = onCall(sharePointCorsOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const { htmlString, pdfOptions } = request.data || {};
  return await executePuppeteerPdfRender(htmlString, pdfOptions);
});

exports.renderLeaveRequestPdfWithPuppeteer = onCall(sharePointCorsOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً للوصول إلى الخدمة");
  }

  const { htmlString, pdfOptions } = request.data || {};
  return await executePuppeteerPdfRender(htmlString, pdfOptions);
});


