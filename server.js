'use strict';

/**
 * 素手归原创作平台 · 独立云端版（任何浏览器/小程序 webview/APP webview 可打开）
 *  · 令牌只存在服务端 secrets.js，绝不下发浏览器
 *  · 访问口令门禁，防止令牌被当公共代理滥用（口令存浏览器 localStorage，只输一次）
 *  · 监听 PORT 环境变量，绑定 0.0.0.0 —— 符合发布沙箱要求
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { generate, status } = require('./llm');
const SECRETS = require('./secrets');

const PORT = Number(process.env.PORT || 3000);
const WEB_DIR = path.join(__dirname, 'web');
const OPTS = require('./shared/options');
const KB = require('./shared/knowledge');
const PROMPT = require('./shared/prompt');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (_) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

/** 防止乱码：检测 U+FFFD，宁可报错不静默处理 */
function clean(text, field) {
  if (typeof text !== 'string') return text;
  if (!text.includes('\uFFFD')) return text;
  try {
    const fixed = Buffer.from(text, 'latin1').toString('utf8');
    if (!fixed.includes('\uFFFD')) return fixed;
  } catch (_) {}
  throw new Error(`${field} 编码损坏，请以 UTF-8 重新提交`);
}

function serveStatic(res, urlPath) {
  let cleanPath;
  try { cleanPath = decodeURIComponent(urlPath.split('?')[0]); } catch (_) { return false; }
  const rel = cleanPath === '/' ? 'index.html' : cleanPath.replace(/^\/+/, '');
  const full = path.resolve(WEB_DIR, rel);
  if (!full.startsWith(path.resolve(WEB_DIR))) return false;
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) return false;
  const body = fs.readFileSync(full);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  res.end(body);
  return true;
}

/** 访问口令校验：header x-access-code */
function checkAccess(req) {
  const code = String(req.headers['x-access-code'] || '').trim();
  return code === SECRETS.ACCESS_CODE;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Access-Code');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const p = url.pathname;

    // 健康探测不校验口令（仅暴露引擎是否配置，不暴露密钥）
    if (p === '/api/health' && req.method === 'GET') {
      const s = status();
      return json(res, 200, {
        ok: true, mode: 'standalone', accessRequired: true,
        engines: s,
        availableEngines: ['auto', 'modelscope', 'zhipu'],
        time: new Date().toISOString(),
      });
    }

    if (p === '/api/options' && req.method === 'GET') {
      if (!checkAccess(req)) return json(res, 401, { ok: false, error: 'ACCESS_CODE_REQUIRED', message: '请输入访问口令' });
      return json(res, 200, { ok: true, options: OPTS, libraries: KB.listLibraries() });
    }

    if (p === '/api/generate' && req.method === 'POST') {
      if (!checkAccess(req)) return json(res, 401, { ok: false, error: 'ACCESS_CODE_REQUIRED', message: '访问口令不正确，请重新输入' });
      const body = await readBody(req);
      const {
        topic, topicCustom, cultures, cultureCustom, contentType,
        style, styleCustom, audience, audienceCustom, length, lengthCustom,
        customNotes, engine,
      } = body;

      if (!topic && !topicCustom) return json(res, 400, { ok: false, error: '请填写创作主题' });

      const topicText = clean([topic, topicCustom].filter(Boolean).join(' — '), 'topic');
      const safeNotes = clean(customNotes || '', 'customNotes');

      const lengthObj = OPTS.LENGTHS.find((l) => l.key === length);
      const lengthText = length === 'custom' && lengthCustom
        ? `${clean(String(lengthCustom), 'lengthCustom')}（自定义字数）`
        : (lengthObj ? `${lengthObj.label}（约 ${lengthObj.min}-${lengthObj.max} 字）` : '500字标准爆款文案');

      const ctx = {
        topic: topicText, topicCustom: '', cultures: cultures || [], cultureCustom,
        contentType, style: style || OPTS.STYLES[0], styleCustom,
        audience: audience || OPTS.AUDIENCES[2], audienceCustom, lengthText, customNotes: safeNotes,
      };

      const messages = [
        { role: 'system', content: PROMPT.buildSystemPrompt(ctx) },
        { role: 'user', content: PROMPT.buildUserPrompt(ctx) },
      ];

      const t0 = Date.now();
      try {
        const out = await generate(messages, {
          engine: engine || 'auto',
          temperature: 0.85,
          maxTokens: length === 'xl' ? 2600 : (length === 'm' ? 1400 : 2200),
        });
        return json(res, 200, {
          ok: true, content: out.content,
          engine: out.provider || engine, model: out.model,
          fallbackFrom: out.fallbackFrom || null,
          primaryError: out.primaryError || null,
          tokens: out.usage?.total_tokens || null,
          ms: Date.now() - t0,
          retrieved: KB.retrieve(cultures || [], topicText, 2, OPTS).map((s) => ({ library: s.library, id: s.id })),
        });
      } catch (e) {
        return json(res, 502, {
          ok: false, error: e.message, code: e.code,
          userAction: e.userAction || null, attempts: e.attempts || null,
        });
      }
    }

    if (req.method === 'GET' && serveStatic(res, p)) return;
    return json(res, 404, { ok: false, error: '未知端点' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const s = status();
  console.log('\n  素手归原创作平台 · 独立云端版');
  console.log('  ──────────────────────────────────────────');
  console.log(`  监听  0.0.0.0:${PORT}`);
  console.log(`  魔搭  ${s.modelscope.configured ? '✓ 已配置 · ' + s.modelscope.primary : '✗ 未配置'}`);
  console.log(`  智谱  ${s.zhipu.configured ? '✓ 已配置 · ' + s.zhipu.model : '✗ 未配置'}`);
  console.log(`  口令  ${SECRETS.ACCESS_CODE ? '✓ 已启用' : '✗ 未设置'}`);
  console.log('  ──────────────────────────────────────────\n');
});
