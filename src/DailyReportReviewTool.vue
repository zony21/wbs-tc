<script setup lang="ts">
import { computed, ref } from 'vue'
import { flushStateToDatabase } from './dbSync'

type WorkType = 'normal' | 'staggered' | 'remote' | 'other'

interface WbsTask {
  id: string
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
  sections: unknown[]
  tasks: WbsTask[]
  reports: DailyReport[]
}

const workTypeLabels: Record<WorkType, string> = {
  normal: '通常勤務',
  staggered: '時差出勤',
  remote: '在宅勤務',
  other: 'その他',
}

const open = ref(false)
const loading = ref(false)
const loadError = ref('')
const state = ref<AppState>({ sections: [], tasks: [], reports: [] })

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
  return task ? `${task.id}｜${task.name}` : taskId
}

const filteredReports = computed(() => state.value.reports
  .filter((report) => report.date.startsWith(`${selectedMonth.value}-`))
  .sort((a, b) => b.date.localeCompare(a.date)))

const totalWorkHours = computed(() => filteredReports.value.reduce((sum, report) => sum + reportWorkHours(report), 0))
const totalOvertimeHours = computed(() => filteredReports.value.reduce((sum, report) => sum + (Number(report.overtimeHours) || 0), 0))
const totalTaskHours = computed(() => filteredReports.value.reduce((sum, report) => sum + report.entries.reduce((entrySum, entry) => entrySum + (Number(entry.hours) || 0), 0), 0))

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

async function openReview() {
  loading.value = true
  loadError.value = ''
  try {
    await flushStateToDatabase()
    const response = await fetch('/api/state', { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    state.value = await response.json() as AppState
    open.value = true
  } catch (error) {
    console.error(error)
    loadError.value = '日報データをSQLiteから取得できませんでした。'
    open.value = true
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <button class="daily-review-launch" type="button" :disabled="loading" @click="openReview">
    {{ loading ? '読込中…' : '日報確認' }}
  </button>

  <div v-if="open" class="daily-review-backdrop" @click.self="open = false">
    <section class="daily-review-modal" role="dialog" aria-modal="true" aria-labelledby="daily-review-title">
      <header class="daily-review-header">
        <div>
          <p>DAILY REPORT REVIEW</p>
          <h2 id="daily-review-title">月別 日報確認</h2>
        </div>
        <button type="button" aria-label="閉じる" @click="open = false">×</button>
      </header>

      <div class="daily-review-monthbar">
        <button type="button" @click="shiftMonth(-1)">‹</button>
        <input v-model="selectedMonth" type="month" aria-label="確認する月">
        <button type="button" @click="shiftMonth(1)">›</button>
        <strong>{{ monthLabel() }}</strong>
      </div>

      <p v-if="loadError" class="daily-review-error">{{ loadError }}</p>

      <div class="daily-review-summary">
        <div><span>登録日数</span><strong>{{ filteredReports.length }}日</strong></div>
        <div><span>実労働合計</span><strong>{{ numberLabel(totalWorkHours) }}h</strong></div>
        <div><span>残業合計</span><strong>{{ numberLabel(totalOvertimeHours) }}h</strong></div>
        <div><span>タスク工数合計</span><strong>{{ numberLabel(totalTaskHours) }}h</strong></div>
      </div>

      <div class="daily-review-table-wrap">
        <table class="daily-review-table">
          <thead>
            <tr>
              <th>日付</th>
              <th>勤務区分</th>
              <th>勤務時間</th>
              <th>実労働</th>
              <th>残業</th>
              <th>作業実績</th>
              <th>備考</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="report in filteredReports" :key="report.id">
              <td class="date-cell">{{ report.date }}</td>
              <td>{{ workTypeLabels[report.workType] }}</td>
              <td>{{ report.startTime }} ～ {{ report.endTime }}<small>休憩 {{ numberLabel(report.breakHours) }}h</small></td>
              <td>{{ numberLabel(reportWorkHours(report)) }}h</td>
              <td :class="{ overtime: report.overtimeHours > 0 }">{{ numberLabel(report.overtimeHours) }}h</td>
              <td class="task-cell">
                <div v-for="entry in report.entries" :key="entry.rowId">
                  <span>{{ taskName(entry.taskId) }}</span><strong>{{ numberLabel(entry.hours) }}h</strong>
                </div>
              </td>
              <td class="remarks-cell">{{ report.remarks || '－' }}</td>
            </tr>
            <tr v-if="!filteredReports.length">
              <td colspan="7" class="empty">この月の日報は登録されていません。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="daily-review-footer">
        <span>SQLiteに保存されている日報を月単位で表示しています。</span>
        <button type="button" @click="open = false">閉じる</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.daily-review-launch {
  position: fixed;
  right: 24px;
  top: 70px;
  z-index: 49;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid #cdd8e5;
  border-radius: 10px;
  background: #fff;
  color: #20364d;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(33, 54, 77, .08);
}
.daily-review-launch:disabled { opacity: .6; cursor: wait; }
.daily-review-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(17, 31, 48, .48);
}
.daily-review-modal {
  width: min(1180px, 96vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(15, 31, 49, .24);
}
.daily-review-header,
.daily-review-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid #e1e8ef;
}
.daily-review-header p { margin: 0 0 2px; color: #718196; font-size: 11px; font-weight: 800; letter-spacing: .12em; }
.daily-review-header h2 { margin: 0; color: #1d344c; font-size: 22px; }
.daily-review-header > button {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 10px;
  background: #eef3f7;
  font-size: 22px;
  cursor: pointer;
}
.daily-review-monthbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 22px;
  background: #f6f9fb;
  border-bottom: 1px solid #e1e8ef;
}
.daily-review-monthbar button {
  width: 36px;
  height: 36px;
  border: 1px solid #d5dee7;
  border-radius: 9px;
  background: #fff;
  font-size: 22px;
  cursor: pointer;
}
.daily-review-monthbar input {
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid #cad6e2;
  border-radius: 9px;
  background: #fff;
  font: inherit;
}
.daily-review-monthbar strong { margin-left: 4px; color: #20364d; }
.daily-review-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 16px 22px;
}
.daily-review-summary > div {
  padding: 14px 16px;
  border: 1px solid #e0e7ee;
  border-radius: 12px;
  background: #fbfcfd;
}
.daily-review-summary span { display: block; color: #6d7e91; font-size: 12px; }
.daily-review-summary strong { display: block; margin-top: 4px; color: #1c354d; font-size: 22px; }
.daily-review-table-wrap { overflow: auto; padding: 0 22px 18px; }
.daily-review-table { width: 100%; min-width: 980px; border-collapse: collapse; color: #263b50; font-size: 13px; }
.daily-review-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 11px 10px;
  background: #eef3f7;
  border-bottom: 1px solid #d9e2ea;
  text-align: left;
  color: #52677c;
  font-size: 12px;
}
.daily-review-table td { padding: 12px 10px; border-bottom: 1px solid #e6ebf0; vertical-align: top; }
.daily-review-table td small { display: block; margin-top: 3px; color: #7a8999; }
.date-cell { white-space: nowrap; font-weight: 800; }
.overtime { color: #b24533; font-weight: 800; }
.task-cell { min-width: 260px; }
.task-cell div { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 5px; }
.task-cell span { min-width: 0; }
.task-cell strong { white-space: nowrap; color: #365c7d; }
.remarks-cell { min-width: 180px; white-space: pre-wrap; }
.empty { padding: 34px !important; text-align: center; color: #718196; }
.daily-review-error { margin: 12px 22px 0; padding: 10px 12px; border-radius: 9px; background: #fff0ee; color: #b13f32; font-weight: 700; }
.daily-review-footer { border-top: 1px solid #e1e8ef; border-bottom: 0; color: #718196; font-size: 12px; }
.daily-review-footer button { min-height: 40px; padding: 0 18px; border: 0; border-radius: 9px; background: #203d58; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
@media (max-width: 760px) {
  .daily-review-launch { right: 12px; top: 66px; }
  .daily-review-backdrop { padding: 10px; }
  .daily-review-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 12px; }
  .daily-review-monthbar, .daily-review-header, .daily-review-footer { padding-left: 14px; padding-right: 14px; }
  .daily-review-table-wrap { padding-left: 12px; padding-right: 12px; }
}
</style>
