/* ══════════════════════════════════════════════════════════
   Firebase Cloud Messaging — Background Service Worker
   جمعية إرث وحضارة بالقريات · البوابة الداخلية
   ──────────────────────────────────────────────────────────
   يتعامل مع: استقبال الدفع في الخلفية · عرض الإشعار ·
   النقر والتنقّل العميق · جسر الرسائل للتطبيق.
   المسارات نسبية لجذر الـ SW (/portal/) لتعمل على أي نطاق.
══════════════════════════════════════════════════════════ */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:"AIzaSyDnWUCjJKkMqORT8SeLYHszAIP0bv8PCSg",
  authDomain:"arthwhdarh-782ec.firebaseapp.com",
  projectId:"arthwhdarh-782ec",
  storageBucket:"arthwhdarh-782ec.firebasestorage.app",
  messagingSenderId:"597405952213",
  appId:"1:597405952213:web:5ffeab6adc7e451a265a5c"
});

const SWLOG = (...a) => console.log("[SW]", ...a);

/* تفعيل فوري للنسخة الجديدة */
self.addEventListener('install', () => { SWLOG("install"); self.skipWaiting(); });
self.addEventListener('activate', (e) => { SWLOG("activate"); e.waitUntil(self.clients.claim()); });

/* أيقونة الشعار بمسار نسبي */
const LOGO = new URL('../assets/الشعار/الشعار.png', self.location).href;
/* عنوان البوابة (جذر مجلد الـ SW) */
const PORTAL_URL = new URL('./', self.location).href;

const messaging = firebase.messaging();

/* رسائل الدفع في الخلفية (التبويب مغلق/خلفي/التطبيق مُثبّت) */
messaging.onBackgroundMessage((p) => {
  SWLOG("background message", p);
  const n = p.notification || {};
  const d = p.data || {};
  const title = n.title || d.title || 'إرث وحضارة';
  return self.registration.showNotification(title, {
    body:  n.body || d.body || 'لديك إشعار جديد',
    icon:  LOGO,
    badge: LOGO,
    dir:   'rtl',
    lang:  'ar',
    tag:   d.tag || ('erth-' + (d.refId || Date.now())),
    renotify: true,
    requireInteraction: false,
    data: {
      link:  d.link  || 'notifs',   // وجهة التنقّل
      refId: d.refId || '',         // مُعرّف العنصر
      notifId: d.notifId || '',
      url:   PORTAL_URL
    }
  });
});

/* النقر على الإشعار: افتح/ركّز البوابة + انتقل للوجهة */
self.addEventListener('notificationclick', (e) => {
  SWLOG("notificationclick", e.notification?.data);
  e.notification.close();
  const data = e.notification.data || {};
  const target = `${PORTAL_URL}#${data.link || 'notifs'}${data.refId ? ':' + data.refId : ''}`;

  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // إن كانت البوابة مفتوحة: ركّزها وأبلغها بالوجهة عبر رسالة
    for (const c of all) {
      if (c.url.includes('/portal') && 'focus' in c) {
        await c.focus();
        c.postMessage({
          source: "erth-portal-sw",
          kind: "notification-click",
          link: data.link || 'notifs',
          refId: data.refId || '',
          notifId: data.notifId || ''
        });
        return;
      }
    }
    // وإلا: افتح نافذة جديدة على الوجهة
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

/* جسر: يسمح للتطبيق بطلب skipWaiting (تحديث فوري) */
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
