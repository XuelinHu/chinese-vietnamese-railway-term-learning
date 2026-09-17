<script setup>
import { computed } from 'vue';
import { useI18n } from '../../composables/useI18n';

/**
 * 分页条。「每个菜单都分页」统一走它，避免各页各写一套。
 */
const { tr } = useI18n();

const props = defineProps({
  page: { type: Number, required: true },
  pageSize: { type: Number, required: true },
  total: { type: Number, default: 0 },
  pageSizes: { type: Array, default: () => [10, 20, 50, 100] }
});

const emit = defineEmits(['update:page', 'update:pageSize']);

const pageCount = computed(() => Math.max(Math.ceil(props.total / props.pageSize), 1));

/** 当前页附近的页码；两端用 null 占位表示省略号。 */
const pages = computed(() => {
  const last = pageCount.value;
  const current = props.page;
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const set = new Set([1, last, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (current >= last - 2) [last - 1, last - 2, last - 3].forEach((n) => set.add(n));
  const list = [...set].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const out = [];
  list.forEach((n, i) => {
    if (i > 0 && n - list[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
});

function go(next) {
  const target = Math.min(Math.max(next, 1), pageCount.value);
  if (target !== props.page) emit('update:page', target);
}
</script>

<template>
  <div class="pagination">
    <span class="pagination-total">
      {{ tr('total') }} {{ total }} · {{ tr('page') }} {{ page }} / {{ pageCount }}
    </span>

    <select
      class="page-size"
      :value="pageSize"
      @change="emit('update:pageSize', Number($event.target.value))"
    >
      <option v-for="size in pageSizes" :key="size" :value="size">{{ size }} / {{ tr('page') }}</option>
    </select>

    <div class="pagination-buttons">
      <button :disabled="page <= 1" @click="go(1)">«</button>
      <button :disabled="page <= 1" @click="go(page - 1)">‹</button>
      <template v-for="(item, index) in pages" :key="`${item}-${index}`">
        <span v-if="item === null" class="ellipsis">…</span>
        <button v-else :class="{ active: item === page }" @click="go(item)">{{ item }}</button>
      </template>
      <button :disabled="page >= pageCount" @click="go(page + 1)">›</button>
      <button :disabled="page >= pageCount" @click="go(pageCount)">»</button>
    </div>
  </div>
</template>

<style scoped>
.pagination {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.pagination-total {
  font-size: 0.9rem;
}

.page-size {
  width: auto;
  padding: 6px 10px;
}

.pagination-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pagination-buttons button {
  min-width: 36px;
  padding: 6px 9px;
}

.ellipsis {
  padding: 0 4px;
}
</style>
