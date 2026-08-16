const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function deriveNameFromEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return ''
  let local = email.slice(0, at)
  local = local.replace(/[0-9]+/g, ' ')
  local = local.replace(/[._-]+/g, ' ')
  local = local.replace(/\s+/g, ' ')
  local = local.trim()
  const firstToken = local.split(' ')[0] ?? ''
  if (!firstToken) return ''
  return firstToken.charAt(0).toUpperCase() + firstToken.slice(1).toLowerCase()
}

export interface EmailsParseResult {
  emails: string[]
  invalid: string[]
  duplicates: number
}

export function parsePastedEmails(text: string): EmailsParseResult {
  const seen = new Set<string>()
  const emails: string[] = []
  const invalid: string[] = []
  let duplicates = 0
  const raw = text
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  for (const candidate of raw) {
    const email = candidate.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      invalid.push(candidate)
      continue
    }
    if (seen.has(email)) {
      duplicates++
      continue
    }
    seen.add(email)
    emails.push(email)
  }
  return { emails, invalid, duplicates }
}
