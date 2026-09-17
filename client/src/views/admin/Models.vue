<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { listModels, pullModel, setDefaultModel, deleteModel } from '../../api/agent';
import { useAuth } from '../../composables/useAuth';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import FilterBar from '../../components/common/FilterBar.vue';
import PaginationBar from '../../components/common/PaginationBar.vue';

const { tr } = useI18n();
const { isAdmin } = useAuth();
const toast = useToast();

const models = ref([]);
const llmAvailable = ref(false);
const loading = ref(false);
const keyword = ref('');
const tierFilter = ref('');
const statusFilter = ref('');

// 模型目录是一次性返回的全量清单（同一个接口还要喂给智能体弹框的模型下拉，
// 不能改成后端分页信封），所以这里在前端分页，保证「每个菜单都能翻页」。
const page = ref(1);
const pageSize = ref(10);
const progress = reactive({});
const controllers = new Map();

const TIER_LABEL = {
  recommended: 'tierRecommended',
  light: 'tierLight',
  advanced: 'tierAdvanced',
  too_large: 'tierTooLarge'
};

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return models.value.filter((item) => {
    if (tierFilter.value && item.tier !== tierFilter.value) return false;
    if (statusFilter.value === 'installed' && !item.installed) return false;
    if (statusFilter.value === 'missing' && item.installed) return false;
    if (kw && !`${item.name} ${item.label} ${item.family}`.toLowerCase().includes(kw)) return false;
    return true;
  });
});

const pageRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});

onMounted(load);

onBeforeUnmount(() => {
  controllers.forEach((controller) => controller.abort());
  controllers.clear();
});

async function load() {
  loading.value = true;
  try {
    const data = await listModels();
    models.value = data.models || [];
    llmAvailable.value = Boolean(data.llmAvailable);
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
}

function reset() {
  keyword.value = '';
  tierFilter.value = '';
  statusFilter.value = '';
  page.value = 1;
  pageSize.value = 10;
}

function setPage(next) {
  page.value = Math.min(Math.max(next, 1), Math.max(Math.ceil(filtered.value.length / pageSize.value), 1));
}

function setPageSize(size) {
  pageSize.value = Number(size) || 10;
  page.value = 1;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

async function startPull(model) {
  if (progress[model.name]?.running) return;
  const controller = new AbortController();
  controllers.set(model.name, controller);
  progress[model.name] = { running: true, percent: 0, status: tr('pulling'), error: '' };
  try {
    await pullModel(
      model.name,
      (p) => {
        const entry = progress[model.name];
        if (!entry) return;
        entry.status = p.status || entry.status;
        // completed/total 早期可能缺失，做除法前必须挡住
        if (p.completed !== null && p.total) {
          entry.percent = Math.min(Math.round((p.completed / p.total) * 100), 100);
        } else if (p.status === 'done') {
          entry.percent = 100;
        }
      },
      controller.signal
    );
    progress[model.name] = { running: false, percent: 100, status: tr('installed'), error: '' };
    await load();
    toast.success(`${model.name} ${tr('installed')}`);
  } catch (err) {
    if (controller.signal.aborted) {
      delete progress[model.name];
    } else {
      progress[model.name] = { running: false, percent: 0, status: '', error: err.message };
      toast.error(err.message);
    }
  } finally {
    controllers.delete(model.name);
  }
}

function cancelPull(model) {
  controllers.get(model.name)?.abort();
}

async function makeDefault(model) {
  try {
    await setDefaultModel(model.name);
    await load();
    toast.success(tr('saved'));
  } catch (err) {
    toast.error(err.message);
  }
}

async function remove(model) {
  if (!confirm(`${tr('confirmDelete')}\n${model.name}`)) return;
  try {
    await deleteModel(model.name);
    await load();
    toast.success(tr('deleted'));
  } catch (err) {
    toast.error(err.message);
  }
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('modelManage') }}</h1>
        <p>{{ filtered.length }} / {{ models.length }} 条</p>
      </div>
      <button @click="load">{{ tr('refresh') }}</button>
    </div>

    <p v-if="!llmAvailable" class="notice">{{ tr('llmUnavailable') }}</p>

    <FilterBar
      v-model:keyword="keyword"
      :placeholder="tr('modelName')"
      @search="search"
      @reset="reset"
    >
      <select v-model="tierFilter" @change="search">
        <option value="">{{ tr('tier') }}</option>
        <option value="recommended">{{ tr('tierRecommended') }}</option>
        <option value="light">{{ tr('tierLight') }}</option>
        <option value="advanced">{{ tr('tierAdvanced') }}</option>
        <option value="too_large">{{ tr('tierTooLarge') }}</option>
      </select>
      <select v-model="statusFilter" @change="search">
        <option value="">{{ tr('filterStatus') }}</option>
        <option value="installed">{{ tr('installed') }}</option>
        <option value="missing">{{ tr('notInstalled') }}</option>
      </select>
    </FilterBar>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 240px">{{ tr('modelName') }}</th>
            <th style="width: 110px">{{ tr('tier') }}</th>
            <th style="width: 110px">{{ tr('size') }}</th>
            <th style="width: 120px">{{ tr('status') }}</th>
            <th>{{ tr('remark') }}</th>
            <th style="width: 250px; text-align: right">{{ tr('actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="empty">{{ tr('loading') }}</td>
          </tr>
          <tr v-else-if="!pageRows.length">
            <td colspan="6" class="empty">{{ tr('empty') }}</td>
          </tr>
          <tr v-for="model in pageRows" v-else :key="model.name">
            <td>
              <strong>{{ model.label }}</strong>
              <div class="sub">{{ model.name }}</div>
            </td>
            <td>
              <span class="tag" :class="model.tier">{{ tr(TIER_LABEL[model.tier]) || model.tier }}</span>
            </td>
            <td>{{ formatSize(model.sizeBytes) }}</td>
            <td>
              <span v-if="model.isDefault" class="tag default">{{ tr('defaultModel') }}</span>
              <span v-else-if="model.loaded" class="tag loaded">{{ tr('loaded') }}</span>
              <span v-else-if="model.installed" class="tag">{{ tr('installed') }}</span>
              <span v-else class="tag dim">{{ tr('notInstalled') }}</span>
            </td>
            <td>
              <div class="desc">{{ model.description }}</div>

              <!-- 拉取进度 -->
              <div v-if="progress[model.name]" class="progress-box">
                <div class="progress-track">
                  <div
                    class="progress-fill"
                    :class="{ error: progress[model.name].error }"
                    :style="{ width: `${progress[model.name].percent}%` }"
                  ></div>
                </div>
                <small>
                  {{ progress[model.name].error || progress[model.name].status }}
                  <template v-if="progress[model.name].running"> · {{ progress[model.name].percent }}%</template>
                </small>
              </div>
            </td>
            <td class="actions">
              <template v-if="isAdmin">
                <button
                  v-if="!model.installed && !progress[model.name]?.running"
                  class="mini primary"
                  :disabled="!llmAvailable"
                  @click="startPull(model)"
                >
                  {{ tr('pull') }}
                </button>
                <button
                  v-if="progress[model.name]?.running"
                  class="mini"
                  @click="cancelPull(model)"
                >
                  {{ tr('cancel') }}
                </button>
                <button
                  v-if="model.installed && !model.isDefault"
                  class="mini"
                  @click="makeDefault(model)"
                >
                  {{ tr('setDefault') }}
                </button>
                <button v-if="model.installed" class="mini" @click="remove(model)">
                  {{ tr('remove') }}
                </button>
              </template>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationBar
      :page="page"
      :page-size="pageSize"
      :total="filtered.length"
      @update:page="setPage"
      @update:page-size="setPageSize"
    />
  </section>
</template>

<style scoped>
.sub {
  color: #8593a1;
  font-size: 0.76rem;
}

.desc {
  color: #5b6b7a;
  font-size: 0.84rem;
}

.notice {
  padding: 10px 14px;
  margin: 0 0 14px;
  background: #fdf2e3;
  color: #a16207;
  border-radius: 8px;
  font-size: 0.88rem;
}

.actions {
  text-align: right;
}

.mini {
  padding: 3px 9px;
  font-size: 0.8rem;
  margin-left: 5px;
}

.muted {
  color: #97a6b3;
}

.dim {
  background: #f2f4f7;
  color: #758292;
}

.default {
  background: #e7f6ef;
  color: #0f766e;
}

.loaded {
  background: #e8f1fd;
  color: #1d4ed8;
}

.tag.recommended {
  background: #e7f6ef;
  color: #0f766e;
}

.tag.light {
  background: #eef2f7;
  color: #475569;
}

.tag.advanced {
  background: #fdf2e3;
  color: #a16207;
}

.tag.too_large {
  background: #fdecec;
  color: #b42318;
}

.progress-box {
  margin-top: 6px;
}

.progress-track {
  height: 6px;
  background: #eef2f6;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #0f766e;
  transition: width 0.25s ease;
}

.progress-fill.error {
  background: #b42318;
}

.progress-box small {
  color: #8593a1;
  font-size: 0.76rem;
}
</style>
