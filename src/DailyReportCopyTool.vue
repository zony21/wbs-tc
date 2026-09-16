<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

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
  reports: DailyReport[]
}

const STORAGE_KEY = 'wbs-tc-state-v1'
let observer: MutationObserver | null = null
let copying = false

function readState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AppState
    return Array.isArray(parsed.reports) ? parsed : null
  } catch {
    return null
  }
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

function setStatus(panel: HTMLElement, text: string, error = false) {
  const status = panel.querySelector<HTMLElement>('.daily-copy-status')
  if (!status) return
  status.textContent = text
  status.classList.toggle('error', error)
  status.hidden = !text
}

async function chooseTask(row: HTMLElement, taskId: string) {
  const picker = row.querySelector<HTMLButtonElement>('.task-picker-button')
  if (!picker) return false
  picker.click()
  await nextFrame()
  await nextFrame()

  const projectFilter = document.querySelector<HTMLSelectElement>('.project-task-search select')
  if (projectFilter) setControlValue(projectFilter, '')
  await nextFrame()

  const result = [...document.querySelectorAll<HTMLButtonElement>('.task-result-list > button')]
    .find((button) => button.querySelector('strong')?.textContent?.trim() === taskId)

  if (!result) {
    document.querySelector<HTMLButtonElement>('.modal.task-picker .modal-heading > button')?.click()
    await nextFrame()
    return false
  }

  result.click()
  await nextFrame()
  return true
}

async function copyReport(panel: HTMLElement) {
  if (copying) return

  const sourceInput = panel.querySelector<HTMLInputElement>('.daily-copy-source')
  const targetInput = panel.querySelector<HTMLInputElement>('.daily-copy-target')
  const copyButton = panel.querySelector<HTMLButtonElement>('.daily-copy-button')
  const sourceDate = sourceInput?.value || ''
  const targetDate = targetInput?.value || ''

  if (!sourceDate || !targetDate) {
    setStatus(panel, 'コピー元日付と登録先日付を指定してください。', true)
    return
  }
  if (sourceDate === targetDate) {
    setStatus(panel, 'コピー元と登録先には別の日付を指定してください。', true)
    return
  }

  const state = readState()
  if (!state) {
    setStatus(panel, '日報データを取得できませんでした。', true)
    return
  }

  const source = state.reports.find((report) => report.date === sourceDate)
  if (!source) {
    setStatus(panel, `${sourceDate} の日報は登録されていません。`, true)
    return
  }
  if (state.reports.some((report) => report.date === targetDate)) {
    setStatus(panel, `${targetDate} には既に日報があります。既存日報の修正は日報確認から行ってください。`, true)
    return
  }

  copying = true
  if (copyButton) {
    copyButton.disabled = true
    copyButton.textContent = 'コピー中…'
  }

  try {
    const clearButton = [...document.querySelectorAll<HTMLButtonElement>('.daily-layout .form-actions button')]
      .find((button) => button.textContent?.trim() === '入力をクリア')
    clearButton?.click()
    await nextFrame()

    setControlValue(controlByLabel('日付'), targetDate)
    setControlValue(controlByLabel('勤務区分'), source.workType)
    setControlValue(controlByLabel('出勤時刻'), source.startTime)
    setControlValue(controlByLabel('退勤時刻'), source.endTime)
    setControlValue(controlByLabel('休憩時間'), String(source.breakHours))
    setControlValue(controlByLabel('残業時間'), String(source.overtimeHours))
    setControlValue(document.querySelector<HTMLTextAreaElement>('.daily-layout textarea'), source.remarks)

    const addButton = [...document.querySelectorAll<HTMLButtonElement>('.daily-layout button')]
      .find((button) => button.textContent?.trim() === '＋ 作業追加')

    for (let index = 1; index < source.entries.length; index += 1) {
      addButton?.click()
      await nextFrame()
    }

    const rows = [...document.querySelectorAll<HTMLElement>('.daily-entry')]
    const missingTaskIds: string[] = []
    for (let index = 0; index < source.entries.length; index += 1) {
      const entry = source.entries[index]
      const row = rows[index]
      if (!row) continue
      const selected = await chooseTask(row, entry.taskId)
      if (!selected) {
        missingTaskIds.push(entry.taskId)
        continue
      }
      const hoursInput = row.querySelector<HTMLInputElement>('.hours-field input')
      if (hoursInput) setControlValue(hoursInput, String(entry.hours))
    }

    const sourceState = source.id.startsWith('DRAFT-') ? '仮保存' : '登録済み'
    if (missingTaskIds.length) {
      setStatus(panel, `${sourceDate}（${sourceState}）を ${targetDate} にコピーしました。現在存在しないタスク ${missingTaskIds.join('、')} はコピーできなかったため、作業実績を確認してください。`, true)
    } else {
      setStatus(panel, `${sourceDate}（${sourceState}）を ${targetDate} にコピーしました。内容を編集してから登録してください。`)
    }
  } finally {
    copying = false
    if (copyButton) {
      copyButton.disabled = false
      copyButton.textContent = 'この日報をコピー'
    }
  }
}

function ensureCopyPanel() {
  const stack = document.querySelector<HTMLElement>('.daily-layout > .stack-lg')
  if (!stack || stack.querySelector('.daily-copy-panel')) return

  const panel = document.createElement('article')
  panel.className = 'panel daily-copy-panel'
  panel.innerHTML = `
    <div class="panel-heading daily-copy-heading">
      <div>
        <p class="eyebrow">COPY DAILY REPORT</p>
        <h2>既存日報からコピー</h2>
      </div>
    </div>
    <div class="daily-copy-grid">
      <label>
        <span>コピー元日付</span>
        <input class="daily-copy-source" type="date">
      </label>
      <label>
        <span>登録先日付</span>
        <input class="daily-copy-target" type="date">
      </label>
      <button type="button" class="secondary-button daily-copy-button">この日報をコピー</button>
    </div>
    <p class="daily-copy-help">勤務区分・出退勤時刻・休憩・残業・作業タスク・工数・備考をコピーします。コピー後に内容を編集して登録できます。</p>
    <p class="daily-copy-status" role="status" hidden></p>
  `

  const currentDate = controlByLabel('日付') as HTMLInputElement | null
  const targetInput = panel.querySelector<HTMLInputElement>('.daily-copy-target')
  if (targetInput) targetInput.value = currentDate?.value || ''

  panel.querySelector<HTMLButtonElement>('.daily-copy-button')
    ?.addEventListener('click', () => void copyReport(panel))

  stack.insertBefore(panel, stack.firstElementChild)
}

function enhance() {
  ensureCopyPanel()
}

onMounted(() => {
  enhance()
  observer = new MutationObserver(enhance)
  observer.observe(document.body, { childList: true, subtree: true })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  document.querySelector('.daily-copy-panel')?.remove()
})
</script>

<template></template>

<style>
.daily-copy-panel {
  border-color: #d6e4ea !important;
  background: linear-gradient(180deg, #fbfeff 0%, #ffffff 100%) !important;
}
.daily-copy-heading { margin-bottom: 12px; }
.daily-copy-grid {
  display: grid;
  grid-template-columns: minmax(170px, 1fr) minmax(170px, 1fr) auto;
  align-items: end;
  gap: 12px;
}
.daily-copy-grid label { display: grid; gap: 6px; }
.daily-copy-grid label > span {
  color: #60758a;
  font-size: 11px;
  font-weight: 700;
}
.daily-copy-grid input {
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid #cad6e2;
  border-radius: 8px;
  background: #fff;
  color: #243746;
  font: inherit;
}
.daily-copy-button { min-height: 40px; white-space: nowrap; }
.daily-copy-button:disabled { opacity: .6; cursor: wait; }
.daily-copy-help {
  margin: 10px 0 0;
  color: #738694;
  font-size: 11px;
}
.daily-copy-status {
  margin: 10px 0 0;
  padding: 9px 11px;
  border-radius: 8px;
  background: #effafa;
  color: #176a73;
  font-size: 12px;
  font-weight: 700;
}
.daily-copy-status.error { background: #fff5f3; color: #9b4035; }
@media (max-width: 760px) {
  .daily-copy-grid { grid-template-columns: 1fr; }
  .daily-copy-button { width: 100%; }
}
</style>
