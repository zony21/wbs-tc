<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const errorMessage = ref('')
let clearTimer: number | undefined

function controlByLabel(text: string) {
  const labels = [...document.querySelectorAll<HTMLLabelElement>('.main-content label')]
  const label = labels.find((candidate) => {
    const span = candidate.querySelector('span')
    return span?.textContent?.trim() === text
  })
  return label?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select') ?? null
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0
  return hour * 60 + minute
}

function formatTime(totalMinutes: number) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440
  const hour = Math.floor(normalized / 60)
  const minute = normalized % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function showError(message: string) {
  errorMessage.value = message
  if (clearTimer) window.clearTimeout(clearTimer)
  clearTimer = window.setTimeout(() => {
    errorMessage.value = ''
  }, 7000)
}

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const button = target?.closest('button')
  if (!button || button.textContent?.trim() !== '日報を登録') return

  const workType = controlByLabel('勤務区分') as HTMLSelectElement | null
  const startTime = controlByLabel('出勤時刻') as HTMLInputElement | null
  const endTime = controlByLabel('退勤時刻') as HTMLInputElement | null
  const breakHours = controlByLabel('休憩時間') as HTMLInputElement | null
  const overtimeHours = controlByLabel('残業時間') as HTMLInputElement | null

  if (!workType || !startTime || !endTime || !breakHours || !overtimeHours) return
  if (workType.value !== 'normal') return

  const overtime = Number(overtimeHours.value) || 0
  if (overtime <= 0) return

  let durationMinutes = toMinutes(endTime.value) - toMinutes(startTime.value)
  if (durationMinutes < 0) durationMinutes += 24 * 60

  const breakValue = Number(breakHours.value) || 0
  const actualWorkHours = durationMinutes / 60 - breakValue
  const expectedWorkHours = 8 + overtime

  if (Math.abs(actualWorkHours - expectedWorkHours) < 0.01) {
    errorMessage.value = ''
    return
  }

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  const expectedEndMinutes = toMinutes(startTime.value) + (expectedWorkHours + breakValue) * 60
  const expectedEnd = formatTime(expectedEndMinutes)
  showError(
    `通常勤務の勤務時間と残業時間が一致していません。残業${Number(overtime.toFixed(2))}時間の場合、実労働は${Number(expectedWorkHours.toFixed(2))}時間必要です。現在は${Number(actualWorkHours.toFixed(2))}時間です。${startTime.value}出勤・休憩${Number(breakValue.toFixed(2))}時間の場合、退勤時刻の目安は${expectedEnd}です。`,
  )
}

onMounted(() => document.addEventListener('click', handleClick, true))
onBeforeUnmount(() => {
  document.removeEventListener('click', handleClick, true)
  if (clearTimer) window.clearTimeout(clearTimer)
})
</script>

<template>
  <div v-if="errorMessage" class="daily-validation-error" role="alert">
    <strong>日報を登録できません</strong>
    <span>{{ errorMessage }}</span>
    <button type="button" aria-label="エラーを閉じる" @click="errorMessage = ''">×</button>
  </div>
</template>

<style scoped>
.daily-validation-error {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 200;
  width: min(520px, calc(100vw - 48px));
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 5px 14px;
  padding: 16px 16px 16px 18px;
  border: 1px solid #e7a59c;
  border-left: 5px solid #d74d3f;
  border-radius: 12px;
  background: #fff7f5;
  color: #6f2e27;
  box-shadow: 0 14px 40px rgba(86, 37, 31, .18);
}
.daily-validation-error strong { font-size: 14px; }
.daily-validation-error span { grid-column: 1 / 2; line-height: 1.6; font-size: 13px; }
.daily-validation-error button {
  grid-column: 2;
  grid-row: 1 / 3;
  align-self: start;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 8px;
  background: #f6dfdb;
  color: #7b312a;
  font-size: 20px;
  cursor: pointer;
}
@media (max-width: 600px) {
  .daily-validation-error { right: 12px; bottom: 12px; width: calc(100vw - 24px); }
}
</style>
