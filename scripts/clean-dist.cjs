#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const distPath = path.resolve(process.cwd(), 'dist')

try {
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true })
    console.log(`[clean-dist] Removed: ${distPath}`)
  } else {
    console.log(`[clean-dist] Not found: ${distPath}`)
  }
} catch (error) {
  console.error('[clean-dist] Failed:', error instanceof Error ? error.message : error)
  process.exit(1)
}

