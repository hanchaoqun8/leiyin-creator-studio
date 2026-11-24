/* ============================================================
 * 工作台前端逻辑 · 五组灵感多选 / 逐条生成
 * ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = window.LEIYIN_ENGINE;
  let OPTS = null, LIBS = null, SELECTED_CULTURES = [], SELECTED_LENGTH = 'l';
  let LAST_RESULT = null, ARTICLES = [];
  let SELECTED_TOPICS = [], CURRENT_TOPICS = [], PHASE = 'idle';
  let GENERATING = false, STOP_REQUESTED = false, BOUND = false;

  function optionsHTML(items, placeholder) {
    return (placeholder ? `<option value="">${placeholder}</option>` : '') +
      items.map((x) => `<option value="${typeof x === 'string' ? x : x.key}">${typeof x === 'string' ? x : x.label}</option>`).join('');
  }

  function topicOptionsHTML() {
    return OPTS.TOPICS.map((g) => {
      const opt = g.items.map((t) => `<option value="${t}">${t}</option>`).join('');
      return `<optgroup label="${g.icon} ${g.group}">${opt}</optgroup>`;
    }).join('') + '<option value="__custom__">✎ 自定义话题…</option>';
  }

  function renderControls() {
    $('topic').innerHTML = topicOptionsHTML();
    $('content-type').innerHTML = optionsHTML(OPTS.CONTENT_TYPES);
    $('style').innerHTML = optionsHTML(OPTS.STYLES) + '<option value="__custom__">✎ 自定义风格…</option>';
    $('audience').innerHTML = optionsHTML(OPTS.AUDIENCES) + '<option value="__custom__">✎ 自定义受众…</option>';

    $('cultures').innerHTML = OPTS.CULTURES.map((c) =>
      `<div class="chip" data-key="${c.key}" title="${c.hint}"><span class="cb"></span><span>${c.label}</span></div>`
    ).join('');
    $('cultures').querySelectorAll('.chip').forEach((el) => {
      el.addEventListener('click', () => {
        const k = el.dataset.key;
        if (SELECTED_CULTURES.includes(k)) SELECTED_CULTURES = SELECTED_CULTURES.filter((x) => x !== k);
        else SELECTED_CULTURES.push(k);
        el.classList.toggle('active');
        updateKbStatus();
      });
    });

    $('lengths').innerHTML = OPTS.LENGTHS.map((l) =>
      `<div class="seg-btn${l.key === SELECTED_LENGTH ? ' active' : ''}" data-key="${l.key}">${l.label}</div>`
    ).join('') + '<div class="seg-btn" data-key="custom">✎ 自定义</div>';
    $('lengths').querySelectorAll('.seg-btn').forEach((el) => {
      el.addEventListener('click', () => {
        SELECTED_LENGTH = el.dataset.key;
        $('lengths').querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === el));
        $('length-custom-row').classList.toggle('hidden', SELECTED_LENGTH !== 'custom');
      });
    });

    const d = OPTS.defaults;
    $('topic').value = d.topic;
    $('content-type').value = d.contentType;
    $('style').value = d.style;
    $('audience').value = d.audience;
    (d.cultures || []).forEach((k) => {
      const el = $('cultures').querySelector(`.chip[data-key="${k}"]`);
      if (el) { el.classList.add('active'); SELECTED_CULTURES.push(k); }
    });
    updateKbStatus();

    bindCustom('topic', 'topic-custom-row');
    bindCustom('style', 'style-custom-row');
    bindCustom('audience', 'audience-custom-row');
  }

  function bindCustom(selectId, rowId) {
    const sel = $(selectId);
    const toggle = () => $(rowId).classList.toggle('hidden', sel.value !== '__custom__');
    sel.addEventListener('change', toggle);
    toggle();
  }

  function updateKbStatus() {
    const libs = new Set();
    SELECTED_CULTURES.forEach((k) => {
      const c = OPTS.CULTURES.find((x) => x.key === k);
      if (c) (c.kb || []).forEach((l) => libs.add(l));
    });
    if (!libs.size) { libs.add('meridian'); libs.add('leiyin'); }
    $('kb-count').textContent = `已挂载 ${libs.size} 个知识库 · ${SELECTED_CULTURES.length} 个文化维度`;
    $('kb-status').title = [...libs].map((k) => (LIBS || []).find((l) => l.key === k)?.label || k).join(' / ');
  }

  async function renderEngineStatus() {
    try {
      const s = await E.status();
      const eng = $('engine');
      const opts = (s.availableEngines || ['auto']).map((k) => {
        const found = OPTS.ENGINES.find((x) => x.key === k);
        return { key: k, label: found ? found.label : k };
      });
      eng.innerHTML = optionsHTML(opts);
      if ((s.availableEngines || []).includes('auto')) eng.value = 'auto';
      else if ((s.availableEngines || []).includes('cloud')) eng.value = 'cloud';

      const standaloneMode = !!(window.LEIYIN_ENGINE && window.LEIYIN_ENGINE.getAccessCode);
      $('engine-badge').textContent = standaloneMode
        ? '☁ 独立云端 · 令牌已内置'
        : (!!(window.LEIYIN_CLOUD_CONFIG && window.LEIYIN_CLOUD_CONFIG.byokOnly)
        ? '☁ 云端版 · 自带密钥' : (s.mode === 'cloud' ? '☁ 云端免密钥引擎'
        : (s.engines?.modelscope?.configured ? '◉ 魔搭引擎就绪' : '⚠ 引擎待配置')));
      eng.addEventListener('change', updateZhipuKeyRow);
      updateZhipuKeyRow();

      const savedKey = localStorage.getItem('leiyin_zhipu_key') || '';
      $('zhipu-key').value = savedKey;
      $('settings-zhipu').value = savedKey;
      $('engine-status').textContent = JSON.stringify(s, null, 2);
      $('kb-list').innerHTML = (LIBS || []).map((l) =>
        `<div class="kb-item"><span>${l.label}</span><span>${l.count} 条</span></div>`).join('');
    } catch (e) {
      $('engine-badge').textContent = '⚠ ' + e.message;
      $('engine-status').textContent = '引擎检测失败：' + e.message;
    }
  }

  function updateZhipuKeyRow() {
    const v = $('engine').value;
    const standaloneMode = !!(window.LEIYIN_ENGINE && window.LEIYIN_ENGINE.getAccessCode);
    const need = !standaloneMode && (v === 'zhipu' || v === 'modelscope');
    $('zhipu-key-row').classList.toggle('hidden', !need);
    if (need) {
      $('zhipu-key').placeholder = v === 'zhipu'
        ? '智谱 API Key（仅存于本浏览器）'
        : '魔搭令牌 ms-...（仅存于本浏览器）';
    }
  }

  function collectPayload() {
    const topicVal = $('topic').value;
    return {
      topic: topicVal === '__custom__' ? '' : topicVal,
      topicCustom: topicVal === '__custom__' ? $('topic-custom').value : $('topic-custom').value,
      cultures: SELECTED_CULTURES,
      cultureCustom: $('culture-custom').value,
      contentType: $('content-type').value,
      style: $('style').value === '__custom__' ? '' : $('style').value,
      styleCustom: $('style').value === '__custom__' ? $('style-custom').value : $('style-custom').value,
      audience: $('audience').value === '__custom__' ? '' : $('audience').value,
      audienceCustom: $('audience').value === '__custom__' ? $('audience-custom').value : $('audience-custom').value,
      length: SELECTED_LENGTH,
      lengthCustom: $('length-custom').value,
      customNotes: $('notes').value,
      engine: $('engine').value,
      apiKey: ($('engine').value === 'zhipu' || $('engine').value === 'modelscope')
        ? $('zhipu-key').value.trim() : undefined,
    };
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function topicShort(t) {
    return String(t || '').split(/[—–-]/)[0].trim().slice(0, 20) || '未命名选题';
  }

  function formatDraft(text) {
    return text
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  function parseTopics(raw) {
    const text = String(raw || '').trim();
    const m = text.match(/(?:^|\n)\s*#{0,3}\s*选题[^\n]*\n([\s\S]*)/);
    const body = m ? m[1] : text;
    return body.split('\n')
      .map((l) => l.trim().replace(/^[-*]\s*/, ''))
      .filter((l) => /^\d+[.、)]/.test(l))
      .map((l) => l.replace(/^\d+[.、)]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  function startLoading(text, msgs) {
    $('loading-text').textContent = text;
    $('loading').classList.remove('hidden');
    const ticker = setInterval(() => {
      const cur = $('loading-text').textContent;
      const i = msgs.indexOf(cur);
      $('loading-text').textContent = msgs[(i + 1) % msgs.length];
    }, 3500);
    return ticker;
  }

  function showError(e) {
    const box = $('error-box');
    let html = `<strong>生成失败</strong>：${escapeHTML(e.message || '未知错误')}`;
    if (e.userAction) html += `<br><br>建议：${escapeHTML(e.userAction)}`;
    if (e.attempts && e.attempts.length) {
      html += '<br><br>尝试记录：' + e.attempts.map((a) => `${a.model} → ${a.error || a.status}`).join('；');
    }
    box.innerHTML = html;
    box.classList.remove('hidden');
  }

  // ---------- 第一步：生成 5 组灵感 ----------
  async function doGenerateTopics() {
    if (GENERATING) return;
    resetFlow();
    const btn = $('generate-btn');
    btn.disabled = true;
    $('error-box').classList.add('hidden');
    $('empty-state').classList.add('hidden');
    const ticker = startLoading('正在酝酿 5 组灵感…',
      ['正在调取知识库…', '寻找不同切入角度…', '让 5 组灵感各有侧重…', '即将落笔，请稍候…']);
    try {
      const payload = collectPayload();
      payload.mode = 'topics';
      const res = await E.generate(payload);
      LAST_RESULT = res;
      renderTopics(res);
    } catch (e) {
      if (e.code === 'ACCESS_CODE_REQUIRED' && typeof showAccessGate === 'function') { showAccessGate(); return; }
      showError(e);
      $('empty-state').classList.remove('hidden');
    } finally {
      clearInterval(ticker);
      $('loading').classList.add('hidden');
      btn.disabled = false;
    }
  }

  function renderTopics(res) {
    const raw = String(res.content || '').trim();
    const meta = [];
    if (res.engine) meta.push(`引擎 · ${res.engine}`);
    if (res.model) meta.push(`模型 · ${res.model}`);
    if (res.fallbackFrom) meta.push(`已从 ${[].concat(res.fallbackFrom).join(' → ')} 回退`);
    if (res.ms) meta.push(`${(res.ms / 1000).toFixed(1)}s`);
    $('result-meta').innerHTML = meta.map((x) => `<span class="meta-tag">${escapeHTML(x)}</span>`).join('');

    PHASE = 'topics';
    SELECTED_TOPICS = [];
    CURRENT_TOPICS = parseTopics(raw);
    renderTopicCards();
    $('topics-count').textContent = CURRENT_TOPICS.length ? `${CURRENT_TOPICS.length} 组 · 可多选` : '';
    $('topic-actions').classList.remove('hidden');
    $('draft-placeholder').classList.remove('hidden');
    $('draft-placeholder').textContent = '↑ 勾选上方灵感（可多选），再点「逐条生成」；每写完一篇就显示一篇';
    $('draft-list').innerHTML = '';
    $('draft-words').textContent = '';
    $('ctype-label').textContent = '';
    $('copy-all').classList.add('hidden');
    $('download-btn').classList.add('hidden');
    $('result').classList.remove('hidden');
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderTopicCards() {
    $('topics').innerHTML = CURRENT_TOPICS.length
      ? CURRENT_TOPICS.map((t, i) => {
          const mm = t.match(/^(.*?)(?:\s*[—–-]{1,2}\s*(.*))?$/);
          const picked = SELECTED_TOPICS.indexOf(t) >= 0;
          return `<div class="topic-card${picked ? ' selected' : ''}" data-topic="${escapeHTML(t)}">
            <div class="topic-num">${['一','二','三','四','五'][i] || (i + 1)}</div>
            <div class="topic-body"><strong>${escapeHTML(mm ? mm[1] : t)}</strong>${mm && mm[2] ? `<span>${escapeHTML(mm[2])}</span>` : ''}</div>
            <div class="topic-check">✓</div>
          </div>`;
        }).join('')
      : '<div class="topic-card"><div class="topic-body"><span>本次未解析出灵感，请点「换一组灵感」重试。</span></div></div>';
    $('topics').querySelectorAll('.topic-card[data-topic]').forEach((el) => {
      el.addEventListener('click', () => {
        const t = el.dataset.topic;
        const i = SELECTED_TOPICS.indexOf(t);
        if (i >= 0) SELECTED_TOPICS.splice(i, 1);
        else SELECTED_TOPICS.push(t);
        renderTopicCards();
        updateWriteButton();
      });
    });
    updateWriteButton();
  }

  function updateWriteButton() {
    const btn = $('write-article-btn');
    if (!btn) return;
    const n = SELECTED_TOPICS.length;
    btn.disabled = n === 0 || GENERATING;
    btn.textContent = n ? `✎ 逐条生成 ${n} 篇完整文章` : '✎ 请先勾选灵感（可多选）';
    $('select-all').textContent = (CURRENT_TOPICS.length && n === CURRENT_TOPICS.length) ? '☐ 取消全选' : '☑ 全选';
    $('clear-selection').disabled = n === 0;
  }

  // ---------- 第二步：逐条生成文章 ----------
  function appendArticleCard(index, topic, total) {
    const id = 'art-' + index;
    const card = document.createElement('div');
    card.className = 'article-card writing';
    card.id = id;
    card.innerHTML = `
      <div class="article-head">
        <span class="article-index">${String(index + 1).padStart(2, '0')}</span>
        <strong class="article-title">${escapeHTML(topicShort(topic))}</strong>
        <span class="article-status" id="${id}-status">生成中…</span>
        <button class="text-btn" data-copy-article="${index}" title="复制本文">⧉ 复制本文</button>
      </div>
      <div class="article-body" id="${id}-body"><div class="article-wait">正在调取知识库，逐条落笔…</div></div>`;
    $('draft-list').appendChild(card);
    return card;
  }

  function fillArticle(index, content, res) {
    const body = $('art-' + index + '-body');
    const status = $('art-' + index + '-status');
    const card = $('art-' + index);
    if (!body) return;
    const raw = String(content || '').trim();
    body.innerHTML = formatDraft(escapeHTML(raw));
    card.classList.remove('writing');
    const bits = [`${raw.replace(/\s/g, '').length} 字`];
    if (res && res.model) bits.push(res.model);
    if (res && res.ms) bits.push(`${(res.ms / 1000).toFixed(1)}s`);
    status.textContent = bits.join(' · ');
  }

  function failArticle(index, err) {
    const body = $('art-' + index + '-body');
    const status = $('art-' + index + '-status');
    const card = $('art-' + index);
    if (!body) return;
    let msg = escapeHTML(err && err.message ? err.message : '未知错误');
    if (err && err.userAction) msg += `<br>建议：${escapeHTML(err.userAction)}`;
    body.innerHTML = `<div class="article-fail">本篇生成失败：${msg}<br><span>其他灵感会继续生成，不受影响。</span></div>`;
    status.textContent = '失败';
    card.classList.remove('writing');
    card.classList.add('failed');
  }

  function updateArticleToolbar() {
    const n = ARTICLES.length;
    $('draft-words').textContent = n ? `共 ${n} 篇 · ${ARTICLES.reduce((s, a) => s + a.content.replace(/\s/g, '').length, 0)} 字` : '';
    $('copy-all').classList.toggle('hidden', n === 0);
    $('download-btn').classList.toggle('hidden', n === 0);
    $('copy-draft').classList.toggle('hidden', n === 0);
  }

  function allArticlesText() {
    return ARTICLES.map((a, i) => `# 第 ${i + 1} 篇：${a.topic}\n\n${a.content}`).join('\n\n---\n\n');
  }

  async function generateArticles() {
    if (GENERATING || !SELECTED_TOPICS.length) return;
    GENERATING = true;
    STOP_REQUESTED = false;
    const btn = $('write-article-btn');
    btn.disabled = true;
    $('error-box').classList.add('hidden');
    $('result').classList.remove('hidden');
    $('empty-state').classList.add('hidden');
    $('draft-placeholder').classList.add('hidden');
    $('stop-gen').classList.remove('hidden');

    // 按灵感原始顺序逐条生成，不按点击顺序
    const queue = CURRENT_TOPICS.filter((t) => SELECTED_TOPICS.indexOf(t) >= 0);
    for (let i = 0; i < queue.length; i++) {
      if (STOP_REQUESTED) break;
      const topic = queue[i];
      appendArticleCard(i, topic, queue.length);
      const ticker = startLoading(
        `正在写第 ${i + 1}/${queue.length} 篇：${topicShort(topic)}…`,
        ['正在调取知识库…', '经络与心性正在融合…', '把道理化成生活的话…', '即将落笔，请稍候…']
      );
      try {
        const payload = collectPayload();
        payload.mode = 'article';
        payload.selectedTopic = topic;
        const res = await E.generate(payload);
        LAST_RESULT = res;
        ARTICLES.push({ topic, content: String(res.content || '').trim(), res });
        fillArticle(i, res.content, res);
        updateArticleToolbar();
      } catch (e) {
        if (e.code === 'ACCESS_CODE_REQUIRED' && typeof showAccessGate === 'function') {
          clearInterval(ticker);
          showAccessGate();
          break;
        }
        failArticle(i, e);
      } finally {
        clearInterval(ticker);
      }
    }
    $('loading').classList.add('hidden');
    $('stop-gen').classList.add('hidden');
    GENERATING = false;
    STOP_REQUESTED = false;
    updateWriteButton();
    const ct = OPTS.CONTENT_TYPES.find((x) => x.key === collectPayload().contentType);
    $('ctype-label').textContent = ct ? `${ct.label} · ${ARTICLES.length} 篇` : `${ARTICLES.length} 篇`;
    $('draft-list').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetFlow() {
    if (GENERATING) STOP_REQUESTED = true;
    PHASE = 'idle'; SELECTED_TOPICS = []; CURRENT_TOPICS = [];
    LAST_RESULT = null; ARTICLES = [];
    $('result').classList.add('hidden');
    $('empty-state').classList.remove('hidden');
    $('error-box').classList.add('hidden');
    $('topics').innerHTML = '';
    $('draft-list').innerHTML = '';
    $('topic-actions').classList.add('hidden');
    $('draft-placeholder').classList.remove('hidden');
    $('draft-placeholder').textContent = '↑ 请先在上方点击「生成 5 组灵感」';
    $('topics-count').textContent = '';
    $('draft-words').textContent = '';
    $('ctype-label').textContent = '';
    $('stop-gen').classList.add('hidden');
    updateWriteButton();
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
  }

  function showAccessGate() {
    $('access-overlay').classList.remove('hidden');
    $('access-input').value = E.getAccessCode ? E.getAccessCode() : '';
    setTimeout(() => $('access-input').focus(), 50);
  }

  async function submitAccessCode() {
    const v = $('access-input').value.trim();
    if (!v) return;
    if (E.setAccessCode) E.setAccessCode(v);
    $('access-error').classList.add('hidden');
    try {
      const r = await E.getOptions();
      OPTS = r.options; LIBS = r.libraries;
      renderControls(); bindEvents(); await renderEngineStatus();
      $('access-overlay').classList.add('hidden');
    } catch (e) {
      E.setAccessCode('');
      $('access-error').classList.remove('hidden');
      $('access-input').select();
    }
  }

  function bindEvents() {
    if (BOUND) return;
    BOUND = true;
    const apkBtn = $('apk-btn');
    if (apkBtn && location.search) apkBtn.href += location.search;
    $('generate-btn').addEventListener('click', doGenerateTopics);
    $('write-article-btn').addEventListener('click', generateArticles);
    $('regen-topics').addEventListener('click', doGenerateTopics);
    $('select-all').addEventListener('click', () => {
      SELECTED_TOPICS = (CURRENT_TOPICS.length && SELECTED_TOPICS.length === CURRENT_TOPICS.length) ? [] : CURRENT_TOPICS.slice();
      renderTopicCards();
    });
    $('clear-selection').addEventListener('click', () => {
      SELECTED_TOPICS = [];
      renderTopicCards();
    });
    $('stop-gen').addEventListener('click', () => {
      STOP_REQUESTED = true;
      $('stop-gen').disabled = true;
      $('loading-text').textContent = '正在停止…当前这篇写完后即中止';
    });
    $('draft-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-copy-article]');
      if (!b) return;
      const a = ARTICLES[Number(b.dataset.copyArticle)];
      if (!a) return;
      copyText(a.content);
      b.textContent = '✓ 已复制';
      setTimeout(() => (b.textContent = '⧉ 复制本文'), 1500);
    });
    $('copy-draft').addEventListener('click', () => {
      copyText(allArticlesText() || (LAST_RESULT ? LAST_RESULT.content : ''));
      $('copy-draft').textContent = '✓ 已复制';
      setTimeout(() => ($('copy-draft').textContent = '⧉ 复制全部文章'), 1500);
    });
    $('copy-all').addEventListener('click', () => copyText(allArticlesText()));
    $('download-btn').addEventListener('click', () => {
      const blob = new Blob([allArticlesText()], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `素手归原_${new Date().toISOString().slice(0, 10)}.md`;
      a.click(); URL.revokeObjectURL(a.href);
    });

    $('settings-btn').addEventListener('click', () => $('settings-overlay').classList.remove('hidden'));
    $('settings-close').addEventListener('click', () => $('settings-overlay').classList.add('hidden'));
    $('settings-overlay').addEventListener('click', (e) => {
      if (e.target === $('settings-overlay')) $('settings-overlay').classList.add('hidden');
    });
    $('save-zhipu').addEventListener('click', () => {
      const v = $('settings-zhipu').value.trim();
      if (v) localStorage.setItem('leiyin_zhipu_key', v);
      else localStorage.removeItem('leiyin_zhipu_key');
      $('zhipu-key').value = v;
      $('save-zhipu').textContent = '✓ 已保存';
      setTimeout(() => ($('save-zhipu').textContent = '保存'), 1500);
    });
    $('zhipu-key').addEventListener('change', () => {
      const v = $('zhipu-key').value.trim();
      if (v) localStorage.setItem('leiyin_zhipu_key', v);
    });

    const panel = document.querySelector('.control-panel');
    if (panel) {
      panel.addEventListener('change', resetFlow);
      panel.addEventListener('input', resetFlow);
    }
    $('cultures').addEventListener('click', resetFlow);
    $('lengths').addEventListener('click', resetFlow);
    updateWriteButton();
  }

  async function boot() {
    // 门禁按钮先绑定：首次加载会因 401 直接弹门禁，早于 bindEvents()
    $('access-submit').addEventListener('click', submitAccessCode);
    $('access-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAccessCode(); });
    try {
      const r = await E.getOptions();
      OPTS = r.options; LIBS = r.libraries;
      renderControls();
      bindEvents();
      await renderEngineStatus();
    } catch (e) {
      if (e.code === 'ACCESS_CODE_REQUIRED') { showAccessGate(); return; }
      document.body.innerHTML = `<div style="padding:40px;color:#9c4a30">加载失败：${e.message}<br>请刷新重试</div>`;
    }
  }
  boot();
})();
