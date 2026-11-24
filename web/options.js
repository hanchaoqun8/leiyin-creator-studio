/* ============================================================
 * 雷音禅拍 · 身心自愈全能创作平台
 * 共享配置：全部下拉菜单选项（支持自定义输入）
 * UMD：Node(require) / 浏览器(window.LEIYIN_OPTIONS) 双用
 * ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.LEIYIN_OPTIONS = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 主题大类：分组，每组可单选 + 自定义 */
  const TOPICS = [
    {
      group: '雷音禅拍 · 中医经络专业',
      icon: '☯',
      items: [
        '雷音禅拍基础原理（黄帝内经古法）',
        '七经八脉疏通讲解',
        '气血淤堵与身体病痛根源',
        '拍打震动唤醒身体自愈力',
        '肩颈经络疏通养护',
        '腰背经络排毒调理',
        '四肢经络畅通养生',
        '全身微循环净化',
        '禅拍排寒、排湿、排浊气',
        '拍打频率、手法、禁忌科普',
      ],
    },
    {
      group: '身心情绪 · 精神疗愈（当下刚需）',
      icon: '🌿',
      items: [
        '现代人精神焦虑、心神不宁调理',
        '情绪内耗、执念放下',
        '压力大、浮躁、失眠多梦修复',
        '肝郁气滞、情绪堵对应身体堵',
        '心神静定、向内修行',
      ],
    },
    {
      group: '生活养生维度（可单选可混搭）',
      icon: '🍵',
      items: [
        '睡眠调理、作息养气血',
        '饮食养生、脾胃养护',
        '四季顺应自然养生',
        '居家日常轻拍打养生',
        '动静结合身心平衡',
      ],
    },
    {
      group: '人群精准专题',
      icon: '👨‍👩‍👧',
      items: [
        '儿童：情绪焦虑、多动、脾胃弱、心神不安调理',
        '女性：肝郁、气血不足、宫寒、情绪敏感、内耗',
        '中老年：经络僵硬、气血衰退、失眠、体虚乏力',
      ],
    },
    {
      group: '国学悟道融合',
      icon: '📜',
      items: [
        '道德经·上善若水身心修行',
        '周易阴阳平衡、身心对应规律',
        '禅修悟道、明心见性',
        '心性决定健康、命运顺应自然',
        '家庭孝道、心境平和养元气',
      ],
    },
  ];

  /** 文化融合模块：多选，每项绑定知识库键，勾选后自动检索注入 */
  const CULTURES = [
    { key: 'neijing', label: '黄帝内经中医经络体系', hint: '十二正经 · 奇经八脉 · 气血津液', kb: ['meridian'] },
    { key: 'leiyin', label: '雷音禅拍古法自愈理论', hint: '拍打原理 · 震动 · 疏通淤堵', kb: ['leiyin'] },
    { key: 'daode', label: '道德经心性智慧', hint: '上善若水 · 无为 · 不争', kb: ['guoxue'] },
    { key: 'zhouyi', label: '周易阴阳平衡规律', hint: '阴阳 · 五行 · 天人相应', kb: ['guoxue'] },
    { key: 'chan', label: '禅修悟道静定智慧', hint: '静定 · 观照 · 破执念', kb: ['guoxue'] },
    { key: 'filial', label: '家庭孝道 · 亲子身心养护', hint: '家和 · 亲子 · 元气', kb: ['guoxue', 'family'] },
    { key: 'life', label: '生活饮食睡眠养生常识', hint: '作息 · 脾胃 · 四季', kb: ['life'] },
  ];

  /** 产出内容类型 */
  const CONTENT_TYPES = [
    { key: 'xhs', label: '小红书生活化图文文案', hint: '标题+正文+标签，口语种草感' },
    { key: 'sph', label: '视频号短视频短文案', hint: '开头钩子+主体+结尾引导' },
    { key: 'voiceover', label: '短视频口播解说稿', hint: '可直接对着读，带停顿提示' },
    { key: 'poster', label: '高清海报配图短句文案', hint: '主标题+副标题+金句' },
    { key: 'poem', label: '禅意治愈诗词创作', hint: '古风/现代禅诗，意境留白' },
    { key: 'script', label: '完整短视频拍摄脚本', hint: '镜头+画面+台词+节奏' },
  ];

  /** 文风风格 */
  const STYLES = [
    '温柔治愈生活化闲聊风',
    '专业通俗科普风',
    '禅意静心悟道风',
    '家庭暖心分享风',
    '短视频口语快节奏风',
    '高级简约文案风',
  ];

  /** 目标受众 */
  const AUDIENCES = [
    '宝妈/亲子家庭',
    '情绪内耗女性群体',
    '亚健康都市成年人',
    '中老年养生人群',
    '禅修、国学爱好者',
    '养生行业学员、客户',
  ];

  /** 字数篇幅 */
  const LENGTHS = [
    { key: 's', label: '50字短句海报', min: 40, max: 80 },
    { key: 'm', label: '200字短图文', min: 160, max: 260 },
    { key: 'l', label: '500字标准爆款文案', min: 420, max: 620 },
    { key: 'xl', label: '1000字深度科普/口播长文', min: 850, max: 1200 },
  ];

  /** 引擎（本地/云端可用项不同，前端按模式过滤） */
  const ENGINES = [
    { key: 'auto', label: '智谱/魔搭自动（推荐）', modes: ['local'] },
    { key: 'modelscope', label: '魔搭 AI', modes: ['local', 'cloud'] },
    { key: 'zhipu', label: '智谱 AI', modes: ['local', 'cloud'] },
    { key: 'cloud', label: 'WorkBuddy 云端（免密钥）', modes: ['cloud'] },
  ];

  /** 扁平化所有主题，供检索用 */
  function allTopicLabels() {
    return TOPICS.reduce((a, g) => a.concat(g.items.map((x) => ({ group: g.group, label: x }))), []);
  }

  return {
    TOPICS,
    CULTURES,
    CONTENT_TYPES,
    STYLES,
    AUDIENCES,
    LENGTHS,
    ENGINES,
    allTopicLabels,

    /** 前端默认勾选 */
    defaults: {
      topic: TOPICS[0].items[0],
      cultures: ['neijing', 'leiyin'],
      contentType: 'xhs',
      style: STYLES[0],
      audience: AUDIENCES[2],
      length: 'l',
      engine: 'auto',
      topicCustom: '',
      cultureCustom: '',
      styleCustom: '',
      audienceCustom: '',
      lengthCustom: '',
    },
  };
});
