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
  category: string
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

function taskName(taskId: string) {
  const task = state.value.tasks.find((candidate) => candidate.id === taskId)
  if (!task) return taskId
  const section = state.value.sections.find((candidate) => candidate.id === task.sectionId)
  const project = state.value.projects.find((candidate) => candidate.id === section?.projectId)
  return `${project?.name || '案件不明'}｜${task.id}｜${task.name}`
}

function taskTooltip(report: DailyReport) {
  if (!report.entries.length) return '作業実績なし'
  return report.entries
    .map((entry) => `${taskName(entry.taskId)} ${numberLabel(entry.hours)}h`)
    .join('\n')
}

function taskSummary(report: DailyReport) {
  if (!report.entries.length) return '作業なし'
  const first = taskName(report.entries[0].taskId)
  if (report.entries.length === 1) return `${first} / ${numberLabel(taskHours(report))}h`
  return `${first} ほか${report.entries.length - 1}件 / ${numberLabel(taskHours(report))}h`
}

function numberLabel(value: number) {
  return Number(value.toFixed(2)).toString()
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
  <section v-if="open" class="daily-review-page" aria-labelledby="daily-review-title">
    <header class="daily-review-header">
      <div>
        <p class="eyebrow">DAILY REPORT REVIEW</p>
        <h1 id="daily-review-title">日報確認</h1>
        <span>月ごとの勤務実績と作業内容を、1日1行で確認できます。</span>
      </div>
      <div class="daily-review-header-actions">
        <button type="button" class="action-secondary" @click="openWeeklyReport">週報出力</button>
        <button type="button" class="action-primary" @click="openDailyEntry">＋ 日報登録</button>
      </div>
    </header>

    <div class="daily-review-monthbar">
      <button type="button" aria-label="前月" @click="shiftMonth(-1)">‹</button>
      <input v-model="selectedMonth" type="month" aria-label="確認する月">
      <button type="button" aria-label="翌月" @click="shiftMonth(1)">›</button>
      <strong>{{ monthLabel() }}</strong>
    </div>

    <div v-if="loading" class="daily-review-loading">日報を読み込んでいます…</div>
    <template v-else>
      <p v-if="loadError" class="daily-review-error">{{ loadError }}</p>

      <div class="daily-review-summary">
        <div><span>登録日数</span><strong>{{ filteredReports.length }}日</strong></div>
        <div><span>実労働合計</span><strong>{{ numberLabel(totalWorkHours) }}h</strong></div>
        <div><span>残業合計</span><strong>{{ numberLabel(totalOvertimeHours) }}h</strong></div>
        <div><span>タスク工数合計</span><strong>{{ numberLabel(totalTaskHours) }}h</strong></div>
      </div>

      <div class="schedule-scroll">
        <div class="monthly-schedule">
          <table class="daily-schedule-table">
            <colgroup>
              <col class="col-day">
              <col class="col-weekday">
              <col class="col-state">
              <col class="col-work-type">
              <col class="col-work-time">
              <col class="col-actual">
              <col class="col-overtime">
              <col class="col-task">
              <col class="col-action">
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
                :class="[
                  'schedule-row',
                  { 'daily-report-card': day.report, saturday: day.weekdayIndex === 6, sunday: day.weekdayIndex === 0, today: day.isToday },
                ]"
              >
                <td class="date-cell">
                  <strong>{{ day.day }}</strong>
                  <small v-if="day.isToday">今日</small>
                </td>
                <td class="weekday-cell">{{ day.weekdayLabel }}</td>

                <template v-if="day.report">
                  <td class="report-badges state-cell">
                    <div class="report-card-header compat-header" aria-hidden="true">
                      <div><span>{{ day.report.date }}</span></div>
                    </div>
                    <span
                      :class="[
                        'daily-report-state-badge',
                        day.report.id.startsWith('DRAFT-') ? 'is-draft' : 'is-submitted',
                      ]"
                    >
                      {{ day.report.id.startsWith('DRAFT-') ? '仮保存' : '登録済み' }}
                    </span>
                  </td>
                  <td class="work-type-cell">{{ workTypeLabels[day.report.workType] }}</td>
                  <td class="work-time-cell">{{ day.report.startTime }} ～ {{ day.report.endTime }}</td>
                  <td class="actual-cell">{{ numberLabel(reportWorkHours(day.report)) }}h</td>
                  <td :class="['overtime-cell', { active: day.report.overtimeHours > 0 }]">
                    {{ numberLabel(day.report.overtimeHours) }}h
                  </td>
                  <td class="task-cell">
                    <details class="task-details">
                      <summary :title="taskTooltip(day.report)">
                        <span>{{ taskSummary(day.report) }}</span>
                        <strong>{{ day.report.entries.length }}件</strong>
                      </summary>
                      <div class="task-detail-panel">
                        <div v-if="day.report.entries.length" class="task-list">
                          <div v-for="entry in day.report.entries" :key="entry.rowId">
                            <span :title="taskName(entry.taskId)">{{ taskName(entry.taskId) }}</span>
                            <strong>{{ numberLabel(entry.hours) }}h</strong>
                          </div>
                        </div>
                        <p v-else class="empty-small">作業実績はありません。</p>
                        <div v-if="day.report.remarks" class="report-remarks">
                          <strong>備考</strong>
                          <p>{{ day.report.remarks }}</p>
                        </div>
                      </div>
                    </details>
                  </td>
                  <td class="report-action-cell"></td>
                </template>

                <template v-else>
                  <td class="empty-status">未登録</td>
                  <td class="empty-cell">－</td>
                  <td class="empty-cell">－</td>
                  <td class="empty-cell">－</td>
                  <td class="empty-cell">－</td>
                  <td class="empty-task">－</td>
                  <td class="empty-cell operation-empty">－</td>
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
.daily-review-page {
  position: fixed;
  inset: 0 0 0 236px;
  z-index: 40;
  overflow-y: auto;
  padding: 26px clamp(18px, 3vw, 42px) 48px;
  background: #f4f7fa;
  color: #263b50;
}
.daily-review-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 20px;
}
.eyebrow {
  margin: 0 0 5px;
  color: #14a6b6;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .12em;
}
.daily-review-header h1 {
  margin: 0;
  color: #17354d;
  font-size: clamp(24px, 3vw, 34px);
}
.daily-review-header > div > span {
  display: block;
  margin-top: 7px;
  color: #6b7f8e;
  font-size: 13px;
}
.daily-review-header-actions { display: flex; align-items: center; gap: 8px; }
.daily-review-header-actions button {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 9px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.action-primary { border: 0; background: #14a6b6; color: #fff; }
.action-secondary { border: 1px solid #dce5eb; background: #fff; color: #17354d; }
.daily-review-monthbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border: 1px solid #dce5eb;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(31, 64, 83, .04);
}
.daily-review-monthbar button {
  width: 36px;
  height: 36px;
  border: 1px solid #d5dee7;
  border-radius: 9px;
  background: #fff;
  color: #17354d;
  font-size: 22px;
  cursor: pointer;
}
.daily-review-monthbar input {
  width: auto;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid #cad6e2;
  border-radius: 9px;
  background: #fff;
  color: #243746;
  font: inherit;
}
.daily-review-monthbar strong { margin-left: 4px; color: #20364d; }
.daily-review-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.daily-review-summary > div {
  padding: 14px 16px;
  border: 1px solid #dce5eb;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(31, 64, 83, .04);
}
.daily-review-summary span { display: block; color: #6b7f8e; font-size: 11px; }
.daily-review-summary strong { display: block; margin-top: 3px; color: #17354d; font-size: 21px; }
.schedule-scroll {
  overflow-x: auto;
  margin-top: 16px;
  padding-bottom: 10px;
}
.monthly-schedule {
  min-width: 1120px;
  overflow: hidden;
  border: 1px solid #dce5eb;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 4px 18px rgba(31, 64, 83, .06);
}
.daily-schedule-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  background: #fff;
}
.col-day { width: 56px; }
.col-weekday { width: 58px; }
.col-state { width: 96px; }
.col-work-type { width: 112px; }
.col-work-time { width: 138px; }
.col-actual { width: 90px; }
.col-overtime { width: 82px; }
.col-task { width: auto; }
.col-action { width: 76px; }
.daily-schedule-table th,
.daily-schedule-table td {
  box-sizing: border-box;
  border-right: 1px solid #e7edf2;
  border-bottom: 1px solid #edf1f4;
  vertical-align: middle;
}
.daily-schedule-table th:last-child,
.daily-schedule-table td:last-child { border-right: 0; }
.daily-schedule-table thead th {
  height: 40px;
  padding: 7px 8px;
  background: #f7f9fb;
  color: #5b7083;
  text-align: center;
  font-size: 11px;
  font-weight: 800;
}
.daily-schedule-table tbody tr:last-child td { border-bottom: 0; }
.schedule-row { height: 48px; transition: background .15s ease; }
.schedule-row:hover > td { background-color: #fbfdfe; }
.schedule-row td {
  height: 48px;
  padding: 7px 8px;
  color: #405970;
  text-align: center;
  font-size: 12px;
}
.date-cell { position: relative; }
.date-cell strong { display: block; color: #263f55; font-size: 14px; }
.date-cell small { display: block; color: #1597a6; font-size: 9px; font-weight: 800; }
.weekday-cell { color: #536b7d !important; font-weight: 800; }
.schedule-row.saturday .date-cell,
.schedule-row.saturday .weekday-cell { color: #2e6f9f !important; background: #f5f9fc; }
.schedule-row.saturday .date-cell strong { color: #2e6f9f; }
.schedule-row.sunday .date-cell,
.schedule-row.sunday .weekday-cell { color: #c84b40 !important; background: #fff8f7; }
.schedule-row.sunday .date-cell strong { color: #c84b40; }
.schedule-row.today .date-cell { box-shadow: inset 3px 0 0 #14a6b6; }
.compat-header { display: none; }
.state-cell { text-align: center; }
.daily-report-state-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}
.daily-report-state-badge.is-draft { background: #fff4d9; color: #9a6500; }
.daily-report-state-badge.is-submitted { background: #e8f6ef; color: #28734d; }
.work-type-cell,
.actual-cell,
.overtime-cell { white-space: nowrap; }
.work-time-cell { white-space: nowrap; }
.actual-cell,
.overtime-cell { font-weight: 700; }
.overtime-cell.active { color: #b34335 !important; background: #fff9f7; }
.task-cell {
  padding: 0 !important;
  text-align: left !important;
}
.task-details { width: 100%; }
.task-details summary {
  min-height: 47px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px;
  cursor: pointer;
  list-style: none;
}
.task-details summary::-webkit-details-marker { display: none; }
.task-details summary span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #304b61;
  font-size: 11px;
}
.task-details summary strong {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 999px;
  background: #eef4f7;
  color: #60758a;
  font-size: 10px;
}
.task-details[open] { background: #f9fbfc; }
.task-details[open] summary { background: #f3f8f9; }
.task-detail-panel {
  padding: 10px 12px 12px;
  border-top: 1px solid #e4ebf0;
  background: #f9fbfc;
}
.task-list { display: grid; gap: 6px; }
.task-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #405970;
  font-size: 11px;
}
.task-list > div span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-list > div strong { flex: 0 0 auto; color: #203e56; }
.report-remarks {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #d6e0e7;
}
.report-remarks > strong { color: #6a7e8d; font-size: 10px; }
.report-remarks p { margin: 3px 0 0; color: #405970; font-size: 11px; white-space: pre-wrap; }
.report-action-cell { padding: 6px !important; }
.empty-small { margin: 0; color: #8a99a6; font-size: 11px; }
.empty-status { color: #94a2ae !important; font-weight: 700; }
.empty-cell,
.empty-task { color: #b0bac3 !important; }
.empty-task { text-align: left !important; padding-left: 12px !important; }
:deep(.daily-report-edit-button) {
  min-height: 30px;
  padding: 4px 9px;
  margin: 0;
  border: 1px solid #cbd7e2;
  border-radius: 7px;
  background: #fff;
  color: #17354d;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}
:deep(.daily-report-edit-button:hover) {
  border-color: #8fcbd1;
  background: #f1fbfc;
  color: #117782;
}
.daily-review-loading,
.daily-review-error {
  margin-top: 18px;
  padding: 28px;
  border-radius: 12px;
  background: #fff;
  text-align: center;
  color: #6b7f8e;
}
.daily-review-error { color: #ad4436; background: #fff5f3; }
@media (max-width: 900px) {
  .daily-review-page { inset-left: 0; }
  .daily-review-header { align-items: flex-start; flex-direction: column; }
  .daily-review-header-actions { width: 100%; }
  .daily-review-header-actions button { flex: 1; }
  .daily-review-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .daily-review-page { padding: 18px 12px 36px; }
  .daily-review-monthbar { flex-wrap: wrap; }
  .daily-review-summary { gap: 8px; }
  .daily-review-summary > div { padding: 11px 12px; }
  .daily-review-summary strong { font-size: 18px; }
}
</style>
