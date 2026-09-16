<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { flushStateToDatabase } from './dbSync'

type WorkType = 'normal' | 'staggered' | 'remote' | 'other'

interface Project {
  id: string
  name: string
}

interface Section {
  id: string
  projectId: string
}

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
  projects: Project[]
  sections: Section[]
  tasks: WbsTask[]
  reports: DailyReport[]
}

const open = ref(false)
const loading = ref(false)
const outputText = ref('')
const copyStatus = ref('')
const errorMessage = ref('')
const selectedMonday = ref(currentMondayKey())
const selectedWeekLabel = ref('')
const nextWeekLabel = ref('')
const loadedState = ref<AppState | null>(null)

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + days)
  return next
}

function mondayOf(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = result.getDay()
  const offset = day === 0 ? -6 : 1 - day
  result.setDate(result.getDate() + offset)
  return result
}

function currentMondayKey() {
  return toDateKey(mondayOf(new Date()))
}

function formatJapaneseDate(date: Date, includeYear = false) {
  return includeYear
    ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getMonth() + 1}/${date.getDate()}`
}

function numberLabel(value: number) {
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(2)))
}

function projectNameForTask(state: AppState, task: WbsTask) {
  const section = state.sections.find((candidate) => candidate.id === task.sectionId)
  const project = state.projects.find((candidate) => candidate.id === section?.projectId)
  return project?.name || '案件不明'
}

function taskLine(state: AppState, task: WbsTask) {
  return `・${projectNameForTask(state, task)}_${task.name}（${task.progress}%）`
}

function normalizeMonday() {
  if (!selectedMonday.value) selectedMonday.value = currentMondayKey()
  selectedMonday.value = toDateKey(mondayOf(parseDateKey(selectedMonday.value)))
  rebuildFromLoadedState()
}

function shiftWeek(amount: number) {
  const start = parseDateKey(selectedMonday.value || currentMondayKey())
  selectedMonday.value = toDateKey(addDays(start, amount * 7))
  rebuildFromLoadedState()
}

function buildWeeklyReport(state: AppState) {
  const weekStart = mondayOf(parseDateKey(selectedMonday.value || currentMondayKey()))
  const weekEnd = addDays(weekStart, 6)
  const nextStart = addDays(weekStart, 7)
  const nextEnd = addDays(weekStart, 13)

  const weekStartKey = toDateKey(weekStart)
  const weekEndKey = toDateKey(weekEnd)
  const nextStartKey = toDateKey(nextStart)
  const nextEndKey = toDateKey(nextEnd)

  selectedMonday.value = weekStartKey
  selectedWeekLabel.value = `${formatJapaneseDate(weekStart, true)}（月）～ ${formatJapaneseDate(weekEnd)}`
  nextWeekLabel.value = `${formatJapaneseDate(nextStart, true)}（月）～ ${formatJapaneseDate(nextEnd)}`

  const reports = state.reports
    .filter((report) => !report.id.startsWith('DRAFT-'))
    .filter((report) => report.date >= weekStartKey && report.date <= weekEndKey)

  const overtime = reports.reduce((sum, report) => sum + (Number(report.overtimeHours) || 0), 0)

  const taskHours = new Map<string, number>()
  for (const report of reports) {
    for (const entry of report.entries) {
      taskHours.set(entry.taskId, (taskHours.get(entry.taskId) || 0) + (Number(entry.hours) || 0))
    }
  }

  const achievements = [...taskHours.entries()]
    .map(([taskId, hours]) => ({ task: state.tasks.find((task) => task.id === taskId), hours }))
    .filter((item): item is { task: WbsTask; hours: number } => Boolean(item.task))
    .sort((a, b) => b.hours - a.hours || a.task.id.localeCompare(b.task.id))
    .map(({ task }) => taskLine(state, task))

  const plans = state.tasks
    .filter((task) => task.progress < 100 && task.startDate <= nextEndKey && task.dueDate >= nextStartKey)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
    .map((task) => taskLine(state, task))

  if (!achievements.length) achievements.push('・実績なし')
  if (!plans.length) plans.push('・予定なし')

  return [
    `${formatJapaneseDate(weekStart, true)}週の残業時間および実績、翌週の予定についてご報告いたします。`,
    '',
    `対象週の残業時間：${numberLabel(overtime)}時間`,
    '対象週の主な実績：',
    ...achievements,
    '',
    '翌週の主な予定：',
    ...plans,
  ].join('\n')
}

function rebuildFromLoadedState() {
  if (!loadedState.value) return
  outputText.value = buildWeeklyReport(loadedState.value)
  copyStatus.value = ''
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
    loadedState.value = await response.json() as AppState
    rebuildFromLoadedState()
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
          <span>対象週の日報を集計し、案件名・タスク名・タスク進捗を反映します。</span>
        </div>
        <button type="button" aria-label="閉じる" @click="open = false">×</button>
      </header>

      <div class="weekly-selector">
        <button type="button" aria-label="前週" @click="shiftWeek(-1)">‹</button>
        <label>
          <span>対象週（月曜日）</span>
          <input v-model="selectedMonday" type="date" @change="normalizeMonday">
        </label>
        <button type="button" aria-label="翌週" @click="shiftWeek(1)">›</button>
      </div>

      <div v-if="loading" class="weekly-loading">週報を生成しています…</div>
      <template v-else>
        <p v-if="errorMessage" class="weekly-error">{{ errorMessage }}</p>
        <template v-else>
          <div class="weekly-periods">
            <span>対象週：{{ selectedWeekLabel }}</span>
            <span>翌週：{{ nextWeekLabel }}</span>
          </div>
          <p class="weekly-help">対象週の実績・残業時間は正式登録済みの日報から集計します。仮保存の日報は週報に含めません。%はWBSタスクの進捗率です。</p>
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
  width: min(800px, 94vw);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
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
.weekly-selector {
  display: grid;
  grid-template-columns: 40px minmax(220px, 320px) 40px;
  align-items: end;
  gap: 8px;
  padding: 16px 22px 0;
}
.weekly-selector > button {
  height: 40px;
  border: 1px solid #cbd7e2;
  border-radius: 9px;
  background: #fff;
  color: #29465f;
  font-size: 22px;
  cursor: pointer;
}
.weekly-selector label { display: grid; gap: 6px; }
.weekly-selector label span { color: #64798c; font-size: 12px; font-weight: 700; }
.weekly-selector input {
  min-height: 40px;
  padding: 7px 10px;
  border: 1px solid #cbd7e2;
  border-radius: 9px;
  color: #253d54;
  font: inherit;
}
.weekly-periods {
  display: flex;
  gap: 10px;
  padding: 14px 22px 0;
}
.weekly-periods span { padding: 6px 10px; border-radius: 999px; background: #edf3f7; color: #476178; font-size: 12px; font-weight: 700; }
.weekly-help { margin: 14px 22px 8px; color: #718196; font-size: 12px; line-height: 1.6; }
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
  .weekly-selector { grid-template-columns: 40px 1fr 40px; }
  .weekly-periods { flex-direction: column; align-items: flex-start; }
  .weekly-modal footer { align-items: flex-start; flex-direction: column; }
  .weekly-modal footer > div { width: 100%; }
  .weekly-primary, .weekly-secondary { flex: 1; }
}
</style>
