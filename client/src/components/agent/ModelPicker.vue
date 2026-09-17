<script setup>
import { computed } from 'vue';
import { useI18n } from '../../composables/useI18n';

/**
 * 模型下拉框。按档位分组，未安装的条目标注并可一键拉取。
 */
const props = defineProps({
  models: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
  allowManage: { type: Boolean, default: false },
  pulling: { type: String, default: '' } // 正在拉取的模型名
});

const emit = defineEmits(['update:modelValue', 'pull']);

const { tr } = useI18n();

const TIERS = [
  { key: 'recommended', label: 'recommended' },
  { key: 'light', label: 'light' },
  { key: 'advanced', label: 'advanced' },
  { key: 'too_large', label: 'too_large' }
];

const grouped = computed(() =>
  TIERS.map((tier) => ({
    ...tier,
    items: props.models.filter((m) => m.tier === tier.key)
  })).filter((group) => group.items.length)
);

const tierLabel = (key) =>
  ({
    recommended: tr('tierRecommended'),
    light: tr('tierLight'),
    advanced: tr('tierAdvanced'),
    too_large: tr('tierTooLarge')
  })[key] || key;

function humanSize(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return '';
  const gb = value / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)}GB`;
  return `${(value / 1024 ** 2).toFixed(0)}MB`;
}
</script>

<template>
  <div class="model-picker">
    <select :value="modelValue" @change="emit('update:modelValue', $event.target.value)">
      <option v-if="!models.length" value="">—</option>
      <optgroup v-for="group in grouped" :key="group.key" :label="tierLabel(group.key)">
        <option v-for="model in group.items" :key="model.name" :value="model.name">
          {{ model.label }}{{ model.installed ? '' : ` · ${tr('notInstalled')}` }}
        </option>
      </optgroup>
    </select>

    <div v-if="allowManage" class="model-actions">
      <template v-for="model in models" :key="model.name">
        <button
          v-if="!model.installed"
          class="mini"
          :disabled="pulling === model.name"
          @click="emit('pull', model.name)"
        >
          {{ pulling === model.name ? tr('pulling') : `${tr('pull')} ${humanSize(model.sizeBytes)}` }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.model-picker {
  display: grid;
  gap: 6px;
}

select {
  min-width: 190px;
}

.model-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.mini {
  padding: 4px 9px;
  font-size: 0.8rem;
}
</style>
