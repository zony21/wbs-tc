<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

const STORAGE_KEY = 'wbs-tc-state-v1'
const DETAILS_KEY = 'wbs-tc-task-details-v1'

type StoredTask = {
  id: string
  details?: string
}

type StoredState = {
  tasks?: StoredTask[]
}

type DetailsMap = Record<string, string>

let observer: MutationObserver | null = null
let reconcileTimer: number | undefined
let refreshQueued = false

function readState(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as StoredState : null
  } catch {
    return null
  }
}

function readDetailsMap(): DetailsMap {
  try {
    const raw = localStorage.getItem(DETAILS_KEY)
    return raw ? JSON.parse(raw) as DetailsMap : {}
  } catch {
    return {}
  }
}

function writeDetailsMap(map: DetailsMap) {
  localStorage.setItem(DETAILS_KEY, JSON.stringify(map))
}

function reconcileDetails() {
  const state = readState()
  if (!state || !Array.isArray(state.tasks)) return

  const map = readDetailsMap()
  let mapChanged = false
  let stateChanged = false
  const taskIds = new Set(state.tasks.map((task) => task.id))

  for (const task of state.tasks) {
    if (!(task.id in map) && typeof task.details === 'string') {
      map[task.id] = task.details
      mapChanged = true
    }

    const details = map[task.id] ?? task.details ?? ''
    if ((task.details ?? '') !== details) {
      task.details = details
      stateChanged = true
    }
  }

  for (const taskId of Object.keys(map)) {
    if (!taskIds.has(taskId)) {
      delete map[taskId]
      mapChanged = true
    }
  }

  if (mapChanged) writeDetailsMap(map)
  if (stateChanged) localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function taskIdFromModal(modal: HTMLFormElement) {
  const title = modal.querySelector('h2')?.textContent?.trim() || ''
  const match = title.match(/^(T-[^\s]+)\s+を編集$/)
  return match?.[1] || ''
}

function taskModalKind(modal: HTMLFormElement) {
  const title = modal.querySelector('h2')?.textContent?.trim() || ''
  if (title === 'タスク追加') return 'add' as const
  if (/^T-[^\s]+\s+を編集$/.test(title)) return 'edit' as const
  return null
}

function ensureDetailsField(modal: HTMLFormElement) {
  const kind = taskModalKind(modal)
  if (!kind || modal.querySelector('[data-task-details-field]')) return

  const grid = modal.querySelector<HTMLElement>('.form-grid.two')
  if (!grid) return

  const label = document.createElement('label')
  label.className = 'full task-details-field'
  label.dataset.taskDetailsField = 'true'

  const caption = document.createElement('span')
  caption.textContent = '詳細'

  const textarea = document.createElement('textarea')
  textarea.rows = 4
  textarea.placeholder = '作業内容、確認事項、補足などを入力'
  textarea.dataset.taskDetailsInput = 'true'

  if (kind === 'edit') {
    const taskId = taskIdFromModal(modal)
    const map = readDetailsMap()
    const state = readState()
    const task = state?.tasks?.find((candidate) => candidate.id === taskId)
    textarea.value = map[taskId] ?? task?.details ?? ''
  }

  label.append(caption, textarea)

  const assigneeLabel = [...grid.querySelectorAll<HTMLLabelElement>('label')]
    .find((candidate) => candidate.querySelector('span')?.textContent?.trim().startsWith('担当者'))

  if (assigneeLabel) grid.insertBefore(label, assigneeLabel)
  else grid.appendChild(label)
}

function decorateTaskRows() {
  const map = readDetailsMap()

  document.querySelectorAll<HTMLTableRowElement>('.wbs-table tbody tr').forEach((row) => {
    const idCell = row.cells.item(0)
    const nameCell = row.cells.item(1)
    if (!idCell || !nameCell) return

    const taskId = idCell.textContent?.trim() || ''
    if (!/^T-/.test(taskId)) return

    const details = map[taskId] || ''
    let detail = nameCell.querySelector<HTMLElement>('[data-task-details-display]')

    if (!details) {
      detail?.remove()
      return
    }

    if (!detail) {
      detail = document.createElement('small')
      detail.dataset.taskDetailsDisplay = 'true'
      detail.className = 'task-details-display'
      nameCell.appendChild(detail)
    }

    if (detail.textContent !== details) detail.textContent = details
  })
}

function refreshUi() {
  if (refreshQueued) return
  refreshQueued = true
  window.requestAnimationFrame(() => {
    refreshQueued = false
    document.querySelectorAll<HTMLFormElement>('form.modal').forEach(ensureDetailsField)
    decorateTaskRows()
  })
}

function saveDetails(taskId: string, details: string) {
  if (!taskId) return
  const map = readDetailsMap()
  map[taskId] = details.trim()
  writeDetailsMap(map)
  reconcileDetails()
  refreshUi()
}

function waitForNewTask(beforeIds: Set<string>, details: string, attempt = 0) {
  const state = readState()
  const added = state?.tasks?.find((task) => !beforeIds.has(task.id))
  if (added) {
    saveDetails(added.id, details)
    return
  }
  if (attempt >= 15) return
  window.setTimeout(() => waitForNewTask(beforeIds, details, attempt + 1), 40)
}

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const button = target?.closest<HTMLButtonElement>('button')
  const modal = button?.closest<HTMLFormElement>('form.modal')
  if (!button || !modal) return

  const kind = taskModalKind(modal)
  if (!kind) return

  const text = button.textContent?.trim() || ''
  if ((kind === 'add' && text !== '追加') || (kind === 'edit' && text !== '保存')) return

  const details = modal.querySelector<HTMLTextAreaElement>('[data-task-details-input]')?.value || ''

  if (kind === 'edit') {
    const taskId = taskIdFromModal(modal)
    window.setTimeout(() => saveDetails(taskId, details), 80)
    window.setTimeout(reconcileDetails, 500)
    return
  }

  const beforeIds = new Set(readState()?.tasks?.map((task) => task.id) || [])
  window.setTimeout(() => waitForNewTask(beforeIds, details), 0)
  window.setTimeout(reconcileDetails, 500)
}

onMounted(() => {
  reconcileDetails()
  refreshUi()
  document.addEventListener('click', handleClick, true)

  observer = new MutationObserver(refreshUi)
  observer.observe(document.body, { childList: true, subtree: true })

  reconcileTimer = window.setInterval(() => {
    reconcileDetails()
    refreshUi()
  }, 500)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClick, true)
  observer?.disconnect()
  if (reconcileTimer) window.clearInterval(reconcileTimer)
})
</script>

<template></template>

<style>
.task-details-field textarea {
  min-height: 96px;
  resize: vertical;
}

.task-details-display {
  display: block;
  margin-top: 4px;
  color: #728697;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.45;
  white-space: pre-wrap;
}
</style>
