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
async function resolveUids(userId){
  if(!userId) return [];
  if(userId.startsWith("dept:")){
    const dept = userId.slice(5);
    // الإدارة التنفيذية ترى الكل؛ غيرها حسب الدور
    const snap = await db.collection(COL.users)
      .where("role", "in", dept === "executive"
        ? ["executive"]
        : [dept, "executive"])  // التنفيذي يستقبل أيضاً إشعارات الإدارات
      .get();
    return snap.docs.map(d => d.id);
  }
  return [userId];
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

    const uids = await resolveUids(n.userId);
    if(!uids.length){ console.log("no target uids for", n.userId); return; }

    // ترشيح حسب التفضيلات
    const allowed = [];
    for(const uid of uids){
      if(await prefAllows(uid, n.pref)) allowed.push(uid);
    }
    if(!allowed.length){ console.log("all recipients opted out of", n.pref); return; }

    const tokenDocs = await tokensForUids(allowed);
    if(!tokenDocs.length){ console.log("no tokens for recipients"); return; }

    const message = {
      notification: { title: n.title || "إرث وحضارة", body: n.body || "" },
      data: {
        title: String(n.title || ""),
        body:  String(n.body || ""),
        link:  String(n.link || "notifs"),
        refId: String(n.refId || ""),
        notifId: String(event.params.id),
        tag:   String(n.refId || event.params.id)
      },
      webpush: {
        notification: { icon: ICON, badge: ICON, dir: "rtl", lang: "ar" },
        fcmOptions: { link: "/portal/" }
      },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } }
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

    console.log(`push sent: ${resp.successCount}/${tokens.length} ok, ${toDelete.length} invalid removed`);
  }
);
