<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
const dbOnline = ref(true)
const dbMessage = ref('')
const lastWeekLabel = ref('')
const thisWeekLabel = ref('')

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

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
  try {
    await flushStateToDatabase()
    const response = await fetch('/api/state', { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const state = await response.json() as AppState
    outputText.value = buildWeeklyReport(state)
    open.value = true
  } catch (error) {
    console.error(error)
    dbOnline.value = false
    dbMessage.value = '週報データをSQLiteから取得できませんでした。'
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
    if (textarea) {
      textarea.focus()
      textarea.select()
      const copied = document.execCommand('copy')
      copyStatus.value = copied ? 'コピーしました。' : 'コピーできませんでした。'
    }
  }
}

function handleDbStatus(event: Event) {
  const detail = (event as CustomEvent<{ online: boolean; message?: string }>).detail
  dbOnline.value = detail.online
  dbMessage.value = detail.message || ''
}

const dbStatusLabel = computed(() => dbOnline.value ? 'SQLite接続中' : 'SQLite未接続')

onMounted(() => window.addEventListener('wbs-db-status', handleDbStatus))
onBeforeUnmount(() => window.removeEventListener('wbs-db-status', handleDbStatus))
</script>

<template>
  <div class="weekly-tool">
    <div class="weekly-db-status" :class="{ offline: !dbOnline }" :title="dbMessage">
      <span></span>{{ dbStatusLabel }}
    </div>
    <button class="weekly-output-button" type="button" :disabled="loading" @click="generateReport">
      {{ loading ? '生成中…' : '週報を出力' }}
    </button>
  </div>

  <div v-if="open" class="weekly-backdrop" @click.self="open = false">
    <section class="weekly-modal" role="dialog" aria-modal="true" aria-labelledby="weekly-title">
      <header>
        <div>
          <p>WEEKLY REPORT</p>
          <h2 id="weekly-title">上層部共有用テキスト</h2>
        </div>
        <button type="button" aria-label="閉じる" @click="open = false">×</button>
      </header>

      <div class="weekly-periods">
        <span>先週：{{ lastWeekLabel }}</span>
        <span>今週：{{ thisWeekLabel }}</span>
      </div>

      <p class="weekly-help">日報とWBSから自動生成しています。送信前にこの欄で自由に修正できます。</p>
      <textarea id="weekly-report-output" v-model="outputText" rows="14"></textarea>

      <footer>
        <span class="weekly-copy-status" aria-live="polite">{{ copyStatus }}</span>
        <div>
          <button type="button" class="weekly-secondary" @click="open = false">閉じる</button>
          <button type="button" class="weekly-primary" @click="copyOutput">テキストをコピー</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.weekly-tool {
  position: fixed;
  right: 24px;
  top: 20px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 10px;
}
.weekly-db-status {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border: 1px solid #d7e0ea;
  border-radius: 999px;
  background: rgba(255, 255, 255, .96);
  color: #526273;
  font-size: 12px;
  font-weight: 700;
}
.weekly-db-status span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #26a269;
}
.weekly-db-status.offline span { background: #d64545; }
.weekly-output-button,
.weekly-primary,
.weekly-secondary {
  border: 0;
  border-radius: 10px;
  min-height: 40px;
  padding: 0 16px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.weekly-output-button,
.weekly-primary {
  background: #244d74;
  color: white;
}
.weekly-output-button:disabled { opacity: .6; cursor: wait; }
.weekly-secondary { background: #eef2f6; color: #33475b; }
.weekly-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(12, 28, 43, .55);
}
.weekly-modal {
  width: min(720px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  border-radius: 16px;
  background: white;
  box-shadow: 0 24px 70px rgba(0, 0, 0, .25);
  padding: 24px;
}
.weekly-modal header,
.weekly-modal footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.weekly-modal header p { margin: 0 0 4px; color: #7a8a9a; font-size: 11px; font-weight: 800; letter-spacing: .16em; }
.weekly-modal header h2 { margin: 0; color: #213547; font-size: 22px; }
.weekly-modal header > button { border: 0; background: transparent; font-size: 28px; cursor: pointer; color: #6b7785; }
.weekly-periods { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 10px; }
.weekly-periods span { padding: 7px 10px; border-radius: 8px; background: #f2f5f8; color: #536579; font-size: 12px; font-weight: 700; }
.weekly-help { margin: 0 0 10px; color: #6e7e8d; font-size: 13px; }
.weekly-modal textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid #cfd9e3;
  border-radius: 10px;
  padding: 14px;
  color: #25384a;
  background: #fbfcfd;
  font: 14px/1.75 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.weekly-modal footer { margin-top: 16px; }
.weekly-modal footer > div { display: flex; gap: 8px; }
.weekly-copy-status { color: #25734d; font-size: 13px; font-weight: 700; }
@media (max-width: 760px) {
  .weekly-tool { top: auto; right: 14px; bottom: 14px; flex-direction: column; align-items: flex-end; }
  .weekly-db-status { display: none; }
  .weekly-backdrop { padding: 12px; }
  .weekly-modal { padding: 18px; max-height: calc(100vh - 24px); }
  .weekly-modal footer { align-items: flex-end; flex-direction: column; }
}
</style>
