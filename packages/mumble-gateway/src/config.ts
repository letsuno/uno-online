import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ServersFile, ServerConfig } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function loadServersConfig(): ServerConfig[] {
  const configPath = process.env.SERVERS_CONFIG_PATH
    ? path.resolve(process.env.SERVERS_CONFIG_PATH)
    : path.resolve(__dirname, '..', 'config', 'servers.json')

  const raw = fs.readFileSync(configPath, 'utf8')
  const parsed = JSON.parse(raw) as ServersFile
  if (!parsed.servers || !Array.isArray(parsed.servers)) {
    throw new Error('Invalid servers config: missing "servers" array')
  }
  return parsed.servers
}
