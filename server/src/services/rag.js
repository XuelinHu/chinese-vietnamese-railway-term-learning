import { query } from '../db/pool.js';

/**
 * 极简术语检索：不引入向量库，靠关键词 LIKE + 打分把本库术语喂给模型。
 * 目的是让 7B/14B 小模型也能答准铁道术语，并强制给出三语对照。
 */

const STOPWORDS = new Set([
  '什么', '怎么', '如何', '为什么', '哪些', '这个', '那个', '请问', '一下', '可以',
  'the', 'a', 'an', 'is', 'are', 'what', 'how', 'why', 'which', 'of', 'to', 'and',
  'la', 'gi', 'the', 'nao', 'cua', 'va', 'co', 'cho'
]);

/** 从提问里抽出候选检索词：中文取 2-4 字滑窗，拉丁语系按词切。 */
function extractTokens(text) {
  const tokens = new Set();
  const cleaned = String(text || '').trim();
  if (!cleaned) return [];

  // 拉丁词 / 越南语词（越南语有声调符号，用 Unicode 字母类匹配）
  for (const word of cleaned.toLowerCase().match(/[\p{Script=Latin}]+/gu) || []) {
    if (word.length >= 2 && !STOPWORDS.has(word)) tokens.add(word);
  }
  // 中文滑窗：2 到 4 字
  const han = cleaned.match(/\p{Script=Han}+/gu) || [];
  for (const run of han) {
    for (let size = 2; size <= 4; size += 1) {
      for (let i = 0; i + size <= run.length; i += 1) {
        const gram = run.slice(i, i + size);
        if (!STOPWORDS.has(gram)) tokens.add(gram);
      }
    }
  }
  // 词多的先匹配，提高命中精度；限制数量避免 SQL 过长
  return [...tokens].sort((a, b) => b.length - a.length).slice(0, 24);
}

/**
 * 检索与提问最相关的术语。
 * @returns {Promise<Array>} 最多 limit 条术语
 */
export async function retrieve(question, limit = 5) {
  const tokens = extractTokens(question);
  if (!tokens.length) return [];

  // 动态生成占位符。token 只作为绑定值，不拼进 SQL，因此无注入面。
  const params = {};
  const scoreParts = [];
  const whereParts = [];
  tokens.forEach((token, i) => {
    const key = `t${i}`;
    params[key] = `%${token}%`;
    // 术语字段命中权重高于释义字段；中文/越南语/英文同等对待。
    // 精确相等额外加 20 分：否则「道岔」会被「道岔测试004」这类长词条稀释，
    // 短而精确的术语应当排在前面。
    scoreParts.push(
      `(CASE WHEN t.term_zh = :${key} THEN 20 ELSE 0 END
      + CASE WHEN t.term_vi = :${key} THEN 20 ELSE 0 END
      + CASE WHEN t.term_en = :${key} THEN 20 ELSE 0 END
      + CASE WHEN t.term_zh ILIKE :${key} THEN 6 ELSE 0 END
      + CASE WHEN t.term_vi ILIKE :${key} THEN 6 ELSE 0 END
      + CASE WHEN t.term_en ILIKE :${key} THEN 6 ELSE 0 END
      + CASE WHEN t.pinyin ILIKE :${key} THEN 3 ELSE 0 END
      + CASE WHEN t.definition_zh ILIKE :${key} THEN 1 ELSE 0 END
      + CASE WHEN t.definition_vi ILIKE :${key} THEN 1 ELSE 0 END
      + CASE WHEN t.definition_en ILIKE :${key} THEN 1 ELSE 0 END)`
    );
    whereParts.push(
      `(t.term_zh ILIKE :${key} OR t.term_vi ILIKE :${key} OR t.term_en ILIKE :${key}
        OR t.pinyin ILIKE :${key} OR t.definition_zh ILIKE :${key}
        OR t.definition_vi ILIKE :${key} OR t.definition_en ILIKE :${key})`
    );
  });
  // LIMIT is interpolated only after the value has been parsed and clamped above.
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 5, 1), 50);

  const rows = await query(
    `SELECT t.id, t.term_zh, t.term_en, t.term_vi, t.pinyin, t.difficulty,
            t.definition_zh, t.definition_en, t.definition_vi,
            c.name_zh AS category_zh, c.name_vi AS category_vi, c.name_en AS category_en,
            (${scoreParts.join(' + ')}) AS score
     FROM railway_term t
     JOIN term_category c ON t.category_id = c.id
     WHERE t.status = 'enabled' AND (${whereParts.join(' OR ')})
     ORDER BY score DESC, t.id
     LIMIT ${safeLimit}`,
    params
  );
  return rows.filter((r) => Number(r.score) > 0);
}

/** 把检索结果渲染成注入 system prompt 的上下文块。 */
export function buildContext(rows, lang = 'zh') {
  if (!rows.length) return '';
  const lines = rows.map((r) => {
    const def = lang === 'vi' ? r.definition_vi : lang === 'en' ? r.definition_en : r.definition_zh;
    return `- ${r.term_zh} / ${r.term_vi} / ${r.term_en}（${r.category_zh}，难度 ${r.difficulty}）：${def || '—'}`;
  });
  return `【术语库检索结果】\n${lines.join('\n')}`;
}

/** 组装 system prompt。 */
export function buildSystemPrompt({ lang = 'zh', context = '' } = {}) {
  const langRule = {
    zh: '请用简体中文回答。',
    en: 'Answer in English.',
    vi: 'Trả lời bằng tiếng Việt.'
  }[lang] || '请用简体中文回答。';

  return [
    '你是「汉越铁道术语学习软件」内置的智能助手，面向学习铁道专业的越南留学生。',
    '你熟悉铁路基础设施、轨道工程、机车车辆、信号与通信、调度指挥等领域的专业术语。',
    '回答术语问题时，尽量给出 中文 / Tiếng Việt / English 三语对照，并附简短释义。',
    '若下方提供了【术语库检索结果】，优先依据它作答，不要编造库里没有的术语含义。',
    '若检索结果与问题无关，就按你自身的知识回答，并说明这不是来自本软件术语库。',
    '回答保持简洁，适合学习场景，不要输出大段无关内容。',
    langRule,
    context
  ].filter(Boolean).join('\n');
}

/**
 * 给 Whisper 用的领域提示词（ASR 的 initial_prompt）。
 *
 * 为什么需要：Whisper 对「道岔」「khổ đường」这类低频专业词没有先验，单句短音频下会
 * 稳定听成同音常用词（实测 small 把「道岔」听成「倒差」）。initial_prompt 相当于把
 * 解码器往领域词表上偏，是提升专业词识别率最省事也最有效的一招。
 *
 * 两个附带好处：
 *  - 中文提示词会让输出偏向**简体**（Whisper 默认常吐繁体）；
 *  - 提示词语言与音频语言一致时效果最好，所以按 lang 取对应字段。
 *
 * 约束：Whisper 的 initial_prompt 上限 224 token，超了会静默截断，所以这里按**字符数**
 * 保守裁剪（中文 1 字≈1~2 token，越南语词会被切成多个 subword，故预算更紧）。
 * 术语表变化不频繁，结果按语言缓存，避免每次识别都查库。
 */

/** 各语言的字符预算：宁可少给几个词，也不要触发截断把整段提示丢掉。 */
const PROMPT_BUDGET = { zh: 180, vi: 140, en: 160 };
const PROMPT_PREFIX = {
  zh: '以下是铁道专业术语：',
  vi: 'Thuật ngữ chuyên ngành đường sắt:',
  en: 'Railway terminology:'
};
const PROMPT_TTL_MS = 10 * 60 * 1000;

const promptCache = new Map(); // lang -> { value, at }

/**
 * 生成领域提示词。失败一律返回空串——语音识别不该因为查库失败就整个不可用。
 * @param {string} lang 'zh' | 'vi' | 'en'
 */
export async function domainPrompt(lang = 'zh') {
  const column = { zh: 'term_zh', vi: 'term_vi', en: 'term_en' }[lang];
  if (!column) return '';

  const cached = promptCache.get(lang);
  if (cached && Date.now() - cached.at < PROMPT_TTL_MS) return cached.value;

  let value = '';
  try {
    // 只用启用中的术语。column 来自上面的固定映射表，不是用户输入，无注入面。
    //
    // 排除含数字的词条：`npm run seed:test-data` 会往术语表灌 100 条「铁路测试001」
    // 这类占位数据（为了让分页测试有意义），真实术语只有 10 条。把这些灌进提示词，
    // 解码器会往「XX测试0NN」的句式上偏，比不给提示词还糟。
    // 用「含数字」而不是匹配「测试」，是为了不把造数脚本的具体命名写死进业务代码。
    const rows = await query(
      `SELECT ${column} AS term FROM railway_term
       WHERE status = 'enabled' AND ${column} <> '' AND ${column} NOT REGEXP '[0-9]'
       ORDER BY id LIMIT 200`
    );
    const budget = PROMPT_BUDGET[lang];
    const picked = [];
    let used = PROMPT_PREFIX[lang].length;
    for (const row of rows) {
      const term = String(row.term).trim();
      // 「、」比逗号更贴合中文术语罗列的写法，越南语/英文用逗号
      const sep = picked.length ? (lang === 'zh' ? '、' : ', ') : '';
      if (used + sep.length + term.length > budget) break;
      used += sep.length + term.length;
      picked.push(term);
    }
    if (picked.length) value = PROMPT_PREFIX[lang] + picked.join(lang === 'zh' ? '、' : ', ');
  } catch {
    value = ''; // 查库失败就退回「无提示词」，行为与改动前一致
  }

  promptCache.set(lang, { value, at: Date.now() });
  return value;
}
