<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { flushStateToDatabase } from './dbSync'

type WorkType = 'normal' | 'staggered' | 'remote' | 'other'

interface WbsTask {
  id: string
  sectionId: string
  parentId: string | null
  name: string
  category: string
  startDate: string
  dueDate: string
  progress: number
  assignees: string[]
}

interface DailyEntry {
  rowId: string
  taskId: string
  hours: number
}

interface DailyReport {
  id: string
  date: string
  workType: WorkType
  startTime: string
  endTime: string
  breakHours: number
  overtimeHours: number
  remarks: string
  entries: DailyEntry[]
}

interface AppState {
  sections: unknown[]
  tasks: WbsTask[]
  reports: DailyReport[]
}

const open = ref(false)
const loading = ref(false)
const outputText = ref('')
const copyStatus = ref('')
const errorMessage = ref('')
const lastWeekLabel = ref('')
const thisWeekLabel = ref('')

function toDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function formatJapaneseDate(date: Date) {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function mondayOf(date: Date) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = result.getUTCDay()
  const offset = day === 0 ? -6 : 1 - day
  result.setUTCDate(result.getUTCDate() + offset)
  return result
}

function currentDateUtc() {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

function numberLabel(value: number) {
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(2)))
}

function buildWeeklyReport(state: AppState) {
  const thisWeekStart = mondayOf(currentDateUtc())
  const thisWeekEnd = addDays(thisWeekStart, 6)
  const lastWeekStart = addDays(thisWeekStart, -7)
  const lastWeekEnd = addDays(thisWeekStart, -1)
  const lastStartKey = toDateKey(lastWeekStart)
  const lastEndKey = toDateKey(lastWeekEnd)
  const thisStartKey = toDateKey(thisWeekStart)
  const thisEndKey = toDateKey(thisWeekEnd)

  lastWeekLabel.value = `${formatJapaneseDate(lastWeekStart)} ～ ${formatJapaneseDate(lastWeekEnd)}`
  thisWeekLabel.value = `${formatJapaneseDate(thisWeekStart)} ～ ${formatJapaneseDate(thisWeekEnd)}`

  const lastReports = state.reports.filter((report) => report.date >= lastStartKey && report.date <= lastEndKey)
  const overtime = lastReports.reduce((sum, report) => sum + (Number(report.overtimeHours) || 0), 0)

  const taskHours = new Map<string, number>()
  for (const report of lastReports) {
    for (const entry of report.entries) {
      taskHours.set(entry.taskId, (taskHours.get(entry.taskId) || 0) + (Number(entry.hours) || 0))
    }
  }

  const achievements = [...taskHours.entries()]
    .map(([taskId, hours]) => ({ task: state.tasks.find((task) => task.id === taskId), hours }))
    .filter((item): item is { task: WbsTask; hours: number } => Boolean(item.task))
    .sort((a, b) => b.hours - a.hours || a.task.id.localeCompare(b.task.id))
    .map(({ task }) => `・${task.name}（${task.progress}%）`)

  const plans = state.tasks
    .filter((task) => task.progress < 100 && task.startDate <= thisEndKey && task.dueDate >= thisStartKey)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
    .map((task) => `・${task.name}（${task.progress}%）`)

  while (achievements.length < 2) achievements.push('・（0%）')
  while (plans.length < 2) plans.push('・（0%）')

  return [
    '先週の残業時間および実績、今週の予定についてご報告いたします。',
    '',
    `先週の残業時間：${numberLabel(overtime)}時間`,
    '先週の主な実績：',
    ...achievements,
    '',
    '今週の主な予定：',
    ...plans,
  ].join('\n')
}

async function generateReport() {
  loading.value = true
  copyStatus.value = ''
  errorMessage.value = ''
  open.value = true
  try {
    await flushStateToDatabase()
    const response = await fetch('/api/state', { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const state = await response.json() as AppState
    outputText.value = buildWeeklyReport(state)
  } catch (error) {
    console.error(error)
    errorMessage.value = '週報データをSQLiteから取得できませんでした。'
  } finally {
    loading.value = false
  }
}

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(outputText.value)
    copyStatus.value = 'コピーしました。'
  } catch {
    const textarea = document.querySelector<HTMLTextAreaElement>('#weekly-report-output')
    if (!textarea) return
    textarea.focus()
    textarea.select()
    const copied = document.execCommand('copy')
    copyStatus.value = copied ? 'コピーしました。' : 'コピーできませんでした。'
  }
}

onMounted(() => window.addEventListener('wbs-open-weekly-report', generateReport))
onBeforeUnmount(() => window.removeEventListener('wbs-open-weekly-report', generateReport))
</script>

<template>
  <div v-if="open" class="weekly-backdrop" @click.self="open = false">
    <section class="weekly-modal" role="dialog" aria-modal="true" aria-labelledby="weekly-title">
      <header>
        <div>
          <p>WEEKLY REPORT</p>
          <h2 id="weekly-title">週報出力</h2>
          <span>日報確認から、上層部共有用テキストを生成します。</span>
        </div>
        <button type="button" aria-label="閉じる" @click="open = false">×</button>
      </header>

      <div v-if="loading" class="weekly-loading">週報を生成しています…</div>
      <template v-else>
        <p v-if="errorMessage" class="weekly-error">{{ errorMessage }}</p>
        <template v-else>
          <div class="weekly-periods">
            <span>先週：{{ lastWeekLabel }}</span>
            <span>今週：{{ thisWeekLabel }}</span>
          </div>
          <p class="weekly-help">日報とWBSから自動生成しています。送信前にこの欄で修正できます。</p>
          <textarea id="weekly-report-output" v-model="outputText" rows="14"></textarea>
        </template>
      </template>

      <footer>
        <span class="weekly-copy-status" aria-live="polite">{{ copyStatus }}</span>
        <div>
          <button type="button" class="weekly-secondary" @click="open = false">日報確認へ戻る</button>
          <button v-if="!loading && !errorMessage" type="button" class="weekly-primary" @click="copyOutput">テキストをコピー</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.weekly-backdrop {
  position: fixed;
  inset: 0;
  z-index: 180;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(17, 31, 48, .58);
}
.weekly-modal {
  width: min(760px, 94vw);
  overflow: hidden;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(15, 31, 49, .28);
}
.weekly-modal header,
.weekly-modal footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
}
.weekly-modal header { border-bottom: 1px solid #e1e8ef; }
.weekly-modal header p { margin: 0 0 2px; color: #718196; font-size: 11px; font-weight: 800; letter-spacing: .12em; }
.weekly-modal header h2 { margin: 0; color: #1d344c; font-size: 23px; }
.weekly-modal header span { display: block; margin-top: 4px; color: #78889a; font-size: 12px; }
.weekly-modal header > button {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 10px;
  background: #eef3f7;
  color: #29445c;
  font-size: 22px;
  cursor: pointer;
}
.weekly-periods {
  display: flex;
  gap: 10px;
  padding: 14px 22px 0;
}
.weekly-periods span { padding: 6px 10px; border-radius: 999px; background: #edf3f7; color: #476178; font-size: 12px; font-weight: 700; }
.weekly-help { margin: 14px 22px 8px; color: #718196; font-size: 12px; }
.weekly-modal textarea {
  display: block;
  width: calc(100% - 44px);
  margin: 0 22px;
  box-sizing: border-box;
  resize: vertical;
  padding: 14px;
  border: 1px solid #cdd8e3;
  border-radius: 10px;
  color: #253d54;
  font: inherit;
  line-height: 1.7;
}
.weekly-modal footer { margin-top: 16px; border-top: 1px solid #e1e8ef; }
.weekly-modal footer > div { display: flex; gap: 8px; }
.weekly-primary,
.weekly-secondary {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 9px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.weekly-primary { border: 0; background: #173f5f; color: #fff; }
.weekly-secondary { border: 1px solid #cbd7e2; background: #fff; color: #29465f; }
.weekly-copy-status { color: #3b7a57; font-size: 12px; font-weight: 700; }
.weekly-loading { padding: 48px 22px; text-align: center; color: #60758a; }
.weekly-error { margin: 20px 22px; padding: 12px 14px; border-radius: 9px; background: #fff0ee; color: #b13f32; font-weight: 700; }
@media (max-width: 600px) {
  .weekly-backdrop { padding: 10px; }
  .weekly-periods { flex-direction: column; align-items: flex-start; }
  .weekly-modal footer { align-items: flex-start; flex-direction: column; }
  .weekly-modal footer > div { width: 100%; }
  .weekly-primary, .weekly-secondary { flex: 1; }
}
</style>
