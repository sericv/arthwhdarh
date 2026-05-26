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
            var card  = btn.closest('.rp-card');
            var title = card ? card.querySelector('.rp-card-title') : null;

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
       4. CARD SUBTLE PARALLAX on mouse move (desktop only)
       Creates a gentle depth tilt on each card as the cursor
       moves over it — reinforces the premium material feel.
    ───────────────────────────────────────────────────────── */
    function initCardTilt() {
        if (window.matchMedia('(hover: none)').matches) return; /* skip on touch */

        var cards = document.querySelectorAll('.rp-card');
        var STRENGTH = 5; /* max tilt degrees */

        cards.forEach(function (card) {
            card.addEventListener('mousemove', function (e) {
                var rect    = card.getBoundingClientRect();
                var cx      = rect.left + rect.width  / 2;
                var cy      = rect.top  + rect.height / 2;
                var dx      = (e.clientX - cx) / (rect.width  / 2);
                var dy      = (e.clientY - cy) / (rect.height / 2);
                var rotateY = dx * STRENGTH;
                var rotateX = -dy * STRENGTH * 0.6;

                card.style.transform =
                    'translateY(-5px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg)';
                card.style.transition = 'transform 0.12s ease, box-shadow 0.5s';
            });

            card.addEventListener('mouseleave', function () {
                card.style.transform  = '';
                card.style.transition = 'transform 0.5s cubic-bezier(0.22,1,0.36,1), box-shadow 0.5s';
            });
        });
    }

    /* ─────────────────────────────────────────────────────────
       INIT
    ───────────────────────────────────────────────────────── */
    function init() {
        initScrollReveal();
        initModal();
        initNavHighlight();
        initCardTilt();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
