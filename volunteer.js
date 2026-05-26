/* ═══════════════════════════════════════════════════════════════
   VOLUNTEER.JS — جمعية إرث وحضارة بالقريات
   Volunteer & Participation Page — Interactions
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
       2. SMOOTH NAV ACTIVE LINK
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
       3. SMOOTH SCROLL FOR ANCHOR LINKS
       Handles in-page anchor navigation (e.g. #bidaydi, #volunteer)
       from the closing CTA buttons with a smooth ease.
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

            var offset      = 80; /* account for sticky nav height */
            var targetTop   = targetEl.getBoundingClientRect().top + window.pageYOffset - offset;

            window.scrollTo({
                top:      targetTop,
                behavior: 'smooth'
            });
        });
    }

    /* ─────────────────────────────────────────────────────────
       4. VISUAL FRAME SUBTLE PARALLAX (desktop only)
       Gentle depth movement on the programme visual frames
       as the cursor moves over them — reinforces editorial depth.
    ───────────────────────────────────────────────────────── */
    function initFrameParallax() {
        if (window.matchMedia('(hover: none)').matches) return; /* skip on touch */

        var frames   = document.querySelectorAll('.vl-visual-frame');
        var STRENGTH = 6; /* max tilt degrees */

        frames.forEach(function (frame) {
            var wrapper = frame.closest('.vl-programme-visual') || frame;

            wrapper.addEventListener('mousemove', function (e) {
                var rect    = frame.getBoundingClientRect();
                var cx      = rect.left + rect.width  / 2;
                var cy      = rect.top  + rect.height / 2;
                var dx      = (e.clientX - cx) / (rect.width  / 2);
                var dy      = (e.clientY - cy) / (rect.height / 2);
                var rotateY = dx * STRENGTH;
                var rotateX = -dy * STRENGTH * 0.55;

                frame.style.transform =
                    'scale(1.015) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg)';
                frame.style.transition = 'transform 0.12s ease';
            });

            wrapper.addEventListener('mouseleave', function () {
                frame.style.transform  = '';
                frame.style.transition = 'transform 0.55s cubic-bezier(0.22,1,0.36,1)';
            });
        });
    }

    /* ─────────────────────────────────────────────────────────
       5. VALUE CARDS HOVER GLOW
       Subtle golden glow tracks the cursor inside each value card.
    ───────────────────────────────────────────────────────── */
    function initValueCardGlow() {
        if (window.matchMedia('(hover: none)').matches) return;

        var cards = document.querySelectorAll('.vl-value-card');

        cards.forEach(function (card) {
            card.addEventListener('mousemove', function (e) {
                var rect = card.getBoundingClientRect();
                var x    = ((e.clientX - rect.left) / rect.width)  * 100;
                var y    = ((e.clientY - rect.top)  / rect.height) * 100;

                card.style.setProperty('--glow-x', x + '%');
                card.style.setProperty('--glow-y', y + '%');
                card.classList.add('is-glowing');
            });

            card.addEventListener('mouseleave', function () {
                card.classList.remove('is-glowing');
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
        initFrameParallax();
        initValueCardGlow();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
