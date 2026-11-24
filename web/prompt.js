/* ============================================================
 * 素手归原 · Prompt 引擎（前后端共用 UMD）
 *  1) 组装 system prompt：硬规范（不玄学/不医疗承诺/人群温和）
 *  2) 注入 RAG 检索到的知识片段（柔和融入，不生硬堆砌）
 *  3) user prompt：生成 4-5 个选题 + 1 篇完整成品
 * ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.LEIYIN_PROMPT = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const OPTS = typeof require === 'function'
    ? require('./options')
    : (typeof globalThis !== 'undefined' ? globalThis : self).LEIYIN_OPTIONS;
  const KB = typeof require === 'function'
    ? require('./knowledge')
    : (typeof globalThis !== 'undefined' ? globalThis : self).LEIYIN_KB;

  /** 硬创作规范（用户专属调性）——无论谁生成都必须守 */
  const HARD_RULES = [
    '不迷信、不忽悠、不玄学神化：禁止"包治/根治/治愈率/一次见效/aptitude 改变命运"等表述。',
    '经络与拍打原理，一律贴合《黄帝内经》正统中医逻辑：讲"气血、经络、阴阳、脏腑"的规律，不讲玄乎概念。',
    '所有拍打内容必须带安全底线：出痧不可强求、孕妇/出血倾向/严重慢病/皮肤破损等禁忌须提醒，儿童老人手法轻柔。',
    '心性内容：尊重命运、顺应规律、修心养身；给"场景与感受"，不给"命定判决"。',
    '儿童、女性、老人相关内容：温和、正向、治愈、利他；不制造焦虑、不恐吓。',
    '全部输出必须生活化：像和朋友聊天，适合朋友圈/小红书/视频号日更，不用学术论文腔。',
    '总调性：禅为根、拍为用、生活为体、国学为魂。',
  ].join('\n');

  /** 各内容类型的格式要求 */
  const FORMAT_RULES = {
    xhs: '小红书图文：①吸睛标题（可带1-2个emoji）②生活化开头钩子 ③正文分点讲清一个道理+一个可做的事 ④结尾温柔互动 ⑤5-8个相关标签（#禅拍 #养生 等）。',
    sph: '视频号短文案：开头3秒钩子（一句戳中痛点）→ 主体讲一个知识点 → 结尾一句温柔引导。短句为主，口语化。',
    voiceover: '口播解说稿：可直接朗读，用短句；在需要停顿处标注「（停顿）」；数字与经络名写全，便于念读；开头打招呼+痛点，结尾留一句余味。',
    poster: '海报短句：主标题（大字，8字内）+ 副标题（一句补充）+ 一句点睛金句。整体不超过50字，留白感强。',
    poem: '禅意诗词：古风绝句或现代禅诗任选，意境留白，讲静定/放下/顺应/身心，避免口号与说教。',
    script: '拍摄脚本：按镜头分段，每段写清【景别/画面】【台词/字幕】【节奏提示】，共4-6个镜头，总时长约30-60秒。',
    live: [
      '直播分享主题：①直播标题（12字内、有钩子、生活化，不夸大）②本场分享的3个核心要点（每点一句大白话+一个观众今天就能做的小动作）',
      '③开场破冰话术（2-3句，像跟老朋友打招呼，先说大家熟悉的困扰）④2-3个互动提问（开放式，引导观众留言，不诱导转发）',
      '⑤收尾话术（温柔总结+下次主题预告，不硬推销、不做疗效承诺）。整体口语化，可直接照着讲。',
    ].join(''),
  };

  /** buildSystemPrompt */
  function buildSystemPrompt(ctx) {
    const {
      style, styleCustom, audience, audienceCustom,
      contentType, lengthText, cultures, topic, customNotes, mode,
    } = ctx;
    const step = mode === 'topics' || mode === 'article' ? mode : 'both';

    const styleLine = styleCustom && styleCustom.trim() ? styleCustom.trim() : style;
    const audLine = audienceCustom && audienceCustom.trim() ? audienceCustom.trim() : audience;
    const ctype = OPTS.CONTENT_TYPES.find((x) => x.key === contentType);
    const formatRule = (ctype && FORMAT_RULES[ctype.key]) || FORMAT_RULES.xhs;

    const cultureNames = (cultures || [])
      .map((k) => { const c = OPTS.CULTURES.find((x) => x.key === k); return c ? c.label : null; })
      .filter(Boolean);

    const snippets = KB.retrieve(cultures, topic + ' ' + (customNotes || ''), 2, OPTS);
    let kbBlock = '';
    if (snippets.length) {
      kbBlock = '\n\n【本条内容可引用的知识素材（务必自然融入，不要照抄原文、不要标注来源名）】\n'
        + snippets.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
    }

    return [
      '你是一位深耕《黄帝内经》与素手归原的资深内容主理人，文笔温柔、通透、生活化。',
      '你的任务是为「素手归原·身心自愈」品牌创作可直接发布的内容。',
      '',
      '【硬性创作规范 · 必须遵守】',
      HARD_RULES,
      '',
      '【本条创作参数】',
      `- 内容类型：${ctype ? ctype.label : contentType}\n${formatRule}`,
      `- 文风：${styleLine}。句子短，语气平实，有温度，不端着。`,
      `- 目标读者：${audLine}。用对方听得进、有共鸣的话。`,
      `- 篇幅：${lengthText}。`,
      `- 文化融合方向：${cultureNames.length ? cultureNames.join('、') : '禅拍与养生基调'}。`,
      '',
      '【柔和融合原则】',
      '把上面的知识素材化成生活里的道理和感受：先讲一个读者熟悉的场景/困扰，再带出经络气血或心性的规律，最后落到一件今天就能做的小事。',
      '国学内容点到为止，用现代白话讲透，不掉书袋、不堆砌古文。',
      kbBlock,
      '',
      customNotes && customNotes.trim() ? `【用户补充要求】\n${customNotes.trim()}` : '',
      '',
      step === 'topics' ? [
        '【本步任务 · 只做选题】',
        '只输出 5 个不同角度的原创选题，每行一个，格式严格为：`1. 标题 —— 一句话说明切入点`。',
        '只输出编号列表本身：不要"## 选题"标题、不要成品正文、不要任何解释或开场白。',
        '5 个角度要真正不同（如：场景痛点 / 一个具体动作 / 情绪共鸣 / 反常识 / 人群专属）。',
      ].join('\n') : step === 'article' ? [
        '【本步任务 · 只写成文】',
        '只为下面指定的这一个选题写一篇完整成品，严格按上面「内容类型」的格式要求写。',
        '直接输出正文：不要"## 成品"标题、不要重复选题列表、不要写"以下是文案"之类的说明。',
      ].join('\n') : [
        '【输出格式 · 严格遵守】',
        '先输出「## 选题」，给出 5 个不同角度的原创标题选题，每行一个，格式：`1. 标题 —— 一句话说明切入点`。',
        '然后输出「## 成品」，完整写出选定主题的成品文案（就是上面内容类型要求的格式）。',
        '成品只输出正文，不要在正文里再写"以下是文案"之类的说明。',
      ].join('\n'),
    ].filter(Boolean).join('\n');
  }

  /** buildUserPrompt */
  function buildUserPrompt(ctx) {
    const bits = [`创作主题：${ctx.topic}`];
    if (ctx.topicCustom && ctx.topicCustom.trim()) bits.push(`补充/自定义话题：${ctx.topicCustom.trim()}`);
    if (ctx.cultureCustom && ctx.cultureCustom.trim()) bits.push(`自定义文化维度：${ctx.cultureCustom.trim()}`);
    if (ctx.mode === 'topics') {
      bits.push('请严格按本步任务，只输出 5 个选题，每行一条，不要写成品。');
    } else if (ctx.mode === 'article') {
      bits.push('已选定的选题：' + (ctx.selectedTopic || ctx.topic));
      bits.push('请严格按本步任务，只为这一个选题写一篇完整成品，不要输出选题列表。');
    } else {
      bits.push('请按系统提示的格式，给出 5 个选题和一篇完整成品。');
    }
    return bits.join('\n');
  }

  return { HARD_RULES, FORMAT_RULES, buildSystemPrompt, buildUserPrompt };
});
