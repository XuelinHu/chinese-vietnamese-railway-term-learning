import { computed, reactive, ref } from 'vue';
import { qs, request } from '../api/http';

/**
 * 「每个菜单都分页」的落点。
 *
 * 所有列表页共用这一套：持有 {page, pageSize, total, keyword, filters}，
 * 暴露 load()。配合 <FilterBar> + <PaginationBar> 使用，
 * 十三个管理台菜单不必各写一遍分页逻辑。
 *
 * 约定的后端信封恒为 { rows, total, page, pageSize }。
 *
 * @param {string|(() => string)} path 列表接口路径，如 '/system/users'。
 *        传函数时每次 load 重新求值——用于路径依赖当前选中行的场景
 *        （如某条练习记录的答题明细、某个会话的消息）。
 * @param {object} options
 * @param {number} options.pageSize 每页条数，默认 10
 * @param {object} options.filters 初始筛选值（会被浅拷贝）
 * @param {boolean} options.immediate 创建时立即加载
 */
export function usePagination(path, { pageSize = 10, filters = {}, immediate = false } = {}) {
  const rows = ref([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref('');

  const pager = reactive({ page: 1, pageSize });
  const filterState = reactive({ keyword: '', ...filters });

  const pageCount = computed(() => Math.max(Math.ceil(total.value / pager.pageSize), 1));
  const isEmpty = computed(() => !loading.value && rows.value.length === 0);

  /** 收集非空筛选项 + 分页参数。空的筛选项不会进 query string。 */
  function params() {
    return {
      ...filterState,
      page: pager.page,
      pageSize: pager.pageSize
    };
  }

  /** 路径允许是函数：详情类列表要在打开某一行之后才知道 URL。 */
  function resolvePath() {
    return typeof path === 'function' ? path() : path;
  }

  async function load() {
    const url = resolvePath();
    if (!url) {
      rows.value = [];
      total.value = 0;
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      const data = await request(`${url}${qs(params())}`);
      // 兼容两种返回：分页信封，或后端某处直接返回数组。
      if (Array.isArray(data)) {
        rows.value = data;
        total.value = data.length;
      } else {
        rows.value = data.rows || [];
        total.value = Number(data.total ?? rows.value.length);
      }
      // 删到最后一页空了就自动回退一页，避免停在空白页。
      if (rows.value.length === 0 && pager.page > 1 && total.value > 0) {
        pager.page = Math.min(pager.page - 1, pageCount.value);
        return load();
      }
    } catch (err) {
      error.value = err.message;
      rows.value = [];
      total.value = 0;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** 改筛选条件后必须回到第 1 页，否则会停在越界页。 */
  function search() {
    pager.page = 1;
    return load();
  }

  function reset() {
    Object.keys(filterState).forEach((key) => {
      filterState[key] = key === 'keyword' ? '' : filters[key] ?? '';
    });
    pager.page = 1;
    pager.pageSize = pageSize;
    return load();
  }

  function goPage(next) {
    const target = Math.min(Math.max(Number(next) || 1, 1), pageCount.value);
    if (target === pager.page) return Promise.resolve();
    pager.page = target;
    return load();
  }

  function changePageSize(size) {
    pager.pageSize = Number(size) || pageSize;
    pager.page = 1;
    return load();
  }

  if (immediate) load();

  return {
    rows,
    total,
    loading,
    error,
    pager,
    filters: filterState,
    pageCount,
    isEmpty,
    load,
    search,
    reset,
    goPage,
    changePageSize
  };
}
