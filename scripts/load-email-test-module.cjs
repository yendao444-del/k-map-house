const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const cache = new Map()
function loadTs(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file)
  const exports = {}
  cache.set(file, exports)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', code)(name => name.startsWith('.') ? loadTs(path.resolve(path.dirname(file), name.replace(/\.ts$/, '') + '.ts')) : require(name), exports)
  return exports
}
module.exports = { loadTs }
