/* ══════════════════════════════════════════════════════════
   Cloudflare Worker — إشعارات Telegram
   جمعية إرث وحضارة بالقريات
   ──────────────────────────────────────────────────────────
   يستقبل طلبات من صفحة التطوع (بيدي حرفة / أصدقاء الجمعية)
   ويُرسل إشعاراً فورياً إلى قناة Telegram.

   Bot Token مُخزّن كـ Worker Secret (wrangler secret put).
   لا يُكشف أبداً في الواجهة الأمامية.

   النشر:
     cd portal/worker-telegram && npm install
     wrangler secret put TELEGRAM_BOT_TOKEN
     wrangler deploy
═══════════════════════════════════════════════════════════ */

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return json({ error: "method-not-allowed" }, 405, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad-json" }, 400, cors);
    }

    const type = String(body.type || "").trim();
    if (!type || !["crafts", "volunteers"].includes(type)) {
      return json({ error: "invalid-type" }, 400, cors);
    }

    try {
      const text = type === "crafts"
        ? buildCraftsMessage(body)
        : buildVolunteersMessage(body);

      const result = await sendTelegram(env, text);
      return json({ ok: true, ...result }, 200, cors);
    } catch (e) {
      console.error("telegram error:", e?.message || e);
      return json({ ok: false, error: String(e?.message || e) }, 500, cors);
    }
  }
};

/* ═══════════ تنسيق الرسائل ═══════════ */

function escHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildCraftsMessage(d) {
  const fields = [
    ["👤 الاسم", d.name],
    ["📱 رقم الجوال", d.phone],
    ["🪪 رقم الهوية", d.idNumber],
    ["👨 الجنس", d.gender],
    ["🎂 تاريخ الميلاد", d.dob],
    ["🏙 المدينة", d.city],
    ["🛠 الحرفة", d.craft],
    ["⭐ مستوى الخبرة", d.level],
    ["🎪 شارك في فعاليات", d.hasEvent],
  ];

  const lines = fields
    .filter(([, val]) => val)
    .map(([label, val]) => `${label}: <b>${escHtml(val)}</b>`);

  return [
    `📥 <b>طلب جديد — بيدي حرفة</b>`,
    "",
    ...lines,
    "",
    `🕒 <i>${formatTime(d.timestamp)}</i>`,
    "━".repeat(16),
  ].join("\n");
}

function buildVolunteersMessage(d) {
  const interests = Array.isArray(d.interests)
    ? d.interests.join("، ")
    : "";

  const fields = [
    ["👤 الاسم", d.name],
    ["📱 رقم الجوال", d.phone],
    ["📧 البريد الإلكتروني", d.email],
    ["👨 الجنس", d.gender],
    ["🏙 المدينة", d.city],
    ["🎯 الاهتمامات", interests],
    ["📝 الإقرار", d.acknowledged ? "تمت الموافقة" : "—"],
  ];

  const lines = fields
    .filter(([, val]) => val)
    .map(([label, val]) => `${label}: <b>${escHtml(val)}</b>`);

  return [
    `🤝 <b>طلب جديد — أصدقاء الجمعية</b>`,
    "",
    ...lines,
    "",
    `🕒 <i>${formatTime(d.timestamp)}</i>`,
    "━".repeat(16),
  ].join("\n");
}

function formatTime(ts) {
  try {
    if (ts) {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString("ar-SA", {
          timeZone: "Asia/Riyadh",
          year: "numeric", month: "long", day: "numeric",
          hour: "2-digit", minute: "2-digit",
        });
      }
    }
    return new Date().toLocaleString("ar-SA", {
      timeZone: "Asia/Riyadh",
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return new Date().toISOString();
  }
}

/* ═══════════ إرسال Telegram ═══════════ */

async function sendTelegram(env, text) {
  const token = (env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN secret not configured");

  const chatId = (env.TELEGRAM_CHAT_ID || "").trim();
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID not configured");

  const resp = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    }
  );

  const result = await resp.json();

  if (!resp.ok || !result.ok) {
    throw new Error(`Telegram API: ${result.description || resp.status}`);
  }

  return { messageId: result.result?.message_id };
}

/* ═══════════ مساعدات HTTP ═══════════ */

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
