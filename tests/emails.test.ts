import { describe, expect, it } from 'vitest'
import { deriveNameFromEmail, parsePastedEmails } from '../shared/pure/emails.js'

describe('deriveNameFromEmail', () => {
  it('applies the PROPER formula: digits stripped, separators to spaces, first token, title case', () => {
    expect(deriveNameFromEmail('john.doe123@gmail.com')).toBe('John')
    expect(deriveNameFromEmail('jane_doe@x.com')).toBe('Jane')
    expect(deriveNameFromEmail('mike-smith@x.com')).toBe('Mike')
    expect(deriveNameFromEmail('JOHN.DOE@X.COM')).toBe('John')
    expect(deriveNameFromEmail('jo3hn.2doe@x.com')).toBe('Jo')
    expect(deriveNameFromEmail('alex.brown@x.com')).toBe('Alex')
    expect(deriveNameFromEmail('sara123@x.com')).toBe('Sara')
  })

  it('returns empty for names that are only digits or missing local parts', () => {
    expect(deriveNameFromEmail('12345@x.com')).toBe('')
    expect(deriveNameFromEmail('not-an-email')).toBe('')
    expect(deriveNameFromEmail('@x.com')).toBe('')
  })
})

describe('parsePastedEmails', () => {
  it('parses one email per line and lowercases', () => {
    const result = parsePastedEmails('John.Doe@Example.com\njane@x.com\n')
    expect(result.emails).toEqual(['john.doe@example.com', 'jane@x.com'])
    expect(result.invalid).toEqual([])
    expect(result.duplicates).toBe(0)
  })

  it('supports comma and semicolon separators', () => {
    const result = parsePastedEmails('a@x.com,b@x.com; c@x.com')
    expect(result.emails).toEqual(['a@x.com', 'b@x.com', 'c@x.com'])
  })

  it('collects invalid rows and deduplicates', () => {
    const result = parsePastedEmails('a@x.com\nnot-an-email\nb@x.com\na@x.com\n@missing.com')
    expect(result.emails).toEqual(['a@x.com', 'b@x.com'])
    expect(result.invalid).toEqual(['not-an-email', '@missing.com'])
    expect(result.duplicates).toBe(1)
  })

  it('returns empty for blank input', () => {
    const result = parsePastedEmails('   \n\n  ')
    expect(result.emails).toEqual([])
    expect(result.invalid).toEqual([])
  })
})
