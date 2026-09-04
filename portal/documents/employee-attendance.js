/* ══════════════════════════════════════════════════════════
   جمعية إرث وحضارة بالقريات — Portal Document Templates
   Template: Individual Employee Attendance PDF Report (تقرير الحضور التفصيلي للموظف)
   ══════════════════════════════════════════════════════════ */

import { buildMasterDocumentHtml, renderAndDownloadPdfWithPuppeteer } from "./master-template.js";
import { getPdfStatusBadge } from "./monthly-attendance.js";

export async function downloadEmployeeAttendancePDF(emp, year, month, dayRows, btnOrContext, maybeContext) {
  let btn = null;
  let context = {};

  if (btnOrContext && (btnOrContext.tagName || btnOrContext instanceof HTMLElement)) {
    btn = btnOrContext;
    context = maybeContext || {};
  } else if (btnOrContext && typeof btnOrContext === "object") {
    context = btnOrContext;
  } else {
    context = maybeContext || {};
  }

  if (!btn && typeof document !== "undefined") {
    btn = document.getElementById("btnExportEmpPDF");
  }

  const { getMonthNameArabic, esc } = context;
  const safeEsc = esc || ((s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));
  const safeMonthName = getMonthNameArabic || (typeof window !== "undefined" ? window.getMonthNameArabic : ((m) => `شهر ${m}`));

  let p = 0, l = 0, lm = 0, a = 0, lv = 0;
  (dayRows || []).forEach(r => {
    if (r.status === "present") p++;
    else if (r.status === "late") { l++; lm += (r.record?.lateMinutes || 0); }
    else if (r.status === "absent") a++;
    else if (r.status === "leave") lv++;
  });

  const daysInMonth = new Date(year, month, 0).getDate();
  const totalWorkingDays = daysInMonth || 1;
  const disciplineRate = Math.min(100, Math.round(((p + lv) / totalWorkingDays) * 100));

  const contentHtml = `
    <!-- شريط بيانات الموظف -->
    <div class="pdf-title-banner" style="margin-bottom:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="pdf-emp-avatar" style="width:48px; height:48px; font-size:18px;">${(emp.name || emp.email || "م")[0]}</div>
          <div>
            <h2 class="pdf-main-heading" style="font-size:18px;">${safeEsc(emp.name || emp.email)}</h2>
            <div style="font-size:13px; color:#574E45;">القسم: <strong>${safeEsc(emp.department || "عام")}</strong></div>
          </div>
        </div>
        <div class="pdf-period-pill">
          <i class="fa-solid fa-calendar-day"></i> شهر: <strong>${safeMonthName(month)} ${year}</strong>
        </div>
      </div>
    </div>

    <!-- كروت الإحصائيات الفردية -->
    <div class="pdf-kpi-grid">
      <div class="pdf-kpi-card" style="border-top-color:#1F7A4C;">
        <div class="pdf-kpi-val" style="color:#1F7A4C;">${disciplineRate}%</div>
        <div class="pdf-kpi-lbl">نسبة الالتزام والانتظام</div>
      </div>
      <div class="pdf-kpi-card" style="border-top-color:#1F7A4C;">
        <div class="pdf-kpi-val" style="color:#1F7A4C;">${p}</div>
        <div class="pdf-kpi-lbl">أيام الحضور الفعلي</div>
      </div>
      <div class="pdf-kpi-card" style="border-top-color:#947124;">
        <div class="pdf-kpi-val" style="color:#947124;">${l}</div>
        <div class="pdf-kpi-lbl">حالات التأخير المسجلة</div>
      </div>
      <div class="pdf-kpi-card" style="border-top-color:#947124;">
        <div class="pdf-kpi-val" style="color:#947124;">${lm}</div>
        <div class="pdf-kpi-lbl">إجمالي دقائق التأخير</div>
      </div>
      <div class="pdf-kpi-card" style="border-top-color:#A82A2A;">
        <div class="pdf-kpi-val" style="color:#A82A2A;">${a}</div>
        <div class="pdf-kpi-lbl">أيام الغياب</div>
      </div>
      <div class="pdf-kpi-card" style="border-top-color:#2B5EA8;">
        <div class="pdf-kpi-val" style="color:#2B5EA8;">${lv}</div>
        <div class="pdf-kpi-lbl">أيام الإجازة الرسمية</div>
      </div>
    </div>

    <!-- جدول أيام الشهر الكامل للموظف -->
    <div class="pdf-section-head">
      <h3><i class="fa-solid fa-calendar-check"></i> بيان سجل الأيام التفصيلي للشهر</h3>
    </div>

    <table class="pdf-table">
      <thead>
        <tr>
          <th style="width:120px;">التاريخ</th>
          <th style="width:100px; text-align:center;">الحالة</th>
          <th style="width:120px; text-align:center;">وقت الوصول الفعلي</th>
          <th style="width:120px; text-align:center;">دقائق التأخير</th>
          <th>الملاحظات الإدارية وتفاصيل الاعتماد</th>
        </tr>
      </thead>
      <tbody>
        ${(dayRows || []).map(row => `
          <tr>
            <td><strong>${row.date}</strong></td>
            <td style="text-align:center;">${getPdfStatusBadge(row.status)}</td>
            <td style="text-align:center; font-weight:600;">${row.record?.checkInTime ? safeEsc(row.record.checkInTime) : "—"}</td>
            <td style="text-align:center; font-weight:700; color:${row.record?.lateMinutes > 0 ? '#947124' : '#857A6E'};">${row.record?.lateMinutes > 0 ? `${row.record.lateMinutes} دقيقة` : "0"}</td>
            <td style="color:#574E45;">${row.record?.notes ? safeEsc(row.record.notes) : "—"}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- التواقيع والاعتمادات الرسمية -->
    <div class="pdf-signatures-wrap" style="display:flex; justify-content:space-between; margin-top:24px; padding-top:16px; border-top:1px solid #F2EDE4; page-break-inside:avoid; break-inside:avoid;">
      <div class="pdf-sig-box" style="text-align:center; flex:1;">
        <div class="pdf-sig-role" style="font-weight:700; font-size:12px; color:#1F1A15; margin-bottom:24px;">إعداد الموارد البشرية</div>
        <div class="pdf-sig-line" style="border-bottom:1px dashed #B88E36; width:60%; margin:0 auto 4px auto;"></div>
        <div class="pdf-sig-sub" style="font-size:10.5px; color:#857A6E;">التوقيع والاعتماد</div>
      </div>

      <div class="pdf-sig-box" style="text-align:center; flex:1;">
        <div class="pdf-sig-role" style="font-weight:700; font-size:12px; color:#1F1A15; margin-bottom:24px;">اعتماد المدير التنفيذي</div>
        <div class="pdf-sig-line" style="border-bottom:1px dashed #B88E36; width:60%; margin:0 auto 4px auto;"></div>
        <div class="pdf-sig-sub" style="font-size:10.5px; color:#857A6E;">التوقيع والتاريخ</div>
      </div>

      <div class="pdf-sig-box" style="text-align:center; flex:1;">
        <div class="pdf-sig-role" style="font-weight:700; font-size:12px; color:#1F1A15; margin-bottom:24px;">الختم الرسمي للجمعية</div>
        <div class="pdf-sig-stamp" style="width:50px; height:50px; border:1px dashed #B88E36; border-radius:50%; margin:0 auto;"></div>
      </div>
    </div>
  `;

  const originUrl = (typeof window !== "undefined" && window.location) ? window.location.origin : "https://arthwhdarh.org.sa";
  const fullLogoUrl = `${originUrl}/portal/logo.png`;

  const cleanEmpName = String(emp.name || emp.email || "الموظف").replace(/[/\\?%*:|"<>]/g, "_").trim();
  const filename = `تقرير_حضور_${cleanEmpName}_${safeMonthName(month)}_${year}`;

  const fullHtml = buildMasterDocumentHtml({
    docTitle: `بيان حضور الموظف: ${emp.name || emp.email || "الموظف"}`,
    badgeText: "بيان حضور موظف فردي",
    refNo: `EMP-ATT-${(emp.uid || "").slice(0, 6).toUpperCase()}`,
    docDate: new Date().toLocaleDateString('ar-SA'),
    contentHtml: contentHtml,
    userState: context.State?.user,
    logoUrl: fullLogoUrl
  });

  await renderAndDownloadPdfWithPuppeteer(fullHtml, filename, btn, context);
}
