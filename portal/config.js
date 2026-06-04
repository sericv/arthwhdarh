/* ══════════════════════════════════════════════════════════
   إعدادات البوابة الداخلية — جمعية إرث وحضارة بالقريات
   Portal Configuration · Firebase + Roles + Departments
   ──────────────────────────────────────────────────────────
   ملاحظة أمنية: المفتاح الخاص (Private VAPID Key) لا يوضع هنا
   أبداً — يُستخدم فقط في الخادم لإرسال الإشعارات. هذا الملف
   يحتوي فقط على المفاتيح العامة الآمنة للمتصفح.
══════════════════════════════════════════════════════════ */

/* ── Firebase (المفاتيح العامة — آمنة للواجهة) ── */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDnWUCjJKkMqORT8SeLYHszAIP0bv8PCSg",
  authDomain: "arthwhdarh-782ec.firebaseapp.com",
  projectId: "arthwhdarh-782ec",
  storageBucket: "arthwhdarh-782ec.firebasestorage.app",
  messagingSenderId: "597405952213",
  appId: "1:597405952213:web:5ffeab6adc7e451a265a5c"
};

/* ── FCM — المفتاح العام فقط (Pair / Public VAPID Key) ──
   المفتاح الخاص "Private Key" لا يُوضع في كود الواجهة إطلاقاً. */
export const VAPID_KEY =
  "BCKgPuOcFdhJrT9OvSDGUikINaoL2Hr5gOdovSqG7jN_iiH_ESgCPtLOLrx7THPIQPR8C6ZaT-hdpxLnw9BLpmM";

/* ── عنوان Cloudflare Worker لإرسال الدفع (بديل Cloud Functions) ──
   يعمل على خطة Spark المجانية. ضع رابط الـ Worker بعد نشره، مثل:
   "https://erth-portal-push.<حسابك>.workers.dev"
   اتركه فارغاً ليبقى النظام على الإشعارات داخل التطبيق فقط بلا دفع خلفي. */
export const PUSH_ENDPOINT = "https://erth-portal-push.2falilh2.workers.dev";

/* ── أسماء مجموعات Firestore ── */
export const COL = {
  users:         "portal_users",
  files:         "portal_files",
  tasks:         "portal_tasks",
  notifications: "portal_notifications",
  activity:      "portal_activity",
  tokens:        "portal_fcm_tokens"   // رموز FCM (متعددة الأجهزة لكل مستخدم)
};

/* ── الأدوار والصلاحيات ── */
export const ROLES = {
  executive: {
    label:        "الإدارة التنفيذية",
    la:           "Executive Management",
    departments:  ["finance", "projects", "media", "executive"], // كل شيء
    canCreateTask:true,
    canApprove:   true,
    canManage:    true,
    accent:       "#9c6e38"
  },
  finance: {
    label:        "الإدارة المالية",
    la:           "Finance Department",
    departments:  ["finance"],
    canCreateTask:false,
    canApprove:   false,
    canManage:    false,
    accent:       "#3a5e2e"
  },
  projects: {
    label:        "إدارة المشاريع",
    la:           "Projects Department",
    departments:  ["projects"],
    canCreateTask:false,
    canApprove:   false,
    canManage:    false,
    accent:       "#2d4a63"
  },
  media: {
    label:        "الإعلام والعلاقات العامة",
    la:           "Media & Public Relations",
    departments:  ["media"],
    canCreateTask:false,
    canApprove:   false,
    canManage:    false,
    accent:       "#7a3b52"
  }
};

/* ── الإدارات وفئات الملفات ── */
export const DEPARTMENTS = {
  finance: {
    label: "الإدارة المالية", la: "Finance",
    icon:  "fa-coins",
    categories: [
      { id: "expenses", label: "المصروفات",   la: "Expenses" },
      { id: "budgets",  label: "الميزانيات",  la: "Budgets"  },
      { id: "invoices", label: "الفواتير",    la: "Invoices" }
    ]
  },
  projects: {
    label: "إدارة المشاريع", la: "Projects",
    icon:  "fa-diagram-project",
    categories: [
      { id: "reports",   label: "تقارير المشاريع", la: "Project Reports" },
      { id: "programs",  label: "البرامج",         la: "Programs"        },
      { id: "contracts", label: "العقود",          la: "Contracts"       }
    ]
  },
  media: {
    label: "الإعلام والعلاقات العامة", la: "Media",
    icon:  "fa-photo-film",
    categories: [
      { id: "photos",  label: "الصور",         la: "Photos"  },
      { id: "videos",  label: "مقاطع الفيديو", la: "Videos"  },
      { id: "designs", label: "التصاميم",      la: "Designs" }
    ]
  },
  executive: {
    label: "الإدارة التنفيذية", la: "Executive",
    icon:  "fa-building-columns",
    categories: [
      { id: "general", label: "وثائق عامة", la: "General Documents" }
    ]
  }
};

/* ── حالات الملفات (سير الاعتماد) ── */
export const FILE_STATUS = {
  draft:             { label: "مسودة",          la: "Draft",             color: "#6b4f35", bg: "rgba(107,79,53,.08)"  },
  under_review:      { label: "قيد المراجعة",   la: "Under Review",      color: "#9c6e38", bg: "rgba(192,154,98,.10)" },
  approved:          { label: "معتمد",          la: "Approved",          color: "#3a5e2e", bg: "rgba(58,94,46,.08)"   },
  revision_required: { label: "يحتاج تعديل",    la: "Revision Required", color: "#7a2518", bg: "rgba(122,37,24,.07)"  }
};

/* ── حالات المهام ── */
export const TASK_STATUS = {
  pending:      { label: "معلقة",        la: "Pending",      color: "#6b4f35", bg: "rgba(107,79,53,.08)"  },
  in_progress:  { label: "قيد التنفيذ",  la: "In Progress",  color: "#2d4a63", bg: "rgba(45,74,99,.08)"   },
  under_review: { label: "قيد المراجعة", la: "Under Review", color: "#9c6e38", bg: "rgba(192,154,98,.10)" },
  completed:    { label: "مكتملة",       la: "Completed",    color: "#3a5e2e", bg: "rgba(58,94,46,.08)"   }
};

/* ── أولويات المهام ── */
export const TASK_PRIORITY = {
  low:      { label: "منخفضة", la: "Low",      color: "#3a5e2e" },
  medium:   { label: "متوسطة", la: "Medium",   color: "#9c6e38" },
  high:     { label: "عالية",  la: "High",     color: "#b8651a" },
  critical: { label: "حرجة",   la: "Critical", color: "#7a2518" }
};

/* ── أنواع الإشعارات (٨ فئات) ──
   كل نوع ينتمي إلى مجموعة تفضيل (pref) يمكن للمستخدم تعطيلها. */
export const NOTIF_TYPE = {
  task_assigned:  { label: "مهمة جديدة",   icon: "fa-list-check",     color: "#2d4a63", pref: "tasks"     },
  task_updated:   { label: "تحديث مهمة",   icon: "fa-pen-to-square",  color: "#9c6e38", pref: "tasks"     },
  task_completed: { label: "اكتمال مهمة",  icon: "fa-flag-checkered", color: "#3a5e2e", pref: "tasks"     },
  file_uploaded:  { label: "ملف جديد",     icon: "fa-file-arrow-up",  color: "#9c6e38", pref: "files"     },
  file_approved:  { label: "اعتماد ملف",   icon: "fa-circle-check",   color: "#3a5e2e", pref: "approvals" },
  file_revision:  { label: "طلب تعديل",    icon: "fa-rotate-left",    color: "#7a2518", pref: "approvals" },
  comment_added:  { label: "تعليق جديد",   icon: "fa-comment-dots",   color: "#6b4f35", pref: "comments"  },
  system_alert:   { label: "تنبيه النظام", icon: "fa-triangle-exclamation", color: "#b8651a", pref: "system" }
};

/* ── مجموعات تفضيلات الإشعارات (للتحكم بالتفعيل/التعطيل) ── */
export const NOTIF_PREFS = {
  tasks:     { label: "المهام",        la: "Tasks",     icon: "fa-list-check" },
  files:     { label: "الملفات",       la: "Files",     icon: "fa-folder-open" },
  approvals: { label: "الاعتمادات",    la: "Approvals", icon: "fa-circle-check" },
  comments:  { label: "التعليقات",     la: "Comments",  icon: "fa-comment-dots" },
  system:    { label: "تنبيهات النظام", la: "System",   icon: "fa-triangle-exclamation" }
};
export const NOTIF_PREFS_DEFAULT = { tasks:true, files:true, approvals:true, comments:true, system:true };

/* ── أنواع سجل النشاط ── */
export const ACTIVITY_TYPE = {
  upload:      { label: "رفع ملف",       icon: "fa-arrow-up-from-bracket", color: "#9c6e38" },
  download:    { label: "تنزيل ملف",     icon: "fa-download",              color: "#2d4a63" },
  edit:        { label: "تعديل",         icon: "fa-pen",                   color: "#6b4f35" },
  approve:     { label: "اعتماد",        icon: "fa-circle-check",          color: "#3a5e2e" },
  revision:    { label: "طلب تعديل",     icon: "fa-rotate-left",           color: "#7a2518" },
  task_create: { label: "إنشاء مهمة",    icon: "fa-plus",                  color: "#2d4a63" },
  task_update: { label: "تحديث مهمة",    icon: "fa-list-check",            color: "#9c6e38" },
  comment:     { label: "تعليق",         icon: "fa-comment",               color: "#6b4f35" },
  login:       { label: "تسجيل دخول",    icon: "fa-right-to-bracket",      color: "#6b4f35" }
};
