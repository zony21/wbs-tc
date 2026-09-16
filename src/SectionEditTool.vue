<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { flushStateToDatabase } from './dbSync'

interface Project {
  id: string
  name: string
  startDate: string
  dueDate: string
}

interface Section {
  id: string
  projectId: string
  name: string
  startDate: string
  dueDate: string
}

interface AppState {
  projects: Project[]
  sections: Section[]
  tasks: unknown[]
  reports: unknown[]
}

const STORAGE_KEY = 'wbs-tc-state-v1'
const RETURN_KEY = 'wbs-return-wbs-after-section-edit'
const editing = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const form = reactive({ id: '', name: '', startDate: '', dueDate: '' })
let observer: MutationObserver | null = null
let retryTimer: number | undefined

function readState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AppState
    if (!Array.isArray(parsed.sections)) return null
    return parsed
  } catch {
    return null
  }
}

function sectionIdFromPanel(panel: HTMLElement) {
  return panel.querySelector<HTMLElement>('.section-heading .eyebrow')?.textContent?.trim() || ''
}

function openEditor(sectionId: string) {
  const state = readState()
  const section = state?.sections.find((candidate) => candidate.id === sectionId)
  if (!section) return
  Object.assign(form, {
    id: section.id,
    name: section.name,
    startDate: section.startDate,
    dueDate: section.dueDate,
  })
  errorMessage.value = ''
  editing.value = true
}

function enhanceSectionPanels() {
  document.querySelectorAll<HTMLElement>('.section-panel').forEach((panel) => {
    const heading = panel.querySelector<HTMLElement>('.section-heading')
    const progress = panel.querySelector<HTMLElement>('.section-progress')
    if (!heading || !progress || progress.querySelector('.section-edit-button')) return

    const sectionId = sectionIdFromPanel(panel)
    if (!sectionId) return

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'text-button section-edit-button'
    button.textContent = 'セクション編集'
    button.addEventListener('click', () => openEditor(sectionId))
    progress.append(button)
  })
}

async function saveSection() {
  errorMessage.value = ''
  const name = form.name.trim()
  if (!name || !form.startDate || !form.dueDate) {
    errorMessage.value = 'フェーズ名・開始日・期限を入力してください。'
    return
  }
  if (form.startDate > form.dueDate) {
    errorMessage.value = '期限は開始日以降を指定してください。'
    return
  }

  const state = readState()
  const section = state?.sections.find((candidate) => candidate.id === form.id)
  if (!state || !section) {
    errorMessage.value = '編集対象のセクションを取得できませんでした。'
    return
  }

  section.name = name
  section.startDate = form.startDate
  section.dueDate = form.dueDate

  saving.value = true
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    await flushStateToDatabase()
    sessionStorage.setItem(RETURN_KEY, '1')
    window.location.reload()
  } catch (error) {
    console.error(error)
    errorMessage.value = 'セクションを保存できませんでした。'
    saving.value = false
  }
}

function returnToWbsIfNeeded() {
  if (sessionStorage.getItem(RETURN_KEY) !== '1') return
  sessionStorage.removeItem(RETURN_KEY)
  retryTimer = window.setTimeout(() => {
    const wbsButton = [...document.querySelectorAll<HTMLButtonElement>('.nav-list button')]
      .find((button) => button.textContent?.trim() === 'WBS管理')
    wbsButton?.click()
  }, 120)
}

onMounted(() => {
  enhanceSectionPanels()
  observer = new MutationObserver(enhanceSectionPanels)
  observer.observe(document.body, { childList: true, subtree: true })
  returnToWbsIfNeeded()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (retryTimer) window.clearTimeout(retryTimer)
})
</script>

<template>
  <div v-if="editing" class="section-edit-backdrop" @click.self="editing = false">
    <form class="section-edit-modal" @submit.prevent="saveSection">
      <header>
        <div>
          <p>WBS SECTION</p>
          <h2>{{ form.id }} を編集</h2>
        </div>
        <button type="button" aria-label="閉じる" @click="editing = false">×</button>
      </header>

      <label>
        <span>フェーズ名</span>
        <input v-model="form.name" type="text">
      </label>
      <div class="section-edit-grid">
        <label>
          <span>開始日</span>
          <input v-model="form.startDate" type="date">
        </label>
        <label>
          <span>期限</span>
          <input v-model="form.dueDate" type="date">
        </label>
      </div>

      <p class="section-edit-note">セクション期間を変更しても、配下タスクの日付は自動変更しません。</p>
      <p v-if="errorMessage" class="section-edit-error">{{ errorMessage }}</p>

      <footer>
        <button type="button" class="secondary" :disabled="saving" @click="editing = false">キャンセル</button>
        <button type="submit" class="primary" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
      </footer>
    </form>
  </div>
</template>

<style>
.section-edit-button { margin-top: 2px; }
.section-edit-backdrop {
  position: fixed;
  inset: 0;
  z-index: 180;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(18, 38, 54, .45);
}
.section-edit-modal {
  width: min(560px, 100%);
  display: grid;
  gap: 16px;
  padding: 22px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(0,0,0,.18);
}
.section-edit-modal header,
.section-edit-modal footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.section-edit-modal header p { margin: 0 0 4px; color: #14a6b6; font-size: 11px; font-weight: 800; letter-spacing: .12em; }
.section-edit-modal header h2 { margin: 0; color: #17354d; }
.section-edit-modal header > button { border: 0; background: transparent; color: #6b7f8e; font-size: 24px; }
.section-edit-modal label { display: grid; gap: 7px; color: #6b7f8e; font-size: 12px; }
.section-edit-modal input { min-height: 42px; padding: 10px 11px; border: 1px solid #dce5eb; border-radius: 9px; color: #243746; }
.section-edit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.section-edit-note { margin: 0; padding: 10px 12px; border-radius: 8px; background: #edf4f7; color: #5e7383; font-size: 12px; }
.section-edit-error { margin: 0; padding: 10px 12px; border-radius: 8px; background: #fff0ed; color: #a2392d; }
.section-edit-modal footer { justify-content: flex-end; }
.section-edit-modal footer button { min-height: 42px; padding: 9px 16px; border-radius: 9px; font-weight: 700; }
.section-edit-modal .secondary { border: 1px solid #dce5eb; background: #fff; color: #17354d; }
.section-edit-modal .primary { border: 0; background: #14a6b6; color: #fff; }
@media (max-width: 600px) { .section-edit-grid { grid-template-columns: 1fr; } }
</style>
