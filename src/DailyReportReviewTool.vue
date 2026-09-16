<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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

function numberLabel(value: number) {
  return Number(value.toFixed(2)).toString()
}

function monthLabel() {
  const [year, month] = selectedMonth.value.split('-')
  return `${year}年${Number(month)}月`
}

function dateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(date)
  return `${month}月${day}日（${weekday}）`
}

function shiftMonth(amount: number) {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  const next = new Date(year, month - 1 + amount, 1)
  selectedMonth.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

const filteredReports = computed(() => state.value.reports
  .filter((report) => report.date.startsWith(`${selectedMonth.value}-`))
  .sort((a, b) => b.date.localeCompare(a.date)))

const totalWorkHours = computed(() => filteredReports.value.reduce((sum, report) => sum + reportWorkHours(report), 0))
const totalOvertimeHours = computed(() => filteredReports.value.reduce((sum, report) => sum + (Number(report.overtimeHours) || 0), 0))
const totalTaskHours = computed(() => filteredReports.value.reduce((sum, report) => sum + report.entries.reduce((entrySum, entry) => entrySum + (Number(entry.hours) || 0), 0), 0))

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

function openDailyEntry() {
  open.value = false
  window.dispatchEvent(new CustomEvent('wbs-open-daily-entry'))
}

function openWeeklyReport() {
  window.dispatchEvent(new CustomEvent('wbs-open-weekly-report'))
}

onMounted(() => window.addEventListener('wbs-open-daily-review', openReview))
onBeforeUnmount(() => window.removeEventListener('wbs-open-daily-review', openReview))
</script>

<template>
  <div v-if="open" class="daily-review-backdrop" @click.self="open = false">
    <section class="daily-review-modal" role="dialog" aria-modal="true" aria-labelledby="daily-review-title">
      <header class="daily-review-header">
        <div>
          <p>DAILY REPORT REVIEW</p>
          <h2 id="daily-review-title">日報確認</h2>
          <span>月別に、日付ごとの勤務・作業実績を確認します。</span>
        </div>
        <div class="daily-review-header-actions">
          <button type="button" class="action-secondary" @click="openWeeklyReport">週報出力</button>
          <button type="button" class="action-primary" @click="openDailyEntry">＋ 日報登録</button>
          <button type="button" class="close-button" aria-label="閉じる" @click="open = false">×</button>
        </div>
      </header>

      <div class="daily-review-monthbar">
        <button type="button" aria-label="前月" @click="shiftMonth(-1)">‹</button>
        <input v-model="selectedMonth" type="month" aria-label="確認する月">
        <button type="button" aria-label="翌月" @click="shiftMonth(1)">›</button>
        <strong>{{ monthLabel() }}</strong>
      </div>

      <p v-if="loadError" class="daily-review-error">{{ loadError }}</p>

      <div class="daily-review-summary">
        <div><span>登録日数</span><strong>{{ filteredReports.length }}日</strong></div>
        <div><span>実労働合計</span><strong>{{ numberLabel(totalWorkHours) }}h</strong></div>
        <div><span>残業合計</span><strong>{{ numberLabel(totalOvertimeHours) }}h</strong></div>
        <div><span>タスク工数合計</span><strong>{{ numberLabel(totalTaskHours) }}h</strong></div>
      </div>

      <div class="daily-report-list">
        <article v-for="report in filteredReports" :key="report.id" class="daily-report-card">
          <header class="report-card-header">
            <div>
              <strong>{{ dateLabel(report.date) }}</strong>
              <span>{{ report.date }}</span>
            </div>
            <div class="report-badges">
              <span>{{ workTypeLabels[report.workType] }}</span>
              <span v-if="report.overtimeHours > 0" class="overtime-badge">残業 {{ numberLabel(report.overtimeHours) }}h</span>
            </div>
          </header>

          <div class="report-metrics">
            <div><span>勤務時間</span><strong>{{ report.startTime }} ～ {{ report.endTime }}</strong></div>
            <div><span>休憩</span><strong>{{ numberLabel(report.breakHours) }}h</strong></div>
            <div><span>実労働</span><strong>{{ numberLabel(reportWorkHours(report)) }}h</strong></div>
            <div><span>残業</span><strong :class="{ overtime: report.overtimeHours > 0 }">{{ numberLabel(report.overtimeHours) }}h</strong></div>
          </div>

          <div class="report-content-grid">
            <section class="report-tasks">
              <h3>作業実績</h3>
              <div v-if="report.entries.length" class="task-list">
                <div v-for="entry in report.entries" :key="entry.rowId">
                  <span>{{ taskName(entry.taskId) }}</span>
                  <strong>{{ numberLabel(entry.hours) }}h</strong>
                </div>
              </div>
              <p v-else class="empty-small">作業実績はありません。</p>
            </section>

            <section class="report-remarks">
              <h3>備考</h3>
              <p>{{ report.remarks || '－' }}</p>
            </section>
          </div>
        </article>

        <div v-if="!filteredReports.length" class="daily-review-empty">
          <strong>{{ monthLabel() }}の日報はありません</strong>
          <span>右上の「日報登録」から登録できます。</span>
          <button type="button" @click="openDailyEntry">＋ 日報登録</button>
        </div>
      </div>

      <footer class="daily-review-footer">
        <span>SQLiteに保存されている日報を表示しています。</span>
        <button type="button" @click="open = false">閉じる</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
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
  width: min(1100px, 96vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 18px;
  background: #f5f8fa;
  box-shadow: 0 24px 70px rgba(15, 31, 49, .24);
}
.daily-review-header,
.daily-review-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  background: #fff;
}
.daily-review-header { border-bottom: 1px solid #e1e8ef; }
.daily-review-header p { margin: 0 0 2px; color: #718196; font-size: 11px; font-weight: 800; letter-spacing: .12em; }
.daily-review-header h2 { margin: 0; color: #1d344c; font-size: 24px; }
.daily-review-header > div > span { display: block; margin-top: 4px; color: #758496; font-size: 12px; }
.daily-review-header-actions { display: flex; align-items: center; gap: 8px; }
.daily-review-header-actions button,
.daily-review-footer button,
.daily-review-empty button {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 9px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.action-primary { border: 0; background: #173f5f; color: #fff; }
.action-secondary { border: 1px solid #cbd7e2; background: #fff; color: #29465f; }
.daily-review-header-actions .close-button {
  width: 40px;
  padding: 0;
  border: 0;
  background: #eef3f7;
  color: #20364d;
  font-size: 22px;
}
.daily-review-monthbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 22px;
  background: #fff;
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
  padding: 16px 22px 12px;
}
.daily-review-summary > div {
  padding: 14px 16px;
  border: 1px solid #dfe7ee;
  border-radius: 12px;
  background: #fff;
}
.daily-review-summary span { display: block; color: #6d7e91; font-size: 12px; }
.daily-review-summary strong { display: block; margin-top: 4px; color: #1c354d; font-size: 22px; }
.daily-report-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 8px 22px 22px;
}
.daily-report-card {
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid #dce5ed;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 3px 12px rgba(29, 52, 76, .04);
}
.report-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #e7edf2;
}
.report-card-header strong { display: block; color: #1d3a54; font-size: 18px; }
.report-card-header > div:first-child span { display: block; margin-top: 2px; color: #8190a0; font-size: 11px; }
.report-badges { display: flex; flex-wrap: wrap; gap: 7px; }
.report-badges span {
  padding: 5px 9px;
  border-radius: 999px;
  background: #edf3f7;
  color: #426078;
  font-size: 11px;
  font-weight: 800;
}
.report-badges .overtime-badge { background: #fff0ed; color: #ad4436; }
.report-metrics {
  display: grid;
  grid-template-columns: 2fr repeat(3, 1fr);
  border-bottom: 1px solid #edf1f4;
}
.report-metrics > div { padding: 12px 16px; border-right: 1px solid #edf1f4; }
.report-metrics > div:last-child { border-right: 0; }
.report-metrics span { display: block; color: #7a8998; font-size: 11px; }
.report-metrics strong { display: block; margin-top: 3px; color: #29435b; font-size: 14px; }
.report-metrics strong.overtime { color: #b24533; }
.report-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(240px, .8fr);
  gap: 18px;
  padding: 16px;
}
.report-content-grid h3 { margin: 0 0 9px; color: #597087; font-size: 12px; }
.task-list { display: flex; flex-direction: column; gap: 6px; }
.task-list > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f6f9fb;
  color: #344d64;
  font-size: 12px;
}
.task-list strong { flex: 0 0 auto; color: #23577d; }
.report-remarks p { margin: 0; color: #455d72; line-height: 1.65; font-size: 12px; white-space: pre-wrap; }
.empty-small { margin: 0; color: #8190a0; font-size: 12px; }
.daily-review-empty {
  display: grid;
  justify-items: center;
  gap: 7px;
  padding: 44px 20px;
  border: 1px dashed #cad6e1;
  border-radius: 14px;
  background: #fff;
  color: #718196;
}
.daily-review-empty strong { color: #29445d; font-size: 16px; }
.daily-review-empty button { margin-top: 8px; border: 0; background: #173f5f; color: #fff; }
.daily-review-error { margin: 12px 22px 0; padding: 10px 12px; border-radius: 9px; background: #fff0ee; color: #b13f32; font-weight: 700; }
.daily-review-footer {
  border-top: 1px solid #e1e8ef;
  color: #718196;
  font-size: 12px;
}
.daily-review-footer button { border: 0; background: #203d58; color: #fff; }
@media (max-width: 760px) {
  .daily-review-backdrop { padding: 8px; }
  .daily-review-modal { width: 100%; max-height: 96vh; }
  .daily-review-header { align-items: flex-start; flex-direction: column; padding: 14px; }
  .daily-review-header-actions { width: 100%; }
  .daily-review-header-actions .action-primary,
  .daily-review-header-actions .action-secondary { flex: 1; }
  .daily-review-header-actions .close-button { flex: 0 0 40px; }
  .daily-review-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 12px; }
  .daily-review-monthbar { padding: 12px 14px; flex-wrap: wrap; }
  .daily-report-list { padding: 4px 12px 14px; }
  .report-card-header { align-items: flex-start; flex-direction: column; }
  .report-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .report-metrics > div { border-bottom: 1px solid #edf1f4; }
  .report-content-grid { grid-template-columns: 1fr; }
  .daily-review-footer { padding: 12px 14px; }
}
</style>
