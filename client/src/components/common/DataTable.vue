<script setup>
/**
 * 通用表格。管理台所有列表共用。
 *
 * 列通过 columns 描述；需要自定义渲染时用作用域插槽 `cell-<key>`：
 *   <template #cell-status="{ row }"><span class="tag">{{ row.status }}</span></template>
 */
defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  emptyText: { type: String, default: '暂无数据' },
  rowKey: { type: String, default: 'id' }
});
</script>

<template>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            :style="col.width ? { width: col.width } : null"
            :class="{ 'col-right': col.align === 'right' }"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td :colspan="columns.length" class="table-state">加载中…</td>
        </tr>
        <tr v-else-if="!rows.length">
          <td :colspan="columns.length" class="table-state">{{ emptyText }}</td>
        </tr>
        <tr v-for="(row, index) in rows" v-else :key="row[rowKey] ?? index">
          <td
            v-for="col in columns"
            :key="col.key"
            :class="{ 'col-right': col.align === 'right' }"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]" :index="index">
              {{ row[col.key] ?? '—' }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-state {
  padding: 34px 12px;
  text-align: center;
  color: #758292;
}

.col-right {
  text-align: right;
}
</style>
