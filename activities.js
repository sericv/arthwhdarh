/* ═══════════════════════════════════════════════════════════════
   ACTIVITIES.JS — جمعية إرث وحضارة بالقريات
   Premium Editorial Activities Page — Interactions
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
            threshold: 0.10,
            rootMargin: '0px 0px -48px 0px'
        });

        targets.forEach(function (el) { io.observe(el); });
    }

    /* ─────────────────────────────────────────────────────────
       2. HERO COUNTER ANIMATION
    ───────────────────────────────────────────────────────── */
    function animateCounters() {
        var counters = document.querySelectorAll('[data-counter]');
        if (!counters.length) return;

        var hasRun = false;

        var heroObserver = new IntersectionObserver(function (entries) {
            if (hasRun) return;
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    hasRun = true;
                    counters.forEach(function (el) {
                        var target  = parseInt(el.getAttribute('data-counter'), 10);
                        var suffix  = el.getAttribute('data-suffix') || '';
                        var duration = 1800;
                        var start   = performance.now();

                        function step(now) {
                            var elapsed  = now - start;
                            var progress = Math.min(elapsed / duration, 1);
                            // ease-out cubic
                            var eased    = 1 - Math.pow(1 - progress, 3);
                            var current  = Math.round(eased * target);
                            el.textContent = current.toLocaleString('ar-SA') + suffix;
                            if (progress < 1) requestAnimationFrame(step);
                        }

                        requestAnimationFrame(step);
                    });
                    heroObserver.disconnect();
                }
            });
        }, { threshold: 0.3 });

        var statsBar = document.querySelector('.acts-hero-stats');
        if (statsBar) heroObserver.observe(statsBar);
    }

    /* ─────────────────────────────────────────────────────────
       3. FILTER TABS — smooth section scroll
    ───────────────────────────────────────────────────────── */
    function initFilterTabs() {
        var btns = document.querySelectorAll('.acts-filter-btn[data-target]');
        var allBlocks = document.querySelectorAll('.activity-block[data-id]');

        if (!btns.length) return;

        btns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var target = btn.getAttribute('data-target');

                // Update active state
                btns.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');

                if (target === 'all') {
                    // Scroll to top of content
                    var firstBlock = allBlocks[0];
                    if (firstBlock) {
                        var offset = firstBlock.getBoundingClientRect().top + window.pageYOffset - 120;
                        window.scrollTo({ top: offset, behavior: 'smooth' });
                    }
                } else {
                    // Scroll to specific block
                    var block = document.querySelector('.activity-block[data-id="' + target + '"]');
                    if (block) {
                        var offsetTop = block.getBoundingClientRect().top + window.pageYOffset - 110;
                        window.scrollTo({ top: offsetTop, behavior: 'smooth' });
                    }
                }
            });
        });

        // Highlight active tab on scroll
        var blockList = Array.from(allBlocks);
        var allBtns   = Array.from(btns);

        window.addEventListener('scroll', function () {
            var scrollY = window.pageYOffset + 160;

            var current = null;
            blockList.forEach(function (block) {
                if (block.offsetTop <= scrollY) {
                    current = block.getAttribute('data-id');
                }
            });

            if (current) {
                allBtns.forEach(function (b) {
                    b.classList.toggle('active',
                        b.getAttribute('data-target') === current);
                });
            }
        }, { passive: true });
    }

    /* ─────────────────────────────────────────────────────────
       4. PARALLAX — subtle drift on hero background
    ───────────────────────────────────────────────────────── */
    function initHeroParallax() {
        var heroBg = document.querySelector('.acts-hero-bg');
        if (!heroBg) return;

        var ticking = false;

        window.addEventListener('scroll', function () {
            if (!ticking) {
                requestAnimationFrame(function () {
                    var scrolled = window.pageYOffset;
                    var rate     = scrolled * 0.25;
                    heroBg.style.transform = 'translateY(' + rate + 'px)';
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    /* ─────────────────────────────────────────────────────────
       5. CINEMATIC STRIP — slow Ken Burns drift on hover
    ───────────────────────────────────────────────────────── */
    function initCinematicDrift() {
        var strips = document.querySelectorAll('.layout-cinematic-strip');
        strips.forEach(function (strip) {
            var img = strip.querySelector('img');
            if (!img) return;

            strip.addEventListener('mouseenter', function () {
                img.style.transition = 'transform 8s ease-in-out';
                img.style.transform  = 'scale(1.06) translateY(-10px)';
            });

            strip.addEventListener('mouseleave', function () {
                img.style.transition = 'transform 5s ease-in-out';
                img.style.transform  = 'scale(1) translateY(0)';
            });
        });
    }

    /* ─────────────────────────────────────────────────────────
       6. SMOOTH NAV ACTIVE LINK HIGHLIGHT
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
        animateCounters();
        initFilterTabs();
        initHeroParallax();
        initCinematicDrift();
        initNavHighlight();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
