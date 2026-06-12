/* ════════════════════════════════════════════════════════════════════════
   holo-text.js — digital scramble/decode text effect
   YgoBindr / KaibaCorp Holo-Terminal
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  var GLYPHS = '!<>-_\\/[]{}=+*^?#01010101ABCDEFGHJKLMNPQRSTUVWXYZ';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function rand(set) { return set.charAt(Math.floor(Math.random() * set.length)); }

  function decode(el, opts) {
    if (!el) return;
    opts = opts || {};
    var target = el.getAttribute('data-decode-text');
    if (target == null) {
      target = el.textContent;
      el.setAttribute('data-decode-text', target);
    }
    if (reduced) { el.textContent = target; return; }

    var perChar = opts.speed || parseInt(el.getAttribute('data-decode'), 10) || 28;
    var scrambleMs = opts.scramble || 380;
    var start = null;
    el.classList.add('holo-decoding');

    var caret = document.createElement('span');
    caret.className = 'holo-type-caret';
    caret.setAttribute('aria-hidden', 'true');

    function frame(now) {
      if (start == null) start = now;
      var elapsed = now - start;
      var settled = Math.floor(elapsed / perChar);
      var out = '';
      for (var i = 0; i < target.length; i++) {
        var ch = target.charAt(i);
        if (ch === ' ' || ch === '\n') { out += ch; continue; }
        if (i < settled) {
          out += ch;
        } else if (elapsed < scrambleMs + i * perChar) {
          out += rand(GLYPHS);
        } else {
          out += ch;
        }
      }
      var lead = out.slice(0, Math.min(settled, target.length));
      var rest = out.slice(Math.min(settled, target.length));
      el.textContent = '';
      el.appendChild(document.createTextNode(lead));
      el.appendChild(caret);
      el.appendChild(document.createTextNode(rest));
      if (settled < target.length) {
        requestAnimationFrame(frame);
      } else {
        el.textContent = target;
        el.classList.remove('holo-decoding');
        el.classList.add('holo-decoded');
        if (el.hasAttribute('data-caret')) {
          el.appendChild(caret);
        }
      }
    }
    requestAnimationFrame(frame);
  }

  function decodeAll(root) {
    (root || document).querySelectorAll('[data-decode]').forEach(function (el) { decode(el); });
  }

  window.HoloText = { decode: decode, decodeAll: decodeAll };

  function trackFocus(e, on) {
    var field = e.target;
    if (!field || !field.closest) return;
    var wrap = field.closest('.holo-input');
    if (wrap) { if (on) wrap.setAttribute('data-focus', ''); else wrap.removeAttribute('data-focus'); }
  }
  document.addEventListener('focusin', function (e) { trackFocus(e, true); });
  document.addEventListener('focusout', function (e) { trackFocus(e, false); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { decodeAll(document); });
  } else {
    decodeAll(document);
  }
})();
