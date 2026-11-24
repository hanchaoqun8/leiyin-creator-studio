/* ============================================================
 * 素手归原 · APK 专用引擎适配层
 * UI 与网页版完全一致；AI 调用走 Java 原生桥（令牌内置在 APK 中）
 * ============================================================ */
(function () {
  'use strict';

  var seq = 0;
  var pending = {};

  window.__sushouResult = function (id, raw) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    var j;
    try { j = JSON.parse(raw); }
    catch (e) { p.reject(new Error(String(raw))); return; }
    if (j.ok) {
      p.resolve(j);
    } else {
      var err = new Error(j.error || '生成失败');
      err.attempts = j.attempts;
      p.reject(err);
    }
  };

  function callNative(engine, messages, maxTokens) {
    return new Promise(function (resolve, reject) {
      if (!window.SushouBridge) { reject(new Error('原生桥接未就绪，请重新安装 APK')); return; }
      var id = 'r' + (++seq);
      pending[id] = { resolve: resolve, reject: reject };
      try {
        window.SushouBridge.generate(id, engine || 'auto', JSON.stringify(messages), maxTokens || 2000);
      } catch (e) {
        delete pending[id];
        reject(e);
      }
    });
  }

  async function status() {
    return {
      mode: 'apk', ok: true,
      availableEngines: ['auto', 'modelscope', 'zhipu'],
      engines: {
        modelscope: { configured: true, note: '内置令牌 · Qwen3.8-Flash-Next', primary: 'Qwen/Qwen3.8-Flash-Next' },
        zhipu: { configured: true, note: '内置令牌 · glm-4-flash', primary: 'glm-4-flash' },
      },
    };
  }

  function getOptions() {
    return Promise.resolve({
      options: window.LEIYIN_OPTIONS,
      libraries: window.LEIYIN_KB.listLibraries(),
    });
  }

  async function generate(payload) {
    var OPTS = window.LEIYIN_OPTIONS, KB = window.LEIYIN_KB, P = window.LEIYIN_PROMPT;
    var topic = payload.topic, topicCustom = payload.topicCustom;
    var cultures = payload.cultures || [];
    var lengthObj = OPTS.LENGTHS.find(function (l) { return l.key === payload.length; });
    var lengthText = payload.length === 'custom' && payload.lengthCustom
      ? payload.lengthCustom + '（自定义字数）'
      : (lengthObj ? lengthObj.label + '（约 ' + lengthObj.min + '-' + lengthObj.max + ' 字）' : '500字标准爆款文案');
    var ctx = {
      topic: [topic, topicCustom].filter(Boolean).join(' — '), topicCustom: '',
      cultures: cultures, cultureCustom: payload.cultureCustom,
      contentType: payload.contentType,
      style: payload.style || OPTS.STYLES[0], styleCustom: payload.styleCustom,
      audience: payload.audience || OPTS.AUDIENCES[2], audienceCustom: payload.audienceCustom,
      lengthText: lengthText, customNotes: payload.customNotes,
    };
    var messages = [
      { role: 'system', content: P.buildSystemPrompt(ctx) },
      { role: 'user', content: P.buildUserPrompt(ctx) },
    ];
    var out = await callNative(payload.engine, messages, payload.length === 'xl' ? 2600 : 2000);
    return {
      ok: true,
      content: out.content,
      engine: out.provider,
      model: out.model,
      ms: out.ms,
      fallbackFrom: (out.attempts && out.attempts.length > 1) ? out.attempts : undefined,
      retrieved: KB.retrieve(cultures, String(topic || ''), 2, OPTS).map(function (s) {
        return { library: s.library, id: s.id };
      }),
    };
  }

  window.LEIYIN_ENGINE = { isCloud: false, status: status, getOptions: getOptions, generate: generate };
})();
