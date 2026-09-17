<script setup>
import { onMounted, ref } from 'vue';
import { del, get, post } from '../api/http';
import { useI18n } from '../composables/useI18n';
import { usePagination } from '../composables/usePagination';
import { useToast } from '../composables/useToast';
import FilterBar from '../components/common/FilterBar.vue';
import PagedTable from '../components/common/PagedTable.vue';
import Modal from '../components/common/Modal.vue';
import { speak } from '../voice';

const { tr } = useI18n();
const toast = useToast();

const categories = ref([]);
const favoriteIds = ref(new Set());
const detail = ref(null);

const list = usePagination('/terms', {
  pageSize: 10,
  filters: { categoryId: '', difficulty: '' }
});

const columns = [
  { key: 'term_zh', label: '中文' },
  { key: 'term_vi', label: 'Tiếng Việt' },
  { key: 'term_en', label: 'English' },
  { key: 'category_zh', label: tr('categories'), width: '130px' },
  { key: 'difficulty', label: tr('difficulty'), width: '100px' },
  { key: 'actions', label: tr('actions'), width: '170px', align: 'right' }
];

const difficultyLabel = (value) => tr(value) || value;

onMounted(async () => {
  try {
    // 下拉框用 options 接口：categories 在带 page 参数时返回分页信封，不带才是数组，容易踩坑。
    categories.value = await get('/terms/categories/options');
  } catch (err) {
    toast.error(err.message);
  }
  await Promise.all([list.load(), loadFavorites()]);
});

/** 收藏状态需要全量知道，否则按钮的星标会不准。取前 100 条足够覆盖个人使用。 */
async function loadFavorites() {
  try {
    const data = await get('/practice/favorites?page=1&pageSize=100');
    favoriteIds.value = new Set((data.rows || []).map((row) => row.term_id));
  } catch {
    favoriteIds.value = new Set();
  }
}

async function toggleFavorite(term) {
  const isFavorite = favoriteIds.value.has(term.id);
  try {
    if (isFavorite) {
      // 收藏删除接口要的是 favorite 记录 id，不是 term id，得先查出来。
      const data = await get(`/practice/favorites?page=1&pageSize=100&keyword=${encodeURIComponent(term.term_zh)}`);
      const row = (data.rows || []).find((item) => item.term_id === term.id);
      if (row) await del(`/practice/favorites/${row.id}`);
      favoriteIds.value.delete(term.id);
      toast.success(tr('removeFavorite'));
    } else {
      await post(`/terms/${term.id}/favorite`);
      favoriteIds.value.add(term.id);
      toast.success(tr('addFavorite'));
    }
    // Set 是浅层响应式的，手动触发一次刷新
    favoriteIds.value = new Set(favoriteIds.value);
  } catch (err) {
    toast.error(err.message);
  }
}

async function pronounce(text, lang) {
  try {
    await speak(text, lang);
  } catch (err) {
    toast.warn(err.message);
  }
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('terms') }}</h1>
        <p>{{ tr('totalTerms') }}: {{ list.total.value }}</p>
      </div>
    </div>

    <FilterBar
      v-model:keyword="list.filters.keyword"
      :placeholder="tr('keywordPlaceholder')"
      @search="list.search"
      @reset="list.reset"
    >
      <select v-model="list.filters.categoryId" @change="list.search">
        <option value="">{{ tr('filterCategory') }}</option>
        <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name_zh }}</option>
      </select>
      <select v-model="list.filters.difficulty" @change="list.search">
        <option value="">{{ tr('filterDifficulty') }}</option>
        <option value="easy">{{ tr('easy') }}</option>
        <option value="medium">{{ tr('medium') }}</option>
        <option value="hard">{{ tr('hard') }}</option>
      </select>
    </FilterBar>

    <PagedTable :pager="list" :columns="columns" :empty-text="tr('empty')">
      <template #cell-term_zh="{ row }">
        <strong>{{ row.term_zh }}</strong>
        <small v-if="row.pinyin">{{ row.pinyin }}</small>
      </template>

      <template #cell-term_vi="{ row }">
        <span>{{ row.term_vi }}</span>
        <button class="mini" :title="tr('pronunciation')" @click="pronounce(row.term_vi, 'vi')">🔊</button>
      </template>

      <template #cell-term_en="{ row }">
        <span>{{ row.term_en }}</span>
        <button class="mini" :title="tr('pronunciation')" @click="pronounce(row.term_en, 'en')">🔊</button>
      </template>

      <template #cell-difficulty="{ row }">
        <span class="tag">{{ difficultyLabel(row.difficulty) }}</span>
      </template>

      <template #cell-actions="{ row }">
        <button class="mini" @click="detail = row">{{ tr('detail') }}</button>
        <button class="mini" :class="{ active: favoriteIds.has(row.id) }" @click="toggleFavorite(row)">
          {{ favoriteIds.has(row.id) ? '★' : '☆' }}
        </button>
      </template>
    </PagedTable>

    <Modal :model-value="Boolean(detail)" :title="detail?.term_zh || ''" @update:model-value="detail = null">
      <div v-if="detail" class="detail-grid">
        <div class="detail-row">
          <span class="detail-label">中文</span>
          <p>{{ detail.term_zh }}<button class="mini" @click="pronounce(detail.term_zh, 'zh')">🔊</button></p>
        </div>
        <div class="detail-row">
          <span class="detail-label">Tiếng Việt</span>
          <p>{{ detail.term_vi }}<button class="mini" @click="pronounce(detail.term_vi, 'vi')">🔊</button></p>
        </div>
        <div class="detail-row">
          <span class="detail-label">English</span>
          <p>{{ detail.term_en }}<button class="mini" @click="pronounce(detail.term_en, 'en')">🔊</button></p>
        </div>
        <div class="detail-row">
          <span class="detail-label">{{ tr('categories') }}</span>
          <p>{{ detail.category_zh }}</p>
        </div>
        <div class="detail-row">
          <span class="detail-label">{{ tr('difficulty') }}</span>
          <p><span class="tag">{{ difficultyLabel(detail.difficulty) }}</span></p>
        </div>
        <div v-if="detail.definition_zh" class="detail-row">
          <span class="detail-label">中文释义</span>
          <p>{{ detail.definition_zh }}</p>
        </div>
        <div v-if="detail.definition_vi" class="detail-row">
          <span class="detail-label">Định nghĩa</span>
          <p>{{ detail.definition_vi }}</p>
        </div>
        <div v-if="detail.definition_en" class="detail-row">
          <span class="detail-label">Definition</span>
          <p>{{ detail.definition_en }}</p>
        </div>
      </div>
    </Modal>
  </section>
</template>

<style scoped>
.mini {
  padding: 3px 9px;
  font-size: 0.8rem;
  margin-left: 6px;
}

.detail-grid {
  display: grid;
  gap: 12px;
}

.detail-row {
  display: grid;
  grid-template-columns: 116px 1fr;
  gap: 12px;
  align-items: start;
  padding-bottom: 10px;
  border-bottom: 1px solid #eef2f6;
}

.detail-label {
  color: #607080;
  font-size: 0.88rem;
  font-weight: 650;
}

.detail-row p {
  margin: 0;
  line-height: 1.6;
}
</style>
