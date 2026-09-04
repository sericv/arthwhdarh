/* ══════════════════════════════════════════════════════════
   جمعية إرث وحضارة بالقريات — Portal Document Templates
   Template: Official Leave Request Form PDF (نموذج طلب إجازة)
   ══════════════════════════════════════════════════════════ */

export async function generateLeaveRequestPdf(leaveId, btn, context = {}) {
  if (btn) {
    btn.disabled = true;
    btn.originalHtml = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري تنزيل النموذج (Puppeteer)...`;
  }
  
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

    let rejectionReason = leave.rejectionReason || "";
    if (!rejectionReason && leave.execReview && leave.execReview.notes) {
      rejectionReason = leave.execReview.notes;
    } else if (!rejectionReason && leave.hrReview && leave.hrReview.notes) {
      rejectionReason = leave.hrReview.notes;
    } else if (!rejectionReason && leave.statusHistory && Array.isArray(leave.statusHistory)) {
      const rejStep = leave.statusHistory.find(h => h.status === "hr_rejected" || h.status === "exec_rejected" || h.status === "rejected" || h.action === "reject");
      if (rejStep && (rejStep.note || rejStep.notes || rejStep.reason)) {
        rejectionReason = rejStep.note || rejStep.notes || rejStep.reason;
      }
    }

    // تحديد الشارة والحالة الحركية للطلب
    let badgeHtml = `<div class="badge" style="background:rgba(184, 142, 54, 0.12); color:#947124; border-color:rgba(184, 142, 54, 0.35);"><i class="fa-solid fa-clock"></i> طلب إجازة قيد المراجعة</div>`;
    let statusText = "🟡 بانتظار مراجعة الموارد البشرية";
    let statusColor = "#947124";
    let card2Label = "مقدم الطلب";
    let card2Value = safeEsc(leave.userName || "—");

    if (leave.status === "hr_approved") {
      badgeHtml = `<div class="badge" style="background:rgba(43, 94, 168, 0.12); color:#2B5EA8; border-color:rgba(43, 94, 168, 0.35);"><i class="fa-solid fa-user-clock"></i> بانتظار اعتماد المدير التنفيذي</div>`;
      statusText = "🔵 بانتظار اعتماد المدير التنفيذي";
      statusColor = "#2B5EA8";
    } else if (leave.status === "approved") {
      badgeHtml = `<div class="badge" style="background:rgba(31, 122, 76, 0.12); color:#1F7A4C; border-color:rgba(31, 122, 76, 0.35);"><i class="fa-solid fa-circle-check"></i> معتمدة</div>`;
      statusText = "🟢 معتمدة";
      statusColor = "#1F7A4C";
      card2Label = "اعتمدت بواسطة";
      card2Value = safeEsc(execName);
    } else if (leave.status === "hr_rejected" || leave.status === "exec_rejected" || leave.status === "rejected") {
      badgeHtml = `<div class="badge" style="background:rgba(168, 42, 42, 0.12); color:#A82A2A; border-color:rgba(168, 42, 42, 0.35);"><i class="fa-solid fa-circle-xmark"></i> مرفوضة</div>`;
      statusText = "🔴 مرفوضة";
      statusColor = "#A82A2A";
    }

    const refNumber = safeEsc(leave.refNo || `LV-${leave.id.slice(0, 6).toUpperCase()}`);
    const cleanEmpName = String(leave.userName || "الموظف").replace(/[/\\?%*:|"<>]/g, "_").trim();
    const filename = `نموذج_طلب_إجازة_${cleanEmpName}_${refNumber}`;
    const isRejected = (leave.status === "hr_rejected" || leave.status === "exec_rejected" || leave.status === "rejected");

    const originUrl = (typeof window !== "undefined" && window.location) ? window.location.origin : "https://arthwhdarh.org.sa";
    const fullLogoUrl = `${originUrl}/portal/logo.png`;

    const fullHtmlDocument = `<!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>${filename}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Noto+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: A4 portrait; margin: 0; }
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
          body { display: flex; justify-content: center; align-items: center; }
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
          .watermark img { width: 100%; height: 100%; object-fit: contain; display: block; }
          .document-header { display: flex; align-items: center; justify-content: flex-start; gap: 0; position: relative; z-index: 2; margin-bottom: 4mm; }
          .association-logo { flex-shrink: 0; width: 54px; height: 52px; margin-left: 14px; display: flex; align-items: center; justify-content: center; }
          .association-logo img { max-width: 100%; max-height: 50px; width: auto; height: auto; display: block; object-fit: contain; }
          .top-brand-line { flex: 1; display: flex; align-items: center; height: 16px; position: relative; margin-right: 0; }
          .top-brand-line .line { flex: 1; height: 1.2px; background: #3A2A22; display: block; }
          .top-brand-line .gold-accent { width: 22px; min-width: 22px; height: 7px; background: #B08A4A; display: inline-block; margin: 0 6px 0 0; flex-shrink: 0; }
          .document-content { flex: 1; position: relative; z-index: 2; display: flex; flex-direction: column; justify-content: flex-start; }
          .doc-title-block { margin-bottom: 3.5mm; border-bottom: 1px solid #D8C3A5; padding-bottom: 2.5mm; }
          .doc-title-block h1 { font-size: 22px; font-weight: 600; color: #3A2A22; letter-spacing: 0.01em; line-height: 1.2; }
          .doc-title-block .sub { font-size: 13px; font-weight: 400; color: #8C6840; margin-top: 1px; }
          .doc-title-block .badge { display: inline-block; font-size: 11px; padding: 2px 12px; border: 1px solid; border-radius: 20px; margin-top: 4px; font-weight: 500; }
          .doc-section-title { font-size: 13.5px; font-weight: 600; color: #3A2A22; margin: 3.5mm 0 2mm 0; display: flex; align-items: center; gap: 6px; }
          .doc-section-title i { color: #B08A4A; font-size: 14px; }
          .doc-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 2mm; }
          .doc-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-bottom: 2mm; }
          .doc-info-card { background: #F5F1EA; padding: 2.5mm 3.5mm; border-radius: 2px; border-right: 3px solid #B08A4A; }
          .doc-info-lbl { font-size: 10px; font-weight: 400; color: #8C6840; text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 1px; }
          .doc-info-val { font-size: 13px; font-weight: 500; color: #3A2A22; line-height: 1.35; }
          .doc-info-val small { font-size: 10.5px; font-weight: 400; color: #574E45; }
          .doc-notice-box { background: #F5F1EA; padding: 3.5mm 5mm; border-right: 4px solid #B08A4A; margin: 3mm 0 3.5mm 0; font-size: 12.5px; line-height: 1.65; color: #3A2A22; }
          .doc-notice-box strong { color: #3A2A22; }
          .document-footer { position: relative; z-index: 2; margin-top: 3mm; }
          .bottom-brand-line { display: flex; align-items: center; justify-content: flex-start; width: 100%; height: 14px; margin-bottom: 3mm; }
          .bottom-brand-line .line { flex: 1; height: 1.2px; background: #3A2A22; }
          .bottom-brand-line .gold-accent { width: 22px; min-width: 22px; height: 7px; background: #B08A4A; display: inline-block; margin-left: 6px; flex-shrink: 0; }
          .footer-content { text-align: center; color: #3A2A22; }
          .footer-content .org-name { font-size: 14px; font-weight: 600; letter-spacing: 0.02em; margin-bottom: 2px; }
          .footer-content .org-address { font-size: 11.5px; font-weight: 300; color: #5f4b39; margin-bottom: 2px; line-height: 1.5; }
          .footer-content .org-contact { font-size: 11.5px; font-weight: 300; color: #5f4b39; direction: ltr; unicode-bidi: plaintext; display: flex; justify-content: center; gap: 0 8px; flex-wrap: wrap; }
          .footer-content .org-contact .sep { color: #B08A4A; font-weight: 300; padding: 0 2px; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="watermark">
            <img src="${fullLogoUrl}" alt="شعار جمعية إرث وحضارة">
          </div>
          <header class="document-header">
            <div class="association-logo">
              <img src="${fullLogoUrl}" alt="شعار جمعية إرث وحضارة بالقريات">
            </div>
            <div class="top-brand-line">
              <span class="line"></span>
              <span class="gold-accent"></span>
            </div>
          </header>
          <main class="document-content">
            <div class="doc-title-block">
              <h1>نموذج طلب إجازة</h1>
              <div class="sub">طلب رقم: ${refNumber}</div>
              ${badgeHtml}
            </div>
            <div class="doc-section-title">
              <i class="fa-solid fa-user-check"></i> أولاً: بيانات الموظف صاحب الطلب
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
            <div class="doc-section-title">
              <i class="fa-solid fa-calendar-days"></i> ثانياً: تفاصيل ومواعيد الإجازة المطلوبة
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
            <div class="doc-notice-box">
              <strong style="color:#947124; font-size:13.5px; display:block; margin-bottom:6px;">
                <i class="fa-solid fa-file-signature"></i> نص طلب الإجازة المقدم
              </strong>
              أتقدم أنا الموظف <strong>${safeEsc(leave.userName || "المذكور أعلاه")}</strong> بطلب الحصول على إجازة من نوع <strong>${safeEsc(typeLabel)}</strong>، وذلك لمدة <strong>${safeEsc(leave.daysCount || "—")}</strong> أيام، خلال الفترة من <strong>${startDateM}م</strong> إلى <strong>${endDateM}م</strong>، وأقر بصحة البيانات والمعلومات الواردة في هذا الطلب، وأرجو التكرم بالنظر في طلبي واستكمال إجراءات اعتماده حسب الأنظمة والإجراءات المعتمدة لدى الجمعية.
            </div>
            ${isRejected ? `
              <div class="doc-notice-box" style="background:#FAF0F0; border-right-color:#A82A2A; margin-top:2mm;">
                <strong style="color:#A82A2A; font-size:13.5px; display:block; margin-bottom:4px;">
                  <i class="fa-solid fa-circle-xmark"></i> سبب الرفض
                </strong>
                ${safeEsc(rejectionReason || "لم يتم تدوين سبب للرفض")}
              </div>
            ` : ""}
            <div class="doc-section-title">
              <i class="fa-solid fa-circle-info"></i> ثالثاً: حالة الطلب ومقدم الطلب
            </div>
            <div class="doc-grid-2">
              <div class="doc-info-card" style="border-right-color:${statusColor};">
                <div class="doc-info-lbl">حالة الطلب بالنظام</div>
                <div class="doc-info-val" style="color:${statusColor};">${statusText}</div>
              </div>
              <div class="doc-info-card" style="border-right-color:#947124;">
                <div class="doc-info-lbl">${card2Label}</div>
                <div class="doc-info-val">${card2Value}</div>
              </div>
            </div>
          </main>
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

    // استدعاء خدمة Puppeteer الخادمة لتوليد الـ PDF وتنزيله مباشرة
    if (S && S.getSharePointFunctions) {
      let res;
      try {
        const { functions, httpsCallable } = await S.getSharePointFunctions();
        const renderFn = httpsCallable(functions, "renderLeaveRequestPdfWithPuppeteer");
        res = await renderFn({ htmlString: fullHtmlDocument });
      } catch (callErr) {
        console.warn("[Puppeteer PDF Engine] Local emulator call failed, retrying via production Cloud Function:", callErr?.message || callErr);
        try {
          const { functions, httpsCallable } = await S.getSharePointFunctions(true);
          const prodRenderFn = httpsCallable(functions, "renderLeaveRequestPdfWithPuppeteer");
          res = await prodRenderFn({ htmlString: fullHtmlDocument });
        } catch (prodErr) {
          throw new Error("خادم التوليد المحلي (Functions Emulator:5001) مغلق والدالة غير منشورة على السحابة بعد. يرجى تشغيل محاكي الفانكشنز أو نشر الدالة.");
        }
      }

      const pdfBase64 = res?.data?.pdfBase64;

      if (!pdfBase64) {
        throw new Error("لم يتم استلام مخرجات الـ PDF من خادم التوليد.");
      }

      // تحويل base64 إلى Blob وتنزيل ملف PDF مباشرة دون فتح نوافذ أو طباعة
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
      a.download = `${filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      if (safeToast) safeToast("تم تنزيل نموذج طلب الإجازة (Puppeteer PDF) بنجاح 📄");
      return;
    }

    throw new Error("خدمة التوليد الخادمة غير متوفرة حالياً.");

  } catch (err) {
    console.error("[Puppeteer PDF Engine] Error generating leave request PDF:", err);
    if (safeToast) safeToast("تعذّر تنزيل نموذج طلب الإجازة عبر Puppeteer: " + err.message, "err");
  } finally {
    if (btn) {
      btn.disabled = false;
      if (btn.originalHtml) btn.innerHTML = btn.originalHtml;
    }
  }
}
