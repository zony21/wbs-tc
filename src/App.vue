<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

type ViewName = 'dashboard' | 'wbs' | 'daily'
type WorkType = 'normal' | 'staggered' | 'remote' | 'other'

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

interface WbsTask {
  id: string
  sectionId: string
  parentId: string | null
  name: string
  category: string
  startDate: string
  dueDate: string
  progress: number
  assignees: string[]
}

interface DailyEntry {
  rowId: string
  taskId: string
  hours: number
}

interface DailyReport {
  id: string
  date: string
  workType: WorkType
  startTime: string
  endTime: string
  breakHours: number
  overtimeHours: number
  remarks: string
  entries: DailyEntry[]
}

interface AppState {
  projects: Project[]
  sections: Section[]
  tasks: WbsTask[]
  reports: DailyReport[]
}

const STORAGE_KEY = 'wbs-tc-state-v1'

const seedState: AppState = {
  projects: [
    { id: 'P-001', name: '案件名未設定', startDate: '2026-07-01', dueDate: '2027-05-31' },
  ],
  sections: [
    { id: 'S-001', projectId: 'P-001', name: '要件定義', startDate: '2026-08-01', dueDate: '2026-09-30' },
    { id: 'S-002', projectId: 'P-001', name: '基本設計', startDate: '2026-09-01', dueDate: '2026-10-31' },
    { id: 'S-003', projectId: 'P-001', name: '詳細設計', startDate: '2026-11-01', dueDate: '2026-12-31' },
    { id: 'S-004', projectId: 'P-001', name: '製造・単体テスト', startDate: '2026-12-01', dueDate: '2027-02-28' },
    { id: 'S-005', projectId: 'P-001', name: '社内結合テスト', startDate: '2027-02-01', dueDate: '2027-03-31' },
    { id: 'S-006', projectId: 'P-001', name: '機器設置・疎通確認', startDate: '2026-12-01', dueDate: '2027-03-31' },
    { id: 'S-007', projectId: 'P-001', name: '現地テスト', startDate: '2027-03-01', dueDate: '2027-04-30' },
    { id: 'S-008', projectId: 'P-001', name: '稼働立会い', startDate: '2027-05-01', dueDate: '2027-05-31' },
    { id: 'S-009', projectId: 'P-001', name: 'マシンセットアップ', startDate: '2027-03-01', dueDate: '2027-03-31' },
    { id: 'S-010', projectId: 'P-001', name: '完成図書作成', startDate: '2027-04-01', dueDate: '2027-04-30' },
  ],
  tasks: [],
  reports: [],
}

function cloneSeed(): AppState {
  return JSON.parse(JSON.stringify(seedState)) as AppState
}

function normalizeLoadedState(parsed: Partial<AppState>): AppState {
  if (!Array.isArray(parsed.sections) || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.reports)) return cloneSeed()

  const rawSections = parsed.sections as Array<Section & { projectId?: string }>
  let projects = Array.isArray(parsed.projects) ? parsed.projects : []
  if (!projects.length) {
    const starts = rawSections.map((section) => section.startDate).filter(Boolean).sort()
    const ends = rawSections.map((section) => section.dueDate).filter(Boolean).sort()
    projects = [{ id: 'P-001', name: '既存案件', startDate: starts[0] || '2026-01-01', dueDate: ends.at(-1) || '2026-12-31' }]
  }
  const fallbackProjectId = projects[0].id

  return {
    projects,
    sections: rawSections.map((section) => ({ ...section, projectId: section.projectId || fallbackProjectId })),
    tasks: parsed.tasks,
    reports: parsed.reports,
  }
}

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return cloneSeed()
    return normalizeLoadedState(JSON.parse(saved) as Partial<AppState>)
  } catch {
    return cloneSeed()
  }
}

const state = reactive<AppState>(loadState())
watch(state, () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), { deep: true })

const currentView = ref<ViewName>('dashboard')
const activeProjectId = ref(state.projects[0]?.id || '')
const flashMessage = ref('')
const formError = ref('')

const currentProject = computed(() => state.projects.find((project) => project.id === activeProjectId.value) ?? state.projects[0] ?? null)
const projectSections = computed(() => state.sections.filter((section) => section.projectId === currentProject.value?.id))
const projectSectionIds = computed(() => new Set(projectSections.value.map((section) => section.id)))
const projectTasks = computed(() => state.tasks.filter((task) => projectSectionIds.value.has(task.sectionId)))

watch(() => state.projects.map((project) => project.id).join('|'), () => {
  if (!state.projects.some((project) => project.id === activeProjectId.value)) activeProjectId.value = state.projects[0]?.id || ''
})

function showMessage(message: string) {
  flashMessage.value = message
  window.setTimeout(() => {
    if (flashMessage.value === message) flashMessage.value = ''
  }, 2600)
}

function newRowId() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function nextId(prefix: string, ids: string[]) {
  const max = ids.reduce((value, id) => {
    const numeric = Number(id.replace(/\D/g, ''))
    return Number.isFinite(numeric) ? Math.max(value, numeric) : value
  }, 0)
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

function projectForSection(sectionId: string) {
  const section = state.sections.find((candidate) => candidate.id === sectionId)
  return state.projects.find((project) => project.id === section?.projectId)
}

function projectForTask(task: WbsTask | undefined) {
  return task ? projectForSection(task.sectionId) : undefined
}

function parentTasks(sectionId: string) {
  return state.tasks.filter((task) => task.sectionId === sectionId && task.parentId === null)
}

function childTasks(parentId: string) {
  return state.tasks.filter((task) => task.parentId === parentId)
}

function leafTasks(sectionId: string) {
  const sectionTasks = state.tasks.filter((task) => task.sectionId === sectionId)
  return sectionTasks.filter((task) => !state.tasks.some((candidate) => candidate.parentId === task.id))
}

function sectionProgress(sectionId: string) {
  const leaves = leafTasks(sectionId)
  if (!leaves.length) return 0
  return Math.round(leaves.reduce((sum, task) => sum + task.progress, 0) / leaves.length)
}

const overallProgress = computed(() => {
  if (!projectSections.value.length) return 0
  return Math.round(projectSections.value.reduce((sum, section) => sum + sectionProgress(section.id), 0) / projectSections.value.length)
})

const totalTaskCount = computed(() => projectTasks.value.length)
const completedTaskCount = computed(() => projectTasks.value.filter((task) => task.progress === 100).length)
const inProgressTaskCount = computed(() => projectTasks.value.filter((task) => task.progress > 0 && task.progress < 100).length)

function dateNumber(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

const scheduleStart = computed(() => {
  if (currentProject.value?.startDate) return dateNumber(currentProject.value.startDate)
  if (!projectSections.value.length) return Date.now()
  return Math.min(...projectSections.value.map((section) => dateNumber(section.startDate)))
})

const scheduleEnd = computed(() => {
  if (currentProject.value?.dueDate) return dateNumber(currentProject.value.dueDate)
  if (!projectSections.value.length) return Date.now() + 86400000
  return Math.max(...projectSections.value.map((section) => dateNumber(section.dueDate)))
})

function scheduleStyle(section: Section) {
  const start = scheduleStart.value
  const total = Math.max(scheduleEnd.value - start, 86400000)
  const left = ((dateNumber(section.startDate) - start) / total) * 100
  const width = Math.max(((dateNumber(section.dueDate) - dateNumber(section.startDate) + 86400000) / total) * 100, 2)
  return { left: `${Math.max(0, left)}%`, width: `${Math.min(100 - Math.max(0, left), width)}%` }
}

const showProjectForm = ref(false)
const editingProject = ref<Project | null>(null)
const projectForm = reactive({ name: '', startDate: '', dueDate: '' })

function openProjectForm() {
  Object.assign(projectForm, { name: '', startDate: '', dueDate: '' })
  formError.value = ''
  showProjectForm.value = true
}

function addProject() {
  formError.value = ''
  if (!projectForm.name.trim() || !projectForm.startDate || !projectForm.dueDate) {
    formError.value = '案件名・開始日・終了日を入力してください。'
    return
  }
  if (projectForm.startDate > projectForm.dueDate) {
    formError.value = '終了日は開始日以降を指定してください。'
    return
  }
  const project: Project = {
    id: nextId('P', state.projects.map((item) => item.id)),
    name: projectForm.name.trim(),
    startDate: projectForm.startDate,
    dueDate: projectForm.dueDate,
  }
  state.projects.push(project)
  activeProjectId.value = project.id
  showProjectForm.value = false
  showMessage('案件を追加しました。')
}

function openProjectEdit() {
  if (!currentProject.value) return
  editingProject.value = JSON.parse(JSON.stringify(currentProject.value)) as Project
  formError.value = ''
}

function saveProjectEdit() {
  if (!editingProject.value) return
  if (!editingProject.value.name.trim() || !editingProject.value.startDate || !editingProject.value.dueDate) {
    formError.value = '案件名・開始日・終了日を入力してください。'
    return
  }
  if (editingProject.value.startDate > editingProject.value.dueDate) {
    formError.value = '終了日は開始日以降を指定してください。'
    return
  }
  const target = state.projects.find((project) => project.id === editingProject.value?.id)
  if (!target) return
  Object.assign(target, editingProject.value, { name: editingProject.value.name.trim() })
  editingProject.value = null
  showMessage('案件情報を更新しました。')
}

const showSectionForm = ref(false)
const newSection = reactive({ name: '', startDate: '', dueDate: '' })

function openSectionForm() {
  formError.value = ''
  if (!currentProject.value) {
    formError.value = '先に案件を作成してください。'
    return
  }
  Object.assign(newSection, { name: '', startDate: currentProject.value.startDate, dueDate: currentProject.value.dueDate })
  showSectionForm.value = true
}

function addSection() {
  formError.value = ''
  if (!currentProject.value || !newSection.name.trim() || !newSection.startDate || !newSection.dueDate) {
    formError.value = 'セクション名・開始日・期限を入力してください。'
    return
  }
  if (newSection.startDate > newSection.dueDate) {
    formError.value = '期限は開始日以降を指定してください。'
    return
  }
  state.sections.push({
    id: nextId('S', state.sections.map((section) => section.id)),
    projectId: currentProject.value.id,
    name: newSection.name.trim(),
    startDate: newSection.startDate,
    dueDate: newSection.dueDate,
  })
  showSectionForm.value = false
  showMessage('大日程フェーズを追加しました。')
}

const showTaskForm = ref(false)
const newTask = reactive({ sectionId: '', kind: 'parent' as 'parent' | 'child', parentId: '', name: '', category: '', startDate: '', dueDate: '', progress: 0, assigneesText: '' })

function openTaskForm(sectionId?: string) {
  const defaultSection = sectionId ? projectSections.value.find((section) => section.id === sectionId) : projectSections.value[0]
  Object.assign(newTask, {
    sectionId: defaultSection?.id ?? '',
    kind: 'parent',
    parentId: '',
    name: '',
    category: defaultSection?.name ?? '',
    startDate: defaultSection?.startDate ?? '',
    dueDate: defaultSection?.dueDate ?? '',
    progress: 0,
    assigneesText: '',
  })
  formError.value = ''
  showTaskForm.value = true
}

function addTask() {
  formError.value = ''
  const assignees = newTask.assigneesText.split(',').map((name) => name.trim()).filter(Boolean)
  if (!newTask.sectionId || !newTask.name.trim() || !newTask.category.trim() || !newTask.startDate || !newTask.dueDate) {
    formError.value = 'フェーズ・名称・カテゴリ・開始日・期限を入力してください。'
    return
  }
  if (!projectSections.value.some((section) => section.id === newTask.sectionId)) {
    formError.value = '現在の案件に属するフェーズを選択してください。'
    return
  }
  if (newTask.startDate > newTask.dueDate) {
    formError.value = '期限は開始日以降を指定してください。'
    return
  }
  if (newTask.kind === 'child' && !newTask.parentId) {
    formError.value = '子タスクの親タスクを選択してください。'
    return
  }
  if (!assignees.length) {
    formError.value = '担当者を入力してください。'
    return
  }
  if (newTask.kind === 'child' && assignees.length !== 1) {
    formError.value = '子タスクの担当者は1名のみ設定できます。'
    return
  }
  state.tasks.push({
    id: nextId('T', state.tasks.map((task) => task.id)),
    sectionId: newTask.sectionId,
    parentId: newTask.kind === 'child' ? newTask.parentId : null,
    name: newTask.name.trim(),
    category: newTask.category.trim(),
    startDate: newTask.startDate,
    dueDate: newTask.dueDate,
    progress: Math.min(100, Math.max(0, Number(newTask.progress) || 0)),
    assignees,
  })
  showTaskForm.value = false
  showMessage('タスクを追加しました。')
}

const editingTask = ref<WbsTask | null>(null)
const editingAssignees = ref('')

function openEditTask(task: WbsTask) {
  editingTask.value = JSON.parse(JSON.stringify(task)) as WbsTask
  editingAssignees.value = task.assignees.join(', ')
  formError.value = ''
}

function saveTaskEdit() {
  if (!editingTask.value) return
  const source = state.tasks.find((task) => task.id === editingTask.value?.id)
  if (!source) return
  const assignees = editingAssignees.value.split(',').map((name) => name.trim()).filter(Boolean)
  if (!editingTask.value.name.trim() || !editingTask.value.category.trim() || !editingTask.value.startDate || !editingTask.value.dueDate || !assignees.length) {
    formError.value = '名称・カテゴリ・期間・担当者を入力してください。'
    return
  }
  if (editingTask.value.parentId && assignees.length !== 1) {
    formError.value = '子タスクの担当者は1名のみ設定できます。'
    return
  }
  Object.assign(source, editingTask.value, { assignees, progress: Math.min(100, Math.max(0, Number(editingTask.value.progress) || 0)) })
  editingTask.value = null
  showMessage('タスクを更新しました。')
}

function deleteTask(task: WbsTask) {
  const childIds = state.tasks.filter((candidate) => candidate.parentId === task.id).map((candidate) => candidate.id)
  state.tasks = state.tasks.filter((candidate) => candidate.id !== task.id && !childIds.includes(candidate.id))
  state.reports.forEach((report) => {
    report.entries = report.entries.filter((entry) => entry.taskId !== task.id && !childIds.includes(entry.taskId))
  })
  showMessage('タスクを削除しました。')
}

function todayString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const daily = reactive({
  date: todayString(),
  workType: 'normal' as WorkType,
  startTime: '09:00',
  endTime: '18:00',
  breakHours: 1,
  overtimeHours: 0,
  remarks: '',
  entries: [{ rowId: newRowId(), taskId: '', hours: 0 }] as DailyEntry[],
})

const workTypeLabels: Record<WorkType, string> = {
  normal: '通常勤務',
  staggered: '時差出勤',
  remote: '在宅勤務',
  other: 'その他',
}

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0
  return hour * 60 + minute
}

const actualWorkHours = computed(() => {
  let duration = minutes(daily.endTime) - minutes(daily.startTime)
  if (duration < 0) duration += 24 * 60
  return Math.max(0, duration / 60 - (Number(daily.breakHours) || 0))
})

const taskHoursTotal = computed(() => daily.entries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0))
const unassignedHours = computed(() => Number((actualWorkHours.value - taskHoursTotal.value).toFixed(2)))

function taskById(taskId: string) {
  return state.tasks.find((task) => task.id === taskId)
}

function addDailyEntry() {
  daily.entries.push({ rowId: newRowId(), taskId: '', hours: 0 })
}

function removeDailyEntry(rowId: string) {
  if (daily.entries.length === 1) {
    daily.entries[0] = { rowId: newRowId(), taskId: '', hours: 0 }
    return
  }
  daily.entries = daily.entries.filter((entry) => entry.rowId !== rowId)
}

const taskPickerRowId = ref<string | null>(null)
const taskSearch = reactive({ name: '', category: '', id: '', projectId: '' })
const taskCategories = computed(() => [...new Set(state.tasks.map((task) => task.category))].sort())
const filteredTasks = computed(() => {
  const name = taskSearch.name.trim().toLowerCase()
  const id = taskSearch.id.trim().toLowerCase()
  return state.tasks.filter((task) => {
    const project = projectForTask(task)
    return (!name || task.name.toLowerCase().includes(name))
      && (!id || task.id.toLowerCase().includes(id))
      && (!taskSearch.category || task.category === taskSearch.category)
      && (!taskSearch.projectId || project?.id === taskSearch.projectId)
  })
})

function openTaskPicker(rowId: string) {
  taskPickerRowId.value = rowId
  Object.assign(taskSearch, { name: '', category: '', id: '', projectId: currentProject.value?.id || '' })
}

function selectTask(taskId: string) {
  const entry = daily.entries.find((candidate) => candidate.rowId === taskPickerRowId.value)
  if (entry) entry.taskId = taskId
  taskPickerRowId.value = null
}

function resetDailyForm(date = todayString()) {
  Object.assign(daily, { date, workType: 'normal', startTime: '09:00', endTime: '18:00', breakHours: 1, overtimeHours: 0, remarks: '' })
  daily.entries = [{ rowId: newRowId(), taskId: '', hours: 0 }]
  formError.value = ''
}

function saveDailyReport() {
  formError.value = ''
  const validEntries = daily.entries.filter((entry) => entry.taskId && Number(entry.hours) > 0)
  if (!daily.date || !daily.startTime || !daily.endTime) {
    formError.value = '日付・出勤時刻・退勤時刻を入力してください。'
    return
  }
  if (!validEntries.length) {
    formError.value = '作業したタスクと作業時間を1件以上登録してください。'
    return
  }
  const report: DailyReport = {
    id: `DR-${daily.date}`,
    date: daily.date,
    workType: daily.workType,
    startTime: daily.startTime,
    endTime: daily.endTime,
    breakHours: Number(daily.breakHours) || 0,
    overtimeHours: Number(daily.overtimeHours) || 0,
    remarks: daily.remarks.trim(),
    entries: validEntries.map((entry) => ({ ...entry })),
  }
  const index = state.reports.findIndex((candidate) => candidate.date === report.date)
  if (index >= 0) state.reports[index] = report
  else state.reports.push(report)
  state.reports.sort((a, b) => b.date.localeCompare(a.date))
  showMessage(index >= 0 ? '日報を更新しました。' : '日報を登録しました。')
}

function loadReport(report: DailyReport) {
  Object.assign(daily, {
    date: report.date,
    workType: report.workType,
    startTime: report.startTime,
    endTime: report.endTime,
    breakHours: report.breakHours,
    overtimeHours: report.overtimeHours,
    remarks: report.remarks,
  })
  daily.entries = report.entries.map((entry) => ({ ...entry, rowId: newRowId() }))
  currentView.value = 'daily'
}

function reportWorkHours(report: DailyReport) {
  let duration = minutes(report.endTime) - minutes(report.startTime)
  if (duration < 0) duration += 24 * 60
  return Math.max(0, duration / 60 - report.breakHours)
}

function resetAllData() {
  const fresh = cloneSeed()
  state.projects = fresh.projects
  state.sections = fresh.sections
  state.tasks = fresh.tasks
  state.reports = fresh.reports
  activeProjectId.value = fresh.projects[0]?.id || ''
  resetDailyForm()
  showMessage('初期大日程に戻しました。')
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">W</span>
        <div>
          <strong>WBS TC</strong>
          <small>Project control</small>
        </div>
      </div>

      <div class="project-switcher">
        <span>案件</span>
        <select v-model="activeProjectId" aria-label="案件を選択">
          <option v-for="project in state.projects" :key="project.id" :value="project.id">{{ project.name }}</option>
        </select>
        <div class="project-switcher-actions">
          <button type="button" @click="openProjectForm">＋ 案件</button>
          <button v-if="currentProject" type="button" @click="openProjectEdit">編集</button>
        </div>
      </div>

      <nav class="nav-list" aria-label="メインメニュー">
        <button :class="{ active: currentView === 'dashboard' }" @click="currentView = 'dashboard'">ダッシュボード</button>
        <button :class="{ active: currentView === 'wbs' }" @click="currentView = 'wbs'">WBS管理</button>
        <button :class="{ active: currentView === 'daily' }" @click="currentView = 'daily'">日報確認</button>
      </nav>
      <button class="ghost-button reset-button" @click="resetAllData">初期データへ戻す</button>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div>
          <p class="eyebrow">WBS MANAGEMENT</p>
          <h1>{{ currentView === 'dashboard' ? 'プロジェクト状況' : currentView === 'wbs' ? 'WBS管理' : '日報登録' }}</h1>
          <p v-if="currentProject" class="project-context"><strong>{{ currentProject.name }}</strong><span>{{ currentProject.startDate }} ～ {{ currentProject.dueDate }}</span></p>
        </div>
        <div v-if="flashMessage" class="flash" role="status">{{ flashMessage }}</div>
      </header>

      <section v-if="currentView === 'dashboard'" class="stack-lg">
        <article v-if="currentProject" class="panel project-overview">
          <div>
            <p class="eyebrow">PROJECT</p>
            <h2>{{ currentProject.name }}</h2>
            <span>{{ currentProject.id }} ／ {{ currentProject.startDate }} ～ {{ currentProject.dueDate }}</span>
          </div>
          <button class="secondary-button" @click="openProjectEdit">案件情報を編集</button>
        </article>

        <div class="summary-grid">
          <article class="metric-card"><span>全体進捗</span><strong>{{ overallProgress }}%</strong><div class="progress-track"><i :style="{ width: `${overallProgress}%` }"></i></div></article>
          <article class="metric-card"><span>全タスク</span><strong>{{ totalTaskCount }}</strong><small>件</small></article>
          <article class="metric-card"><span>完了</span><strong>{{ completedTaskCount }}</strong><small>件</small></article>
          <article class="metric-card"><span>進行中</span><strong>{{ inProgressTaskCount }}</strong><small>件</small></article>
        </div>

        <article class="panel">
          <div class="panel-heading"><div><p class="eyebrow">MASTER SCHEDULE</p><h2>大日程</h2></div><button class="secondary-button" @click="currentView = 'wbs'">WBSを開く</button></div>
          <p class="schedule-note">初期大日程は提供画像のフェーズ名・月単位の期間のみを反映し、要員情報は含めていません。</p>
          <div class="schedule-axis"><span>{{ new Date(scheduleStart).toLocaleDateString('ja-JP') }}</span><span>{{ new Date(scheduleEnd).toLocaleDateString('ja-JP') }}</span></div>
          <div class="schedule-list">
            <div v-for="section in projectSections" :key="section.id" class="schedule-row">
              <div class="schedule-label"><strong>{{ section.id }}</strong><span>{{ section.name }}</span></div>
              <div class="schedule-lane"><div class="schedule-bar" :style="scheduleStyle(section)"><span>{{ sectionProgress(section.id) }}%</span></div></div>
            </div>
            <p v-if="!projectSections.length" class="empty-cell">この案件には大日程がありません。</p>
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading"><div><p class="eyebrow">SECTION PROGRESS</p><h2>フェーズ進捗</h2></div></div>
          <div class="progress-chart">
            <div v-for="section in projectSections" :key="section.id" class="progress-chart-row">
              <div class="progress-chart-label"><span>{{ section.name }}</span><strong>{{ sectionProgress(section.id) }}%</strong></div>
              <div class="progress-track large"><i :style="{ width: `${sectionProgress(section.id)}%` }"></i></div>
            </div>
          </div>
        </article>
      </section>

      <section v-else-if="currentView === 'wbs'" class="stack-lg">
        <div class="toolbar">
          <div><strong>{{ currentProject?.name || '案件未選択' }}</strong><p>案件 → 大日程フェーズ → 親タスク → 子タスクの階層で管理します。</p></div>
          <div class="toolbar-actions"><button class="secondary-button" @click="openSectionForm">＋ 大日程フェーズ</button><button class="primary-button" @click="openTaskForm()">＋ タスク</button></div>
        </div>

        <article v-for="section in projectSections" :key="section.id" class="panel section-panel">
          <div class="section-heading">
            <div><p class="eyebrow">{{ section.id }}</p><h2>{{ section.name }}</h2><p class="muted">{{ section.startDate }} ～ {{ section.dueDate }}</p></div>
            <div class="section-progress"><strong>{{ sectionProgress(section.id) }}%</strong><span>進捗</span><button class="text-button" @click="openTaskForm(section.id)">タスク追加</button></div>
          </div>
          <div class="progress-track"><i :style="{ width: `${sectionProgress(section.id)}%` }"></i></div>

          <div class="table-wrap">
            <table class="wbs-table">
              <thead><tr><th>ID</th><th>タスク</th><th>カテゴリ</th><th>担当</th><th>期間</th><th>進捗</th><th></th></tr></thead>
              <tbody>
                <template v-for="parent in parentTasks(section.id)" :key="parent.id">
                  <tr class="parent-row">
                    <td>{{ parent.id }}</td><td><strong>{{ parent.name }}</strong></td><td>{{ parent.category }}</td><td>{{ parent.assignees.join('、') }}</td><td>{{ parent.startDate }}<br>～ {{ parent.dueDate }}</td><td><div class="inline-progress"><span>{{ parent.progress }}%</span><div class="mini-track"><i :style="{ width: `${parent.progress}%` }"></i></div></div></td><td class="row-actions"><button @click="openEditTask(parent)">編集</button><button class="danger-text" @click="deleteTask(parent)">削除</button></td>
                  </tr>
                  <tr v-for="child in childTasks(parent.id)" :key="child.id" class="child-row">
                    <td>{{ child.id }}</td><td><span class="tree-mark">└</span>{{ child.name }}</td><td>{{ child.category }}</td><td>{{ child.assignees[0] }}</td><td>{{ child.startDate }}<br>～ {{ child.dueDate }}</td><td><div class="inline-progress"><span>{{ child.progress }}%</span><div class="mini-track"><i :style="{ width: `${child.progress}%` }"></i></div></div></td><td class="row-actions"><button @click="openEditTask(child)">編集</button><button class="danger-text" @click="deleteTask(child)">削除</button></td>
                  </tr>
                </template>
                <tr v-if="!parentTasks(section.id).length"><td colspan="7" class="empty-cell">タスクがありません。</td></tr>
              </tbody>
            </table>
          </div>
        </article>
        <article v-if="!projectSections.length" class="panel empty-project"><h2>大日程がありません</h2><p>「＋ 大日程フェーズ」からこの案件の工程を追加してください。</p></article>
      </section>

      <section v-else class="daily-layout">
        <div class="stack-lg">
          <article class="panel">
            <div class="panel-heading"><div><p class="eyebrow">ATTENDANCE</p><h2>勤務情報</h2></div><span class="status-pill">{{ workTypeLabels[daily.workType] }}</span></div>
            <div class="form-grid three">
              <label><span>日付</span><input v-model="daily.date" type="date"></label>
              <label><span>勤務区分</span><select v-model="daily.workType"><option value="normal">通常勤務</option><option value="staggered">時差出勤</option><option value="remote">在宅勤務</option><option value="other">その他</option></select></label>
              <div class="helper-card"><span>通常勤務の初期値</span><strong>09:00 ～ 18:00</strong><small>出退勤時刻は手修正できます。</small></div>
              <label><span>出勤時刻</span><input v-model="daily.startTime" type="time"></label>
              <label><span>退勤時刻</span><input v-model="daily.endTime" type="time"></label>
              <label><span>休憩時間</span><div class="input-unit"><input v-model.number="daily.breakHours" type="number" min="0" step="0.25"><em>時間</em></div></label>
              <label><span>残業時間</span><div class="input-unit"><input v-model.number="daily.overtimeHours" type="number" min="0" step="0.25"><em>時間</em></div></label>
            </div>
            <div class="work-summary">
              <div><span>実労働時間</span><strong>{{ actualWorkHours.toFixed(2) }}h</strong></div>
              <div><span>残業時間</span><strong>{{ Number(daily.overtimeHours || 0).toFixed(2) }}h</strong></div>
              <div><span>タスク計</span><strong>{{ taskHoursTotal.toFixed(2) }}h</strong></div>
              <div :class="['difference-card', { warning: Math.abs(unassignedHours) > 0.001 }]"><span>{{ unassignedHours >= 0 ? '未割当時間' : '超過入力' }}</span><strong>{{ Math.abs(unassignedHours).toFixed(2) }}h</strong></div>
            </div>
          </article>

          <article class="panel">
            <div class="panel-heading"><div><p class="eyebrow">WORK LOG</p><h2>作業実績</h2></div><button class="secondary-button" @click="addDailyEntry">＋ 作業追加</button></div>
            <div class="daily-entries">
              <div v-for="entry in daily.entries" :key="entry.rowId" class="daily-entry">
                <div class="task-field"><span class="field-label">タスク</span><button class="task-picker-button" @click="openTaskPicker(entry.rowId)"><template v-if="taskById(entry.taskId)"><strong>{{ taskById(entry.taskId)?.id }}</strong><span>{{ taskById(entry.taskId)?.name }}</span><small>{{ projectForTask(taskById(entry.taskId))?.name }} ／ {{ taskById(entry.taskId)?.category }}</small></template><template v-else><span>タスクを選択</span><small>案件・名前・カテゴリ・IDから検索</small></template></button></div>
                <label class="hours-field"><span>作業時間</span><div class="input-unit"><input v-model.number="entry.hours" type="number" min="0" step="0.25"><em>時間</em></div></label>
                <button class="icon-button danger-text" aria-label="作業行を削除" @click="removeDailyEntry(entry.rowId)">削除</button>
              </div>
            </div>
          </article>

          <article class="panel">
            <div class="panel-heading"><div><p class="eyebrow">NOTES</p><h2>備考</h2></div></div>
            <textarea v-model="daily.remarks" rows="5" placeholder="作業内容、課題、共有事項などを入力してください。"></textarea>
          </article>

          <p v-if="formError" class="error-message">{{ formError }}</p>
          <div class="form-actions"><button class="secondary-button" @click="resetDailyForm(daily.date)">入力をクリア</button><button class="primary-button" @click="saveDailyReport">日報を登録</button></div>
        </div>

        <aside class="panel report-history">
          <div class="panel-heading"><div><p class="eyebrow">HISTORY</p><h2>登録済み日報</h2></div></div>
          <div v-if="state.reports.length" class="history-list">
            <button v-for="report in state.reports" :key="report.id" @click="loadReport(report)"><strong>{{ report.date }}</strong><span>{{ workTypeLabels[report.workType] }}</span><small>実労働 {{ reportWorkHours(report).toFixed(2) }}h ／ 残業 {{ report.overtimeHours.toFixed(2) }}h</small></button>
          </div>
          <p v-else class="muted">まだ日報は登録されていません。</p>
        </aside>
      </section>
    </main>

    <div v-if="showProjectForm" class="modal-backdrop" @click.self="showProjectForm = false">
      <form class="modal" @submit.prevent="addProject"><div class="modal-heading"><h2>案件追加</h2><button type="button" @click="showProjectForm = false">×</button></div><div class="form-grid"><label><span>案件名</span><input v-model="projectForm.name" placeholder="例：○○工場 搬送自動化"></label><label><span>開始日</span><input v-model="projectForm.startDate" type="date"></label><label><span>終了日</span><input v-model="projectForm.dueDate" type="date"></label></div><p v-if="formError" class="error-message">{{ formError }}</p><div class="form-actions"><button type="button" class="secondary-button" @click="showProjectForm = false">キャンセル</button><button class="primary-button">追加</button></div></form>
    </div>

    <div v-if="editingProject" class="modal-backdrop" @click.self="editingProject = null">
      <form class="modal" @submit.prevent="saveProjectEdit"><div class="modal-heading"><h2>案件情報を編集</h2><button type="button" @click="editingProject = null">×</button></div><div class="form-grid"><label><span>案件名</span><input v-model="editingProject.name"></label><label><span>開始日</span><input v-model="editingProject.startDate" type="date"></label><label><span>終了日</span><input v-model="editingProject.dueDate" type="date"></label></div><p v-if="formError" class="error-message">{{ formError }}</p><div class="form-actions"><button type="button" class="secondary-button" @click="editingProject = null">キャンセル</button><button class="primary-button">保存</button></div></form>
    </div>

    <div v-if="showSectionForm" class="modal-backdrop" @click.self="showSectionForm = false">
      <form class="modal" @submit.prevent="addSection"><div class="modal-heading"><div><p class="eyebrow">{{ currentProject?.name }}</p><h2>大日程フェーズ追加</h2></div><button type="button" @click="showSectionForm = false">×</button></div><div class="form-grid"><label><span>フェーズ名</span><input v-model="newSection.name" placeholder="例：詳細設計"></label><label><span>開始日</span><input v-model="newSection.startDate" type="date"></label><label><span>期限</span><input v-model="newSection.dueDate" type="date"></label></div><p v-if="formError" class="error-message">{{ formError }}</p><div class="form-actions"><button type="button" class="secondary-button" @click="showSectionForm = false">キャンセル</button><button class="primary-button">追加</button></div></form>
    </div>

    <div v-if="showTaskForm" class="modal-backdrop" @click.self="showTaskForm = false">
      <form class="modal wide" @submit.prevent="addTask"><div class="modal-heading"><div><p class="eyebrow">{{ currentProject?.name }}</p><h2>タスク追加</h2></div><button type="button" @click="showTaskForm = false">×</button></div><div class="form-grid two"><label><span>大日程フェーズ</span><select v-model="newTask.sectionId"><option value="">選択してください</option><option v-for="section in projectSections" :key="section.id" :value="section.id">{{ section.id }}｜{{ section.name }}</option></select></label><label><span>階層</span><select v-model="newTask.kind"><option value="parent">親タスク</option><option value="child">子タスク</option></select></label><label v-if="newTask.kind === 'child'"><span>親タスク</span><select v-model="newTask.parentId"><option value="">選択してください</option><option v-for="task in parentTasks(newTask.sectionId)" :key="task.id" :value="task.id">{{ task.id }}｜{{ task.name }}</option></select></label><label><span>タスク名</span><input v-model="newTask.name"></label><label><span>カテゴリ</span><input v-model="newTask.category" placeholder="例：基本設計"></label><label><span>開始日</span><input v-model="newTask.startDate" type="date"></label><label><span>期限</span><input v-model="newTask.dueDate" type="date"></label><label><span>進捗</span><div class="input-unit"><input v-model.number="newTask.progress" type="number" min="0" max="100"><em>%</em></div></label><label class="full"><span>担当者 {{ newTask.kind === 'parent' ? '（複数可・カンマ区切り）' : '（1名）' }}</span><input v-model="newTask.assigneesText" placeholder="例：田中, 佐藤"></label></div><p v-if="formError" class="error-message">{{ formError }}</p><div class="form-actions"><button type="button" class="secondary-button" @click="showTaskForm = false">キャンセル</button><button class="primary-button">追加</button></div></form>
    </div>

    <div v-if="editingTask" class="modal-backdrop" @click.self="editingTask = null">
      <form class="modal wide" @submit.prevent="saveTaskEdit"><div class="modal-heading"><h2>{{ editingTask.id }} を編集</h2><button type="button" @click="editingTask = null">×</button></div><div class="form-grid two"><label><span>タスク名</span><input v-model="editingTask.name"></label><label><span>カテゴリ</span><input v-model="editingTask.category"></label><label><span>開始日</span><input v-model="editingTask.startDate" type="date"></label><label><span>期限</span><input v-model="editingTask.dueDate" type="date"></label><label><span>進捗</span><div class="input-unit"><input v-model.number="editingTask.progress" type="number" min="0" max="100"><em>%</em></div></label><label class="full"><span>担当者 {{ editingTask.parentId ? '（子タスクは1名）' : '（複数可・カンマ区切り）' }}</span><input v-model="editingAssignees"></label></div><p v-if="formError" class="error-message">{{ formError }}</p><div class="form-actions"><button type="button" class="secondary-button" @click="editingTask = null">キャンセル</button><button class="primary-button">保存</button></div></form>
    </div>

    <div v-if="taskPickerRowId" class="modal-backdrop" @click.self="taskPickerRowId = null">
      <div class="modal task-picker"><div class="modal-heading"><div><p class="eyebrow">TASK SEARCH</p><h2>タスク選択</h2></div><button @click="taskPickerRowId = null">×</button></div><div class="search-grid project-task-search"><label><span>案件</span><select v-model="taskSearch.projectId"><option value="">すべて</option><option v-for="project in state.projects" :key="project.id" :value="project.id">{{ project.name }}</option></select></label><label><span>名前検索</span><input v-model="taskSearch.name" placeholder="タスク名"></label><label><span>カテゴリ</span><select v-model="taskSearch.category"><option value="">すべて</option><option v-for="category in taskCategories" :key="category" :value="category">{{ category }}</option></select></label><label><span>ID検索</span><input v-model="taskSearch.id" placeholder="T-001"></label></div><div class="task-result-list"><button v-for="task in filteredTasks" :key="task.id" @click="selectTask(task.id)"><div><strong>{{ task.id }}</strong><span>{{ task.name }}</span></div><small>{{ projectForTask(task)?.name }} ／ {{ task.category }} ／ {{ task.assignees.join('、') }}</small></button><p v-if="!filteredTasks.length" class="empty-cell">条件に一致するタスクがありません。</p></div></div>
    </div>
  </div>
</template>

<style scoped>
.project-switcher {
  display: grid;
  gap: 7px;
  padding: 12px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 10px;
  background: rgba(255,255,255,.06);
}
.project-switcher > span { color: #afc0cb; font-size: 11px; font-weight: 700; }
.project-switcher select { min-height: 38px; padding: 7px 9px; border-color: rgba(255,255,255,.18); background: #fff; color: #17354d; }
.project-switcher-actions { display: flex; gap: 6px; }
.project-switcher-actions button { flex: 1; min-height: 32px; border: 1px solid rgba(255,255,255,.2); border-radius: 7px; background: transparent; color: #dbe5eb; font-size: 11px; }
.project-context { display: flex; gap: 10px; margin: 7px 0 0; color: #6b7f8e; font-size: 12px; }
.project-context strong { color: #234c69; }
.project-overview { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.project-overview span { display: block; margin-top: 6px; color: #6b7f8e; font-size: 13px; }
.schedule-note { margin: -6px 0 14px; color: #6b7f8e; font-size: 12px; }
.empty-project { text-align: center; padding: 42px 20px; }
.empty-project p { margin: 8px 0 0; color: #6b7f8e; }
.project-task-search { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 760px) {
  .project-switcher { display: none; }
  .project-overview { align-items: flex-start; flex-direction: column; }
  .project-context { flex-direction: column; gap: 2px; }
  .project-task-search { grid-template-columns: 1fr; }
}
</style>
