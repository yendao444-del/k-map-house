// Only used by this isolated Vite fixture. Never imported by the application build.
export async function updateUser(id: string, updates: object) {
  return { id, ...updates, username: 'profile-demo', role: 'admin', status: 'active', created_at: '2026-10-09' }
}
export async function sendOwnPasswordChangeVerification() {
  // Keep the isolated demo interactive without sending a real account email.
}
export async function changeOwnPassword() {
  // The preview only demonstrates the final visual state; it never changes Auth.
}
