import { useRef, useState } from 'react'
import type { InvoiceRecordData } from '../../../shared/types.js'
import { parseCsvToRecords, CSV_TEMPLATE_HEADER, CSV_TEMPLATE_SAMPLE, makeRecordId } from '../../../shared/pure/csv.js'
import { deriveNameFromEmail, parsePastedEmails } from '../../../shared/pure/emails.js'
import { useToast } from '../../context/ToastContext.js'
import { Button, Card, TextArea } from '../../components/ui.js'

export function SourceStep({ onRecords }: { onRecords: (records: InvoiceRecordData[], source: 'csv' | 'emails') => void }) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [emailsText, setEmailsText] = useState('')
  const [emailsError, setEmailsError] = useState<string | null>(null)

  const importEmails = () => {
    const parsed = parsePastedEmails(emailsText)
    setEmailsError(null)
    if (parsed.emails.length === 0) {
      setEmailsError('No valid emails found. Enter one email per line.')
      toast('error', 'No valid emails found.')
      return
    }
    const records: InvoiceRecordData[] = parsed.emails.map((email) => {
      const derived = deriveNameFromEmail(email)
      let customerName = derived
      if (!customerName) {
        const at = email.indexOf('@')
        customerName = email.slice(0, at)
          .replace(/[0-9]+/g, ' ')
          .replace(/[._-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .split(' ')
          .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
          .join(' ')
      }
      return {
        id: makeRecordId(),
        source: 'emails',
        customerName,
        email,
        lineItems: [{ description: '', quantity: 1, unitAmount: 0 }],
        errors: [],
      }
    })
    const notes = [
      `Imported ${records.length} record${records.length === 1 ? '' : 's'} from pasted emails.`,
      parsed.duplicates > 0 ? ` ${parsed.duplicates} duplicate(s) skipped.` : '',
      parsed.invalid.length > 0 ? ` ${parsed.invalid.length} invalid email(s) skipped.` : '',
    ].join('')
    if (parsed.duplicates > 0 || parsed.invalid.length > 0) toast('warning', notes)
    else toast('success', `Imported ${records.length} records from pasted emails.`)
    onRecords(records, 'emails')
  }

  const handleFile = async (file: File | null) => {
    if (!file) return
    setParsing(true)
    setCsvError(null)
    try {
      const text = await file.text()
      const result = parseCsvToRecords(text)
      if (result.rejected) {
        setCsvError(result.message || 'The CSV file was rejected.')
        toast('error', result.message || 'The CSV file was rejected.')
        return
      }
      if (result.records.length === 0) {
        setCsvError('No valid rows found in the file.')
        toast('error', 'No valid rows found in the file.')
        return
      }
      if (result.rowErrors.length > 0) {
        toast('warning', `${result.rowErrors.length} row(s) were skipped due to validation errors.`)
      } else {
        toast('success', `Imported ${result.records.length} records from CSV.`)
      }
      onRecords(result.records, 'csv')
    } catch {
      setCsvError('Could not read the file.')
      toast('error', 'Could not read the file.')
    } finally {
      setParsing(false)
    }
  }

  const downloadCsvTemplate = () => {
    const rows = [CSV_TEMPLATE_HEADER.join(','), CSV_TEMPLATE_SAMPLE.join(',')]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mailflow-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Upload a CSV of sales records" subtitle="Same fields for every row — see the template below.">
      <div
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void handleFile(e.dataTransfer.files?.[0] ?? null)
        }}
      >
        <p className="text-sm font-medium text-slate-700">Drop a CSV here</p>
        <p className="mt-1 text-xs text-slate-400">or</p>
        <Button className="mt-3" variant="secondary" loading={parsing} onClick={() => fileRef.current?.click()}>
          Choose file
        </Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0] ?? null)} />
      </div>
      {csvError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{csvError}</p>}
      <button onClick={downloadCsvTemplate} className="mt-4 text-sm text-brand-600 underline hover:text-brand-700">
        Download a template CSV
      </button>
      <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 text-xs">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              {CSV_TEMPLATE_HEADER.map((h) => (
                <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="text-slate-600">
              {CSV_TEMPLATE_SAMPLE.map((v, i) => (
                <td key={i} className="px-2 py-1.5 whitespace-nowrap">
                  {v}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      </Card>

      <Card
        title="Paste customer emails"
        subtitle="Names are derived from the email address automatically (digits stripped, separators turned into spaces, first token title-cased)."
      >
        <TextArea
          rows={8}
          value={emailsText}
          onChange={(e) => setEmailsText(e.target.value)}
          placeholder={'john.doe123@gmail.com\njane_smith@company.com\nmike-brown@x.com'}
        />
        {emailsError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{emailsError}</p>}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={importEmails} disabled={!emailsText.trim()}>
            Import emails
          </Button>
          <p className="text-xs text-slate-400">One email per line. Each record starts with one empty line item — fill it in the review step.</p>
        </div>
      </Card>
    </div>
  )
}
