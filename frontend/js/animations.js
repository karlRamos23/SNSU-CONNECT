
/*
 * SNSU CONNECTS — lightweight page-motion controller
 */

(function () {
  'use strict';

  const reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let lastView = '';
  let queued = false;

  function animateView() {
    queued = false;

    const main = document.querySelector('#app > main');

    if (!main || reduced) return;

    const view = main.className || 'main-view';

    // Avoid replaying the animation for same-page renders.
    if (view === lastView) return;

    lastView = view;

    main.classList.remove('sns-page-enter');

    // Reflow only when changing pages.
    void main.offsetWidth;

    main.classList.add('sns-page-enter');
  }

  function schedule() {
    if (queued || reduced) return;

    queued = true;
    requestAnimationFrame(animateView);
  }

  function init() {
    const app = document.getElementById('app');

    if (!app) return;

    // Observe only direct app-shell changes.
    new MutationObserver(schedule).observe(app, {
      childList: true
    });

    schedule();

    // Optional helpers for loading animations.
    window.SNSUMotion = {
      refresh: schedule,

      spin(element) {
        if (element) {
          element.classList.add('sns-spin');
        }
      },

      stop(element) {
        if (element) {
          element.classList.remove('sns-spin');
        }
      },

      pulse(element) {
        if (element) {
          element.classList.add('sns-pulse');
        }
      },

      stopPulse(element) {
        if (element) {
          element.classList.remove('sns-pulse');
        }
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {
      once: true
    });
  } else {
    init();
  }

})();
