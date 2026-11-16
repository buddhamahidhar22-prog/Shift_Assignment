import { useEffect, useRef, useState } from 'react'
import { Activity, CalendarDays, Check, Coffee, FileSpreadsheet, LayoutDashboard, RefreshCw, Users } from 'lucide-react'
import { parseTaWorkbook } from './services/taSheetParser'
import './App.css'

const availabilityOptions = ['Available', 'On Break', 'Change Call', 'Out of BAU', 'Unavailable']
const statusColor = { Online: '#18a873', Busy: '#ef6b62', Away: '#e5a92f', Offline: '#8b95a7' }
const availabilityColor = { Available: '#18a873', 'On Break': '#e5a92f', 'Change Call': '#8b5cf6', 'Out of BAU': '#ef6b62', Unavailable: '#8b95a7' }

async function request(path, options) {
  const response = await fetch(path, options)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

function normalizeTaskset(tasks, engineers, assignments) {
  if (assignments && tasks.some((task) => assignments[task.id]?.['Shift-1'] || assignments[task.id]?.['Shift-2'])) {
    return Object.fromEntries(tasks.map((task) => [task.id, {
      'Shift-1': assignments[task.id]?.['Shift-1'] ?? [],
      'Shift-2': assignments[task.id]?.['Shift-2'] ?? [],
    }]))
  }
  const flatAssignments = assignments ?? {}
  return Object.fromEntries(tasks.map((task) => {
    const assigned = engineers.filter((engineer) => (
      Array.isArray(flatAssignments[task.id])
        ? flatAssignments[task.id].includes(engineer.id)
        : flatAssignments[engineer.id] === task.id
    ))
    return [task.id, {
      'Shift-1': assigned.filter((engineer) => engineer.shift === 'Shift-1').map((engineer) => engineer.id),
      'Shift-2': assigned.filter((engineer) => engineer.shift === 'Shift-2').map((engineer) => engineer.id),
    }]
  }))
}

export default function App() {
  const [role, setRole] = useState('management')
  const [activeSection, setActiveSection] = useState('dashboard')
  const [state, setState] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [changeNumber, setChangeNumber] = useState('')
  const [sheetPreview, setSheetPreview] = useState(null)
  const fileInput = useRef(null)
  const isEngineerView = role !== 'management'
  const demoEngineer = state?.engineers?.[0]
  const secondDemoEngineer = state?.engineers?.[1]
  const currentEngineerId = isEngineerView
    ? role === 'engineer-demo-2' ? secondDemoEngineer?.id : demoEngineer?.id
    : state?.engineers?.[0]?.id
  const currentEngineer = state?.engineers?.find((engineer) => engineer.id === currentEngineerId)
  const currentEngineerName = currentEngineer?.name ?? 'Engineer'
  const currentDate = new Date(currentTime)
  const istTime = currentDate.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const istDate = currentDate.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const formatIst = (value) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  const loadState = async () => {
    setBusy(true)
    try { setState(await request('/api/state')) } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  useEffect(() => { loadState() }, [])
  useEffect(() => {
    const updateClock = () => setCurrentTime(Date.now())
    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [])

  const pendingBreaks = state?.breaks.filter((item) => item.status === 'Pending') ?? []
  const activeBreaks = state?.breaks.filter((item) => item.status === 'Active') ?? []
  const breakHistory = state?.breaks.filter((item) => item.status === 'Completed' || item.status === 'Withdrawn').sort((a, b) => new Date(b.completedAt || b.withdrawnAt || b.acknowledgedAt || 0) - new Date(a.completedAt || a.withdrawnAt || a.acknowledgedAt || 0)) ?? []
  const availableCount = state?.engineers.filter((item) => item.availability === 'Available').length ?? 0
  const dailyAssignments = normalizeTaskset(state?.tasks ?? [], state?.engineers ?? [], state?.dailyTaskset?.assignments)
  const dailyPublished = state?.dailyTaskset?.published ?? false
  const engineersFor = (taskId) => state?.engineers.filter((engineer) => (
    dailyAssignments[taskId]?.['Shift-1']?.includes(engineer.id) || dailyAssignments[taskId]?.['Shift-2']?.includes(engineer.id)
  )) ?? []
  const engineersForShift = (taskId, shift) => state?.engineers.filter((engineer) => dailyAssignments[taskId]?.[shift]?.includes(engineer.id)) ?? []
  const taskCoverage = (state?.tasks ?? []).map((task) => {
    const assigned = engineersFor(task.id)
    const available = assigned.filter((engineer) => engineer.availability === 'Available')
    return { ...task, assigned: assigned.length, available: available.length }
  })
  const atRiskTasks = taskCoverage.filter((task) => task.available === 0)

  const updateEngineer = async (id, update) => {
    try { setState((current) => ({ ...current, engineers: current.engineers.map((item) => item.id === id ? { ...item, ...update } : item) })); await request(`/api/engineers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) }); setMessage('Tracker updated') } catch (error) { setMessage(error.message); loadState() }
  }
  const updateDailyTaskset = async (assignments, published = false, newEngineers = [], roster = null) => {
    try {
      setState((current) => ({ ...current, dailyTaskset: { ...current.dailyTaskset, assignments, published: false } }))
      const updated = await request('/api/daily-taskset', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignments, published, newEngineers, roster, replaceRoster: Array.isArray(roster) }) })
      setState(updated)
      setMessage(published ? 'Daily taskset published to engineers' : 'Daily taskset saved as draft')
    } catch (error) { setMessage(error.message); loadState() }
  }
  const publishDailyTaskset = () => updateDailyTaskset(dailyAssignments, true)
  const handleSheetUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = await parseTaWorkbook(file, state.tasks, state.engineers)
      setSheetPreview(parsed)
      await updateDailyTaskset(parsed.assignments, false, parsed.newEngineers, parsed.roster)
      setMessage(`Excel imported as a draft: ${parsed.assignedCount} assignments and ${parsed.newEngineers.length} new engineers captured.`)
    } catch (error) { setMessage(error.message) }
  }
  const syncTeams = async () => { setBusy(true); try { setState(await request('/api/teams/sync', { method: 'POST' })); setMessage('Teams status synced') } catch (error) { setMessage(error.message) } finally { setBusy(false) } }
  const requestBreak = async () => { if (!currentEngineerId) { setMessage('Select an imported engineer before requesting a break'); return } try { await request('/api/breaks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engineerId: currentEngineerId }) }); await loadState(); setMessage('Break request sent for acknowledgement') } catch (error) { setMessage(error.message) } }
  const acknowledge = async (id) => { if (!currentEngineerId) { setMessage('Select an engineer before acknowledging a break'); return } try { await request(`/api/breaks/${id}/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acknowledgedById: currentEngineerId }) }); await loadState(); setMessage('Break acknowledged') } catch (error) { setMessage(error.message) } }
  const returnFromBreak = async (id) => { try { await request(`/api/breaks/${id}/back`, { method: 'POST' }); await loadState(); setMessage('Engineer marked as back') } catch (error) { setMessage(error.message) } }
  const postChangeCall = async (id) => { const number = changeNumber.trim(); if (!number) { setMessage('Enter the change number before posting a change call'); return } await updateEngineer(id, { availability: 'Change Call', changeNumber: number }) }
  const withdrawBreak = async (id) => { try { await request(`/api/breaks/${id}/withdraw`, { method: 'POST' }); await loadState(); setMessage('Break request withdrawn') } catch (error) { setMessage(error.message) } }
  const breakPanelContent = <><div className="panel-heading"><div><p className="overline">Coverage control</p><h2>Break management</h2></div><Coffee size={20} className="panel-icon" /></div><p className="helper">Request a break, withdraw it while pending, or mark yourself Back after returning.</p>{isEngineerView && <button className="request-button" onClick={requestBreak}><Coffee size={16} /> Request my break</button>}<div className="break-group"><h3>Pending acknowledgement <b>{pendingBreaks.length}</b></h3>{pendingBreaks.length === 0 && <p className="empty">No pending requests.</p>}{pendingBreaks.map((item) => <div className="break-item" key={item.id}><div><strong>{item.name}</strong><small>Requested {formatIst(item.requestedAt)}</small></div>{isEngineerView && item.engineerId === currentEngineerId ? <button className="withdraw-button" onClick={() => withdrawBreak(item.id)}>Withdraw</button> : isEngineerView && <button onClick={() => acknowledge(item.id)}>Acknowledge</button>}</div>)}</div><div className="break-group"><h3>Active breaks <b>{activeBreaks.length}</b></h3>{activeBreaks.length === 0 && <p className="empty">No active breaks.</p>}{activeBreaks.map((item) => <div className="break-item active" key={item.id}><div><strong>{item.name}</strong><small>Requested {formatIst(item.requestedAt)} · acknowledged {formatIst(item.startedAt || item.acknowledgedAt)} by {item.acknowledgedBy || 'another engineer'}</small></div><div className="break-actions">{isEngineerView && item.engineerId === currentEngineerId && <button onClick={() => returnFromBreak(item.id)}>Back</button>}</div></div>)}</div><div className="break-group"><h3>Break history <b>{breakHistory.length}</b></h3>{breakHistory.length === 0 && <p className="empty">No completed or withdrawn breaks yet.</p>}{breakHistory.map((item) => <div className="break-item" key={item.id}><div><strong>{item.name} {item.status === 'Withdrawn' ? 'withdrew request' : 'returned'}</strong><small>{item.status === 'Withdrawn' ? `Withdrawn ${formatIst(item.withdrawnAt)}` : `Requested ${formatIst(item.requestedAt)} · acknowledged by ${item.acknowledgedBy || 'unavailable'} · returned ${item.completedAt ? formatIst(item.completedAt) : 'time unavailable'}`}</small></div><span className="history-status">{item.status}</span></div>)}</div></>

  if (!state) return <div className="loading"><div><strong>{message || 'Loading ShiftAlign...'}</strong><button className="sync-button retry-button" onClick={loadState}>Retry connection</button><small>Start the API with <code>npm run server</code>, then retry.</small></div></div>
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Activity size={19} /></span><strong>ShiftAlign</strong></div>
        <nav><a href="#dashboard" className={`nav-item ${activeSection === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveSection('dashboard')}><LayoutDashboard size={17} /> Dashboard</a><a href="#daily-ta" className={`nav-item ${activeSection === 'daily-ta' ? 'active' : ''}`} onClick={() => setActiveSection('daily-ta')}><CalendarDays size={17} /> Daily TA</a><a href="#break-management" className={`nav-item ${activeSection === 'break-management' ? 'active' : ''}`} onClick={() => setActiveSection('break-management')}><Coffee size={17} /> Break Management</a><a href="#team-availability" className={`nav-item ${activeSection === 'team-availability' ? 'active' : ''}`} onClick={() => setActiveSection('team-availability')}><Users size={17} /> Team availability</a></nav>
        <div className="sidebar-note"><strong>Today's focus</strong><span>Keep coverage balanced before approving breaks.</span></div>
      </aside>
      <main className="main-content" id="dashboard">
        <header className="topbar"><div><p className="overline">Operations / Today</p><h1>Engineer availability</h1></div><div className="top-actions"><div className="ist-clock" aria-label={`Current India Standard Time: ${istTime}`}><span>IST</span><div><strong>{istTime}</strong><small>{istDate} · India Standard Time</small></div></div><select value={role} onChange={(event) => setRole(event.target.value)}><option value="management">T1 - View</option>{demoEngineer && <option value="engineer-demo-1">{demoEngineer.name} demo view</option>}{secondDemoEngineer && <option value="engineer-demo-2">{secondDemoEngineer.name} demo view</option>}</select><button className="sync-button" onClick={syncTeams} disabled={busy}><RefreshCw size={16} /> {busy ? 'Syncing...' : 'Sync Teams'}</button><div className="profile"><span>{role === 'management' ? 'T1' : currentEngineerName.slice(0, 2).toUpperCase()}</span><div><strong>{role === 'management' ? 'T1 - View' : currentEngineerName}</strong><small>{role === 'management' ? 'TA owner' : 'Engineer demo'}</small></div></div></div></header>
        {message && <div className="toast"><Check size={15} /> {message}</div>}
        <section className="outcome-banner"><div className="outcome-icon"><Activity size={21} /></div><div><p className="overline">Operational control center</p><h2>Protect SLA coverage before work is missed</h2><p>One view connects engineer availability, daily task allocation, Teams presence, and controlled breaks so management can rebalance work before an SLA is at risk.</p></div><div className="outcome-proof"><strong>{atRiskTasks.length === 0 ? 'All tasks covered' : `${atRiskTasks.length} task${atRiskTasks.length > 1 ? 's' : ''} at risk`}</strong><span>based on current availability</span></div></section>
        <section className="metrics"><div className="metric-card"><span>Available now</span><strong>{availableCount}<small> / {state.engineers.length}</small></strong><em>Coverage ready</em></div><div className="metric-card"><span>Breaks pending</span><strong>{pendingBreaks.length}</strong><em>Need acknowledgement</em></div></section>
        <div className={`content-grid ${activeSection === 'break-management' ? 'break-management-view' : ''}`}>
          {activeSection !== 'break-management' && <section className="panel availability-panel" id="daily-ta">
            <div className="panel-heading">
              <div><p className="overline">Live roster</p><h2>Daily availability &amp; TA</h2></div>
              <div className="taskset-actions"><span className={dailyPublished ? 'published-pill' : 'draft-pill'}>{dailyPublished ? 'Published' : 'Draft'}</span>{role === 'management' && <><input ref={fileInput} className="file-input" type="file" accept=".xlsx,.xls,.csv" onChange={handleSheetUpload} /><button className="upload-button" onClick={() => fileInput.current?.click()}><FileSpreadsheet size={14} /> Upload TA sheet</button><button className="publish-button" onClick={publishDailyTaskset}>Publish taskset</button></>}</div>
            </div>
            <p className="helper">{role === 'management' ? 'Upload the daily TA Excel sheet to populate the T1–T5 blocks, review the engineer names, then publish it.' : dailyPublished ? 'This is the taskset published by management for today.' : 'Management has not published today’s taskset yet.'}</p>
            {sheetPreview && role === 'management' && <div className="sheet-preview"><div><strong>{sheetPreview.fileName}</strong><span>{sheetPreview.assignedCount} assignments imported · {sheetPreview.newEngineers.length} engineers captured</span></div><button onClick={() => setSheetPreview(null)}>Dismiss</button></div>}
            <div className="status-legend">{availabilityOptions.slice(0, 4).map((status) => <span key={status}><i style={{ background: availabilityColor[status] }} />{status}</span>)}</div>
            <div className="taskset-table-wrap"><table className="taskset-table"><thead><tr><th>Task ID &amp; Description</th><th>Shift-1</th><th>Shift-2</th></tr></thead><tbody>{state.tasks.map((task) => <tr key={task.id}><td><strong>{task.id}</strong><span>{task.name}</span></td><td>{engineersForShift(task.id, 'Shift-1').map((engineer) => <span className="task-engineer" key={engineer.id}><i style={{ background: availabilityColor[engineer.availability] }} /><span>{engineer.name}<em className="task-status">{engineer.availability}</em></span>{engineer.changeNumber && <small className="change-number">({engineer.changeNumber})</small>}</span>)}</td><td>{engineersForShift(task.id, 'Shift-2').map((engineer) => <span className="task-engineer" key={engineer.id}><i style={{ background: availabilityColor[engineer.availability] }} /><span>{engineer.name}<em className="task-status">{engineer.availability}</em></span>{engineer.changeNumber && <small className="change-number">({engineer.changeNumber})</small>}</span>)}</td></tr>)}</tbody></table></div>
            <div className="availability-list" id="team-availability"><div className="availability-list-heading"><span>Live availability</span><small>{isEngineerView ? 'Demo view: enter a change number before posting a change.' : 'Manual updates remain separate from the published TA sheet.'}</small></div>{state.engineers.filter((engineer) => !isEngineerView || engineer.id === currentEngineerId).map((engineer) => <div className="availability-row" key={engineer.id}><strong>{engineer.name}</strong><span className="teams-status"><i style={{ background: statusColor[engineer.teams] ?? '#c0c7d4' }} />{engineer.teams || 'Not synced'}<em className="availability-label" style={{ color: availabilityColor[engineer.availability] }}>{engineer.availability}</em></span><select value={engineer.availability} disabled={isEngineerView && engineer.id !== currentEngineerId} onChange={(event) => updateEngineer(engineer.id, { availability: event.target.value })}>{availabilityOptions.map((option) => <option key={option}>{option}</option>)}</select>{isEngineerView && engineer.id === currentEngineerId && <div className="engineer-status-actions"><input className="change-number-input" value={changeNumber} onChange={(event) => setChangeNumber(event.target.value)} placeholder="Change number" aria-label="Change number" /><button className="change-button" disabled={engineer.availability === 'Change Call'} onClick={() => postChangeCall(engineer.id)}>On a change</button><button className="back-status-button" disabled={engineer.availability === 'Available'} onClick={() => { setChangeNumber(''); updateEngineer(engineer.id, { availability: 'Available', changeNumber: null }) }}>I'm back</button></div>}</div>)}</div>
            <div className="coverage-strip"><div><strong>Coverage watch</strong><span>Task groups with no available engineer are highlighted before assignment decisions are finalized.</span></div><div className={atRiskTasks.length ? 'watch-risk' : 'watch-good'}>{atRiskTasks.length ? `${atRiskTasks.length} at risk` : 'Healthy coverage'}</div></div>
          </section>}
          {activeSection === 'break-management' && <section className="panel break-panel break-management-page">{breakPanelContent}</section>}
        </div>
      </main>
    </div>
  )
}
