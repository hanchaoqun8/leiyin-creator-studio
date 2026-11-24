'use strict';

/**
 * 双引擎 LLM 调用（本地版）
 *  1) 魔搭 ModelScope —— 复用已验证的 token 与模型回退链（Qwen2.5→Qwen3.5→...）
 *  2) 智谱 GLM       —— BYOK，OpenAI 兼容端点 /api/paas/v4
 *  3) auto           —— 先魔搭，失败回退智谱（若配置了 GLM key）
 *
 * ★ 复用原则：账号级错误(401/403)不回退；模型级错误(404/400-model)才回退。
 */
const SECRETS = require('./secrets');

const MODELSCOPE = {
  baseUrl: process.env.MODELSCOPE_BASE_URL || 'https://api-inference.modelscope.cn/v1',
  token: (SECRETS.MODELSCOPE_TOKEN || '').trim() || null,
  // ★ 实测（2026-11-24）：用户新令牌下可用模型已轮换。
  //   Qwen2.5-7B / DeepSeek-V4.1-Flash 虽在旧列表，实测返回 400 "no provider supported"。
  //   创意文案实测：Qwen3.8-Flash-Next 约5.7s 且文风最生活化 → 设为首选；
  //   Qwen3.5-27B 约38s 质量好但慢 → 兜底。
  chain: (process.env.MODELSCOPE_MODEL_CHAIN
    ? process.env.MODELSCOPE_MODEL_CHAIN.split(',').map((s) => s.trim()).filter(Boolean)
    : [
        'Qwen/Qwen3.8-Flash-Next',
        'Qwen/Qwen3.5-27B',
        'Qwen/Qwen3.5-35B-A3B',
        'Qwen/Qwen3.8-27B',
      ]),
};

const ZHIPU = {
  baseUrl: process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
  // 环境变量或前端传来的 key（BYOK）
  key: (SECRETS.ZHIPU_API_KEY || '').trim() || null,
  // ★ 实测：glm-4.7 文风好但是推理模型，需要更大 max_tokens 才出正文；
  //   glm-4-flash 响应稳、快，作为默认。
  model: process.env.ZHIPU_MODEL || 'glm-4-flash',
};

async function callOpenAICompatible(baseUrl, token, model, messages, { temperature = 0.85, maxTokens = 1800 } = {}) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  const raw = await res.text();
  let json;
  try { json = JSON.parse(raw); }
  catch (_) {
    const e = new Error(`接口返回非 JSON（HTTP ${res.status}）`);
    e.status = res.status; e.fatal = true; throw e;
  }
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    const e = new Error(msg);
    e.status = res.status; e.raw = json; e.code = 'LLM_ERROR';
    // 账号级：不回退
    if (res.status === 401 || res.status === 403) {
      e.fatal = true;
      e.userAction = res.status === 403
        ? '魔搭：请到 modelscope.cn/my/accountsettings 绑定阿里云账号并完成实名认证'
        : '令牌无效，请检查 .token 或智谱 API Key';
    }
    // 模型级：可回退
    if (res.status === 404 || (res.status === 400 && /model/i.test(msg))) e.modelUnavailable = true;
    throw e;
  }
  const content = json?.choices?.[0]?.message?.content;
  if (!content) { const e = new Error('接口返回内容为空'); e.code = 'EMPTY_CONTENT'; throw e; }
  return { content: content.trim(), model, usage: json.usage };
}

async function callModelScope(messages, opts) {
  if (!MODELSCOPE.token) { const e = new Error('未配置魔搭令牌'); e.code = 'NO_TOKEN'; e.fatal = true; throw e; }
  const attempts = [];
  let last = null;
  for (const m of MODELSCOPE.chain) {
    try {
      const out = await callOpenAICompatible(MODELSCOPE.baseUrl, MODELSCOPE.token, m, messages, opts);
      if (attempts.length) out.fallbackFrom = attempts.map((a) => a.model);
      out.provider = 'modelscope';
      out.attempts = attempts;
      return out;
    } catch (e) {
      last = e; attempts.push({ model: m, error: e.message, status: e.status });
      if (e.fatal) { e.attempts = attempts; throw e; }
    }
  }
  last.attempts = attempts; throw last;
}

async function callZhipu(messages, opts, apiKey) {
  const key = apiKey || ZHIPU.key;
  if (!key) { const e = new Error('未配置智谱 API Key（需在设置里填写或设 ZHIPU_API_KEY）'); e.code = 'NO_ZHIPU_KEY'; e.fatal = true; throw e; }
  const out = await callOpenAICompatible(ZHIPU.baseUrl, key, ZHIPU.model, messages, opts);
  out.provider = 'zhipu';
  return out;
}

/**
 * @param {string} engine 'auto'|'modelscope'|'zhipu'
 */
async function generate(messages, { engine = 'auto', apiKey, temperature, maxTokens } = {}) {
  const opts = { temperature, maxTokens };
  if (engine === 'modelscope') return callModelScope(messages, opts);
  if (engine === 'zhipu') return callZhipu(messages, opts, apiKey);
  // auto：魔搭优先 → 智谱兜底（仅当致命错误或全部模型失败，且有 key）
  try {
    return await callModelScope(messages, opts);
  } catch (msErr) {
    if (apiKey || ZHIPU.key) {
      try {
        const out = await callZhipu(messages, opts, apiKey);
        out.fallbackFrom = ['modelscope'];
        out.primaryError = msErr.message;
        return out;
      } catch (_) { /* 落到下面抛魔搭错误 */ }
    }
    throw msErr;
  }
}

function status() {
  return {
    modelscope: { configured: !!MODELSCOPE.token, chain: MODELSCOPE.chain, primary: MODELSCOPE.chain[0] },
    zhipu: { configured: !!ZHIPU.key, model: ZHIPU.model, note: '可在设置中填写 API Key（BYOK）' },
  };
}

module.exports = { generate, status, MODELSCOPE, ZHIPU };
