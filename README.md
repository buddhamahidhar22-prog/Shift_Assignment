# ShiftAlign

ShiftAlign is a React/Vite operational dashboard for managing daily TA task allocation, engineer availability, simulated Teams presence, change calls, and peer-approved breaks.

The application is designed around the daily Excel taskset. Engineer names and assignments come from the uploaded workbook; they are not seeded in the application source. The default T1-T5 task catalog remains available so the workbook can be mapped consistently.

## Run locally

Use two terminals from the project directory:

```powershell
npm run server
```

```powershell
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/).

Other useful commands:

```powershell
npm run build
npm run preview
npm run lint
```

The Vite development server proxies `/api` requests to the Node API on port `3001`.

### Vercel deployment

Vercel builds the Vite frontend and deploys the catch-all API function in
`api/[...path].js`. The local `server.js` is still used for local development.
The Vercel function keeps state in memory, so its prototype data can reset when
the serverless function is restarted. Use a hosted database or KV store before
using this application for shared production operations.

## Application views

### T1 - View

The T1 view is the management/TA-owner view. It provides:

- Full-width daily taskset table.
- Excel upload, draft review, and publish controls.
- Shift-1 and Shift-2 assignment display.
- Engineer availability and Teams presence visibility.
- Coverage indicators for task groups.
- Read-only break status and history.

Management does not acknowledge, withdraw, or end engineer breaks.

### Engineer demo view

The application exposes one engineer demo view rather than a selector for every engineer. This keeps demonstrations focused while still showing the peer workflow:

- View the selected engineer's availability.
- Request a break.
- Withdraw that engineer's own pending break.
- Acknowledge another engineer's pending break.
- Mark the selected engineer Back after an active break.
- Post a Change Call with a required change number.
- Mark the engineer Available when the change is complete.

### Daily TA

The Daily TA section displays the published workbook assignments in the same structure as the source sheet:

| Task ID & Description | Shift-1 | Shift-2 |
|---|---|---|
| T1 and description | Assigned engineers | Assigned engineers |
| T2 and description | Assigned engineers | Assigned engineers |
| T3 and description | Assigned engineers | Assigned engineers |
| T4 and description | Assigned engineers | Assigned engineers |
| T5 and description | Assigned engineers | Assigned engineers |

### Team availability

Availability is separate from Teams presence:

| Availability | Meaning |
|---|---|
| Available | Engineer is ready for operational work |
| On Break | Break has been acknowledged and is active |
| Change Call | Engineer is working on a change |
| Out of BAU | Engineer is temporarily outside normal BAU work |
| Unavailable | Engineer is not available |

When an engineer posts a Change Call, the change number is shown beside their name in the taskset. Clicking I'm back changes availability to Available and clears the change number.

### Break Management

Break Management is a separate full-width view so it does not clutter the taskset. It contains:

- **Pending acknowledgement**: requests waiting for another engineer.
- **Active breaks**: requests acknowledged by a peer and currently in progress.
- **Break history**: completed and withdrawn requests.

The break lifecycle is:

1. Engineer submits a break request.
2. The request remains Pending.
3. A different engineer acknowledges it.
4. The requested engineer becomes On Break.
5. The requested engineer clicks Back when returning.
6. The request is recorded as Completed.

An engineer can withdraw their own request while it is still Pending. An engineer cannot acknowledge their own break. Each acknowledged request records the acknowledging engineer and timestamp.

## Excel taskset import

The parser is isolated in [src/services/taSheetParser.js](<src/services/taSheetParser.js>) so it can later be replaced with stricter validation or a backend import service.

### Supported workbook shape

The first worksheet should follow the current operations sheet format:

| Task ID | Shift-1 | Shift-2 |
|---|---|---|
| `T1 - Dashboard Monitoring` | `Engineer 1, Engineer 2` | `Engineer 3` |
| `T2 - Incident management` | multiple names or line breaks | multiple names or line breaks |
| `T3 - HO, DD monitoring` | engineer names | engineer names |

Supported name columns:

- `Shift-1` and `Shift-2`
- `Engineer`
- `Name`

Supported separators:

- Commas
- Semicolons
- Pipes
- Line breaks

The parser:

- Extracts T1-T5 from values such as `T1 - Dashboard Monitoring`.
- Preserves Shift-1 and Shift-2 assignments separately.
- Matches existing names case-insensitively.
- Deduplicates repeated names within a task and shift.
- Creates engineer records for names found in the workbook.
- Replaces the active daily roster and taskset on every upload.
- Clears obsolete break records when the roster is replaced.
- Saves the upload as a draft.
- Requires a separate management publish action.

## Status and Teams presence

The colored taskset dot represents the engineer's operational availability. The Teams status appears separately in the live availability list.

Teams statuses currently supported are:

- Online
- Busy
- Away
- Offline
- Not synced

The **Sync Teams** button currently simulates a Teams synchronization by assigning a presence value. Microsoft Graph integration is not implemented yet.

## Data model

### Engineer

```js
{
  id: Number,
  name: String,
  shift: "Shift-1" | "Shift-2",
  task: String,
  availability: "Available" | "On Break" | "Change Call" | "Out of BAU" | "Unavailable",
  teams: "Online" | "Busy" | "Away" | "Offline" | null,
  changeNumber: String | null
}
```

### Break request

```js
{
  id: Number,
  engineerId: Number,
  name: String,
  status: "Pending" | "Active" | "Completed" | "Withdrawn",
  requestedAt: String,
  acknowledgedById: Number,
  acknowledgedBy: String,
  acknowledgedAt: String,
  completedAt: String,
  withdrawnAt: String
}
```

### Daily taskset

```js
{
  date: String,
  published: Boolean,
  publishedAt: String | null,
  assignments: {
    T1: {
      "Shift-1": [engineerId],
      "Shift-2": [engineerId]
    }
  }
}
```

## API routes

The local API is implemented in [server.js](<C:/Users/buddh/OneDrive/Desktop/Road to wells fargo/server.js>).

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/state` | Load current roster, tasks, breaks, and taskset |
| PATCH | `/api/engineers/:id` | Update availability, task, or change number |
| POST | `/api/teams/sync` | Simulate Teams presence synchronization |
| PUT | `/api/daily-taskset` | Save or publish a taskset and replace a roster |
| POST | `/api/breaks` | Submit a break request |
| POST | `/api/breaks/:id/ack` | Peer-acknowledge a pending break |
| POST | `/api/breaks/:id/withdraw` | Withdraw a pending break |
| POST | `/api/breaks/:id/back` | Complete an active break |

## Project structure

```text
src/
  App.jsx                         Main dashboard and workflows
  App.css                         Dark operational-console styling
  services/
    taSheetParser.js              Excel parsing boundary
server.js                         Local Node API and JSON persistence
data/store.json                   Local prototype data store
vite.config.js                    Vite configuration and API proxy
```

## Persistence and production notes

The prototype persists data in [data/store.json](<C:/Users/buddh/OneDrive/Desktop/Road to wells fargo/data/store.json>). It is intentionally simple for local development.

Images:

<img width="1917" height="865" alt="Screenshot 2026-11-14 224530" src="https://github.com/user-attachments/assets/130837ce-394b-4fdb-8dff-e145e44ba9f3" />
<img width="1917" height="871" alt="Screenshot 2026-11-14 224515" src="https://github.com/user-attachments/assets/6d6845e6-af72-4122-b513-5192d34034b8" />
<img width="1917" height="867" alt="Screenshot 2026-11-14 224501" src="https://github.com/user-attachments/assets/a65156f7-c52e-4bde-917c-c57e79a2175f" />
<img width="1916" height="867" alt="Screenshot 2026-11-14 224411" src="https://github.com/user-attachments/assets/b375b144-ec0b-4dfc-98b2-58456171a904" />

Before production use, the development team should add:

Add authentication and enforce permissions in the API, not only the UI.
Replace data/store.json with a database.
Replace simulated Teams sync with Microsoft Graph.
Add server-side Excel validation and upload limits.
Add automated tests for parser, task replacement, breaks, and change calls.
Add audit logging and taskset version history.
Reset local runtime data before sharing the repository if the imported engineer names should not be included.
The main development starting points are:

App.jsx — UI and workflows
server.js — API and persistence
taSheetParser.js — Excel boundary
App.css — styling
README.md — handoff documentation
