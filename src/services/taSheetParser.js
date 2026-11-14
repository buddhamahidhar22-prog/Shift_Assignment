function parseNames(value) {
  return String(value || '')
    .split(/[,;\n|]/)
    .map((name) => name.trim())
    .filter(Boolean)
}

/**
 * Parses the first worksheet in a TA workbook.
 *
 * Supported row formats:
 * - Task ID + Shift-1/Shift-2 columns containing comma-separated names.
 * - Task ID + Engineer/Name column containing comma-separated names.
 *
 * @returns {Promise<{assignments: Record<string, object>, newEngineers: object[], roster: object[], fileName: string, assignedCount: number}>}
 */
export async function parseTaWorkbook(file, tasks, engineers) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })
  const assignments = Object.fromEntries(tasks.map((task) => [task.id, { 'Shift-1': [], 'Shift-2': [] }]))
  const knownNames = new Map(engineers.map((engineer) => [engineer.name.toLowerCase(), engineer.id]))
  const engineerRecords = new Map(engineers.map((engineer) => [engineer.id, engineer]))
  const assignedIds = new Set()
  const newEngineers = []
  let nextEngineerId = Math.max(0, ...engineers.map((engineer) => engineer.id)) + 1

  rows.forEach((row) => {
    const entries = Object.entries(row)
    const taskValue = entries.find(([key, value]) => /task/i.test(key) && /T[1-5]/i.test(String(value)))?.[1] || ''
    const taskId = String(taskValue).match(/T[1-5]/i)?.[0].toUpperCase() || ''
    if (!assignments[taskId]) return

    entries
      .filter(([key]) => /engineer|name|shift-?1|shift ?1|shift-?2|shift ?2/i.test(key))
      .forEach(([key, value]) => {
        const shift = /shift-?2|shift ?2/i.test(key) ? 'Shift-2' : 'Shift-1'
        parseNames(value).forEach((name) => {
          let engineerId = knownNames.get(name.toLowerCase())
          if (!engineerId) {
            engineerId = nextEngineerId++
            knownNames.set(name.toLowerCase(), engineerId)
            const newEngineer = { id: engineerId, name, shift, task: taskId, availability: 'Available' }
            engineerRecords.set(engineerId, newEngineer)
            newEngineers.push(newEngineer)
          }
          assignedIds.add(engineerId)
          if (!assignments[taskId][shift].includes(engineerId)) assignments[taskId][shift].push(engineerId)
        })
      })
  })

  const assignedCount = Object.values(assignments).reduce((total, shifts) => total + shifts['Shift-1'].length + shifts['Shift-2'].length, 0)
  if (!assignedCount) {
    throw new Error('No T1–T5 task assignments were found. Use columns such as Task ID and Engineer Names.')
  }

  const roster = [...assignedIds].map((id) => engineerRecords.get(id)).filter(Boolean)

  return {
    assignments,
    fileName: file.name,
    assignedCount,
    newEngineers,
    roster,
  }
}
