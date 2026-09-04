/* ══════════════════════════════════════════════════════════
   جمعية إرث وحضارة بالقريات — Portal Document Templates
   Template: Official Leave Letter PDF (خطاب الإجازة الرسمية)
   ══════════════════════════════════════════════════════════ */

import { renderAndDownloadPdfWithPuppeteer } from "./master-template.js";

export async function generateLeavePdf(leaveId, btn, context = {}) {
  const { State, S, LEAVE_TYPES, getGregorianDate, getHijriDate, esc, toast } = context;
  const safeToast = toast || (typeof window !== "undefined" ? window.toast : null);
  const safeEsc = esc || ((s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));

  try {
    const leavesList = State ? [...(State.empLeaves || []), ...(State.execLeaves || []), ...(State.archiveLeaves || []), ...(State.hrLeaves || [])] : [];
    let leave = leavesList.find(l => l.id === leaveId);
    
    if (!leave && S && S.db) {
      const docRef = S.doc(S.db, S.COL.leaves, leaveId);
      const snap = await S.getDoc(docRef);
      if (snap.exists()) {
        leave = { id: snap.id, ...snap.data() };
      }
    }
    
    if (!leave) {
      throw new Error("لم يتم العثور على سجل الإجازة المطلوب.");
    }
    
    const leaveTypesDict = LEAVE_TYPES || (typeof window !== "undefined" ? window.LEAVE_TYPES : {});
    const typeLabel = leaveTypesDict[leave.type]?.label || leave.type;
    
    const formatGregorian = getGregorianDate || (typeof window !== "undefined" ? window.getGregorianDate : ((d) => d));
    const formatHijri = getHijriDate || (typeof window !== "undefined" ? window.getHijriDate : ((d) => d));

    const startDateM = formatGregorian(leave.startDate);
    const startDateH = formatHijri(leave.startDate);
    const endDateM = formatGregorian(leave.endDate);
    const endDateH = formatHijri(leave.endDate);
    
    let execName = "المدير التنفيذي";
    if (leave.approvedBy) {
      execName = leave.approvedBy;
    } else if (leave.execReview && leave.execReview.byName) {
      execName = leave.execReview.byName;
    } else if (leave.statusHistory && Array.isArray(leave.statusHistory)) {
      const appStep = leave.statusHistory.find(h => h.status === "approved" || h.action === "approve" || h.status === "exec_approved");
      if (appStep && (appStep.byName || appStep.by)) execName = appStep.byName || appStep.by;
    }

    const refNumber = safeEsc(leave.refNo || `LV-${leave.id.slice(0, 6).toUpperCase()}`);
    const cleanEmpName = String(leave.userName || leave.id || "الموظف").replace(/[/\\?%*:|"<>]/g, "_").trim();
    const filename = `خطاب_إجازة_${cleanEmpName}_${refNumber}`;

    const originUrl = (typeof window !== "undefined" && window.location) ? window.location.origin : "https://arthwhdarh.org.sa";
    const fullLogoUrl = `${originUrl}/portal/logo.png`;

    const fullHtmlDocument = `<!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${filename}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Noto+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          @page {
            size: A4 portrait;
            margin: 0;
          }

          html, body {
            background: #FAF8F2;
            min-height: 100vh;
            font-family: "IBM Plex Sans Arabic", "Noto Sans Arabic", "Tajawal", Arial, sans-serif;
            padding: 0;
            margin: 0;
            direction: rtl;
            color: #3A2A22;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body {
            display: flex;
            justify-content: center;
            align-items: center;
          }

          .page {
            width: 210mm;
            height: 297mm;
            max-height: 297mm;
            background: #FAF8F2;
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 12mm 16mm 10mm 16mm;
            box-sizing: border-box;
          }

          /* Watermark الهوية الرسمية */
          .watermark {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            opacity: 0.03;
            pointer-events: none;
            z-index: 0;
            width: 320px;
            height: 320px;
            text-align: center;
          }
          .watermark img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
          }

          /* ترويسة الصفحة والهوية */
          .document-header {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 0;
            position: relative;
            z-index: 2;
            margin-bottom: 4mm;
          }

          .association-logo {
            flex-shrink: 0;
            width: 54px;
            height: 52px;
            margin-left: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .association-logo img {
            max-width: 100%;
            max-height: 50px;
            width: auto;
            height: auto;
            display: block;
            object-fit: contain;
          }

          .top-brand-line {
            flex: 1;
            display: flex;
            align-items: center;
            height: 16px;
            position: relative;
            margin-right: 0;
          }
          .top-brand-line .line {
            flex: 1;
            height: 1.2px;
            background: #3A2A22;
            display: block;
          }
          .top-brand-line .gold-accent {
            width: 22px;
            min-width: 22px;
            height: 7px;
            background: #B08A4A;
            display: inline-block;
            margin: 0 6px 0 0;
            flex-shrink: 0;
          }

          /* محتوى المستند */
          .document-content {
            flex: 1;
            position: relative;
            z-index: 2;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
          }

          .doc-title-block {
            margin-bottom: 3.5mm;
            border-bottom: 1px solid #D8C3A5;
            padding-bottom: 2.5mm;
          }
          .doc-title-block h1 {
            font-size: 22px;
            font-weight: 600;
            color: #3A2A22;
            letter-spacing: 0.01em;
            line-height: 1.2;
          }
          .doc-title-block .sub {
            font-size: 13px;
            font-weight: 400;
            color: #8C6840;
            margin-top: 1px;
          }
          .doc-title-block .badge {
            display: inline-block;
            background: rgba(176, 138, 74, 0.12);
            color: #8C6840;
            font-size: 11px;
            padding: 2px 12px;
            border: 1px solid rgba(176, 138, 74, 0.35);
            border-radius: 20px;
            margin-top: 4px;
            font-weight: 500;
          }

          /* العناوين والكروت */
          .doc-section-title {
            font-size: 13.5px;
            font-weight: 600;
            color: #3A2A22;
            margin: 3.5mm 0 2mm 0;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .doc-section-title i {
            color: #B08A4A;
            font-size: 14px;
          }

          .doc-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 3mm;
            margin-bottom: 2mm;
          }
          .doc-grid-4 {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 3mm;
            margin-bottom: 2mm;
          }

          .doc-info-card {
            background: #F5F1EA;
            padding: 2.5mm 3.5mm;
            border-radius: 2px;
            border-right: 3px solid #B08A4A;
          }
          .doc-info-lbl {
            font-size: 10px;
            font-weight: 400;
            color: #8C6840;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            margin-bottom: 1px;
          }
          .doc-info-val {
            font-size: 13px;
            font-weight: 500;
            color: #3A2A22;
            line-height: 1.35;
          }
          .doc-info-val small {
            font-size: 10.5px;
            font-weight: 400;
            color: #574E45;
          }

          .doc-notice-box {
            background: #F5F1EA;
            padding: 3.5mm 5mm;
            border-right: 4px solid #B08A4A;
            margin: 3mm 0 3.5mm 0;
            font-size: 12.5px;
            line-height: 1.65;
            color: #3A2A22;
          }
          .doc-notice-box strong {
            color: #3A2A22;
          }

          /* الفوتر والخط السفلي */
          .document-footer {
            position: relative;
            z-index: 2;
            margin-top: 3mm;
          }

          .bottom-brand-line {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            width: 100%;
            height: 14px;
            margin-bottom: 3mm;
          }
          .bottom-brand-line .line {
            flex: 1;
            height: 1.2px;
            background: #3A2A22;
          }
          .bottom-brand-line .gold-accent {
            width: 22px;
            min-width: 22px;
            height: 7px;
            background: #B08A4A;
            display: inline-block;
            margin-left: 6px;
            flex-shrink: 0;
          }

          .footer-content {
            text-align: center;
            color: #3A2A22;
          }
          .footer-content .org-name {
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 0.02em;
            margin-bottom: 2px;
          }
          .footer-content .org-address {
            font-size: 11.5px;
            font-weight: 300;
            color: #5f4b39;
            margin-bottom: 2px;
            line-height: 1.5;
          }
          .footer-content .org-contact {
            font-size: 11.5px;
            font-weight: 300;
            color: #5f4b39;
            direction: ltr;
            unicode-bidi: plaintext;
            display: flex;
            justify-content: center;
            gap: 0 8px;
            flex-wrap: wrap;
          }
          .footer-content .org-contact .sep {
            color: #B08A4A;
            font-weight: 300;
            padding: 0 2px;
          }
        </style>
      </head>
      <body>
        <div class="page">

          <!-- ===== WATERMARK ===== -->
          <div class="watermark">
            <img src="${fullLogoUrl}" alt="شعار جمعية إرث وحضارة">
          </div>

          <!-- ===== HEADER ===== -->
          <header class="document-header">
            <div class="association-logo">
              <img src="${fullLogoUrl}" alt="شعار جمعية إرث وحضارة بالقريات">
            </div>
            <div class="top-brand-line">
              <span class="line"></span>
              <span class="gold-accent"></span>
            </div>
          </header>

          <!-- ===== CONTENT ===== -->
          <main class="document-content">

            <!-- عنوان المستند والمعرف -->
            <div class="doc-title-block">
              <h1>خطاب إجازة رسمية</h1>
              <div class="sub">طلب رقم: ${refNumber}</div>
              <div class="badge"><i class="fa-solid fa-circle-check"></i> خطاب إجازة معتمد</div>
            </div>

            <!-- القسم الأول: بيانات الموظف -->
            <div class="doc-section-title">
              <i class="fa-solid fa-user-check"></i> أولاً: بيانات الموظف صاحب الإجازة
            </div>
            <div class="doc-grid-2">
              <div class="doc-info-card">
                <div class="doc-info-lbl">اسم الموظف الثلاثي</div>
                <div class="doc-info-val">${safeEsc(leave.userName || "—")}</div>
              </div>
              <div class="doc-info-card">
                <div class="doc-info-lbl">المسمى الوظيفي / القسم</div>
                <div class="doc-info-val">${safeEsc(leave.userJobTitle || "—")}</div>
              </div>
            </div>

            <!-- القسم الثاني: تفاصيل الإجازة والمواعيد -->
            <div class="doc-section-title">
              <i class="fa-solid fa-calendar-days"></i> ثانياً: التفاصيل والمواعيد المعتمدة للإجازة
            </div>
            <div class="doc-grid-4">
              <div class="doc-info-card">
                <div class="doc-info-lbl">نوع الإجازة</div>
                <div class="doc-info-val" style="color:#947124;">${safeEsc(typeLabel)}</div>
              </div>
              <div class="doc-info-card">
                <div class="doc-info-lbl">إجمالي عدد الأيام</div>
                <div class="doc-info-val">${safeEsc(leave.daysCount || "—")} يوم</div>
              </div>
              <div class="doc-info-card">
                <div class="doc-info-lbl">تاريخ بدء الإجازة</div>
                <div class="doc-info-val">${startDateM}<br><small>(${startDateH})</small></div>
              </div>
              <div class="doc-info-card">
                <div class="doc-info-lbl">تاريخ انتهاء الإجازة</div>
                <div class="doc-info-val">${endDateM}<br><small>(${endDateH})</small></div>
              </div>
            </div>

            <!-- صندوق إشعار الاعتماد الرسمي -->
            <div class="doc-notice-box">
              <strong style="color:#947124; font-size:13.5px; display:block; margin-bottom:6px;">
                <i class="fa-solid fa-file-contract"></i> إشعار اعتماد إجازة رسمية
              </strong>
              إلى من يهمه الأمر،<br>
              تفيد جمعية إرث وحضارة بالقريات بأن الموظف <strong>${safeEsc(leave.userName || "المذكور أعلاه")}</strong> قد تقدم بطلب إجازة <strong>${safeEsc(typeLabel)}</strong> بناءً على رغبته وذلك لمدة <strong>${safeEsc(leave.daysCount || "—")}</strong> أيام خلال الفترة من <strong>${startDateM}م</strong> إلى <strong>${endDateM}م</strong> وقد تمت الموافقة على الإجازة واعتمادها من الإدارة التنفيذية للجمعية وفق الأنظمة والإجراءات المعتمدة لدى الجمعية، وتنتهي الإجازة بنهاية يوم <strong>${endDateM}م</strong> على أن يستأنف الموظف عمله المعتاد في يوم الدوام التالي لانتهاء فترة الإجازة، وفقًا لجدول العمل المعتمد لدى الجمعية.<br><br>
              وقد أُصدر هذا الخطاب بناءً على طلب الموظف لإثبات اعتماد الإجازة وتقديمه إلى الجهات ذات العلاقة عند الحاجة.<br>
              وتفضلوا بقبول خالص التحية والتقدير
            </div>

            <!-- القسم الثالث: حالة الاعتماد بالنظام -->
            <div class="doc-section-title">
              <i class="fa-solid fa-stamp"></i> ثالثاً: حالة الاعتماد والتوثيق الإلكتروني
            </div>
            <div class="doc-grid-2">
              <div class="doc-info-card" style="border-right-color:#1F7A4C;">
                <div class="doc-info-lbl">حالة الطلب بالنظام</div>
                <div class="doc-info-val" style="color:#1F7A4C;">🟢 معتمدة رسمياً</div>
              </div>
              <div class="doc-info-card" style="border-right-color:#947124;">
                <div class="doc-info-lbl">اعتمدت بواسطة</div>
                <div class="doc-info-val">${safeEsc(execName)}</div>
              </div>
            </div>

          </main>

          <!-- ===== FOOTER ===== -->
          <footer class="document-footer">
            <div class="bottom-brand-line">
              <span class="gold-accent"></span>
              <span class="line"></span>
            </div>
            <div class="footer-content">
              <div class="org-name">جمعية إرث وحضارة بالقريات</div>
              <div class="org-address">مرخصة من المركز الوطني لتنمية القطاع غير الربحي برقم 1000568800 بإشراف وزارة الثقافة</div>
              <div class="org-contact">
                <span>info@arthwhdahr.com</span>
                <span class="sep">|</span>
                <span>المملكة العربية السعودية</span>
              </div>
            </div>
          </footer>

        </div>
      </body>
      </html>`;

    await renderAndDownloadPdfWithPuppeteer(fullHtmlDocument, filename, btn, context);

  } catch (err) {
    console.error("[Puppeteer PDF Engine] Error generating leave letter PDF:", err);
    if (safeToast) safeToast("تعذّر تنزيل خطاب الإجازة عبر Puppeteer: " + err.message, "err");
  }
}
