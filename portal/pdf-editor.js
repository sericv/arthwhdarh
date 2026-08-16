/**
 * محرر PDF المتقدم — بوابة الموظفين (جمعية إرث وحضارة)
 * معالجة وتحرير بالكامل من جانب العميل (Client-Side) وبأعلى خصوصية وسرعة.
 */

// تهيئة محرك PDF.js Worker
if (typeof window !== "undefined" && window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* ════════════════ 1. محرك الحفظ التلقائي المحلي (IndexedDB Storage) ════════════════ */
const PdfStorage = {
  DB_NAME: "arth_pdf_editor_db",
  STORE_NAME: "sessions",
  DB_VERSION: 1,

  async openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async saveSession(sessionData) {
    try {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readwrite");
        const store = tx.objectStore(this.STORE_NAME);
        store.put({ id: "active_session", ...sessionData, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("[PdfStorage] saveSession error:", e);
      return false;
    }
  },

  async getSession() {
    try {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readonly");
        const store = tx.objectStore(this.STORE_NAME);
        const req = store.get("active_session");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("[PdfStorage] getSession error:", e);
      return null;
    }
  },

  async clearSession() {
    try {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readwrite");
        const store = tx.objectStore(this.STORE_NAME);
        store.delete("active_session");
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("[PdfStorage] clearSession error:", e);
      return false;
    }
  }
};

/* ════════════════ 2. حالة محرر PDF (Editor State) ════════════════ */
const EditorState = {
  fileName: "document.pdf",
  pdfBytes: null,          // Uint8Array
  pdfLibDoc: null,         // PDFLib.PDFDocument
  pdfJsDoc: null,          // pdfjsLib PDFDocumentProxy
  pages: [],               // Array of { pageNum (1-based), rotation, annotations: [] }
  activePageIndex: 0,
  zoom: 1.0,
  activeTool: "select",    // select, text, draw, highlight, rectangle, circle, line, arrow, note
  selectedAnnotationId: null,
  
  // Tool properties
  toolProps: {
    textColor: "#1E1E1E",
    textSize: 16,
    fontFamily: "Noto Sans Arabic, sans-serif",
    isBold: false,
    isItalic: false,
    textAlign: "right",
    strokeColor: "#C09A62",
    strokeWidth: 3,
    fillColor: "transparent",
    highlightColor: "rgba(255, 235, 59, 0.45)",
    opacity: 1
  },

  undoStack: [],
  redoStack: [],
  hasUnsavedChanges: false,
  autoSaveTimer: null
};

// مساعدة الهروب من النصوص
function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ════════════════ 3. العرض الرئيسي للأداة (Render Entry Point) ════════════════ */
export async function renderPdfEditor(container) {
  if (!container) container = document.getElementById("viewHost");
  
  // التحقق من وجود جلسة سابقة محفوظة
  const savedSession = await PdfStorage.getSession();

  if (savedSession && savedSession.pdfBytes && !EditorState.pdfBytes) {
    renderSessionPrompt(container, savedSession);
    return;
  }

  if (!EditorState.pdfBytes) {
    renderUploadScreen(container);
    return;
  }

  renderWorkspace(container);
}

/* ════════ شاشة استعادة الجلسة السابقة ════════ */
function renderSessionPrompt(container, session) {
  const dateStr = new Date(session.updatedAt || Date.now()).toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  container.innerHTML = `
    <div style="max-width: 600px; margin: 40px auto; padding: 20px;">
      <div class="card" style="padding: 36px 24px; text-align: center; border: 1.5px solid var(--gold-soft); background: var(--bg-paper);">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--gold-pale); color: var(--gold-deep); display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 16px;">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
        <h3 style="font-size: 18px; font-weight: 800; color: var(--ink); margin-bottom: 8px;">وجدنا جلسة تحرير سابقة</h3>
        <p style="font-size: 13.5px; color: var(--ink-muted); line-height: 1.6; margin-bottom: 20px;">
          الملف: <strong>${esc(session.fileName || "مستند")}</strong><br>
          آخر حفظ تلقائي: <span style="color:var(--ink-mid)">${dateStr}</span>
        </p>

        <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary" id="btnDiscardSession" style="padding: 9px 20px;">
            <i class="fa-solid fa-trash"></i> بدء جلسة جديدة
          </button>
          <button type="button" class="btn btn-primary" id="btnRestoreSession" style="padding: 9px 28px;">
            <i class="fa-solid fa-rotate-left"></i> استعادة التعديلات
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btnRestoreSession")?.addEventListener("click", async () => {
    EditorState.fileName = session.fileName;
    EditorState.pdfBytes = session.pdfBytes;
    EditorState.pages = session.pages || [];
    EditorState.activePageIndex = session.activePageIndex || 0;
    EditorState.hasUnsavedChanges = true;
    await loadPdfDocuments();
    renderWorkspace(container);
  });

  document.getElementById("btnDiscardSession")?.addEventListener("click", async () => {
    await PdfStorage.clearSession();
    renderUploadScreen(container);
  });
}

/* ════════ شاشة رفع ملف PDF الأولية ════════ */
function renderUploadScreen(container) {
  container.innerHTML = `
    <div style="max-width: 780px; margin: 20px auto; padding: 10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <button type="button" class="btn btn-secondary btn-sm" id="btnBackToToolsHome">
          <i class="fa-solid fa-arrow-right"></i> العودة للأدوات العامة
        </button>
        <h2 style="font-size: 18px; font-weight: 800; color: var(--ink); margin: 0;">محرر مستندات PDF</h2>
      </div>

      <div class="card" style="padding: 48px 24px; text-align: center; border: 2px dashed var(--line); border-radius: var(--r-lg); background: var(--bg-paper); cursor: pointer; transition: all 0.2s;" id="pdfEditorDropZone">
        <div style="font-size: 64px; color: var(--gold-deep); margin-bottom: 18px;">
          <i class="fa-solid fa-file-pen"></i>
        </div>
        <h3 style="font-size: 18px; font-weight: 800; color: var(--ink); margin-bottom: 8px;">اسحب وأفلت ملف PDF هنا للتحرير</h3>
        <p style="font-size: 13px; color: var(--ink-muted); max-width: 480px; margin: 0 auto 20px; line-height: 1.6;">
          حرّر النصوص، أضف التوقيع والملاحظات، ورتّب الصفحات وادمجها بالكامل داخل متصفحك محلياً وبأعلى درجات الخصوصية والأمان.
        </p>
        
        <input type="file" id="pdfEditorFileInput" accept=".pdf,application/pdf" style="display: none;">
        <button type="button" class="btn btn-primary btn-lg" style="padding: 11px 36px; border-radius: var(--r-pill); pointer-events: none;">
          <i class="fa-solid fa-folder-open"></i> اختيار ملف من جهازك
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px;margin-top:24px;">
        <div class="card" style="padding:16px;background:var(--bg-subtle);border:1px solid var(--line-soft);border-radius:var(--r-md);text-align:center;">
          <div style="color:var(--gold-deep);font-size:20px;margin-bottom:6px;"><i class="fa-solid fa-signature"></i></div>
          <h4 style="font-size:13.5px;font-weight:700;margin:0 0 4px;">توقيع رقمي ورسم حر</h4>
          <p style="font-size:12px;color:var(--ink-muted);margin:0;">وقّع المستندات باللمس أو الماوس مباشرة.</p>
        </div>
        <div class="card" style="padding:16px;background:var(--bg-subtle);border:1px solid var(--line-soft);border-radius:var(--r-md);text-align:center;">
          <div style="color:var(--success);font-size:20px;margin-bottom:6px;"><i class="fa-solid fa-layer-group"></i></div>
          <h4 style="font-size:13.5px;font-weight:700;margin:0 0 4px;">إدارة وترتيب الصفحات</h4>
          <p style="font-size:12px;color:var(--ink-muted);margin:0;">دمج، تقسيم، تدوير وحذف الصفحات بسهولة.</p>
        </div>
        <div class="card" style="padding:16px;background:var(--bg-subtle);border:1px solid var(--line-soft);border-radius:var(--r-md);text-align:center;">
          <div style="color:var(--info);font-size:20px;margin-bottom:6px;"><i class="fa-solid fa-shield-halved"></i></div>
          <h4 style="font-size:13.5px;font-weight:700;margin:0 0 4px;">خصوصية وأمان 100%</h4>
          <p style="font-size:12px;color:var(--ink-muted);margin:0;">لا يتم رفع أو مشاركة ملفك مع أي خادم.</p>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btnBackToToolsHome")?.addEventListener("click", () => {
    if (typeof window.navigate === "function") window.navigate("tools");
  });

  const dropZone = document.getElementById("pdfEditorDropZone");
  const fileInput = document.getElementById("pdfEditorFileInput");

  dropZone?.addEventListener("click", () => fileInput?.click());

  dropZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "var(--gold-deep)";
    dropZone.style.background = "var(--bg-subtle)";
  });

  dropZone?.addEventListener("dragleave", () => {
    dropZone.style.borderColor = "var(--line)";
    dropZone.style.background = "var(--bg-paper)";
  });

  dropZone?.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "var(--line)";
    dropZone.style.background = "var(--bg-paper)";
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "application/pdf" || file.name.endsWith(".pdf"))) {
      await loadFile(file, container);
    }
  });

  fileInput?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      await loadFile(file, container);
    }
  });
}

async function loadFile(file, container) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    EditorState.fileName = file.name;
    EditorState.pdfBytes = new Uint8Array(arrayBuffer);
    EditorState.activePageIndex = 0;
    EditorState.pages = [];
    EditorState.hasUnsavedChanges = false;
    EditorState.undoStack = [];
    EditorState.redoStack = [];

    await loadPdfDocuments();
    renderWorkspace(container);
    triggerAutoSave();
  } catch (err) {
    console.error("Error reading PDF file:", err);
    if (window.toast) window.toast("تعذّر قراءة ملف PDF. يرجى التأكد من سلامة الملف.", "err");
  }
}

/* ════════ تحميل وثائق PDF.js و PDF-Lib ════════ */
async function loadPdfDocuments() {
  if (!EditorState.pdfBytes) return;

  // 1. تحميل PDF-Lib
  if (window.PDFLib) {
    EditorState.pdfLibDoc = await window.PDFLib.PDFDocument.load(EditorState.pdfBytes.slice(0), { ignoreEncryption: true });
  }

  // 2. تحميل PDF.js
  if (window.pdfjsLib) {
    EditorState.pdfJsDoc = await window.pdfjsLib.getDocument({ data: EditorState.pdfBytes.slice(0) }).promise;
    const numPages = EditorState.pdfJsDoc.numPages;

    // مزامنة الصفحات إن لم تكن مسجلة
    if (!EditorState.pages || EditorState.pages.length === 0) {
      EditorState.pages = [];
      for (let i = 1; i <= numPages; i++) {
        EditorState.pages.push({
          pageNum: i,
          rotation: 0,
          annotations: []
        });
      }
    }
  }
}

/* ════════════════ 4. مساحة عمل المحرر (Workspace Layout) ════════════════ */
function renderWorkspace(container) {
  container.innerHTML = `
    <div class="pdf-editor-wrap">
      <!-- شريط التحكم العلوي -->
      <div class="pdf-editor-header">
        <div class="pdf-hdr-group">
          <button type="button" class="btn btn-secondary btn-sm" id="btnEditorBack" title="الرجوع للأدوات">
            <i class="fa-solid fa-arrow-right"></i>
          </button>
          <div class="pdf-doc-title" title="${esc(EditorState.fileName)}">
            <i class="fa-solid fa-file-pdf" style="color:var(--danger);margin-left:4px;"></i> ${esc(EditorState.fileName)}
          </div>
        </div>

        <div class="pdf-hdr-group">
          <button type="button" class="pdf-ctrl-btn" id="btnUndo" title="تراجع (Ctrl+Z)" disabled><i class="fa-solid fa-rotate-left"></i></button>
          <button type="button" class="pdf-ctrl-btn" id="btnRedo" title="إعادة (Ctrl+Y)" disabled><i class="fa-solid fa-rotate-right"></i></button>
          
          <div style="height:18px;width:1px;background:var(--line);margin:0 4px;"></div>

          <button type="button" class="pdf-ctrl-btn" id="btnZoomOut" title="تصغير"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
          <span class="pdf-zoom-val" id="lblZoom">${Math.round(EditorState.zoom * 100)}%</span>
          <button type="button" class="pdf-ctrl-btn" id="btnZoomIn" title="تكبير"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
          <button type="button" class="pdf-ctrl-btn" id="btnFitWidth" title="ملاءمة العرض"><i class="fa-solid fa-arrows-left-right"></i></button>

          <div style="height:18px;width:1px;background:var(--line);margin:0 4px;"></div>

          <div class="pdf-page-jumper">
            <button type="button" class="pdf-ctrl-btn" id="btnPrevPage" title="الصفحة السابقة"><i class="fa-solid fa-chevron-right"></i></button>
            <input type="number" id="inputPageNum" class="pdf-page-input" value="${EditorState.activePageIndex + 1}" min="1" max="${EditorState.pages.length}">
            <span>من ${EditorState.pages.length}</span>
            <button type="button" class="pdf-ctrl-btn" id="btnNextPage" title="الصفحة التالية"><i class="fa-solid fa-chevron-left"></i></button>
          </div>
        </div>

        <div class="pdf-hdr-group">
          <button type="button" class="btn btn-secondary btn-sm" id="btnMergeModal" title="دمج ملف آخر">
            <i class="fa-solid fa-code-merge"></i> دمج PDF
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="btnSplitModal" title="تقسيم واستخراج صفحات">
            <i class="fa-solid fa-scissors"></i> تقسيم
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="btnExportPdf">
            <i class="fa-solid fa-download"></i> حفظ وتحميل PDF
          </button>
        </div>
      </div>

      <!-- جسم المحرر: القائمة الجانبية ومسرح العرض -->
      <div class="pdf-editor-body">
        <!-- الشريط الجانبي للصفحات المصغرة -->
        <div class="pdf-sidebar-pane" id="pdfSidebarPane">
          <div class="pdf-sidebar-hdr">
            <span>الصفحات (${EditorState.pages.length})</span>
            <button type="button" class="btn btn-secondary btn-sm" id="btnAddBlankPage" style="padding:4px 8px;font-size:11px;">
              <i class="fa-solid fa-plus"></i> صفحة بيضاء
            </button>
          </div>
          <div class="pdf-thumbs-list" id="pdfThumbsList"></div>
        </div>

        <!-- مسرح العرض والتحرير -->
        <div class="pdf-stage-viewport" id="pdfStageViewport">
          <div class="pdf-page-container" id="pdfPageContainer">
            <canvas class="pdf-render-canvas" id="pdfRenderCanvas"></canvas>
            <div class="pdf-annotation-layer" id="pdfAnnotationLayer"></div>
          </div>
        </div>

        <!-- شريط الخصائص العائم للعنصر المحدد -->
        <div class="pdf-prop-bar" id="pdfPropBar" style="display:none;"></div>

        <!-- شريط الأدوات العائم في الأسفل -->
        <div class="pdf-toolbar-dock">
          <button type="button" class="pdf-tool-btn active" data-tool="select" title="تحديد وتحريك"><i class="fa-solid fa-arrow-pointer"></i> تحديد</button>
          <button type="button" class="pdf-tool-btn" data-tool="text" title="إضافة نص"><i class="fa-solid fa-font"></i> نص</button>
          <button type="button" class="pdf-tool-btn" data-tool="draw" title="رسم بالقلم"><i class="fa-solid fa-pen"></i> قلم</button>
          <button type="button" class="pdf-tool-btn" data-tool="highlight" title="تظليل علوي"><i class="fa-solid fa-highlighter"></i> تظليل</button>
          <button type="button" class="pdf-tool-btn" data-tool="signature" title="توقيع رقمي"><i class="fa-solid fa-signature"></i> توقيع</button>
          <button type="button" class="pdf-tool-btn" data-tool="image" title="إدراج صورة"><i class="fa-solid fa-image"></i> صورة</button>
          <button type="button" class="pdf-tool-btn" data-tool="rectangle" title="مستطيل"><i class="fa-regular fa-square"></i> مستطيل</button>
          <button type="button" class="pdf-tool-btn" data-tool="circle" title="دائرة"><i class="fa-regular fa-circle"></i> دائرة</button>
          <button type="button" class="pdf-tool-btn" data-tool="line" title="خط"><i class="fa-solid fa-minus"></i> خط</button>
          <button type="button" class="pdf-tool-btn" data-tool="arrow" title="سهم"><i class="fa-solid fa-arrow-left"></i> سهم</button>
          <button type="button" class="pdf-tool-btn" data-tool="note" title="ملاحظة"><i class="fa-regular fa-note-sticky"></i> ملاحظة</button>
        </div>
      </div>
    </div>
  `;

  bindEditorEvents(container);
  renderActivePage();
  renderThumbnailsList();
}

/* ════════════════ 5. ربط الأحداث وإدارة المحرر ════════════════ */
function bindEditorEvents(container) {
  // زر الرجوع مع فحص التعديلات غير المحفوظة
  document.getElementById("btnEditorBack")?.addEventListener("click", () => {
    checkUnsavedAndLeave(() => {
      if (typeof window.navigate === "function") window.navigate("tools");
    });
  });

  // التكبير والتصغير
  document.getElementById("btnZoomIn")?.addEventListener("click", () => {
    if (EditorState.zoom < 2.5) {
      EditorState.zoom += 0.15;
      updateZoom();
    }
  });

  document.getElementById("btnZoomOut")?.addEventListener("click", () => {
    if (EditorState.zoom > 0.4) {
      EditorState.zoom -= 0.15;
      updateZoom();
    }
  });

  document.getElementById("btnFitWidth")?.addEventListener("click", () => {
    const viewport = document.getElementById("pdfStageViewport");
    const canvas = document.getElementById("pdfRenderCanvas");
    if (viewport && canvas && canvas.width) {
      const availWidth = viewport.clientWidth - 80;
      EditorState.zoom = Math.max(0.4, Math.min(2.5, availWidth / (canvas.width / 2)));
      updateZoom();
    }
  });

  // التنقل بين الصفحات
  document.getElementById("btnPrevPage")?.addEventListener("click", () => {
    if (EditorState.activePageIndex > 0) {
      EditorState.activePageIndex--;
      renderActivePage();
      updatePageControls();
    }
  });

  document.getElementById("btnNextPage")?.addEventListener("click", () => {
    if (EditorState.activePageIndex < EditorState.pages.length - 1) {
      EditorState.activePageIndex++;
      renderActivePage();
      updatePageControls();
    }
  });

  document.getElementById("inputPageNum")?.addEventListener("change", (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= EditorState.pages.length) {
      EditorState.activePageIndex = val - 1;
      renderActivePage();
      updatePageControls();
    } else {
      e.target.value = EditorState.activePageIndex + 1;
    }
  });

  // زر إضافة صفحة بيضاء
  document.getElementById("btnAddBlankPage")?.addEventListener("click", () => {
    pushHistoryState();
    EditorState.pages.push({
      pageNum: `blank_${Date.now()}`,
      isBlank: true,
      rotation: 0,
      annotations: []
    });
    EditorState.activePageIndex = EditorState.pages.length - 1;
    EditorState.hasUnsavedChanges = true;
    renderActivePage();
    renderThumbnailsList();
    triggerAutoSave();
  });

  // أزرار الأدوات
  document.querySelectorAll(".pdf-tool-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tool = btn.dataset.tool;
      setTool(tool);
    });
  });

  // التراجع والإعادة
  document.getElementById("btnUndo")?.addEventListener("click", () => undo());
  document.getElementById("btnRedo")?.addEventListener("click", () => redo());

  // اختصارات لوحة المفاتيح
  document.addEventListener("keydown", handleKeydown);

  // أزرار المودالات
  document.getElementById("btnMergeModal")?.addEventListener("click", () => openMergePdfModal());
  document.getElementById("btnSplitModal")?.addEventListener("click", () => openSplitPdfModal());
  document.getElementById("btnExportPdf")?.addEventListener("click", () => exportFinalPdf());

  // مستمع التنبيه عند محاولة إغلاق الصفحة أو إعادة التحميل
  window.addEventListener("beforeunload", beforeUnloadHandler);
}

function beforeUnloadHandler(e) {
  if (EditorState.hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = "";
  }
}

function handleKeydown(e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  if (e.ctrlKey || e.metaKey) {
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  } else if (e.key === "Delete" || e.key === "Backspace") {
    if (EditorState.selectedAnnotationId) {
      deleteSelectedAnnotation();
    }
  }
}

function updateZoom() {
  document.getElementById("lblZoom").textContent = `${Math.round(EditorState.zoom * 100)}%`;
  const container = document.getElementById("pdfPageContainer");
  if (container) {
    container.style.transform = `scale(${EditorState.zoom})`;
  }
}

function updatePageControls() {
  const input = document.getElementById("inputPageNum");
  if (input) input.value = EditorState.activePageIndex + 1;
  const btnPrev = document.getElementById("btnPrevPage");
  const btnNext = document.getElementById("btnNextPage");
  if (btnPrev) btnPrev.disabled = EditorState.activePageIndex === 0;
  if (btnNext) btnNext.disabled = EditorState.activePageIndex === EditorState.pages.length - 1;
}

/* ════════════════ 6. رسم الصفحة النشطة (Active Page Rendering) ════════════════ */
async function renderActivePage() {
  const canvas = document.getElementById("pdfRenderCanvas");
  const container = document.getElementById("pdfPageContainer");
  const annoLayer = document.getElementById("pdfAnnotationLayer");
  if (!canvas || !container || !annoLayer) return;

  const pageMeta = EditorState.pages[EditorState.activePageIndex];
  if (!pageMeta) return;

  updatePageControls();

  if (pageMeta.isBlank) {
    // رسم صفحة بيضاء قياسية A4
    canvas.width = 595 * 2;
    canvas.height = 842 * 2;
    canvas.style.width = "595px";
    canvas.style.height = "842px";
    container.style.width = "595px";
    container.style.height = "842px";
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (EditorState.pdfJsDoc) {
    try {
      const page = await EditorState.pdfJsDoc.getPage(pageMeta.pageNum);
      const rotation = (page.rotate + pageMeta.rotation) % 360;
      const viewport = page.getViewport({ scale: 2.0, rotation });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / 2}px`;
      canvas.style.height = `${viewport.height / 2}px`;
      container.style.width = `${viewport.width / 2}px`;
      container.style.height = `${viewport.height / 2}px`;

      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (e) {
      console.warn("Page render error:", e);
    }
  }

  updateZoom();
  renderAnnotations();
  bindAnnotationLayerEvents();
}

/* ════════════════ 7. رسم الصفحات المصغرة في القائمة الجانبية ════════════════ */
async function renderThumbnailsList() {
  const listEl = document.getElementById("pdfThumbsList");
  if (!listEl) return;

  listEl.innerHTML = "";

  for (let idx = 0; idx < EditorState.pages.length; idx++) {
    const p = EditorState.pages[idx];
    const isCur = idx === EditorState.activePageIndex;

    const item = document.createElement("div");
    item.className = `pdf-thumb-item ${isCur ? "active" : ""}`;
    item.dataset.pageIndex = idx;

    item.innerHTML = `
      <canvas class="pdf-thumb-canvas" id="thumbCanvas_${idx}"></canvas>
      <div class="pdf-thumb-info">
        <span>صفحة ${idx + 1}</span>
        <div class="pdf-thumb-actions">
          <button type="button" class="pdf-thumb-act-btn" data-act="up" title="تحريك لأعلى" ${idx === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
          <button type="button" class="pdf-thumb-act-btn" data-act="down" title="تحريك لأسفل" ${idx === EditorState.pages.length - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
          <button type="button" class="pdf-thumb-act-btn" data-act="rotate" title="تدوير 90°"><i class="fa-solid fa-rotate-right"></i></button>
          <button type="button" class="pdf-thumb-act-btn" data-act="dup" title="تكرار الصفحة"><i class="fa-regular fa-copy"></i></button>
          <button type="button" class="pdf-thumb-act-btn del" data-act="del" title="حذف الصفحة" ${EditorState.pages.length <= 1 ? "disabled" : ""}><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.closest(".pdf-thumb-act-btn")) return;
      EditorState.activePageIndex = idx;
      renderActivePage();
      renderThumbnailsList();
    });

    // أزرار العمليات
    item.querySelector('[data-act="up"]')?.addEventListener("click", () => movePage(idx, -1));
    item.querySelector('[data-act="down"]')?.addEventListener("click", () => movePage(idx, 1));
    item.querySelector('[data-act="rotate"]')?.addEventListener("click", () => rotatePage(idx));
    item.querySelector('[data-act="dup"]')?.addEventListener("click", () => duplicatePage(idx));
    item.querySelector('[data-act="del"]')?.addEventListener("click", () => deletePage(idx));

    listEl.appendChild(item);

    // رسم المحتوى المصغر
    renderThumbCanvas(idx, p);
  }
}

async function renderThumbCanvas(idx, p) {
  const thumbCanvas = document.getElementById(`thumbCanvas_${idx}`);
  if (!thumbCanvas) return;

  if (p.isBlank) {
    thumbCanvas.width = 120;
    thumbCanvas.height = 160;
    const ctx = thumbCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 120, 160);
  } else if (EditorState.pdfJsDoc) {
    try {
      const page = await EditorState.pdfJsDoc.getPage(p.pageNum);
      const viewport = page.getViewport({ scale: 0.25, rotation: (page.rotate + p.rotation) % 360 });
      thumbCanvas.width = viewport.width;
      thumbCanvas.height = viewport.height;
      const ctx = thumbCanvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (e) {}
  }
}

function movePage(index, dir) {
  const target = index + dir;
  if (target < 0 || target >= EditorState.pages.length) return;
  pushHistoryState();
  const temp = EditorState.pages[index];
  EditorState.pages[index] = EditorState.pages[target];
  EditorState.pages[target] = temp;
  if (EditorState.activePageIndex === index) EditorState.activePageIndex = target;
  EditorState.hasUnsavedChanges = true;
  renderActivePage();
  renderThumbnailsList();
  triggerAutoSave();
}

function rotatePage(index) {
  pushHistoryState();
  EditorState.pages[index].rotation = (EditorState.pages[index].rotation + 90) % 360;
  EditorState.hasUnsavedChanges = true;
  renderActivePage();
  renderThumbnailsList();
  triggerAutoSave();
}

function duplicatePage(index) {
  pushHistoryState();
  const orig = EditorState.pages[index];
  const copy = {
    pageNum: orig.pageNum,
    isBlank: orig.isBlank,
    rotation: orig.rotation,
    annotations: JSON.parse(JSON.stringify(orig.annotations || []))
  };
  EditorState.pages.splice(index + 1, 0, copy);
  EditorState.activePageIndex = index + 1;
  EditorState.hasUnsavedChanges = true;
  renderActivePage();
  renderThumbnailsList();
  triggerAutoSave();
}

function deletePage(index) {
  if (EditorState.pages.length <= 1) {
    if (window.toast) window.toast("لا يمكن حذف الصفحة الوحيدة في المستند.", "err");
    return;
  }
  pushHistoryState();
  EditorState.pages.splice(index, 1);
  if (EditorState.activePageIndex >= EditorState.pages.length) {
    EditorState.activePageIndex = EditorState.pages.length - 1;
  }
  EditorState.hasUnsavedChanges = true;
  renderActivePage();
  renderThumbnailsList();
  triggerAutoSave();
}

/* ════════════════ 8. نظام الطبقات والعناصر (Annotations System) ════════════════ */
function setTool(toolName) {
  EditorState.activeTool = toolName;
  document.querySelectorAll(".pdf-tool-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tool === toolName);
  });

  const layer = document.getElementById("pdfAnnotationLayer");
  if (layer) {
    layer.className = `pdf-annotation-layer tool-${toolName}`;
  }

  if (toolName === "signature") {
    openSignatureModal();
  } else if (toolName === "image") {
    triggerImageUpload();
  }

  updatePropertyBar();
}

function renderAnnotations() {
  const layer = document.getElementById("pdfAnnotationLayer");
  if (!layer) return;

  layer.innerHTML = "";
  const pageMeta = EditorState.pages[EditorState.activePageIndex];
  if (!pageMeta || !pageMeta.annotations) return;

  pageMeta.annotations.forEach(anno => {
    const el = document.createElement("div");
    el.className = `pdf-anno-item ${anno.id === EditorState.selectedAnnotationId ? "selected" : ""}`;
    el.id = `anno_${anno.id}`;
    el.style.left = `${anno.x}px`;
    el.style.top = `${anno.y}px`;
    if (anno.w) el.style.width = `${anno.w}px`;
    if (anno.h) el.style.height = `${anno.h}px`;

    let innerHtml = "";

    if (anno.type === "text") {
      innerHtml = `
        <div class="pdf-anno-text" contenteditable="true" style="font-family:${anno.fontFamily};font-size:${anno.fontSize}px;color:${anno.color};font-weight:${anno.isBold ? 'bold' : 'normal'};font-style:${anno.isItalic ? 'italic' : 'normal'};text-align:${anno.textAlign};">${esc(anno.text || "اكتب نصاً هنا...")}</div>
      `;
    } else if (anno.type === "signature" || anno.type === "image") {
      innerHtml = `<img src="${anno.dataUrl}" style="width:100%;height:100%;object-fit:contain;pointer-events:none;" alt="عنصر">`;
    } else if (anno.type === "rectangle") {
      innerHtml = `<div style="width:100%;height:100%;border:${anno.strokeWidth}px solid ${anno.strokeColor};background:${anno.fillColor};border-radius:4px;"></div>`;
    } else if (anno.type === "circle") {
      innerHtml = `<div style="width:100%;height:100%;border:${anno.strokeWidth}px solid ${anno.strokeColor};background:${anno.fillColor};border-radius:50%;"></div>`;
    } else if (anno.type === "line") {
      innerHtml = `<div style="width:100%;height:${anno.strokeWidth}px;background:${anno.strokeColor};margin-top:calc(50% - 1px);"></div>`;
    } else if (anno.type === "arrow") {
      innerHtml = `<div style="display:flex;align-items:center;width:100%;height:100%;color:${anno.strokeColor};"><i class="fa-solid fa-arrow-left" style="font-size:${anno.strokeWidth * 6}px;"></i><div style="flex:1;height:${anno.strokeWidth}px;background:${anno.strokeColor};"></div></div>`;
    } else if (anno.type === "note") {
      innerHtml = `<div class="pdf-anno-note"><i class="fa-regular fa-note-sticky" style="margin-left:4px;"></i>${esc(anno.text || "ملاحظة")}</div>`;
    } else if (anno.type === "draw" || anno.type === "highlight") {
      innerHtml = `<svg style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;"><path d="${anno.pathData}" stroke="${anno.strokeColor}" stroke-width="${anno.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${anno.opacity || 1}"/></svg>`;
    }

    el.innerHTML = `
      ${innerHtml}
      <div class="pdf-anno-handle tl" data-handle="tl"></div>
      <div class="pdf-anno-handle tr" data-handle="tr"></div>
      <div class="pdf-anno-handle bl" data-handle="bl"></div>
      <div class="pdf-anno-handle br" data-handle="br"></div>
      <button type="button" class="pdf-anno-delete" data-del-anno="${anno.id}" title="حذف العنصر"><i class="fa-solid fa-xmark"></i></button>
    `;

    // معالجة تعديل النص المباشر
    const txtBox = el.querySelector(".pdf-anno-text");
    if (txtBox) {
      txtBox.addEventListener("input", () => {
        anno.text = txtBox.innerText;
        EditorState.hasUnsavedChanges = true;
        triggerAutoSave();
      });
    }

    // زر الحذف
    el.querySelector('[data-del-anno]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteAnnotation(anno.id);
    });

    // سحب وتحريك العنصر
    bindDraggableItem(el, anno);

    layer.appendChild(el);
  });
}

function bindDraggableItem(el, anno) {
  let isDragging = false;
  let startX = 0, startY = 0;
  let initLeft = 0, initTop = 0;

  el.addEventListener("mousedown", (e) => {
    if (e.target.dataset.handle || e.target.closest(".pdf-anno-delete")) return;
    selectAnnotation(anno.id);
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initLeft = anno.x;
    initTop = anno.y;

    const onMouseMove = (ev) => {
      if (!isDragging) return;
      const dx = (ev.clientX - startX) / EditorState.zoom;
      const dy = (ev.clientY - startY) / EditorState.zoom;
      anno.x = Math.max(0, initLeft + dx);
      anno.y = Math.max(0, initTop + dy);
      el.style.left = `${anno.x}px`;
      el.style.top = `${anno.y}px`;
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        pushHistoryState();
        EditorState.hasUnsavedChanges = true;
        triggerAutoSave();
      }
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  // مقابض تغيير الحجم
  el.querySelectorAll(".pdf-anno-handle").forEach(h => {
    h.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      let hType = h.dataset.handle;
      let startX = e.clientX, startY = e.clientY;
      let startW = anno.w || 100, startH = anno.h || 50;
      let startLeft = anno.x, startTop = anno.y;

      const onResizeMove = (ev) => {
        const dx = (ev.clientX - startX) / EditorState.zoom;
        const dy = (ev.clientY - startY) / EditorState.zoom;

        if (hType === "br") {
          anno.w = Math.max(20, startW - dx);
          anno.h = Math.max(20, startH + dy);
        } else if (hType === "bl") {
          anno.w = Math.max(20, startW + dx);
          anno.h = Math.max(20, startH + dy);
        } else if (hType === "tr") {
          anno.w = Math.max(20, startW - dx);
          anno.h = Math.max(20, startH - dy);
        }
        el.style.width = `${anno.w}px`;
        el.style.height = `${anno.h}px`;
      };

      const onResizeUp = () => {
        pushHistoryState();
        EditorState.hasUnsavedChanges = true;
        triggerAutoSave();
        window.removeEventListener("mousemove", onResizeMove);
        window.removeEventListener("mouseup", onResizeUp);
      };

      window.addEventListener("mousemove", onResizeMove);
      window.addEventListener("mouseup", onResizeUp);
    });
  });
}

function selectAnnotation(id) {
  EditorState.selectedAnnotationId = id;
  document.querySelectorAll(".pdf-anno-item").forEach(item => {
    item.classList.toggle("selected", item.id === `anno_${id}`);
  });
  updatePropertyBar();
}

function deleteSelectedAnnotation() {
  if (EditorState.selectedAnnotationId) {
    deleteAnnotation(EditorState.selectedAnnotationId);
  }
}

function deleteAnnotation(id) {
  pushHistoryState();
  const pageMeta = EditorState.pages[EditorState.activePageIndex];
  if (pageMeta && pageMeta.annotations) {
    pageMeta.annotations = pageMeta.annotations.filter(a => a.id !== id);
  }
  EditorState.selectedAnnotationId = null;
  EditorState.hasUnsavedChanges = true;
  renderAnnotations();
  updatePropertyBar();
  triggerAutoSave();
}

/* ════════════════ 9. نقرات مساحة العمل وإنشاء العناصر الجديدة ════════════════ */
function bindAnnotationLayerEvents() {
  const layer = document.getElementById("pdfAnnotationLayer");
  if (!layer) return;

  let isCreating = false;
  let startX = 0, startY = 0;
  let drawPoints = [];

  layer.onmousedown = (e) => {
    if (e.target !== layer) return;

    const rect = layer.getBoundingClientRect();
    startX = (e.clientX - rect.left) / EditorState.zoom;
    startY = (e.clientY - rect.top) / EditorState.zoom;

    if (EditorState.activeTool === "select") {
      selectAnnotation(null);
      return;
    }

    if (EditorState.activeTool === "text") {
      pushHistoryState();
      const pageMeta = EditorState.pages[EditorState.activePageIndex];
      const newAnno = {
        id: `txt_${Date.now()}`,
        type: "text",
        x: startX,
        y: startY,
        w: 160,
        h: 40,
        text: "اكتب هنا...",
        fontFamily: EditorState.toolProps.fontFamily,
        fontSize: EditorState.toolProps.textSize,
        color: EditorState.toolProps.textColor,
        isBold: EditorState.toolProps.isBold,
        isItalic: EditorState.toolProps.isItalic,
        textAlign: EditorState.toolProps.textAlign
      };
      pageMeta.annotations.push(newAnno);
      EditorState.hasUnsavedChanges = true;
      renderAnnotations();
      selectAnnotation(newAnno.id);
      setTool("select");
      triggerAutoSave();
      return;
    }

    if (EditorState.activeTool === "note") {
      pushHistoryState();
      const pageMeta = EditorState.pages[EditorState.activePageIndex];
      const newAnno = {
        id: `note_${Date.now()}`,
        type: "note",
        x: startX,
        y: startY,
        w: 140,
        h: 60,
        text: "ملاحظة جديدة"
      };
      pageMeta.annotations.push(newAnno);
      EditorState.hasUnsavedChanges = true;
      renderAnnotations();
      selectAnnotation(newAnno.id);
      setTool("select");
      triggerAutoSave();
      return;
    }

    if (["rectangle", "circle", "line", "arrow"].includes(EditorState.activeTool)) {
      pushHistoryState();
      const pageMeta = EditorState.pages[EditorState.activePageIndex];
      const newAnno = {
        id: `shape_${Date.now()}`,
        type: EditorState.activeTool,
        x: startX,
        y: startY,
        w: 120,
        h: 80,
        strokeColor: EditorState.toolProps.strokeColor,
        strokeWidth: EditorState.toolProps.strokeWidth,
        fillColor: EditorState.toolProps.fillColor
      };
      pageMeta.annotations.push(newAnno);
      EditorState.hasUnsavedChanges = true;
      renderAnnotations();
      selectAnnotation(newAnno.id);
      setTool("select");
      triggerAutoSave();
      return;
    }

    if (EditorState.activeTool === "draw" || EditorState.activeTool === "highlight") {
      isCreating = true;
      drawPoints = [{ x: startX, y: startY }];

      const onDrawMove = (ev) => {
        if (!isCreating) return;
        const curX = (ev.clientX - rect.left) / EditorState.zoom;
        const curY = (ev.clientY - rect.top) / EditorState.zoom;
        drawPoints.push({ x: curX, y: curY });
      };

      const onDrawUp = () => {
        if (isCreating && drawPoints.length > 1) {
          isCreating = false;
          pushHistoryState();
          const pageMeta = EditorState.pages[EditorState.activePageIndex];
          const isHigh = EditorState.activeTool === "highlight";
          
          let minX = Math.min(...drawPoints.map(p => p.x));
          let minY = Math.min(...drawPoints.map(p => p.y));
          let maxX = Math.max(...drawPoints.map(p => p.x));
          let maxY = Math.max(...drawPoints.map(p => p.y));

          let pathD = `M ${drawPoints[0].x - minX} ${drawPoints[0].y - minY}`;
          for (let i = 1; i < drawPoints.length; i++) {
            pathD += ` L ${drawPoints[i].x - minX} ${drawPoints[i].y - minY}`;
          }

          const newAnno = {
            id: `draw_${Date.now()}`,
            type: EditorState.activeTool,
            x: minX,
            y: minY,
            w: Math.max(10, maxX - minX),
            h: Math.max(10, maxY - minY),
            pathData: pathD,
            strokeColor: isHigh ? EditorState.toolProps.highlightColor : EditorState.toolProps.strokeColor,
            strokeWidth: isHigh ? 16 : EditorState.toolProps.strokeWidth,
            opacity: isHigh ? 0.45 : 1
          };
          pageMeta.annotations.push(newAnno);
          EditorState.hasUnsavedChanges = true;
          renderAnnotations();
          triggerAutoSave();
        }
        window.removeEventListener("mousemove", onDrawMove);
        window.removeEventListener("mouseup", onDrawUp);
      };

      window.addEventListener("mousemove", onDrawMove);
      window.addEventListener("mouseup", onDrawUp);
    }
  };
}

/* ════════ شريط الخصائص المباشرة (Properties Floating Bar) ════════ */
function updatePropertyBar() {
  const bar = document.getElementById("pdfPropBar");
  if (!bar) return;

  const pageMeta = EditorState.pages[EditorState.activePageIndex];
  const selectedAnno = pageMeta?.annotations?.find(a => a.id === EditorState.selectedAnnotationId);

  if (!selectedAnno && !["text", "draw", "highlight", "rectangle", "circle"].includes(EditorState.activeTool)) {
    bar.style.display = "none";
    return;
  }

  bar.style.display = "flex";

  if (selectedAnno?.type === "text" || EditorState.activeTool === "text") {
    const curSize = selectedAnno?.fontSize || EditorState.toolProps.textSize;
    const curColor = selectedAnno?.color || EditorState.toolProps.textColor;

    bar.innerHTML = `
      <div class="pdf-prop-group">
        <label>الخط:</label>
        <select id="propFontFamily" class="input" style="padding:2px 6px;font-size:11.5px;height:26px;">
          <option value="Noto Sans Arabic, sans-serif">Noto Sans Arabic</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="'Times New Roman', serif">Times New Roman</option>
          <option value="Courier, monospace">Courier</option>
        </select>
      </div>

      <div class="pdf-prop-group">
        <label>الحجم:</label>
        <input type="number" id="propFontSize" value="${curSize}" min="10" max="72" style="width:48px;height:24px;padding:2px 4px;font-size:11.5px;border:1px solid var(--line);border-radius:4px;">
      </div>

      <div class="pdf-prop-group">
        <button type="button" class="pdf-ctrl-btn" id="propBold" title="عريض"><i class="fa-solid fa-bold"></i></button>
        <button type="button" class="pdf-ctrl-btn" id="propItalic" title="مائل"><i class="fa-solid fa-italic"></i></button>
      </div>

      <div class="pdf-prop-group">
        <input type="color" id="propTextColor" value="${curColor}" style="width:24px;height:24px;border:none;cursor:pointer;background:transparent;">
      </div>
    `;

    document.getElementById("propFontSize")?.addEventListener("change", (e) => {
      const sz = parseInt(e.target.value, 10);
      EditorState.toolProps.textSize = sz;
      if (selectedAnno) {
        selectedAnno.fontSize = sz;
        renderAnnotations();
        triggerAutoSave();
      }
    });

    document.getElementById("propTextColor")?.addEventListener("input", (e) => {
      const col = e.target.value;
      EditorState.toolProps.textColor = col;
      if (selectedAnno) {
        selectedAnno.color = col;
        renderAnnotations();
        triggerAutoSave();
      }
    });

    document.getElementById("propBold")?.addEventListener("click", () => {
      EditorState.toolProps.isBold = !EditorState.toolProps.isBold;
      if (selectedAnno) {
        selectedAnno.isBold = !selectedAnno.isBold;
        renderAnnotations();
        triggerAutoSave();
      }
    });

    document.getElementById("propItalic")?.addEventListener("click", () => {
      EditorState.toolProps.isItalic = !EditorState.toolProps.isItalic;
      if (selectedAnno) {
        selectedAnno.isItalic = !selectedAnno.isItalic;
        renderAnnotations();
        triggerAutoSave();
      }
    });
  } else {
    bar.innerHTML = `
      <div class="pdf-prop-group">
        <label>اللون:</label>
        <div class="pdf-color-swatch" style="background:#C09A62;" data-col="#C09A62"></div>
        <div class="pdf-color-swatch" style="background:#1E1E1E;" data-col="#1E1E1E"></div>
        <div class="pdf-color-swatch" style="background:#DC2626;" data-col="#DC2626"></div>
        <div class="pdf-color-swatch" style="background:#2563EB;" data-col="#2563EB"></div>
        <div class="pdf-color-swatch" style="background:#16A34A;" data-col="#16A34A"></div>
        <input type="color" id="propCustomColor" value="${EditorState.toolProps.strokeColor}" style="width:20px;height:20px;border:none;cursor:pointer;background:transparent;">
      </div>

      <div class="pdf-prop-group">
        <label>السُمك:</label>
        <input type="range" id="propStrokeWidth" min="1" max="12" value="${EditorState.toolProps.strokeWidth}" style="width:70px;">
      </div>
    `;

    bar.querySelectorAll(".pdf-color-swatch").forEach(sw => {
      sw.addEventListener("click", () => {
        const col = sw.dataset.col;
        EditorState.toolProps.strokeColor = col;
        if (selectedAnno) {
          selectedAnno.strokeColor = col;
          renderAnnotations();
          triggerAutoSave();
        }
      });
    });

    document.getElementById("propStrokeWidth")?.addEventListener("input", (e) => {
      const w = parseInt(e.target.value, 10);
      EditorState.toolProps.strokeWidth = w;
      if (selectedAnno) {
        selectedAnno.strokeWidth = w;
        renderAnnotations();
        triggerAutoSave();
      }
    });
  }
}

/* ════════════════ 10. إدراج الصور والتوقيع الرقمي ════════════════ */
function triggerImageUpload() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (rev) => {
        pushHistoryState();
        const pageMeta = EditorState.pages[EditorState.activePageIndex];
        const newAnno = {
          id: `img_${Date.now()}`,
          type: "image",
          x: 100,
          y: 100,
          w: 160,
          h: 120,
          dataUrl: rev.target.result
        };
        pageMeta.annotations.push(newAnno);
        EditorState.hasUnsavedChanges = true;
        renderAnnotations();
        selectAnnotation(newAnno.id);
        setTool("select");
        triggerAutoSave();
      };
      reader.readAsDataURL(file);
    }
  };
  input.click();
}

function openSignatureModal() {
  if (typeof window.openModal !== "function") return;

  window.openModal(`
    <div class="modal-head">
      <h2>لوحة التوقيع الرقمي</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div style="margin-bottom:14px;">
      <canvas id="sigPadCanvas" class="pdf-sign-pad"></canvas>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <label style="font-size:12.5px;font-weight:700;">اللون:</label>
        <button type="button" class="pdf-color-swatch active" style="background:#1E1E1E;" data-sig-col="#1E1E1E"></button>
        <button type="button" class="pdf-color-swatch" style="background:#1D4ED8;" data-sig-col="#1D4ED8"></button>
        <button type="button" class="pdf-color-swatch" style="background:#C09A62;" data-sig-col="#C09A62"></button>
        <button type="button" class="btn btn-secondary btn-sm" id="btnClearSig" style="padding:4px 10px;font-size:12px;"><i class="fa-solid fa-eraser"></i> مسح</button>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
        <button type="button" class="btn btn-primary" id="btnSaveSig"><i class="fa-solid fa-check"></i> إدراج التوقيع</button>
      </div>
    </div>
  `);

  const sigCanvas = document.getElementById("sigPadCanvas");
  if (!sigCanvas) return;

  sigCanvas.width = sigCanvas.clientWidth * 2;
  sigCanvas.height = sigCanvas.clientHeight * 2;
  const ctx = sigCanvas.getContext("2d");
  ctx.scale(2, 2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#1E1E1E";

  let isDrawing = false;
  let hasStrokes = false;

  const startDraw = (x, y) => {
    isDrawing = true;
    hasStrokes = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const drawMove = (x, y) => {
    if (!isDrawing) return;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    isDrawing = false;
  };

  sigCanvas.addEventListener("mousedown", (e) => {
    const r = sigCanvas.getBoundingClientRect();
    startDraw(e.clientX - r.left, e.clientY - r.top);
  });
  sigCanvas.addEventListener("mousemove", (e) => {
    const r = sigCanvas.getBoundingClientRect();
    drawMove(e.clientX - r.left, e.clientY - r.top);
  });
  window.addEventListener("mouseup", endDraw);

  // دعم اللمس للجوال والأجهزة اللوحية
  sigCanvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.touches[0];
    const r = sigCanvas.getBoundingClientRect();
    startDraw(t.clientX - r.left, t.clientY - r.top);
  });
  sigCanvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const t = e.touches[0];
    const r = sigCanvas.getBoundingClientRect();
    drawMove(t.clientX - r.left, t.clientY - r.top);
  });
  sigCanvas.addEventListener("touchend", endDraw);

  document.querySelectorAll("[data-sig-col]").forEach(b => {
    b.addEventListener("click", () => {
      ctx.strokeStyle = b.dataset.sigCol;
      document.querySelectorAll("[data-sig-col]").forEach(x => x.classList.toggle("active", x === b));
    });
  });

  document.getElementById("btnClearSig")?.addEventListener("click", () => {
    ctx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    hasStrokes = false;
  });

  document.getElementById("btnSaveSig")?.addEventListener("click", () => {
    if (!hasStrokes) {
      if (window.toast) window.toast("يرجى رسم التوقيع أولاً", "err");
      return;
    }
    const dataUrl = sigCanvas.toDataURL("image/png");
    pushHistoryState();
    const pageMeta = EditorState.pages[EditorState.activePageIndex];
    const newAnno = {
      id: `sig_${Date.now()}`,
      type: "signature",
      x: 100,
      y: 100,
      w: 150,
      h: 75,
      dataUrl
    };
    pageMeta.annotations.push(newAnno);
    EditorState.hasUnsavedChanges = true;
    if (window.closeModal) window.closeModal();
    renderAnnotations();
    selectAnnotation(newAnno.id);
    setTool("select");
    triggerAutoSave();
  });
}

/* ════════════════ 11. دمج وتقسيم ملفات PDF (Merge & Split) ════════════════ */
function openMergePdfModal() {
  if (typeof window.openModal !== "function") return;

  window.openModal(`
    <div class="modal-head">
      <h2>دمج ملف PDF إضافي</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <p style="font-size:13px;color:var(--ink-muted);line-height:1.6;margin-bottom:16px;">
      اختر ملف PDF إضافي لدمج صفحاته مع هذا المستند. تتم المعالجة بالكامل محلياً وبسرعة.
    </p>
    <div class="card" style="padding:28px 16px;text-align:center;border:2px dashed var(--line);background:var(--bg-app);cursor:pointer;" id="mergeDropArea">
      <i class="fa-solid fa-file-circle-plus" style="font-size:36px;color:var(--gold-deep);margin-bottom:8px;"></i>
      <h4 style="font-size:14px;font-weight:700;margin:0 0 4px;">اضغط لاختيار ملف PDF المُراد دمجه</h4>
      <input type="file" id="inputMergePdf" accept=".pdf,application/pdf" style="display:none;">
    </div>
    <div id="mergeInfoWrap" style="display:none;margin-top:14px;background:var(--bg-subtle);padding:10px;border-radius:var(--r-sm);"></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
      <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
      <button type="button" class="btn btn-primary" id="btnExecuteMerge" disabled><i class="fa-solid fa-code-merge"></i> دمج الصفحات الآن</button>
    </div>
  `);

  const area = document.getElementById("mergeDropArea");
  const fileIn = document.getElementById("inputMergePdf");
  const infoWrap = document.getElementById("mergeInfoWrap");
  const btnExec = document.getElementById("btnExecuteMerge");
  let mergeBytes = null;

  area?.addEventListener("click", () => fileIn?.click());

  fileIn?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      mergeBytes = new Uint8Array(await file.arrayBuffer());
      infoWrap.style.display = "block";
      infoWrap.innerHTML = `<strong>الملف المختار:</strong> ${esc(file.name)} (${(file.size / 1024).toFixed(1)} KB)`;
      btnExec.disabled = false;
    }
  });

  btnExec?.addEventListener("click", async () => {
    btnExec.disabled = true;
    btnExec.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري الدمج...`;
    try {
      pushHistoryState();
      // دمج عبر PDFLib
      const srcDoc = await window.PDFLib.PDFDocument.load(mergeBytes, { ignoreEncryption: true });
      const copiedIndices = srcDoc.getPageIndices();
      const initialTotal = EditorState.pages.length;

      for (let i = 0; i < copiedIndices.length; i++) {
        EditorState.pages.push({
          pageNum: `merged_${Date.now()}_${i + 1}`,
          mergedDocBytes: mergeBytes,
          mergedPageIndex: i,
          rotation: 0,
          annotations: []
        });
      }

      EditorState.hasUnsavedChanges = true;
      if (window.closeModal) window.closeModal();
      if (window.toast) window.toast(`تم دمج ${copiedIndices.length} صفحات بنجاح!`);
      renderActivePage();
      renderThumbnailsList();
      triggerAutoSave();
    } catch (err) {
      console.error(err);
      if (window.toast) window.toast("تعذّر دمج الملف.", "err");
      btnExec.disabled = false;
    }
  });
}

function openSplitPdfModal() {
  if (typeof window.openModal !== "function") return;

  window.openModal(`
    <div class="modal-head">
      <h2>تقسيم واستخراج صفحات من المستند</h2>
      <button class="modal-close" data-close><i class="fa-solid fa-xmark"></i></button>
    </div>
    <p style="font-size:13px;color:var(--ink-muted);line-height:1.6;margin-bottom:14px;">
      حدد أرقام الصفحات التي ترغب باستخراجها وتنزيلها كملف PDF جديد منفصل:
    </p>
    <div class="form-group" style="margin-bottom:16px;">
      <label>أرقام ونطاقات الصفحات (مثال: 1, 3-5):</label>
      <input type="text" id="splitRangeInput" class="input" placeholder="مثال: 1, 2, 4-6" value="1-${EditorState.pages.length}">
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;">
      <button type="button" class="btn btn-secondary" data-close>إلغاء</button>
      <button type="button" class="btn btn-primary" id="btnExecuteSplit"><i class="fa-solid fa-download"></i> استخراج وتنزيل</button>
    </div>
  `);

  document.getElementById("btnExecuteSplit")?.addEventListener("click", async () => {
    const rangeStr = document.getElementById("splitRangeInput")?.value.trim();
    if (!rangeStr) return;

    try {
      const indicesToExtract = parsePageRange(rangeStr, EditorState.pages.length);
      if (indicesToExtract.length === 0) {
        if (window.toast) window.toast("نطاق الصفحات غير صالح", "err");
        return;
      }

      const newDoc = await window.PDFLib.PDFDocument.create();
      const origDoc = await window.PDFLib.PDFDocument.load(EditorState.pdfBytes, { ignoreEncryption: true });

      const copiedPages = await newDoc.copyPages(origDoc, indicesToExtract.map(idx => {
        const pMeta = EditorState.pages[idx];
        return (typeof pMeta.pageNum === "number") ? pMeta.pageNum - 1 : 0;
      }));

      copiedPages.forEach(p => newDoc.addPage(p));

      const outBytes = await newDoc.save();
      downloadBytes(outBytes, `${EditorState.fileName.replace(/\.pdf$/i, "")} - مستخرج.pdf`);
      if (window.closeModal) window.closeModal();
      if (window.toast) window.toast("تم استخراج الصفحات وتنزيل الملف بنجاح!");
    } catch (err) {
      console.error(err);
      if (window.toast) window.toast("تعذّر استخراج الصفحات.", "err");
    }
  });
}

function parsePageRange(str, maxPages) {
  const indices = new Set();
  const parts = str.split(",");
  for (let part of parts) {
    part = part.trim();
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.max(1, start); i <= Math.min(maxPages, end); i++) {
          indices.add(i - 1);
        }
      }
    } else {
      const num = Number(part);
      if (!isNaN(num) && num >= 1 && num <= maxPages) {
        indices.add(num - 1);
      }
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

/* ════════════════ 12. التصدير النهائي (High-Fidelity PDF Export) ════════════════ */
async function exportFinalPdf() {
  const btn = document.getElementById("btnExportPdf");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري إنشاء PDF...`;
  }

  try {
    const newDoc = await window.PDFLib.PDFDocument.create();
    const origDoc = await window.PDFLib.PDFDocument.load(EditorState.pdfBytes, { ignoreEncryption: true });

    for (let idx = 0; idx < EditorState.pages.length; idx++) {
      const pMeta = EditorState.pages[idx];
      let page;

      if (pMeta.isBlank) {
        page = newDoc.addPage([595, 842]);
      } else if (pMeta.mergedDocBytes) {
        const mDoc = await window.PDFLib.PDFDocument.load(pMeta.mergedDocBytes, { ignoreEncryption: true });
        const [cPage] = await newDoc.copyPages(mDoc, [pMeta.mergedPageIndex]);
        page = newDoc.addPage(cPage);
      } else {
        const [cPage] = await newDoc.copyPages(origDoc, [pMeta.pageNum - 1]);
        page = newDoc.addPage(cPage);
      }

      if (pMeta.rotation) {
        page.setRotation(window.PDFLib.degrees((page.getRotation().angle + pMeta.rotation) % 360));
      }

      // دمج العناصر والتعديلات على الصفحة
      if (pMeta.annotations && pMeta.annotations.length > 0) {
        const { width: pW, height: pH } = page.getSize();
        
        // رسم العناصر على كانفاس عالي الدقة وتحويلها لطبقة شفافة
        const overlayCanvas = document.createElement("canvas");
        overlayCanvas.width = pW * 2;
        overlayCanvas.height = pH * 2;
        const ctx = overlayCanvas.getContext("2d");
        ctx.scale(2, 2);

        for (const anno of pMeta.annotations) {
          if (anno.type === "text") {
            ctx.font = `${anno.isBold ? 'bold ' : ''}${anno.isItalic ? 'italic ' : ''}${anno.fontSize}px ${anno.fontFamily}`;
            ctx.fillStyle = anno.color || "#1E1E1E";
            ctx.textAlign = "right";
            ctx.fillText(anno.text || "", anno.x + (anno.w || 100), anno.y + anno.fontSize);
          } else if (anno.type === "rectangle") {
            ctx.lineWidth = anno.strokeWidth;
            ctx.strokeStyle = anno.strokeColor;
            ctx.fillStyle = anno.fillColor;
            ctx.strokeRect(anno.x, anno.y, anno.w, anno.h);
            if (anno.fillColor !== "transparent") ctx.fillRect(anno.x, anno.y, anno.w, anno.h);
          } else if (anno.type === "circle") {
            ctx.lineWidth = anno.strokeWidth;
            ctx.strokeStyle = anno.strokeColor;
            ctx.fillStyle = anno.fillColor;
            ctx.beginPath();
            ctx.ellipse(anno.x + anno.w/2, anno.y + anno.h/2, anno.w/2, anno.h/2, 0, 0, 2*Math.PI);
            ctx.stroke();
            if (anno.fillColor !== "transparent") ctx.fill();
          } else if (anno.type === "signature" || anno.type === "image") {
            await new Promise((res) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => {
                ctx.drawImage(img, anno.x, anno.y, anno.w, anno.h);
                res();
              };
              img.onerror = () => res();
              img.src = anno.dataUrl;
            });
          } else if (anno.type === "draw" || anno.type === "highlight") {
            ctx.save();
            ctx.strokeStyle = anno.strokeColor;
            ctx.lineWidth = anno.strokeWidth;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.globalAlpha = anno.opacity || 1;
            const p2d = new Path2D(anno.pathData);
            ctx.translate(anno.x, anno.y);
            ctx.stroke(p2d);
            ctx.restore();
          }
        }

        const overlayDataUrl = overlayCanvas.toDataURL("image/png");
        const overlayImgBytes = await fetch(overlayDataUrl).then(r => r.arrayBuffer());
        const embeddedImg = await newDoc.embedPng(overlayImgBytes);
        page.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: pW,
          height: pH
        });
      }
    }

    const finalBytes = await newDoc.save();
    let outName = EditorState.fileName.replace(/\.pdf$/i, "");
    outName = `${outName} - محرر.pdf`;

    downloadBytes(finalBytes, outName);
    EditorState.hasUnsavedChanges = false;
    await PdfStorage.clearSession();

    if (window.toast) window.toast("تم حفظ وتحميل ملف PDF بنجاح!");
  } catch (err) {
    console.error("Export PDF error:", err);
    if (window.toast) window.toast("تعذّر تصدير ملف PDF.", "err");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-download"></i> حفظ وتحميل PDF`;
    }
  }
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/* ════════════════ 13. التراجع والإعادة والحفظ التلقائي ════════════════ */
function pushHistoryState() {
  const snapshot = JSON.stringify({
    pages: EditorState.pages,
    activePageIndex: EditorState.activePageIndex
  });
  EditorState.undoStack.push(snapshot);
  if (EditorState.undoStack.length > 30) EditorState.undoStack.shift();
  EditorState.redoStack = [];
  updateUndoRedoBtns();
}

function undo() {
  if (EditorState.undoStack.length === 0) return;
  const cur = JSON.stringify({
    pages: EditorState.pages,
    activePageIndex: EditorState.activePageIndex
  });
  EditorState.redoStack.push(cur);

  const prev = JSON.parse(EditorState.undoStack.pop());
  EditorState.pages = prev.pages;
  EditorState.activePageIndex = prev.activePageIndex;
  EditorState.hasUnsavedChanges = true;
  updateUndoRedoBtns();
  renderActivePage();
  renderThumbnailsList();
  triggerAutoSave();
}

function redo() {
  if (EditorState.redoStack.length === 0) return;
  const cur = JSON.stringify({
    pages: EditorState.pages,
    activePageIndex: EditorState.activePageIndex
  });
  EditorState.undoStack.push(cur);

  const next = JSON.parse(EditorState.redoStack.pop());
  EditorState.pages = next.pages;
  EditorState.activePageIndex = next.activePageIndex;
  EditorState.hasUnsavedChanges = true;
  updateUndoRedoBtns();
  renderActivePage();
  renderThumbnailsList();
  triggerAutoSave();
}

function updateUndoRedoBtns() {
  const u = document.getElementById("btnUndo");
  const r = document.getElementById("btnRedo");
  if (u) u.disabled = EditorState.undoStack.length === 0;
  if (r) r.disabled = EditorState.redoStack.length === 0;
}

function triggerAutoSave() {
  clearTimeout(EditorState.autoSaveTimer);
  EditorState.autoSaveTimer = setTimeout(async () => {
    if (EditorState.pdfBytes) {
      await PdfStorage.saveSession({
        fileName: EditorState.fileName,
        pdfBytes: EditorState.pdfBytes,
        pages: EditorState.pages,
        activePageIndex: EditorState.activePageIndex
      });
    }
  }, 1000);
}

/* ════════ حماية العمل من الضياع عند التنقل داخل البوابة ════════ */
export function checkUnsavedAndLeave(onProceed) {
  if (!EditorState.hasUnsavedChanges) {
    if (onProceed) onProceed();
    return;
  }

  if (typeof window.openConfirmModal === "function") {
    window.openConfirmModal({
      title: "لديك تعديلات غير محفوظة",
      message: "إذا غادرت محرر PDF الآن، قد تفقد التعديلات التي أجريتها على المستند.",
      confirmText: "مغادرة المحرر",
      confirmType: "danger",
      onConfirm: () => {
        EditorState.hasUnsavedChanges = false;
        if (onProceed) onProceed();
      }
    });
  } else {
    if (confirm("لديك تعديلات غير محفوظة. هل ترغب بالمغادرة؟")) {
      EditorState.hasUnsavedChanges = false;
      if (onProceed) onProceed();
    }
  }
}
