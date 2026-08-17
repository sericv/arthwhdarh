/**
 * نظام التعميمات والإعلانات الداخلية — بوابة الموظفين (جمعية إرث وحضارة)
 * نشر ومتابعة التعميمات وتتبع المشاهدات الإدارية وتخزين المرفقات في SharePoint.
 */

import { ANNOUNCEMENT_TYPES } from "./config.js";
import * as S from "./services.js";

function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatArabicDate(dateVal) {
  if (!dateVal) return "";
  let d;
  if (dateVal.toDate && typeof dateVal.toDate === "function") {
    d = dateVal.toDate();
  } else {
    d = new Date(dateVal);
  }
  if (isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd}`;
}

function formatArabicDateTime(dateVal) {
  if (!dateVal) return "";
  let d;
  if (dateVal.toDate && typeof dateVal.toDate === "function") {
    d = dateVal.toDate();
  } else {
    d = new Date(dateVal);
  }
  if (isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "م" : "ص";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hh = String(hours).padStart(2, "0");

  return `${yyyy}/${mm}/${dd} - ${hh}:${minutes} ${ampm}`;
}

let currentFilter = "all";
let searchQuery = "";
let announcementsCache = [];

export async function renderAnnouncements(el) {
  if (!el) el = document.getElementById("viewHost");
  const currentUser = window.State?.user;

  const isAuthorizedAdmin = currentUser && (
    currentUser.role === "executive" ||
    currentUser.isTechAdmin === true ||
    currentUser.role === "tech_admin"
  );

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:24px;">
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--gold-deep);margin-bottom:4px;">
          <i class="fa-solid fa-bullhorn" style="margin-left:4px;"></i> التعميمات والإعلانات
        </div>
        <h1 style="font-size:22px;font-weight:800;color:var(--ink);margin:0;">التعميمات الرسمية والقرارات الداخلية</h1>
      </div>

      ${isAuthorizedAdmin ? `
        <button type="button" class="btn btn-primary ann-create-btn" id="btnOpenCreateAnnouncement">
          <i class="fa-solid fa-plus"></i> نشر تعميم جديد
        </button>
      ` : ""}
    </div>

    <!-- شريط التصفية والبحث -->
    <div class="card ann-toolbar-card">
      <div class="ann-filter-bar">
        <button type="button" class="ann-filter-btn active" data-filter="all">الكل</button>
        <button type="button" class="ann-filter-btn" data-filter="general">عام</button>
        <button type="button" class="ann-filter-btn" data-filter="important">مهم</button>
        <button type="button" class="ann-filter-btn" data-filter="urgent">عاجل</button>
        <button type="button" class="ann-filter-btn" data-filter="other">أخرى</button>
      </div>

      <div class="ann-search-wrap">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" id="annSearchInput" class="ann-search-input" placeholder="بحث في التعميمات...">
      </div>
    </div>

    <!-- شبكة التعميمات -->
    <div id="announcementsListWrap">
      <div style="text-align:center;padding:48px 0;color:var(--ink-muted);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:28px;color:var(--gold-deep);margin-bottom:12px;"></i>
        <div>جاري تحميل التعميمات...</div>
      </div>
    </div>
  `;

  // ربط أزرار التصفية
  el.querySelectorAll(".ann-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      el.querySelectorAll(".ann-filter-btn").forEach(b => b.classList.toggle("active", b === btn));
      renderAnnouncementsCards();
    });
  });

  // ربط حقل البحث
  el.querySelector("#annSearchInput")?.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderAnnouncementsCards();
  });

  // زر إنشاء تعميم للمصرح لهم
  el.querySelector("#btnOpenCreateAnnouncement")?.addEventListener("click", () => {
    openCreateAnnouncementModal(currentUser, () => {
      loadAndRenderAnnouncements();
    });
  });

  await loadAndRenderAnnouncements();
}

async function loadAndRenderAnnouncements() {
  const currentUser = window.State?.user;
  announcementsCache = await S.listAnnouncements(currentUser);
  renderAnnouncementsCards();
}

function renderAnnouncementsCards() {
  const wrap = document.getElementById("announcementsListWrap");
  if (!wrap) return;
  const currentUser = window.State?.user;

  const isAuthorizedAdmin = currentUser && (
    currentUser.role === "executive" ||
    currentUser.isTechAdmin === true ||
    currentUser.role === "tech_admin"
  );

  let filtered = announcementsCache.filter(item => {
    if (currentFilter !== "all" && item.type !== currentFilter) return false;
    if (searchQuery) {
      const titleMatch = (item.title || "").toLowerCase().includes(searchQuery);
      const contentMatch = (item.content || "").toLowerCase().includes(searchQuery);
      if (!titleMatch && !contentMatch) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    wrap.innerHTML = `
      <div class="card" style="padding:48px 24px;text-align:center;color:var(--ink-muted);">
        <i class="fa-solid fa-bullhorn" style="font-size:42px;color:var(--gold-soft);margin-bottom:14px;"></i>
        <h3 style="font-size:16px;font-weight:700;color:var(--ink);margin:0 0 6px;">لا توجد تعميمات حالياً</h3>
        <p style="font-size:13px;margin:0;">لم يتم نشر أي تعميمات تطابق معايير البحث الحالية.</p>
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <div class="announcements-grid">
      ${filtered.map(item => {
        const typeMeta = ANNOUNCEMENT_TYPES[item.type] || ANNOUNCEMENT_TYPES.general;
        const dateFormatted = formatArabicDate(item.createdAt || item.createdAtIso);
        const hasAttachment = Boolean(item.attachment);

        return `
          <div class="ann-card" data-ann-id="${item.id}">
            <div class="ann-card-header">
              <span class="ann-type-badge" style="background:${typeMeta.bg};color:${typeMeta.color};">
                <i class="fa-solid ${typeMeta.icon}"></i> ${typeMeta.label}
              </span>
              <span class="ann-date">
                <i class="fa-regular fa-calendar"></i> ${dateFormatted}
              </span>
            </div>

            <h3 class="ann-title">${esc(item.title)}</h3>
            <p class="ann-snippet">${esc(item.content)}</p>

            <div class="ann-card-footer">
              <div>
                ${hasAttachment ? `
                  <span class="ann-attach-tag">
                    <i class="fa-solid fa-paperclip"></i> مرفق متوفر
                  </span>
                ` : `<span></span>`}
              </div>

              <div style="display:flex;align-items:center;gap:6px;">
                ${isAuthorizedAdmin ? `
                  <!-- أيقونة العين الإدارية الخاصة بالمدير فقط دون أي أرقام أو نصوص -->
                  <button type="button" class="ann-eye-btn" data-views-ann-id="${item.id}" title="سجل المشاهدات">
                    <i class="fa-solid fa-eye"></i>
                  </button>
                ` : ""}
                <button type="button" class="ann-details-btn">
                  عرض التفاصيل <i class="fa-solid fa-chevron-left"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  // ربط فتح تفاصيل التعميم
  wrap.querySelectorAll(".ann-card").forEach(card => {
    card.addEventListener("click", (e) => {
      // إذا كان النقر على زر المشاهدات الإداري لا نفتح تفاصيل التعميم العادية
      if (e.target.closest(".ann-eye-btn")) return;
      const annId = card.dataset.annId;
      const item = announcementsCache.find(a => a.id === annId);
      if (item) openAnnouncementDetailsModal(item);
    });
  });

  // ربط زر المشاهدات للمدير
  wrap.querySelectorAll(".ann-eye-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const annId = btn.dataset.viewsAnnId;
      const item = announcementsCache.find(a => a.id === annId);
      if (item) openAnnouncementViewsModal(item.id, item.title);
    });
  });
}

/* ════════════════ تفاصيل التعميم (Detail Modal) ════════════════ */
function openAnnouncementDetailsModal(item) {
  const currentUser = window.State?.user;
  const typeMeta = ANNOUNCEMENT_TYPES[item.type] || ANNOUNCEMENT_TYPES.general;
  const dateFormatted = formatArabicDateTime(item.createdAt || item.createdAtIso);
  const hasAttachment = Boolean(item.attachment);

  // 1. تسجيل مشاهدة الموظف في الخلفية فور فتح التعميم
  if (currentUser) {
    S.recordAnnouncementView(item.id, currentUser);
  }

  if (typeof window.openModal !== "function") return;

  // 2. جلب بيانات الناشر الفعلي من الـ State / Firestore
  const users = window.State?.users || [];
  const publisherUser = users.find(u => u.uid === item.createdById);

  const publisherName = publisherUser?.name || item.createdByName || "إدارة الجمعية";
  const publisherRole = publisherUser?.roleTitle || publisherUser?.jobTitle || (publisherUser?.role === "executive" ? "المدير التنفيذي" : "إدارة الجمعية");

  // 3. معالجة المرفق ببطاقة مصغّرة ومجهزة (Compact)
  let attachHtml = "";
  if (hasAttachment) {
    const att = item.attachment;
    const downloadUrl = S.getAnnouncementAttachmentDownloadUrl(att.url, att);
    const previewUrl = S.getAnnouncementAttachmentPreviewUrl(att.url, att);
    const fileName = att.name || "مرفق التعميم الرسمي";
    const ext = (fileName.split('.').pop() || '').toLowerCase();

    let iconClass = "fa-solid fa-file-lines";
    let iconColor = "var(--gold-deep)";
    let fileTypeLabel = "مستند";

    if (ext === "pdf") {
      iconClass = "fa-solid fa-file-pdf";
      iconColor = "#dc3545";
      fileTypeLabel = "PDF";
    } else if (["doc", "docx"].includes(ext)) {
      iconClass = "fa-solid fa-file-word";
      iconColor = "#2b579a";
      fileTypeLabel = "Word";
    } else if (["xls", "xlsx"].includes(ext)) {
      iconClass = "fa-solid fa-file-excel";
      iconColor = "#217346";
      fileTypeLabel = "Excel";
    } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      iconClass = "fa-solid fa-file-image";
      iconColor = "var(--gold-deep)";
      fileTypeLabel = "صورة";
    }

    attachHtml = `
      <div style="margin-top:14px;">
        <div class="ann-compact-attachment">
          <div class="ann-compact-att-info">
            <i class="${iconClass}" style="color:${iconColor};font-size:16px;"></i>
            <span class="ann-compact-att-name" title="${esc(fileName)}">${esc(fileName)}</span>
            <span class="ann-compact-att-sub">(${fileTypeLabel})</span>
          </div>
          <div class="ann-compact-att-btns">
            <a href="${previewUrl}" target="_blank" class="ann-compact-btn preview" title="معاينة">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> معاينة
            </a>
            <a href="${downloadUrl}" target="_blank" download="${esc(fileName)}" class="ann-compact-btn download" title="تحميل">
              <i class="fa-solid fa-download"></i> تحميل
            </a>
          </div>
        </div>
      </div>
    `;
  }

  const modalHtml = `
    <!-- Top Row: التصنيف والتاريخ والتسلسل الهادئ -->
    <div class="ann-clean-header">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="ann-type-badge" style="background:${typeMeta.bg};color:${typeMeta.color};">
          <i class="fa-solid ${typeMeta.icon}"></i> ${typeMeta.label}
        </span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="ann-clean-date">${dateFormatted}</span>
        <button class="modal-close" data-close title="إغلاق النافذة"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>

    <!-- العنوان الرئيسي (العنصر البارز الأساسي) -->
    <h2 class="ann-clean-title">${esc(item.title)}</h2>

    <!-- سطر الناشر الهادئ والمصغر -->
    <div class="ann-compact-publisher">
      <span>نُشر بواسطة: <strong>${esc(publisherName)}</strong></span>
      <span class="pub-role">(${esc(publisherRole)})</span>
    </div>

    <!-- نص التعميم الرئيسي -->
    <div class="ann-clean-body">
      ${esc(item.content)}
    </div>

    <!-- المرفق المصغّر (إن وجد) -->
    ${attachHtml}

    <!-- Footer محدد ومختصر بدون قسم المرجعية -->
    <div class="ann-compact-footer">
      <button type="button" class="btn btn-secondary btn-sm" data-close style="padding:5px 18px;font-size:12px;">إغلاق</button>
    </div>
  `;

  window.openModal(modalHtml, true);
}

/* ════════════════ سجل المشاهدات للمدير فقط (Admin Views Modal) ════════════════ */
export async function openAnnouncementViewsModal(announcementId, announcementTitle) {
  if (typeof window.openModal !== "function") return;

  window.openModal(`
    <div class="modal-head">
      <div>
        <h2 style="font-size:17px;font-weight:800;color:var(--ink);margin:0 0 2px;">المشاهدات</h2>
        <div style="font-size:12px;color:var(--ink-muted);">الموظفون الذين شاهدوا هذا التعميم</div>
      </div>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>

    <div class="ann-views-wrap">
      <div class="ann-views-search">
        <input type="text" id="viewsSearchInput" class="input" placeholder="بحث باسم الموظف..." style="font-size:12.5px;height:36px;">
      </div>

      <div id="viewsContentHost">
        <div style="text-align:center;padding:32px 0;color:var(--ink-muted);">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;color:var(--gold-deep);margin-bottom:8px;"></i>
          <div>جاري تحميل سجل المشاهدات...</div>
        </div>
      </div>
    </div>
  `);

  const views = await S.listAnnouncementViews(announcementId);
  const host = document.getElementById("viewsContentHost");
  if (!host) return;

  function renderList(filter = "") {
    const matched = views.filter(v => {
      if (!filter) return true;
      return (v.employeeName || "").toLowerCase().includes(filter.toLowerCase());
    });

    if (matched.length === 0) {
      host.innerHTML = `
        <div class="ann-views-empty">
          <i class="fa-regular fa-eye-slash" style="font-size:32px;color:var(--ink-faint);margin-bottom:8px;display:block;"></i>
          لم تتم مشاهدة هذا التعميم حتى الآن.
        </div>
      `;
      return;
    }

    host.innerHTML = `
      <div class="ann-views-list">
        ${matched.map(v => {
          const initial = (v.employeeName || "م").trim().charAt(0);
          const timeFormatted = formatArabicDateTime(v.viewedAt);

          return `
            <div class="ann-view-row">
              <div class="ann-view-user">
                <div class="ann-view-avatar">${initial}</div>
                <div>
                  <div class="ann-view-name">${esc(v.employeeName)}</div>
                  ${v.department ? `<div class="ann-view-dept">${esc(v.department)}</div>` : ""}
                </div>
              </div>
              <div class="ann-view-time">${timeFormatted}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  renderList();

  document.getElementById("viewsSearchInput")?.addEventListener("input", (e) => {
    renderList(e.target.value.trim());
  });
}

/* ════════════════ نافذة نشر تعميم جديد (Create Announcement Modal) ════════════════ */
export function openCreateAnnouncementModal(currentUser, onCreated) {
  if (typeof window.openModal !== "function") return;

  const users = window.State?.users || [];
  const employeesOnly = users.filter(u => u.status !== "inactive" && u.uid !== currentUser?.uid);

  window.openModal(`
    <div class="modal-head">
      <h2>نشر تعميم رسمي جديد</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>

    <form id="createAnnouncementForm" style="display:flex;flex-direction:column;gap:14px;">
      <div class="form-group">
        <label>عنوان التعميم <span style="color:var(--danger);">*</span></label>
        <input type="text" id="annTitleInput" class="input" placeholder="مثال: تعميم بشأن مواعيد العمل خلال شهر رمضان المبارك" required>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label>نوع التعميم</label>
          <select id="annTypeSelect" class="input">
            <option value="general">عام</option>
            <option value="important">مهم</option>
            <option value="urgent">عاجل</option>
            <option value="other">أخرى</option>
          </select>
        </div>

        <div class="form-group">
          <label>المستهدفون</label>
          <select id="annAudienceSelect" class="input">
            <option value="all">جميع الموظفين</option>
            <option value="specific">موظفين محددين</option>
          </select>
        </div>
      </div>

      <!-- قائمة الموظفين المحددين -->
      <div id="annSpecificUsersWrap" style="display:none;background:var(--bg-subtle);padding:12px;border-radius:var(--r-sm);border:1px solid var(--line-soft);max-height:160px;overflow-y:auto;">
        <label style="font-size:12px;font-weight:700;margin-bottom:6px;display:block;">حدد الموظفين المستهدفين:</label>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${employeesOnly.map(u => `
            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer;">
              <input type="checkbox" class="ann-emp-chk" value="${u.uid}">
              <span>${esc(u.name || u.email)} ${u.department ? `<small style="color:var(--ink-muted);">(${esc(u.department)})</small>` : ""}</span>
            </label>
          `).join("")}
        </div>
      </div>

      <div class="form-group">
        <label>نص وتفاصيل التعميم <span style="color:var(--danger);">*</span></label>
        <textarea id="annContentInput" class="input" rows="5" placeholder="اكتب نص التعميم بالتفصيل هنا..." required style="resize:vertical;"></textarea>
      </div>

      <!-- مرفق التعميم (SharePoint) -->
      <div class="form-group">
        <label>مرفق التعميم (اختياري)</label>
        <input type="file" id="annFileInput" class="input" accept=".pdf,.doc,.docx,.jpg,.png">
        <div id="annUploadStatus" style="font-size:11.5px;color:var(--gold-deep);margin-top:4px;display:none;"></div>
      </div>

      <div id="annCreateErr" style="color:var(--danger);font-size:12px;display:none;"></div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="submit" class="btn btn-primary" id="btnSubmitAnnouncement" style="padding:9px 26px;">
          <i class="fa-solid fa-paper-plane"></i> نشر التعميم
        </button>
      </div>
    </form>
  `);

  const audienceSelect = document.getElementById("annAudienceSelect");
  const specificWrap = document.getElementById("annSpecificUsersWrap");

  audienceSelect?.addEventListener("change", () => {
    specificWrap.style.display = (audienceSelect.value === "specific") ? "block" : "none";
  });

  const form = document.getElementById("createAnnouncementForm");
  const submitBtn = document.getElementById("btnSubmitAnnouncement");
  const errDiv = document.getElementById("annCreateErr");
  const statusDiv = document.getElementById("annUploadStatus");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    errDiv.style.display = "none";

    const title = document.getElementById("annTitleInput")?.value.trim();
    const content = document.getElementById("annContentInput")?.value.trim();
    const type = document.getElementById("annTypeSelect")?.value || "general";
    const targetAudience = audienceSelect?.value || "all";
    const fileInput = document.getElementById("annFileInput");
    const file = fileInput?.files[0];

    let targetUids = [];
    if (targetAudience === "specific") {
      document.querySelectorAll(".ann-emp-chk:checked").forEach(chk => {
        targetUids.push(chk.value);
      });
      if (targetUids.length === 0) {
        errDiv.textContent = "يرجى تحديد موظف واحد على الأقل";
        errDiv.style.display = "block";
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري النشر...`;

    try {
      let attachmentObj = null;

      // 1. رفع المرفق إلى Microsoft SharePoint إن وُجد
      if (file) {
        statusDiv.style.display = "block";
        statusDiv.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> جاري رفع المرفق إلى SharePoint...`;
        const tempId = `ann_${Date.now()}`;
        attachmentObj = await S.uploadAnnouncementAttachment({
          announcementId: tempId
        }, file);
      }

      // 2. إنشاء مستند التعميم في Firestore
      await S.createAnnouncement({
        title,
        content,
        type,
        targetAudience,
        targetUids,
        attachment: attachmentObj
      }, currentUser);

      // 3. عرض الرسوم المتحركة للنجاح (Success Animation) بسلاسة
      if (typeof window.showActionSuccess === "function") {
        await window.showActionSuccess({
          title: "تم نشر التعميم",
          message: "تم إرسال التعميم إلى الموظفين المحددين",
          inModal: true,
          duration: 850
        });
      } else {
        if (window.closeModal) window.closeModal();
        if (window.toast) window.toast("تم نشر التعميم بنجاح!");
      }

      if (onCreated) onCreated();
    } catch (err) {
      console.error(err);
      errDiv.textContent = `حدث خطأ أثناء النشر: ${err.message || err}`;
      errDiv.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> نشر التعميم`;
    }
  });
}
