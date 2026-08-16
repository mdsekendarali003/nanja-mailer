import type { WizardRecord, ExecuteStatusItem } from './wizard.js'
import type { InvoiceNumbering } from './numbering.js'

export interface WizardSessionData {
  step: number
  source: 'csv' | 'emails' | null
  records: WizardRecord[]
  templateId: string | null
  numbering: InvoiceNumbering
}

export interface ExecuteStatus {
  statuses: ExecuteStatusItem[]
  interrupted: boolean
}

const SESSION_KEY = 'mailflow_wizard_session'
const EXECUTE_KEY = 'mailflow_execute_status'

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function saveWizardSession(data: WizardSessionData): void {
  try {
    storage()?.setItem(SESSION_KEY, JSON.stringify(data))
  } catch {
    // ignore quota/availability errors
  }
}

export function loadWizardSession(): WizardSessionData | null {
  try {
    const raw = storage()?.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WizardSessionData>
    if (typeof parsed.step !== 'number' || !Array.isArray(parsed.records)) return null
    return {
      step: parsed.step,
      source: parsed.source === 'csv' || parsed.source === 'emails' ? parsed.source : null,
      records: parsed.records,
      templateId: typeof parsed.templateId === 'string' ? parsed.templateId : null,
      numbering: parsed.numbering ?? { enabled: true, prefix: 'INV' },
    }
  } catch {
    return null
  }
}

export function clearWizardSession(): void {
  storage()?.removeItem(SESSION_KEY)
  storage()?.removeItem(EXECUTE_KEY)
}

export function saveExecuteStatus(status: ExecuteStatus): void {
  try {
    storage()?.setItem(EXECUTE_KEY, JSON.stringify(status))
  } catch {
    // ignore quota/availability errors
  }
}

export function loadExecuteStatus(): ExecuteStatus | null {
  try {
    const raw = storage()?.getItem(EXECUTE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ExecuteStatus>
    if (!Array.isArray(parsed.statuses)) return null
    return { statuses: parsed.statuses, interrupted: parsed.interrupted === true }
  } catch {
    return null
  }
}

export function clearExecuteStatus(): void {
  storage()?.removeItem(EXECUTE_KEY)
}