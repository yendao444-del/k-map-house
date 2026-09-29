const path = require('node:path')
const { spawn } = require('node:child_process')

const root = path.resolve(__dirname, '..')
function run(label, executable, args) {
  const started = performance.now()
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, executable), ...args], {
      cwd: root, stdio: 'inherit', windowsHide: true
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      console.log(`[release] ${label}: ${((performance.now() - started) / 1000).toFixed(1)}s`)
      if (code === 0) resolve()
      else reject(new Error(`${label} failed (${signal || code})`))
    })
  })
}

async function main() {
  // Both checks are read-only; wait for both before starting the build.
  const checks = await Promise.allSettled(['node', 'web'].map((target) =>
    run(`typecheck:${target}`, 'node_modules/typescript/bin/tsc',
      ['--noEmit', '-p', `tsconfig.${target}.json`, '--composite', 'false'])
  ))
  for (const result of checks) if (result.status === 'rejected') throw result.reason
  await run('vite build', 'node_modules/electron-vite/bin/electron-vite.js', ['build'])
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
