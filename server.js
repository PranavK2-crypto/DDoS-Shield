// server.js
'use strict';

require('dotenv').config?.();

const express = require('express');
const { createShield } = require('./shield');

const PORT = Number(process.env.PORT) || 3000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

/* ------------------------------------------------------------------ store */

let store = null;
if (process.env.REDIS_URL) {
  const { RedisStore } = require('./shield/stores/redis');
  store = new RedisStore({ url: process.env.REDIS_URL });
  console.log('[shield] store: redis @', process.env.REDIS_URL);
} else {
  console.log('[shield] store: in-memory (single process)');
}

/* ----------------------------------------------------------------- shield */

const shield = createShield({
  adminToken: process.env.SHIELD_ADMIN_TOKEN || 'CodeNova2026',
  secret: process.env.SHIELD_SECRET || 'dev-hmac-secret-change-me',
  trustProxy: TRUST_PROXY,
  store,

  windowMs: 60_000,
  warnLimit: 10,
  softLimit: 20,
  hardLimit: 60,

  burstWindowMs: 2_000,
  burstLimit: 15,

  blockDurationMs: 2 * 60_000,   // short, so the demo is easy to replay
  grantDurationMs: 30 * 60_000,

  skip: ['/healthz', '/favicon.ico'],
  allowlist: (process.env.SHIELD_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean),

  onEvent: (event) => {
    if (event.type === 'block') {
      console.warn('[shield] BLOCK', event.ip, '->', event.reason);
    }
  },
});

/* -------------------------------------------------------------------- app */

const app = express();
app.set('trust proxy', TRUST_PROXY);
app.disable('x-powered-by');

app.use(express.json({ limit: '64kb' }));

// 👇 the only line you need to protect the whole app
app.use(shield);

/* ---------------------------------------------------------------- routes */

app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DDoS Shield — Your Website's Bodyguard</title>
<script>
  // Prevents theme flash — set before styles load
  (function(){
    try {
      var t = localStorage.getItem('shield.theme');
      if (t === 'dark' || t === 'light') {
        document.documentElement.setAttribute('data-theme', t);
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch(e) {}
  })();
</script>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  /* ============================================================ THEME */
  :root, :root[data-theme="light"] {
    --bg:        #f7f9fc;
    --bg-soft:   #eef3fb;
    --bg-card:   #ffffff;
    --bg-glass:  rgba(255,255,255,.72);
    --text:      #0b1220;
    --text-mid:  #475569;
    --text-mut:  #64748b;
    --border:    rgba(15,23,42,.08);
    --border-2:  rgba(15,23,42,.06);
    --shadow:    0 10px 40px rgba(15,23,42,.06);
    --shadow-lg: 0 24px 70px rgba(15,23,42,.10);
    --accent:    #0ea5e9;
    --accent-2:  #6366f1;
    --accent-3:  #8b5cf6;
    --ring:      rgba(99,102,241,.15);
    --code-bg:   rgba(15,23,42,.05);
    --code-fg:   #e11d48;
    --hero-1:    #0b1220;
    --hero-2:    #1e3a8a;
    --cta-bg:    linear-gradient(135deg,#0b1220 0%,#111c3a 50%,#0b1220 100%);
    --cta-text:  #e2e8f0;
    --grid:      rgba(15,23,42,.035);
  }
  :root[data-theme="dark"] {
    --bg:        #030617;
    --bg-soft:   #060b1e;
    --bg-card:   #0b1220;
    --bg-glass:  rgba(15,23,42,.6);
    --text:      #e5ecf5;
    --text-mid:  #b6c2d6;
    --text-mut:  #8a97ad;
    --border:    rgba(148,163,184,.14);
    --border-2:  rgba(148,163,184,.09);
    --shadow:    0 10px 40px rgba(0,0,0,.35);
    --shadow-lg: 0 24px 70px rgba(0,0,0,.5);
    --accent:    #38bdf8;
    --accent-2:  #818cf8;
    --accent-3:  #a78bfa;
    --ring:      rgba(129,140,248,.22);
    --code-bg:   rgba(148,163,184,.08);
    --code-fg:   #f472b6;
    --hero-1:    #e5ecf5;
    --hero-2:    #93c5fd;
    --cta-bg:    linear-gradient(135deg,#0a1733 0%,#131a44 50%,#0a1733 100%);
    --cta-text:  #e2e8f0;
    --grid:      rgba(148,163,184,.045);
  }

  /* ========================================================== BASE */
  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
    transition: background .3s ease, color .3s ease;
    position: relative;
  }

  /* ambient background */
  .bg-fx { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
  .blob {
    position: absolute; border-radius: 50%;
    filter: blur(90px); opacity: .28; will-change: transform;
    transition: opacity .4s ease;
  }
  :root[data-theme="dark"] .blob { opacity: .22; }
  .blob-1 { width: 620px; height: 620px; background: radial-gradient(circle, #7dd3fc, transparent 70%); top:-220px; left:-180px; animation: floatA 24s ease-in-out infinite; }
  .blob-2 { width: 520px; height: 520px; background: radial-gradient(circle, #a78bfa, transparent 70%); top: 15%; right:-180px; animation: floatB 28s ease-in-out infinite; }
  .blob-3 { width: 460px; height: 460px; background: radial-gradient(circle, #5eead4, transparent 70%); bottom: 5%; left: 20%; animation: floatC 32s ease-in-out infinite; }
  @keyframes floatA { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(70px,50px) scale(1.12)} }
  @keyframes floatB { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-60px,-50px) scale(1.08)} }
  @keyframes floatC { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,-70px) scale(.94)} }

  .grid-fx {
    position: fixed; inset: 0; z-index: 1; pointer-events: none;
    background-image:
      linear-gradient(var(--grid) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid) 1px, transparent 1px);
    background-size: 48px 48px;
    -webkit-mask-image: radial-gradient(circle at 50% 0%, black 15%, transparent 80%);
            mask-image: radial-gradient(circle at 50% 0%, black 15%, transparent 80%);
  }

  /* ============================================================ NAV */
  .nav-wrap {
    position: sticky; top: 0; z-index: 50;
    backdrop-filter: blur(16px) saturate(160%);
    -webkit-backdrop-filter: blur(16px) saturate(160%);
    background: var(--bg-glass);
    border-bottom: 1px solid var(--border);
  }
  .nav-inner {
    max-width: 1200px; margin: 0 auto;
    padding: 14px 20px;
    display: flex; align-items: center; gap: 20px;
  }
  .logo { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: -.02em; }
  .logo-mark {
    width: 34px; height: 34px; border-radius: 10px;
    display: grid; place-items: center; font-size: 17px;
    background: linear-gradient(135deg, var(--accent), var(--accent-3));
    color: #fff;
    box-shadow: 0 6px 18px rgba(99,102,241,.35);
  }
  .nav-links { display: none; gap: 4px; margin-left: auto; }
  @media (min-width: 768px) { .nav-links { display: flex; } }
  .nav-links a {
    font-size: 14px; font-weight: 500; color: var(--text-mid);
    padding: 8px 12px; border-radius: 8px;
    text-decoration: none; transition: color .2s, background .2s;
  }
  .nav-links a:hover { color: var(--text); background: var(--code-bg); }

  .nav-right { display: flex; align-items: center; gap: 10px; margin-left: auto; }
  @media (min-width: 768px) { .nav-right { margin-left: 0; } }

  .status-pill {
    display: none; align-items: center; gap: 8px;
    padding: 6px 12px; border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    font-size: 12px; color: var(--text-mut); font-weight: 500;
  }
  @media (min-width: 640px) { .status-pill { display: inline-flex; } }
  .dot-live {
    width: 7px; height: 7px; border-radius: 50%; background: #22c55e;
    box-shadow: 0 0 0 0 rgba(34,197,94,.7);
    animation: ping 1.8s ease-out infinite;
  }
  @keyframes ping { 0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)} 100%{box-shadow:0 0 0 10px rgba(34,197,94,0)} }

  .icon-btn {
    width: 38px; height: 38px; display: grid; place-items: center;
    border-radius: 10px; border: 1px solid var(--border);
    background: var(--bg-card); color: var(--text-mid);
    cursor: pointer; transition: all .2s ease;
  }
  .icon-btn:hover { color: var(--text); border-color: var(--accent); transform: translateY(-1px); }
  .icon-btn svg { width: 18px; height: 18px; }
  :root[data-theme="light"] .icon-btn .moon { display: block; }
  :root[data-theme="light"] .icon-btn .sun  { display: none; }
  :root[data-theme="dark"]  .icon-btn .moon { display: none; }
  :root[data-theme="dark"]  .icon-btn .sun  { display: block; }

  /* ====================================================== CONTAINER */
  .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; position: relative; z-index: 5; }

  /* ============================================================ HERO */
  .hero { padding: 72px 0 56px; text-align: center; }
  @media (min-width: 768px) { .hero { padding: 96px 0 72px; } }

  .hero-badge-icon {
    display: inline-grid; place-items: center;
    width: 76px; height: 76px; border-radius: 22px;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-3) 100%);
    font-size: 34px; color: #fff;
    box-shadow: 0 20px 50px rgba(99,102,241,.35), 0 0 0 1px rgba(255,255,255,.1) inset;
    margin-bottom: 26px;
    animation: bob 4s ease-in-out infinite;
  }
  @keyframes bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }

  .eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 14px; border-radius: 999px;
    background: var(--bg-card); border: 1px solid var(--border);
    font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
    color: var(--text-mut); margin-bottom: 20px;
  }
  .eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

  h1.hero-title {
    font-size: clamp(38px, 6vw, 68px);
    font-weight: 800; letter-spacing: -.035em; line-height: 1.02;
    margin: 0 0 20px;
    background: linear-gradient(135deg, var(--hero-1) 0%, var(--hero-2) 60%, var(--accent-3) 100%);
    background-size: 200% 200%;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: grad 9s ease infinite;
  }
  @keyframes grad { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }

  .hero-sub {
    font-size: clamp(15px, 1.5vw, 18px);
    color: var(--text-mid); max-width: 620px; margin: 0 auto;
    line-height: 1.65;
  }
  .hero-sub strong { color: var(--text); font-weight: 600; }

  .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 28px; }
  .chip {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 7px 14px; border-radius: 999px;
    font-size: 12px; font-weight: 600;
    background: var(--bg-card); border: 1px solid var(--border);
    color: var(--text-mid);
  }
  .chip.green { color: #059669; border-color: rgba(16,185,129,.25); background: rgba(16,185,129,.07); }
  .chip.blue  { color: var(--accent); border-color: rgba(14,165,233,.25); background: rgba(14,165,233,.07); }
  .chip.violet{ color: var(--accent-3); border-color: rgba(139,92,246,.25); background: rgba(139,92,246,.07); }

  .cta-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 36px; }

  /* ========================================================== BUTTONS */
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    padding: 13px 24px; border-radius: 12px;
    font-size: 14px; font-weight: 600; text-decoration: none;
    border: none; cursor: pointer;
    transition: transform .2s ease, box-shadow .3s ease, background .2s ease;
    position: relative; overflow: hidden;
  }
  .btn-primary {
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
    color: #fff;
    box-shadow: 0 10px 30px rgba(99,102,241,.28);
  }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 16px 40px rgba(99,102,241,.4); }
  .btn-primary::after {
    content:""; position:absolute; inset:0;
    background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,.28) 50%, transparent 70%);
    transform: translateX(-100%); transition: transform .7s ease;
  }
  .btn-primary:hover::after { transform: translateX(100%); }

  .btn-ghost {
    background: var(--bg-card);
    border: 1px solid var(--border);
    color: var(--text);
  }
  .btn-ghost:hover { transform: translateY(-2px); border-color: var(--accent); box-shadow: var(--shadow); }

  /* ============================================================ CARDS */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 20px;
    box-shadow: var(--shadow);
    transition: transform .3s ease, box-shadow .3s ease, border-color .3s ease;
  }
  .card-hover:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-lg);
    border-color: rgba(99,102,241,.3);
  }

  .card-glass {
    background: var(--bg-glass);
    backdrop-filter: blur(16px) saturate(150%);
    -webkit-backdrop-filter: blur(16px) saturate(150%);
  }

  /* ============================================== VISITOR STATUS CARD */
  .visitor-card {
    padding: 26px 28px;
    display: grid; gap: 22px;
    grid-template-columns: 1fr;
  }
  @media (min-width: 640px) {
    .visitor-card { grid-template-columns: 1.2fr 1fr 1fr; align-items: center; }
  }
  .stat-block { position: relative; }
  .stat-block:not(:first-child)::before {
    content:""; position: absolute;
    left: -11px; top: 20%; bottom: 20%; width: 1px;
    background: var(--border);
    display: none;
  }
  @media (min-width: 640px) {
    .stat-block:not(:first-child)::before { display: block; }
  }
  .stat-label {
    font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
    color: var(--text-mut); font-weight: 600; margin-bottom: 6px;
  }
  .stat-value {
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 18px; font-weight: 700; color: var(--text);
  }
  .verdict-allow { color: #10b981; }
  .verdict-block { color: #ef4444; }
  .verdict-challenge { color: #f59e0b; }
  .verdict-throttle { color: #f97316; }

  /* ============================================================ SECTION */
  section { padding: 64px 0; position: relative; }
  @media (min-width: 768px) { section { padding: 88px 0; } }

  .section-head { text-align: center; max-width: 720px; margin: 0 auto 52px; }
  .section-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 5px 12px; border-radius: 999px;
    background: var(--bg-card); border: 1px solid var(--border);
    font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 16px;
  }
  .section-title {
    font-size: clamp(26px, 3.6vw, 44px);
    font-weight: 800; letter-spacing: -.03em; line-height: 1.12;
    margin: 0 0 14px; color: var(--text);
  }
  .section-title .accent {
    background: linear-gradient(135deg, var(--accent), var(--accent-3));
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .section-sub { color: var(--text-mid); font-size: 15px; line-height: 1.65; }

  /* ============================================================ STEPS */
  .steps-grid {
    display: grid; gap: 18px;
    grid-template-columns: 1fr;
  }
  @media (min-width: 640px) { .steps-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (min-width: 1024px) { .steps-grid { grid-template-columns: repeat(3, 1fr); } }

  .step-card { padding: 26px; position: relative; overflow: hidden; }
  .step-card::before {
    content:""; position:absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, var(--accent), var(--accent-3));
    transform: scaleX(0); transform-origin: left;
    transition: transform .4s ease;
  }
  .step-card:hover::before { transform: scaleX(1); }

  .step-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .step-num {
    width: 42px; height: 42px; border-radius: 12px;
    display: grid; place-items: center;
    font-weight: 800; font-size: 17px;
    color: #fff;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    box-shadow: 0 8px 20px rgba(99,102,241,.28);
    flex-shrink: 0;
  }
  .step-icon { font-size: 26px; }
  .step-title { font-size: 17px; font-weight: 700; color: var(--text); margin: 0 0 8px; letter-spacing: -.01em; }
  .step-body { font-size: 14px; color: var(--text-mid); line-height: 1.65; margin: 0; }
  .step-body code {
    font-family: ui-monospace, monospace; font-size: 12px;
    background: var(--code-bg); color: var(--code-fg);
    padding: 2px 6px; border-radius: 5px;
  }
  .step-body strong { color: var(--text); font-weight: 600; }

  .summary-card {
    background: linear-gradient(135deg, rgba(14,165,233,.08), rgba(139,92,246,.08));
    border-color: rgba(99,102,241,.25);
  }

  /* ============================================================ THREATS */
  .threats-grid {
    display: grid; gap: 16px;
    grid-template-columns: 1fr;
  }
  @media (min-width: 640px) { .threats-grid { grid-template-columns: repeat(2, 1fr); } }

  .threat-card { padding: 24px; display: flex; gap: 16px; align-items: flex-start; }
  .threat-icon {
    flex-shrink: 0;
    width: 50px; height: 50px; border-radius: 14px;
    display: grid; place-items: center; font-size: 24px;
    background: var(--bg-soft);
    border: 1px solid var(--border);
  }
  .threat-title { font-weight: 700; font-size: 15px; color: var(--text); margin: 0 0 4px; }
  .threat-body { font-size: 13.5px; color: var(--text-mid); margin: 0; line-height: 1.6; }

  /* ============================================================ CTA */
  .cta-section {
    margin: 40px auto; max-width: 1100px;
    border-radius: 28px;
    background: var(--cta-bg);
    color: var(--cta-text);
    padding: 56px 32px;
    text-align: center;
    position: relative; overflow: hidden;
    box-shadow: 0 30px 80px rgba(11,18,32,.35);
  }
  .cta-section::before {
    content:""; position:absolute; inset:0;
    background-image:
      linear-gradient(rgba(148,163,184,.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148,163,184,.06) 1px, transparent 1px);
    background-size: 40px 40px;
    -webkit-mask-image: radial-gradient(circle at 50% 50%, black 20%, transparent 75%);
            mask-image: radial-gradient(circle at 50% 50%, black 20%, transparent 75%);
    pointer-events: none;
  }
  .cta-inner { position: relative; z-index: 2; max-width: 640px; margin: 0 auto; }
  .cta-icon { font-size: 44px; margin-bottom: 18px; }
  .cta-title {
    font-size: clamp(24px, 3vw, 34px);
    font-weight: 800; letter-spacing: -.025em; margin: 0 0 12px;
    background: linear-gradient(135deg, #fff 0%, #93c5fd 60%, #a78bfa 100%);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .cta-sub { color: #94a3b8; font-size: 15px; line-height: 1.65; margin: 0 0 28px; }

  /* ============================================================ FOOTER */
  footer {
    padding: 40px 20px 48px;
    text-align: center;
    font-size: 13px;
    color: var(--text-mut);
    border-top: 1px solid var(--border-2);
    margin-top: 40px;
  }
  footer .foot-row {
    display: flex; flex-wrap: wrap; justify-content: center; align-items: center;
    gap: 16px; margin-top: 12px;
  }
  footer .foot-row span { display: inline-flex; align-items: center; gap: 6px; }

  /* ============================================================ ANIM */
  .fade-in {
    opacity: 0; transform: translateY(20px);
    animation: fadeIn .8s cubic-bezier(.16,1,.3,1) forwards;
  }
  @keyframes fadeIn { to { opacity: 1; transform: translateY(0); } }

  .delay-1 { animation-delay: .05s; }
  .delay-2 { animation-delay: .12s; }
  .delay-3 { animation-delay: .2s; }
  .delay-4 { animation-delay: .28s; }
  .delay-5 { animation-delay: .36s; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
  }
</style>
</head>
<body>

<!-- ambient background -->
<div class="bg-fx" aria-hidden="true">
  <div class="blob blob-1"></div>
  <div class="blob blob-2"></div>
  <div class="blob blob-3"></div>
</div>
<div class="grid-fx" aria-hidden="true"></div>

<!-- ============================================================ NAV -->
<nav class="nav-wrap">
  <div class="nav-inner">
    <a href="/" class="logo" style="text-decoration:none;color:inherit">
      <span class="logo-mark">🛡️</span>
      <span>DDoS Shield</span>
    </a>

    <div class="nav-links">
      <a href="#how">How it works</a>
      <a href="#threats">Threats</a>
      <a href="#demo">Try it</a>
    </div>

    <div class="nav-right">
      <span class="status-pill">
        <span class="dot-live"></span>
        Live
      </span>
      <button class="icon-btn" id="themeBtn" aria-label="Toggle theme" title="Toggle theme">
        <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
      </button>
      <a href="${shield.basePath}/" class="btn btn-primary" style="padding:10px 18px;font-size:13px">
        Dashboard
      </a>
    </div>
  </div>
</nav>

<!-- ============================================================ HERO -->
<header class="container">
  <section class="hero">
    <div class="hero-badge-icon fade-in">🛡️</div>

    <div class="eyebrow fade-in delay-1">
      <span class="eyebrow-dot"></span>
      Application-Level Protection
    </div>

    <h1 class="hero-title fade-in delay-2">DDoS Shield</h1>

    <p class="hero-sub fade-in delay-3">
      Your website's invisible bodyguard. It watches every visitor, spots the bad ones,
      and keeps your app safe — <strong>automatically</strong>.
    </p>

    <div class="chips fade-in delay-4">
      <span class="chip green"><span class="dot-live"></span> Active now</span>
      <span class="chip blue">✓ Zero configuration</span>
      <span class="chip violet">⚡ Blazing fast</span>
    </div>

    <div class="cta-row fade-in delay-5">
      <a href="${shield.basePath}/" class="btn btn-primary">
        Open Live Dashboard →
      </a>
      <a href="/api/data" class="btn btn-ghost">
        🔌 Test the API
      </a>
    </div>
  </section>

  <!-- =================================================== VISITOR CARD -->
  <section style="padding: 0 0 48px;">
    <div class="card card-glass card-hover visitor-card fade-in delay-5">
      <div class="stat-block">
        <div class="stat-label">Your visit</div>
        <div class="stat-value">${req.shield.ip}</div>
      </div>
      <div class="stat-block">
        <div class="stat-label">Verdict</div>
        <div class="stat-value verdict-${req.shield.verdict}">${req.shield.verdict.toUpperCase()}</div>
      </div>
      <div class="stat-block">
        <div class="stat-label">Suspicion score</div>
        <div class="stat-value">${req.shield.score} <span style="color:var(--text-mut);font-weight:500">/ 85</span></div>
      </div>
    </div>
  </section>
</header>

<!-- ============================================================ HOW -->
<div class="container">
  <section id="how">
    <div class="section-head">
      <div class="section-eyebrow">How it works</div>
      <h2 class="section-title">
        Think of it as a <span class="accent">nightclub bouncer</span> for your website
      </h2>
      <p class="section-sub">
        Every visitor has to pass the bouncer before they can enter. Here's what happens in
        the 5 steps below — all in a few milliseconds.
      </p>
    </div>

    <div class="steps-grid">
      <!-- Step 1 -->
      <article class="card card-hover step-card">
        <div class="step-head">
          <div class="step-num">1</div>
          <div class="step-icon">🔍</div>
        </div>
        <h3 class="step-title">We watch every request</h3>
        <p class="step-body">
          When someone visits your site, we look at their "ID card" — what browser they use,
          which headers they send, and where they came from. Real humans look normal. Bots don't.
        </p>
      </article>

      <!-- Step 2 -->
      <article class="card card-hover step-card">
        <div class="step-head">
          <div class="step-num">2</div>
          <div class="step-icon">🤖</div>
        </div>
        <h3 class="step-title">We spot the robots</h3>
        <p class="step-body">
          If someone uses a tool like <code>curl</code>, <code>sqlmap</code> or a Python script
          instead of a real browser, we notice. We know over 40 known bot signatures by heart.
        </p>
      </article>

      <!-- Step 3 -->
      <article class="card card-hover step-card">
        <div class="step-head">
          <div class="step-num">3</div>
          <div class="step-icon">📊</div>
        </div>
        <h3 class="step-title">We count every visit</h3>
        <p class="step-body">
          A normal user visits a page a few times a minute. An attacker sends
          <strong>hundreds per second</strong>. We keep a live tally of everyone's traffic in
          memory — no database required.
        </p>
      </article>

      <!-- Step 4 -->
      <article class="card card-hover step-card">
        <div class="step-head">
          <div class="step-num">4</div>
          <div class="step-icon">🧩</div>
        </div>
        <h3 class="step-title">We ask: "Are you human?"</h3>
        <p class="step-body">
          If something looks suspicious, we don't just block — we show a
          <strong>simple math puzzle</strong>. A real person solves it in 2 seconds.
          A bot gets stuck forever. Solve it → you get a 30-minute VIP pass.
        </p>
      </article>

      <!-- Step 5 -->
      <article class="card card-hover step-card">
        <div class="step-head">
          <div class="step-num">5</div>
          <div class="step-icon">🚫</div>
        </div>
        <h3 class="step-title">Repeat offenders get blocked</h3>
        <p class="step-body">
          Fail 3 puzzles? Send more than 60 requests a minute? You're banned for 5 minutes.
          The ban auto-lifts, so innocent users are never permanently locked out.
        </p>
      </article>

      <!-- Summary -->
      <article class="card card-hover step-card summary-card">
        <div class="step-head">
          <div class="step-icon" style="font-size:28px">⚡</div>
        </div>
        <h3 class="step-title" style="color:var(--accent)">All this in &lt; 5 ms</h3>
        <p class="step-body">
          The whole process happens in a few milliseconds, before your app even knows someone
          knocked. No lag, no downtime, no delay for real users.
        </p>
      </article>
    </div>
  </section>

  <!-- ============================================================ THREATS -->
  <section id="threats">
    <div class="section-head">
      <div class="section-eyebrow" style="color:var(--accent-3)">Real-world protection</div>
      <h2 class="section-title">What threats does it stop?</h2>
      <p class="section-sub">
        A single middleware blocks the most common attacks that hit web applications every day.
      </p>
    </div>

    <div class="threats-grid">
      <article class="card card-hover threat-card">
        <div class="threat-icon">💥</div>
        <div>
          <h3 class="threat-title">DDoS attacks</h3>
          <p class="threat-body">Floods of fake traffic that try to crash your server.</p>
        </div>
      </article>

      <article class="card card-hover threat-card">
        <div class="threat-icon">🔐</div>
        <div>
          <h3 class="threat-title">Brute-force logins</h3>
          <p class="threat-body">Bots trying thousands of passwords on your login page.</p>
        </div>
      </article>

      <article class="card card-hover threat-card">
        <div class="threat-icon">🔎</div>
        <div>
          <h3 class="threat-title">Vulnerability scanners</h3>
          <p class="threat-body">
            Tools hunting for <code style="font-family:ui-monospace;font-size:12px;background:var(--code-bg);color:var(--code-fg);padding:2px 6px;border-radius:5px">.env</code>,
            <code style="font-family:ui-monospace;font-size:12px;background:var(--code-bg);color:var(--code-fg);padding:2px 6px;border-radius:5px">wp-admin</code>
            and other weak spots.
          </p>
        </div>
      </article>

      <article class="card card-hover threat-card">
        <div class="threat-icon">🕷️</div>
        <div>
          <h3 class="threat-title">Scrapers &amp; spam bots</h3>
          <p class="threat-body">Programs that steal your content or flood your forms.</p>
        </div>
      </article>
    </div>
  </section>
</div>

<!-- ============================================================ CTA -->
<div class="container" id="demo">
  <div class="cta-section">
    <div class="cta-inner">
      <div class="cta-icon">🧪</div>
      <h2 class="cta-title">Want to see it in action?</h2>
      <p class="cta-sub">
        The dashboard shows live traffic, blocked IPs, and real-time events.
        Hit "Test the API" a few times fast — you'll meet the CAPTCHA.
      </p>
      <div class="cta-row">
        <a href="${shield.basePath}/" class="btn btn-primary">
          📊 Open Dashboard
        </a>
        <a href="/api/data" class="btn" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#e2e8f0">
          🔌 Test the API
        </a>
      </div>
    </div>
  </div>
</div>

<!-- ============================================================ FOOTER -->
<footer>
  <div style="font-weight:600;color:var(--text-mid)">🛡️ DDoS Shield</div>
  <div class="foot-row">
    <span>⚙️ Node.js + Express</span>
    <span>🔒 Application-level rate limiting</span>
    <span>🚀 Zero dependencies</span>
  </div>
  <div style="margin-top:14px;font-size:12px;color:var(--text-mut)">
    Built for the web security track · Made with care
  </div>
</footer>

<script>
  (function () {
    'use strict';

    /* -------- theme toggle -------- */
    var root = document.documentElement;
    var btn = document.getElementById('themeBtn');

    function setTheme(t) {
      root.setAttribute('data-theme', t);
      try { localStorage.setItem('shield.theme', t); } catch (e) {}
    }

    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });

    /* -------- smooth scroll for in-page nav (with sticky nav offset) -------- */
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (id.length < 2) return;
        var el = document.querySelector(id);
        if (!el) return;
        e.preventDefault();
        var top = el.getBoundingClientRect().top + window.pageYOffset - 80;
        window.scrollTo({ top: top, behavior: 'smooth' });
      });
    });

    /* -------- subtle fade-in on scroll for section cards -------- */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

      document.querySelectorAll('.step-card, .threat-card').forEach(function (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition = 'opacity .6s ease, transform .6s cubic-bezier(.16,1,.3,1)';
        io.observe(el);
      });
    }
  })();
</script>

</body>
</html>`);
});

app.get('/api/data', (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    ip: req.shield.ip,
    score: req.shield.score,
    verdict: req.shield.verdict,
    data: Array.from({ length: 10 }, (_, i) => ({ id: i, value: Math.random().toFixed(4) })),
  });
});

app.post('/api/auth/login', (req, res) => {
  res.json({ ok: true, token: 'demo-session-token', ip: req.shield.ip });
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

/* ------------------------------------------------------------------ boot */

const server = app.listen(PORT, () => {
  console.log('');
  console.log('  🛡️  DDoS Shield demo running');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  App        : http://localhost:${PORT}/`);
  console.log(`  Dashboard  : http://localhost:${PORT}${shield.basePath}/`);
  console.log(`  Admin token: ${shield.config.adminToken}`);
  console.log('');
});

async function shutdown() {
  server.close();
  await shield.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
