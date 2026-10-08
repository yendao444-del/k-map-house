import { contractConfirmationHandler } from './contract-confirmation.mjs'
import { renderContractDocument } from './contract-document.tsx'
Deno.serve(contractConfirmationHandler(Deno.env.toObject(), renderContractDocument))
