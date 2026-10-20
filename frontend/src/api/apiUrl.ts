/** Resolve all API endpoints against the deployment's public server address. */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
  if (base) {
    const relative = base.startsWith('/') && !base.startsWith('//')
    const url = new URL(base, 'https://frontend.invalid')
    if ((!relative && !/^https?:\/\//.test(base)) || url.search || url.hash || url.username || url.password) {
      throw new Error('כתובת שרת ה־API אינה תקינה.')
    }
  }
  return `${base}${path}`
}
