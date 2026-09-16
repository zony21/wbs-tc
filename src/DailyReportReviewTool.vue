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

interface CalendarDay {
  key: string
  day: number
  inMonth: boolean
  isToday: boolean
  report?: DailyReport
}

const workTypeLabels: Record<WorkType, string> = {
  normal: '通常勤務',
  staggered: '時差出勤',
  remote: '在宅勤務',
  other: 'その他',
}

const weekdayLabels = ['月', '火', '水', '木', '金', '土', '日']
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

function numberLabel(value: number) {
  return Number(value.toFixed(2)).toString()
}

function monthLabel() {
  const [year, month] = selectedMonth.value.split('-')
  return `${year}年${Number(month)}月`
}

function shiftMonth(amount: number) {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  const next = new Date(year, month - 1 + amount, 1)
  selectedMonth.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

const filteredReports = computed(() => state.value.reports
  .filter((report) => report.date.startsWith(`${selectedMonth.value}-`))
  .sort((a, b) => a.date.localeCompare(b.date)))

const calendarDays = computed<CalendarDay[]>(() => {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(year, month - 1, 1 - mondayOffset)
  const reportMap = new Map(state.value.reports.map((report) => [report.date, report]))
  const today = dateKey(new Date())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const key = dateKey(date)
    return {
      key,
      day: date.getDate(),
      inMonth: date.getFullYear() === year && date.getMonth() === month - 1,
      isToday: key === today,
      report: reportMap.get(key),
    }
  })
})

const totalWorkHours = computed(() => filteredReports.value.reduce((sum, report) => sum + reportWorkHours(report), 0))
const totalOvertimeHours = computed(() => filteredReports.value.reduce((sum, report) => sum + (Number(report.overtimeHours) || 0), 0))
const totalTaskHours = computed(() => filteredReports.value.reduce((sum, report) => sum + report.entries.reduce((entrySum, entry) => entrySum + (Number(entry.hours) || 0), 0), 0))

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
        <span>月間カレンダーで勤務状況を確認し、作業内容は必要な日だけ展開できます。</span>
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

      <div class="calendar-scroll">
        <div class="daily-calendar">
          <div class="calendar-weekdays" aria-hidden="true">
            <div v-for="weekday in weekdayLabels" :key="weekday">{{ weekday }}</div>
          </div>

          <div class="daily-calendar-grid">
            <section
              v-for="day in calendarDays"
              :key="day.key"
              :class="['calendar-day', { 'outside-month': !day.inMonth, today: day.isToday }]"
            >
              <div class="calendar-day-heading">
                <strong>{{ day.day }}</strong>
                <span v-if="day.isToday">今日</span>
              </div>

              <article v-if="day.report" class="daily-report-card">
                <header class="report-card-header">
                  <div class="report-title">
                    <strong>{{ workTypeLabels[day.report.workType] }}</strong>
                    <span>{{ day.report.date }}</span>
                  </div>
                  <div class="report-badges">
                    <span v-if="day.report.overtimeHours > 0" class="overtime-badge">残業 {{ numberLabel(day.report.overtimeHours) }}h</span>
                  </div>
                </header>

                <div class="report-compact-metrics">
                  <span>{{ day.report.startTime }}–{{ day.report.endTime }}</span>
                  <span>実働 {{ numberLabel(reportWorkHours(day.report)) }}h</span>
                  <span v-if="day.report.overtimeHours > 0" class="overtime-text">残業 {{ numberLabel(day.report.overtimeHours) }}h</span>
                </div>

                <details class="report-details">
                  <summary :title="taskTooltip(day.report)">
                    <span>作業詳細</span>
                    <strong>{{ day.report.entries.length }}件</strong>
                  </summary>
                  <div class="report-detail-body">
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
              </article>

              <span v-else-if="day.inMonth" class="calendar-no-report">－</span>
            </section>
          </div>
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
}
.daily-review-summary span { display: block; color: #6b7f8e; font-size: 11px; }
.daily-review-summary strong { display: block; margin-top: 3px; color: #17354d; font-size: 21px; }
.calendar-scroll {
  overflow-x: auto;
  margin-top: 16px;
  padding-bottom: 8px;
}
.daily-calendar {
  min-width: 980px;
  overflow: hidden;
  border: 1px solid #d8e1e8;
  border-radius: 14px;
  background: #dfe6ec;
}
.calendar-weekdays,
.daily-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 1px;
}
.calendar-weekdays > div {
  padding: 9px 8px;
  background: #edf3f7;
  color: #60758a;
  text-align: center;
  font-size: 12px;
  font-weight: 800;
}
.calendar-weekdays > div:nth-child(6) { color: #3978a8; }
.calendar-weekdays > div:nth-child(7) { color: #b14a40; }
.calendar-day {
  min-height: 154px;
  padding: 8px;
  background: #fff;
}
.calendar-day.outside-month {
  background: #f7f9fb;
  color: #9aabba;
}
.calendar-day.today {
  box-shadow: inset 0 0 0 2px #14a6b6;
}
.calendar-day-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 26px;
  margin-bottom: 5px;
}
.calendar-day-heading strong {
  color: #344f63;
  font-size: 13px;
}
.outside-month .calendar-day-heading strong { color: #9aabba; }
.calendar-day-heading span {
  padding: 2px 6px;
  border-radius: 999px;
  background: #e5f7f8;
  color: #0e7b86;
  font-size: 9px;
  font-weight: 800;
}
.daily-report-card {
  overflow: hidden;
  border: 1px solid #d9e3ea;
  border-radius: 9px;
  background: #fbfdfe;
}
.report-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 5px;
  padding: 7px 8px 5px;
}
.report-title { min-width: 0; }
.report-title strong {
  display: block;
  overflow: hidden;
  color: #24435b;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.report-title span {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.report-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 3px;
}
.report-badges span {
  padding: 2px 5px;
  border-radius: 999px;
  background: #edf3f7;
  color: #426078;
  font-size: 9px;
  font-weight: 800;
  white-space: nowrap;
}
.report-badges .overtime-badge { background: #fff0ed; color: #ad4436; }
.report-compact-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 7px;
  padding: 0 8px 6px;
  color: #60758a;
  font-size: 10px;
}
.report-compact-metrics .overtime-text { color: #b24533; font-weight: 800; }
.report-details {
  border-top: 1px solid #e8eef2;
}
.report-details summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 8px;
  color: #49657b;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  list-style: none;
}
.report-details summary::-webkit-details-marker { display: none; }
.report-details summary::after {
  content: '＋';
  margin-left: auto;
  color: #8193a2;
}
.report-details[open] summary::after { content: '−'; }
.report-details summary strong {
  padding: 1px 5px;
  border-radius: 999px;
  background: #edf3f7;
  color: #45647b;
  font-size: 9px;
}
.report-detail-body {
  padding: 0 7px 7px;
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.task-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 6px;
  background: #f4f8fa;
  font-size: 9px;
}
.task-list span {
  min-width: 0;
  overflow: hidden;
  color: #405b70;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-list strong { flex: 0 0 auto; color: #17354d; }
.report-remarks {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #dce5eb;
}
.report-remarks strong { color: #60758a; font-size: 9px; }
.report-remarks p {
  margin: 2px 0 0;
  color: #50697c;
  font-size: 9px;
  line-height: 1.45;
  white-space: pre-wrap;
}
.empty-small,
.calendar-no-report {
  color: #a2b0bc;
  font-size: 10px;
}
.calendar-no-report { display: block; padding: 8px 2px; }
.daily-review-loading { padding: 48px 0; text-align: center; color: #60758a; }
.daily-review-error {
  margin: 16px 0 0;
  padding: 12px 14px;
  border-radius: 9px;
  background: #fff0ee;
  color: #b13f32;
  font-weight: 700;
}
@media (max-width: 900px) {
  .daily-review-page { inset-left: 0; padding: 20px 14px 36px; }
  .daily-review-header { align-items: flex-start; flex-direction: column; }
  .daily-review-header-actions { width: 100%; }
  .daily-review-header-actions button { flex: 1; }
  .daily-review-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .daily-review-summary { grid-template-columns: 1fr 1fr; }
  .daily-review-monthbar { flex-wrap: wrap; }
  .daily-review-monthbar strong { width: 100%; margin-left: 0; }
}
</style>
