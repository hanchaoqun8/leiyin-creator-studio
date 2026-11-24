/* ============================================================
 * 引擎适配层：同一套前端，两种运行模式
 *  · 本地模式：POST /api/generate → Node 后端（魔搭/智谱）
 *  · 云端模式：WorkBuddy Cloud SDK 免密钥 LLM（+ 智谱/魔搭 BYOK）
 *
 *  云端模式由 cloud-config.js 提供 window.LEIYIN_CLOUD_CONFIG
 * ============================================================ */
(function () {
  'use strict';
  const CFG = window.LEIYIN_CLOUD_CONFIG || null;
  const isCloud = !!(CFG && CFG.endpoint && CFG.publishableKey);
  const byokOnly = !!(CFG && CFG.byokOnly);
  const standalone = isCloud || byokOnly;   // 无本地后端（静态部署 / 云端）

  let cloudClient = null;
  let cloudModels = [];

  /** 访问口令：从 localStorage 读，随请求以 header 下发（仅存本浏览器） */
  function getAccessCode() { return localStorage.getItem('leiyin_access_code') || ''; }
  function setAccessCode(v) { localStorage.setItem('leiyin_access_code', v); }
  function authHeaders(extra) {
    return Object.assign({ 'Content-Type': 'application/json', 'X-Access-Code': getAccessCode() }, extra || {});
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.WorkBuddyCloud) return resolve();
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('云端 SDK 加载失败'));
      document.head.appendChild(s);
    });
  }

  async function initCloud() {
    if (cloudClient) return cloudClient;
    await loadScript('https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js');
    cloudClient = window.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: CFG.endpoint,
      oauthRelayBaseUrl: CFG.oauthRelayBaseUrl,
      publishableKey: CFG.publishableKey,
    });
    try { cloudModels = await cloudClient.llm.models.list(); }
    catch (_) { cloudModels = []; }
    return cloudClient;
  }

  async function status() {
    if (byokOnly) {
      return {
        mode: 'cloud', ok: true,
        availableEngines: ['modelscope', 'zhipu'],
        engines: {
          modelscope: { configured: false, note: 'BYOK · 需魔搭令牌' },
          zhipu: { configured: false, note: 'BYOK · 需智谱 Key' },
        },
      };
    }
    if (isCloud) {
      try {
        await initCloud();
        return {
          mode: 'cloud', ok: true,
          availableEngines: ['cloud', 'modelscope', 'zhipu'],
          engines: {
            cloud: { configured: true, models: cloudModels.filter((m) => m.disabled !== true).map((m) => m.name || m.id) },
            modelscope: { configured: false, note: 'BYOK' },
            zhipu: { configured: false, note: 'BYOK' },
          },
          models: cloudModels.filter((m) => m.disabled !== true).map((m) => ({ id: m.id, name: m.name || m.id })),
        };
      } catch (e) {
        return { mode: 'cloud', ok: false, error: e.message, availableEngines: ['modelscope', 'zhipu'] };
      }
    }
    const r = await fetch('/api/health');
    const j = await r.json();
    return j;
  }

  async function getOptions() {
    if (standalone) {
      // 云端/静态：选项已内联在 options.js / knowledge.js，无需请求
      return { options: window.LEIYIN_OPTIONS, libraries: window.LEIYIN_KB.listLibraries() };
    }
    // 独立云端版：首次会收到 401 ACCESS_CODE_REQUIRED，抛给 UI 提示输入口令
    const r = await fetch('/api/options', { headers: { 'X-Access-Code': getAccessCode() } });
    const j = await r.json();
    if (r.status === 401 && j.error === 'ACCESS_CODE_REQUIRED') {
      const e = new Error('ACCESS_CODE_REQUIRED'); e.code = 'ACCESS_CODE_REQUIRED'; throw e;
    }
    return j;
  }

  /** 云端：用 SDK 免密钥调用（流式收集） */
  async function callCloud(messages, temperature, maxTokens) {
    await initCloud();
    const model = cloudModels.find((m) => m.disabled !== true);
    if (!model) throw new Error('云端暂无可用模型，请稍后重试');
    let content = '';
    let reasoning = '';
    for await (const chunk of cloudClient.llm.chat.completions.create({
      model: model.id,
      messages,
      stream: true,
      temperature: temperature || 0.85,
    })) {
      const delta = chunk.choices[0] && chunk.choices[0].delta;
      if (delta && delta.content) content += delta.content;
      if (delta && delta.reasoning_content) reasoning += delta.reasoning_content;
    }
    if (!content.trim()) throw new Error('云端模型返回为空' + (reasoning ? '（仅返回思考过程）' : ''));
    return { content: content.trim(), model: model.id, provider: 'cloud' };
  }

  /** 浏览器直连 OpenAI 兼容端点（BYOK：智谱 / 魔搭） */
  async function callBYOK(engine, messages, apiKey, temperature, maxTokens) {
    const isZhipu = engine === 'zhipu';
    const baseUrl = isZhipu
      ? 'https://open.bigmodel.cn/api/paas/v4'
      : 'https://api-inference.modelscope.cn/v1';
    const model = isZhipu ? 'glm-4-flash' : 'Qwen/Qwen3.5-27B';
    if (!apiKey) throw new Error(isZhipu ? '请先填写智谱 API Key' : '请先填写魔搭令牌');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: temperature || 0.85, max_tokens: maxTokens || 2000, stream: false }),
    });
    const raw = await res.text();
    let json;
    try { json = JSON.parse(raw); } catch (_) { throw new Error(`接口返回非 JSON（HTTP ${res.status}）`); }
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      if (res.status === 403) throw new Error(msg + '（魔搭需实名认证 / 智谱需有效套餐）');
      throw new Error(msg);
    }
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error('接口返回内容为空');
    return { content: content.trim(), model, provider: isZhipu ? 'zhipu' : 'modelscope' };
  }

  async function generate(payload) {
    if (!standalone) {
      const r = await fetch('/api/generate', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (r.status === 401 && j.error === 'ACCESS_CODE_REQUIRED') {
        const e = new Error('ACCESS_CODE_REQUIRED'); e.code = 'ACCESS_CODE_REQUIRED'; throw e;
      }
      if (!j.ok) {
        const e = new Error(j.error || '生成失败');
        e.userAction = j.userAction; e.attempts = j.attempts;
        throw e;
      }
      return j;
    }

    // 云端：重建 prompt（用内联 UMD 模块）
    const OPTS = window.LEIYIN_OPTIONS, KB = window.LEIYIN_KB, P = window.LEIYIN_PROMPT;
    const {
      topic, topicCustom, cultures, cultureCustom, contentType, style, styleCustom,
      audience, audienceCustom, length, lengthCustom, customNotes, engine, apiKey, mode, selectedTopic,
    } = payload;
    const lengthObj = OPTS.LENGTHS.find((l) => l.key === length);
    const lengthText = length === 'custom' && lengthCustom ? `${lengthCustom}（自定义字数）`
      : (lengthObj ? `${lengthObj.label}（约 ${lengthObj.min}-${lengthObj.max} 字）` : '500字标准爆款文案');
    const ctx = {
      topic: [topic, topicCustom].filter(Boolean).join(' — '), topicCustom: '',
      cultures: cultures || [], cultureCustom, contentType,
      style: style || OPTS.STYLES[0], styleCustom,
      audience: audience || OPTS.AUDIENCES[2], audienceCustom, lengthText, customNotes,
      mode: mode, selectedTopic: selectedTopic,
    };
    const messages = [
      { role: 'system', content: P.buildSystemPrompt(ctx) },
      { role: 'user', content: P.buildUserPrompt(ctx) },
    ];
    const t0 = Date.now();
    const budget = mode === 'topics' ? 900 : (length === 'xl' ? 2600 : 2000);
    const selected = engine || (byokOnly ? 'modelscope' : 'cloud');
    let out;
    if (selected === 'cloud') {
      if (byokOnly) throw new Error('当前为免密钥未开启模式，请改用魔搭或智谱引擎并填写密钥');
      out = await callCloud(messages, 0.85, budget);
    } else {
      out = await callBYOK(selected, messages, apiKey, 0.85, budget);
    }
    return {
      ok: true, content: out.content, engine: out.provider, model: out.model,
      ms: Date.now() - t0,
      retrieved: KB.retrieve(cultures || [], String(topic || ''), 2, OPTS).map((s) => ({ library: s.library, id: s.id })),
    };
  }

  window.LEIYIN_ENGINE = { isCloud, status, getOptions, generate, getAccessCode, setAccessCode };
})();
