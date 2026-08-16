/* ══════════════════════════════════════════════════════════
   Cloudflare Worker — مُرسِل إشعارات الدفع (بديل Cloud Functions)
   جمعية إرث وحضارة بالقريات · البوابة الداخلية
   ──────────────────────────────────────────────────────────
   يعمل على خطة Spark المجانية بلا ترقية Blaze. يحمل مفتاح حساب
   الخدمة (Service Account) سرّاً، ويستقبل نداءً من الواجهة بعد
   كتابة الإشعار، فيُرسل دفعاً عبر FCM HTTP v1 إلى أجهزة المستهدفين.

   تدفّق العمل:
     الواجهة → تكتب portal_notifications  (مصدر الحقيقة، يعمل دائماً)
            → تنادي هذا الـ Worker بـ { notifId }
     Worker  → يقرأ الإشعار + الرموز من Firestore REST
            → يُرسل FCM v1 (موقّعاً بـ JWT من حساب الخدمة)
            → يحذف الرموز الباطلة

   الأسرار (Secrets) تُضبط عبر:  wrangler secret put ...
     SERVICE_ACCOUNT   ← JSON كامل لحساب الخدمة
   المتغيّرات العامة في wrangler.toml:
     PROJECT_ID, ALLOWED_ORIGIN
══════════════════════════════════════════════════════════ */

const COL = { users: "portal_users", tokens: "portal_fcm_tokens", notifications: "portal_notifications" };
const ICON = "/assets/الشعار/الشعار.png";

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")
      return json({ error: "method-not-allowed" }, 405, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "bad-json" }, 400, cors); }

    const notifId = String(body.notifId || "").trim();
    if (!notifId) return json({ error: "missing-notifId" }, 400, cors);

    try {
      const token = await getAccessToken(env);             // OAuth للوصول لـ Firestore + FCM
      const result = await sendForNotification(env, token, notifId);
      return json({ ok: true, ...result }, 200, cors);
    } catch (e) {
      console.error("worker error:", e?.message || e);
      return json({ ok: false, error: String(e?.message || e) }, 500, cors);
    }
  }
};

/* ═══════════ منطق الإرسال (مطابق لمنطق Cloud Function) ═══════════ */
async function sendForNotification(env, accessToken, notifId) {
  const pid = env.PROJECT_ID;

  // 1) اقرأ مستند الإشعار
  const n = await fsGet(pid, accessToken, `${COL.notifications}/${notifId}`);
  if (!n) return { skipped: "notification-not-found" };

  // 2) حُلّ المستهدفين
  const uids = await resolveUids(pid, accessToken, n.userId);
  if (!uids.length) return { skipped: "no-uids" };

  // 3) رشّح حسب التفضيلات
  const allowed = [];
  for (const uid of uids) {
    if (await prefAllows(pid, accessToken, uid, n.pref)) allowed.push(uid);
  }
  if (!allowed.length) return { skipped: "opted-out" };

  // 4) اجلب الرموز
  const tokenDocs = await tokensForUids(pid, accessToken, allowed);
  if (!tokenDocs.length) return { skipped: "no-tokens" };

  // 5) أرسل لكل رمز عبر FCM v1
  let success = 0, removed = 0;
  await Promise.all(tokenDocs.map(async (td) => {
    const res = await sendFcm(pid, accessToken, td.token, n, notifId);
    if (res.ok) { success++; return; }
    if (res.invalid) {
      removed++;
      await fsDelete(pid, accessToken, `${COL.tokens}/${td.token}`).catch(() => {});
    }
  }));

  return { recipients: allowed.length, tokens: tokenDocs.length, success, removed };
}

/* رسالة FCM HTTP v1 — نفس بنية حمولة الدالة الأصلية */
async function sendFcm(pid, accessToken, token, n, notifId) {
  const message = {
    message: {
      token,
      notification: { title: n.title || "إرث وحضارة", body: n.body || "" },
      data: {
        title: String(n.title || ""),
        body: String(n.body || ""),
        link: String(n.link || "notifs"),
        refId: String(n.refId || ""),
        notifId: String(notifId),
        tag: String(n.refId || notifId)
      },
      webpush: {
        notification: {
          title: n.title || "إرث وحضارة",
          body: n.body || "",
          icon: ICON,
          badge: ICON,
          dir: "rtl",
          lang: "ar"
        },
        fcm_options: { link: "/portal/" }
      },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } }
    }
  };

  const r = await fetch(
    `https://fcm.googleapis.com/v1/projects/${pid}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(message)
    }
  );

  if (r.ok) return { ok: true };
  const errText = await r.text();
  // رموز الأخطاء التي تعني أن الرمز باطل ويجب حذفه
  const invalid = /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(errText);
  console.warn("fcm send failed:", r.status, errText.slice(0, 160));
  return { ok: false, invalid };
}

/* ═══════════ حلّ المستهدفين والتفضيلات ═══════════ */
async function resolveUids(pid, accessToken, userId) {
  if (!userId) return [];
  if (userId.startsWith("dept:")) {
    const dept = userId.slice(5);
    const users = await fsListDocuments(pid, accessToken, COL.users);
    if (dept === "all") {
      return users.map(u => u.__name);
    }
    return users.filter(u => {
      if (dept === "hr") {
        return u.role === "hr" || u.department === "hr" || (u.perms && u.perms.canReviewLeave);
      }
      if (dept === "executive") {
        return u.role === "executive";
      }
      return u.department === dept || u.role === dept;
    }).map(u => u.__name);
  }
  return [userId];
}

async function fsListDocuments(pid, accessToken, collection) {
  const r = await fetch(
    `${fsBase(pid)}/${collection}?pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!r.ok) {
    const errText = await r.text();
    console.error(`fsListDocuments failed: ${r.status}`, errText);
    return [];
  }
  const data = await r.json();
  const docs = data.documents || [];
  const out = [];
  for (const doc of docs) {
    const obj = decodeFields(doc.fields) || {};
    obj.__name = doc.name.split("/").pop();
    out.push(obj);
  }
  return out;
}

async function prefAllows(pid, accessToken, uid, pref) {
  if (!pref) return true;
  const u = await fsGet(pid, accessToken, `${COL.users}/${uid}`);
  const prefs = u?.notifPrefs;
  if (!prefs) return true;
  return prefs[pref] !== false;
}

async function tokensForUids(pid, accessToken, uids) {
  const out = [];
  for (let i = 0; i < uids.length; i += 10) {
    const chunk = uids.slice(i, i + 10);
    const docs = await fsQuery(pid, accessToken, COL.tokens, {
      fieldFilter: { field: "uid", op: "IN", values: chunk.map(stringValue) }
    });
    docs.forEach(d => out.push({ token: d.__name, uid: d.uid }));
  }
  return out;
}

/* ═══════════ Firestore REST (بدون Admin SDK) ═══════════ */
function fsBase(pid) {
  return `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;
}

async function fsGet(pid, accessToken, path) {
  const r = await fetch(`${fsBase(pid)}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`fsGet ${path}: ${r.status}`);
  const doc = await r.json();
  return decodeFields(doc.fields);
}

async function fsDelete(pid, accessToken, path) {
  await fetch(`${fsBase(pid)}/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

async function fsQuery(pid, accessToken, collection, { fieldFilter }) {
  const where = {
    fieldFilter: {
      field: { fieldPath: fieldFilter.field },
      op: fieldFilter.op,
      value: { arrayValue: { values: fieldFilter.values } }
    }
  };
  const r = await fetch(`${fsBase(pid)}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: collection }], where }
    })
  });
  if (!r.ok) throw new Error(`fsQuery ${collection}: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  const out = [];
  for (const row of rows) {
    if (!row.document) continue;
    const obj = decodeFields(row.document.fields) || {};
    obj.__name = row.document.name.split("/").pop();
    out.push(obj);
  }
  return out;
}

function stringValue(s) { return { stringValue: String(s) }; }

/* فكّ ترميز حقول Firestore REST إلى كائن JS */
function decodeFields(fields) {
  if (!fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}
function decodeValue(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.nullValue !== undefined) return null;
  if (v.mapValue !== undefined) return decodeFields(v.mapValue.fields) || {};
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(decodeValue);
  return null;
}

/* ═══════════ OAuth: JWT موقّع من حساب الخدمة → access_token ═══════════ */
let _tokenCache = { token: null, exp: 0 };
let _saCache = null;

/* تحميل حساب الخدمة بمرونة تتحمّل أخطاء اللصق الشائعة.
   يدعم ثلاث صيغ للسرّ SERVICE_ACCOUNT:
     1) JSON صحيح (الأفضل).
     2) JSON تسرّبت فيه أسطر حقيقية داخل private_key (يُصلَح تلقائياً).
     3) JSON كامل مُرمّز Base64 (الأكثر أماناً — بلا أي أسطر) عبر
        السرّ البديل SERVICE_ACCOUNT_B64. */
function loadServiceAccount(env) {
  if (_saCache) return _saCache;

  // مسار بديل: base64 (لا يحوي أسطراً إطلاقاً ⇒ لا يتكسّر أبداً)
  if (env.SERVICE_ACCOUNT_B64) {
    try {
      const jsonText = new TextDecoder().decode(
        Uint8Array.from(atob(env.SERVICE_ACCOUNT_B64.trim()), c => c.charCodeAt(0))
      );
      _saCache = JSON.parse(jsonText);
      console.log("[SA] loaded from SERVICE_ACCOUNT_B64 ✓");
      return validateSA(_saCache);
    } catch (e) {
      console.error("[SA] SERVICE_ACCOUNT_B64 decode/parse failed:", e?.message);
      throw new Error("SERVICE_ACCOUNT_B64 غير صالح — تأكّد أنه Base64 لملف JSON كامل");
    }
  }

  const raw = env.SERVICE_ACCOUNT;
  if (!raw || typeof raw !== "string") {
    throw new Error("السرّ SERVICE_ACCOUNT مفقود — اضبطه بـ wrangler secret put");
  }

  console.log("[SA] raw length =", raw.length,
    "· has CR =", raw.includes("\r"),
    "· has raw LF =", /[\n]/.test(raw));

  // محاولة ١: تحليل مباشر
  try {
    _saCache = JSON.parse(raw);
    console.log("[SA] parsed directly ✓");
    return validateSA(_saCache);
  } catch (e1) {
    console.warn("[SA] direct JSON.parse failed:", e1?.message);
  }

  // محاولة ٢: إصلاح الأسطر/المسافات الحقيقية داخل قيم السلاسل.
  // السبب الأشهر لـ "Unterminated string": أسطر فعلية داخل private_key.
  try {
    const repaired = repairJsonControlChars(raw);
    _saCache = JSON.parse(repaired);
    console.log("[SA] parsed after control-char repair ✓ (كان هناك أسطر فعلية داخل JSON)");
    return validateSA(_saCache);
  } catch (e2) {
    console.error("[SA] repair attempt failed:", e2?.message);
    throw new Error(
      "تعذّر تحليل SERVICE_ACCOUNT: " + (e2?.message || e2) +
      " — يُفضّل استخدام SERVICE_ACCOUNT_B64 (انظر README)."
    );
  }
}

/* يهرّب أحرف التحكّم (سطر/مسافة/تبويب) الموجودة *داخل* قيم السلاسل في JSON.
   يمرّ حرفاً حرفاً ويتتبّع إن كنا داخل سلسلة، فيحوّل 0x0A/0x0D/0x09 الخام
   إلى \n \r \t الصالحة، دون المساس بالأحرف خارج السلاسل. */
function repairJsonControlChars(s) {
  let out = "";
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === "\\") { out += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
    }
    out += ch;
  }
  return out;
}

/* تأكيد وجود الحقول الحرجة + تطبيع private_key */
function validateSA(sa) {
  if (!sa.client_email) throw new Error("حساب الخدمة بلا client_email");
  if (!sa.private_key)  throw new Error("حساب الخدمة بلا private_key");
  // إن بقيت \n كنص (مزدوجة التهريب)، طبّعها إلى أسطر فعلية لـ PEM
  if (sa.private_key.includes("\\n")) {
    sa.private_key = sa.private_key.replace(/\\n/g, "\n");
    console.log("[SA] normalized escaped \\n in private_key");
  }
  const head = sa.private_key.slice(0, 27);
  console.log("[SA] validated ✓ · key starts:", head);
  return sa;
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (_tokenCache.token && _tokenCache.exp - 60 > now) return _tokenCache.token;

  const sa = loadServiceAccount(env);
  const scope = [
    "https://www.googleapis.com/auth/datastore",
    "https://www.googleapis.com/auth/firebase.messaging"
  ].join(" ");

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  console.log("[SA] JWT claim built · iss =", sa.client_email);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const key = await importPrivateKey(sa.private_key);
  console.log("[SA] private key imported OK");
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!r.ok) throw new Error(`oauth: ${r.status} ${await r.text()}`);
  const data = await r.json();
  _tokenCache = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return _tokenCache.token;
}

async function importPrivateKey(pem) {
  if (!pem || !/BEGIN PRIVATE KEY/.test(pem)) {
    throw new Error("private_key لا يحوي ترويسة PEM صحيحة (-----BEGIN PRIVATE KEY-----)");
  }
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  let der;
  try {
    der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  } catch (e) {
    console.error("[SA] atob(private_key body) failed — جسم المفتاح ليس Base64 صالحاً:", e?.message);
    throw new Error("جسم private_key ليس Base64 صالحاً — تحقّق من سلامة اللصق");
  }
  try {
    return await crypto.subtle.importKey(
      "pkcs8", der.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false, ["sign"]
    );
  } catch (e) {
    console.error("[SA] importKey failed:", e?.message);
    throw new Error("فشل استيراد private_key (تنسيق pkcs8) — قد يكون المفتاح مقصوصاً");
  }
}

function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ═══════════ مساعدات HTTP ═══════════ */
function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}
