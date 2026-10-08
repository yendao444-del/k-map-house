// Load only Electron's pure transfer-code helpers. Its db import is type-only.
// No Electron IPC, Supabase connection or bank credentials are loaded.
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../../src/renderer/src/lib/invoiceTransfer.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
if (/\b(?:import|require)\s*(?:\(|['"{*])/.test(outputText)) throw new Error('Transfer helpers must remain pure for the demo adapter.')
const helpers = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
export const { buildInvoiceTransferDescription, normalizeTransferText, createInvoiceTransferIndex, findInvoiceTransferMatches } = helpers

// Extract just the existing pure amount-to-words function, not the React modal.
const invoiceSource = await readFile(new URL('../../src/renderer/src/components/InvoiceDetailModal.tsx', import.meta.url), 'utf8')
const invoiceAst = ts.createSourceFile('InvoiceDetailModal.tsx', invoiceSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX)
const wordsNode = invoiceAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'numberToWords')
if (!wordsNode) throw new Error('Electron invoice amount-to-words helper is unavailable.')
const wordsCode = ts.transpileModule(`export ${wordsNode.getText(invoiceAst)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
export const { numberToWords } = await import(`data:text/javascript;base64,${Buffer.from(wordsCode).toString('base64')}`)
