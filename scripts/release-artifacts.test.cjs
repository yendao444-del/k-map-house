const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const AdmZip = require('adm-zip')
const script = path.join(__dirname, 'create-update-artifacts.cjs')
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex')

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dby-release-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'out/renderer/assets'), { recursive: true })
  fs.mkdirSync(path.join(root, 'updates/state'), { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.2' }))
  fs.writeFileSync(path.join(root, 'out/renderer/assets/unchanged.js'), 'unchanged')
  fs.writeFileSync(path.join(root, 'out/renderer/assets/changed.js'), 'new content')
  const previous = { version: '1.0.1', files: {
    'out/renderer/assets/unchanged.js': hash('unchanged'),
    'out/renderer/assets/changed.js': hash('old content'),
    'out/renderer/assets/deleted.js': hash('deleted')
  } }
  fs.writeFileSync(path.join(root, 'updates/state/manifest.json'), JSON.stringify(previous))
  return { root, previous }
}

test('combined release preserves quick delta, deletions and complete standard contents', (t) => {
  const { root } = fixture(t)
  const result = spawnSync(process.execPath, [script, 'both'], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const zip = (mode) => new AdmZip(path.join(root, `updates/1.0.2/DBYHOME-1.0.2-${mode}.zip`))
  const quick = zip('quick')
  const manifest = JSON.parse(quick.readAsText('resources/app/.update-manifest.json'))
  assert.equal(manifest.fromVersion, '1.0.1')
  assert.deepEqual(manifest.deletedFiles, ['out/renderer/assets/deleted.js'])
  assert.equal(quick.getEntry('resources/app/out/renderer/assets/unchanged.js'), null)
  assert.equal(quick.readAsText('resources/app/out/renderer/assets/changed.js'), 'new content')
  const standard = zip('standard')
  for (const file of ['package.json', 'out/renderer/assets/unchanged.js', 'out/renderer/assets/changed.js']) {
    assert.deepEqual(standard.readFile(`resources/app/${file}`), fs.readFileSync(path.join(root, file)))
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'updates/state/manifest.json'))).version, '1.0.2')
})

test('failure creating standard must not advance the shared quick baseline', (t) => {
  const { root, previous } = fixture(t)
  fs.mkdirSync(path.join(root, 'updates/1.0.2/DBYHOME-1.0.2-standard.zip'), { recursive: true })
  const result = spawnSync(process.execPath, [script, 'both'], { cwd: root, encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'updates/state/manifest.json'))), previous)
})

test('legacy patch keeps layout and leaves quick baseline unchanged', (t) => {
  const { root, previous } = fixture(t)
  const result = spawnSync(process.execPath, [script, 'patch'], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const zip = new AdmZip(path.join(root, 'dist/DBYHOME-PATCH-v1.0.2.zip'))
  assert.equal(zip.readAsText('resources/app/out/renderer/assets/changed.js'), 'new content')
  assert.equal(JSON.parse(zip.readAsText('resources/app/package.json')).version, '1.0.2')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'updates/state/manifest.json'))), previous)
})
