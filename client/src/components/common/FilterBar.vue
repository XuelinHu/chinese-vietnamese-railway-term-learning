<script setup>
import { useI18n } from '../../composables/useI18n';

/**
 * 列表页筛选条。
 *
 * 两种用法：
 *  1. 内置关键词框：<FilterBar v-model:keyword="filters.keyword" @search="search">
 *  2. 完全自定义：把控件塞进默认插槽，@search 仍然生效
 */
const { tr } = useI18n();

defineProps({
  keyword: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  showKeyword: { type: Boolean, default: true }
});

const emit = defineEmits(['update:keyword', 'search', 'reset']);
</script>

<template>
  <div class="filters">
    <input
      v-if="showKeyword"
      :value="keyword"
      :placeholder="placeholder || tr('keywordPlaceholder')"
      @input="emit('update:keyword', $event.target.value)"
      @keyup.enter="emit('search')"
    />
    <slot />
    <button class="primary" @click="emit('search')">{{ tr('search') }}</button>
    <button @click="emit('reset')">{{ tr('reset') }}</button>
  </div>
</template>
