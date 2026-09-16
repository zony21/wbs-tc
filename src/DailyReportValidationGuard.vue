<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const confirmOpen = ref(false)
const reasons = ref<string[]>([])
let pendingButton: HTMLButtonElement | null = null
let bypassOnce = false

function controlByLabel(text: string) {
  const labels = [...document.querySelectorAll<HTMLLabelElement>('.main-content label')]
  const label = labels.find((candidate) => candidate.querySelector('span')?.textContent?.trim() === text)
  return label?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select') ?? null
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0
  return hour * 60 + minute
}

function numberLabel(value: number) {
  return Number(value.toFixed(2)).toString()
}

function actualWorkHours() {
  const startTime = controlByLabel('出勤時刻') as HTMLInputElement | null
  const endTime = controlByLabel('退勤時刻') as HTMLInputElement | null
  const breakHours = controlByLabel('休憩時間') as HTMLInputElement | null
  if (!startTime?.value || !endTime?.value) return null

  let durationMinutes = toMinutes(endTime.value) - toMinutes(startTime.value)
  if (durationMinutes < 0) durationMinutes += 24 * 60
  return Math.max(0, durationMinutes / 60 - (Number(breakHours?.value) || 0))
}

function taskHours() {
  return [...document.querySelectorAll<HTMLInputElement>('.daily-entry .hours-field input')]
    .reduce((sum, input) => sum + (Number(input.value) || 0), 0)
}

function hasSelectedTask() {
  return [...document.querySelectorAll<HTMLElement>('.daily-entry .task-picker-button strong')]
    .some((element) => Boolean(element.textContent?.trim()))
}

function buildReasons() {
  const result: string[] = []
  const actual = actualWorkHours()
  if (actual === null) return result

  const workType = controlByLabel('勤務区分') as HTMLSelectElement | null
  const overtimeHours = controlByLabel('残業時間') as HTMLInputElement | null
  const overtime = Number(overtimeHours?.value) || 0

  if (workType?.value === 'normal' && overtime > 0) {
    const expected = 8 + overtime
    if (Math.abs(actual - expected) >= 0.01) {
      result.push(`通常勤務で残業${numberLabel(overtime)}時間の場合、実労働は${numberLabel(expected)}時間必要ですが、現在は${numberLabel(actual)}時間です。`)
    }
  }

  if (hasSelectedTask()) {
    const tasks = taskHours()
    if (Math.abs(actual - tasks) >= 0.01) {
      const difference = Math.abs(actual - tasks)
      result.push(`実労働${numberLabel(actual)}時間に対して、タスク工数の合計は${numberLabel(tasks)}時間です（差 ${numberLabel(difference)}時間）。`)
    }
  }

  return result
}

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const button = target?.closest<HTMLButtonElement>('button')
  if (!button || button.textContent?.trim() !== '日報を登録') return

  if (bypassOnce) {
    bypassOnce = false
    return
  }

  const mismatches = buildReasons()
  if (!mismatches.length) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  reasons.value = mismatches
  pendingButton = button
  confirmOpen.value = true
}

function cancelRegistration() {
  confirmOpen.value = false
  pendingButton = null
}

function registerAnyway() {
  const button = pendingButton
  confirmOpen.value = false
  pendingButton = null
  if (!button) return
  bypassOnce = true
  button.click()
}

onMounted(() => document.addEventListener('click', handleClick, true))
onBeforeUnmount(() => document.removeEventListener('click', handleClick, true))
</script>

<template>
  <div v-if="confirmOpen" class="daily-time-check-backdrop">
    <section class="daily-time-check-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-time-check-title">
      <header>
        <div>
          <p>TIME CHECK</p>
          <h2 id="daily-time-check-title">時間が合っていません</h2>
        </div>
      </header>

      <p class="daily-time-check-question">入力時間に差異があります。このまま日報を登録しますか？</p>
      <ul>
        <li v-for="reason in reasons" :key="reason">{{ reason }}</li>
      </ul>
      <p class="daily-time-check-note">入力ミスでないことを確認してから登録してください。</p>

      <footer>
        <button type="button" class="secondary" @click="cancelRegistration">入力に戻る</button>
        <button type="button" class="primary" @click="registerAnyway">このまま登録</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.daily-time-check-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(18, 38, 54, .48);
}
.daily-time-check-dialog {
  width: min(560px, 100%);
  display: grid;
  gap: 14px;
  padding: 22px;
  border-radius: 15px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(0,0,0,.2);
}
.daily-time-check-dialog header p { margin: 0 0 4px; color: #d67720; font-size: 11px; font-weight: 800; letter-spacing: .12em; }
.daily-time-check-dialog h2 { margin: 0; color: #17354d; }
.daily-time-check-question { margin: 0; color: #344f63; font-weight: 700; }
.daily-time-check-dialog ul { margin: 0; padding: 13px 16px 13px 34px; border-radius: 10px; background: #fff4d9; color: #7c5200; line-height: 1.65; }
.daily-time-check-note { margin: 0; color: #6b7f8e; font-size: 12px; }
.daily-time-check-dialog footer { display: flex; justify-content: flex-end; gap: 9px; }
.daily-time-check-dialog button { min-height: 42px; padding: 9px 16px; border-radius: 9px; font: inherit; font-weight: 800; cursor: pointer; }
.daily-time-check-dialog .secondary { border: 1px solid #dce5eb; background: #fff; color: #17354d; }
.daily-time-check-dialog .primary { border: 0; background: #d67720; color: #fff; }
@media (max-width: 600px) {
  .daily-time-check-dialog footer { flex-direction: column-reverse; }
  .daily-time-check-dialog button { width: 100%; }
}
</style>
