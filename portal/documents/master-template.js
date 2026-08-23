/* ══════════════════════════════════════════════════════════
   جمعية إرث وحضارة بالقريات — Portal Document Templates
   Core Engine: Master Document PDF Layout & Styling Template
   ══════════════════════════════════════════════════════════ */

export function getLoggedUserRoleTitle(userState) {
  const u = userState || (typeof window !== "undefined" && window.State ? window.State.user : null);
  if (!u) return "الموارد البشرية";
  if (u.role === "executive" || u.role === "admin" || u.isTechAdmin || u.role === "tech_admin") {
    return "المدير التنفيذي";
  }
  if (u.role === "hr") {
    return "الموارد البشرية";
  }
  return u.name || "الموارد البشرية";
}

export function buildMasterDocumentHtml(options = {}) {
  const actorRoleTitle = getLoggedUserRoleTitle(options.userState);
  const printTitle = options.printTitle || options.docTitle || "مستند رسمي";
  const docTitle = options.docTitle || printTitle;
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const originUrl = (typeof window !== "undefined" && window.location) ? window.location.origin : "https://arthwhdarh.com";
  const fullLogoUrl = options.logoUrl || `${originUrl}/portal/logo.png`;

  return `<!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>${esc(printTitle)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Noto+Sans+Arabic:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 14mm 16mm 14mm;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Noto Sans Arabic', 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #ffffff;
          color: #1F1A15;
          direction: rtl;
          padding: 10px;
          position: relative;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* ── Watermark الفاخر للهوية (يتكرر خفيّاً في خلفية كل صفحة) ── */
        .master-watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 380px;
          height: 380px;
          background-image: url('${fullLogoUrl}');
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          opacity: 0.035;
          pointer-events: none;
          z-index: 0;
        }

        /* ── ترويسة الغطاء التنفيذي ── */
        .master-cover-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid #B88E36;
          padding-bottom: 14px;
          margin-bottom: 20px;
          position: relative;
          z-index: 2;
        }
        .master-cover-header::before {
          content: "";
          position: absolute;
          top: -10px;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #947124, #B88E36, #D4AF37);
          border-radius: 2px;
        }

        .master-brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .master-logo-img {
          height: 54px;
          width: auto;
          object-fit: contain;
        }

        .master-org-title {
          font-size: 19px;
          font-weight: 800;
          color: #947124;
          line-height: 1.25;
        }

        .master-org-sub {
          font-size: 11px;
          color: #574E45;
          margin-top: 4px;
          line-height: 1.45;
        }

        .master-doc-meta {
          text-align: left;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 5px;
        }

        .master-official-badge {
          background: #F4ECDC;
          color: #947124;
          border: 1px solid rgba(184, 142, 54, 0.4);
          font-size: 11px;
          font-weight: 800;
          padding: 3px 11px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .master-doc-ref {
          font-size: 11.5px;
          font-weight: 700;
          color: #1F1A15;
        }

        .master-doc-date {
          font-size: 11px;
          color: #857A6E;
        }

        /* ── بنر عنوان المستند ── */
        .master-title-banner {
          background: #F8F5EE;
          border: 1px solid rgba(184, 142, 54, 0.25);
          border-radius: 10px;
          padding: 14px 18px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          position: relative;
          z-index: 2;
        }

        .master-main-heading {
          font-size: 18px;
          font-weight: 800;
          color: #1F1A15;
          margin-right: 4px;
        }

        .master-period-pill {
          font-size: 12px;
          color: #574E45;
          background: #FFFFFF;
          padding: 5px 12px;
          border-radius: 6px;
          border: 1px solid rgba(31, 26, 21, 0.1);
        }

        /* ── جسم محتوى المستند ── */
        .master-content-body {
          position: relative;
          z-index: 2;
          min-height: 440px;
        }

        .doc-section-title {
          font-size: 14.5px;
          font-weight: 800;
          color: #947124;
          margin: 18px 0 10px 0;
          padding-bottom: 5px;
          border-bottom: 1.5px solid #F2EDE4;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .doc-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        .doc-grid-4 {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 16px;
        }

        .doc-info-card {
          background: #FAF7F2;
          border: 1px solid rgba(184, 142, 54, 0.2);
          border-radius: 8px;
          padding: 12px 14px;
        }

        .doc-info-lbl {
          font-size: 11px;
          color: #574E45;
          font-weight: 600;
          margin-bottom: 3px;
        }

        .doc-info-val {
          font-size: 13.5px;
          font-weight: 800;
          color: #1F1A15;
        }

        .doc-notice-box {
          background: #F8F5EE;
          border-right: 4px solid #B88E36;
          border-top: 1px solid rgba(184, 142, 54, 0.2);
          border-left: 1px solid rgba(184, 142, 54, 0.2);
          border-bottom: 1px solid rgba(184, 142, 54, 0.2);
          border-radius: 6px;
          padding: 14px 16px;
          margin: 20px 0;
          font-size: 13px;
          line-height: 1.65;
          color: #1F1A15;
        }

        /* ── شبكة كروت KPI لتقارير الحضور ── */
        .pdf-kpi-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 10px;
          margin-bottom: 22px;
        }

        .pdf-kpi-card {
          background: #FFFFFF;
          border: 1px solid rgba(31, 26, 21, 0.1);
          border-top: 3px solid #B88E36;
          border-radius: 8px;
          padding: 10px 8px;
          text-align: center;
          box-shadow: 0 2px 6px rgba(0,0,0,0.02);
        }

        .pdf-kpi-val {
          font-size: 18px;
          font-weight: 800;
          color: #1F1A15;
        }

        .pdf-kpi-lbl {
          font-size: 10.5px;
          color: #574E45;
          margin-top: 4px;
          font-weight: 600;
        }

        .pdf-section-head {
          margin-top: 20px;
          margin-bottom: 12px;
          padding-bottom: 6px;
          border-bottom: 1.5px solid #F2EDE4;
        }
        .pdf-section-head h3 {
          font-size: 14.5px;
          font-weight: 800;
          color: #947124;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pdf-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 12px;
          page-break-inside: auto;
        }

        .pdf-table thead {
          display: table-header-group;
        }

        .pdf-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .pdf-table th {
          background: #F2EDE4;
          color: #1F1A15;
          font-weight: 700;
          padding: 8px 10px;
          border: 1px solid rgba(31, 26, 21, 0.12);
          text-align: right;
          word-break: break-word;
        }

        .pdf-table td {
          padding: 7px 10px;
          border: 1px solid rgba(31, 26, 21, 0.08);
          text-align: right;
          word-break: break-word;
        }

        .pdf-table tr:nth-child(even) {
          background: #FAF7F2;
        }

        .pdf-badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
        }
        .badge-present { background: rgba(31, 122, 76, 0.08); color: #1F7A4C; border: 1px solid rgba(31, 122, 76, 0.25); }
        .badge-late    { background: rgba(184, 142, 54, 0.1);  color: #947124; border: 1px solid rgba(184, 142, 54, 0.3); }
        .badge-absent  { background: rgba(168, 42, 42, 0.08); color: #A82A2A; border: 1px solid rgba(168, 42, 42, 0.25); }
        .badge-leave   { background: rgba(43, 94, 168, 0.08); color: #2B5EA8; border: 1px solid rgba(43, 94, 168, 0.25); }
        .badge-none    { background: #F2EDE4; color: #857A6E; border: 1px solid rgba(31, 26, 21, 0.1); }

        .pdf-emp-block {
          margin-bottom: 24px;
          page-break-inside: auto;
          break-inside: auto;
        }

        .pdf-emp-banner {
          background: #F8F5EE;
          border: 1px solid rgba(184, 142, 54, 0.2);
          border-radius: 8px 8px 0 0;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          page-break-inside: avoid;
          break-inside: avoid;
          page-break-after: avoid;
          break-after: avoid;
        }

        .pdf-emp-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #F4ECDC;
          color: #947124;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 13px;
        }

        .pdf-emp-name {
          font-size: 14px;
          font-weight: 800;
          color: #1F1A15;
        }

        .pdf-emp-dept {
          font-size: 11px;
          color: #574E45;
        }

        /* ── التذييل الإلكتروني الرسمي للمستند ── */
        .master-electronic-footer {
          margin-top: 36px;
          padding-top: 14px;
          border-top: 1px solid rgba(184, 142, 54, 0.3);
          page-break-inside: avoid;
          break-inside: avoid;
          position: relative;
          z-index: 2;
        }

        .master-elec-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #F8F5EE;
          border: 1px solid rgba(184, 142, 54, 0.2);
          border-radius: 8px;
          padding: 12px 16px;
        }

        .master-elec-badge {
          font-size: 11.5px;
          font-weight: 800;
          color: #947124;
          background: #F4ECDC;
          border: 1px solid rgba(184, 142, 54, 0.35);
          padding: 5px 12px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .master-elec-text {
          text-align: center;
        }

        .master-elec-main {
          font-size: 12.5px;
          font-weight: 700;
          color: #1F1A15;
        }

        .master-elec-by {
          font-size: 11.5px;
          color: #574E45;
          margin-top: 2px;
        }

        .master-elec-seal {
          font-size: 10.5px;
          font-weight: 800;
          color: #947124;
          letter-spacing: 0.5px;
          border: 1px dashed rgba(184, 142, 54, 0.4);
          padding: 4px 10px;
          border-radius: 6px;
          background: #FFFFFF;
        }

        .master-contact-line {
          text-align: center;
          font-size: 10.5px;
          color: #857A6E;
          margin-top: 10px;
          font-weight: 600;
        }

        .page-break {
          page-break-before: always;
          break-before: always;
        }

        @media print {
          body { padding: 0; }
          .pdf-table th { background: #F2EDE4 !important; }
        }
      </style>
    </head>
    <body>
      <!-- Watermark كبير في خلفية الصفحة -->
      <div class="master-watermark"></div>

      <!-- الترويسة الرئيسية -->
      <div class="master-cover-header">
        <div class="master-brand">
          <img src="${fullLogoUrl}" alt="شعار جمعية إرث وحضارة" class="master-logo-img">
          <div>
            <h1 class="master-org-title">جمعية إرث وحضارة بالقريات</h1>
            <div class="master-org-sub">
              مرخصة من المركز الوطني لتنمية القطاع غير الربحي<br>
              برقم 1000568800 بإشراف وزارة الثقافة
            </div>
          </div>
        </div>

        <div class="master-doc-meta">
          <span class="master-official-badge"><i class="fa-solid fa-certificate"></i> ${options.badgeText || "وثيقة إلكترونية رسمية"}</span>
          <div class="master-doc-ref">مرجع: ${options.refNo || "—"}</div>
          <div class="master-doc-date">تاريخ الإصدار: ${options.docDate || new Date().toLocaleDateString('ar-SA')}</div>
        </div>
      </div>

      <!-- بنر عنوان المستند الرئيسي -->
      <div class="master-title-banner">
        <h2 class="master-main-heading">${docTitle}</h2>
        ${options.docSubtitle ? `<div class="master-period-pill">${options.docSubtitle}</div>` : ''}
      </div>

      <!-- جسم محتوى المستند الرئيسي -->
      <div class="master-content-body">
        ${options.contentHtml}
      </div>

      <!-- التذييل الإلكتروني المعتمد للمستند -->
      <div class="master-electronic-footer">
        <div class="master-elec-content">
          <div class="master-elec-badge">
            <i class="fa-solid fa-shield-halved"></i> وثيقة إلكترونية رسمية
          </div>
          <div class="master-elec-text">
            <div class="master-elec-main">هذا المستند صادر إلكترونياً من البوابة الإلكترونية للموظفين</div>
            <div class="master-elec-by">تم إصداره بواسطة: <strong>${actorRoleTitle}</strong></div>
          </div>
          <div class="master-elec-seal">
            جمعية إرث وحضارة
          </div>
        </div>
        <div class="master-contact-line">
          جمعية إرث وحضارة بالقريات — info@arthwhdahr.com
        </div>
      </div>
    </body>
    </html>`;
}

export async function renderAndDownloadPdfWithPuppeteer(fullHtmlDocument, filename, btn, context = {}) {
  const { S, toast } = context;
  const safeToast = toast || (typeof window !== "undefined" ? window.toast : null);

  let targetBtn = btn;
  if (!targetBtn && typeof document !== "undefined") {
    targetBtn = document.querySelector(`[data-download-pdf="${filename}"]`) || null;
  }

  let originalHtml = "";
  if (targetBtn) {
    targetBtn.disabled = true;
    originalHtml = targetBtn.innerHTML;
    targetBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري تنزيل الملف (Puppeteer)...`;
  }

  try {
    const services = S || (typeof window !== "undefined" ? window.S : null);
    if (!services || !services.getSharePointFunctions) {
      throw new Error("خدمة التوليد الخادمة غير متوفرة حالياً.");
    }

    let res;
    try {
      const { functions, httpsCallable } = await services.getSharePointFunctions();
      const renderFn = httpsCallable(functions, "renderPdfWithPuppeteer");
      res = await renderFn({ htmlString: fullHtmlDocument });
    } catch (callErr) {
      console.warn("[Puppeteer PDF Engine] Primary call failed, trying fallback or prod:", callErr?.message || callErr);
      try {
        const { functions, httpsCallable } = await services.getSharePointFunctions(true);
        const prodRenderFn = httpsCallable(functions, "renderPdfWithPuppeteer");
        res = await prodRenderFn({ htmlString: fullHtmlDocument });
      } catch (prodErr) {
        try {
          const { functions, httpsCallable } = await services.getSharePointFunctions();
          const fallbackFn = httpsCallable(functions, "renderLeaveRequestPdfWithPuppeteer");
          res = await fallbackFn({ htmlString: fullHtmlDocument });
        } catch (fbErr) {
          throw new Error("خادم التوليد المحلي (Functions Emulator:5001) مغلق والدالة غير منشورة على السحابة بعد. يرجى تشغيل محاكي الفانكشنز أو نشر الدالة.");
        }
      }
    }

    const pdfBase64 = res?.data?.pdfBase64;
    if (!pdfBase64) {
      throw new Error("لم يتم استلام مخرجات الـ PDF من خادم التوليد.");
    }

    const byteCharacters = atob(pdfBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "application/pdf" });

    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    if (safeToast) safeToast("تم تنزيل المستند (Puppeteer PDF) بنجاح 📄");

  } catch (err) {
    console.error("[Puppeteer PDF Engine] Error generating PDF:", err);
    if (safeToast) safeToast("تعذّر تنزيل المستند عبر Puppeteer: " + err.message, "err");
  } finally {
    if (targetBtn) {
      targetBtn.disabled = false;
      if (originalHtml) targetBtn.innerHTML = originalHtml;
    }
  }
}

export async function generateMasterDocumentPDF(options, btn, context = {}) {
  const fullHtml = buildMasterDocumentHtml(options);
  const printTitle = options.printTitle || options.docTitle || "مستند_رسمي";
  await renderAndDownloadPdfWithPuppeteer(fullHtml, printTitle, btn, context);
}

export async function generatePrintablePDFReport(title, contentHtml, btn, context = {}) {
  await generateMasterDocumentPDF({
    docTitle: title,
    badgeText: "تقرير رسمي معتمد",
    refNo: `REP-${Date.now().toString().slice(-6)}`,
    docDate: new Date().toLocaleDateString('ar-SA'),
    contentHtml: contentHtml,
    printTitle: title
  }, btn, context);
}
