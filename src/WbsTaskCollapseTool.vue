<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

const expandedSections = new Set<string>()
const expandedParents = new Set<string>()
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

function sectionIdFor(panel: HTMLElement) {
  return panel.querySelector<HTMLElement>('.section-heading .eyebrow')?.textContent?.trim() || ''
}

function parentRowsFor(panel: HTMLElement) {
  return [...panel.querySelectorAll<HTMLTableRowElement>('.wbs-table tbody > tr.parent-row')]
}

function collapseParentsIn(panel: HTMLElement) {
  parentRowsFor(panel).forEach((row) => {
    const taskId = taskIdForRow(row)
    if (taskId) expandedParents.delete(taskId)
  })
}

function applyParentState(parentRow: HTMLTableRowElement, sectionExpanded: boolean) {
  const taskId = taskIdForRow(parentRow)
  const taskCell = parentRow.cells.item(1)
  if (!taskId || !taskCell) return

  const children = childRowsFor(parentRow)
  let toggle = taskCell.querySelector<HTMLButtonElement>(':scope > .wbs-task-collapse-toggle')

  if (!children.length) {
    toggle?.remove()
    expandedParents.delete(taskId)
    parentRow.classList.remove('wbs-parent-expanded')
    return
  }

  children.forEach((row) => {
    row.dataset.wbsParentId = taskId
    row.removeAttribute('hidden')
  })

  if (!toggle) {
    toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'wbs-task-collapse-toggle'
    toggle.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()

      if (expandedParents.has(taskId)) expandedParents.delete(taskId)
      else expandedParents.add(taskId)

      refreshCollapseControls()
    })
    taskCell.prepend(toggle)
  }

  const expanded = sectionExpanded && expandedParents.has(taskId)
  const icon = expanded ? '▼' : '▶'
  if (toggle.textContent !== icon) toggle.textContent = icon
  toggle.setAttribute('aria-expanded', String(expanded))
  toggle.setAttribute('aria-label', `${taskId} の子タスクを${expanded ? '折りたたみ' : '展開'}`)
  toggle.title = expanded ? '子タスクを折りたたむ' : '子タスクを展開'

  parentRow.classList.toggle('wbs-parent-expanded', expanded)
  children.forEach((row) => {
    row.style.display = expanded ? 'table-row' : 'none'
  })
}

function applySectionState(panel: HTMLElement) {
  const sectionId = sectionIdFor(panel)
  const progressArea = panel.querySelector<HTMLElement>('.section-heading .section-progress')
  const tableWrap = panel.querySelector<HTMLElement>('.table-wrap')
  if (!sectionId || !progressArea || !tableWrap) return

  let toggle = progressArea.querySelector<HTMLButtonElement>(':scope > .wbs-section-collapse-toggle')
  if (!toggle) {
    toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'wbs-section-collapse-toggle'
    toggle.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()

      if (expandedSections.has(sectionId)) {
        expandedSections.delete(sectionId)
        collapseParentsIn(panel)
      } else {
        expandedSections.add(sectionId)
      }

      refreshCollapseControls()
    })
    progressArea.append(toggle)
  }

  const expanded = expandedSections.has(sectionId)
  const label = expanded ? '▼ タスクを隠す' : '▶ タスク表示'
  if (toggle.textContent !== label) toggle.textContent = label
  toggle.setAttribute('aria-expanded', String(expanded))
  toggle.setAttribute('aria-label', `${sectionId} のタスクを${expanded ? '折りたたみ' : '展開'}`)
  toggle.title = expanded ? 'このフェーズのタスクを隠す' : 'このフェーズのタスクを表示'

  panel.classList.toggle('wbs-section-expanded', expanded)
  tableWrap.removeAttribute('hidden')
  tableWrap.style.display = expanded ? '' : 'none'

  parentRowsFor(panel).forEach((row) => applyParentState(row, expanded))
}

function resetForWbsOpen() {
  expandedSections.clear()
  expandedParents.clear()
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

.wbs-table .parent-row:not(.wbs-parent-expanded) td {
  background: #fbfdfe;
}
</style>
