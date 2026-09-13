// shield/views/dashboard.js
'use strict';

/**
 * Live monitoring dashboard. Self-contained: Tailwind via CDN, vanilla JS,
 * SSE stream from `${basePath}/api/events`.
 *
 * Features:
 *  - Live stats, sparkline, event log, top talkers, blocked IPs
 *  - Click any IP to auto-fill the Manual Block form
 *  - Quick-block lock icon on every log row (15-min default)
 *  - Toast notifications for all admin actions
 */
module.exports = /* html */ `<!doctype html>
<html lang="en" class="h-full">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DDoS Shield · Live Traffic Control</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #0f172a; }
  ::-webkit-scrollbar-thumb { background: #334155; border-radius: 9999px; }
  .dot { width: 8px; height: 8px; border-radius: 9999px; display: inline-block; }

  /* ---------- clickable IP ---------- */
  .ip-clickable {
    cursor: pointer;
    border-bottom: 1px dashed rgba(148,163,184,.4);
    transition: color .15s, border-color .15s, background .15s;
    padding: 0 2px;
    border-radius: 3px;
  }
  .ip-clickable:hover {
    color: #f87171;
    border-bottom-color: #f87171;
    background: rgba(244,63,94,.08);
  }

  /* ---------- quick-block lock button ---------- */
  .quick-block {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid rgba(148,163,184,.2);
    color: rgba(148,163,184,.7);
    font-size: 11px;
    cursor: pointer;
    transition: all .15s;
    flex-shrink: 0;
  }
  .quick-block:hover {
    background: rgba(244,63,94,.15);
    border-color: rgba(244,63,94,.5);
    color: #fb7185;
    transform: scale(1.1);
  }

  /* ---------- block form highlight when auto-filled ---------- */
  @keyframes formPulse {
    0%   { box-shadow: 0 0 0 0 rgba(56,189,248,.5); }
    70%  { box-shadow: 0 0 0 12px rgba(56,189,248,0); }
    100% { box-shadow: 0 0 0 0 rgba(56,189,248,0); }
  }
  .form-highlight {
    animation: formPulse .9s ease-out;
    border-color: #38bdf8 !important;
  }

  /* ---------- toast ---------- */
  .toast-wrap {
    position: fixed; bottom: 20px; right: 20px;
    z-index: 9999;
    display: flex; flex-direction: column; gap: 8px;
    max-width: 320px;
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateY(20px) scale(.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes toastOut {
    to { opacity: 0; transform: translateY(20px) scale(.96); }
  }
  .toast {
    display: flex; align-items: center; gap: 10px;
    padding: 11px 14px;
    border-radius: 10px;
    background: rgba(15,23,42,.96);
    border: 1px solid rgba(148,163,184,.2);
    backdrop-filter: blur(12px);
    font-size: 12.5px;
    color: #e2e8f0;
    box-shadow: 0 10px 30px rgba(0,0,0,.5);
    animation: toastIn .3s cubic-bezier(.16,1,.3,1) both;
  }
  .toast.out { animation: toastOut .3s ease forwards; }
  .toast-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }
  .toast.ok   .toast-dot { background: #34d399; box-shadow: 0 0 10px #34d399; }
  .toast.err  .toast-dot { background: #f43f5e; box-shadow: 0 0 10px #f43f5e; }
  .toast.info .toast-dot { background: #38bdf8; box-shadow: 0 0 10px #38bdf8; }

  /* ---------- tooltip-ish hint ---------- */
  .hint {
    font-size: 10.5px;
    color: rgba(148,163,184,.6);
    margin-top: 6px;
  }
</style>
</head>
<body class="h-full bg-slate-950 text-slate-200 antialiased">

<header class="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-20">
  <div class="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
    <div class="flex items-center gap-2">
      <span class="text-xl select-none">🛡️</span>
      <h1 class="font-semibold tracking-tight">DDoS Shield</h1>
      <span class="text-xs text-slate-500 hidden sm:inline">live control room</span>
    </div>

    <div class="flex items-center gap-2 ml-auto">
      <span class="flex items-center gap-1.5 text-xs text-slate-400">
        <span class="dot bg-slate-500" id="connDot"></span>
        <span id="connText">connecting…</span>
      </span>
      <input id="token" type="password" placeholder="admin token" autocomplete="off"
             class="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs w-40
                    focus:outline-none focus:border-sky-500">
      <button id="saveToken"
              class="text-xs px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium">
        Connect
      </button>
    </div>
  </div>
</header>

<main class="max-w-7xl mx-auto px-4 py-6 space-y-6">

  <section id="stats" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3"></section>

  <section class="bg-slate-900 border border-slate-800 rounded-xl p-4">
    <div class="flex items-baseline justify-between mb-3">
      <h2 class="text-sm font-medium text-slate-300">
        Requests / second <span class="text-slate-500 font-normal">· last 60s</span>
      </h2>
      <div class="text-2xl font-semibold text-sky-400 tabular-nums">
        <span id="rps">0</span><span class="text-xs text-slate-500 ml-1">rps</span>
      </div>
    </div>
    <canvas id="spark" class="w-full block" height="80"></canvas>
  </section>

  <div class="grid lg:grid-cols-3 gap-6">

    <!-- ============================================ EVENT LOG -->
    <section class="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
      <div class="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <h2 class="text-sm font-medium text-slate-300">Live event stream</h2>
        <button id="clearLog" class="text-xs text-slate-500 hover:text-slate-200">clear</button>
      </div>
      <div id="log" class="h-[460px] overflow-y-auto text-[11px] font-mono divide-y divide-slate-800/60"></div>
      <div class="px-4 py-2 border-t border-slate-800 text-[10.5px] text-slate-500">
        💡 Click any IP to auto-fill the block form · Click 🔒 for instant 15-min block
      </div>
    </section>

    <div class="space-y-6">

      <!-- ============================================ MANUAL BLOCK -->
      <section class="bg-slate-900 border border-slate-800 rounded-xl p-4" id="blockFormCard">
        <h2 class="text-sm font-medium text-slate-300 mb-1">Manual block</h2>
        <p class="hint mb-3">Tip: click any IP in the log to auto-fill this form.</p>
        <div class="space-y-2">
          <input id="blockIp" placeholder="203.0.113.7"
                 class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm
                        focus:outline-none focus:border-sky-500 transition-colors">
          <div class="flex gap-2">
            <input id="blockMins" type="number" min="1" max="10080" value="15"
                   class="w-24 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm
                          focus:outline-none focus:border-sky-500">
            <input id="blockReason" placeholder="reason" value="manual"
                   class="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm
                          focus:outline-none focus:border-sky-500">
          </div>
          <button id="doBlock"
                  class="w-full bg-rose-600 hover:bg-rose-500 text-white text-sm rounded py-2 font-medium">
            Block IP
          </button>
        </div>
        <p id="blockMsg" class="text-xs mt-2 min-h-[16px]"></p>
      </section>

      <!-- ============================================ BLOCKED IPS -->
      <section class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 class="text-sm font-medium text-slate-300">Blocked IPs</h2>
          <span id="blockCount" class="text-xs text-slate-500 tabular-nums">0</span>
        </div>
        <div id="blocks" class="max-h-72 overflow-y-auto text-xs divide-y divide-slate-800/60"></div>
      </section>

      <!-- ============================================ TOP TALKERS -->
      <section class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-800">
          <h2 class="text-sm font-medium text-slate-300">Top talkers</h2>
        </div>
        <div id="topIps" class="max-h-56 overflow-y-auto text-xs divide-y divide-slate-800/60"></div>
      </section>

    </div>
  </div>

  <footer class="text-center text-xs text-slate-600 pb-6">
    <span id="uptime">—</span> · <span id="cfg">—</span>
  </footer>
</main>

<div class="toast-wrap" id="toasts"></div>

<script>
(function () {
  'use strict';

  var BASE = location.pathname.replace(/\\/+$/, '') || '/__shield';
  var $ = function (id) { return document.getElementById(id); };

  var token = localStorage.getItem('shield.token') || '';
  var source = null;
  var connected = false;

  $('token').value = token;

  /* ------------------------------------------------------------- helpers */

  function api(path, options) {
    options = options || {};
    return fetch(BASE + path, {
      method: options.method || 'GET',
      headers: {
        'content-type': 'application/json',
        'x-shield-token': token
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  }

  function setConn(ok, text) {
    connected = ok;
    $('connDot').className = 'dot ' + (ok ? 'bg-emerald-400' : 'bg-rose-500');
    $('connText').textContent = text;
  }

  function fmtDuration(ms) {
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + (s % 60) + 's';
    var h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    return d.toTimeString().slice(0, 8);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------- toast */

  function toast(msg, kind) {
    var wrap = $('toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.innerHTML = '<span class="toast-dot"></span><span>' + esc(msg) + '</span>';
    wrap.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 300);
    }, 3200);
  }

  /* ------------------------------------------------ click-to-block utils */

  /**
   * Fill the Manual Block form with the given IP, scroll to it, focus it,
   * and flash a highlight so the admin notices.
   */
  function fillBlockForm(ip) {
    var input = $('blockIp');
    input.value = ip;

    var card = $('blockFormCard');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Reset and re-trigger the pulse animation
    card.classList.remove('form-highlight');
    void card.offsetWidth;
    card.classList.add('form-highlight');

    setTimeout(function () { input.focus(); input.select(); }, 300);

    toast('IP copied to form: ' + ip, 'info');
  }

  /**
   * Instantly block an IP for a given number of minutes (default 15).
   * Used by the 🔒 quick-block button.
   */
  function quickBlock(ip, minutes, reason) {
    minutes = minutes || 15;
    reason = reason || 'quick block from dashboard';

    api('/api/block', {
      method: 'POST',
      body: { ip: ip, minutes: minutes, reason: reason }
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok) {
          toast('Blocked ' + ip + ' for ' + minutes + ' min', 'ok');
        } else {
          toast('Failed: ' + (res.data.error || 'unknown'), 'err');
        }
      })
      .catch(function () {
        toast('Network error while blocking ' + ip, 'err');
      });
  }

  /* --------------------------------------------------------------- stats */

  var CARDS = [
    { key: 'total',      label: 'Total requests', color: 'text-slate-100' },
    { key: 'allowed',    label: 'Allowed',        color: 'text-emerald-400' },
    { key: 'throttled',  label: 'Throttled',      color: 'text-amber-300' },
    { key: 'challenged', label: 'Challenged',     color: 'text-orange-400' },
    { key: 'blocked',    label: 'Blocked',        color: 'text-rose-400' },
    { key: 'passed',     label: 'Passed CAPTCHA', color: 'text-sky-400' }
  ];

  function renderStats(counters, activeLimited) {
    var html = '';
    for (var i = 0; i < CARDS.length; i++) {
      var c = CARDS[i];
      var value = counters[c.key] || 0;
      if (c.key === 'throttled') value += (counters.challenged || 0);
      html +=
        '<div class="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">' +
          '<div class="text-[11px] uppercase tracking-wide text-slate-500">' + c.label + '</div>' +
          '<div class="text-2xl font-semibold tabular-nums ' + c.color + '">' +
            value.toLocaleString() +
          '</div>' +
        '</div>';
    }
    html +=
      '<div class="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">' +
        '<div class="text-[11px] uppercase tracking-wide text-slate-500">Active rate-limited</div>' +
        '<div class="text-2xl font-semibold tabular-nums text-fuchsia-400">' +
          activeLimited.length.toLocaleString() +
        '</div>' +
      '</div>';
    $('stats').innerHTML = html;
  }

  /* ------------------------------------------------------------ sparkline */

  function drawSpark(series) {
    var canvas = $('spark');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 600;
    var h = 80;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var max = 1;
    for (var i = 0; i < series.length; i++) if (series[i] > max) max = series[i];

    var step = w / Math.max(1, series.length - 1);

    ctx.strokeStyle = 'rgba(51,65,85,0.5)';
    ctx.lineWidth = 1;
    for (var g = 1; g <= 3; g++) {
      var y = (h / 4) * g;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(56,189,248,0.35)');
    grad.addColorStop(1, 'rgba(56,189,248,0)');

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (var j = 0; j < series.length; j++) {
      var x = j * step;
      var py = h - (series[j] / max) * (h - 10) - 5;
      ctx.lineTo(x, py);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    for (var k = 0; k < series.length; k++) {
      var lx = k * step;
      var ly = h - (series[k] / max) * (h - 10) - 5;
      if (k === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  /* --------------------------------------------------------------- blocks */

  function renderBlocks(blocks) {
    $('blockCount').textContent = blocks.length;
    if (!blocks.length) {
      $('blocks').innerHTML =
        '<div class="px-4 py-6 text-center text-slate-600">No active blocks</div>';
      return;
    }
    $('blocks').innerHTML = blocks.map(function (b) {
      var secs = Math.max(0, Math.ceil((b.until - Date.now()) / 1000));
      return '' +
        '<div class="px-4 py-2.5 flex items-center gap-3">' +
          '<div class="flex-1 min-w-0">' +
            '<div class="font-mono text-slate-200 truncate">' +
              '<span class="ip-clickable" data-fill-ip="' + esc(b.ip) + '" title="Click to load into block form">' + esc(b.ip) + '</span>' +
            '</div>' +
            '<div class="text-[10px] text-slate-500 truncate">' +
              esc(b.reason || 'blocked') + ' · ' + (b.by || 'auto') + ' · ' + secs + 's left' +
            '</div>' +
          '</div>' +
          '<button data-unblock="' + esc(b.ip) + '" ' +
                  'class="shrink-0 text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-emerald-600 ' +
                         'text-slate-300 hover:text-white transition-colors">' +
            'Unblock' +
          '</button>' +
        '</div>';
    }).join('');
  }

  function renderTopIps(list) {
    if (!list.length) {
      $('topIps').innerHTML = '<div class="px-4 py-6 text-center text-slate-600">No traffic yet</div>';
      return;
    }
    var max = list[0].count || 1;
    $('topIps').innerHTML = list.map(function (row) {
      var pct = Math.round((row.count / max) * 100);
      return '' +
        '<div class="px-4 py-2 relative group">' +
          '<div class="absolute inset-y-0 left-0 bg-sky-500/10" style="width:' + pct + '%"></div>' +
          '<div class="relative flex items-center justify-between gap-2">' +
            '<span class="font-mono text-slate-300 truncate">' +
              '<span class="ip-clickable" data-fill-ip="' + esc(row.ip) + '" title="Click to load into block form">' + esc(row.ip) + '</span>' +
            '</span>' +
            '<div class="flex items-center gap-2">' +
              '<span class="tabular-nums text-slate-500">' + row.count.toLocaleString() + '</span>' +
              '<button class="quick-block" data-quick-block="' + esc(row.ip) + '" title="Quick block for 15 min">🔒</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  /* ----------------------------------------------------------------- log */

  var MAX_ROWS = 150;

  var TYPE_STYLE = {
    block:          { bg: 'bg-rose-500/10',    text: 'text-rose-400',    label: 'BLOCK' },
    challenge:      { bg: 'bg-orange-500/10',  text: 'text-orange-400',  label: 'CHALLENGE' },
    throttle:       { bg: 'bg-amber-500/10',   text: 'text-amber-300',   label: 'THROTTLE' },
    captcha_passed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'PASSED' },
    captcha_failed: { bg: 'bg-rose-500/10',    text: 'text-rose-400',    label: 'FAILED' },
    unblock:        { bg: 'bg-sky-500/10',     text: 'text-sky-400',     label: 'UNBLOCK' },
    request:        { bg: '',                  text: 'text-slate-400',   label: 'REQ' }
  };

  function pushLog(event) {
    var style = TYPE_STYLE[event.type] || TYPE_STYLE.request;
    var log = $('log');

    var detail;
    if (event.type === 'request') {
      var statusColor = event.status >= 500 ? 'text-rose-400'
                      : event.status >= 400 ? 'text-amber-400'
                      : 'text-slate-500';
      detail =
        '<span class="' + statusColor + '">' + event.status + '</span> ' +
        '<span class="text-slate-300">' + esc(event.method) + '</span> ' +
        '<span class="text-slate-500">' + esc(event.path) + '</span> ' +
        '<span class="text-slate-600">' + event.ms + 'ms</span>';
    } else {
      detail =
        '<span class="text-slate-300">' + esc(event.path || event.reason || '') + '</span>' +
        (event.reason && event.path ? ' <span class="text-slate-600">· ' + esc(event.reason) + '</span>' : '') +
        (event.score ? ' <span class="text-slate-600">· score ' + event.score + '</span>' : '');
    }

    var ipSafe = esc(event.ip);
    var row = document.createElement('div');
    row.className = 'px-3 py-1.5 flex items-start gap-2 ' + style.bg;
    row.innerHTML =
      '<span class="text-slate-600 shrink-0">' + fmtTime(event.at || Date.now()) + '</span>' +
      '<span class="' + style.text + ' shrink-0 w-[76px] font-semibold">' + style.label + '</span>' +
      '<span class="font-mono text-slate-400 shrink-0 w-[124px] truncate">' +
        '<span class="ip-clickable" data-fill-ip="' + ipSafe + '" title="Click to load into block form">' + ipSafe + '</span>' +
      '</span>' +
      '<span class="flex-1 min-w-0 truncate">' + detail + '</span>' +
      '<button class="quick-block" data-quick-block="' + ipSafe + '" title="Quick block for 15 min">🔒</button>';

    log.prepend(row);
    while (log.childElementCount > MAX_ROWS) log.removeChild(log.lastChild);
  }

  /* ------------------------------------------------------------- render */

  function renderMetrics(data) {
    renderStats(data.counters || {}, data.activeLimited || []);
    $('rps').textContent = (data.rps || 0).toLocaleString();
    drawSpark(data.series || new Array(60).fill(0));
    renderBlocks(data.blocks || []);
    renderTopIps(data.topIps || []);
    $('uptime').textContent = 'uptime ' + fmtDuration(data.uptimeMs || 0);
    if (data.config) {
      $('cfg').textContent =
        data.config.softLimit + '/' + Math.round(data.config.windowMs / 1000) + 's soft · ' +
        data.config.hardLimit + ' hard · block ' + fmtDuration(data.config.blockDurationMs);
    }
  }

  /* ----------------------------------------------------------------- SSE */

  function connect() {
    if (source) { source.close(); source = null; }
    if (!token) { setConn(false, 'token required'); return; }

    setConn(false, 'connecting…');
    source = new EventSource(BASE + '/api/events?token=' + encodeURIComponent(token));

    source.addEventListener('open', function () { setConn(true, 'live'); });

    source.addEventListener('error', function () {
      setConn(false, connected ? 'reconnecting…' : 'unauthorized / offline');
    });

    source.addEventListener('metrics', function (ev) {
      try { renderMetrics(JSON.parse(ev.data)); } catch (e) { /* ignore */ }
    });

    source.addEventListener('log', function (ev) {
      try { pushLog(JSON.parse(ev.data)); } catch (e) { /* ignore */ }
    });
  }

  /* -------------------------------------------------------------- events */

  $('saveToken').addEventListener('click', function () {
    token = $('token').value.trim();
    localStorage.setItem('shield.token', token);
    connect();
  });

  $('token').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') $('saveToken').click();
  });

  $('clearLog').addEventListener('click', function () { $('log').innerHTML = ''; });

  /* -------- global delegation for click-to-fill + quick-block -------- */

  document.addEventListener('click', function (ev) {
    /* 1. Click on IP -> fill the form */
    var fillEl = ev.target.closest('[data-fill-ip]');
    if (fillEl) {
      ev.preventDefault();
      var ip = fillEl.getAttribute('data-fill-ip');
      if (ip) fillBlockForm(ip);
      return;
    }

    /* 2. Click on 🔒 -> quick block (15 min) */
    var quickEl = ev.target.closest('[data-quick-block]');
    if (quickEl) {
      ev.preventDefault();
      ev.stopPropagation();
      var qip = quickEl.getAttribute('data-quick-block');
      if (qip) quickBlock(qip, 15, 'quick block from log');
      return;
    }

    /* 3. Click on Unblock button */
    var unblockBtn = ev.target.closest('[data-unblock]');
    if (unblockBtn) {
      ev.preventDefault();
      var uip = unblockBtn.getAttribute('data-unblock');
      unblockBtn.disabled = true;
      unblockBtn.textContent = '…';

      api('/api/unblock', { method: 'POST', body: { ip: uip } })
        .then(function () { return api('/api/metrics'); })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          renderMetrics(data);
          toast('Unblocked ' + uip, 'ok');
        })
        .catch(function () {
          unblockBtn.disabled = false;
          unblockBtn.textContent = 'Unblock';
          toast('Failed to unblock ' + uip, 'err');
        });
      return;
    }
  });

  /* -------- manual block button -------- */

  $('doBlock').addEventListener('click', function () {
    var ip = $('blockIp').value.trim();
    if (!ip) { toast('Enter an IP address', 'err'); return; }

    api('/api/block', {
      method: 'POST',
      body: {
        ip: ip,
        minutes: Number($('blockMins').value) || 15,
        reason: $('blockReason').value.trim() || 'manual'
      }
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        var msg = $('blockMsg');
        if (res.ok) {
          msg.className = 'text-xs mt-2 text-emerald-400';
          msg.textContent = 'Blocked ' + ip + ' for ' + res.data.minutes + ' min.';
          toast('Blocked ' + ip, 'ok');
          $('blockIp').value = '';
        } else {
          msg.className = 'text-xs mt-2 text-rose-400';
          msg.textContent = res.data.error || 'Failed to block.';
          toast('Failed to block ' + ip, 'err');
        }
      })
      .catch(function () {
        $('blockMsg').className = 'text-xs mt-2 text-rose-400';
        $('blockMsg').textContent = 'Network error.';
        toast('Network error', 'err');
      });
  });

  window.addEventListener('resize', function () {
    // sparkline redraws on next metrics tick
  });

  /* -------------------------------------------------------------- start */

  if (token) {
    api('/api/metrics')
      .then(function (r) {
        if (!r.ok) throw new Error('unauthorized');
        return r.json();
      })
      .then(renderMetrics)
      .catch(function () { setConn(false, 'invalid token'); });
    connect();
  } else {
    setConn(false, 'enter admin token');
  }
})();
</script>
</body>
</html>`;
