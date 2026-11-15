const seed = {
  engineers: [],
  tasks: [
    { id: 'T1', name: 'Incident dashboard Monitoring, Critical INCs, MIM Dashboard (Backup - T2)' },
    { id: 'T2', name: 'Non Autosys/ AUTOSYS/Automation Folder' },
    { id: 'T3', name: 'HO, DD, Prod Line, All - Mailboxes, CT-Mission Control Dashboard, CTASK Assignments, DODCT(Backup - T4)' },
    { id: 'T4', name: "CTASK & INC's" },
    { id: 'T5', name: 'Shift Monitoring, Initiatives, Change Approvals, CTasks, Peer Reviews, Noise Reduction' },
  ],
  breaks: [],
  dailyTaskset: {
    date: '2026-11-14',
    published: false,
    publishedAt: null,
    assignments: {},
  },
  lastTeamsSync: null,
}

export function createSeed() {
  return JSON.parse(JSON.stringify(seed))
}

function send(response, status, body) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

async function body(request) {
  let value = ''
  for await (const chunk of request) value += chunk
  return value ? JSON.parse(value) : {}
}

export function createApiHandler({ readStore, saveStore }) {
  return async function apiHandler(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    if (!url.pathname.startsWith('/api/')) {
      send(response, 404, { error: 'API route not found' })
      return
    }

    try {
      const store = readStore()
      if (request.method === 'GET' && url.pathname === '/api/state') {
        send(response, 200, store)
        return
      }

      if (request.method === 'PATCH' && url.pathname.startsWith('/api/engineers/')) {
        const id = Number(url.pathname.split('/').pop())
        const update = await body(request)
        const engineer = store.engineers.find((item) => item.id === id)
        if (!engineer) return send(response, 404, { error: 'Engineer not found' })
        if (update.availability) engineer.availability = update.availability
        if (update.task) engineer.task = update.task
        if (Object.prototype.hasOwnProperty.call(update, 'changeNumber')) engineer.changeNumber = update.changeNumber || null
        saveStore(store)
        send(response, 200, engineer)
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/teams/sync') {
        const statuses = ['Online', 'Busy', 'Away', 'Offline']
        store.engineers = store.engineers.map((engineer) => ({
          ...engineer,
          teams: statuses[Math.floor(Math.random() * statuses.length)],
        }))
        store.lastTeamsSync = new Date().toISOString()
        saveStore(store)
        send(response, 200, store)
        return
      }

      if (request.method === 'PUT' && url.pathname === '/api/daily-taskset') {
        const update = await body(request)
        if (!update.assignments || typeof update.assignments !== 'object') {
          return send(response, 400, { error: 'Daily taskset assignments are required' })
        }
        if (update.replaceRoster && Array.isArray(update.roster)) {
          store.engineers = update.roster
          store.breaks = []
        } else if (Array.isArray(update.newEngineers)) {
          update.newEngineers.forEach((incoming) => {
            if (!store.engineers.some((engineer) => engineer.id === incoming.id)) store.engineers.push(incoming)
          })
        }
        store.dailyTaskset = {
          ...store.dailyTaskset,
          date: update.date || store.dailyTaskset.date,
          assignments: update.assignments,
          published: Boolean(update.published),
          publishedAt: update.published ? new Date().toISOString() : store.dailyTaskset.publishedAt,
        }
        saveStore(store)
        send(response, 200, store)
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/breaks') {
        const requestData = await body(request)
        const engineer = store.engineers.find((item) => item.id === Number(requestData.engineerId))
        if (!engineer) return send(response, 400, { error: 'Engineer not found' })
        const breakRequest = {
          id: Date.now(),
          engineerId: engineer.id,
          name: engineer.name,
          status: 'Pending',
          requestedAt: 'Just now',
        }
        store.breaks.push(breakRequest)
        saveStore(store)
        send(response, 201, breakRequest)
        return
      }

      if (request.method === 'POST' && url.pathname.match(/^\/api\/breaks\/\d+\/ack$/)) {
        const id = Number(url.pathname.split('/')[3])
        const requestData = await body(request)
        const breakRequest = store.breaks.find((item) => item.id === id)
        if (!breakRequest || breakRequest.status !== 'Pending') return send(response, 409, { error: 'Break is no longer pending' })
        const acknowledgingEngineer = store.engineers.find((item) => item.id === Number(requestData.acknowledgedById))
        if (!acknowledgingEngineer) return send(response, 400, { error: 'An acknowledging engineer is required' })
        if (acknowledgingEngineer.id === breakRequest.engineerId) return send(response, 400, { error: 'An engineer cannot acknowledge their own break' })
        breakRequest.status = 'Active'
        breakRequest.duration = '00:01'
        breakRequest.acknowledgedById = acknowledgingEngineer.id
        breakRequest.acknowledgedBy = acknowledgingEngineer.name
        breakRequest.acknowledgedAt = new Date().toISOString()
        const engineer = store.engineers.find((item) => item.id === breakRequest.engineerId)
        if (engineer) {
          engineer.availability = 'On Break'
          engineer.teams = 'Away'
        }
        saveStore(store)
        send(response, 200, breakRequest)
        return
      }

      if (request.method === 'POST' && url.pathname.match(/^\/api\/breaks\/\d+\/back$/)) {
        const id = Number(url.pathname.split('/')[3])
        const breakRequest = store.breaks.find((item) => item.id === id)
        if (!breakRequest || breakRequest.status !== 'Active') return send(response, 409, { error: 'Break is no longer active' })
        breakRequest.status = 'Completed'
        breakRequest.completedAt = new Date().toISOString()
        const engineer = store.engineers.find((item) => item.id === breakRequest.engineerId)
        if (engineer) engineer.availability = 'Available'
        saveStore(store)
        send(response, 200, breakRequest)
        return
      }

      if (request.method === 'POST' && url.pathname.match(/^\/api\/breaks\/\d+\/withdraw$/)) {
        const id = Number(url.pathname.split('/')[3])
        const breakRequest = store.breaks.find((item) => item.id === id)
        if (!breakRequest || breakRequest.status !== 'Pending') return send(response, 409, { error: 'Only pending breaks can be withdrawn' })
        breakRequest.status = 'Withdrawn'
        breakRequest.withdrawnAt = new Date().toISOString()
        saveStore(store)
        send(response, 200, breakRequest)
        return
      }

      send(response, 404, { error: 'API route not found' })
    } catch (error) {
      send(response, 500, { error: error.message })
    }
  }
}

export function createMemoryStore(initialStore = createSeed()) {
  let store = initialStore
  return {
    readStore: () => store,
    saveStore: (nextStore) => { store = nextStore },
  }
}
