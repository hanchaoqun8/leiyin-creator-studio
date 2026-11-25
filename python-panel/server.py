# -*- coding: utf-8 -*-
"""
素手归原 · 身心自愈全能创作平台 - 后端代理（四库 · 范文优先版）
优先级：1 用户原创19篇长拍实战范文库（行文蓝本） > 2 素手归原古法自愈 > 3 黄帝内经经络 > 4 国学悟道
- 每次生成强制召回 2-4 条范文片段作为模仿蓝本
- 生成后内部文风自检，偏差过大自动重写一版
- 模式：batch(4-5选题+成品) / topics(灵感) / article(逐条成文)
- 密钥只存 config.json，口令明文只在本文件，前端永不接触
启动: python server.py (默认 8848；云端注入 PORT 并绑定 0.0.0.0)
"""
import json
import os
import re
import sys
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

BASE = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", os.environ.get("PANEL_PORT", "8848")))
ACCESS_PASSWORD = "chanpai2026"

CFG_FILE = BASE / "config.json"
if CFG_FILE.exists():
    with open(CFG_FILE, "r", encoding="utf-8") as f:
        CFG = json.load(f)
else:
    # 公开仓库里不放真实令牌：没有 config.json 时读环境变量
    CFG = {
        "zhipu": {"api_key": os.environ.get("ZHIPU_API_KEY", ""), "model": "glm-4-flash",
                  "endpoint": "https://open.bigmodel.cn/api/paas/v4/chat/completions"},
        "modelscope": {"api_key": os.environ.get("MODELSCOPE_TOKEN", ""), "model": "Qwen/Qwen3.8-Flash-Next",
                       "endpoint": "https://api-inference.modelscope.cn/v1/chat/completions"},
        "doubao": {"api_key": os.environ.get("DOUBAO_API_KEY", ""), "model": "doubao-seed-1-6-flash-250715",
                   "endpoint": "https://ark.cn-beijing.volces.com/api/v3/chat/completions"},
    }

# ---------- 四大知识库（顺序即优先级） ----------
LIBS = {
    "fanwen": "用户原创19篇长拍实战范文库",
    "paida": "素手归原古法自愈知识库",
    "jingluo": "黄帝内经经络知识库",
    "guoxue": "道德经周易禅修国学知识库",
}
LIB_PRIORITY = list(LIBS.keys())

# 文化勾选 → 补充素材库（范文库永远最高优先，不受影响）
CULTURE_LIBS = {
    "黄帝内经中医经络体系": ["jingluo"],
    "素手归原古法自愈理论": ["paida"],
    "道德经心性智慧": ["guoxue"],
    "周易阴阳平衡规律": ["guoxue"],
    "禅修悟道静定智慧": ["guoxue"],
    "家庭孝道、亲子身心养护文化": ["guoxue"],
    "生活饮食睡眠养生常识": ["jingluo"],
    "黄帝内经": ["jingluo"], "经络": ["jingluo"],
    "拍打": ["paida"], "归原拍": ["paida"],
    "道德经": ["guoxue"], "周易": ["guoxue"],
    "禅修": ["guoxue"], "孝道": ["guoxue"],
}

TOPIC_HINTS = {
    "肩颈": ["肩颈", "胆经", "三焦经", "小肠经", "膀胱经"],
    "腰背": ["腰背", "膀胱经", "督脉", "肾经", "带脉"],
    "四肢": ["四肢", "手足", "微循环", "经络末端"],
    "睡眠": ["睡眠", "子时", "入睡", "心神", "血归于肝"],
    "饮食": ["饮食", "脾胃", "五谷", "规律", "温热"],
    "脾胃": ["脾胃", "运化", "五谷为养", "饮食"],
    "儿童": ["儿童", "孩子", "亲子", "心神", "早睡"],
    "女性": ["女性", "肝郁", "情绪", "气血", "疏泄"],
    "中老年": ["中老年", "气血衰退", "慢", "温热", "陪伴"],
    "焦虑": ["焦虑", "心神不宁", "静定", "呼吸", "执念"],
    "情绪": ["情绪", "气机", "肝郁", "疏泄", "放下"],
    "内耗": ["内耗", "执念", "放下", "知止", "静"],
    "四季": ["四季", "春生夏长", "秋收冬藏", "顺时"],
    "排寒": ["寒", "温热", "阳", "任脉", "流通"],
    "排湿": ["湿", "脾", "运化", "温热"],
    "自愈": ["自愈", "正气", "流通", "治未病"],
    "上善若水": ["上善若水", "水", "不争", "守静"],
    "阴阳": ["阴阳", "平衡", "变易", "损益"],
    "明心见性": ["明心见性", "觉察", "破执", "本心"],
    "孝道": ["孝道", "家庭", "陪伴", "元气"],
    "手法": ["手法", "力度", "节奏", "掌起掌落", "手臂酸"],
}

KB_DOCS = {}
for _lib in LIBS:
    _dir = BASE / "kb" / _lib
    _docs = []
    for _p in sorted(_dir.glob("*.txt")) if _dir.exists() else []:
        try:
            _t = _p.read_text(encoding="utf-8", errors="ignore").strip()
            if _t:
                _docs.append({"title": _p.stem, "text": _t, "lib": _lib})
        except Exception:
            pass
    KB_DOCS[_lib] = _docs

ALL_COUNT = sum(len(v) for v in KB_DOCS.values())

# 文风自检词表（源自19篇原文）
SOMATIC = ["热", "热流", "发热", "暖", "暖流", "温热", "麻", "发麻", "酸", "胀", "酸胀",
           "沉", "重", "紧", "僵", "松", "松开", "松下来", "松动", "通", "通了", "通畅",
           "流通", "通透", "跳", "跳动", "脉动", "震", "颤", "凉", "寒", "排寒", "凉意",
           "轻", "轻松", "轻盈", "困", "想睡", "平静", "安心", "春风", "细雨", "暖阳",
           "惊雷", "掌起掌落", "一掌掌", "手下", "细胞", "欢呼", "呐喊", "看见"]
ORAL = ["那么", "然后", "因为", "所以", "也就是", "我都会说", "我都会", "是的", "你看",
        "说真的", "就是这样", "每每", "真的", "好像", "似乎", "这种", "那种", "就那么",
        "其实", "慢慢", "试着", "别急", "记住"]
ROBOT = ["首先", "其次", "再次", "综上所述", "总而言之", "值得注意的是", "众所周知",
         "在当今", "随着", "由此可见", "一方面", "另一方面", "从某种意义上", "有效地",
         "显著地", "极大地", "系统地", "全面地", "深度赋能", "闭环", "抓手", "底层逻辑",
         "赛道", "认知升级", "赋能", "值得一提的是", "总的来说"]
NET_TALK = ["治愈系", "松弛感", "断舍离", "满满正能量", "好好爱自己", "活成自己喜欢的样子",
            "余生很贵", "愿你被世界温柔以待", "你若盛开", "能量场", "高频振动",
            "宁静之旅", "心灵之旅", "温柔之旅", "治愈之旅", "邂逅", "无尽的温柔",
            "破防", "绝绝子", "YYDS", "yyds", "打工人", "内卷", "躺平", "emo", "破局",
            "降维打击", " bottom line", "闭环思维", "认知觉醒", "自我疗愈之旅"]

# 医疗违规话术（后置审核·风险高亮）
MEDICAL_RISK = ["治愈", "根治", "疗效", "包治", "药到病除", "治疗疾病", "治病", "康复",
                "痊愈", "见效", "疗程", "处方", "特效药", "临床验证", "治好", "医治",
                "消除病灶", "疏通血管", "降血压", "降血糖", "消炎", "止痛", "抗癌",
                "无副作用", "一次见效", "彻底解决", "保证有效", "100%", "百分百",
                "排毒养颜", "祛除病根", "药效", "适应症", "诊断", "确诊"]

# 常见错别字/易错专有名词（后置审核·文字纠错）
TYPO_MAP = {
    "素手归元": "素手归原", "素手归缘": "素手归原", "素手归圆": "素手归原", "素收归原": "素手归原",
    "归原拍打": "归原拍", "禅伯": "禅拍", "拍打疗愈": "拍打（注意避免疗效暗示）",
    "经洛": "经络", "气血於堵": "气血淤堵", "於堵": "淤堵",
    "在再": "再", "做为": "作为", "按装": "安装", "即然": "既然", "既使": "即使",
    "不径而走": "不胫而走", "迫不急待": "迫不及待", "一如继往": "一如既往",
}


def access_ok(handler):
    return handler.headers.get("X-Access-Key") == ACCESS_PASSWORD


def query_terms(query):
    q = set(re.findall(r"[\u4e00-\u9fa5]{2,}", query or ""))
    for word in list(q):
        for hint in TOPIC_HINTS.get(word, []):
            q.add(hint)
    q |= {"养生", "气血", "身心", "心性", "生活", "流通"}
    return q


def fanwen_search(query, n=3):
    """最高优先级：召回 2-4 条范文片段作为行文蓝本。"""
    docs = KB_DOCS.get("fanwen", [])
    if not docs:
        return "", []
    q = query_terms(query)
    scored = []
    for doc in docs:
        score = sum(doc["text"].count(w) for w in q)
        scored.append((score, doc))
    scored.sort(key=lambda x: -x[0])
    picked = []
    for score, doc in scored:
        if score > 0 and len(picked) < n:
            picked.append(doc)
    # 主题无关时仍取文风最典型的几篇，保证蓝本始终在场
    if len(picked) < 2:
        for title_key in ("我的拍打日记", "向外追赶的手艺人", "何为禅拍"):
            for doc in docs:
                if title_key in doc["title"] and doc not in picked:
                    picked.append(doc)
                    break
            if len(picked) >= 2:
                break
    chunks = []
    for doc in picked[:4]:
        # 范文必须保留原始换行——单句成行是最高优先级的行文特征
        clean = re.sub(r"^(来源|原文链接|发布时间)[：:].*\n?", "", doc["text"], flags=re.M)
        lines = [l for l in clean.split("\n")]
        if lines and lines[0].strip() == doc["title"]:
            lines = lines[1:]
        clean = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
        clean = re.sub(r"[ \t]{2,}", " ", clean)
        chunks.append("【范文·%s】\n%s" % (doc["title"], clean[:1300]))
    return "\n\n".join(chunks), [d["title"] for d in picked[:4]]


def kb_search(query, libs=None, per_lib=1, total=3, chunk=560):
    """补充素材：只检索非范文库。"""
    libs = [l for l in (libs or LIB_PRIORITY) if l != "fanwen"]
    q = query_terms(query)
    out, used = [], []
    for lib in libs:
        docs = KB_DOCS.get(lib, [])
        if not docs:
            continue
        scored = []
        for doc in docs:
            score = sum(doc["text"].count(w) for w in q)
            scored.append((score, doc))
        scored.sort(key=lambda x: -x[0])
        for score, doc in scored[:per_lib]:
            if score <= 0:
                continue
            clean = re.sub(r"\s+", " ", doc["text"]).strip()
            out.append("【补充·%s】%s" % (doc["title"], clean[:chunk]))
            used.append(doc["title"])
            if len(out) >= total:
                return "\n\n".join(out), used
    return "\n\n".join(out), used


def resolve_libs(cultures):
    if not cultures:
        return ["paida", "jingluo", "guoxue"]
    picked = []
    for c in cultures:
        key = str(c).strip()
        libs = CULTURE_LIBS.get(key)
        if not libs:
            for k, v in CULTURE_LIBS.items():
                if k in key or key in k:
                    libs = v
                    break
        if libs:
            for l in libs:
                if l not in picked:
                    picked.append(l)
    return picked or ["paida", "jingluo", "guoxue"]


def call_engine(engine, messages, max_tokens, temperature=0.9):
    if engine == "zhipu":
        c = CFG["zhipu"]
        if not c.get("api_key"):
            raise RuntimeError("智谱 api_key 未配置")
    elif engine == "modelscope":
        c = CFG["modelscope"]
        if not c.get("api_key"):
            raise RuntimeError("魔搭 api_key 未配置")
    elif engine == "doubao":
        c = CFG["doubao"]
        if not c.get("api_key"):
            raise RuntimeError("豆包 api_key 未提供")
    else:
        raise RuntimeError("未知引擎: " + str(engine))
    url, key, model = c["endpoint"], c["api_key"], c["model"]
    headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
    payload = {"model": model, "messages": messages,
               "max_tokens": max_tokens, "temperature": temperature}
    req = urllib.request.Request(url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                                 headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=240) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise RuntimeError("HTTP %s: %s" % (e.code, e.read().decode("utf-8", "ignore")[:600]))
    obj = json.loads(body)
    if "error" in obj:
        raise RuntimeError(str(obj["error"])[:600])
    msg = obj["choices"][0]["message"]
    return (msg.get("content") or msg.get("reasoning_content") or ""), model


# ---------- 铁律 ----------
COMPLIANCE = (
    "【硬性强制约束·逐条遵守】\n"
    "1. 严禁凭空编造个案、客户故事、虚构拍打神奇疗效；不写「某人拍完就好了」。\n"
    "2. 不做治病、根治、疗效、包治等任何医疗承诺；调理表述尺度与19篇原文完全统一。\n"
    "3. 只写身心放松、紧绷松解、体感流动、情绪疏通、静心觉察这类描述。\n"
    "4. 国学禅意只做少量点缀，绝不写大段玄学；主体必须是长拍身体体感 + 内心感悟。\n"
    "5. 不迷信、不忽悠，贴合《黄帝内经》养生逻辑；儿童、女性、老人内容温和正向、利他。\n"
    "6. 坚守「禅为根、拍为用、生活为体、国学为魂」。\n"
    "7. 拒绝机器书面腔、拒绝网上摘抄的网红养生套话；不用「首先/其次/综上所述」这类结构词。\n"
)

FANWEN_RULE = (
    "【第一优先级 · 行文蓝本（用户原创19篇长拍实战范文库）】\n"
    "下面的片段是用户本人写的原文，是你唯一的行文范本。不是「参考」，是「复刻」：\n"
    "1. 句式：短句为主，一句说完立刻换行，哪怕只有两三个字也单独成一行（如「因为」「所以」「我都会说」）。"
    "整篇至少 15 行，段落之间大量留白。像手写日记、像深夜聊天，不像一篇作文。\n"
    "2. 口吻：第一人称「我」，直接说自己的感受和判断，不站在第三方说教。常用「那么、然后、因为、所以、"
    "也就是、我都会说、是的、你看、就是这样、每每这时候」。\n"
    "3. 节奏：带粤语生活化叙事节奏——口语、松弛、不端着；句子长短交错，偶尔一个词单独成行。\n"
    "4. 体感：主体写长拍的身体体感 + 内心感悟。优先复用蓝本里已有的体感词"
    "（热、热流、麻、酸胀、沉、松、通、跳、暖、凉、轻、困、春风、细雨、掌起掌落……），"
    "禁止大量自创陌生感受词汇。\n"
    "5. 用一个贴切的短标题，朴素、有画面，不用「指南/秘籍/必看/宝藏」这类网红词。\n"
)


def style_check(text):
    """内部文风自检：对照19篇范文的句式、口吻、体感词。"""
    t = str(text or "")
    score, issues = 0, []
    n_wo = t.count("我")
    if n_wo >= 3:
        score += 2
    elif n_wo >= 1:
        score += 1
    else:
        issues.append("缺少第一人称视角")
    hit = [w for w in SOMATIC if w in t]
    if len(hit) >= 3:
        score += 3
    elif len(hit) >= 2:
        score += 2
    elif len(hit) >= 1:
        score += 1
    else:
        issues.append("未复用范文体感词")
    oral = [w for w in ORAL if w in t]
    if len(oral) >= 3:
        score += 2
    elif len(oral) >= 1:
        score += 1
    else:
        issues.append("口语叙事节奏不足")
    paras = [p.strip() for p in t.split("\n") if p.strip()]
    short = sum(1 for p in paras if len(p) < 30)
    ratio = short / len(paras) if paras else 0
    avg = sum(len(p) for p in paras) / len(paras) if paras else 999
    if len(paras) >= 12 and ratio >= 0.7:
        score += 3
    elif len(paras) >= 8 and ratio >= 0.5 and avg < 45:
        score += 1
        issues.append("短句比例偏低，仍偏作文腔")
    else:
        score -= 4
        issues.append("段落过长/行数不足，未复刻范文的单句成行")
    compare = t.count("像是") + t.count("如同") + t.count("仿佛")
    if compare > 4:
        score -= 1
        issues.append("比喻堆砌，偏书面作文腔")
    bad = [w for w in ROBOT if w in t]
    if bad:
        score -= min(2, len(bad))
        issues.append("含书面机器腔:" + "、".join(bad[:3]))
    else:
        score += 2
    net = [w for w in NET_TALK if w in t]
    if net:
        score -= 1
        issues.append("含网红套话:" + "、".join(net[:2]))
    else:
        score += 1
    return score, issues


# ==================== 后置审核模块（每篇独立运行） ====================
GUOXUE_WORDS = ["道德经", "周易", "阴阳", "上善若水", "知止", "无为", "不争", "自然",
                "五行", "易经", "道", "禅", "因果", "守静", "致虚", "归一", "本心", "明心见性"]
STORY_MARK = ["有个", "有一个", "我有个", "朋友", "客户", "学员", "某人", "一个人", "她", "他", "那位", "这位"]
NEGATIVE_ABS = ["一定", "必定", "肯定能", "绝对", "百分之百", "100%", "百分百", "保证", "永不", "再也不"]


def _line_of(text, idx):
    """字符位置 -> 第几行。"""
    return text.count("\n", 0, idx) + 1


def module1_typo(text):
    """模块1：文字纠错检查。输出清单+位置，不自动改。"""
    t = str(text or "")
    issues = []
    # 1) 错别字 / 专有名词
    for wrong, right in TYPO_MAP.items():
        start = 0
        while True:
            i = t.find(wrong, start)
            if i < 0:
                break
            issues.append({"line": _line_of(t, i), "orig": wrong,
                           "problem": "疑似错别字 / 专有名词写法", "suggest": right,
                           "level": "中"})
            start = i + len(wrong)
    lines = t.split("\n")
    for ln, line in enumerate(lines, 1):
        s = line.strip()
        if not s:
            continue
        # 2) 连续 / 重复标点
        m = re.search(r"[，。！？、；：]{2,}", s)
        if m:
            issues.append({"line": ln, "orig": m.group(0), "problem": "重复标点",
                           "suggest": "保留一个标点", "level": "低"})
        # 3) 半角标点混入中文
        m = re.search(r"[\u4e00-\u9fa5][,!?;]|\b[,!?;][\u4e00-\u9fa5]", s)
        if m:
            issues.append({"line": ln, "orig": m.group(0), "problem": "中英文标点混用",
                           "suggest": "改为中文全角标点", "level": "低"})
        # 4) 断句混乱：单行过长且缺标点
        if len(s) > 55 and not re.search(r"[，。！？\n]", s):
            issues.append({"line": ln, "orig": s[:24] + "…", "problem": "断句偏长、缺停顿",
                           "suggest": "按语义拆成短句，一句一行", "level": "中"})
        # 5) 行首异常标点
        if re.match(r"^[，。！？、；：]", s):
            issues.append({"line": ln, "orig": s[:12], "problem": "行首多余标点",
                           "suggest": "删除行首标点", "level": "低"})
    # 去重
    seen, uniq = set(), []
    for x in issues:
        k = (x["line"], x["orig"], x["problem"])
        if k not in seen:
            seen.add(k)
            uniq.append(x)
    uniq.sort(key=lambda x: x["line"])
    return uniq[:30]


def module2_report(text):
    """模块2：风格&合规分析报告。"""
    t = str(text or "")
    lines = [l.strip() for l in t.split("\n") if l.strip()]
    n = len(lines) or 1

    # ---- 文风匹配度（对照19篇范文信号，0-100）----
    s, _ = style_check(t)  # 满分约12
    style_score = int(max(0, min(100, round((s / 12.0) * 100))))
    hit_somatic = [w for w in SOMATIC if w in t]
    hit_oral = [w for w in ORAL if w in t]

    # ---- 陌生新词 / 网络套话 ----
    net = [w for w in NET_TALK if w in t]
    robot = [w for w in ROBOT if w in t]
    unfamiliar = []
    # 体感词表之外、但像自造感受的"XX感/XX力"组合
    for w in re.findall(r"[\u4e00-\u9fa5]{2,4}(?:感|力)", t):
        if w not in SOMATIC and w not in ("感受", "感觉", "自愈力", "力量", "能力"):
            unfamiliar.append(w)
    unfamiliar = list(dict.fromkeys(unfamiliar + net + robot))[:12]

    # ---- 医疗违规话术扫描（高亮）----
    med = []
    for w in MEDICAL_RISK:
        idx = t.find(w)
        if idx >= 0:
            ctx = t[max(0, idx - 10): idx + len(w) + 10].replace("\n", " ")
            med.append({"word": w, "line": _line_of(t, idx), "context": ctx})
    # 绝对化承诺
    for w in NEGATIVE_ABS:
        idx = t.find(w)
        if idx >= 0:
            ctx = t[max(0, idx - 10): idx + len(w) + 10].replace("\n", " ")
            med.append({"word": w, "line": _line_of(t, idx), "context": ctx})
    med = med[:20]

    # ---- 内容配比 ----
    body_lines = sum(1 for l in lines if any(w in l for w in SOMATIC) or any(w in l for w in ORAL))
    guo_lines = sum(1 for l in lines if any(w in l for w in GUOXUE_WORDS))
    body_pct = int(round(body_lines / n * 100))
    guo_pct = int(round(guo_lines / n * 100))
    other_pct = max(0, 100 - body_pct - guo_pct)
    ratio_ok = (guo_pct <= 25 and body_pct >= 45)

    # ---- 综合判定 ----
    high_risk = any(x["word"] in MEDICAL_RISK for x in med)
    fake_case = any(x in t for x in STORY_MARK) and ("拍完" in t or "就好了" in t or "治好" in t)
    if style_score >= 78 and not high_risk and ratio_ok and not fake_case:
        verdict, verdict_reason = "合格", "文风贴近范文，体感为主体、国学为点缀，无医疗风险。"
    elif style_score >= 58 and len(med) <= 2 and not fake_case:
        verdict, verdict_reason = "需要微调", "整体可用，但有表述或配比可优化，建议一键微调后再发。"
    else:
        verdict, verdict_reason = "不建议直接发布", "文风偏差或存在医疗风险/不当个案，必须修改后再用。"

    return {
        "style_score": style_score,
        "somatic_words": hit_somatic[:16],
        "oral_words": hit_oral[:10],
        "unfamiliar": unfamiliar,
        "medical_hits": med,
        "ratio": {"body": body_pct, "guoxue": guo_pct, "other": other_pct, "ok": ratio_ok},
        "verdict": verdict,
        "verdict_reason": verdict_reason,
        "fake_case_risk": bool(fake_case),
    }


def module3_dims(text, report):
    """模块3：八维打分（0-100），用于雷达图。"""
    t = str(text or "")
    lines = [l.strip() for l in t.split("\n") if l.strip()]
    n = len(lines) or 1
    short_lines = sum(1 for l in lines if len(l) < 30)
    short_ratio = short_lines / n
    style = report["style_score"]
    hit_somatic = len(report["somatic_words"])
    hit_oral = len(report["oral_words"])
    guo_pct = report["ratio"]["guoxue"]
    med_n = len(report["medical_hits"])
    title = bool(re.search(r"《.{1,30}》|^#\s*\S", t, re.M))

    def clamp(x):
        return int(max(0, min(100, round(x))))

    dims = {
        # ① 受众需求贴合度：口语化+体感+场景，扣机器腔
        "受众需求贴合度": clamp(50 + hit_oral * 4 + hit_somatic * 3 - len([w for w in ROBOT if w in t]) * 8),
        # ② 心理张力：短句留白 + 转折递进词
        "心理张力": clamp(45 + short_ratio * 40 + min(4, t.count("直到") + t.count("后来") + t.count("可是") + t.count("但是")) * 5),
        # ③ 共情感染力：第一人称+口语+体感
        "共情感染力": clamp(45 + min(8, t.count("我")) * 3 + hit_oral * 3 + hit_somatic * 2),
        # ④ 内容真实感：体感词+具体身体部位+无夸张
        "内容真实感": clamp(50 + hit_somatic * 5 - (8 if report["fake_case_risk"] else 0) - len([w for w in NEGATIVE_ABS if w in t]) * 10),
        # ⑤ 语言自然度：文风分 + 短句 - 机器腔/套话
        "语言自然度": clamp(style * 0.7 + short_ratio * 25 - len(report["unfamiliar"]) * 3),
        # ⑥ 禅意分寸感：国学适量得分，过量或全无扣分
        "禅意分寸感": clamp(100 - abs(guo_pct - 10) * 3),
        # ⑦ 传播适配度：行数适中+有标题+短句金句
        "传播适配度": clamp(45 + (10 if 10 <= n <= 60 else 2) + (10 if title else 0) + short_ratio * 20),
        # ⑧ 合规安全度：无医疗风险
        "合规安全度": clamp(100 - med_n * 18 - (20 if report["fake_case_risk"] else 0)),
    }
    return dims


def build_export_prompt(article, params, fw_block, kb_block, report):
    """模块5：导出本次创作完整独立提示词（可复制到豆包继续创作/改写）。"""
    p = params or {}
    lines = [
        "你是「素手归原 · 身心自愈全能创作平台」的写作者，替用户写他自己口吻的文案。",
        "",
        FANWEN_RULE,
        "",
        COMPLIANCE,
        "【本次创作参数】",
        "- 主题：%s" % p.get("topic", ""),
        "- 文化维度：%s" % ("、".join(p.get("cultures", [])) or "不限"),
        "- 受众：%s" % p.get("audience", ""),
        "- 风格：%s" % p.get("style", ""),
        "- 内容类型：%s" % p.get("content_type", ""),
        "- 字数：约 %s 字" % p.get("words", ""),
        ("- 补充要求：%s" % p.get("extra", "") if p.get("extra") else ""),
    ]
    if fw_block:
        lines += ["", "【行文蓝本·最高优先级（用户原创范文）】", fw_block]
    if kb_block:
        lines += ["", "【其余知识库·素材补充，不得主导行文风格】", kb_block]
    lines += [
        "",
        "直接输出完整成品，一句一行、短句留白，第一人称，复用蓝本体感词。",
    ]
    if report:
        lines += [
            "",
            "【本次审核提示（供继续优化）】",
            "- 文风匹配度：%s/100" % report.get("style_score", ""),
            "- 综合判定：%s（%s）" % (report.get("verdict", ""), report.get("verdict_reason", "")),
            ("- 需修正的医疗风险词：" + "、".join(x["word"] for x in report.get("medical_hits", [])) if report.get("medical_hits") else ""),
        ]
    return "\n".join([x for x in lines if x is not None])


def review_article(article, params, fw_block="", kb_block=""):
    """生成一篇后立即运行全套后置审核，返回结构化审核结果。"""
    t = str(article or "")
    r1 = module1_typo(t)
    r2 = module2_report(t)
    r3 = module3_dims(t, r2)
    export_prompt = build_export_prompt(t, params, fw_block, kb_block, r2)
    return {
        "typo_list": r1,
        "typo_count": len(r1),
        "report": r2,
        "dims": r3,
        "export_prompt": export_prompt,
    }


def refine_article(article, review, action, engine, instruction="", paragraph=""):
    """模块4：一键微调 / 指定段落修改。返回新文案。"""
    t = str(article or "")
    rv = review or {}
    rep = rv.get("report", {})
    dims = rv.get("dims", {})
    lows = sorted(dims.items(), key=lambda x: x[1])[:3] if isinstance(dims, dict) else []
    low_txt = "、".join("%s(%d分)" % (k, v) for k, v in lows)
    fix_typos = "；".join("%s→%s" % (x.get("orig", ""), x.get("suggest", "")) for x in rv.get("typo_list", [])[:8])
    med_words = "、".join(x["word"] for x in rep.get("medical_hits", []))
    verdict = rep.get("verdict", "")

    if action == "paragraph":
        sysmsg = (
            "你是「素手归原」写作者。用户指定要修改文章中的一段，请只改写那一段，其余原文一字不改。\n"
            + FANWEN_RULE + "\n" + COMPLIANCE +
            "要求：改写段保持第一人称、短句一句一行、复用范文体感词，贴合用户原意。"
        )
        user = ("【完整原文】\n%s\n\n【要修改的段落原文】\n%s\n\n【修改要求】\n%s\n\n"
                "只输出改写后的完整文章（整篇），不要解释。" % (t, paragraph or "", instruction or "改得更贴近口语"))
    else:
        sysmsg = (
            "你是「素手归原」写作者。下面是一篇已生成的文案和它的审核报告，请做一次「一键微调」：\n"
            "在保留主题、核心体感和原创性的前提下，把行文拉回19篇范文的语感。\n"
            + FANWEN_RULE + "\n" + COMPLIANCE +
            "【微调要点】只改需要改的地方，不要大改主题；一句一行、短句留白。"
        )
        user = (
            "【原文】\n%s\n\n【审核要点】\n"
            "- 综合判定：%s\n- 文风匹配度：%s/100\n- 八维低分项：%s\n"
            "- 文字纠错：%s\n- 医疗风险词（必须删除或改为身心感受表述）：%s\n"
            "- 陌生词/套话：%s\n\n"
            "请输出微调后的完整文章（整篇），不要解释。" % (
                t, verdict, rep.get("style_score", ""), low_txt or "无",
                fix_typos or "无", med_words or "无", "、".join(rep.get("unfamiliar", [])) or "无")
        )
    content, model = call_engine(engine, [
        {"role": "system", "content": sysmsg},
        {"role": "user", "content": user},
    ], min(len(t) * 3 + 900, 8192), 0.9)
    content = re.sub(r"^\s*```(?:markdown|md)?\s*|\s*```\s*$", "", content.strip())
    # 兜底：用户主动微调时，把审核认定的医疗风险词替换为身心感受表述（按常见搭配，避免生硬）
    SAFE_REPLACE = {
        "治愈系": "温和系", "温柔治愈": "温柔陪伴", "治愈的力量": "安静陪伴的力量",
        "治愈": "舒缓", "根治": "慢慢松开", "疗效": "身体的回应", "治好": "慢慢松开",
        "医治": "照料", "包治": "陪伴", "痊愈": "慢慢好起来", "药到病除": "慢慢放松",
    }
    for w, rep in SAFE_REPLACE.items():
        content = content.replace(w, rep)
    return content, model


def generate_with_check(engine, base_sys, user_msg, max_tokens, temperature, check=True):
    """生成 + 文风自检，不达标自动重写一版。"""
    content, model = call_engine(engine, [
        {"role": "system", "content": base_sys},
        {"role": "user", "content": user_msg},
    ], max_tokens, temperature)
    if not check:
        return content, model, None, False
    score, issues = style_check(content)
    if score >= 7:
        return content, model, score, False
    retry_sys = (
        base_sys +
        "\n【重写指令·必须执行】上一稿文风与用户范文偏差过大：" + "；".join(issues) +
        "。请彻底重写一版：严格照蓝本，一句一行、至少20行、写满用户指定字数，短句留白，"
        "第一人称「我」直接说体感，粤语生活化口语节奏，复用蓝本体感词，"
        "删掉书面腔、网红套话和打油诗式对仗。不要解释，直接给成品。"
    )
    content2, model2 = call_engine(engine, [
        {"role": "system", "content": retry_sys},
        {"role": "user", "content": user_msg},
    ], max_tokens, temperature + 0.03)
    score2, _ = style_check(content2)
    if score2 > score:
        return content2, model2, score2, True
    return content, model, score, True


def clean_topics(text):
    out = []
    for line in str(text or "").split("\n"):
        line = line.strip()
        if re.match(r"^\s*[-•·]\s", line):
            continue
        t = line
        prev = None
        while t != prev:
            prev = t
            t = re.sub(r"^\s*(?:\d+[\.、]|[一二三四五][\.、]?)\s*", "", t).strip()
        t = re.sub(r"^['\"「『《\s]+|['\"」』》\s]+$", "", t).strip()
        if re.search(r"编号|选题标题|切入角度|格式|示例|^\d+\s*$|朴素具体的文章标题|核心内容|目标受众|文风要求|内容形式|补充要求|字数要求|写作要求|创作主题|篇幅要求|文化维度", t):
            continue
        if 4 <= len(t) <= 120:
            out.append(t)
    return out[:5]


def article_sys(topic, audience, style, words, extra, content_type, cultures, fanwen_block, kb_block):
    cul = "、".join(cultures) if cultures else "未指定"
    rules = CONTENT_RULES.get(content_type, "结构清晰、生活化、可日更的完整文案。")
    return (
        "你是「素手归原 · 身心自愈全能创作平台」的写作者，正在替用户写他自己口吻的文案。\n\n"
        + fanwen_block + "\n\n"
        + COMPLIANCE
        + "【本次参数】\n"
        + f"- 主题：{topic}\n- 文化维度：{cul}\n- 受众：{audience}\n- 风格：{style}\n"
        + f"- 内容类型：{content_type}（{rules}）\n- 篇幅：约 {words} 字\n"
        + (f"- 补充要求：{extra}\n" if extra else "")
        + ("\n【其余知识库·素材补充，不得主导行文风格】\n" + kb_block + "\n" if kb_block else "")
        + "\n直接输出完整成品，带一个朴素贴切的短标题。"
    )


CONTENT_RULES = {
    "小红书图文": "标题有生活气息不夸大；正文短句分段，开头是具体日常场景，结尾给3-5个话题标签。",
    "视频号短视频文案": "一句抓人的开场白 + 3-5句短文案 + 一句温和分享语，适合15-30秒配文。",
    "短视频口播解说稿": "完全口语化、短句，可直接照着读；称呼观众，讲一个具体场景和一个道理，温和收束。",
    "高清海报配图短句": "6-8条独立短句，每条不超过18字，含一条主标题句，雅致克制。",
    "禅意治愈诗词": "8-12行短诗，意境清雅，重在留白与体悟，不堆砌辞藻。",
    "完整短视频拍摄脚本": "5-7个镜头，每个含画面描述、台词或旁白、时长建议、节奏提示，总时长约60秒。",
    "公众号长文": "故事切入 + 过程感受 + 感悟启发，段落分明，有体温。",
    "朋友圈文案": "80-180字，温润走心，适合配图，像和朋友说一句心里话。",
}

TOPIC_SYS = (
    "你是「素手归原 · 身心自愈全能创作平台」的内容策划。"
    "产出 4-5 组互不重复、角度各异的原创选题。\n"
    "要求：只输出4-5行，每行「序号. 标题 —— 一句话切入角度」；第一行从「1. 」开始；"
    "标题朴素、口语、有画面，像用户本人写的（如「向外追赶的手艺人 最容易迷了路」），"
    "不用「指南/秘籍/必看/宝藏/干货」等网红词；不输出任何说明与示例。\n\n"
    + COMPLIANCE
)

BATCH_SYS = (
    "你是「素手归原 · 身心自愈全能创作平台」的写作者，替用户写他自己口吻的文案。\n\n"
    + COMPLIANCE
    + "输出格式（严格遵守，不要额外说明、不要复述参数）：\n"
    "【选题】\n1. 肩颈间的那股热流 —— 从一次掌起掌落说起\n（共4-5行，自己写标题，不要照抄这一行的示例文字）\n"
    "【成品】\n一个短标题\n（完整正文，一句一行，至少15行，按指定内容类型排版）\n"
)


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path, ctype):
        with open(BASE / path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = self.path.split("?")[0]
        if p in ("/", "/index.html"):
            self._file("index.html", "text/html; charset=utf-8")
        elif p == "/style.css":
            self._file("style.css", "text/css; charset=utf-8")
        elif p == "/api/verify":
            self._json(200, {"ok": access_ok(self)})
        elif p == "/api/engines":
            if not access_ok(self):
                return self._json(401, {"ok": False, "error": "需要访问口令"})
            self._json(200, {
                "engines": [
                    {"id": "zhipu", "name": "智谱AI", "model": CFG["zhipu"]["model"], "ready": bool(CFG["zhipu"].get("api_key"))},
                    {"id": "modelscope", "name": "魔搭AI", "model": CFG["modelscope"]["model"], "ready": bool(CFG["modelscope"].get("api_key"))},
                    {"id": "doubao", "name": "豆包AI", "model": CFG["doubao"]["model"], "ready": bool(CFG["doubao"].get("api_key"))},
                ],
                "kb_count": ALL_COUNT,
                "kb_libs": {k: len(v) for k, v in KB_DOCS.items()},
                "kb_names": LIBS,
                "kb_priority": LIB_PRIORITY,
            })
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        if path not in ("/api/generate", "/api/refine"):
            return self._json(404, {"error": "not found"})
        if not access_ok(self):
            return self._json(401, {"ok": False, "error": "需要访问口令"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            d = json.loads(self.rfile.read(n).decode("utf-8"))

            # ---------- 微调接口 ----------
            if path == "/api/refine":
                engine = d.get("engine", "zhipu")
                article = d.get("article", "")
                review = d.get("review")
                action = d.get("action", "auto")
                instruction = d.get("instruction", "")
                paragraph = d.get("paragraph", "")
                new_text, model = refine_article(article, review, action, engine, instruction, paragraph)
                new_text = re.sub(r"^\s*```(?:markdown|md)?\s*|\s*```\s*$", "", new_text.strip())
                rparams = d.get("params") or {}
                new_review = review_article(new_text, rparams)
                return self._json(200, {"ok": True, "article": new_text, "content": new_text,
                                        "model": model, "review": new_review, "action": action})

            engine = d.get("engine", "zhipu")
            topic = d.get("topic") or d.get("topicCustom") or "素手归原基础原理"
            audience = d.get("audience") or d.get("audienceCustom") or "亚健康都市成年人"
            style = d.get("style") or d.get("styleCustom") or "温柔治愈生活化闲聊风"
            content_type = d.get("content_type") or d.get("contentType") or "小红书图文"
            extra = d.get("extra") or d.get("customNotes") or ""
            cultures = d.get("cultures") or []
            if isinstance(cultures, str):
                cultures = [x for x in re.split(r"[,，、]", cultures) if x.strip()]
            mode = d.get("mode", "batch")
            words = max(50, min(int(d.get("words", 500)), 8000))

            # 无论哪种模式，范文库始终最高优先召回
            fw, fw_used = fanwen_search(topic + " " + " ".join(cultures) + " " + extra, n=3)
            fw_block = FANWEN_RULE + "\n【范文蓝本（最高优先级）】\n" + fw if fw else FANWEN_RULE
            lib_targets = resolve_libs(cultures)
            kb, kb_used_titles = kb_search(topic + " " + " ".join(cultures) + " " + extra,
                                           libs=lib_targets, total=3)

            if mode == "batch":
                sysmsg = BATCH_SYS + "\n" + fw_block + "\n\n" + COMPLIANCE
                if kb:
                    sysmsg += "\n【其余知识库·素材补充，不得主导行文风格】\n" + kb + "\n"
                params = json.dumps({"主题": topic, "文化维度": cultures, "受众": audience,
                                     "风格": style, "内容类型": content_type, "字数": words,
                                     "补充要求": extra}, ensure_ascii=False)
                user_msg = ("创作参数：" + params +
                            "\n请直接按【选题】【成品】格式输出，不要复述参数。"
                            "【选题】必须4-5条，每条独立一行。"
                            "【成品】必须写满约 %d 字，一句一行至少20行，"
                            "是自然的口语短句，不要写成打油诗或对仗押韵句。" % words)
                content, model, score, regen = generate_with_check(
                    engine, sysmsg, user_msg, min(int(words * 2.8) + 1000, 8192), 0.93)
                m = re.search(r"【选题】\s*(.*?)\s*【成品】\s*(.*)", content, re.S)
                topics, article = (clean_topics(m.group(1)), m.group(2).strip()) if m else ([], content.strip())
                rparams = {"topic": topic, "cultures": cultures, "audience": audience,
                           "style": style, "content_type": content_type, "words": words, "extra": extra}
                review = review_article(article, rparams, fw, kb)
                self._json(200, {"ok": True, "topics": topics, "article": article,
                                 "content": article, "engine": engine, "model": model,
                                 "kb_used": bool(fw), "fanwen_docs": fw_used,
                                 "kb_docs": kb_used_titles,
                                 "kb_libs": [LIBS[l] for l in ["fanwen"] + lib_targets],
                                 "style_score": score, "style_regen": regen,
                                 "review": review})
                return

            if mode == "topics":
                sysmsg = TOPIC_SYS + "\n" + fw_block
                if kb:
                    sysmsg += "\n【素材补充】\n" + kb + "\n"
                content, model = call_engine(engine, [
                    {"role": "system", "content": sysmsg},
                    {"role": "user", "content": "主题：%s\n文化：%s\n受众：%s\n风格：%s\n内容类型：%s\n请给出4-5组原创选题。" % (
                        topic, "、".join(cultures) or "不限", audience, style, content_type)},
                ], 1000, 0.95)
                self._json(200, {"ok": True, "topics": clean_topics(content), "content": content,
                                 "engine": engine, "model": model, "kb_used": bool(fw),
                                 "fanwen_docs": fw_used, "kb_docs": kb_used_titles})
                return

            sel = d.get("selectedTopic") or topic
            fw2, fw2_used = fanwen_search(sel + " " + topic, n=3)
            fw_block2 = FANWEN_RULE + "\n【范文蓝本（最高优先级）】\n" + fw2 if fw2 else FANWEN_RULE
            sysmsg = article_sys(sel, audience, style, words, extra, content_type, cultures,
                                 fw_block2, kb)
            sysmsg += "\n直接输出完整成品，带一个朴素贴切的短标题。"
            content, model, score, regen = generate_with_check(
                engine, sysmsg, "请开始写作。", min(int(words * 2.6) + 800, 8192), 0.91)
            rparams = {"topic": sel, "cultures": cultures, "audience": audience,
                       "style": style, "content_type": content_type, "words": words, "extra": extra}
            review = review_article(content, rparams, fw2, kb)
            self._json(200, {"ok": True, "content": content, "article": content,
                             "engine": engine, "model": model, "kb_used": bool(fw2),
                             "fanwen_docs": fw2_used, "kb_docs": kb_used_titles,
                             "style_score": score, "style_regen": regen,
                             "review": review})
        except Exception as e:
            self._json(200, {"ok": False, "error": str(e)[:1000]})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Access-Key")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("素手归原·身心自愈全能创作平台（四库范文优先版）已启动: http://0.0.0.0:%d" % PORT, flush=True)
    print("知识库: " + ", ".join("%s %d篇" % (LIBS[k], len(v)) for k, v in KB_DOCS.items()), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("已停止", flush=True)
