// shield/detector.js
'use strict';

/**
 * Heuristic bot / abuse scoring.
 *
 * Each signal adds points. The shield then compares the total against
 * `challengeScore` and `blockScore`. Signals are intentionally additive so a
 * single weak signal (e.g. `curl`) never gets a legitimate client blocked.
 */

const RULES = {
  NO_USER_AGENT: 35,
  SCANNER_UA: 70,
  HEADLESS_UA: 40,
  CLI_UA: 15,
  CRAWLER_UA: 25,

  MISSING_ACCEPT: 10,
  MISSING_ACCEPT_LANGUAGE: 10,
  MISSING_ACCEPT_ENCODING: 5,

  SUSPICIOUS_PATH: 30,
  SENSITIVE_ENDPOINT: 10,
  BURST: 30,
  NOT_FOUND_FLOOD: 25,
  BAD_METHOD: 40,
  EMPTY_BODY_POST: 5,
};

const SCANNER_UA = [
  /sqlmap/i, /nikto/i, /nmap/i, /masscan/i, /zgrab/i, /zmap/i,
  /acunetix/i, /nessus/i, /openvas/i, /qualys/i, /netsparker/i,
  /dirbuster/i, /gobuster/i, /feroxbuster/i, /wfuzz/i, /ffuf/i,
  /hydra/i, /medusa/i, /metasploit/i, /havij/i, /w3af/i,
  /nuclei/i, /xray/i, /jaeles/i, /arachni/i, /skipfish/i,
];

const CRAWLER_UA = [
  /semrushbot/i, /ahrefsbot/i, /mj12bot/i, /dotbot/i, /bytespider/i,
  /petalbot/i, /megaindex/i, /blexbot/i, /seznambot/i,
];

const HEADLESS_UA = [
  /headlesschrome/i, /phantomjs/i, /puppeteer/i, /playwright/i,
  /selenium/i, /electron\//i, /slimerjs/i, /zombie\.js/i,
];

const CLI_UA = [
  /curl\//i, /wget\//i, /python-requests/i, /python-urllib/i, /aiohttp/i,
  /httpx\//i, /go-http-client/i, /okhttp/i, /libwww-perl/i, /httpclient/i,
  /node-fetch/i, /axios\//i, /undici/i, /postmanruntime/i, /insomnia/i,
  /autocannon/i, /apachebench/i, /\bwrk\b/i, /hey\//i, /locust/i, /k6\//i,
  /jmeter/i, /guzzle/i, /java\//i, /requests\//i, /grequests/i,
];

const SUSPICIOUS_PATH = [
  /\.env(\b|$)/i, /\.git(\/|$)/i, /\/\.ssh\//i, /wp-admin/i, /wp-login/i,
  /xmlrpc\.php/i, /phpmyadmin/i, /pma\//i, /\/etc\/passwd/i, /\.\.\//,
  /\.\.%2f/i, /%2e%2e%2f/i, /\.(sql|bak|old|swp|zip|tar|gz)$/i,
  /\/cgi-bin\//i, /\/shell\b/i, /\/vendor\/phpunit/i, /\/actuator\//i,
  /\/\.aws\//i, /\/config\.json$/i, /\/docker-compose/i,
];

const BAD_METHODS = new Set(['TRACE', 'TRACK', 'CONNECT', 'PROPFIND', 'DEBUG']);

/**
 * @param {import('express').Request} req
 * @param {{count:number, burst:number, notFound:number, sensitive:boolean}} ctx
 * @returns {{score:number, reasons:string[], tags:string[]}}
 */
function analyze(req, ctx = {}) {
  const reasons = [];
  const tags = [];
  let score = 0;

  const add = (points, reason, tag) => {
    score += points;
    reasons.push(reason);
    if (tag) tags.push(tag);
  };

  /* ---------------------------------------------------------- User-Agent */
  const uaRaw = req.headers['user-agent'];
  const ua = typeof uaRaw === 'string' ? uaRaw.trim() : '';

  if (!ua) {
    add(RULES.NO_USER_AGENT, 'missing User-Agent header', 'no-ua');
  } else if (SCANNER_UA.some((re) => re.test(ua))) {
    add(RULES.SCANNER_UA, 'known scanner signature in User-Agent', 'scanner');
  } else if (HEADLESS_UA.some((re) => re.test(ua))) {
    add(RULES.HEADLESS_UA, 'headless browser User-Agent', 'headless');
  } else if (CLI_UA.some((re) => re.test(ua))) {
    add(RULES.CLI_UA, 'scripted / CLI HTTP client User-Agent', 'cli');
  } else if (CRAWLER_UA.some((re) => re.test(ua))) {
    add(RULES.CRAWLER_UA, 'crawler User-Agent', 'crawler');
  }

  /* ------------------------------------------------------------- headers */
  if (!req.headers.accept) {
    add(RULES.MISSING_ACCEPT, 'missing Accept header', 'no-accept');
  }
  if (!req.headers['accept-language']) {
    add(RULES.MISSING_ACCEPT_LANGUAGE, 'missing Accept-Language header', 'no-accept-lang');
  }
  if (!req.headers['accept-encoding']) {
    add(RULES.MISSING_ACCEPT_ENCODING, 'missing Accept-Encoding header', 'no-accept-enc');
  }

  /* ---------------------------------------------------------------- path */
  const path = ctx.path || req.path || '/';

  if (SUSPICIOUS_PATH.some((re) => re.test(path))) {
    add(RULES.SUSPICIOUS_PATH, 'probe for sensitive file / traversal pattern', 'probe');
  }
  if (ctx.sensitive) {
    add(RULES.SENSITIVE_ENDPOINT, 'request to a sensitive endpoint', 'sensitive');
  }
  if (BAD_METHODS.has(String(req.method).toUpperCase())) {
    add(RULES.BAD_METHOD, `unusual HTTP method ${req.method}`, 'method');
  }

  /* ------------------------------------------------------------ behaviour */
  if (typeof ctx.burst === 'number' && ctx.burst > 0 && ctx.burstExceeded) {
    add(RULES.BURST, `traffic burst (${ctx.burst} requests in the burst window)`, 'burst');
  }
  if (typeof ctx.notFound === 'number' && ctx.notFoundExceeded) {
    add(RULES.NOT_FOUND_FLOOD, `404 flood (${ctx.notFound} not-found responses)`, 'scan');
  }

  return { score, reasons, tags };
}

module.exports = { analyze, RULES, SCANNER_UA, CLI_UA, HEADLESS_UA, SUSPICIOUS_PATH };