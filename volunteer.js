/* ═══════════════════════════════════════════════════════════════
   VOLUNTEER.JS — جمعية إرث وحضارة بالقريات
   Volunteer Programme — Interactions & Micro-animations
═══════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ─────────────────────────────────────────────────────────
       1. SCROLL REVEAL — IntersectionObserver
    ───────────────────────────────────────────────────────── */
    function initScrollReveal() {
        var targets = document.querySelectorAll('[data-reveal]');
        if (!targets.length) return;

        if (!('IntersectionObserver' in window)) {
            targets.forEach(function (el) { el.classList.add('revealed'); });
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    io.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.08,
            rootMargin: '0px 0px -30px 0px'
        });

        targets.forEach(function (el) { io.observe(el); });
    }

    /* ─────────────────────────────────────────────────────────
       2. NAV ACTIVE LINK HIGHLIGHT
    ───────────────────────────────────────────────────────── */
    function initNavHighlight() {
        var path = window.location.pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
        var navLinks = document.querySelectorAll('.nav-links a, .mobile-menu-links a');

        navLinks.forEach(function (link) {
            var href = (link.getAttribute('href') || '').toLowerCase().replace(/^\/+|\/+$/g, '');
            if (href && (path === href || path.endsWith(href) || href.endsWith(path))) {
                link.classList.add('active');
            }
        });
    }

    /* ─────────────────────────────────────────────────────────
       3. SMOOTH SCROLL FOR ANCHOR LINKS
    ───────────────────────────────────────────────────────── */
    function initSmoothScroll() {
        document.addEventListener('click', function (e) {
            var link = e.target.closest('a[href^="#"]');
            if (!link) return;

            var targetId = link.getAttribute('href');
            if (!targetId || targetId === '#') return;

            var targetEl = document.querySelector(targetId);
            if (!targetEl) return;

            e.preventDefault();
            var offset = 80;
            var targetTop = targetEl.getBoundingClientRect().top + window.pageYOffset - offset;

            window.scrollTo({
                top: targetTop,
                behavior: 'smooth'
            });
        });
    }

    /* ─────────────────────────────────────────────────────────
       INIT
    ───────────────────────────────────────────────────────── */
    function init() {
        initScrollReveal();
        initNavHighlight();
        initSmoothScroll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
