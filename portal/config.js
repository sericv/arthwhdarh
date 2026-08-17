/* ══════════════════════════════════════════════════════════
   إعدادات البوابة الداخلية — جمعية إرث وحضارة بالقريات
   Portal Configuration · Firebase + Roles + Departments + Leaves
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

/* ── FCM — المفتاح العام فقط (Pair / Public VAPID Key) ── */
export const VAPID_KEY =
  "BCKgPuOcFdhJrT9OvSDGUikINaoL2Hr5gOdovSqG7jN_iiH_ESgCPtLOLrx7THPIQPR8C6ZaT-hdpxLnw9BLpmM";

/* ── عنوان Cloudflare Worker لإرسال الدفع ── */
export const PUSH_ENDPOINT = "https://erth-portal-push.2falilh2.workers.dev";

/* ── Cloudinary (إعدادات الرفع الآمن المباشر Unsigned Upload) ── */
export const CLOUDINARY_CONFIG = {
  cloudName: "dgbkvo1wk",
  uploadPreset: "employee-portal"
};

/* ── أسماء مجموعات Firestore ── */
export const COL = {
  users:         "portal_users",
  files:         "portal_files",
  tasks:         "portal_tasks",
  leaves:        "portal_leaves",       // طلبات الإجازات
  notifications: "portal_notifications",
  tokens:        "portal_fcm_tokens",   // رموز FCM (متعددة الأجهزة)
  personalTasks: "portal_personal_tasks",
  suggestions:   "portal_suggestions_complaints",
  announcements: "portal_announcements"
};

/* ── أنواع التعميمات والإعلانات ── */
export const ANNOUNCEMENT_TYPES = {
  general:   { label: "عام",    la: "General",   color: "var(--info)",        bg: "rgba(37, 99, 235, 0.1)",  icon: "fa-bullhorn" },
  important: { label: "مهم",    la: "Important", color: "var(--gold-deep)",   bg: "rgba(156, 110, 56, 0.12)", icon: "fa-star" },
  urgent:    { label: "عاجل",   la: "Urgent",    color: "var(--danger)",      bg: "rgba(220, 38, 38, 0.1)",  icon: "fa-triangle-exclamation" },
  other:     { label: "أخرى",   la: "Other",     color: "var(--ink-mid)",     bg: "rgba(0, 0, 0, 0.06)",     icon: "fa-circle-info" }
};

/* ── الصلاحيات القياسية الثلاث ──
   1. employee (موظف)
   2. hr (موارد بشرية)
   3. executive (مدير تنفيذي)
   + المسؤول التقني (tech_admin) صلاحية خاصة لإدارة الحسابات وكلمات المرور. */
export const ROLES = {
  employee: {
    label:        "موظف",
    la:           "Employee",
    canCreateTask:false,
    canReviewLeave:false,
    canApproveLeave:false,
    canViewEmployees:false,
    canManageUsers:false,
    accent:       "#2d4a63"
  },
  hr: {
    label:        "الموارد البشرية",
    la:           "Human Resources",
    canCreateTask:false,
    canReviewLeave:true,      // تراجع الموافقة الأولية للإجازة
    canApproveLeave:false,
    canViewEmployees:true,     // ترى دليل الموظفين
    canManageUsers:false,
    accent:       "#3a5e2e"
  },
  executive: {
    label:        "مدير تنفيذي",
    la:           "Executive Director",
    canCreateTask:true,       // تنشئ المهام
    canReviewLeave:true,
    canApproveLeave:true,     // تعتمد الإجازات نهائياً
    canViewEmployees:true,     // ترى دليل الموظفين
    canManageUsers:false,     // إدارة الحسابات للمسؤول التقني فقط
    accent:       "#9c6e38"
  }
};

/* ── الإدارات والأقسام ── */
export const DEPARTMENTS = {
  hr: {
    label: "الموارد البشرية", la: "Human Resources",
    icon:  "fa-users-gear"
  },
  finance: {
    label: "الإدارة المالية", la: "Finance",
    icon:  "fa-coins"
  },
  projects: {
    label: "إدارة المشاريع", la: "Projects",
    icon:  "fa-diagram-project"
  },
  media: {
    label: "الإعلام والعلاقات العامة", la: "Media & PR",
    icon:  "fa-photo-film"
  },
  executive: {
    label: "الإدارة التنفيذية", la: "Executive",
    icon:  "fa-building-columns"
  }
};

/* ── حالات الملفات ── */
export const FILE_STATUS = {
  draft:        { label: "مسودة",        la: "Draft",        color: "#6b4f35", bg: "rgba(107,79,53,.1)" },
  under_review: { label: "قيد المراجعة",  la: "Under Review", color: "#9c6e38", bg: "rgba(192,154,98,.1)" },
  approved:     { label: "معتمد",        la: "Approved",     color: "#3a5e2e", bg: "rgba(58,94,46,.1)" },
  rejected:     { label: "مرفوض",        la: "Rejected",     color: "#7a2518", bg: "rgba(122,37,24,.1)" }
};

/* ── أنواع الإجازات ── */
export const LEAVE_TYPES = {
  annual:  { label: "إجازة سنوية",   la: "Annual Leave",  icon: "fa-plane-departure" },
  sick:    { label: "إجازة مرضية",   la: "Sick Leave",    icon: "fa-user-nurse" },
  urgent:  { label: "إجازة اضطرارية", la: "Urgent Leave",  icon: "fa-triangle-exclamation" },
  unpaid:  { label: "بدون راتب",    la: "Unpaid Leave",  icon: "fa-hand-holding-dollar" },
  other:   { label: "إجازة أخرى",   la: "Other Leave",   icon: "fa-calendar-day" }
};

/* ── مراحل وحالات طلب الإجازة (Approval Stepper) ── */
export const LEAVE_STATUS = {
  submitted: {
    label: "تم إرسال الطلب",
    la: "Submitted",
    step: 1,
    color: "#2d4a63",
    bg: "rgba(45,74,99,.1)"
  },
  in_hr_review: {
    label: "قيد مراجعة الموارد البشرية",
    la: "In HR Review",
    step: 2,
    color: "#9c6e38",
    bg: "rgba(192,154,98,.1)"
  },
  hr_approved: {
    label: "بانتظار اعتماد المدير التنفيذي",
    la: "Awaiting Executive Approval",
    step: 3,
    color: "#b8651a",
    bg: "rgba(184,101,26,.1)"
  },
  approved: {
    label: "تم الاعتماد النهائي",
    la: "Approved",
    step: 4,
    color: "#3a5e2e",
    bg: "rgba(58,94,46,.1)"
  },
  hr_rejected: {
    label: "مرفوض من الموارد البشرية",
    la: "Rejected by HR",
    step: -1,
    color: "#7a2518",
    bg: "rgba(122,37,24,.1)"
  },
  exec_rejected: {
    label: "مرفوض من المدير التنفيذي",
    la: "Rejected by Executive",
    step: -1,
    color: "#7a2518",
    bg: "rgba(122,37,24,.1)"
  }
};

/* ── حالات المهام ── */
export const TASK_STATUS = {
  new:          { label: "جديدة",         la: "New",         color: "#2d4a63", bg: "rgba(45,74,99,.08)"   },
  in_progress:  { label: "قيد التنفيذ",   la: "In Progress", color: "#9c6e38", bg: "rgba(192,154,98,.10)" },
  under_review: { label: "بانتظار المراجعة", la: "In Review",   color: "#b8651a", bg: "rgba(184,101,26,.10)" },
  completed:    { label: "مكتملة",        la: "Completed",   color: "#3a5e2e", bg: "rgba(58,94,46,.08)"   }
};

/* ── أولويات المهام ── */
export const TASK_PRIORITY = {
  low:      { label: "منخفضة", la: "Low",      color: "#3a5e2e" },
  medium:   { label: "متوسطة", la: "Medium",   color: "#9c6e38" },
  high:     { label: "عالية",  la: "High",     color: "#b8651a" },
  critical: { label: "حرجة",   la: "Critical", color: "#7a2518" }
};

/* ── أنواع الإشعارات (المحدثة) ── */
export const NOTIF_TYPE = {
  task_new:       { label: "مهمة جديدة",     icon: "fa-list-check",       color: "#2d4a63", pref: "tasks"     },
  task_updated:   { label: "تحديث مهمة",     icon: "fa-pen-to-square",    color: "#9c6e38", pref: "tasks"     },
  task_completed: { label: "اكتمال مهمة",    icon: "fa-flag-checkered",   color: "#3a5e2e", pref: "tasks"     },
  leave_submitted:{ label: "طلب إجازة جديد", icon: "fa-calendar-plus",     color: "#2d4a63", pref: "leaves"    },
  leave_hr_appr:  { label: "موافقة الموارد",  icon: "fa-circle-check",     color: "#3a5e2e", pref: "leaves"    },
  leave_hr_rej:   { label: "رفض الموارد",    icon: "fa-circle-xmark",     color: "#7a2518", pref: "leaves"    },
  leave_exec_appr:{ label: "اعتماد الإجازة",  icon: "fa-certificate",      color: "#3a5e2e", pref: "leaves"    },
  leave_exec_rej: { label: "رفض المدير",      icon: "fa-circle-xmark",     color: "#7a2518", pref: "leaves"    },
  file_uploaded:  { label: "ملف جديد",       icon: "fa-file-arrow-up",    color: "#9c6e38", pref: "files"     },
  message_new:    { label: "رسالة جديدة",    icon: "fa-envelope",         color: "#2d4a63", pref: "messages"  },
  announcement:   { label: "تعميم جديد",      icon: "fa-bullhorn",         color: "#9c6e38", pref: "system" },
  feedback:       { label: "شكوى / اقتراح",   icon: "fa-comments",         color: "#9c6e38", pref: "system" },
  system_alert:   { label: "تنبيه النظام",   icon: "fa-triangle-exclamation", color: "#b8651a", pref: "system" }
};

/* ── تفضيلات الإشعارات ── */
export const NOTIF_PREFS = {
  tasks:    { label: "المهام",         la: "Tasks",     icon: "fa-list-check" },
  leaves:   { label: "الإجازات",      la: "Leaves",    icon: "fa-calendar-days" },
  files:    { label: "الملفات",        la: "Files",     icon: "fa-folder-open" },
  messages: { label: "الرسائل",        la: "Messages",  icon: "fa-envelope" },
  system:   { label: "تنبيهات النظام",  la: "System",    icon: "fa-triangle-exclamation" }
};
export const NOTIF_PREFS_DEFAULT = { tasks:true, leaves:true, files:true, messages:true, system:true };

/* ── إعدادات Microsoft SharePoint لبوابة الموظفين (للسير الذاتية CV) ── */
export const SHAREPOINT_CONFIG = {
  tenantId: "5380057d-dc58-45d5-8ae2-230b3ef6a2ef",
  clientId: "e92632b0-43b5-40a0-a2e7-b3130aca7c35",
  hostname: "arthwhdarh.sharepoint.com",
  siteId: "arthwhdarh.sharepoint.com,bb3ea8bd-1240-47ea-9acb-b3f580790fe7,e3a42d88-edbc-4597-99d1-f215f095c6ac",
  driveId: "b!vag-u0AS6keay7P1gHkP54gtpOO87ZdFmdHyFfCVxqyBUJAhWFk3TrtY3uYtcmis",
  libraryName: "مكتبة ملفات بوابة الموظفين",
  libraryUrl: "https://arthwhdarh.sharepoint.com/DocLib",
  cvFolder: "ملفات الموظفين/CV"
};


