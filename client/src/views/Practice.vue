<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { get, getAllPages, post } from '../api/http';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import { speak } from '../voice';

const { tr } = useI18n();
const toast = useToast();

const categories = ref([]);
const questions = ref([]);
const answers = reactive({});
const result = ref(null);
const loading = ref(false);
const startedAt = ref(0);

const config = reactive({ type: 'choice', categoryId: '', difficulty: '', count: 5 });

const types = computed(() => [
  { value: 'choice', label: tr('choice') },
  { value: 'judge', label: tr('judge') },
  { value: 'fill', label: tr('fill') },
  { value: 'translate', label: tr('translate') }
]);

const answeredCount = computed(() => Object.values(answers).filter((v) => String(v ?? '').trim()).length);

onMounted(async () => {
  try {
    categories.value = await getAllPages('/terms/categories/options');
  } catch (err) {
    toast.error(err.message);
  }
});

async function start() {
  loading.value = true;
  result.value = null;
  questions.value = [];
  Object.keys(answers).forEach((key) => delete answers[key]);
  try {
    const data = await post('/practice/start', {
      type: config.type,
      categoryId: config.categoryId || null,
      difficulty: config.difficulty || null,
      count: Number(config.count) || 5
    });
    questions.value = data.questions || [];
    startedAt.value = Date.now();
    if (!questions.value.length) toast.warn(tr('empty'));
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function submit() {
  loading.value = true;
  try {
    // 判分需要把 correctAnswer 一并回传——出题接口本来就下发了它。
    const payload = questions.value.map((question, index) => ({
      termId: question.termId,
      type: question.type,
      questionText: question.questionText,
      correctAnswer: question.correctAnswer,
      userAnswer: answers[index] ?? ''
    }));
    result.value = await post('/practice/submit', {
      type: config.type,
      categoryId: config.categoryId || null,
      difficulty: config.difficulty || null,
      durationSeconds: Math.round((Date.now() - startedAt.value) / 1000),
      answers: payload
    });
    toast.success(`${tr('score')}: ${result.value.score}`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

function isCorrect(index) {
  return result.value?.answers?.[index]?.isCorrect;
}

/** 把题目文本里可能出现的越南语词读出来，方便听力记忆。 */
async function pronounce(text, lang) {
  try {
    await speak(text, lang);
  } catch (err) {
    toast.warn(err.message);
  }
}

const judgeLabel = (option) => {
  if (option === 'true') return `正确 / Đúng / True`;
  if (option === 'false') return `错误 / Sai / False`;
  return option;
};
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('practice') }}</h1>
        <p v-if="questions.length">
          {{ tr('questionCount') }}: {{ questions.length }} · 已答 {{ answeredCount }}
        </p>
      </div>
    </div>

    <div class="panel practice-config">
      <select v-model="config.type">
        <option v-for="item in types" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
      <select v-model="config.categoryId">
        <option value="">{{ tr('filterCategory') }}</option>
        <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name_zh }}</option>
      </select>
      <select v-model="config.difficulty">
        <option value="">{{ tr('filterDifficulty') }}</option>
        <option value="easy">{{ tr('easy') }}</option>
        <option value="medium">{{ tr('medium') }}</option>
        <option value="hard">{{ tr('hard') }}</option>
      </select>
      <input v-model.number="config.count" type="number" min="1" max="20" />
      <button class="primary" :disabled="loading" @click="start">
        {{ loading ? tr('loading') : tr('start') }}
      </button>
    </div>

    <div class="question-stack">
      <article v-for="(question, index) in questions" :key="`${question.termId}-${index}`" class="question">
        <h3>
          {{ index + 1 }}. {{ question.questionText }}
          <button class="mini" :title="tr('pronunciation')" @click="pronounce(question.questionText, 'vi')">🔊</button>
        </h3>

        <div v-if="question.options.length" class="options">
          <label v-for="option in question.options" :key="option">
            <input
              v-model="answers[index]"
              type="radio"
              :name="`q-${index}`"
              :value="option"
              :disabled="Boolean(result)"
            />
            {{ judgeLabel(option) }}
          </label>
        </div>
        <input v-else v-model="answers[index]" :placeholder="tr('yourAnswer')" :disabled="Boolean(result)" />

        <p v-if="result" :class="isCorrect(index) ? 'ok' : 'error'">
          {{ isCorrect(index) ? '✓ 正确' : `✗ ${tr('correctAnswer')}: ${question.correctAnswer}` }}
        </p>
        <p v-if="result && question.explanation" class="explanation">{{ question.explanation }}</p>
      </article>
    </div>

    <button
      v-if="questions.length && !result"
      class="primary submit"
      :disabled="loading"
      @click="submit"
    >
      {{ tr('submit') }}
    </button>

    <section v-if="result" class="result-panel">
      <strong>{{ result.score }}</strong>
      <span>{{ result.correct }} / {{ result.total }}</span>
      <button @click="start">{{ tr('start') }}</button>
    </section>
  </section>
</template>

<style scoped>
.mini {
  padding: 2px 8px;
  font-size: 0.8rem;
  margin-left: 6px;
}

.explanation {
  margin: 6px 0 0;
  color: #607080;
  font-size: 0.88rem;
}

.result-panel button {
  margin-left: auto;
}
</style>
