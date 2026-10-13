<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

const STORAGE_KEY = 'wbs-tc-state-v1'

let observer: MutationObserver | null = null
let refreshFrame: number | null = null
let pickerVisible = false
let hideCompleted = true

interface StoredTask {
  id?: string
  progress?: number
}

function completedTaskIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set<string>()

    const parsed = JSON.parse(raw) as { tasks?: StoredTask[] }
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : []
    return new Set(
      tasks
        .filter((task) => task.id && Number(task.progress) >= 100)
        .map((task) => String(task.id)),
    )
  } catch {
    return new Set<string>()
  }
}

function ensureFilterControl(picker: HTMLElement) {
  let wrapper = picker.querySelector<HTMLElement>('.daily-completed-task-filter')
  if (wrapper) {
    const checkbox = wrapper.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (checkbox) checkbox.checked = hideCompleted
    return
  }

  const resultList = picker.querySelector<HTMLElement>('.task-result-list')
  if (!resultList) return

  wrapper = document.createElement('label')
  wrapper.className = 'daily-completed-task-filter'

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = hideCompleted
  checkbox.setAttribute('aria-label', '完了済みタスクを非表示')
  checkbox.addEventListener('change', () => {
    hideCompleted = checkbox.checked
    applyTaskVisibility(picker)
  })

  const text = document.createElement('span')
  text.textContent = '完了済み（100%）のタスクを非表示'

  wrapper.append(checkbox, text)
  resultList.before(wrapper)
}

function updateFilteredEmptyMessage(resultList: HTMLElement, visibleCount: number, totalCount: number) {
  let message = resultList.querySelector<HTMLElement>('.daily-completed-task-filter-empty')
  const shouldShow = hideCompleted && totalCount > 0 && visibleCount === 0

  if (!shouldShow) {
    message?.remove()
    return
  }

  if (!message) {
    message = document.createElement('p')
    message.className = 'empty-cell daily-completed-task-filter-empty'
    message.textContent = '完了済みタスクを除くと、条件に一致するタスクがありません。チェックを外すと100%のタスクも表示できます。'
    resultList.append(message)
  }
}

function applyTaskVisibility(picker: HTMLElement) {
  const resultList = picker.querySelector<HTMLElement>('.task-result-list')
  if (!resultList) return

  const completedIds = completedTaskIds()
  const buttons = [...resultList.querySelectorAll<HTMLButtonElement>(':scope > button')]
  let visibleCount = 0

  buttons.forEach((button) => {
    const taskId = button.querySelector('strong')?.textContent?.trim() || ''
    const hidden = hideCompleted && completedIds.has(taskId)
    button.style.display = hidden ? 'none' : ''
    if (!hidden) visibleCount += 1
  })

  updateFilteredEmptyMessage(resultList, visibleCount, buttons.length)
}

function refresh() {
  refreshFrame = null
  const picker = document.querySelector<HTMLElement>('.task-picker')

  if (!picker) {
    pickerVisible = false
    return
  }

  if (!pickerVisible) {
    pickerVisible = true
    hideCompleted = true
  }

  ensureFilterControl(picker)
  applyTaskVisibility(picker)
}

function scheduleRefresh() {
  if (refreshFrame !== null) return
  refreshFrame = window.requestAnimationFrame(refresh)
}

onMounted(() => {
  observer = new MutationObserver(scheduleRefresh)
  observer.observe(document.body, { childList: true, subtree: true })
  scheduleRefresh()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (refreshFrame !== null) window.cancelAnimationFrame(refreshFrame)
})
</script>

<template></template>

<style>
.daily-completed-task-filter {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 12px 0 4px;
  padding: 10px 12px;
  border: 1px solid #d7e1e8;
  border-radius: 9px;
  background: #f7fafc;
  color: #425b6c;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
}

.daily-completed-task-filter:hover {
  border-color: #a8c8d0;
  background: #f1f8fa;
}

.daily-completed-task-filter input {
  width: 17px;
  height: 17px;
  margin: 0;
  flex: 0 0 auto;
  accent-color: #1499a8;
  cursor: pointer;
}

.daily-completed-task-filter-empty {
  margin-top: 8px;
}
</style>
