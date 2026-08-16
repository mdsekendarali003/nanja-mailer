export interface ApiError {
  error: string
  errorCode: string
  retryable: boolean
}

export interface LineItemDraft {
  description: string
  quantity: number
  unitAmount: number
  accountCode?: string
}

export interface InvoiceRecordData {
  id: string
  source: 'csv' | 'emails' | string
  customerName: string
  email: string
  phone?: string
  address?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  lineItems: LineItemDraft[]
  supportNumber?: string
  invoiceNumber?: string
  reference?: string
  date?: string
  dueDate?: string
  orderId?: number
  orderNumber?: string
  shippingTotal?: number
  discountTotal?: number
  subtotal?: number
  total?: number
  errors: string[]
}

export interface NinjaConnectionState {
  ok: boolean
  companyName?: string
  error?: string
}

export interface NinjaLineItemPayload {
  product_key?: string
  cost: number
  quantity: number
  notes: string
}

export interface NinjaInvoicePayload {
  client_id: string
  number?: string
  date: string
  due_date?: string
  po_number?: string
  terms?: string
  line_items: NinjaLineItemPayload[]
}

export interface NinjaClientInfo {
  id: string
  name: string
  email?: string
}

export type ClientMatchStatus = 'unmatched' | 'matched' | 'not_found' | 'created' | 'skipped'

export interface ClientMatchState {
  status: ClientMatchStatus
  clientId?: string
  clientName?: string
  source?: 'auto' | 'manual' | 'created'
  error?: string
}

export interface NinjaSettingsResponse {
  baseUrl: string
  tokenMasked: string
  configured: boolean
}

export interface InvoiceTemplate {
  id: string
  name: string
  description?: string
  lineItemDescription?: string
  accountCode?: string
  supportMessage?: string
  paymentTermsDays?: number
}
