import type { InvoiceTemplate } from '../../shared/types.js'

const STORAGE_KEY = 'mailflow_templates'

export function seedTemplates(): InvoiceTemplate[] {
  return [
    {
      id: 'default',
      name: 'Default',
      description: 'Invoice {{invoice_number}}',
      lineItemDescription: '',
      accountCode: '4100',
      supportMessage: 'If you have any issues, please contact our customer service team at {{support_number}}',
      paymentTermsDays: 14,
    },
  ]
}

export function listTemplates(): InvoiceTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedTemplates()
    const parsed = JSON.parse(raw) as InvoiceTemplate[]
    return parsed.length > 0 ? parsed : seedTemplates()
  } catch {
    return seedTemplates()
  }
}

export function saveTemplate(template: InvoiceTemplate): InvoiceTemplate[] {
  const all = listTemplates()
  const idx = all.findIndex((t) => t.id === template.id)
  if (idx >= 0) all[idx] = template
  else all.push(template)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  return all
}

export function deleteTemplate(id: string): InvoiceTemplate[] {
  const all = listTemplates().filter((t) => t.id !== id)
  if (all.length === 0) {
    const seeded = seedTemplates()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  return all
}

export function getTemplate(id: string | null | undefined): InvoiceTemplate | undefined {
  return listTemplates().find((t) => t.id === id)
}

export function newTemplateId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}