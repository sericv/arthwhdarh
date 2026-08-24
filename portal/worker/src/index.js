/* ══════════════════════════════════════════════════════════
   Cloudflare Worker — مُرسِل إشعارات الدفع (FCM Push Notifications)
   جمعية إرث وحضارة بالقريات · البوابة الداخلية
   ──────────────────────────────────────────────────────────
   يعمل على خطة Cloudflare Worker المجانية / الإنتاجية.
   يحمل مفتاح حساب الخدمة (Service Account) سرّاً في الخادم،
   ويستقبل نداءات الإشعارات من الواجهة ليُرسل دفعاً عبر FCM HTTP v1.

   الأسرار (Secrets) تُضبط عبر: wrangler secret put SERVICE_ACCOUNT
══════════════════════════════════════════════════════════ */

const COL = {
  users: "portal_users",
  tokens: "portal_fcm_tokens",
  notifications: "portal_notifications"
};
const ICON = "/assets/الشعار/الشعار.png";

export default {
  async fetch(request, env) {
    const startTime = Date.now();
    const cors = corsHeaders(env);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "method-not-allowed" }, 405, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "bad-json" }, 400, cors); }

    const notifId = String(body.notifId || "").trim();
    if (!notifId) return json({ error: "missing-notifId" }, 400, cors);

    const reqId = notifId.slice(0, 6) + '-' + Math.random().toString(36).slice(2, 6);
    console.log(`[Push Trace 1][ID=${reqId}] Request received for notifId: ${notifId}`);

    try {
      const token = await getAccessToken(env);
      const result = await sendForNotification(env, token, notifId, reqId);
      const duration = Date.now() - startTime;
      console.log(`[Push Summary][ID=${reqId}] success: ${result.success}, failure: ${result.failure}, duration: ${duration}ms`);
      return json({ ok: true, reqId, notifId, ...result, durationMs: duration }, 200, cors);
    } catch (e) {
      const duration = Date.now() - startTime;
      console.error(`[Push Trace Error][ID=${reqId}] worker error:`, e?.message || e);
      return json({ ok: false, reqId, notifId, error: String(e?.message || e), durationMs: duration }, 500, cors);
    }
  }
};

/* ═══════════ منطق الإرسال مع التتبع المرحلي ═══════════ */
async function sendForNotification(env, accessToken, notifId, reqId) {
  const sa = loadServiceAccount(env);
  const pid = env?.PROJECT_ID || sa?.project_id || "arthwhdarh-782ec";

  const n = await fsGet(pid, accessToken, `${COL.notifications}/${notifId}`);
  if (!n) {
    console.log(`[Push Trace 2][ID=${reqId}] Notification not found: ${notifId}`);
    return { skipped: "notification-not-found", success: 0, failure: 0, removed: 0 };
  }

  console.log(`[Push Trace 2][ID=${reqId}] Notification ID: ${notifId} | Type: ${n.type || "general"} | Target: ${n.userId || "N/A"} | Exclude UID: ${n.excludeUid || "none"}`);

  const uids = await resolveUids(pid, accessToken, n.userId, n.excludeUid);
  console.log(`[Push Trace 3][ID=${reqId}] Target UIDs resolved: COUNT = ${uids.length}`);
  if (!uids.length) return { skipped: "no-uids", success: 0, failure: 0, removed: 0 };

  const allowed = [];
  for (const uid of uids) {
    if (await prefAllows(pid, accessToken, uid, n.pref)) allowed.push(uid);
  }
  if (!allowed.length) {
    console.log(`[Push Trace 3][ID=${reqId}] All recipients opted out of pref: ${n.pref}`);
    return { skipped: "opted-out", success: 0, failure: 0, removed: 0 };
  }

  const tokenDocs = await tokensForUids(pid, accessToken, allowed);
  console.log(`[Push Trace 4][ID=${reqId}] FCM tokens found: COUNT = ${tokenDocs.length}`);
  if (!tokenDocs.length) return { skipped: "no-tokens", success: 0, failure: 0, removed: 0 };

  let successCount = 0;
  let failureCount = 0;
  const staleTokens = [];

  for (let i = 0; i < tokenDocs.length; i++) {
    const item = tokenDocs[i];
    const res = await sendFcmV1Message(pid, accessToken, item.token, n, notifId, reqId, i + 1);
    if (res.ok) {
      successCount++;
    } else {
      failureCount++;
      if (res.invalid) staleTokens.push(item.token);
    }
  }

  if (staleTokens.length) {
    for (const t of staleTokens) {
      await fsDelete(pid, accessToken, `${COL.tokens}/${t}`).catch(() => {});
    }
  }

  return { success: successCount, failure: failureCount, removed: staleTokens.length };
}

async function sendFcmV1Message(pid, accessToken, targetToken, n, notifId, reqId, idx) {
  const tokenPrefix = targetToken.slice(0, 8) + "...";
  const titleText = String(n.title || "تنبيه من البوابة");
  const bodyText = String(n.body || n.text || "");
  const deepLinkUrl = String(n.link || "notifs");

  const message = {
    message: {
      token: targetToken,
      data: {
        title: titleText,
        body: bodyText,
        link: String(n.link || "notifs"),
        refId: String(n.refId || ""),
        notifId: String(notifId),
        tag: String(n.refId || notifId)
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
        headers: { Urgency: "high", TTL: "86400" },
        fcm_options: { link: deepLinkUrl }
      },
      android: { priority: "high" },
      apns: {
        headers: { "apns-priority": "10", "apns-push-type": "alert" },
        payload: { aps: { alert: { title: titleText, body: bodyText }, sound: "default" } }
      }
    }
  };

  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${pid}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(message)
  });

  console.log(`[Push Trace 6][ID=${reqId}] FCM HTTP status: STATUS = ${r.status} (token #${idx}: ${tokenPrefix})`);

  if (r.ok) return { ok: true, status: r.status };

  const errText = await r.text();
  const invalid = /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(errText);
  console.warn(`[Push Trace Error][ID=${reqId}] FCM send failed (token #${idx}: ${tokenPrefix}): HTTP ${r.status} - ${errText.slice(0, 300)}`);
  return { ok: false, status: r.status, invalid, errorDetails: errText.slice(0, 300) };
}

/* ═══════════ حلّ المستهدفين والتفضيلات ═══════════ */
async function resolveUids(pid, accessToken, userId, excludeUid) {
  if (!userId) return [];
  let uids = [];
  if (userId.startsWith("dept:")) {
    const dept = userId.slice(5);
    const users = await fsListDocuments(pid, accessToken, COL.users);
    if (dept === "all") {
      uids = users.map(u => u.__name);
    } else {
      uids = users.filter(u => {
        if (dept === "hr") return u.role === "hr" || u.department === "hr" || (u.perms && u.perms.canReviewLeave);
        if (dept === "executive") return u.role === "executive";
        return u.department === dept || u.role === dept;
      }).map(u => u.__name);
    }
  } else {
    uids = [userId];
  }
  if (excludeUid) uids = uids.filter(u => u !== excludeUid);
  return uids;
}

async function fsListDocuments(pid, accessToken, collection) {
  const r = await fetch(`${fsBase(pid)}/${collection}?pageSize=100`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) return [];
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
  if (!uids || !uids.length) return [];
  const uidsSet = new Set(uids);
  const out = [];
  for (let i = 0; i < uids.length; i += 10) {
    const chunk = uids.slice(i, i + 10);
    const docs = await fsQuery(pid, accessToken, COL.tokens, {
      fieldFilter: { field: "uid", op: "IN", values: chunk.map(stringValue) }
    });
    docs.forEach(d => {
      if (d.uid && uidsSet.has(d.uid)) out.push({ token: d.__name, uid: d.uid });
    });
  }
  return out;
}

/* ═══════════ Firestore REST API ═══════════ */
function fsBase(pid) {
  return `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;
}

async function fsGet(pid, accessToken, path) {
  const url = `${fsBase(pid)}/${path}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (r.status === 404) return null;
  if (!r.ok) return null;
  const doc = await r.json();
  return decodeFields(doc.fields);
}

async function fsDelete(pid, accessToken, path) {
  await fetch(`${fsBase(pid)}/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

async function fsPatch(pid, accessToken, path, data) {
  const fields = {};
  const mask = [];
  for (const [k, v] of Object.entries(data)) {
    fields[k] = encodeValue(v);
    mask.push(`updateMask.fieldPaths=${encodeURIComponent(k)}`);
  }
  const url = `${fsBase(pid)}/${path}?${mask.join("&")}`;
  await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
}

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return { integerValue: String(v) };
  return { stringValue: String(v) };
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
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where } })
  });
  if (!r.ok) return [];
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

/* ═══════════ Google OAuth ═══════════ */
let _tokenCache = { token: null, exp: 0 };

function loadServiceAccount(env) {
  if (!env?.SERVICE_ACCOUNT) throw new Error("السرّ SERVICE_ACCOUNT غير معيّن.");
  const raw = env.SERVICE_ACCOUNT.trim();
  try { return validateSA(JSON.parse(raw)); }
  catch (e1) {
    try { return validateSA(JSON.parse(repairJsonControlChars(raw))); }
    catch (e2) { throw new Error("فشل تحليل السرّ SERVICE_ACCOUNT."); }
  }
}

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

function validateSA(sa) {
  if (!sa.client_email) throw new Error("حساب الخدمة بلا client_email");
  if (!sa.private_key) throw new Error("حساب الخدمة بلا private_key");
  if (sa.private_key.includes("\\n")) sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  return sa;
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (_tokenCache.token && _tokenCache.exp - 60 > now) return _tokenCache.token;

  const sa = loadServiceAccount(env);
  const scope = [
    "https://www.googleapis.com/auth/datastore",
    "https://www.googleapis.com/auth/cloud-platform",
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

  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
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
  if (!pem || !/BEGIN PRIVATE KEY/.test(pem)) throw new Error("private_key لا يحوي ترويسة PEM صحيحة");
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8", der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
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
