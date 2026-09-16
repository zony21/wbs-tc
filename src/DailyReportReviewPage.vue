<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
  name: string
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

interface ScheduleDay {
  key: string
  day: number
  weekdayIndex: number
  weekdayLabel: string
  isToday: boolean
  report?: DailyReport
}

const workTypeLabels: Record<WorkType, string> = {
  normal: '通常勤務',
  staggered: '時差出勤',
  remote: '在宅勤務',
  other: 'その他',
}

const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土']
const open = ref(false)
const loading = ref(false)
const loadError = ref('')
const state = ref<AppState>({ projects: [], sections: [], tasks: [], reports: [] })

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const selectedMonth = ref(currentMonthValue())

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0
  return hour * 60 + minute
}

function reportWorkHours(report: DailyReport) {
  let duration = minutes(report.endTime) - minutes(report.startTime)
  if (duration < 0) duration += 24 * 60
  return Math.max(0, duration / 60 - (Number(report.breakHours) || 0))
}

function taskHours(report: DailyReport) {
  return report.entries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0)
}

function numberLabel(value: number) {
  return Number(value.toFixed(2)).toString()
}

function taskName(taskId: string) {
  const task = state.value.tasks.find((candidate) => candidate.id === taskId)
  if (!task) return taskId
  const section = state.value.sections.find((candidate) => candidate.id === task.sectionId)
  const project = state.value.projects.find((candidate) => candidate.id === section?.projectId)
  return `${project?.name || '案件不明'}｜${task.id}｜${task.name}`
}

function taskTooltip(report: DailyReport) {
  if (!report.entries.length) return '作業実績なし'
  return report.entries.map((entry) => `${taskName(entry.taskId)} ${numberLabel(entry.hours)}h`).join('\n')
}

function taskSummary(report: DailyReport) {
  if (!report.entries.length) return '作業なし'
  const first = taskName(report.entries[0].taskId)
  if (report.entries.length === 1) return `${first} / ${numberLabel(taskHours(report))}h`
  return `${first} ほか${report.entries.length - 1}件 / ${numberLabel(taskHours(report))}h`
}

function monthLabel() {
  const [year, month] = selectedMonth.value.split('-')
  return `${year}年 ${Number(month)}月`
}

function shiftMonth(amount: number) {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  const next = new Date(year, month - 1 + amount, 1)
  selectedMonth.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

const filteredReports = computed(() => state.value.reports
  .filter((report) => report.date.startsWith(`${selectedMonth.value}-`))
  .sort((a, b) => a.date.localeCompare(b.date)))

const scheduleDays = computed<ScheduleDay[]>(() => {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const reportMap = new Map(state.value.reports.map((report) => [report.date, report]))
  const today = dateKey(new Date())

  return Array.from({ length: lastDay }, (_, index) => {
    const date = new Date(year, month - 1, index + 1)
    const key = dateKey(date)
    const weekdayIndex = date.getDay()
    return {
      key,
      day: index + 1,
      weekdayIndex,
      weekdayLabel: weekdayLabels[weekdayIndex],
      isToday: key === today,
      report: reportMap.get(key),
    }
  })
})

const totalWorkHours = computed(() => filteredReports.value.reduce((sum, report) => sum + reportWorkHours(report), 0))
const totalOvertimeHours = computed(() => filteredReports.value.reduce((sum, report) => sum + (Number(report.overtimeHours) || 0), 0))
const totalTaskHours = computed(() => filteredReports.value.reduce((sum, report) => sum + taskHours(report), 0))

async function openReview() {
  open.value = true
  loading.value = true
  loadError.value = ''
  try {
    await flushStateToDatabase()
    const response = await fetch('/api/state', { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    state.value = await response.json() as AppState
  } catch (error) {
    console.error(error)
    loadError.value = '日報データをSQLiteから取得できませんでした。'
  } finally {
    loading.value = false
  }
}

function closeReview() {
  open.value = false
}

function openDailyEntry() {
  open.value = false
  window.dispatchEvent(new CustomEvent('wbs-open-daily-entry'))
}

function openWeeklyReport() {
  window.dispatchEvent(new CustomEvent('wbs-open-weekly-report'))
}

function controlByLabel(text: string) {
  const labels = [...document.querySelectorAll<HTMLLabelElement>('.main-content label')]
  const label = labels.find((candidate) => candidate.querySelector('span')?.textContent?.trim() === text)
  return label?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select') ?? null
}

function setControlValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null, value: string) {
  if (!control) return
  const prototype = control instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(control, value)
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

async function chooseTask(row: HTMLElement, taskId: string) {
  const picker = row.querySelector<HTMLButtonElement>('.task-picker-button')
  if (!picker) return
  picker.click()
  await nextFrame()
  await nextFrame()

  const projectFilter = document.querySelector<HTMLSelectElement>('.project-task-search select')
  if (projectFilter) setControlValue(projectFilter, '')
  await nextFrame()

  const result = [...document.querySelectorAll<HTMLButtonElement>('.task-result-list > button')]
    .find((button) => button.querySelector('strong')?.textContent?.trim() === taskId)
  result?.click()
  await nextFrame()
}

async function editReport(report: DailyReport) {
  open.value = false
  window.dispatchEvent(new CustomEvent('wbs-open-daily-entry'))
  await new Promise((resolve) => window.setTimeout(resolve, 100))
  await nextFrame()

  const clearButton = [...document.querySelectorAll<HTMLButtonElement>('.daily-layout .form-actions button')]
    .find((button) => button.textContent?.trim() === '入力をクリア')
  clearButton?.click()
  await nextFrame()

  setControlValue(controlByLabel('日付'), report.date)
  setControlValue(controlByLabel('勤務区分'), report.workType)
  setControlValue(controlByLabel('出勤時刻'), report.startTime)
  setControlValue(controlByLabel('退勤時刻'), report.endTime)
  setControlValue(controlByLabel('休憩時間'), String(report.breakHours))
  setControlValue(controlByLabel('残業時間'), String(report.overtimeHours))
  setControlValue(document.querySelector<HTMLTextAreaElement>('.main-content textarea'), report.remarks)

  const addButton = [...document.querySelectorAll<HTMLButtonElement>('.daily-layout button')]
    .find((button) => button.textContent?.trim() === '＋ 作業追加')
  for (let index = 1; index < report.entries.length; index += 1) {
    addButton?.click()
    await nextFrame()
  }

  const rows = [...document.querySelectorAll<HTMLElement>('.daily-entry')]
  for (let index = 0; index < report.entries.length; index += 1) {
    const entry = report.entries[index]
    const row = rows[index]
    if (!row) continue
    await chooseTask(row, entry.taskId)
    const hoursInput = row.querySelector<HTMLInputElement>('.hours-field input')
    if (hoursInput) setControlValue(hoursInput, String(entry.hours))
  }
}

onMounted(() => {
  window.addEventListener('wbs-open-daily-review', openReview)
  window.addEventListener('wbs-close-daily-review', closeReview)
})

onBeforeUnmount(() => {
  window.removeEventListener('wbs-open-daily-review', openReview)
  window.removeEventListener('wbs-close-daily-review', closeReview)
})
</script>

<template>
  <section v-if="open" class="drx-page" aria-labelledby="drx-title">
    <header class="drx-header">
      <div>
        <p class="drx-eyebrow">DAILY REPORT REVIEW</p>
        <h1 id="drx-title">日報確認</h1>
        <span>月ごとの勤務実績と作業内容を、1日1行で確認できます。</span>
      </div>
      <div class="drx-header-actions">
        <button type="button" class="drx-button drx-button-secondary" @click="openWeeklyReport">週報出力</button>
        <button type="button" class="drx-button drx-button-primary" @click="openDailyEntry">＋ 日報登録</button>
      </div>
    </header>

    <div class="drx-monthbar">
      <button type="button" aria-label="前月" @click="shiftMonth(-1)">‹</button>
      <input v-model="selectedMonth" type="month" aria-label="確認する月">
      <button type="button" aria-label="翌月" @click="shiftMonth(1)">›</button>
      <strong>{{ monthLabel() }}</strong>
    </div>

    <div v-if="loading" class="drx-message">日報を読み込んでいます…</div>
    <template v-else>
      <p v-if="loadError" class="drx-message drx-message-error">{{ loadError }}</p>

      <div class="drx-summary">
        <div><span>登録日数</span><strong>{{ filteredReports.length }}日</strong></div>
        <div><span>実労働合計</span><strong>{{ numberLabel(totalWorkHours) }}h</strong></div>
        <div><span>残業合計</span><strong>{{ numberLabel(totalOvertimeHours) }}h</strong></div>
        <div><span>タスク工数合計</span><strong>{{ numberLabel(totalTaskHours) }}h</strong></div>
      </div>

      <div class="drx-table-scroll">
        <div class="drx-table-card">
          <table class="drx-table">
            <colgroup>
              <col class="drx-col-day">
              <col class="drx-col-weekday">
              <col class="drx-col-state">
              <col class="drx-col-worktype">
              <col class="drx-col-time">
              <col class="drx-col-actual">
              <col class="drx-col-overtime">
              <col class="drx-col-task">
              <col class="drx-col-action">
            </colgroup>
            <thead>
              <tr>
                <th>日</th>
                <th>曜日</th>
                <th>状態</th>
                <th>勤務区分</th>
                <th>勤務時間</th>
                <th>実労働</th>
                <th>残業</th>
                <th>作業内容</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="day in scheduleDays"
                :key="day.key"
                :class="['drx-row', { 'drx-saturday': day.weekdayIndex === 6, 'drx-sunday': day.weekdayIndex === 0, 'drx-today': day.isToday }]"
              >
                <td class="drx-day-cell">
                  <strong>{{ day.day }}</strong>
                  <small v-if="day.isToday">今日</small>
                </td>
                <td class="drx-weekday-cell">{{ day.weekdayLabel }}</td>

                <template v-if="day.report">
                  <td>
                    <span :class="['drx-status', day.report.id.startsWith('DRAFT-') ? 'drx-status-draft' : 'drx-status-submitted']">
                      {{ day.report.id.startsWith('DRAFT-') ? '仮保存' : '登録済み' }}
                    </span>
                  </td>
                  <td>{{ workTypeLabels[day.report.workType] }}</td>
                  <td class="drx-nowrap">{{ day.report.startTime }} ～ {{ day.report.endTime }}</td>
                  <td class="drx-hours">{{ numberLabel(reportWorkHours(day.report)) }}h</td>
                  <td :class="['drx-hours', { 'drx-overtime-active': day.report.overtimeHours > 0 }]">
                    {{ numberLabel(day.report.overtimeHours) }}h
                  </td>
                  <td class="drx-task-cell">
                    <details class="drx-task-details">
                      <summary :title="taskTooltip(day.report)">
                        <span>{{ taskSummary(day.report) }}</span>
                        <strong>{{ day.report.entries.length }}件</strong>
                      </summary>
                      <div class="drx-task-panel">
                        <div v-if="day.report.entries.length" class="drx-task-list">
                          <div v-for="entry in day.report.entries" :key="entry.rowId">
                            <span :title="taskName(entry.taskId)">{{ taskName(entry.taskId) }}</span>
                            <strong>{{ numberLabel(entry.hours) }}h</strong>
                          </div>
                        </div>
                        <p v-else class="drx-empty-text">作業実績はありません。</p>
                        <div v-if="day.report.remarks" class="drx-remarks">
                          <strong>備考</strong>
                          <p>{{ day.report.remarks }}</p>
                        </div>
                      </div>
                    </details>
                  </td>
                  <td class="drx-action-cell">
                    <button type="button" class="drx-edit-button" @click="editReport(day.report)">修正</button>
                  </td>
                </template>

                <template v-else>
                  <td class="drx-muted drx-state-empty">未登録</td>
                  <td class="drx-muted">－</td>
                  <td class="drx-muted">－</td>
                  <td class="drx-muted">－</td>
                  <td class="drx-muted">－</td>
                  <td class="drx-muted drx-task-empty">－</td>
                  <td class="drx-muted">－</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.drx-page {
  position: fixed;
  inset: 0 0 0 236px;
  z-index: 40;
  overflow-y: auto;
  padding: 26px clamp(18px, 3vw, 42px) 48px;
  background: #f4f7fa;
  color: #263b50;
}
.drx-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 20px;
}
.drx-eyebrow {
  margin: 0 0 5px;
  color: #14a6b6;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .12em;
}
.drx-header h1 {
  margin: 0;
  color: #17354d;
  font-size: clamp(24px, 3vw, 34px);
}
.drx-header > div > span {
  display: block;
  margin-top: 7px;
  color: #6b7f8e;
  font-size: 13px;
}
.drx-header-actions { display: flex; align-items: center; gap: 8px; }
.drx-button {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 9px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.drx-button-primary { border: 0; background: #14a6b6; color: #fff; }
.drx-button-secondary { border: 1px solid #dce5eb; background: #fff; color: #17354d; }
.drx-monthbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border: 1px solid #dce5eb;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(31, 64, 83, .04);
}
.drx-monthbar button {
  width: 36px;
  height: 36px;
  border: 1px solid #d5dee7;
  border-radius: 9px;
  background: #fff;
  color: #17354d;
  font-size: 22px;
  cursor: pointer;
}
.drx-monthbar input {
  width: auto;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid #cad6e2;
  border-radius: 9px;
  background: #fff;
  color: #243746;
  font: inherit;
}
.drx-monthbar strong { margin-left: 4px; color: #20364d; }
.drx-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.drx-summary > div {
  padding: 14px 16px;
  border: 1px solid #dce5eb;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(31, 64, 83, .04);
}
.drx-summary span { display: block; color: #6b7f8e; font-size: 11px; }
.drx-summary strong { display: block; margin-top: 3px; color: #17354d; font-size: 21px; }
.drx-table-scroll { overflow-x: auto; margin-top: 16px; padding-bottom: 10px; }
.drx-table-card {
  min-width: 1120px;
  overflow: hidden;
  border: 1px solid #dce5eb;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 4px 18px rgba(31, 64, 83, .06);
}
.drx-table {
  width: 100%;
  margin: 0;
  border: 0;
  border-collapse: collapse;
  border-spacing: 0;
  table-layout: fixed;
  background: #fff;
}
.drx-col-day { width: 56px; }
.drx-col-weekday { width: 58px; }
.drx-col-state { width: 96px; }
.drx-col-worktype { width: 112px; }
.drx-col-time { width: 138px; }
.drx-col-actual { width: 90px; }
.drx-col-overtime { width: 82px; }
.drx-col-task { width: auto; }
.drx-col-action { width: 76px; }
.drx-table th,
.drx-table td {
  display: table-cell;
  box-sizing: border-box;
  padding: 8px;
  border: 0;
  border-right: 1px solid #e7edf2;
  border-bottom: 1px solid #edf1f4;
  background: #fff;
  color: #405970;
  vertical-align: middle;
  text-align: center;
  font-size: 12px;
  line-height: 1.35;
}
.drx-table th:last-child,
.drx-table td:last-child { border-right: 0; }
.drx-table thead th {
  height: 40px;
  background: #f7f9fb;
  color: #5b7083;
  font-size: 11px;
  font-weight: 800;
}
.drx-table tbody tr:last-child td { border-bottom: 0; }
.drx-row { height: 48px; }
.drx-row:hover td { background: #fbfdfe; }
.drx-day-cell strong { display: block; color: #263f55; font-size: 14px; }
.drx-day-cell small { display: block; margin-top: 1px; color: #1597a6; font-size: 9px; font-weight: 800; }
.drx-weekday-cell { color: #536b7d !important; font-weight: 800; }
.drx-saturday .drx-day-cell,
.drx-saturday .drx-weekday-cell { background: #f5f9fc !important; color: #2e6f9f !important; }
.drx-saturday .drx-day-cell strong { color: #2e6f9f; }
.drx-sunday .drx-day-cell,
.drx-sunday .drx-weekday-cell { background: #fff8f7 !important; color: #c84b40 !important; }
.drx-sunday .drx-day-cell strong { color: #c84b40; }
.drx-today .drx-day-cell { box-shadow: inset 3px 0 0 #14a6b6; }
.drx-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}
.drx-status-draft { background: #fff4d9; color: #9a6500; }
.drx-status-submitted { background: #e8f6ef; color: #28734d; }
.drx-nowrap { white-space: nowrap; }
.drx-hours { font-weight: 700; white-space: nowrap; }
.drx-overtime-active { background: #fff9f7 !important; color: #b34335 !important; }
.drx-task-cell { padding: 0 !important; text-align: left !important; }
.drx-task-details { width: 100%; }
.drx-task-details summary {
  min-height: 47px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px;
  cursor: pointer;
  list-style: none;
}
.drx-task-details summary::-webkit-details-marker { display: none; }
.drx-task-details summary span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #304b61;
  font-size: 11px;
}
.drx-task-details summary strong {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 999px;
  background: #eef4f7;
  color: #60758a;
  font-size: 10px;
}
.drx-task-details[open] { background: #f9fbfc; }
.drx-task-details[open] summary { background: #f3f8f9; }
.drx-task-panel { padding: 10px 12px 12px; border-top: 1px solid #e4ebf0; background: #f9fbfc; }
.drx-task-list { display: grid; gap: 6px; }
.drx-task-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #405970;
  font-size: 11px;
}
.drx-task-list > div span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drx-task-list > div strong { flex: 0 0 auto; color: #203e56; }
.drx-remarks { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #d6e0e7; }
.drx-remarks > strong { color: #6a7e8d; font-size: 10px; }
.drx-remarks p { margin: 3px 0 0; color: #405970; font-size: 11px; white-space: pre-wrap; }
.drx-action-cell { padding: 6px !important; }
.drx-edit-button {
  min-height: 30px;
  padding: 4px 9px;
  border: 1px solid #cbd7e2;
  border-radius: 7px;
  background: #fff;
  color: #17354d;
  font: inherit;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}
.drx-edit-button:hover { border-color: #8fcbd1; background: #f1fbfc; color: #117782; }
.drx-muted { color: #b0bac3 !important; }
.drx-state-empty { color: #94a2ae !important; font-weight: 700; }
.drx-task-empty { text-align: left !important; padding-left: 12px !important; }
.drx-empty-text { margin: 0; color: #8a99a6; font-size: 11px; }
.drx-message {
  margin-top: 18px;
  padding: 28px;
  border-radius: 12px;
  background: #fff;
  text-align: center;
  color: #6b7f8e;
}
.drx-message-error { color: #ad4436; background: #fff5f3; }
@media (max-width: 900px) {
  .drx-page { inset-left: 0; }
  .drx-header { align-items: flex-start; flex-direction: column; }
  .drx-header-actions { width: 100%; }
  .drx-header-actions .drx-button { flex: 1; }
  .drx-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .drx-page { padding: 18px 12px 36px; }
  .drx-monthbar { flex-wrap: wrap; }
  .drx-summary { gap: 8px; }
  .drx-summary > div { padding: 11px 12px; }
  .drx-summary strong { font-size: 18px; }
}
</style>
