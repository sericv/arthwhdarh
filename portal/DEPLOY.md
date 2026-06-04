# دليل النشر — Firebase

جمعية إرث وحضارة بالقريات · البوابة الداخلية

> **مهم:** يجب تشغيل أوامر `firebase` من **جذر المستودع**
> (`arthwhdarh/`) حيث يوجد `firebase.json` و`.firebaserc` — وليس من
> داخل مجلد `portal/`.

---

## مساران للدفع الخلفي — اختر واحداً

لوصول الإشعارات **بعد إغلاق البوابة كلياً** تحتاج مُرسِلاً خادمياً. لديك خياران:

| المسار | الخطة | التكلفة | المرجع |
|-------|------|---------|--------|
| **أ) Cloudflare Worker** (موصى لـ Spark) | Spark مجانية | $0، بلا بطاقة | [`worker/README.md`](worker/README.md) |
| **ب) Cloud Functions** | تتطلب **Blaze** | حسب الاستخدام (غالباً $0) | الأقسام أدناه |

> الطبقة داخل التطبيق وإشعارات خلفية التبويب تعمل في الحالتين بلا أي خادم.
> القواعد والفهارس والتخزين أدناه مطلوبة في **كلا** المسارين.

---

## الملفات المُضافة لحل مشكلة النشر

| الملف | الموقع | الوظيفة |
|------|--------|---------|
| `firebase.json` | جذر المستودع | يربط القواعد والفهارس والدوال والاستضافة |
| `.firebaserc` | جذر المستودع | يحدّد مشروع Firebase الافتراضي (`arthwhdarh-782ec`) |

> هذان الملفان كانا مفقودين — لذلك كان `firebase deploy` يفشل بـ
> *"Cannot find firebase.json"*. الآن النشر يعمل.

---

## ١. لمرة واحدة — التثبيت والتسجيل

```bash
# تثبيت أدوات Firebase (إن لم تكن مثبّتة)
npm install -g firebase-tools

# تسجيل الدخول
firebase login

# (من جذر المستودع) تأكيد ربط المشروع
firebase use arthwhdarh-782ec
```

---

## ٢. تثبيت اعتماديات الدوال (مطلوب قبل أول نشر للدوال)

```bash
cd portal/functions
npm install
cd ../..        # العودة لجذر المستودع
```

---

## ٣. النشر

### إن اخترت مسار Cloudflare Worker (Spark) — انشر بلا دوال:
```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```
ثم اتبع [`worker/README.md`](worker/README.md) لنشر المُرسِل.
> لا تشغّل `firebase deploy` المجرّد على Spark — سيحاول نشر الدوال ويفشل.

### إن اخترت مسار Cloud Functions (Blaze):

```bash
# قواعد Firestore
firebase deploy --only firestore:rules

# الفهارس المركّبة
firebase deploy --only firestore:indexes

# قواعد التخزين
firebase deploy --only storage

# دوال الإشعارات (الطبقة الخادمية للدفع)
firebase deploy --only functions
```

### للقواعد والفهارس والدوال معاً (أكثر أمر ستحتاجه)
```bash
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

---

## ٤. التحقق بعد النشر

```bash
# عرض الدوال المنشورة
firebase functions:list

# متابعة سجلّات الدوال مباشرة (لتأكيد وصول الدفع)
firebase functions:log
```

في وحدة التحكم:
- **Firestore → Indexes** → يجب أن تظهر ٣ فهارس بحالة *Enabled*.
- **Functions** → يجب أن تظهر `sendPushOnNotification`.

---

## ٥. ملاحظات

- **الاستضافة (Hosting)** اختيارية. كتلة `hosting` في `firebase.json` تنشر
  الموقع كاملاً (الجذر `.`) وتضيف ترويسات صحيحة لـ Service Worker والـ
  manifest. لنشرها:
  ```bash
  firebase deploy --only hosting
  ```
  إن كنت تستضيف على GitHub Pages أو غيره، تجاهل هذا الجزء — باقي الأوامر
  تعمل بمعزل عنه.

- **Node.js 20** مطلوب للدوال (محدّد في `firebase.json` و`functions/package.json`).
  تحقّق: `node --version`.

- **خطة Blaze**: تفعيل Cloud Functions يتطلب ترقية مشروع Firebase إلى خطة
  Blaze (الدفع حسب الاستخدام). الاستخدام ضمن الحدود المجانية عادةً = ٠ تكلفة.

- إن ظهر خطأ فهرس عند أول استعلام رغم النشر، انتظر دقيقة — بناء الفهارس
  يستغرق وقتاً قصيراً بعد `deploy`.

---

## ٦. أوامر مرجعية سريعة

| الهدف | الأمر (من جذر المستودع) |
|------|------------------------|
| نشر كل شيء | `firebase deploy` |
| القواعد فقط | `firebase deploy --only firestore:rules,storage` |
| الفهارس فقط | `firebase deploy --only firestore:indexes` |
| الدوال فقط | `firebase deploy --only functions` |
| سجلّ الدوال | `firebase functions:log` |
| المشروع الحالي | `firebase use` |
