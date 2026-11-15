import { createServer } from 'node:http'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiHandler, createSeed } from './api/handler.js'

const root = dirname(fileURLToPath(import.meta.url))
const storePath = join(root, 'data', 'store.json')

const readStore = () => {
  if (!existsSync(storePath)) {
    mkdirSync(dirname(storePath), { recursive: true })
    writeFileSync(storePath, JSON.stringify(createSeed(), null, 2))
  }
  return JSON.parse(readFileSync(storePath, 'utf8'))
}

const saveStore = (store) => writeFileSync(storePath, JSON.stringify(store, null, 2))
const api = createServer(createApiHandler({ readStore, saveStore }))
const port = Number(process.env.PORT || 3001)

api.listen(port, () => console.log(`ShiftAlign API running at http://127.0.0.1:${port}`))
