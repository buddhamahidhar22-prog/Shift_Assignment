import { createMemoryStore, createApiHandler } from './handler.js'

const store = createMemoryStore()
const handler = createApiHandler(store)

export default function vercelApi(request, response) {
  return handler(request, response)
}
