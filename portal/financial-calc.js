/**
 * حاسبة النسب المالية والضريبة — بوابة الموظفين (جمعية إرث وحضارة)
 * معالجة وحسابات دقيقة وفورية بالكامل محلياً داخل المتصفح.
 */

// تخزين السجل محلياً
const STORAGE_KEY = "arth_financial_calc_history";

function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveToHistory(item) {
  try {
    const list = getHistory();
    list.unshift({
      id: `calc_${Date.now()}`,
      timestamp: Date.now(),
      ...item
    });
    // الاحتفاظ بآخر 20 عملية فقط
    const trimmed = list.slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn("Error saving calc history:", e);
  }
}

function clearHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}

// تنسيق الأرقام مع فواصل الآلاف
function fmtNum(val, maxDecimals = 4) {
  if (val === null || val === undefined || isNaN(val)) return "0";
  const num = Number(val);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals
  });
}

function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// حالة الحاسبة
const CalcState = {
  mode: "percent_of", // percent_of, increase, discount, reverse_percent, ratio_between, vat
  vatSubMode: "add_vat", // add_vat (قبل الضريبة -> الإجمالي), extract_vat (شامل الضريبة -> قبل الضريبة)
  currency: "SAR",
  inputs: {
    amount: "",
    percent: "",
    amount2: "",
    vatRate: 15
  },
  lastResultText: ""
};

const CURRENCIES = {
  SAR: { label: "ريال سعودي", symbol: "ر.س" },
  USD: { label: "دولار أمريكي", symbol: "$" },
  EUR: { label: "يورو", symbol: "€" },
  GBP: { label: "جنيه إسترليني", symbol: "£" },
  NONE: { label: "بدون عملة", symbol: "" }
};

export function renderFinancialCalc(container) {
  if (!container) container = document.getElementById("viewHost");

  container.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto; padding: 10px;">
      <!-- شريط العنوان والرجوع -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
        <button type="button" class="btn btn-secondary btn-sm" id="btnBackToToolsFromCalc">
          <i class="fa-solid fa-arrow-right"></i> العودة للأدوات العامة
        </button>
        <div style="display:flex;align-items:center;gap:8px;">
          <label style="font-size:12.5px;font-weight:700;color:var(--ink-mid);">العملة:</label>
          <select id="calcCurrencySelect" class="input" style="padding:4px 10px;font-size:12px;border-radius:var(--r-sm);">
            <option value="SAR" ${CalcState.currency === "SAR" ? "selected" : ""}>SAR - ريال سعودي</option>
            <option value="USD" ${CalcState.currency === "USD" ? "selected" : ""}>USD - دولار ($)</option>
            <option value="EUR" ${CalcState.currency === "EUR" ? "selected" : ""}>EUR - يورو (€)</option>
            <option value="GBP" ${CalcState.currency === "GBP" ? "selected" : ""}>GBP - إسترليني (£)</option>
            <option value="NONE" ${CalcState.currency === "NONE" ? "selected" : ""}>بدون عملة</option>
          </select>
        </div>
      </div>

      <!-- بطاقة الحاسبة الرئيسية -->
      <div class="card" style="padding: 28px; background: var(--bg-paper); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow-card); margin-bottom: 24px;">
        
        <!-- شريط اختيار الوضع (Segmented Mode Selector) -->
        <div style="margin-bottom: 24px;">
          <label style="font-size: 13px; font-weight: 800; color: var(--ink); margin-bottom: 10px; display: block;">اختر نوع الحساب:</label>
          <div class="calc-mode-nav" style="display:flex;gap:6px;flex-wrap:wrap;background:var(--bg-subtle);padding:6px;border-radius:var(--r-md);border:1px solid var(--line-soft);">
            <button type="button" class="calc-mode-btn ${CalcState.mode === 'percent_of' ? 'active' : ''}" data-mode="percent_of"><i class="fa-solid fa-percent"></i> نسبة من مبلغ</button>
            <button type="button" class="calc-mode-btn ${CalcState.mode === 'increase' ? 'active' : ''}" data-mode="increase"><i class="fa-solid fa-arrow-trend-up"></i> زيادة نسبة</button>
            <button type="button" class="calc-mode-btn ${CalcState.mode === 'discount' ? 'active' : ''}" data-mode="discount"><i class="fa-solid fa-tag"></i> خصم نسبة</button>
            <button type="button" class="calc-mode-btn ${CalcState.mode === 'reverse_percent' ? 'active' : ''}" data-mode="reverse_percent"><i class="fa-solid fa-calculator"></i> عكس النسبة (الأصل)</button>
            <button type="button" class="calc-mode-btn ${CalcState.mode === 'ratio_between' ? 'active' : ''}" data-mode="ratio_between"><i class="fa-solid fa-divide"></i> نسبة بين مبلغين</button>
            <button type="button" class="calc-mode-btn ${CalcState.mode === 'vat' ? 'active' : ''}" data-mode="vat" style="color:var(--gold-deep);font-weight:800;"><i class="fa-solid fa-receipt"></i> ضريبة القيمة المضافة</button>
          </div>
        </div>

        <!-- تبويبات فرعية لوضع الضريبة -->
        <div id="vatSubNavWrap" style="display: ${CalcState.mode === 'vat' ? 'block' : 'none'}; margin-bottom: 20px;">
          <div class="segmented-control" style="max-width: 480px; margin: 0 auto;">
            <button type="button" class="seg-btn ${CalcState.vatSubMode === 'add_vat' ? 'active' : ''}" id="btnVatAdd">
              <i class="fa-solid fa-plus"></i> المبلغ قبل الضريبة ← الإجمالي
            </button>
            <button type="button" class="seg-btn ${CalcState.vatSubMode === 'extract_vat' ? 'active' : ''}" id="btnVatExtract">
              <i class="fa-solid fa-minus"></i> المبلغ شامل الضريبة ← قبل الضريبة
            </button>
          </div>
        </div>

        <!-- حقول الإدخال الديناميكية -->
        <div id="calcInputsContainer" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:16px;margin-bottom:20px;">
          <!-- سيتم رسم الحقول ديناميكياً هنا -->
        </div>

        <!-- أزرار النسب السريعة -->
        <div id="quickPercentsWrap" style="margin-bottom: 24px;">
          <label style="font-size: 11.5px; font-weight: 700; color: var(--ink-muted); margin-bottom: 6px; display: block;">نسب شائعة وسريعة:</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm quick-pct-btn" data-pct="5">5%</button>
            <button type="button" class="btn btn-secondary btn-sm quick-pct-btn" data-pct="10">10%</button>
            <button type="button" class="btn btn-secondary btn-sm quick-pct-btn" data-pct="15">15%</button>
            <button type="button" class="btn btn-secondary btn-sm quick-pct-btn" data-pct="20">20%</button>
            <button type="button" class="btn btn-secondary btn-sm quick-pct-btn" data-pct="25">25%</button>
            <button type="button" class="btn btn-secondary btn-sm quick-pct-btn" data-pct="50">50%</button>
            <button type="button" class="btn btn-secondary btn-sm quick-pct-btn" data-pct="75">75%</button>
          </div>
        </div>

        <!-- صندوق عرض النتيجة البارزة -->
        <div id="calcResultBox" style="background: var(--bg-app); border: 1.5px solid rgba(192, 154, 98, 0.3); border-radius: var(--r-md); padding: 24px; text-align: center; position: relative; margin-bottom: 20px;">
          <div style="font-size: 12.5px; font-weight: 700; color: var(--ink-muted); margin-bottom: 6px;" id="calcOperationLabel">النتيجة الحسابية</div>
          <div style="font-size: 32px; font-weight: 900; color: var(--ink); letter-spacing: -0.5px; margin-bottom: 8px; font-family: monospace;" id="calcMainResult">0.00</div>
          <div style="font-size: 13.5px; color: var(--gold-deep); font-weight: 700; line-height: 1.6;" id="calcDetailExplanation">أدخل الأرقام لإظهار الحسبة</div>

          <div style="display:flex;justify-content:center;gap:10px;margin-top:18px;">
            <button type="button" class="btn btn-secondary btn-sm" id="btnCopyResult" style="padding:6px 16px;">
              <i class="fa-regular fa-copy"></i> نسخ النتيجة
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btnClearInputs" style="padding:6px 16px;">
              <i class="fa-solid fa-rotate-left"></i> مسح
            </button>
          </div>
        </div>

      </div>

      <!-- سجل العمليات السابقة (Local History) -->
      <div class="card" style="padding: 24px; background: var(--bg-paper); border: 1px solid var(--line); border-radius: var(--r-lg);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="font-size: 15px; font-weight: 800; color: var(--ink); margin: 0;">
            <i class="fa-solid fa-clock-rotate-left" style="color:var(--gold-deep);margin-left:6px;"></i> سجل العمليات الأخيرة
          </h3>
          <button type="button" class="btn btn-secondary btn-sm" id="btnClearHistoryBtn" style="padding:4px 10px;font-size:11.5px;">
            <i class="fa-solid fa-trash-can"></i> مسح السجل
          </button>
        </div>

        <div id="calcHistoryList" style="display:flex;flex-direction:column;gap:8px;">
          <!-- يتم رسم السجل هنا -->
        </div>
      </div>
    </div>
  `;

  bindEvents(container);
  renderInputs();
  calculateAndRender(false);
  renderHistoryList();
}

function bindEvents(container) {
  document.getElementById("btnBackToToolsFromCalc")?.addEventListener("click", () => {
    if (typeof window.navigate === "function") window.navigate("tools");
  });

  // تغيير نوع الحساب
  document.querySelectorAll(".calc-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      CalcState.mode = mode;
      document.querySelectorAll(".calc-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
      document.getElementById("vatSubNavWrap").style.display = (mode === "vat") ? "block" : "none";
      renderInputs();
      calculateAndRender(false);
    });
  });

  // تبويبات الضريبة
  document.getElementById("btnVatAdd")?.addEventListener("click", () => {
    CalcState.vatSubMode = "add_vat";
    document.getElementById("btnVatAdd").classList.add("active");
    document.getElementById("btnVatExtract").classList.remove("active");
    renderInputs();
    calculateAndRender(false);
  });

  document.getElementById("btnVatExtract")?.addEventListener("click", () => {
    CalcState.vatSubMode = "extract_vat";
    document.getElementById("btnVatExtract").classList.add("active");
    document.getElementById("btnVatAdd").classList.remove("active");
    renderInputs();
    calculateAndRender(false);
  });

  // تغيير العملة
  document.getElementById("calcCurrencySelect")?.addEventListener("change", (e) => {
    CalcState.currency = e.target.value;
    calculateAndRender(false);
  });

  // الأزرار السريعة للنسب
  document.querySelectorAll(".quick-pct-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const pct = btn.dataset.pct;
      const input = document.getElementById("inputPercent") || document.getElementById("inputVatRate");
      if (input) {
        input.value = pct;
        input.dispatchEvent(new Event("input"));
      }
    });
  });

  // نسخ النتيجة
  document.getElementById("btnCopyResult")?.addEventListener("click", () => {
    if (!CalcState.lastResultText) return;
    navigator.clipboard.writeText(CalcState.lastResultText).then(() => {
      if (window.toast) window.toast("تم نسخ النتيجة إلى الحافظة بنجاح");
    }).catch(() => {
      if (window.toast) window.toast("فشل نسخ النتيجة", "err");
    });
  });

  // مسح الحقول
  document.getElementById("btnClearInputs")?.addEventListener("click", () => {
    CalcState.inputs.amount = "";
    CalcState.inputs.percent = "";
    CalcState.inputs.amount2 = "";
    renderInputs();
    calculateAndRender(false);
  });

  // مسح السجل
  document.getElementById("btnClearHistoryBtn")?.addEventListener("click", () => {
    clearHistory();
    renderHistoryList();
    if (window.toast) window.toast("تم مسح سجل العمليات");
  });
}

function renderInputs() {
  const container = document.getElementById("calcInputsContainer");
  const quickPct = document.getElementById("quickPercentsWrap");
  if (!container) return;

  const mode = CalcState.mode;
  const sym = CURRENCIES[CalcState.currency]?.symbol || "";

  if (quickPct) {
    quickPct.style.display = (mode === "ratio_between") ? "none" : "block";
  }

  let html = "";

  if (mode === "percent_of") {
    html = `
      <div class="form-group">
        <label>المبلغ الأساسي ${sym ? `(${sym})` : ''}</label>
        <input type="number" step="any" id="inputAmount" class="input" placeholder="مثال: 5000" value="${CalcState.inputs.amount}">
      </div>
      <div class="form-group">
        <label>النسبة المئوية (%)</label>
        <input type="number" step="any" id="inputPercent" class="input" placeholder="مثال: 20" value="${CalcState.inputs.percent}">
      </div>
    `;
  } else if (mode === "increase") {
    html = `
      <div class="form-group">
        <label>المبلغ الأصلي ${sym ? `(${sym})` : ''}</label>
        <input type="number" step="any" id="inputAmount" class="input" placeholder="مثال: 5000" value="${CalcState.inputs.amount}">
      </div>
      <div class="form-group">
        <label>نسبة الزيادة (%)</label>
        <input type="number" step="any" id="inputPercent" class="input" placeholder="مثال: 20" value="${CalcState.inputs.percent}">
      </div>
    `;
  } else if (mode === "discount") {
    html = `
      <div class="form-group">
        <label>المبلغ الأصلي ${sym ? `(${sym})` : ''}</label>
        <input type="number" step="any" id="inputAmount" class="input" placeholder="مثال: 5000" value="${CalcState.inputs.amount}">
      </div>
      <div class="form-group">
        <label>نسبة الخصم (%)</label>
        <input type="number" step="any" id="inputPercent" class="input" placeholder="مثال: 20" value="${CalcState.inputs.percent}">
      </div>
    `;
  } else if (mode === "reverse_percent") {
    html = `
      <div class="form-group">
        <label>المبلغ الجزئي ${sym ? `(${sym})` : ''}</label>
        <input type="number" step="any" id="inputAmount" class="input" placeholder="مثال: 1000" value="${CalcState.inputs.amount}">
      </div>
      <div class="form-group">
        <label>النسبة التي يمثلها من الأصل (%)</label>
        <input type="number" step="any" id="inputPercent" class="input" placeholder="مثال: 20" value="${CalcState.inputs.percent}">
      </div>
    `;
  } else if (mode === "ratio_between") {
    html = `
      <div class="form-group">
        <label>المبلغ الأول (الجزء) ${sym ? `(${sym})` : ''}</label>
        <input type="number" step="any" id="inputAmount" class="input" placeholder="مثال: 1000" value="${CalcState.inputs.amount}">
      </div>
      <div class="form-group">
        <label>المبلغ الثاني (الكل) ${sym ? `(${sym})` : ''}</label>
        <input type="number" step="any" id="inputAmount2" class="input" placeholder="مثال: 5000" value="${CalcState.inputs.amount2}">
      </div>
    `;
  } else if (mode === "vat") {
    const isAdd = CalcState.vatSubMode === "add_vat";
    html = `
      <div class="form-group">
        <label>${isAdd ? 'المبلغ قبل الضريبة' : 'المبلغ شامل الضريبة'} ${sym ? `(${sym})` : ''}</label>
        <input type="number" step="any" id="inputAmount" class="input" placeholder="مثال: ${isAdd ? '5000' : '5750'}" value="${CalcState.inputs.amount}">
      </div>
      <div class="form-group">
        <label>نسبة الضريبة (%)</label>
        <input type="number" step="any" id="inputVatRate" class="input" placeholder="15" value="${CalcState.inputs.vatRate || 15}">
      </div>
    `;
  }

  container.innerHTML = html;

  // ربط أحداث الإدخال الفوري
  container.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("input", () => {
      const id = inp.id;
      if (id === "inputAmount") CalcState.inputs.amount = inp.value;
      if (id === "inputPercent") CalcState.inputs.percent = inp.value;
      if (id === "inputAmount2") CalcState.inputs.amount2 = inp.value;
      if (id === "inputVatRate") CalcState.inputs.vatRate = inp.value;
      calculateAndRender(true);
    });
  });
}

function calculateAndRender(shouldSaveHistory = true) {
  const mainResultEl = document.getElementById("calcMainResult");
  const detailEl = document.getElementById("calcDetailExplanation");
  const opLabelEl = document.getElementById("calcOperationLabel");
  if (!mainResultEl || !detailEl || !opLabelEl) return;

  const mode = CalcState.mode;
  const sym = CURRENCIES[CalcState.currency]?.symbol || "";
  const curLabel = sym ? ` ${sym}` : "";

  const amt = parseFloat(CalcState.inputs.amount);
  const pct = parseFloat(CalcState.inputs.percent);
  const amt2 = parseFloat(CalcState.inputs.amount2);
  const vatRate = parseFloat(CalcState.inputs.vatRate) || 15;

  let mainVal = "0.00";
  let explanation = "أدخل الأرقام لإظهار الحسبة";
  let operationLabel = "النتيجة الحسابية";
  let historyItem = null;

  if (mode === "percent_of") {
    operationLabel = "قيمة النسبة من المبلغ";
    if (!isNaN(amt) && !isNaN(pct)) {
      const res = amt * (pct / 100);
      mainVal = `${fmtNum(res)}${curLabel}`;
      explanation = `${fmtNum(pct)}% من ${fmtNum(amt)}${curLabel} = ${fmtNum(res)}${curLabel}`;
      historyItem = {
        title: "حساب نسبة من مبلغ",
        desc: explanation,
        result: mainVal
      };
    }
  } else if (mode === "increase") {
    operationLabel = "الإجمالي بعد الزيادة";
    if (!isNaN(amt) && !isNaN(pct)) {
      const increaseVal = amt * (pct / 100);
      const total = amt + increaseVal;
      mainVal = `${fmtNum(total)}${curLabel}`;
      explanation = `قيمة الزيادة (+${fmtNum(pct)}%): <strong>${fmtNum(increaseVal)}${curLabel}</strong> | الإجمالي النهائي: <strong>${fmtNum(total)}${curLabel}</strong>`;
      historyItem = {
        title: `زيادة ${fmtNum(pct)}% على مبلغ`,
        desc: `${fmtNum(amt)} + ${fmtNum(increaseVal)} = ${fmtNum(total)}${curLabel}`,
        result: mainVal
      };
    }
  } else if (mode === "discount") {
    operationLabel = "الإجمالي بعد الخصم";
    if (!isNaN(amt) && !isNaN(pct)) {
      const discountVal = amt * (pct / 100);
      const total = Math.max(0, amt - discountVal);
      mainVal = `${fmtNum(total)}${curLabel}`;
      explanation = `قيمة الخصم (-${fmtNum(pct)}%): <strong>${fmtNum(discountVal)}${curLabel}</strong> | الإجمالي بعد الخصم: <strong>${fmtNum(total)}${curLabel}</strong>`;
      historyItem = {
        title: `خصم ${fmtNum(pct)}% من مبلغ`,
        desc: `${fmtNum(amt)} - ${fmtNum(discountVal)} = ${fmtNum(total)}${curLabel}`,
        result: mainVal
      };
    }
  } else if (mode === "reverse_percent") {
    operationLabel = "المبلغ الأصلي قبل الاقتطاع";
    if (!isNaN(amt) && !isNaN(pct) && pct > 0) {
      const original = amt / (pct / 100);
      mainVal = `${fmtNum(original)}${curLabel}`;
      explanation = `المبلغ ${fmtNum(amt)}${curLabel} يمثل ${fmtNum(pct)}% من المبلغ الأصلي <strong>${fmtNum(original)}${curLabel}</strong>`;
      historyItem = {
        title: "معرفة المبلغ الأصلي من النسبة",
        desc: `${fmtNum(amt)} ÷ ${fmtNum(pct)}% = ${fmtNum(original)}${curLabel}`,
        result: mainVal
      };
    }
  } else if (mode === "ratio_between") {
    operationLabel = "النسبة المئوية بين المبلغين";
    if (!isNaN(amt) && !isNaN(amt2) && amt2 !== 0) {
      const ratio = (amt / amt2) * 100;
      mainVal = `${fmtNum(ratio, 2)}%`;
      explanation = `المبلغ ${fmtNum(amt)}${curLabel} يمثل <strong>${fmtNum(ratio, 2)}%</strong> من المبلغ ${fmtNum(amt2)}${curLabel}`;
      historyItem = {
        title: "معرفة النسبة بين مبلغين",
        desc: `${fmtNum(amt)} من ${fmtNum(amt2)} = ${fmtNum(ratio, 2)}%`,
        result: mainVal
      };
    }
  } else if (mode === "vat") {
    if (CalcState.vatSubMode === "add_vat") {
      operationLabel = "الإجمالي شامل ضريبة القيمة المضافة";
      if (!isNaN(amt)) {
        const vatAmount = amt * (vatRate / 100);
        const total = amt + vatAmount;
        mainVal = `${fmtNum(total)}${curLabel}`;
        explanation = `المبلغ قبل الضريبة: ${fmtNum(amt)}${curLabel} | قيمة الضريبة (${fmtNum(vatRate)}%): <strong>${fmtNum(vatRate > 0 ? vatAmount : 0)}${curLabel}</strong> | الإجمالي: <strong>${fmtNum(total)}${curLabel}</strong>`;
        historyItem = {
          title: `حساب ضريبة (+${fmtNum(vatRate)}%)`,
          desc: `${fmtNum(amt)} + ضريبة ${fmtNum(vatAmount)} = ${fmtNum(total)}${curLabel}`,
          result: mainVal
        };
      }
    } else {
      operationLabel = "المبلغ قبل ضريبة القيمة المضافة";
      if (!isNaN(amt)) {
        const baseAmount = amt / (1 + vatRate / 100);
        const vatAmount = amt - baseAmount;
        mainVal = `${fmtNum(baseAmount)}${curLabel}`;
        explanation = `الإجمالي شامل الضريبة: ${fmtNum(amt)}${curLabel} | قيمة الضريبة المستخرجة (${fmtNum(vatRate)}%): <strong>${fmtNum(vatAmount)}${curLabel}</strong> | قبل الضريبة: <strong>${fmtNum(baseAmount)}${curLabel}</strong>`;
        historyItem = {
          title: `استخراج الضريبة من الإجمالي (${fmtNum(vatRate)}%)`,
          desc: `الإجمالي ${fmtNum(amt)} ← قبل الضريبة: ${fmtNum(baseAmount)}${curLabel}`,
          result: mainVal
        };
      }
    }
  }

  opLabelEl.textContent = operationLabel;
  mainResultEl.textContent = mainVal;
  detailEl.innerHTML = explanation;
  CalcState.lastResultText = mainVal;

  if (shouldSaveHistory && historyItem && mainVal !== "0.00") {
    clearTimeout(CalcState._histTimer);
    CalcState._histTimer = setTimeout(() => {
      saveToHistory(historyItem);
      renderHistoryList();
    }, 800);
  }
}

function renderHistoryList() {
  const listEl = document.getElementById("calcHistoryList");
  if (!listEl) return;

  const history = getHistory();
  if (history.length === 0) {
    listEl.innerHTML = `<div style="text-align:center;padding:16px;color:var(--ink-faint);font-size:12px;">لا توجد عمليات سابقة بعد.</div>`;
    return;
  }

  listEl.innerHTML = history.map(item => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-app);border-radius:var(--r-sm);border:1px solid var(--line-soft);gap:10px;flex-wrap:wrap;">
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--ink);margin-bottom:2px;">${esc(item.title)}</div>
        <div style="font-size:11.5px;color:var(--ink-muted);">${esc(item.desc)}</div>
      </div>
      <div style="font-size:14px;font-weight:800;color:var(--gold-deep);font-family:monospace;direction:ltr;">
        ${esc(item.result)}
      </div>
    </div>
  `).join("");
}
