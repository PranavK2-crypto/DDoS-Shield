// shield/views/dashboard.js
'use strict';

module.exports = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DDoS Shield · Live Control Room</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { min-height: 100%; margin: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #030617; color: #e2e8f0;
    position: relative; overflow-x: hidden;
  }

  /* ---------- ambient background ---------- */
  .bg-orbs { position: fixed; inset: 0; overflow: hidden; z-index: 0; pointer-events: none; }
  .orb { position: absolute; border-radius: 50%; filter: blur(100px); opacity: .35; will-change: transform; }
  .orb-a { width: 620px; height: 620px; background: radial-gradient(circle,#0ea5e9 0%,transparent 70%); top:-200px; left:-160px; animation: drift1 22s ease-in-out infinite; }
  .orb-b { width: 520px; height: 520px; background: radial-gradient(circle,#8b5cf6 0%,transparent 70%); bottom:-200px; right:-160px; animation: drift2 26s ease-in-out infinite; }
  .orb-c { width: 420px; height: 420px; background: radial-gradient(circle,#10b981 0%,transparent 70%); top:40%; left:55%; animation: drift3 30s ease-in-out infinite; }
  @keyframes drift1 { 0%,100% { transform: translate(0,0) scale(1);} 50% { transform: translate(60px,40px) scale(1.1);} }
  @keyframes drift2 { 0%,100% { transform: translate(0,0) scale(1);} 50% { transform: translate(-60px,-40px) scale(1.12);} }
  @keyframes drift3 { 0%,100% { transform: translate(0,0) scale(1);} 50% { transform: translate(40px,-60px) scale(.94);} }

  .grid-overlay {
    position: fixed; inset: 0; z-index: 1; pointer-events: none;
    background-image:
      linear-gradient(rgba(148,163,184,.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148,163,184,.045) 1px, transparent 1px);
    background-size: 44px 44px;
    -webkit-mask-image: radial-gradient(circle at 50% 0%, black 20%, transparent 85%);
    mask-image: radial-gradient(circle at 50% 0%, black 20%, transparent 85%);
  }

  /* ---------- glass panels ---------- */
  .glass {
    background: rgba(15,23,42,.72);
    border: 1px solid rgba(148,163,184,.16);
    border-radius: 18px;
    backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    box-shadow: 0 10px 40px rgba(0,0,0,.35), 0 0 0 1px rgba(56,189,248,.04) inset;
    transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
  }
  .glass-hover:hover {
    transform: translateY(-2px);
    border-color: rgba(56,189,248,.4);
    box-shadow: 0 16px 50px rgba(0,0,0,.45), 0 0 30px rgba(56,189,248,.08);
  }

  .enter { animation: enter .6s cubic-bezier(.16,1,.3,1) both; }
  @keyframes enter { from { opacity:0; transform: translateY(20px);} to { opacity:1; transform: translateY(0);} }

  /* header */
  .header {
    position: sticky; top: 0; z-index: 30;
    background: rgba(15,23,42,.75);
    border-bottom: 1px solid rgba(148,163,184,.12);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
  }
  .header::after {
    content:""; position:absolute; left:0; right:0; bottom:-1px; height:1px;
    background: linear-gradient(90deg, transparent, rgba(56,189,248,.5), rgba(139,92,246,.5), transparent);
    background-size: 200% 100%;
    animation: headerShift 6s linear infinite;
  }
  @keyframes headerShift { 0% { background-position: 0 0;} 100% { background-position: 200% 0;} }

  /* live dot */
  .live-dot {
    display:inline-block; width: 8px; height: 8px; border-radius: 50%;
    position: relative;
  }
  .live-dot.ok  { background:#34d399; box-shadow: 0 0 10px #34d399; }
  .live-dot.bad { background:#f43f5e; box-shadow: 0 0 10px #f43f5e; }
  .live-dot.wait{ background:#94a3b8; box-shadow: 0 0 8px #64748b; }
  .live-dot.ok::after, .live-dot.bad::after {
    content:""; position: absolute; inset:-4px;
    border-radius: 50%; border: 1px solid currentColor;
    color: inherit; animation: ping 1.8s cubic-bezier(0,0,.2,1) infinite;
  }
  .live-dot.ok { color: #34d399; }
  .live-dot.bad { color: #f43f5e; }
  @keyframes ping { 0% { transform: scale(.6); opacity:.8;} 100% { transform: scale(1.8); opacity:0;} }

  /* stat cards */
  .stat-card {
    position: relative; overflow: hidden;
    padding: 16px 18px;
    border-radius: 16px;
    background: rgba(15,23,42,.72);
    border: 1px solid rgba(148,163,184,.16);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    transition: transform .2s ease, border-color .2s ease;
  }
  .stat-card::before {
    content:""; position:absolute; top:0; left:0; right:0; height:2px;
    background: var(--accent, linear-gradient(90deg,#38bdf8,#8b5cf6));
    opacity: .7;
  }
  .stat-card:hover { transform: translateY(-3px); border-color: rgba(56,189,248,.35); }
  .stat-label {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .1em; color: rgba(148,163,184,.8);
    display: flex; align-items: center; gap: 6px;
  }
  .stat-value {
    font-size: 26px; font-weight: 700; letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    margin-top: 6px; color: var(--val, #f1f5f9);
    transition: transform .25s ease;
  }
  .stat-value.flash { animation: valueFlash .55s ease-out; }
  @keyframes valueFlash {
    0% { transform: scale(1); }
    40% { transform: scale(1.15); text-shadow: 0 0 20px rgba(56,189,248,.6); }
    100% { transform: scale(1); }
  }

  /* chart canvas */
  .chart-canvas {
    width: 100%; height: 100px; display: block;
    border-radius: 12px;
  }

  /* log rows */
  .log-row { animation: slideIn .4s cubic-bezier(.16,1,.3,1) both; }
  @keyframes slideIn { from { opacity:0; transform: translateX(-14px);} to { opacity:1; transform: translateX(0);} }
  .log-row:hover { background: rgba(56,189,248,.05); }

  /* block row */
  .block-row { animation: enter .4s ease both; }
  .block-row:hover { background: rgba(244,63,94,.05); }

  /* top talkers bar */
  .talker-row { position: relative; padding: 8px 16px; overflow: hidden; }
  .talker-row .bar {
    position: absolute; inset: 0 auto 0 0;
    background: linear-gradient(90deg, rgba(56,189,248,.18), rgba(56,189,248,.03));
    transition: width .6s cubic-bezier(.16,1,.3,1);
  }

  /* buttons */
  .btn {
    position: relative; overflow: hidden;
    transition: transform .15s ease, box-shadow .25s ease;
  }
  .btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,.3); }
  .btn:active:not(:disabled) { transform: translateY(0); }
  .btn-primary {
    background: linear-gradient(135deg,#0ea5e9,#6366f1);
    background-size: 200% 200%;
    animation: gradientMove 6s ease infinite;
    color: white; font-weight: 600;
    box-shadow: 0 8px 24px rgba(56,189,248,.25);
  }
  .btn-danger {
    background: linear-gradient(135deg,#e11d48,#be123c);
    background-size: 200% 200%;
    animation: gradientMove 6s ease infinite;
    color: white; font-weight: 600;
    box-shadow: 0 8px 24px rgba(244,63,94,.25);
  }
  @keyframes gradientMove { 0%,100% { background-position: 0% 50%;} 50% { background-position: 100% 50%;} }

  /* toast */
  .toast-wrap { position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; }
  .toast {
    min-width: 240px; max-width: 340px;
    padding: 12px 16px; border-radius: 12px;
    background: rgba(15,23,42,.95);
    border: 1px solid rgba(148,163,184,.2);
    backdrop-filter: blur(14px);
    box-shadow: 0 12px 32px rgba(0,0,0,.5);
    font-size: 13px;
    animation: toastIn .35s cubic-bezier(.16,1,.3,1) both;
    display: flex; align-items: center; gap: 10px;
  }
  .toast.out { animation: toastOut .3s ease forwards; }
  @keyframes toastIn { from { opacity:0; transform: translateY(20px) scale(.96);} to { opacity:1; transform: translateY(0) scale(1);} }
  @keyframes toastOut { to { opacity:0; transform: translateY(20px) scale(.96);} }
  .toast .toast-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .toast.ok   .toast-dot { background:#34d399; box-shadow: 0 0 10px #34d399; }
  .toast.err  .toast-dot { background:#f43f5e; box-shadow: 0 0 10px #f43f5e; }
  .toast.info .toast-dot { background:#38bdf8; box-shadow: 0 0 10px #38bdf8; }

  /* scrollbars */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(51,65,85,.7); border-radius: 9999px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(71,85,105,.9); }

  /* inputs */
  .shield-input {
    background: rgba(2,6,23,.75);
    border: 1px solid rgba(148,163,184,.22);
    border-radius: 10px;
    padding: 8px 12px;
    color: #e2e8f0;
    font-size: 13px;
    outline: none;
    transition: border-color .2s ease, box-shadow .2s ease;
    width: 100%;
  }
  .shield-input:focus {
    border-color: rgba(56,189,248,.65);
    box-shadow: 0 0 0 3px rgba(56,189,248,.15);
  }
  .shield-input::placeholder { color: rgba(148,163,184,.5); }

  /* section header */
  .panel-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; font-weight: 600;
    letter-spacing: .08em; text-transform: uppercase;
    color: rgba(148,163,184,.85);
  }
</style>
</head>
<body>

<div class="bg-orbs" aria-hidden="true">
  <div class="orb orb-a"></div>
  <div class="orb orb-b"></div>
  <div class="orb orb-c"></div>
</div>
<div class="grid-overlay" aria-hidden="true"></div>

<header class="header">
  <div class="max-w-[1400px] mx-auto px-5 py-3 flex items-center gap-4 flex-wrap relative">
    <div class="flex items-center gap-3">
      <div class="relative">
        <div class="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
             style="background: linear-gradient(135deg, rgba(56,189,248,.2), rgba(139,92,246,.2)); border: 1px solid rgba(56,189,248,.35);">🛡️</div>
      </div>
      <div>
        <h1 class="font-semibold tracking-tight text-[15px] leading-none">DDoS Shield</h1>
        <p class="text-[10px] text-slate-500 tracking-wider mt-0.5">LIVE CONTROL ROOM</p>
      </div>
    </div>

    <div class="flex items-center gap-3 ml-auto flex-wrap">
      <div class="flex items-center gap-2 text-xs text-slate-400 px-3 py-1.5 rounded-full glass">
        <span class="live-dot wait" id="connDot"></span>
        <span id="connText">connecting…</span>
      </div>
      <input id="token" type="password" placeholder="admin token" autocomplete="off"
             class="shield-input" style="width: 170px;">
      <button id="saveToken" class="btn btn-primary text-xs px-4 py-2 rounded-lg">
        Connect
      </button>
    </div>
  </div>
</header>

<main class="max-w-[1400px] mx-auto px-5 py-6 space-y-6 relative z-10">

  <!-- stat cards -->
  <section id="stats" class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3"></section>

  <!-- chart -->
  <section class="glass glass-hover p-5 enter" style="animation-delay:.05s">
    <div class="flex items-baseline justify-between mb-4">
      <div>
        <div class="panel-title">
          <span>📊</span><span>Requests per second</span>
        </div>
        <p class="text-[11px] text-slate-500 mt-1">Rolling 60-second window</p>
      </div>
      <div class="text-right">
        <div class="text-3xl font-semibold tabular-nums text-sky-400 leading-none">
          <span id="rps">0</span>
        </div>
        <div class="text-[10px] tracking-widest text-slate-500 mt-1 uppercase">req / sec</div>
      </div>
    </div>
    <canvas id="spark" class="chart-canvas"></canvas>
  </section>

  <div class="grid lg:grid-cols-3 gap-6">

    <!-- event stream -->
    <section class="lg:col-span-2 glass overflow-hidden flex flex-col enter" style="animation-delay:.1s">
      <div class="px-5 py-3 border-b border-slate-800/70 flex items-center justify-between">
        <div class="panel-title">
          <span class="live-dot ok"></span><span>Live event stream</span>
        </div>
        <button id="clearLog" class="text-xs text-slate-500 hover:text-slate-200 transition-colors">
          Clear
        </button>
      </div>
      <div id="log"
           class="h-[480px] overflow-y-auto text-[11px] font-mono divide-y divide-slate-800/50">
      </div>
    </section>

    <!-- side panels -->
    <div class="space-y-6">

      <section class="glass glass-hover p-5 enter" style="animation-delay:.15s">
        <div class="panel-title mb-4"><span>🚫</span><span>Manual block</span></div>
        <div class="space-y-3">
          <input id="blockIp" placeholder="203.0.113.7" class="shield-input">
          <div class="flex gap-2">
            <input id="blockMins" type="number" min="1" max="10080" value="15"
                   class="shield-input" style="width: 90px;">
            <input id="blockReason" placeholder="reason" value="manual" class="shield-input">
          </div>
          <button id="doBlock" class="btn btn-danger w-full py-2.5 rounded-lg text-sm">
            Block IP
          </button>
        </div>
        <p id="blockMsg" class="text-xs mt-3 min-h-[16px]"></p>
      </section>

      <section class="glass overflow-hidden enter" style="animation-delay:.2s">
        <div class="px-5 py-3 border-b border-slate-800/70 flex items-center justify-between">
          <div class="panel-title"><span>🔒</span><span>Blocked IPs</span></div>
          <span id="blockCount" class="text-xs text-slate-500 tabular-nums">0</span>
        </div>
        <div id="blocks" class="max-h-72 overflow-y-auto text-xs"></div>
      </section>

      <section class="glass overflow-hidden enter" style="animation-delay:.25s">
        <div class="px-5 py-3 border-b border-slate-800/70">
          <div class="panel-title"><span>🔥</span><span>Top talkers</span></div>
        </div>
        <div id="topIps" class="max-h-56 overflow-y-auto text-xs"></div>
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
  var lastValues = {};

  $('token').value = token;

  /* ----------------------------------------------------- helpers */

  function api(path, options) {
    options = options || {};
    return fetch(BASE + path, {
      method: options.method || 'GET',
      headers: { 'content-type': 'application/json', 'x-shield-token': token },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  }

  function setConn(state, text) {
    connected = (state === 'ok');
    $('connDot').className = 'live-dot ' + state;
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

  /* ----------------------------------------------------- stat cards */

  var CARDS = [
    { key: 'total',      label: 'Total requests', color: '#f1f5f9', accent: 'linear-gradient(90deg,#64748b,#94a3b8)' },
    { key: 'allowed',    label: 'Allowed',        color: '#34d399', accent: 'linear-gradient(90deg,#10b981,#34d399)' },
    { key: 'throttled',  label: 'Throttled',      color: '#fbbf24', accent: 'linear-gradient(90deg,#f59e0b,#fbbf24)' },
    { key: 'challenged', label: 'Challenged',     color: '#fb923c', accent: 'linear-gradient(90deg,#ea580c,#fb923c)' },
    { key: 'blocked',    label: 'Blocked',        color: '#fb7185', accent: 'linear-gradient(90deg,#e11d48,#fb7185)' },
    { key: 'passed',     label: 'Passed CAPTCHA', color: '#38bdf8', accent: 'linear-gradient(90deg,#0ea5e9,#38bdf8)' }
  ];

  function setStatValue(el, key, value) {
    var prev = lastValues[key];
    el.textContent = value.toLocaleString();
    if (prev !== undefined && prev !== value) {
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
    lastValues[key] = value;
  }

  function renderStats(counters, activeLimited) {
    var grid = $('stats');
    if (!grid.firstChild) {
      var html = '';
      for (var i = 0; i < CARDS.length; i++) {
        var c = CARDS[i];
        html +=
          '<div class="stat-card enter" style="--val:' + c.color + ';--accent:' + c.accent + '; animation-delay:' + (i * 0.03) + 's">' +
            '<div class="stat-label">' + c.label + '</div>' +
            '<div class="stat-value" data-key="' + c.key + '">0</div>' +
          '</div>';
      }
      html +=
        '<div class="stat-card enter" style="--val:#e879f9;--accent:linear-gradient(90deg,#d946ef,#e879f9); animation-delay:.2s">' +
          '<div class="stat-label">Active rate-limited</div>' +
          '<div class="stat-value" data-key="activeLimited">0</div>' +
        '</div>';
      grid.innerHTML = html;
    }
    for (var k = 0; k < CARDS.length; k++) {
      var c2 = CARDS[k];
      var val = counters[c2.key] || 0;
      if (c2.key === 'throttled') val += (counters.challenged || 0);
      var el = grid.querySelector('[data-key="' + c2.key + '"]');
      if (el) setStatValue(el, c2.key, val);
    }
    var al = grid.querySelector('[data-key="activeLimited"]');
    if (al) setStatValue(al, 'activeLimited', activeLimited.length);
  }

  /* ----------------------------------------------------- sparkline */

  function drawSpark(series) {
    var canvas = $('spark');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 600;
    var h = 100;

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
    grad.addColorStop(0, 'rgba(56,189,248,0.45)');
    grad.addColorStop(1, 'rgba(56,189,248,0)');

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (var j = 0; j < series.length; j++) {
      var x = j * step;
      var py = h - (series[j] / max) * (h - 12) - 6;
      ctx.lineTo(x, py);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    for (var k = 0; k < series.length; k++) {
      var lx = k * step;
      var ly = h - (series[k] / max) * (h - 12) - 6;
      if (k === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(56,189,248,0.7)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /* ----------------------------------------------------- blocks */

  function renderBlocks(blocks) {
    $('blockCount').textContent = blocks.length;
    var box = $('blocks');
    if (!blocks.length) {
      box.innerHTML = '<div class="px-5 py-8 text-center text-slate-600 text-xs">No active blocks</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var secs = Math.max(0, Math.ceil((b.until - Date.now()) / 1000));
      html +=
        '<div class="block-row px-5 py-3 flex items-center gap-3 border-b border-slate-800/50">' +
          '<div class="flex-1 min-w-0">' +
            '<div class="font-mono text-slate-200 truncate">' + esc(b.ip) + '</div>' +
            '<div class="text-[10px] text-slate-500 truncate">' +
              esc(b.reason || 'blocked') + ' · ' + (b.by || 'auto') + ' · ' + secs + 's left' +
            '</div>' +
          '</div>' +
          '<button data-unblock="' + esc(b.ip) + '" ' +
                  'class="btn shrink-0 text-[11px] px-3 py-1.5 rounded-md bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white transition-colors">' +
            'Unblock' +
          '</button>' +
        '</div>';
    }
    box.innerHTML = html;
  }

  function renderTopIps(list) {
    var box = $('topIps');
    if (!list.length) {
      box.innerHTML = '<div class="px-5 py-8 text-center text-slate-600 text-xs">No traffic yet</div>';
      return;
    }
    var max = list[0].count || 1;
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      var pct = Math.round((row.count / max) * 100);
      html +=
        '<div class="talker-row border-b border-slate-800/50">' +
          '<div class="bar" style="width:' + pct + '%"></div>' +
          '<div class="relative flex items-center justify-between gap-2">' +
            '<span class="font-mono text-slate-300 truncate">' + esc(row.ip) + '</span>' +
            '<span class="tabular-nums text-slate-400">' + row.count.toLocaleString() + '</span>' +
          '</div>' +
        '</div>';
    }
    box.innerHTML = html;
  }

  /* ----------------------------------------------------- log */

  var MAX_ROWS = 150;

  var TYPE_STYLE = {
    block:          { text: 'text-rose-400',    dot: '#f43f5e', label: 'BLOCK' },
    challenge:      { text: 'text-orange-400',  dot: '#fb923c', label: 'CHALLENGE' },
    throttle:       { text: 'text-amber-300',   dot: '#fbbf24', label: 'THROTTLE' },
    captcha_passed: { text: 'text-emerald-400', dot: '#34d399', label: 'PASSED' },
    captcha_failed: { text: 'text-rose-400',    dot: '#f43f5e', label: 'FAILED' },
    unblock:        { text: 'text-sky-400',     dot: '#38bdf8', label: 'UNBLOCK' },
    request:        { text: 'text-slate-400',   dot: '#64748b', label: 'REQ' }
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

    var row = document.createElement('div');
    row.className = 'log-row px-4 py-2 flex items-start gap-2';
    row.innerHTML =
      '<span class="text-slate-600 shrink-0">' + fmtTime(event.at || Date.now()) + '</span>' +
      '<span class="shrink-0 mt-1" style="width:6px;height:6px;border-radius:50%;background:' + style.dot + ';box-shadow:0 0 8px ' + style.dot + '"></span>' +
      '<span class="' + style.text + ' shrink-0 w-[80px] font-semibold">' + style.label + '</span>' +
      '<span class="font-mono text-slate-400 shrink-0 w-[118px] truncate">' + esc(event.ip) + '</span>' +
      '<span class="flex-1 min-w-0 truncate">' + detail + '</span>';

    log.prepend(row);
    while (log.childElementCount > MAX_ROWS) log.removeChild(log.lastChild);
  }

  /* ----------------------------------------------------- render */

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

  /* ----------------------------------------------------- SSE */

  function connect() {
    if (source) { source.close(); source = null; }
    if (!token) { setConn('wait', 'token required'); return; }

    setConn('wait', 'connecting…');
    source = new EventSource(BASE + '/api/events?token=' + encodeURIComponent(token));

    source.addEventListener('open', function () { setConn('ok', 'live'); });

    source.addEventListener('error', function () {
      setConn('bad', connected ? 'reconnecting…' : 'unauthorized / offline');
    });

    source.addEventListener('metrics', function (ev) {
      try { renderMetrics(JSON.parse(ev.data)); } catch (e) {}
    });

    source.addEventListener('log', function (ev) {
      try { pushLog(JSON.parse(ev.data)); } catch (e) {}
    });
  }

  /* ----------------------------------------------------- events */

  $('saveToken').addEventListener('click', function () {
    token = $('token').value.trim();
    localStorage.setItem('shield.token', token);
    toast('Connecting…', 'info');
    connect();
  });

  $('token').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') $('saveToken').click();
  });

  $('clearLog').addEventListener('click', function () { $('log').innerHTML = ''; });

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
          msg.className = 'text-xs mt-3 text-emerald-400';
          msg.textContent = 'Blocked ' + ip + ' for ' + res.data.minutes + ' min.';
          toast('Blocked ' + ip, 'ok');
          $('blockIp').value = '';
        } else {
          msg.className = 'text-xs mt-3 text-rose-400';
          msg.textContent = res.data.error || 'Failed to block.';
          toast('Failed to block', 'err');
        }
      })
      .catch(function () {
        $('blockMsg').className = 'text-xs mt-3 text-rose-400';
        $('blockMsg').textContent = 'Network error.';
        toast('Network error', 'err');
      });
  });

  $('blocks').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-unblock]');
    if (!btn) return;
    var ip = btn.getAttribute('data-unblock');
    btn.disabled = true;
    btn.textContent = '…';

    api('/api/unblock', { method: 'POST', body: { ip: ip } })
      .then(function () { return api('/api/metrics'); })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        renderMetrics(data);
        toast('Unblocked ' + ip, 'ok');
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Unblock';
        toast('Failed to unblock', 'err');
      });
  });

  /* ----------------------------------------------------- start */

  if (token) {
    api('/api/metrics')
      .then(function (r) { if (!r.ok) throw new Error('unauthorized'); return r.json(); })
      .then(renderMetrics)
      .catch(function () { setConn('bad', 'invalid token'); });
    connect();
  } else {
    setConn('wait', 'enter admin token');
  }
})();
</script>
</body>
</html>`;