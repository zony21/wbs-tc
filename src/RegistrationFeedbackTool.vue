<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const STORAGE_KEY = 'wbs-tc-state-v1'
const SUCCESS_KEY = 'wbs-registration-success'

type Destination = 'dashboard' | 'wbs' | 'daily'
type FeedbackMode = 'dialog' | 'toast'

interface SuccessState {
  message: string
  destination: Destination
  mode: FeedbackMode
}

const success = ref<SuccessState | null>(null)
let pendingTimer: number | undefined
let pendingSessionTimer: number | undefined
let toastTimer: number | undefined

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
    return { message: '日報を登録しました。', destination: 'daily', mode: 'dialog' }
  }
  if (text === '仮保存' && button.classList.contains('daily-draft-button')) {
    return { message: '日報を仮保存しました。', destination: 'daily', mode: 'dialog' }
  }
  if (text === '保存' && button.closest('.section-edit-modal')) {
    return { message: 'WBSセクションを更新しました。', destination: 'wbs', mode: 'dialog' }
  }

  const modal = button.closest<HTMLFormElement>('form.modal')
  const title = modal?.querySelector('h2')?.textContent?.trim() || ''
  if (!modal) return null

  if (text === '追加' && title === '案件追加') {
    return { message: '案件を登録しました。', destination: 'dashboard', mode: 'dialog' }
  }
  if (text === '追加' && title === '大日程フェーズ追加') {
    return { message: '大日程フェーズを登録しました。', destination: 'wbs', mode: 'dialog' }
  }
  if (text === '追加' && title === 'タスク追加') {
    return { message: 'タスクを追加しました。', destination: 'wbs', mode: 'toast' }
  }
  if (text === '保存' && title === '案件情報を編集') {
    return { message: '案件情報を更新しました。', destination: 'dashboard', mode: 'dialog' }
  }
  if (text === '保存' && /を編集$/.test(title)) {
    return { message: 'タスクを更新しました。', destination: 'wbs', mode: 'toast' }
  }

  return null
}

function isReloadSave(button: HTMLButtonElement) {
  const text = button.textContent?.trim() || ''
  return (text === '仮保存' && button.classList.contains('daily-draft-button'))
    || (text === '保存' && Boolean(button.closest('.section-edit-modal')))
}

function setPendingSessionSuccess(candidate: SuccessState) {
  const serialized = JSON.stringify(candidate)
  sessionStorage.setItem(SUCCESS_KEY, serialized)
  if (pendingSessionTimer) window.clearTimeout(pendingSessionTimer)
  pendingSessionTimer = window.setTimeout(() => {
    if (sessionStorage.getItem(SUCCESS_KEY) === serialized) sessionStorage.removeItem(SUCCESS_KEY)
  }, 5000)
}

function showSuccess(candidate: SuccessState) {
  success.value = candidate
  if (toastTimer) window.clearTimeout(toastTimer)

  if (candidate.mode === 'toast') {
    toastTimer = window.setTimeout(() => {
      if (success.value === candidate) success.value = null
    }, 3200)
  }
}

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const button = target?.closest<HTMLButtonElement>('button')
  if (!button) return

  const candidate = classifyButton(button)
  if (!candidate) return

  if (isReloadSave(button)) {
    setPendingSessionSuccess(candidate)
    return
  }

  const before = readStorage()
  if (pendingTimer) window.clearTimeout(pendingTimer)
  pendingTimer = window.setTimeout(() => {
    const after = readStorage()
    if (after !== before || successFlashVisible()) showSuccess(candidate)
  }, 120)
}

function restorePendingSuccess() {
  const raw = sessionStorage.getItem(SUCCESS_KEY)
  if (!raw) return
  sessionStorage.removeItem(SUCCESS_KEY)
  try {
    const parsed = JSON.parse(raw) as SuccessState
    if (parsed?.message && parsed?.destination) {
      showSuccess({ ...parsed, mode: parsed.mode || 'dialog' })
    }
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

function closeToast() {
  success.value = null
  if (toastTimer) {
    window.clearTimeout(toastTimer)
    toastTimer = undefined
  }
}

onMounted(() => {
  document.addEventListener('click', handleClick)
  restorePendingSuccess()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClick)
  if (pendingTimer) window.clearTimeout(pendingTimer)
  if (pendingSessionTimer) window.clearTimeout(pendingSessionTimer)
  if (toastTimer) window.clearTimeout(toastTimer)
})
</script>

<template>
  <div v-if="success?.mode === 'dialog'" class="registration-success-backdrop">
    <section class="registration-success-dialog" role="dialog" aria-modal="true" aria-labelledby="registration-success-title">
      <div class="registration-success-icon">✓</div>
      <h2 id="registration-success-title">保存しました</h2>
      <p>{{ success.message }}</p>
      <button type="button" @click="returnToList">一覧へ戻る</button>
    </section>
  </div>

  <div v-else-if="success?.mode === 'toast'" class="registration-success-toast" role="status" aria-live="polite">
    <div class="registration-success-toast-icon">✓</div>
    <div class="registration-success-toast-body">
      <strong>保存しました</strong>
      <span>{{ success.message }}</span>
    </div>
    <button type="button" aria-label="通知を閉じる" @click="closeToast">×</button>
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
.registration-success-toast {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 340;
  width: min(360px, calc(100vw - 32px));
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 30px;
  align-items: center;
  gap: 10px;
  padding: 13px 12px 13px 14px;
  border: 1px solid #cfe7db;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 36px rgba(23, 53, 77, .18);
  animation: registration-toast-in .2s ease-out;
}
.registration-success-toast-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #e8f6ef;
  color: #28734d;
  font-size: 18px;
  font-weight: 900;
}
.registration-success-toast-body {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.registration-success-toast-body strong {
  color: #17354d;
  font-size: 13px;
}
.registration-success-toast-body span {
  overflow: hidden;
  color: #536b7d;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.registration-success-toast > button {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #7b8d9a;
  font: inherit;
  font-size: 18px;
  cursor: pointer;
}
.registration-success-toast > button:hover { background: #f2f6f8; }
@keyframes registration-toast-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 600px) {
  .registration-success-toast {
    right: 16px;
    bottom: 16px;
    left: 16px;
    width: auto;
  }
}
</style>
