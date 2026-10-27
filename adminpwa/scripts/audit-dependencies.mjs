import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
const npmCli=process.env.npm_execpath || path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const output=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[npmCli,'audit','--omit=dev','--json'],{cwd:new URL('../',import.meta.url),windowsHide:true});let out='';p.stdout.on('data',chunk=>{out+=chunk});p.stderr.on('data',chunk=>{out+=chunk});p.on('error',reject);p.on('close',code=>{try{resolve(JSON.parse(out))}catch{reject(new Error(`npm audit returned invalid JSON (exit ${code})`))}})})
const report={auditedAt:new Date().toISOString(),scope:'production dependencies only (--omit=dev)',...output}
await writeFile(new URL('../qa/npm-audit-production.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
if(report.metadata?.vulnerabilities?.total) throw new Error(`Production dependency vulnerabilities: ${report.metadata.vulnerabilities.total}`)
console.log(JSON.stringify({auditedAt:report.auditedAt,scope:report.scope,vulnerabilities:report.metadata?.vulnerabilities,dependencies:report.metadata?.dependencies},null,2))
