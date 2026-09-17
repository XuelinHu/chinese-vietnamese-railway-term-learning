<script setup>
import DataTable from './DataTable.vue';
import PaginationBar from './PaginationBar.vue';

/**
 * 「表格 + 分页条」二合一。管理台列表页统一用它，一处满足「每个菜单都分页」。
 *
 * pager 直接传 usePagination() 的返回值，分页状态与加载都由它自己管。
 * 自定义单元格的插槽按 DataTable 的命名约定（cell-<key>）原样透传。
 */
defineProps({
  pager: { type: Object, required: true },
  columns: { type: Array, required: true },
  emptyText: { type: String, default: '暂无数据' },
  rowKey: { type: String, default: 'id' }
});
</script>

<template>
  <DataTable
    :columns="columns"
    :rows="pager.rows.value"
    :loading="pager.loading.value"
    :empty-text="emptyText"
    :row-key="rowKey"
  >
    <!-- 只转发父级真正提供的插槽，避免“空插槽”把 DataTable 的默认取值覆盖掉 -->
    <template v-for="(_, name) in $slots" :key="name" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </DataTable>

  <PaginationBar
    :page="pager.pager.page"
    :page-size="pager.pager.pageSize"
    :total="pager.total.value"
    @update:page="pager.goPage"
    @update:page-size="pager.changePageSize"
  />
</template>
