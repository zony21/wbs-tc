<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

let dailyNavButton: HTMLButtonElement | null = null
let navButtons: HTMLButtonElement[] = []
let allowDailyEntry = false
let retryTimer: number | undefined

function findNavigationButtons() {
  return [...document.querySelectorAll<HTMLButtonElement>('.nav-list button')]
}

function openReviewFromNavigation() {
  if (allowDailyEntry) return
  window.dispatchEvent(new CustomEvent('wbs-open-daily-review'))
}

function closeReviewFromOtherNavigation(event: Event) {
  if (event.currentTarget === dailyNavButton) return
  window.dispatchEvent(new CustomEvent('wbs-close-daily-review'))
}

function wireNavigation() {
  navButtons = findNavigationButtons()
  dailyNavButton = navButtons.find((button) => {
    const text = button.textContent?.trim()
    return text === '日報登録' || text === '日報確認'
  }) ?? null

  if (!dailyNavButton) {
    retryTimer = window.setTimeout(wireNavigation, 100)
    return
  }

  dailyNavButton.textContent = '日報確認'
  dailyNavButton.addEventListener('click', openReviewFromNavigation)
  navButtons.forEach((button) => button.addEventListener('click', closeReviewFromOtherNavigation))
}

function openDailyEntry() {
  if (!dailyNavButton) wireNavigation()
  if (!dailyNavButton) return

  allowDailyEntry = true
  window.dispatchEvent(new CustomEvent('wbs-close-daily-review'))
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
  dailyNavButton?.removeEventListener('click', openReviewFromNavigation)
  navButtons.forEach((button) => button.removeEventListener('click', closeReviewFromOtherNavigation))
  window.removeEventListener('wbs-open-daily-entry', openDailyEntry)
})
</script>

<template></template>
