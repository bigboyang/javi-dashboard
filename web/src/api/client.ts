// Shared fetch wrapper for all API clients: throws on non-2xx and parses JSON.
// `init` lets callers issue mutations (POST/PATCH/DELETE) through the same path.
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Call fetch(path) without a second arg when there's no init, matching plain
  // GET callers exactly (and avoiding an undefined RequestInit positional).
  const res = init ? await fetch(path, init) : await fetch(path)
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`)
  }
  return res.json() as Promise<T>
}
