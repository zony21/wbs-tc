<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { flushStateToDatabase } from './dbSync'

type WorkType = 'normal' | 'staggered' | 'remote' | 'other'

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
  projects: unknown[]
  sections: unknown[]
  tasks: unknown[]
  reports: DailyReport[]
}

const STORAGE_KEY = 'wbs-tc-state-v1'
const REOPEN_REVIEW_KEY = 'wbs-reopen-daily-review'
const message = ref('')
const messageError = ref(false)
let observer: MutationObserver | null = null
let clearTimer: number | undefined
let reopenTimer: number | undefined

function readState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AppState
    if (!Array.isArray(parsed.reports)) return null
    return parsed
  } catch {
    return null
  }
}

function showMessage(text: string, isError = false) {
  message.value = text
  messageError.value = isError
  if (clearTimer) window.clearTimeout(clearTimer)
  clearTimer = window.setTimeout(() => {
    message.value = ''
  }, 4500)
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

function makeRowId(index: number) {
  return `draft-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`
}

function readDailyForm(): DailyReport | null {
  const date = controlByLabel('日付') as HTMLInputElement | null
  const workType = controlByLabel('勤務区分') as HTMLSelectElement | null
  const startTime = controlByLabel('出勤時刻') as HTMLInputElement | null
  const endTime = controlByLabel('退勤時刻') as HTMLInputElement | null
  const breakHours = controlByLabel('休憩時間') as HTMLInputElement | null
  const overtimeHours = controlByLabel('残業時間') as HTMLInputElement | null
  const remarks = document.querySelector<HTMLTextAreaElement>('.main-content textarea')

  if (!date?.value) return null

  const entries = [...document.querySelectorAll<HTMLElement>('.daily-entry')]
    .map((row, index) => {
      const taskId = row.querySelector<HTMLElement>('.task-picker-button strong')?.textContent?.trim() || ''
      const hours = Number(row.querySelector<HTMLInputElement>('.hours-field input')?.value || 0)
      return taskId ? { rowId: makeRowId(index), taskId, hours: Number.isFinite(hours) ? Math.max(0, hours) : 0 } : null
    })
    .filter((entry): entry is DailyEntry => Boolean(entry))

  return {
    id: `DRAFT-${date.value}`,
    date: date.value,
    workType: (workType?.value || 'normal') as WorkType,
    startTime: startTime?.value || '09:00',
    endTime: endTime?.value || '18:00',
    breakHours: Number(breakHours?.value || 0),
    overtimeHours: Number(overtimeHours?.value || 0),
    remarks: remarks?.value.trim() || '',
    entries,
  }
}

async function saveDraft() {
  const report = readDailyForm()
  if (!report) {
    showMessage('仮保存するには日付を入力してください。', true)
    return
  }

  const state = readState()
  if (!state) {
    showMessage('日報データを取得できませんでした。', true)
    return
  }

  const index = state.reports.findIndex((candidate) => candidate.date === report.date)
  if (index >= 0) state.reports[index] = report
  else state.reports.push(report)
  state.reports.sort((a, b) => b.date.localeCompare(a.date))

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    await flushStateToDatabase()
    sessionStorage.setItem(REOPEN_REVIEW_KEY, '1')
    window.location.reload()
  } catch (error) {
    console.error(error)
    showMessage('日報を仮保存できませんでした。', true)
  }
}

function ensureDraftButton() {
  const actions = document.querySelector<HTMLElement>('.daily-layout .form-actions')
  if (!actions || actions.querySelector('.daily-draft-button')) return

  const registerButton = [...actions.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent?.trim() === '日報を登録')
  if (!registerButton) return

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'secondary-button daily-draft-button'
  button.textContent = '仮保存'
  button.addEventListener('click', saveDraft)
  actions.insertBefore(button, registerButton)
}

function dateFromCard(card: HTMLElement) {
  const values = [...card.querySelectorAll<HTMLElement>('.report-card-header > div:first-child span')]
    .map((element) => element.textContent?.trim() || '')
  return values.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)) || ''
}

function isDraft(date: string) {
  const state = readState()
  return state?.reports.find((report) => report.date === date)?.id.startsWith('DRAFT-') ?? false
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

async function loadReportIntoForm(date: string) {
  const state = readState()
  const report = state?.reports.find((candidate) => candidate.date === date)
  if (!report) {
    showMessage('修正対象の日報を取得できませんでした。', true)
    return
  }

  window.dispatchEvent(new CustomEvent('wbs-close-daily-review'))
  window.dispatchEvent(new CustomEvent('wbs-open-daily-entry'))
  await new Promise((resolve) => window.setTimeout(resolve, 80))
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

  showMessage(isDraft(date) ? '仮保存の日報を修正中です。' : '登録済みの日報を修正中です。')
}

function enhanceReviewCards() {
  document.querySelectorAll<HTMLElement>('.daily-report-card').forEach((card) => {
    const date = dateFromCard(card)
    if (!date) return

    const badges = card.querySelector<HTMLElement>('.report-badges')
    if (badges && !badges.querySelector('.daily-report-state-badge')) {
      const badge = document.createElement('span')
      badge.className = `daily-report-state-badge ${isDraft(date) ? 'is-draft' : 'is-submitted'}`
      badge.textContent = isDraft(date) ? '仮保存' : '登録済み'
      badges.prepend(badge)
    }

    const actionCell = card.querySelector<HTMLElement>('.report-action-cell')
    const fallbackHeader = card.querySelector<HTMLElement>('.report-card-header')
    const target = actionCell || fallbackHeader
    if (!target || target.querySelector('.daily-report-edit-button')) return

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'daily-report-edit-button'
    button.textContent = '修正'
    button.addEventListener('click', () => void loadReportIntoForm(date))
    target.append(button)
  })
}

function reopenReviewIfNeeded() {
  if (sessionStorage.getItem(REOPEN_REVIEW_KEY) !== '1') return
  sessionStorage.removeItem(REOPEN_REVIEW_KEY)
  reopenTimer = window.setTimeout(() => window.dispatchEvent(new CustomEvent('wbs-open-daily-review')), 180)
}

function enhance() {
  ensureDraftButton()
  enhanceReviewCards()
}

onMounted(() => {
  enhance()
  observer = new MutationObserver(enhance)
  observer.observe(document.body, { childList: true, subtree: true })
  reopenReviewIfNeeded()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (clearTimer) window.clearTimeout(clearTimer)
  if (reopenTimer) window.clearTimeout(reopenTimer)
})
</script>

<template>
  <div v-if="message" :class="['daily-draft-message', { error: messageError }]" role="status">{{ message }}</div>
</template>

<style>
.daily-draft-button { min-width: 92px; }
.daily-report-state-badge.is-draft { background: #fff4d9 !important; color: #9a6500 !important; }
.daily-report-state-badge.is-submitted { background: #e8f6ef !important; color: #28734d !important; }
.daily-report-edit-button {
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid #cbd7e2;
  border-radius: 8px;
  background: #fff;
  color: #17354d;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.daily-draft-message {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 210;
  max-width: 440px;
  padding: 13px 16px;
  border: 1px solid #a9d6d9;
  border-radius: 10px;
  background: #effafa;
  color: #176a73;
  font-weight: 700;
  box-shadow: 0 12px 34px rgba(31, 64, 83, .15);
}
.daily-draft-message.error { border-color: #e7a59c; background: #fff7f5; color: #8a392f; }
@media (max-width: 600px) { .daily-draft-message { right: 12px; bottom: 12px; max-width: calc(100vw - 24px); } }
</style>
