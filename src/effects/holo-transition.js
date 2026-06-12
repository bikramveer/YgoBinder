/* ════════════════════════════════════════════════════════════════════════
   holo-transition.js — theme cross-fade
   YgoBindr / KaibaCorp Holo-Terminal
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  var running = false;

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function currentBg() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    return v || '#060c1c';
  }

  function fade(apply, opts) {
    opts = opts || {};
    if (typeof apply !== 'function') apply = function () {};
    if (reducedMotion() || running) { apply(); return; }
    running = true;

    var duration = opts.duration || 520;
    var half = Math.round(duration / 2);
    var color = opts.color || currentBg();

    var veil = document.createElement('div');
    veil.setAttribute('aria-hidden', 'true');
    veil.style.cssText =
      'position:fixed;inset:0;z-index:99999;pointer-events:none;background:' + color + ';' +
      'opacity:0;transition:opacity ' + half + 'ms ease-in-out;will-change:opacity;';
    document.body.appendChild(veil);

    void veil.offsetWidth;
    requestAnimationFrame(function () { veil.style.opacity = '1'; });

    setTimeout(function () {
      try { apply(); } catch (e) {}
      veil.style.background = opts.color || currentBg();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { veil.style.opacity = '0'; });
      });
    }, half + 30);

    setTimeout(function () {
      veil.remove();
      running = false;
    }, half + 30 + half + 80);
  }

  window.HoloTransition = { fade: fade, digitize: fade };
})();
