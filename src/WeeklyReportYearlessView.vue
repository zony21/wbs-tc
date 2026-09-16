<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

let observer: MutationObserver | null = null
let syncing = false

function stripYear(value: string) {
  return value.replace(/\d{4}年/g, '')
}

function updateWeeklyDisplay() {
  if (syncing) return
  syncing = true
  try {
    document.querySelectorAll<HTMLElement>('.weekly-periods span').forEach((element) => {
      const current = element.textContent || ''
      const next = stripYear(current)
      if (current !== next) element.textContent = next
    })

    const textarea = document.querySelector<HTMLTextAreaElement>('#weekly-report-output')
    if (textarea) {
      const next = stripYear(textarea.value)
      if (textarea.value !== next) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        setter?.call(textarea, next)
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
  } finally {
    syncing = false
  }
}

onMounted(() => {
  updateWeeklyDisplay()
  observer = new MutationObserver(updateWeeklyDisplay)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  window.addEventListener('wbs-open-weekly-report', updateWeeklyDisplay)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('wbs-open-weekly-report', updateWeeklyDisplay)
})
</script>

<template></template>
