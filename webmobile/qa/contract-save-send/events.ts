export const events: string[] = []
export function record(message: string) { events.push(message); window.dispatchEvent(new Event('qa-operation')) }
export const params = new URLSearchParams(location.search)
