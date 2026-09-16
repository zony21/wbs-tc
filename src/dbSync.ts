export const STORAGE_KEY = 'wbs-tc-state-v1'

let lastSyncedValue = ''
let syncTimer: number | undefined
let syncInFlight = false

function emitStatus(online: boolean, message = '') {
  window.dispatchEvent(new CustomEvent('wbs-db-status', { detail: { online, message } }))
}

export async function bootstrapDatabaseState() {
  try {
    const response = await fetch('/api/state', { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const state = await response.json()
    const serialized = JSON.stringify(state)
    localStorage.setItem(STORAGE_KEY, serialized)
    lastSyncedValue = serialized
    emitStatus(true)
    return true
  } catch (error) {
    console.error('SQLite state load failed:', error)
    emitStatus(false, 'SQLite APIに接続できません。ローカルデータで起動しています。')
    return false
  }
}

export async function flushStateToDatabase() {
  if (syncInFlight) return false
  const value = localStorage.getItem(STORAGE_KEY)
  if (!value) return false

  syncInFlight = true
  try {
    const response = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: value,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.message || `HTTP ${response.status}`)
    }
    lastSyncedValue = value
    emitStatus(true)
    return true
  } catch (error) {
    console.error('SQLite state save failed:', error)
    emitStatus(false, 'SQLiteへの保存に失敗しました。')
    return false
  } finally {
    syncInFlight = false
  }
}

export function startDatabaseSync() {
  if (syncTimer) window.clearInterval(syncTimer)
  syncTimer = window.setInterval(async () => {
    const current = localStorage.getItem(STORAGE_KEY) || ''
    if (!current || current === lastSyncedValue || syncInFlight) return
    await flushStateToDatabase()
  }, 600)
}
