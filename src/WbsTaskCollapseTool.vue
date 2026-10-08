<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

const collapsedParents = new Set<string>()
let observer: MutationObserver | undefined
let refreshFrame: number | undefined

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
    parentRow.classList.remove('wbs-parent-collapsed')
    return
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
  toggle.textContent = collapsed ? '▶' : '▼'
  toggle.setAttribute('aria-expanded', String(!collapsed))
  toggle.setAttribute('aria-label', `${taskId} の子タスクを${collapsed ? '展開' : '折りたたみ'}`)
  toggle.title = collapsed ? '子タスクを展開' : '子タスクを折りたたむ'

  parentRow.classList.toggle('wbs-parent-collapsed', collapsed)
  children.forEach((row) => {
    row.hidden = collapsed
  })
}

function refreshCollapseControls() {
  refreshFrame = undefined
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
.wbs-task-collapse-toggle {
  width: 26px;
  height: 26px;
  margin: -3px 7px -3px 0;
  padding: 0;
  border: 1px solid #d7e1e8;
  border-radius: 7px;
  background: #fff;
  color: #557083;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  vertical-align: middle;
  cursor: pointer;
}

.wbs-task-collapse-toggle:hover {
  border-color: #8fcbd1;
  background: #f1fbfc;
  color: #117782;
}

.wbs-task-collapse-toggle:focus-visible {
  outline: 3px solid rgba(20, 166, 182, .2);
  outline-offset: 1px;
}

.wbs-table .parent-row.wbs-parent-collapsed td {
  background: #fbfdfe;
}

.wbs-table .child-row[hidden] {
  display: none !important;
}
</style>
