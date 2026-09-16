<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

interface Project {
  id: string
  name: string
  startDate: string
  dueDate: string
}

interface Section {
  id: string
  projectId: string
  name: string
  startDate: string
  dueDate: string
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

interface AppState {
  projects: Project[]
  sections: Section[]
  tasks: WbsTask[]
}

const STORAGE_KEY = 'wbs-tc-state-v1'
let observer: MutationObserver | null = null
let refreshTimer: number | undefined

function readState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AppState>
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.sections) || !Array.isArray(parsed.tasks)) return null
    return parsed as AppState
  } catch {
    return null
  }
}

function activeProjectId(state: AppState) {
  const projectSelect = document.querySelector<HTMLSelectElement>('.project-switcher select')
  return projectSelect?.value || state.projects[0]?.id || ''
}

function monthStart(value: string) {
  const [year, month] = value.split('-').map(Number)
  return new Date(year, month - 1, 1)
}

function monthDiff(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth()
}

function monthRange(project: Project) {
  const start = monthStart(project.startDate)
  const end = monthStart(project.dueDate)
  const result: Date[] = []
  for (let cursor = new Date(start); cursor <= end; cursor.setMonth(cursor.getMonth() + 1)) {
    result.push(new Date(cursor))
  }
  return result
}

function sectionMonthLabel(section: Section) {
  const start = monthStart(section.startDate)
  const end = monthStart(section.dueDate)
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getMonth() + 1}月`
  }
  return `${start.getMonth() + 1}月～${end.getMonth() + 1}月`
}

function taskProgressForSection(state: AppState, sectionId: string) {
  const sectionTasks = state.tasks.filter((task) => task.sectionId === sectionId)
  const leaves = sectionTasks.filter((task) => !state.tasks.some((candidate) => candidate.parentId === task.id))
  if (!leaves.length) return 0
  return Math.round(leaves.reduce((sum, task) => sum + task.progress, 0) / leaves.length)
}

function updateMonthlySchedule() {
  const state = readState()
  const axis = document.querySelector<HTMLElement>('.schedule-axis')
  if (!state || !axis) return

  const projectId = activeProjectId(state)
  const project = state.projects.find((candidate) => candidate.id === projectId)
  if (!project) return

  const months = monthRange(project)
  if (!months.length) return

  const projectSections = state.sections.filter((section) => section.projectId === project.id)
  const renderKey = [
    project.id,
    project.startDate,
    project.dueDate,
    ...projectSections.map((section) => `${section.id}:${section.startDate}:${section.dueDate}:${taskProgressForSection(state, section.id)}`),
  ].join('|')
  if (axis.dataset.monthlyScheduleKey === renderKey) return
  axis.dataset.monthlyScheduleKey = renderKey

  axis.classList.add('monthly-schedule-axis')
  axis.style.gridTemplateColumns = `repeat(${months.length}, minmax(54px, 1fr))`
  axis.replaceChildren(...months.map((month, index) => {
    const cell = document.createElement('div')
    cell.className = 'schedule-month-cell'
    const monthText = document.createElement('strong')
    monthText.textContent = `${month.getMonth() + 1}月`
    const yearText = document.createElement('small')
    const previous = months[index - 1]
    yearText.textContent = !previous || previous.getFullYear() !== month.getFullYear() ? `${month.getFullYear()}年` : ''
    cell.append(yearText, monthText)
    return cell
  }))

  const projectMonthStart = monthStart(project.startDate)
  const rows = [...document.querySelectorAll<HTMLElement>('.schedule-row')]

  rows.forEach((row) => {
    const sectionId = row.querySelector<HTMLElement>('.schedule-label strong')?.textContent?.trim()
    const section = projectSections.find((candidate) => candidate.id === sectionId)
    const lane = row.querySelector<HTMLElement>('.schedule-lane')
    const bar = row.querySelector<HTMLElement>('.schedule-bar')
    if (!section || !lane || !bar) return

    const startIndex = Math.max(0, monthDiff(projectMonthStart, monthStart(section.startDate)))
    const endIndex = Math.min(months.length - 1, monthDiff(projectMonthStart, monthStart(section.dueDate)))
    const span = Math.max(1, endIndex - startIndex + 1)

    lane.classList.add('monthly-schedule-lane')
    lane.style.setProperty('--month-count', String(months.length))
    bar.style.left = `${(startIndex / months.length) * 100}%`
    bar.style.width = `${(span / months.length) * 100}%`
    bar.style.minWidth = '0'
    bar.title = `${section.name}：${section.startDate} ～ ${section.dueDate}`

    const text = bar.querySelector<HTMLElement>('span')
    const nextText = `${sectionMonthLabel(section)} / ${taskProgressForSection(state, section.id)}%`
    if (text && text.textContent !== nextText) text.textContent = nextText
  })
}

function taskAddForm() {
  return [...document.querySelectorAll<HTMLFormElement>('form.modal.wide')]
    .find((form) => form.querySelector('h2')?.textContent?.trim() === 'タスク追加') ?? null
}

function findLabeledControl(form: HTMLFormElement, labelText: string) {
  const label = [...form.querySelectorAll<HTMLLabelElement>('label')].find((candidate) => {
    const span = candidate.querySelector('span')
    return span?.textContent?.trim().startsWith(labelText)
  })
  return label?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select') ?? null
}

function setControlValue(control: HTMLInputElement | HTMLSelectElement | null, value: string) {
  if (!control) return
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(control, value)
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

function projectForTask(state: AppState, task: WbsTask) {
  const section = state.sections.find((candidate) => candidate.id === task.sectionId)
  return state.projects.find((candidate) => candidate.id === section?.projectId)
}

function populateCopySelect(select: HTMLSelectElement, state: AppState) {
  const previousValue = select.value
  select.replaceChildren()

  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = state.tasks.length ? 'コピー元を選択してください' : '登録済みタスクがありません'
  select.append(placeholder)

  const currentProjectId = activeProjectId(state)
  const projects = [...state.projects].sort((a, b) => {
    if (a.id === currentProjectId) return -1
    if (b.id === currentProjectId) return 1
    return a.name.localeCompare(b.name, 'ja')
  })

  projects.forEach((project) => {
    const sectionIds = new Set(state.sections.filter((section) => section.projectId === project.id).map((section) => section.id))
    const tasks = state.tasks.filter((task) => sectionIds.has(task.sectionId))
    if (!tasks.length) return

    const group = document.createElement('optgroup')
    group.label = project.id === currentProjectId ? `${project.name}（現在の案件）` : project.name
    tasks
      .sort((a, b) => a.sectionId.localeCompare(b.sectionId) || a.id.localeCompare(b.id))
      .forEach((task) => {
        const section = state.sections.find((candidate) => candidate.id === task.sectionId)
        const option = document.createElement('option')
        option.value = task.id
        option.textContent = `${task.parentId ? '└ ' : ''}${task.id}｜${section?.name || 'フェーズ不明'}｜${task.name}`
        group.append(option)
      })
    select.append(group)
  })

  if ([...select.options].some((option) => option.value === previousValue)) select.value = previousValue
}

function applyTaskCopy(form: HTMLFormElement, taskId: string) {
  if (!taskId) return
  const state = readState()
  if (!state) return
  const source = state.tasks.find((task) => task.id === taskId)
  if (!source) return

  const sectionControl = findLabeledControl(form, '大日程フェーズ') as HTMLSelectElement | null
  const targetSectionId = sectionControl?.value || ''
  const targetSection = state.sections.find((section) => section.id === targetSectionId)
  const sourceSection = state.sections.find((section) => section.id === source.sectionId)
  const sourceProject = projectForTask(state, source)

  if (!targetSectionId && sourceSection?.projectId === activeProjectId(state)) {
    setControlValue(sectionControl, source.sectionId)
  }

  setControlValue(findLabeledControl(form, '階層'), source.parentId ? 'child' : 'parent')
  setControlValue(findLabeledControl(form, 'タスク名'), source.name)
  setControlValue(findLabeledControl(form, 'カテゴリ'), source.category)
  setControlValue(findLabeledControl(form, '開始日'), source.startDate)
  setControlValue(findLabeledControl(form, '期限'), source.dueDate)
  setControlValue(findLabeledControl(form, '進捗'), '0')
  setControlValue(findLabeledControl(form, '担当者'), source.assignees.join(', '))

  if (source.parentId) {
    window.requestAnimationFrame(() => {
      const parentControl = findLabeledControl(form, '親タスク') as HTMLSelectElement | null
      const currentTargetSectionId = (findLabeledControl(form, '大日程フェーズ') as HTMLSelectElement | null)?.value || targetSection?.id || ''
      const sourceParent = state.tasks.find((task) => task.id === source.parentId)
      const sameNamedParent = sourceParent
        ? state.tasks.find((task) => task.sectionId === currentTargetSectionId && task.parentId === null && task.name === sourceParent.name)
        : undefined
      setControlValue(parentControl, sameNamedParent?.id || '')
    })
  }

  const helper = form.querySelector<HTMLElement>('[data-task-copy-message]')
  if (helper) {
    helper.textContent = `「${sourceProject?.name || '案件不明'} / ${source.name}」をコピーしました。IDは新規発番、進捗は0%で登録されます。`
  }
}

function ensureTaskCopyPanel() {
  const form = taskAddForm()
  if (!form || form.querySelector('[data-task-copy-panel]')) return

  const state = readState()
  if (!state) return

  const panel = document.createElement('section')
  panel.className = 'task-copy-panel'
  panel.dataset.taskCopyPanel = 'true'

  const label = document.createElement('label')
  const caption = document.createElement('span')
  caption.textContent = '登録済みタスクからコピー'
  const select = document.createElement('select')
  select.setAttribute('aria-label', 'コピー元タスク')
  populateCopySelect(select, state)
  select.addEventListener('change', () => applyTaskCopy(form, select.value))
  label.append(caption, select)

  const helper = document.createElement('small')
  helper.dataset.taskCopyMessage = 'true'
  helper.textContent = 'コピー後に名称・日付・担当者などを修正できます。子タスクはコピー先の親タスクを確認してください。'

  panel.append(label, helper)
  form.querySelector('.modal-heading')?.insertAdjacentElement('afterend', panel)
}

function refreshEnhancements() {
  updateMonthlySchedule()
  ensureTaskCopyPanel()
}

onMounted(() => {
  observer = new MutationObserver(() => refreshEnhancements())
  observer.observe(document.body, { childList: true, subtree: true })
  refreshTimer = window.setInterval(refreshEnhancements, 700)
  window.addEventListener('change', refreshEnhancements)
  refreshEnhancements()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (refreshTimer) window.clearInterval(refreshTimer)
  window.removeEventListener('change', refreshEnhancements)
})
</script>

<template></template>

<style>
.schedule-axis.monthly-schedule-axis {
  display: grid;
  justify-content: stretch;
  gap: 0;
  padding-bottom: 0;
  border: 1px solid #dce5eb;
  border-radius: 7px 7px 0 0;
  overflow: hidden;
  background: #f6f9fb;
}
.schedule-month-cell {
  min-width: 0;
  min-height: 46px;
  display: grid;
  place-items: center;
  align-content: center;
  border-right: 1px solid #dce5eb;
  color: #17354d;
}
.schedule-month-cell:last-child { border-right: 0; }
.schedule-month-cell small {
  min-height: 14px;
  color: #8293a1;
  font-size: 9px;
  line-height: 1;
}
.schedule-month-cell strong { font-size: 12px; }
.schedule-lane.monthly-schedule-lane {
  background-color: #f8fafb;
  background-image: linear-gradient(to right, #dce5eb 1px, transparent 1px);
  background-size: calc(100% / var(--month-count)) 100%;
  border-right: 1px solid #dce5eb;
  border-left: 1px solid #dce5eb;
  border-radius: 0;
}
.schedule-lane.monthly-schedule-lane .schedule-bar {
  border-radius: 4px;
  justify-content: center;
  padding: 0 6px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.task-copy-panel {
  display: grid;
  gap: 7px;
  padding: 13px 14px;
  border: 1px solid #cfe2e6;
  border-radius: 10px;
  background: #f2fafb;
}
.task-copy-panel label { display: grid; gap: 7px; }
.task-copy-panel label > span { color: #285169; font-size: 12px; font-weight: 700; }
.task-copy-panel select { background: #fff; }
.task-copy-panel small { color: #607580; font-size: 11px; line-height: 1.55; }
@media (max-width: 760px) {
  .schedule-axis.monthly-schedule-axis {
    margin-left: 0;
    overflow-x: auto;
    grid-auto-columns: minmax(54px, 1fr);
  }
  .schedule-month-cell { min-width: 54px; }
}
</style>
