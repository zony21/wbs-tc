<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

const collapsedParents = new Set<string>()
const initializedParents = new Set<string>()
const collapsedSections = new Set<string>()
const initializedSections = new Set<string>()
let observer: MutationObserver | undefined
let refreshFrame: number | undefined
let wbsVisible = false

function taskIdForRow(row: HTMLTableRowElement) {
  return row.cells.item(0)?.textContent?.trim() || ''
}

function childRowsFor(parentRow: HTMLTableRowElement) {
  const rows: HTMLTableRowElement[] = []
  let next = parentRow.nextElementSibling

  while (next instanceof HTMLTableRowElement && next.classList.contains('child-row')) {
    rows.push(next)
    next = next.nextElementSibling
  }

  return rows
}

function applyParentState(parentRow: HTMLTableRowElement) {
  const taskId = taskIdForRow(parentRow)
  const taskCell = parentRow.cells.item(1)
  if (!taskId || !taskCell) return

  const children = childRowsFor(parentRow)
  let toggle = taskCell.querySelector<HTMLButtonElement>(':scope > .wbs-task-collapse-toggle')

  if (!children.length) {
    toggle?.remove()
    collapsedParents.delete(taskId)
    initializedParents.delete(taskId)
    parentRow.classList.remove('wbs-parent-collapsed')
    return
  }

  if (!initializedParents.has(taskId)) {
    initializedParents.add(taskId)
    collapsedParents.add(taskId)
  }

  if (!toggle) {
    toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'wbs-task-collapse-toggle'
    toggle.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()

      if (collapsedParents.has(taskId)) collapsedParents.delete(taskId)
      else collapsedParents.add(taskId)

      applyParentState(parentRow)
    })
    taskCell.prepend(toggle)
  }

  const collapsed = collapsedParents.has(taskId)
  const icon = collapsed ? '▶' : '▼'
  if (toggle.textContent !== icon) toggle.textContent = icon
  toggle.setAttribute('aria-expanded', String(!collapsed))
  toggle.setAttribute('aria-label', `${taskId} の子タスクを${collapsed ? '展開' : '折りたたみ'}`)
  toggle.title = collapsed ? '子タスクを展開' : '子タスクを折りたたむ'

  parentRow.classList.toggle('wbs-parent-collapsed', collapsed)
  children.forEach((row) => {
    row.hidden = collapsed
  })
}

function sectionIdFor(panel: HTMLElement) {
  return panel.querySelector<HTMLElement>('.section-heading .eyebrow')?.textContent?.trim() || ''
}

function applySectionState(panel: HTMLElement) {
  const sectionId = sectionIdFor(panel)
  const progressArea = panel.querySelector<HTMLElement>('.section-heading .section-progress')
  const tableWrap = panel.querySelector<HTMLElement>('.table-wrap')
  if (!sectionId || !progressArea || !tableWrap) return

  if (!initializedSections.has(sectionId)) {
    initializedSections.add(sectionId)
    collapsedSections.add(sectionId)
  }

  let toggle = progressArea.querySelector<HTMLButtonElement>(':scope > .wbs-section-collapse-toggle')
  if (!toggle) {
    toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'wbs-section-collapse-toggle'
    toggle.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()

      if (collapsedSections.has(sectionId)) collapsedSections.delete(sectionId)
      else collapsedSections.add(sectionId)

      applySectionState(panel)
    })
    progressArea.append(toggle)
  }

  const collapsed = collapsedSections.has(sectionId)
  const label = collapsed ? '▶ タスク表示' : '▼ タスクを隠す'
  if (toggle.textContent !== label) toggle.textContent = label
  toggle.setAttribute('aria-expanded', String(!collapsed))
  toggle.setAttribute('aria-label', `${sectionId} のタスクを${collapsed ? '展開' : '折りたたみ'}`)
  toggle.title = collapsed ? 'このフェーズのタスクを表示' : 'このフェーズのタスクを隠す'

  panel.classList.toggle('wbs-section-collapsed', collapsed)
  tableWrap.hidden = collapsed
}

function resetForWbsOpen() {
  collapsedParents.clear()
  initializedParents.clear()
  collapsedSections.clear()
  initializedSections.clear()
}

function refreshCollapseControls() {
  refreshFrame = undefined

  const panels = [...document.querySelectorAll<HTMLElement>('.section-panel')]
  if (!panels.length) {
    wbsVisible = false
    return
  }

  if (!wbsVisible) {
    wbsVisible = true
    resetForWbsOpen()
  }

  panels.forEach((panel) => applySectionState(panel))
  document.querySelectorAll<HTMLTableRowElement>('.wbs-table tbody > tr.parent-row')
    .forEach((row) => applyParentState(row))
}

function scheduleRefresh() {
  if (refreshFrame !== undefined) return
  refreshFrame = window.requestAnimationFrame(refreshCollapseControls)
}

onMounted(() => {
  observer = new MutationObserver(scheduleRefresh)
  observer.observe(document.body, { childList: true, subtree: true })
  scheduleRefresh()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (refreshFrame !== undefined) window.cancelAnimationFrame(refreshFrame)
})
</script>

<template></template>

<style>
.wbs-section-collapse-toggle,
.wbs-task-collapse-toggle {
  border: 1px solid #d7e1e8;
  background: #fff;
  color: #557083;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.wbs-section-collapse-toggle:hover,
.wbs-task-collapse-toggle:hover {
  border-color: #8fcbd1;
  background: #f1fbfc;
  color: #117782;
}

.wbs-section-collapse-toggle:focus-visible,
.wbs-task-collapse-toggle:focus-visible {
  outline: 3px solid rgba(20, 166, 182, .2);
  outline-offset: 1px;
}

.wbs-section-collapse-toggle {
  min-height: 32px;
  padding: 6px 10px;
  border-radius: 8px;
  white-space: nowrap;
  font-size: 12px;
}

.wbs-task-collapse-toggle {
  width: 26px;
  height: 26px;
  margin: -3px 7px -3px 0;
  padding: 0;
  border-radius: 7px;
  font-size: 11px;
  line-height: 1;
  vertical-align: middle;
}

.section-panel.wbs-section-collapsed .table-wrap,
.section-panel.wbs-section-collapsed .table-wrap[hidden] {
  display: none !important;
}

.wbs-table .parent-row.wbs-parent-collapsed td {
  background: #fbfdfe;
}

.wbs-table .child-row[hidden] {
  display: none !important;
}
</style>
