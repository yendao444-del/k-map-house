import { useEffect, useState } from 'react'

export type Workspace = 'home' | 'dby'

const WORKSPACE_STORAGE_KEY = 'akh-active-workspace'

const readStoredWorkspace = (): Workspace => {
  try {
    return window.localStorage.getItem(WORKSPACE_STORAGE_KEY) === 'dby' ? 'dby' : 'home'
  } catch {
    return 'home'
  }
}

// Workspaces share one login. Which ones an account may open comes from its
// app access (admins: both). With only DBY Finance the app stays there; with
// only AN KHANG HOME it never leaves home. The last choice is remembered.
export function useWorkspace(canUseDbyFinance: boolean, canUseHome = true): {
  workspace: Workspace
  isDbyWorkspace: boolean
  setWorkspace: (next: Workspace) => void
} {
  const [workspace, setWorkspace] = useState<Workspace>(readStoredWorkspace)
  useEffect(() => {
    try {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace)
    } catch {
      /* storage unavailable */
    }
  }, [workspace])
  return { workspace, isDbyWorkspace: canUseDbyFinance && (workspace === 'dby' || !canUseHome), setWorkspace }
}
