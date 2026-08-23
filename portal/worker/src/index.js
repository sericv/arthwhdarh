/* ══════════════════════════════════════════════════════════
   Cloudflare Worker — Backend الإنتاجي (الإشعارات + الحضور والانصراف)
   جمعية إرث وحضارة بالقريات · البوابة الداخلية
   ──────────────────────────────────────────────────────────
   يعمل على خطة Cloudflare Worker المجانية / الإنتاجية.
   يحمل مفتاح حساب الخدمة (Service Account) سرّاً في الخادم.
   يستقبل نداءات الحضور والإنصراف وإشعارات الدفع مباشرة أونلاين
   دون الحاجة لـ Localhost أو Firebase Emulator أو تشغيل Terminal.

   الأسرار (Secrets) تُضبط عبر: wrangler secret put SERVICE_ACCOUNT
══════════════════════════════════════════════════════════ */

const COL = {
  users: "portal_users",
  tokens: "portal_fcm_tokens",
  notifications: "portal_notifications",
  attendance: "portal_attendance",
  leaves: "portal_leaves"
};
const ICON = "/assets/الشعار/الشعار.png";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: cors
      });
    }

    if (request.method !== "POST") {
      return json({ error: "method-not-allowed" }, 405, cors);
    }

    let body = {};
    try { body = await request.json(); }
    catch { return json({ error: "bad-json" }, 400, cors); }

    // ── 2) توجيه طلب الحضور والانصراف ──
    if (url.pathname === "/api/attendance" || body.action === "checkIn" || body.action === "checkOut" || body.type === "attendance") {
      return await handleAttendanceApi(request, env, body, cors);
    }

    // ── 3) توجيه طلب إشعارات الدفع ──
    const notifId = String(body.notifId || "").trim();
    if (!notifId) {
      return json({ error: "missing-notifId-or-action" }, 400, cors);
    }

    const startTime = Date.now();
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

/* ═══════════ 1. معالجة الحضور والانصراف (Attendance Production API) ═══════════ */
async function handleAttendanceApi(request, env, body, corsHeaders) {
  const sa = loadServiceAccount(env);
  const pid = env?.PROJECT_ID || sa?.project_id || "arthwhdarh-782ec";
  const apiKey = env?.FIREBASE_API_KEY || "AIzaSyDnWUCjJKkMqORT8SeLYHszAIP0bv8PCSg";

  // 1. التحقق من هوية المستخدم باستخدام Firebase Authentication ID Token
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader || body.idToken;
  const authRes = await verifyFirebaseIdToken(idToken, apiKey);

  if (!authRes.valid) {
    console.warn(`[Attendance Auth Error] ${authRes.message}`);
    return json({ success: false, code: authRes.error, message: authRes.message }, 401, corsHeaders);
  }

  const uid = authRes.uid; // الـ UID المؤكد المستخرج من التوكن الحكومي لـ Firebase
  const { action, latitude, longitude, accuracy } = body;

  if (!action || !["checkIn", "checkOut"].includes(action)) {
    return json({ success: false, code: "INVALID_ARGUMENT", message: "نوع الإجراء غير محدد (تسجيل حضور أو انصراف)" }, 400, corsHeaders);
  }

  const latNum = parseFloat(latitude);
  const lngNum = parseFloat(longitude);
  if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return json({ success: false, code: "LOCATION_REQUIRED", message: "إحداثيات الموقع الجغرافي مفقودة أو غير صالحة" }, 400, corsHeaders);
  }

  const accNum = parseFloat(accuracy) || 0;
  if (accNum > 500) {
    return json({
      success: false,
      code: "LOW_LOCATION_ACCURACY",
      message: `دقة موقع الـ GPS ضعيفة جداً (${Math.round(accNum)}م). يرجى فتح الخريطة والتأكد من التواجد في مكان مفتوح ثم التكرار.`
    }, 400, corsHeaders);
  }

  const accessToken = await getAccessToken(env);

  // 2. جلب بيانات الموظف وإعدادات النظام من Firestore REST
  const [empUser, attSettingsDoc] = await Promise.all([
    fsGet(pid, accessToken, `${COL.users}/${uid}`),
    fsGet(pid, accessToken, "settings/attendance")
  ]);

  const empName = empUser?.name || empUser?.email || authRes.email || "موظف";
  const empDept = empUser?.department || "";

  const settings = {
    officeLat: attSettingsDoc?.officeLat ?? 31.334302,
    officeLng: attSettingsDoc?.officeLng ?? 37.338730,
    allowedRadius: attSettingsDoc?.allowedRadius ?? 100,
    workStartTime: attSettingsDoc?.workStartTime || "08:00",
    workEndTime: attSettingsDoc?.workEndTime || "16:00",
    graceMinutes: attSettingsDoc?.graceMinutes ?? 15,
    address: attSettingsDoc?.address || "شركة حمود عيد للتجارة والتسويق، صلاح الدين، السديرية، القريات 77453"
  };

  // 3. حساب المسافة الفعلي من مقر الجمعية (Server-Side Haversine Formula)
  const distanceMeters = computeHaversineDistanceMeters(latNum, lngNum, settings.officeLat, settings.officeLng);
  const distanceRounded = Math.round(distanceMeters);

  if (distanceRounded > settings.allowedRadius) {
    return json({
      success: false,
      code: "OUTSIDE_GEOFENCE",
      message: `📍 خارج نطاق مقر الجمعية. يجب أن تكون داخل مقر الجمعية لتسجيل الحضور والانصراف (المسافة الحالية: ${distanceRounded} متر).`,
      distanceFromOffice: distanceRounded,
      allowedRadius: settings.allowedRadius
    }, 400, corsHeaders);
  }

  // 4. توقيت الخادم الرسمي (Asia/Riyadh UTC+3)
  const timeInfo = getRiyadhDateAndServerTime();
  const { dateStr, year, month, day, formattedTime, timeInMins } = timeInfo;
  const docId = `${uid}_${dateStr}`;

  // 5. جلب سجل اليوم الحالي وفحص الإجازات المعتمدة
  const existingRecord = await fsGet(pid, accessToken, `${COL.attendance}/${docId}`);

  if (action === "checkIn") {
    // فحص ما إذا كان للموظف إجازة معتمدة لهذا اليوم
    const approvedLeaves = await fsQuery(pid, accessToken, COL.leaves, {
      fieldFilter: { field: "userId", op: "EQUAL", values: [{ stringValue: uid }] }
    });
    const hasApprovedLeave = approvedLeaves.some(l => {
      const st = l.status;
      if (st !== "approved" && st !== "exec_approved") return false;
      return (l.startDate <= dateStr && dateStr <= l.endDate);
    });

    if (hasApprovedLeave) {
      return json({
        success: false,
        code: "LEAVE_APPROVED",
        message: "🟣 لديك إجازة معتمدة لهذا اليوم. لا يتطلب منك تسجيل الحضور والانصراف."
      }, 400, corsHeaders);
    }

    if (existingRecord && existingRecord.checkInTime) {
      return json({
        success: true,
        code: "ALREADY_CHECKED_IN",
        message: "✅ تم تسجيل الحضور مسبقاً لهذا اليوم",
        record: existingRecord,
        formattedTime: existingRecord.checkInTime,
        distanceFromOffice: existingRecord.distanceFromOffice ?? distanceRounded
      }, 200, corsHeaders);
    }

    // حساب دقائق التأخير بحسب بداية الدوام الرسمي ومهلة السماح
    const [startH, startM] = settings.workStartTime.split(":").map(x => parseInt(x, 10));
    const workStartMins = (startH || 8) * 60 + (startM || 0);
    const graceMins = settings.graceMinutes;
    let lateMinutes = 0;
    let status = "present";

    if (timeInMins > (workStartMins + graceMins)) {
      lateMinutes = timeInMins - workStartMins;
      status = "late";
    }

    const payload = {
      id: docId,
      employeeUid: uid,
      employeeName: empName,
      department: empDept,
      date: dateStr,
      year, month, day,
      status,
      checkInTime: formattedTime,
      checkOutTime: existingRecord?.checkOutTime || "",
      lateMinutes,
      location: settings.address,
      latitude: latNum,
      longitude: lngNum,
      accuracy: accNum,
      distanceFromOffice: distanceRounded,
      method: "electronic",
      createdAt: existingRecord?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: existingRecord?.notes || "",
      auditLog: existingRecord?.auditLog || []
    };

    await fsSet(pid, accessToken, `${COL.attendance}/${docId}`, payload);
    console.log(`[Attendance API] CheckIn recorded for ${uid} on ${dateStr} (distance: ${distanceRounded}m, status: ${status})`);

    return json({
      success: true,
      code: "CHECKIN_SUCCESS",
      message: "✅ تم تسجيل الحضور بنجاح",
      record: payload,
      formattedTime,
      distanceFromOffice: distanceRounded
    }, 200, corsHeaders);
  }

  if (action === "checkOut") {
    if (!existingRecord || !existingRecord.checkInTime) {
      return json({
        success: false,
        code: "NOT_CHECKED_IN",
        message: "لم يتم تسجيل الحضور بعد. يرجى تسجيل الحضور أولاً قبل تسجيل الانصراف."
      }, 400, corsHeaders);
    }

    if (existingRecord.checkOutTime) {
      return json({
        success: true,
        code: "ALREADY_CHECKED_OUT",
        message: "✅ تم تسجيل الانصراف مسبقاً لهذا اليوم",
        record: existingRecord,
        formattedTime: existingRecord.checkOutTime,
        distanceFromOffice: existingRecord.checkOutDistanceFromOffice ?? distanceRounded
      }, 200, corsHeaders);
    }

    const updatedRecord = {
      ...existingRecord,
      checkOutTime: formattedTime,
      checkOutLatitude: latNum,
      checkOutLongitude: lngNum,
      checkOutAccuracy: accNum,
      checkOutDistanceFromOffice: distanceRounded,
      updatedAt: new Date().toISOString()
    };

    await fsSet(pid, accessToken, `${COL.attendance}/${docId}`, updatedRecord);
    console.log(`[Attendance API] CheckOut recorded for ${uid} on ${dateStr} (time: ${formattedTime})`);

    return json({
      success: true,
      code: "CHECKOUT_SUCCESS",
      message: "✅ تم تسجيل الانصراف بنجاح",
      record: updatedRecord,
      formattedTime,
      distanceFromOffice: distanceRounded
    }, 200, corsHeaders);
  }

  return json({ success: false, code: "BAD_REQUEST", message: "إجراء غير معروف" }, 400, corsHeaders);
}

/* ═══════════ 2. التحقق من توكن Firebase Authentication ═══════════ */
async function verifyFirebaseIdToken(idToken, apiKey) {
  if (!idToken || typeof idToken !== "string") {
    return { valid: false, error: "UNAUTHORIZED", message: "رمز الهوية مفقود أو غير صالح" };
  }
  const cleanToken = idToken.replace(/^Bearer\s+/i, "").trim();
  if (!cleanToken) {
    return { valid: false, error: "UNAUTHORIZED", message: "رمز الهوية مفقود" };
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: cleanToken })
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error("[Auth Verify Error] IdentityToolkit lookup failed:", resp.status, errText);
    return { valid: false, error: "UNAUTHORIZED", message: "جلسة المستخدم منتهية أو رمز الهوية غير صالح. يرجى إعادة تسجيل الدخول." };
  }

  const data = await resp.json();
  const userObj = data.users && data.users[0];
  if (!userObj || !userObj.localId) {
    return { valid: false, error: "UNAUTHORIZED", message: "تعذر التحقق من هوية المستخدم" };
  }

  return { valid: true, uid: userObj.localId, email: userObj.email };
}

/* ═══════════ 3. معادلات المسافة والتوقيت الرسمية ═══════════ */
function computeHaversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getRiyadhDateAndServerTime() {
  const now = new Date();
  const riyadhOffsetMs = 3 * 60 * 60 * 1000;
  const riyadhDate = new Date(now.getTime() + riyadhOffsetMs);

  const year = riyadhDate.getUTCFullYear();
  const month = riyadhDate.getUTCMonth() + 1;
  const day = riyadhDate.getUTCDate();
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const rawH = riyadhDate.getUTCHours();
  const m = riyadhDate.getUTCMinutes();

  const isPM = rawH >= 12;
  let h12 = rawH % 12;
  if (h12 === 0) h12 = 12;
  const formattedTime = `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${isPM ? "م" : "ص"}`;
  const timeInMins = rawH * 60 + m;

  return { dateStr, year, month, day, formattedTime, timeInMins };
}

/* ═══════════ 4. منطق إرسال إشعارات الدفع (FCM Push) ═══════════ */
async function sendForNotification(env, accessToken, notifId, reqId) {
  const sa = loadServiceAccount(env);
  const pid = env?.PROJECT_ID || sa?.project_id || "arthwhdarh-782ec";

  const n = await fsGet(pid, accessToken, `${COL.notifications}/${notifId}`);
  if (!n) {
    console.log(`[Push Trace 2][ID=${reqId}] Notification not found: ${notifId}`);
    return { skipped: "notification-not-found", success: 0, failure: 0, removed: 0 };
  }

  const uids = await resolveUids(pid, accessToken, n.userId, n.excludeUid);
  if (!uids.length) return { skipped: "no-uids", success: 0, failure: 0, removed: 0 };

  const allowed = [];
  for (const uid of uids) {
    if (await prefAllows(pid, accessToken, uid, n.pref)) allowed.push(uid);
  }
  if (!allowed.length) return { skipped: "opted-out", success: 0, failure: 0, removed: 0 };

  const tokenDocs = await tokensForUids(pid, accessToken, allowed);
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

  if (r.ok) return { ok: true, status: r.status };

  const errText = await r.text();
  const invalid = /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(errText);
  return { ok: false, status: r.status, invalid, errorDetails: errText.slice(0, 300) };
}

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

/* ═══════════ 5. مساعدات Firestore REST API ═══════════ */
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

async function fsSet(pid, accessToken, path, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = encodeValue(v);
  }
  const url = `${fsBase(pid)}/${path}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`fsSet ${path}: ${r.status} ${errText.slice(0, 300)}`);
  }
  const doc = await r.json();
  return decodeFields(doc.fields);
}

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    if (Number.isInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(encodeValue) } };
  }
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) {
      fields[k] = encodeValue(val);
    }
    return { mapValue: { fields } };
  }
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
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: collection }], where }
    })
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

/* ═══════════ 6. مصادقة Google OAuth لرمز الوصول (Service Account) ═══════════ */
let _tokenCache = { token: null, exp: 0 };

function loadServiceAccount(env) {
  if (!env?.SERVICE_ACCOUNT) {
    throw new Error("السرّ SERVICE_ACCOUNT غير معيّن في Cloudflare Worker.");
  }
  const raw = env.SERVICE_ACCOUNT.trim();
  try {
    return validateSA(JSON.parse(raw));
  } catch (e1) {
    try {
      return validateSA(JSON.parse(repairJsonControlChars(raw)));
    } catch (e2) {
      throw new Error("فشل تحليل السرّ SERVICE_ACCOUNT.");
    }
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
  if (sa.private_key.includes("\\n")) {
    sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  }
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
    throw new Error("private_key لا يحوي ترويسة PEM صحيحة");
  }
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

/* ═══════════ 7. مساعدات استجابة HTTP ═══════════ */
function corsHeaders(request) {
  const allowedOrigins = [
    "https://arthwhdarh.com",
    "https://www.arthwhdarh.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5001",
    "http://127.0.0.1:5001"
  ];
  const origin = (request?.headers?.get("Origin") || "").trim();
  const isAllowed = allowedOrigins.includes(origin);
  const matchedOrigin = isAllowed ? origin : "https://arthwhdarh.com";

  const requestedHeaders = request?.headers?.get("Access-Control-Request-Headers");
  const allowHeaders = requestedHeaders
    ? requestedHeaders
    : "Content-Type, Authorization, X-Requested-With, Accept, Origin";

  return {
    "Access-Control-Allow-Origin": matchedOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PATCH, DELETE",
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400"
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}
