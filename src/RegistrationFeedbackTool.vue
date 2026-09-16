<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const STORAGE_KEY = 'wbs-tc-state-v1'
export const SUCCESS_KEY = 'wbs-registration-success'

type Destination = 'dashboard' | 'wbs' | 'daily'

interface SuccessState {
  message: string
  destination: Destination
}

const success = ref<SuccessState | null>(null)
let pendingTimer: number | undefined

function readStorage() {
  return localStorage.getItem(STORAGE_KEY) || ''
}

function successFlashVisible() {
  const text = document.querySelector<HTMLElement>('.flash')?.textContent?.trim() || ''
  return /(追加|登録|更新)しました/.test(text)
}

function classifyButton(button: HTMLButtonElement): SuccessState | null {
  const text = button.textContent?.trim() || ''

  if (text === '日報を登録' && button.closest('.daily-layout')) {
    return { message: '日報を登録しました。', destination: 'daily' }
  }

  const modal = button.closest<HTMLFormElement>('form.modal')
  const title = modal?.querySelector('h2')?.textContent?.trim() || ''
  if (!modal) return null

  if (text === '追加' && title === '案件追加') {
    return { message: '案件を登録しました。', destination: 'dashboard' }
  }
  if (text === '追加' && title === '大日程フェーズ追加') {
    return { message: '大日程フェーズを登録しました。', destination: 'wbs' }
  }
  if (text === '追加' && title === 'タスク追加') {
    return { message: 'タスクを登録しました。', destination: 'wbs' }
  }
  if (text === '保存' && title === '案件情報を編集') {
    return { message: '案件情報を更新しました。', destination: 'dashboard' }
  }
  if (text === '保存' && /を編集$/.test(title)) {
    return { message: 'タスクを更新しました。', destination: 'wbs' }
  }

  return null
}

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const button = target?.closest<HTMLButtonElement>('button')
  if (!button) return

  const candidate = classifyButton(button)
  if (!candidate) return

  const before = readStorage()
  if (pendingTimer) window.clearTimeout(pendingTimer)
  pendingTimer = window.setTimeout(() => {
    const after = readStorage()
    if (after !== before || successFlashVisible()) success.value = candidate
  }, 120)
}

function restorePendingSuccess() {
  const raw = sessionStorage.getItem(SUCCESS_KEY)
  if (!raw) return
  sessionStorage.removeItem(SUCCESS_KEY)
  try {
    const parsed = JSON.parse(raw) as SuccessState
    if (parsed?.message && parsed?.destination) success.value = parsed
  } catch {
    // Ignore invalid session data.
  }
}

function clickNav(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('.nav-list button')]
    .find((candidate) => candidate.textContent?.trim() === label)
  button?.click()
}

function returnToList() {
  const destination = success.value?.destination
  success.value = null

  if (destination === 'daily') {
    window.dispatchEvent(new CustomEvent('wbs-open-daily-review'))
    return
  }
  if (destination === 'wbs') {
    clickNav('WBS管理')
    return
  }
  clickNav('ダッシュボード')
}

onMounted(() => {
  document.addEventListener('click', handleClick)
  restorePendingSuccess()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClick)
  if (pendingTimer) window.clearTimeout(pendingTimer)
})
</script>

<template>
  <div v-if="success" class="registration-success-backdrop">
    <section class="registration-success-dialog" role="dialog" aria-modal="true" aria-labelledby="registration-success-title">
      <div class="registration-success-icon">✓</div>
      <h2 id="registration-success-title">登録完了</h2>
      <p>{{ success.message }}</p>
      <button type="button" @click="returnToList">一覧へ戻る</button>
    </section>
  </div>
</template>

<style scoped>
.registration-success-backdrop {
  position: fixed;
  inset: 0;
  z-index: 320;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(18, 38, 54, .42);
}
.registration-success-dialog {
  width: min(430px, 100%);
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 28px 24px 24px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(0,0,0,.2);
  text-align: center;
}
.registration-success-icon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #e8f6ef;
  color: #28734d;
  font-size: 28px;
  font-weight: 900;
}
.registration-success-dialog h2 { margin: 2px 0 0; color: #17354d; }
.registration-success-dialog p { margin: 0 0 8px; color: #536b7d; }
.registration-success-dialog button {
  min-width: 150px;
  min-height: 42px;
  padding: 9px 18px;
  border: 0;
  border-radius: 9px;
  background: #14a6b6;
  color: #fff;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
</style>
