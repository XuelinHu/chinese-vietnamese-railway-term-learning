import { computed, ref } from 'vue';
import { messages } from '../locales/messages';

const STORAGE_KEY = 'lang';
const SUPPORTED = ['zh', 'en', 'vi'];

function initial() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return SUPPORTED.includes(saved) ? saved : 'zh';
}

// 模块级单例：切换语言时所有组件同步刷新。
const lang = ref(initial());

export function useI18n() {
  const t = computed(() => messages[lang.value] || messages.zh);

  function setLanguage(value) {
    if (!SUPPORTED.includes(value)) return;
    lang.value = value;
    localStorage.setItem(STORAGE_KEY, value);
    document.documentElement.lang = value === 'zh' ? 'zh-CN' : value === 'vi' ? 'vi-VN' : 'en';
  }

  /** 取词条；缺失时回退中文，再缺失就回显 key 本身，方便一眼看出漏翻。 */
  function tr(key) {
    const table = messages[lang.value] || messages.zh;
    return table[key] ?? messages.zh[key] ?? key;
  }

  return { lang, t, tr, setLanguage, supported: SUPPORTED };
}
