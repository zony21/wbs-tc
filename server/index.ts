import express from 'express'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

interface Section {
  id: string
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
  CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    due_date TEXT NOT NULL
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

  CREATE INDEX IF NOT EXISTS idx_tasks_section ON tasks(section_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
  CREATE INDEX IF NOT EXISTS idx_reports_date ON daily_reports(date);
  CREATE INDEX IF NOT EXISTS idx_entries_report ON daily_entries(report_id);
  CREATE INDEX IF NOT EXISTS idx_entries_task ON daily_entries(task_id);
`)

const seedState: AppState = {
  sections: [
    { id: 'S-01', name: '要件定義', startDate: '2026-09-01', dueDate: '2026-09-25' },
    { id: 'S-02', name: '基本設計', startDate: '2026-09-26', dueDate: '2026-10-23' },
    { id: 'S-03', name: '開発', startDate: '2026-10-24', dueDate: '2026-11-20' },
    { id: 'S-04', name: 'テスト', startDate: '2026-11-07', dueDate: '2026-11-27' },
  ],
  tasks: [
    { id: 'T-001', sectionId: 'S-01', parentId: null, name: '搬送要件整理', category: '要件定義', startDate: '2026-09-01', dueDate: '2026-09-12', progress: 100, assignees: ['田中', '佐藤'] },
    { id: 'T-002', sectionId: 'S-01', parentId: 'T-001', name: '搬送パターン整理', category: '要件定義', startDate: '2026-09-01', dueDate: '2026-09-08', progress: 100, assignees: ['田中'] },
    { id: 'T-003', sectionId: 'S-01', parentId: 'T-001', name: 'QA整理', category: '要件定義', startDate: '2026-09-05', dueDate: '2026-09-12', progress: 100, assignees: ['佐藤'] },
    { id: 'T-004', sectionId: 'S-01', parentId: null, name: '画面要件整理', category: '要件定義', startDate: '2026-09-10', dueDate: '2026-09-25', progress: 60, assignees: ['鈴木', '田中'] },
    { id: 'T-005', sectionId: 'S-01', parentId: 'T-004', name: '操作画面レイアウト', category: '要件定義', startDate: '2026-09-10', dueDate: '2026-09-18', progress: 80, assignees: ['鈴木'] },
    { id: 'T-006', sectionId: 'S-02', parentId: null, name: 'DB設計', category: '基本設計', startDate: '2026-09-26', dueDate: '2026-10-09', progress: 25, assignees: ['田中', '山田'] },
    { id: 'T-007', sectionId: 'S-02', parentId: null, name: '画面基本設計', category: '基本設計', startDate: '2026-10-01', dueDate: '2026-10-16', progress: 10, assignees: ['鈴木', '佐藤'] },
  ],
  reports: [],
}

const insertSection = db.prepare('INSERT INTO sections (id, name, start_date, due_date) VALUES (?, ?, ?, ?)')
const insertTask = db.prepare('INSERT INTO tasks (id, section_id, parent_id, name, category, start_date, due_date, progress) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, position, assignee) VALUES (?, ?, ?)')
const insertReport = db.prepare('INSERT INTO daily_reports (id, date, work_type, start_time, end_time, break_hours, overtime_hours, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
const insertEntry = db.prepare('INSERT INTO daily_entries (row_id, report_id, task_id, hours) VALUES (?, ?, ?, ?)')

const replaceState = db.transaction((state: AppState) => {
  db.exec('DELETE FROM daily_entries; DELETE FROM daily_reports; DELETE FROM task_assignees; DELETE FROM tasks; DELETE FROM sections;')

  for (const section of state.sections) {
    insertSection.run(section.id, section.name, section.startDate, section.dueDate)
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
  const sections = db.prepare('SELECT id, name, start_date, due_date FROM sections ORDER BY start_date, id').all() as Array<{ id: string; name: string; start_date: string; due_date: string }>
  const taskRows = db.prepare('SELECT id, section_id, parent_id, name, category, start_date, due_date, progress FROM tasks ORDER BY start_date, id').all() as Array<{ id: string; section_id: string; parent_id: string | null; name: string; category: string; start_date: string; due_date: string; progress: number }>
  const assignees = db.prepare('SELECT task_id, assignee FROM task_assignees ORDER BY task_id, position').all() as Array<{ task_id: string; assignee: string }>
  const reportRows = db.prepare('SELECT id, date, work_type, start_time, end_time, break_hours, overtime_hours, remarks FROM daily_reports ORDER BY date DESC').all() as Array<{ id: string; date: string; work_type: DailyReport['workType']; start_time: string; end_time: string; break_hours: number; overtime_hours: number; remarks: string }>
  const entryRows = db.prepare('SELECT row_id, report_id, task_id, hours FROM daily_entries ORDER BY row_id').all() as Array<{ row_id: string; report_id: string; task_id: string; hours: number }>

  return {
    sections: sections.map((row) => ({ id: row.id, name: row.name, startDate: row.start_date, dueDate: row.due_date })),
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

const sectionCount = db.prepare('SELECT COUNT(*) AS count FROM sections').get() as { count: number }
if (sectionCount.count === 0) replaceState(seedState)

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
    replaceState(state as AppState)
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
