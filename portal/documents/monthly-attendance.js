/* ══════════════════════════════════════════════════════════
   جمعية إرث وحضارة بالقريات — Portal Document Templates
   Template: Total Monthly Attendance PDF Report (تقرير الحضور الشهري الكلي لجميع الموظفين)
   ══════════════════════════════════════════════════════════ */

import { buildMasterDocumentHtml, renderAndDownloadPdfWithPuppeteer } from "./master-template.js";

export function getPdfStatusBadge(status) {
  if (status === "present") return `<span class="pdf-badge badge-present">🟢 حاضر</span>`;
  if (status === "late") return `<span class="pdf-badge badge-late">🟡 متأخر</span>`;
  if (status === "absent") return `<span class="pdf-badge badge-absent">🔴 غائب</span>`;
  if (status === "leave") return `<span class="pdf-badge badge-leave">🟣 إجازة</span>`;
  return `<span class="pdf-badge badge-none">⚪ غير مسجل</span>`;
}

export async function downloadMonthlyAttendancePDF(btnOrContext, maybeContext) {
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
    btn = document.getElementById("btnExportMonthlyPDF");
  }

  const { State, getMonthNameArabic, esc } = context;
  const safeState = State || (typeof window !== "undefined" ? window.State : {});
  const safeEsc = esc || ((s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));
  const safeMonthName = getMonthNameArabic || (typeof window !== "undefined" ? window.getMonthNameArabic : ((m) => `شهر ${m}`));

  const y = safeState.attendanceYear || new Date().getFullYear();
  const m = safeState.attendanceMonth || (new Date().getMonth() + 1);
  const members = safeState.members || [];
  const records = safeState.attendanceRecords || [];

  const recMap = new Map();
  records.forEach(r => recMap.set(`${r.employeeUid}_${r.date}`, r));

  const daysInMonth = new Date(y, m, 0).getDate();
  const startDateStr = `01 ${safeMonthName(m)} ${y}`;
  const endDateStr = `${daysInMonth} ${safeMonthName(m)} ${y}`;

  let totalPresent = 0, totalLate = 0, totalLateMins = 0, totalAbsent = 0, totalLeaves = 0;

  const empSummaries = members.map(emp => {
    let p = 0, l = 0, lm = 0, a = 0, lv = 0;
    const dailyRecords = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const r = recMap.get(`${emp.uid}_${dStr}`);
      const st = r ? r.status : "unregistered";

      if (st === "present") p++;
      else if (st === "late") { l++; lm += (r?.lateMinutes || 0); }
      else if (st === "absent") a++;
      else if (st === "leave") lv++;

      dailyRecords.push({ day: d, date: dStr, record: r, status: st });
    }

    totalPresent += p;
    totalLate += l;
    totalLateMins += lm;
    totalAbsent += a;
    totalLeaves += lv;

    return { emp, p, l, lm, a, lv, dailyRecords };
  });

  const totalWorkingDays = (daysInMonth * members.length) || 1;
  const disciplineRate = Math.min(100, Math.round(((totalPresent + totalLeaves) / totalWorkingDays) * 100));

  const contentHtml = `
    <!-- كروت ملخص المؤشرات الإدارية KPI -->
    <div class="pdf-kpi-grid">
      <div class="pdf-kpi-card">
        <div class="pdf-kpi-val">${members.length}</div>
        <div class="pdf-kpi-lbl">إجمالي الكادر الوظيفي</div>
      </div>
      <div class="pdf-kpi-card" style="border-top-color:#1F7A4C;">
        <div class="pdf-kpi-val" style="color:#1F7A4C;">${disciplineRate}%</div>
        <div class="pdf-kpi-lbl">مؤشر الانضباط العام</div>
      </div>
      <div class="pdf-kpi-card" style="border-top-color:#1F7A4C;">
        <div class="pdf-kpi-val" style="color:#1F7A4C;">${totalPresent}</div>
        <div class="pdf-kpi-lbl">إجمالي أيام الحضور</div>
      </div>
      <div class="pdf-kpi-card" style="border-top-color:#947124;">
        <div class="pdf-kpi-val" style="color:#947124;">${totalLate} <span style="font-size:12px; font-weight:600;">(${totalLateMins} د)</span></div>
        <div class="pdf-kpi-lbl">حالات التأخير الموثقة</div>
      </div>
      <div class="pdf-kpi-card" style="border-top-color:#A82A2A;">
        <div class="pdf-kpi-val" style="color:#A82A2A;">${totalAbsent}</div>
        <div class="pdf-kpi-lbl">إجمالي أيام الغياب</div>
      </div>
      <div class="pdf-kpi-card" style="border-top-color:#2B5EA8;">
        <div class="pdf-kpi-val" style="color:#2B5EA8;">${totalLeaves}</div>
        <div class="pdf-kpi-lbl">أيام الإجازات المعتمدة</div>
      </div>
    </div>

    <!-- جدول ملخص كادر الموظفين -->
    <div class="pdf-section-head">
      <h3><i class="fa-solid fa-users-rectangle"></i> أولاً: ملخص الانضباط الوظيفي حسب الموظفين</h3>
    </div>
    
    <table class="pdf-table">
      <thead>
        <tr>
          <th style="width:36px; text-align:center;">#</th>
          <th>اسم الموظف</th>
          <th>القسم / الإدارة</th>
          <th style="text-align:center;">الحضور</th>
          <th style="text-align:center;">التأخير</th>
          <th style="text-align:center;">دقائق التأخير</th>
          <th style="text-align:center;">الغياب</th>
          <th style="text-align:center;">الإجازات</th>
        </tr>
      </thead>
      <tbody>
        ${empSummaries.map((item, idx) => `
          <tr>
            <td style="text-align:center; font-weight:700;">${idx + 1}</td>
            <td><strong>${safeEsc(item.emp.name || item.emp.email)}</strong></td>
            <td>${safeEsc(item.emp.department || "—")}</td>
            <td style="text-align:center;"><span class="pdf-badge badge-present">${item.p} يوم</span></td>
            <td style="text-align:center;"><span class="pdf-badge badge-late">${item.l} يوم</span></td>
            <td style="text-align:center; font-weight:800; color:#947124;">${item.lm} دقيقة</td>
            <td style="text-align:center;"><span class="pdf-badge badge-absent">${item.a} يوم</span></td>
            <td style="text-align:center;"><span class="pdf-badge badge-leave">${item.lv} يوم</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="page-break"></div>

    <!-- ثانياً: تفاصيل السجلات السلوكية لكل موظف -->
    <div class="pdf-section-head">
      <h3><i class="fa-solid fa-list-ol"></i> ثانياً: التفاصيل السلوكية واليومية للكادر الوظيفي</h3>
    </div>

    ${empSummaries.map(item => `
      <div class="pdf-emp-block">
        <div class="pdf-emp-banner">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="pdf-emp-avatar">${(item.emp.name || item.emp.email || "م")[0]}</div>
            <div>
              <div class="pdf-emp-name">${safeEsc(item.emp.name || item.emp.email)}</div>
              <div class="pdf-emp-dept">القسم: ${safeEsc(item.emp.department || "عام")}</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="pdf-badge badge-present">حاضر: ${item.p}</span>
            <span class="pdf-badge badge-late">تأخير: ${item.l} (${item.lm}د)</span>
            <span class="pdf-badge badge-absent">غياب: ${item.a}</span>
            <span class="pdf-badge badge-leave">إجازة: ${item.lv}</span>
          </div>
        </div>

        <table class="pdf-table">
          <thead>
            <tr>
              <th style="width:110px;">التاريخ</th>
              <th style="width:90px; text-align:center;">الحالة</th>
              <th style="width:110px; text-align:center;">وقت الوصول</th>
              <th style="width:110px; text-align:center;">دقائق التأخير</th>
              <th>الملاحظات والاعتمادات الرسمية</th>
            </tr>
          </thead>
          <tbody>
            ${item.dailyRecords.map(r => `
              <tr>
                <td><strong>${r.date}</strong></td>
                <td style="text-align:center;">${getPdfStatusBadge(r.status)}</td>
                <td style="text-align:center; font-weight:600;">${r.record?.checkInTime ? safeEsc(r.record.checkInTime) : "—"}</td>
                <td style="text-align:center; font-weight:700; color:${r.record?.lateMinutes > 0 ? '#947124' : '#857A6E'};">${r.record?.lateMinutes > 0 ? `${r.record.lateMinutes} دقيقة` : "0"}</td>
                <td style="color:#574E45;">${r.record?.notes ? safeEsc(r.record.notes) : "—"}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}
  `;

  const originUrl = (typeof window !== "undefined" && window.location) ? window.location.origin : "https://arthwhdarh.com";
  const fullLogoUrl = `${originUrl}/portal/logo.png`;

  const filename = `تقرير_الحضور_الشهري_${safeMonthName(m)}_${y}`;

  const fullHtml = buildMasterDocumentHtml({
    docTitle: "تقرير الحضور والانصراف الشهري الكلي",
    docSubtitle: `الفترة المشمولة: ${startDateStr} — ${endDateStr}`,
    badgeText: "تقرير الحضور الشهري الكلي",
    refNo: `REP-ATT-${y}-${String(m).padStart(2, '0')}`,
    docDate: new Date().toLocaleDateString('ar-SA'),
    contentHtml: contentHtml,
    userState: context.State?.user,
    logoUrl: fullLogoUrl
  });

  await renderAndDownloadPdfWithPuppeteer(fullHtml, filename, btn, context);
}
