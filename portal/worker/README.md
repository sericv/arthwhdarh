# Cloudflare Worker — مُرسِل الدفع (بديل Cloud Functions على خطة Spark)

يُرسل إشعارات FCM في الخلفية **دون ترقية Blaze ودون Cloud Functions**.
يعمل على الطبقة المجانية من Cloudflare Workers (بلا بطاقة ائتمان).

---

## كيف يعمل

```
الواجهة (app.js/services.js)
  ├─ تكتب مستند في portal_notifications   ← مصدر الحقيقة (يعمل دائماً)
  └─ تنادي الـ Worker: POST { notifId }
        │
   Cloudflare Worker (يحمل سرّ حساب الخدمة)
        ├─ يقرأ الإشعار + المستهدفين + الرموز من Firestore REST
        ├─ يُوقّع JWT → access_token (OAuth)
        ├─ يُرسل FCM HTTP v1 لكل جهاز
        └─ يحذف الرموز الباطلة
        ▼
   جهاز الموظف (firebase-sw.js) يعرض الإشعار
   حتى لو كانت البوابة مغلقة كلياً ✅
```

السرّ (مفتاح حساب الخدمة) يبقى داخل الـ Worker — **لا يصل المتصفح أبداً**.

---

## النشر — خطوة بخطوة

### ١) تثبيت أدوات Cloudflare وتسجيل الدخول
```bash
cd portal/worker
npm install
npx wrangler login          # يفتح المتصفح لتسجيل الدخول لحساب Cloudflare مجاني
```

### ٢) الحصول على مفتاح حساب الخدمة من Firebase
- Firebase Console → ⚙️ Project Settings → **Service accounts**
- **Generate new private key** → يُنزّل ملف JSON.

### ٣) رفع المفتاح كسرّ للـ Worker

> ⚠️ **مهم — تجنّب خطأ `Unterminated string in JSON`:**
> ملف حساب الخدمة يحوي `private_key` بداخله أسطر (`\n`). عند لصقه نصّاً قد
> تتحوّل هذه الأسطر إلى أسطر فعلية فيفسد JSON. **الحل الأضمن: Base64.**

#### الطريقة الموصى بها (Base64 — لا تتكسّر أبداً)
ولّد نصّاً مُرمّزاً بلا أي أسطر، وارفعه في السرّ `SERVICE_ACCOUNT_B64`:

```powershell
# PowerShell (ويندوز)
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
$b64 | npx wrangler secret put SERVICE_ACCOUNT_B64
```
```bash
# bash / macOS / Linux
base64 -w0 service-account.json | npx wrangler secret put SERVICE_ACCOUNT_B64
```

#### الطريقة البديلة (JSON مباشر)
```bash
npx wrangler secret put SERVICE_ACCOUNT     # ثم الصق محتوى الملف كاملاً
```
> الـ Worker يحاول إصلاح الأسطر الفعلية تلقائياً إن استُخدمت هذه الطريقة،
> لكن Base64 أعلاه يُغنيك عن ذلك نهائياً.

> ملاحظة: إن ضبطت `SERVICE_ACCOUNT_B64` فهو الأولوية ويُتجاهل `SERVICE_ACCOUNT`.

### ٤) النشر
```bash
npx wrangler deploy
```
سيطبع رابطاً مثل:
```
https://erth-portal-push.<حسابك>.workers.dev
```

### ٥) ربط الواجهة بالرابط
في `portal/config.js` ضع الرابط:
```js
export const PUSH_ENDPOINT = "https://erth-portal-push.<حسابك>.workers.dev";
```

### ٦) (موصى) تقييد CORS لنطاقك
في `wrangler.toml` غيّر:
```toml
ALLOWED_ORIGIN = "https://نطاق-موقعك"
```
ثم أعد النشر: `npx wrangler deploy`.

---

## الاختبار
1. سجّل الدخول للبوابة على جهازين (أو متصفحين) وفعّل الإشعارات في كليهما.
2. أغلق البوابة تماماً على الجهاز الثاني.
3. من الجهاز الأول أنشئ مهمة وأسندها للموظف الثاني.
4. يصل إشعار دفع للجهاز الثاني رغم إغلاق البوابة ✅
5. تتبّع السجلّ: `npx wrangler tail`

---

## ملاحظات
- **مجاني**: حد Cloudflare Workers المجاني = ١٠٠٬٠٠٠ طلب/يوم — أضعاف حاجة بوابة داخلية.
- **بلا Blaze**: لا تحتاج ترقية مشروع Firebase. هذا الـ Worker يحلّ محلّ
  `portal/functions/` بالكامل (يمكنك تجاهل/حذف مجلد functions إن اخترت هذا المسار).
- **الأمان**: الـ Worker يرسل فقط إشعاراً **سبق كتابته** إلى **مستهدفيه المحدّدين**؛
  لا يقبل عنواناً أو محتوى من النداء — فقط `notifId`. ومع ذلك، فعّل `ALLOWED_ORIGIN`
  لنطاقك لتقليل النداءات العابثة.
- إن تركت `PUSH_ENDPOINT=""` فالنظام يعمل بالإشعارات داخل التطبيق فقط بلا دفع خلفي.
