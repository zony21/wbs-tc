import express from 'express'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  workType: 'normal' | 'staggered' | 'remote' | 'other'
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
fs.mkdirSync(dataDir, { recursive: true })

const databasePath = process.env.SQLITE_PATH || path.join(dataDir, 'wbs-tc.sqlite3')
const db = new Database(databasePath)
db.pragma('foreign_keys = ON')
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    due_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    parent_id TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    start_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    FOREIGN KEY(section_id) REFERENCES sections(id) ON DELETE CASCADE,
    FOREIGN KEY(parent_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_assignees (
    task_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    assignee TEXT NOT NULL,
    PRIMARY KEY(task_id, position),
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS daily_reports (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    work_type TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    break_hours REAL NOT NULL DEFAULT 0,
    overtime_hours REAL NOT NULL DEFAULT 0,
    remarks TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS daily_entries (
    row_id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    hours REAL NOT NULL CHECK(hours >= 0),
    FOREIGN KEY(report_id) REFERENCES daily_reports(id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );
`)

// Existing databases created before project management did not have project_id.
const sectionColumns = db.prepare('PRAGMA table_info(sections)').all() as Array<{ name: string }>
if (!sectionColumns.some((column) => column.name === 'project_id')) {
  db.exec('ALTER TABLE sections ADD COLUMN project_id TEXT;')
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sections_project ON sections(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_section ON tasks(section_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
  CREATE INDEX IF NOT EXISTS idx_reports_date ON daily_reports(date);
  CREATE INDEX IF NOT EXISTS idx_entries_report ON daily_entries(report_id);
  CREATE INDEX IF NOT EXISTS idx_entries_task ON daily_entries(task_id);
`)

// Initial master schedule is based only on the supplied image. Personnel counts and SE/PG assignment bars are not imported.
// The source image shows month-level periods, but no exact calendar dates, so month starts/ends are used without inventing day-level detail.
const seedState: AppState = {
  projects: [
    {
      id: 'P-001',
      name: '案件名未設定',
      startDate: '2026-07-01',
      dueDate: '2027-05-31',
    },
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

const insertProject = db.prepare('INSERT INTO projects (id, name, start_date, due_date) VALUES (?, ?, ?, ?)')
const insertSection = db.prepare('INSERT INTO sections (id, project_id, name, start_date, due_date) VALUES (?, ?, ?, ?, ?)')
const insertTask = db.prepare('INSERT INTO tasks (id, section_id, parent_id, name, category, start_date, due_date, progress) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, position, assignee) VALUES (?, ?, ?)')
const insertReport = db.prepare('INSERT INTO daily_reports (id, date, work_type, start_time, end_time, break_hours, overtime_hours, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
const insertEntry = db.prepare('INSERT INTO daily_entries (row_id, report_id, task_id, hours) VALUES (?, ?, ?, ?)')

function normalizeState(input: Partial<AppState>): AppState {
  const sections = Array.isArray(input.sections) ? input.sections : []
  const tasks = Array.isArray(input.tasks) ? input.tasks : []
  const reports = Array.isArray(input.reports) ? input.reports : []
  let projects = Array.isArray(input.projects) ? input.projects : []

  if (!projects.length) {
    const starts = sections.map((section) => section.startDate).filter(Boolean).sort()
    const ends = sections.map((section) => section.dueDate).filter(Boolean).sort()
    projects = [{
      id: 'P-001',
      name: '既存案件',
      startDate: starts[0] || '2026-01-01',
      dueDate: ends.at(-1) || '2026-12-31',
    }]
  }

  const fallbackProjectId = projects[0].id
  return {
    projects,
    sections: sections.map((section) => ({ ...section, projectId: section.projectId || fallbackProjectId })),
    tasks,
    reports,
  }
}

const replaceState = db.transaction((rawState: AppState) => {
  const state = normalizeState(rawState)
  db.exec('DELETE FROM daily_entries; DELETE FROM daily_reports; DELETE FROM task_assignees; DELETE FROM tasks; DELETE FROM sections; DELETE FROM projects;')

  for (const project of state.projects) {
    insertProject.run(project.id, project.name, project.startDate, project.dueDate)
  }

  for (const section of state.sections) {
    insertSection.run(section.id, section.projectId, section.name, section.startDate, section.dueDate)
  }

  const parentTasks = state.tasks.filter((task) => task.parentId === null)
  const childTasks = state.tasks.filter((task) => task.parentId !== null)
  for (const task of [...parentTasks, ...childTasks]) {
    insertTask.run(task.id, task.sectionId, task.parentId, task.name, task.category, task.startDate, task.dueDate, Math.max(0, Math.min(100, Math.round(task.progress))))
    task.assignees.forEach((assignee, index) => insertAssignee.run(task.id, index, assignee))
  }

  for (const report of state.reports) {
    insertReport.run(report.id, report.date, report.workType, report.startTime, report.endTime, report.breakHours, report.overtimeHours, report.remarks)
    for (const entry of report.entries) {
      insertEntry.run(entry.rowId, report.id, entry.taskId, entry.hours)
    }
  }
})

function readState(): AppState {
  const projectRows = db.prepare('SELECT id, name, start_date, due_date FROM projects ORDER BY id').all() as Array<{ id: string; name: string; start_date: string; due_date: string }>
  const sectionRows = db.prepare('SELECT id, project_id, name, start_date, due_date FROM sections ORDER BY id').all() as Array<{ id: string; project_id: string | null; name: string; start_date: string; due_date: string }>
  const taskRows = db.prepare('SELECT id, section_id, parent_id, name, category, start_date, due_date, progress FROM tasks ORDER BY start_date, id').all() as Array<{ id: string; section_id: string; parent_id: string | null; name: string; category: string; start_date: string; due_date: string; progress: number }>
  const assignees = db.prepare('SELECT task_id, assignee FROM task_assignees ORDER BY task_id, position').all() as Array<{ task_id: string; assignee: string }>
  const reportRows = db.prepare('SELECT id, date, work_type, start_time, end_time, break_hours, overtime_hours, remarks FROM daily_reports ORDER BY date DESC').all() as Array<{ id: string; date: string; work_type: DailyReport['workType']; start_time: string; end_time: string; break_hours: number; overtime_hours: number; remarks: string }>
  const entryRows = db.prepare('SELECT row_id, report_id, task_id, hours FROM daily_entries ORDER BY row_id').all() as Array<{ row_id: string; report_id: string; task_id: string; hours: number }>
  const fallbackProjectId = projectRows[0]?.id || 'P-001'

  return {
    projects: projectRows.map((row) => ({ id: row.id, name: row.name, startDate: row.start_date, dueDate: row.due_date })),
    sections: sectionRows.map((row) => ({ id: row.id, projectId: row.project_id || fallbackProjectId, name: row.name, startDate: row.start_date, dueDate: row.due_date })),
    tasks: taskRows.map((row) => ({
      id: row.id,
      sectionId: row.section_id,
      parentId: row.parent_id,
      name: row.name,
      category: row.category,
      startDate: row.start_date,
      dueDate: row.due_date,
      progress: row.progress,
      assignees: assignees.filter((item) => item.task_id === row.id).map((item) => item.assignee),
    })),
    reports: reportRows.map((row) => ({
      id: row.id,
      date: row.date,
      workType: row.work_type,
      startTime: row.start_time,
      endTime: row.end_time,
      breakHours: row.break_hours,
      overtimeHours: row.overtime_hours,
      remarks: row.remarks,
      entries: entryRows.filter((entry) => entry.report_id === row.id).map((entry) => ({ rowId: entry.row_id, taskId: entry.task_id, hours: entry.hours })),
    })),
  }
}

const legacySectionNames = new Set(['要件定義', '基本設計', '開発', 'テスト'])
const legacyTaskNames = new Set([
  '搬送要件整理',
  '搬送パターン整理',
  'QA整理',
  '画面要件整理',
  '操作画面レイアウト',
  'DB設計',
  '画面基本設計',
])

function isLegacySampleState() {
  const sections = db.prepare('SELECT name FROM sections ORDER BY id').all() as Array<{ name: string }>
  const tasks = db.prepare('SELECT name FROM tasks ORDER BY id').all() as Array<{ name: string }>
  const reportCount = (db.prepare('SELECT COUNT(*) AS count FROM daily_reports').get() as { count: number }).count

  if (reportCount > 0 || sections.length === 0) return false
  const onlyLegacySections = sections.length <= legacySectionNames.size && sections.every((row) => legacySectionNames.has(row.name))
  const onlyLegacyTasks = tasks.length <= legacyTaskNames.size && tasks.every((row) => legacyTaskNames.has(row.name))
  return onlyLegacySections && onlyLegacyTasks
}

const existingSectionCount = (db.prepare('SELECT COUNT(*) AS count FROM sections').get() as { count: number }).count
const existingProjectCount = (db.prepare('SELECT COUNT(*) AS count FROM projects').get() as { count: number }).count

if (existingProjectCount === 0 && existingSectionCount === 0) {
  replaceState(seedState)
} else if (isLegacySampleState()) {
  // Replace only the known old sample dataset. User-created project/task/report data is never reset automatically.
  replaceState(seedState)
  console.log('Legacy sample data replaced with the supplied-image master schedule.')
} else if (existingProjectCount === 0) {
  const range = db.prepare('SELECT MIN(start_date) AS start_date, MAX(due_date) AS due_date FROM sections').get() as { start_date: string | null; due_date: string | null }
  insertProject.run('P-001', '既存案件', range.start_date || '2026-01-01', range.due_date || '2026-12-31')
  db.prepare("UPDATE sections SET project_id = 'P-001' WHERE project_id IS NULL OR project_id = ''").run()
} else {
  const firstProject = db.prepare('SELECT id FROM projects ORDER BY id LIMIT 1').get() as { id: string } | undefined
  if (firstProject) db.prepare('UPDATE sections SET project_id = ? WHERE project_id IS NULL OR project_id = ?').run(firstProject.id, '')
}

const app = express()
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, databasePath })
})

app.get('/api/state', (_req, res) => {
  res.json(readState())
})

app.put('/api/state', (req, res) => {
  const state = req.body as Partial<AppState>
  if (!Array.isArray(state.sections) || !Array.isArray(state.tasks) || !Array.isArray(state.reports)) {
    res.status(400).json({ message: 'sections, tasks, reports are required.' })
    return
  }

  try {
    replaceState(normalizeState(state))
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to save state.' })
  }
})

const distDir = path.join(rootDir, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

const port = Number(process.env.PORT || 3001)
app.listen(port, () => {
  console.log(`WBS TC server listening on http://localhost:${port}`)
  console.log(`SQLite: ${databasePath}`)
})
