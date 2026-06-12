/* ════════════════════════════════════════════════════════════════════════
   holo-circuit.js — procedural, non-repeating circuit-board background
   YgoBindr / KaibaCorp Holo-Terminal
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function cssVar(el, name, fallback) {
    var v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  }
  function toRGB(hex) {
    hex = (hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(hex || '3a8fff', 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function Circuit(el) {
    this.el = el;
    this.fixed = el.hasAttribute('data-circuit-fixed');
    el.setAttribute('data-circuit', '');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.backgroundImage = 'none';
    el.style.animation = 'none';

    Array.prototype.forEach.call(el.children, function (c) {
      var p = getComputedStyle(c).position;
      if (p === 'static') c.style.position = 'relative';
    });

    var layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = (this.fixed ? 'position:fixed' : 'position:absolute') + ';inset:0;z-index:0;pointer-events:none;overflow:hidden;' +
      '-webkit-mask-image:radial-gradient(ellipse 96% 88% at 50% 44%,#000 52%,transparent 100%);' +
      'mask-image:radial-gradient(ellipse 96% 88% at 50% 44%,#000 52%,transparent 100%);';
    this.base = document.createElement('canvas');
    this.fx = document.createElement('canvas');
    [this.base, this.fx].forEach(function (cv) {
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    });
    layer.appendChild(this.base);
    layer.appendChild(this.fx);
    el.insertBefore(layer, el.firstChild);
    this.layer = layer;

    this.traces = [];
    this.pulses = [];
    this.build();

    var self = this;
    this._onResize = function () {
      clearTimeout(self._rt);
      self._rt = setTimeout(function () { self.build(); }, 200);
    };
    window.addEventListener('resize', this._onResize);
    if (window.ResizeObserver && !self.fixed) {
      self._ro = new ResizeObserver(function () {
        clearTimeout(self._rt);
        self._rt = setTimeout(function () { self.build(); }, 200);
      });
      self._ro.observe(el);
    }
    if (!reduced) requestAnimationFrame(function (t) { self.loop(t); });
  }

  Circuit.prototype.build = function () {
    var el = this.el;
    var w = this.fixed ? window.innerWidth : el.clientWidth;
    var h = this.fixed ? window.innerHeight : el.clientHeight;
    if (!w || !h) return;
    this.w = w; this.h = h;
    [this.base, this.fx].forEach(function (cv) {
      cv.width = w * DPR; cv.height = h * DPR;
    });
    var rgb = toRGB(cssVar(el, '--accent', '#3a8fff'));
    this.rgb = rgb;
    var c = rgb.join(',');

    var ctx = this.base.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    var pitch = 38;
    var cols = Math.ceil(w / pitch) + 2;
    var rows = Math.ceil(h / pitch) + 2;
    this.traces = [];

    var density = Math.round(cols * rows * 0.28);
    for (var i = 0; i < density; i++) {
      var gx = (Math.random() * cols | 0);
      var gy = (Math.random() * rows | 0);
      var x = gx * pitch + rnd(-5, 5);
      var y = gy * pitch + rnd(-5, 5);
      var pts = [[x, y]];
      var segs = 1 + (Math.random() * 4 | 0);
      var dir = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      for (var s = 0; s < segs; s++) {
        if (Math.random() < 0.5) dir = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        var len = pitch * (1 + (Math.random() * 3 | 0));
        var nx = x + dir[0] * len, ny = y + dir[1] * len;
        if (Math.random() < 0.32) {
          var d2 = pick([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
          var dl = pitch * (0.6 + Math.random());
          pts.push([x + d2[0] * dl, y + d2[1] * dl]);
          x += d2[0] * dl; y += d2[1] * dl;
          nx = x + dir[0] * len; ny = y + dir[1] * len;
        }
        pts.push([nx, ny]); x = nx; y = ny;
      }

      var width = pick([0.8, 1, 1, 1.4, 2]);
      var bright = Math.random() < 0.18;
      var alpha = bright ? 0.55 : rnd(0.16, 0.34);
      ctx.strokeStyle = 'rgba(' + c + ',' + alpha + ')';
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var p = 1; p < pts.length; p++) ctx.lineTo(pts[p][0], pts[p][1]);
      ctx.stroke();

      this.drawNode(ctx, c, pts[pts.length - 1], width);
      if (Math.random() < 0.4) this.drawNode(ctx, c, pts[0], width);

      if (pts.length >= 3) this.traces.push(pts);
    }

    this.pulses = [];
    if (!reduced && this.traces.length) {
      var count = Math.min(16, Math.max(6, Math.round((w * h) / 90000)));
      for (var k = 0; k < count; k++) this.pulses.push(this.newPulse());
    }
  };

  Circuit.prototype.drawNode = function (ctx, c, pt, width) {
    var r = Math.random();
    ctx.save();
    if (r < 0.4) {
      var sz = 5 + width;
      ctx.fillStyle = 'rgba(' + c + ',0.5)';
      ctx.fillRect(pt[0] - sz / 2, pt[1] - sz / 2, sz, sz);
    } else if (r < 0.72) {
      ctx.strokeStyle = 'rgba(' + c + ',0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 2.4 + width, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(' + c + ',0.85)';
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  Circuit.prototype.newPulse = function () {
    var pts = pick(this.traces);
    var segs = [], total = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      var len = Math.hypot(dx, dy);
      segs.push({ a: pts[i - 1], b: pts[i], len: len });
      total += len;
    }
    return { segs: segs, total: total, t: Math.random() * total, speed: rnd(45, 100), delay: rnd(0, 0.7) };
  };

  Circuit.prototype.posAt = function (pulse, dist) {
    var d = dist % pulse.total;
    for (var i = 0; i < pulse.segs.length; i++) {
      var s = pulse.segs[i];
      if (d <= s.len) {
        var f = s.len ? d / s.len : 0;
        return [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f];
      }
      d -= s.len;
    }
    return pulse.segs[0].a;
  };

  Circuit.prototype.loop = function (t) {
    var self = this;
    if (!this._last) this._last = t;
    var dt = Math.min(0.05, (t - this._last) / 1000);
    this._last = t;
    var ctx = this.fx.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    var c = this.rgb.join(',');
    for (var i = 0; i < this.pulses.length; i++) {
      var p = this.pulses[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += p.speed * dt;
      var head = this.posAt(p, p.t);
      for (var k = 0; k < 6; k++) {
        var tail = this.posAt(p, p.t - k * 4);
        var a = (1 - k / 6) * 0.5;
        ctx.fillStyle = 'rgba(' + c + ',' + a + ')';
        ctx.beginPath();
        ctx.arc(tail[0], tail[1], 1.8 - k * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(' + c + ',0.95)';
      ctx.shadowColor = 'rgba(' + c + ',0.9)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(head[0], head[1], 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (p.t > p.total * 2) this.pulses[i] = this.newPulse();
    }
    requestAnimationFrame(function (tt) { self.loop(tt); });
  };

  function mount(el) {
    if (!el || el.hasAttribute('data-circuit')) return;
    try { el._holoCircuit = new Circuit(el); } catch (e) { console.warn('holo-circuit:', e); }
  }
  function mountAll(root) {
    (root || document).querySelectorAll('.holo-grid:not([data-circuit])').forEach(mount);
  }

  window.HoloCircuit = { mount: mount, mountAll: mountAll };

  function init() {
    mountAll(document);
    var mo = new MutationObserver(function () { mountAll(document); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
