/* global IntersectionObserver, document, window */
/* ---------------------------------------------------------------------------
 * Landing page interactions:
 *   - Scroll-reveal via IntersectionObserver
 *   - Sticky nav background on scroll
 *   - Dynamic copyright year
 *   - Smooth scroll for anchor links
 * ------------------------------------------------------------------------ */

(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function getScrollBehavior() {
    return prefersReducedMotion.matches ? 'auto' : 'smooth';
  }

  function focusFragmentTarget(target) {
    if (!target) return;

    var hadTabIndex = target.hasAttribute('tabindex');
    if (!hadTabIndex) {
      target.setAttribute('tabindex', '-1');
    }

    target.focus({ preventScroll: true });

    if (!hadTabIndex) {
      target.addEventListener(
        'blur',
        function handleBlur() {
          target.removeAttribute('tabindex');
          target.removeEventListener('blur', handleBlur);
        },
        { once: true }
      );
    }
  }

  /* -- Scroll reveal -- */
  const revealEls = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal--visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    revealEls.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    /* Fallback: show everything immediately */
    revealEls.forEach(function (el) {
      el.classList.add('reveal--visible');
    });
  }

  /* -- Nav scroll effect -- */
  var nav = document.querySelector('.nav');
  var scrollThreshold = 60;

  function onScroll() {
    if (!nav) return;
    if (window.scrollY > scrollThreshold) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* -- Copyright year -- */
  var yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  /* -- Smooth scroll for anchor links -- */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId === '#') return;
      var target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' });
        focusFragmentTarget(target);
        if (window.location.hash !== targetId) {
          window.history.pushState(null, '', targetId);
        }
      }
    });
  });
})();
