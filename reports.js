/* ═══════════════════════════════════════════════════════════════
   REPORTS.JS — جمعية إرث وحضارة بالقريات
   Premium Institutional Reports Archive — Interactions
═══════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ─────────────────────────────────────────────────────────
       1. SCROLL REVEAL — IntersectionObserver
    ───────────────────────────────────────────────────────── */
    function initScrollReveal() {
        var targets = document.querySelectorAll('[data-reveal]');
        if (!targets.length) return;

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    io.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.08,
            rootMargin: '0px 0px -40px 0px'
        });

        targets.forEach(function (el) { io.observe(el); });
    }

    /* ─────────────────────────────────────────────────────────
       2. PDF VIEWER MODAL
       "عرض التقرير" buttons open the PDF in an inline iframe modal.
       "تحميل التقرير" buttons use native download — no JS needed.
    ───────────────────────────────────────────────────────── */
    function initModal() {
        var modal    = document.getElementById('rpModal');
        var frame    = document.getElementById('rpModalFrame');
        var titleEl  = document.getElementById('rpModalTitle');
        var closeBtn = document.getElementById('rpModalClose');
        var backdrop = document.getElementById('rpModalBackdrop');

        if (!modal) return;

        /* Open modal when a "view" button is clicked */
        document.addEventListener('click', function (e) {
            var btn = e.target.closest('.rp-btn--view');
            if (!btn) return;

            e.preventDefault();

            var href  = btn.getAttribute('href');
            var card  = btn.closest('.gv-doc');
            var title = card ? card.querySelector('.gv-doc-title') : null;

            /* Set iframe source and modal title */
            frame.src    = href;
            titleEl.textContent = title ? title.textContent.trim() : 'عرض التقرير';

            /* Show modal */
            modal.hidden = false;
            document.body.style.overflow = 'hidden';

            /* Focus close button for accessibility */
            setTimeout(function () { closeBtn.focus(); }, 80);
        });

        /* Close via close button */
        closeBtn.addEventListener('click', closeModal);

        /* Close via backdrop click */
        backdrop.addEventListener('click', closeModal);

        /* Close via Escape key */
        document.addEventListener('keydown', function (e) {
            if (!modal.hidden && (e.key === 'Escape' || e.key === 'Esc')) {
                closeModal();
            }
        });

        function closeModal() {
            modal.hidden = true;
            document.body.style.overflow = '';
            /* Clear src so no background loading */
            frame.src = '';
        }
    }

    /* ─────────────────────────────────────────────────────────
       3. SMOOTH NAV ACTIVE LINK
    ───────────────────────────────────────────────────────── */
    function initNavHighlight() {
        var currentPage = window.location.pathname.split('/').pop();
        var navLinks    = document.querySelectorAll('.nav-links a');

        navLinks.forEach(function (link) {
            var href = link.getAttribute('href');
            if (href && href === currentPage) {
                link.classList.add('active');
            }
        });
    }

    /* ─────────────────────────────────────────────────────────
       INIT
    ───────────────────────────────────────────────────────── */
    function init() {
        initScrollReveal();
        initModal();
        initNavHighlight();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
