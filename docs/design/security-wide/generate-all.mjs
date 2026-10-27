import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
let remaining = 3
let failed = false
for (const direction of ['overview', 'navigation', 'rows']) {
  const script = process.argv.includes('--warning') ? './generate-warning.mjs' : './generate.mjs'
  const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), direction], { stdio: 'inherit', windowsHide: true })
  child.on('error', error => { console.error(direction + ': ' + error.message); failed = true })
  child.on('close', code => { if (code !== 0) failed = true; if (--remaining === 0) process.exit(failed ? 1 : 0) })
}
