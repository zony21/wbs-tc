<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

let dailyNavButton: HTMLButtonElement | null = null
let allowDailyEntry = false
let retryTimer: number | undefined

function findDailyNavButton() {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.nav-list button')]
  return buttons.find((button) => {
    const text = button.textContent?.trim()
    return text === '日報登録' || text === '日報確認'
  }) ?? null
}

function openReviewFromNavigation(event: Event) {
  if (allowDailyEntry) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  window.dispatchEvent(new CustomEvent('wbs-open-daily-review'))
}

function wireNavigation() {
  const button = findDailyNavButton()
  if (!button) {
    retryTimer = window.setTimeout(wireNavigation, 100)
    return
  }

  dailyNavButton = button
  dailyNavButton.textContent = '日報確認'
  dailyNavButton.addEventListener('click', openReviewFromNavigation, true)
}

function openDailyEntry() {
  if (!dailyNavButton) wireNavigation()
  if (!dailyNavButton) return

  allowDailyEntry = true
  dailyNavButton.click()
  window.queueMicrotask(() => {
    allowDailyEntry = false
  })
}

onMounted(() => {
  wireNavigation()
  window.addEventListener('wbs-open-daily-entry', openDailyEntry)
})

onBeforeUnmount(() => {
  if (retryTimer) window.clearTimeout(retryTimer)
  dailyNavButton?.removeEventListener('click', openReviewFromNavigation, true)
  window.removeEventListener('wbs-open-daily-entry', openDailyEntry)
})
</script>

<template></template>
