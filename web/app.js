/* ============================================================
 * 工作台前端逻辑
 * ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = window.LEIYIN_ENGINE;
  let OPTS = null, LIBS = null, SELECTED_CULTURES = [], SELECTED_LENGTH = 'l';
  let LAST_RESULT = null;
  let SELECTED_TOPIC = null, CURRENT_TOPICS = [], PHASE = 'idle';

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

    // 文化 chips
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

    // 字数 seg
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

    // 默认勾选
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

    // 自定义输入显隐
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

  async function doGenerate(mode, selectedTopic) {
    mode = mode || 'topics';
    const btn = mode === 'topics' ? $('generate-btn') : $('write-article-btn');
    btn.disabled = true;
    $('error-box').classList.add('hidden');
    $('empty-state').classList.add('hidden');
    $('result').classList.add('hidden');
    $('loading').classList.remove('hidden');
    $('loading-text').textContent = mode === 'topics' ? '正在酝酿 5 个选题…' : '正在为选定选题写完整文章…';

    const ticker = setInterval(() => {
      const msgs = mode === 'topics'
        ? ['正在调取知识库…', '寻找不同切入角度…', '让 5 个选题各有侧重…', '即将落笔，请稍候…']
        : ['正在调取知识库…', '经络与心性正在融合…', '把道理化成生活的话…', '即将落笔，请稍候…'];
      const cur = $('loading-text').textContent;
      const i = msgs.indexOf(cur);
      $('loading-text').textContent = msgs[(i + 1) % msgs.length];
    }, 3500);

    try {
      const payload = collectPayload();
      payload.mode = mode;
      if (selectedTopic) payload.selectedTopic = selectedTopic;
      const res = await E.generate(payload);
      LAST_RESULT = res;
      renderResult(res, mode);
    } catch (e) {
      if (e.code === 'ACCESS_CODE_REQUIRED') { showAccessGate(); clearInterval(ticker); $('loading').classList.add('hidden'); btn.disabled = false; return; }
      const box = $('error-box');
      let html = `<strong>生成失败</strong>：${escapeHTML(e.message || '未知错误')}`;
      if (e.userAction) html += `<br><br>建议：${escapeHTML(e.userAction)}`;
      if (e.attempts && e.attempts.length) {
        html += '<br><br>尝试记录：' + e.attempts.map((a) => `${a.model} → ${a.error || a.status}`).join('；');
      }
      box.innerHTML = html;
      box.classList.remove('hidden');
      $('empty-state').classList.remove('hidden');
    } finally {
      clearInterval(ticker);
      $('loading').classList.add('hidden');
      btn.disabled = false;
      if (mode === 'article' && SELECTED_TOPIC) $('write-article-btn').disabled = false;
    }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatDraft(text) {
    return text
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  function parseResult(raw) {
    let topics = [], draft = raw.trim();
    const m = raw.match(/(?:^|\n)\s*#{0,3}\s*选题[^\n]*\n([\s\S]*?)(?:\n\s*#{0,3}\s*成品|$)/);
    if (m) {
      topics = m[1].split('\n').map((l) => l.trim()).filter((l) => /^\d+[.、)]/.test(l));
      const d = raw.match(/(?:^|\n)\s*#{0,3}\s*成品[^\n]*\n([\s\S]*)$/);
      if (d) draft = d[1].trim();
    }
    if (!topics.length) {
      topics = raw.split('\n').map((l) => l.trim()).filter((l) => /^\d+[.、)]/.test(l)).slice(0, 5);
    }
    return { topics, draft };
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

  function renderTopicCards() {
    $('topics').innerHTML = CURRENT_TOPICS.length
      ? CURRENT_TOPICS.map((t, i) => {
          const mm = t.match(/^(.*?)(?:\s*[—–-]{1,2}\s*(.*))?$/);
          return `<div class="topic-card${SELECTED_TOPIC === t ? ' selected' : ''}" data-topic="${escapeHTML(t)}">
            <div class="topic-num">${['一','二','三','四','五'][i] || (i + 1)}</div>
            <div class="topic-body"><strong>${escapeHTML(mm ? mm[1] : t)}</strong>${mm && mm[2] ? `<span>${escapeHTML(mm[2])}</span>` : ''}</div>
            <div class="topic-check">✓</div>
          </div>`;
        }).join('')
      : '<div class="topic-card"><div class="topic-body"><span>本次未解析出选题，请点「换一组选题」重试。</span></div></div>';
    $('topics').querySelectorAll('.topic-card[data-topic]').forEach((el) => {
      el.addEventListener('click', () => {
        SELECTED_TOPIC = el.dataset.topic;
        renderTopicCards();
        const btn = $('write-article-btn');
        btn.disabled = false;
        const short = SELECTED_TOPIC.split(/[—–-]/)[0].trim().slice(0, 16);
        btn.textContent = '✎ 生成《' + short + '》完整文章';
      });
    });
  }

  function resetFlow() {
    PHASE = 'idle'; SELECTED_TOPIC = null; CURRENT_TOPICS = []; LAST_RESULT = null;
    $('result').classList.add('hidden');
    $('empty-state').classList.remove('hidden');
    $('error-box').classList.add('hidden');
    $('topics').innerHTML = '';
    $('draft').innerHTML = '';
  }

  function renderResult(res, mode) {
    const raw = String(res.content || '').trim();
    const meta = [];
    if (res.engine) meta.push(`引擎 · ${res.engine}`);
    if (res.model) meta.push(`模型 · ${res.model}`);
    if (res.fallbackFrom) meta.push(`已从 ${[].concat(res.fallbackFrom).join(' → ')} 回退`);
    if (res.tokens) meta.push(`${res.tokens} tokens`);
    if (res.ms) meta.push(`${(res.ms / 1000).toFixed(1)}s`);
    if (res.retrieved && res.retrieved.length) meta.push(`知识片段 · ${res.retrieved.length} 条`);
    $('result-meta').innerHTML = meta.map((x) => `<span class="meta-tag">${escapeHTML(x)}</span>`).join('');
    $('copy-all').classList.add('hidden');
    $('download-btn').classList.add('hidden');

    if (mode === 'topics') {
      PHASE = 'topics';
      SELECTED_TOPIC = null;
      CURRENT_TOPICS = parseTopics(raw);
      renderTopicCards();
      $('topics-count').textContent = CURRENT_TOPICS.length ? `${CURRENT_TOPICS.length} 个` : '';
      $('topic-actions').classList.remove('hidden');
      $('write-article-btn').disabled = true;
      $('write-article-btn').textContent = '✎ 请先点击选中一个选题';
      $('draft').innerHTML = '';
      $('draft-words').textContent = '';
      $('ctype-label').textContent = '';
      $('draft-placeholder').classList.remove('hidden');
    } else {
      PHASE = 'article';
      $('draft').innerHTML = formatDraft(escapeHTML(raw));
      $('draft-words').textContent = `${raw.replace(/\s/g, '').length} 字`;
      $('draft-placeholder').classList.add('hidden');
      const ct = OPTS.CONTENT_TYPES.find((x) => x.key === collectPayload().contentType);
      $('ctype-label').textContent = ct ? ct.label : '';
      $('copy-all').classList.remove('hidden');
      $('download-btn').classList.remove('hidden');
    }
    $('result').classList.remove('hidden');
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      // 用新口令重新拉取选项验证
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
    $('generate-btn').addEventListener('click', () => { resetFlow(); doGenerate('topics'); });
    $('write-article-btn').addEventListener('click', () => {
      if (!SELECTED_TOPIC) return;
      doGenerate('article', SELECTED_TOPIC);
    });
    $('regen-topics').addEventListener('click', () => { resetFlow(); doGenerate('topics'); });
    $('copy-draft').addEventListener('click', () => {
      copyText(LAST_RESULT.content);
      $('copy-draft').textContent = '✓ 已复制';
      setTimeout(() => ($('copy-draft').textContent = '⧉ 复制成品'), 1500);
    });
    $('copy-all').addEventListener('click', () => copyText(LAST_RESULT.content));
    $('download-btn').addEventListener('click', () => {
      const blob = new Blob([LAST_RESULT.content], { type: 'text/markdown;charset=utf-8' });
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

    // 任何创作参数变化都重置两步流程
    const panel = document.querySelector('.control-panel');
    if (panel) {
      panel.addEventListener('change', resetFlow);
      panel.addEventListener('input', resetFlow);
    }
    $('cultures').addEventListener('click', resetFlow);
    $('lengths').addEventListener('click', resetFlow);
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
