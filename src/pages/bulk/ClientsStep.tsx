import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { NinjaClientInfo } from '../../../shared/types.js'
import { matchClientToRecord } from '../../../shared/pure/ninja.js'
import { apiGet, apiPost, chunk } from '../../lib/api.js'
import { mergeCounts } from '../../lib/numbering.js'
import { useToast } from '../../context/ToastContext.js'
import { assignClient, isUnmatched, type WizardRecord } from '../../lib/wizard.js'
import { Badge, Button, Card, Checkbox, EmptyState, Input, Select, Spinner } from '../../components/ui.js'

export function ClientsStep({
  records,
  setRecords,
}: {
  records: WizardRecord[]
  setRecords: Dispatch<SetStateAction<WizardRecord[]>>
}) {
  const { toast } = useToast()
  const [clients, setClients] = useState<NinjaClientInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createdCount, setCreatedCount] = useState(0)
  const [autoCreate, setAutoCreate] = useState(true)
  const [search, setSearch] = useState('')
  const [manual, setManual] = useState<Record<string, string>>({})

  const seedCounts = async (clientIds: string[]) => {
    if (clientIds.length === 0) return
    try {
      const result = await apiPost<{ counts: Record<string, number> }>('/api/ninja/invoice-counts', { clientIds })
      mergeCounts(result.counts || {})
    } catch {
      // best effort — stored counts are used as fallback
    }
  }

  const createClientsFor = async (targets: WizardRecord[]) => {
    const missing = targets.filter((w) => isUnmatched(w))
    if (missing.length === 0) return
    setCreating(true)
    try {
      let done = 0
      for (const batch of chunk(missing, 5)) {
        await Promise.all(
          batch.map(async (w) => {
            try {
              const result = await apiPost<{ ok: boolean; id?: string; name?: string; error?: string }>('/api/ninja/clients-create', {
                name: w.record.customerName,
                email: w.record.email,
              })
              done++
              setRecords((prev) =>
                assignClient(prev, w.record.id, {
                  status: result.ok ? 'created' : 'not_found',
                  clientId: result.id,
                  clientName: result.ok ? result.name || w.record.customerName : undefined,
                  source: 'created',
                  error: result.ok ? undefined : result.error,
                }),
              )
              if (!result.ok && result.error) toast('error', `${w.record.customerName}: ${result.error}`)
            } catch (err) {
              done++
              setRecords((prev) =>
                assignClient(prev, w.record.id, {
                  status: 'not_found',
                  source: 'created',
                  error: err instanceof Error ? err.message : 'Could not create client.',
                }),
              )
            }
          }),
        )
      }
      setCreatedCount((prev) => prev + done)
      if (done > 0) toast('success', `Created ${done} client(s) in Invoice Ninja.`)
    } finally {
      setCreating(false)
    }
  }

  const syncClients = async (shouldCreate: boolean): Promise<void> => {
    const result = await apiGet<{ clients: NinjaClientInfo[] }>('/api/ninja/clients')
    setClients(result.clients)
    const autoMatched: WizardRecord[] = records.map((w) => {
      if (isUnmatched(w)) {
        const matched = matchClientToRecord(result.clients, w.record)
        if (matched) return { ...w, client: { status: 'matched', clientId: matched.id, clientName: matched.name, source: 'auto' } }
      }
      return w
    })
    setRecords(autoMatched)
    const recordClientIds = autoMatched.filter((w) => w.client.clientId).map((w) => w.client.clientId as string)
    void seedCounts(recordClientIds)
    if (shouldCreate) {
      const missing = autoMatched.filter((w) => isUnmatched(w))
      if (missing.length > 0) {
        await createClientsFor(autoMatched)
        await syncClients(false)
      }
    }
  }

  const loadClients = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      await syncClients(true)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load clients.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadClients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const searchableClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
  }, [clients, search])

  const createMissing = async () => {
    await createClientsFor(records)
  }

  const unmatched = records.filter((w) => isUnmatched(w))
  const countByStatus = (status: string) => records.filter((w) => w.client.status === status).length

  return (
    <div className="space-y-4">
      <Card
        title="Assign clients"
        subtitle="Every record needs an Invoice Ninja client before it can be invoiced."
        actions={
          <Button variant="secondary" onClick={() => void loadClients()} disabled={loading}>
            {loading ? <Spinner size="sm" /> : 'Reload clients'}
          </Button>
        }
      >
        {loadError && (
          <div className="mb-4 flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>{loadError}</span>
            <a className="font-medium underline" href="/settings">
              Configure Invoice Ninja
            </a>
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-brand-50 px-3 py-2">
          <Checkbox
            checked={autoCreate}
            onChange={(e) => {
              const next = e.target.checked
              setAutoCreate(next)
              if (next && !loading && !creating && records.some((w) => w.client.status === 'unmatched')) {
                void createClientsFor(records)
              }
            }}
            label="Automatically create missing clients in Invoice Ninja"
          />
          {creating ? (
            <span className="flex items-center gap-2 text-xs text-slate-600">
              <Spinner size="sm" /> Creating missing clients…
            </span>
          ) : (
            createdCount > 0 && (
              <span className="text-xs font-medium text-emerald-700">{createdCount} client(s) created in this session</span>
            )
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Matched</p>
            <p className="text-lg font-semibold text-emerald-600">{countByStatus('matched') + countByStatus('created')}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Need a client</p>
            <p className="text-lg font-semibold text-amber-600">{unmatched.length}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Skipped</p>
            <p className="text-lg font-semibold text-slate-600">{countByStatus('skipped')}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Clients in Ninja</p>
            <p className="text-lg font-semibold text-slate-800">{clients.length}</p>
          </div>
        </div>
        {unmatched.length > 0 && (
          <div className="mt-4">
            <Button onClick={() => void createMissing()} loading={creating} disabled={clients.length === 0 && loading}>
              Create {unmatched.length} missing client{unmatched.length === 1 ? '' : 's'} in Invoice Ninja
            </Button>
            <p className="mt-2 text-xs text-slate-400">
              One-click creation for records with no matching client. You can also pick an existing client manually or skip a record.
            </p>
          </div>
        )}
      </Card>

      <Card>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <Spinner /> Loading clients…
          </div>
        ) : (
          <>
            <Input placeholder="Search clients to match manually…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />
            {records.length === 0 ? (
              <EmptyState title="No records yet." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Client</th>
                      <th className="px-3 py-2 w-40">Status</th>
                      <th className="px-3 py-2 w-40">Actions</th>
                    </tr>
                  </thead>
                  {records.map((w) => {
                    const manualValue = manual[w.record.id] ?? ''
                    return (
                      <tbody key={w.record.id} className="border-t border-slate-100">
                        <tr className={isUnmatched(w) ? 'bg-amber-50/40' : 'bg-white'}>
                          <td className="px-3 py-1.5">{w.record.customerName}</td>
                          <td className="px-3 py-1.5 text-xs text-slate-500">{w.record.email}</td>
                          <td className="px-3 py-1.5">
                            <Select
                              value={manualValue}
                              onChange={(e) => {
                                setManual((prev) => ({ ...prev, [w.record.id]: e.target.value }))
                                if (e.target.value) {
                                  const client = clients.find((c) => c.id === e.target.value)
                                  setRecords(
                                    assignClient(records, w.record.id, {
                                      status: 'matched',
                                      clientId: e.target.value,
                                      clientName: client?.name,
                                      source: 'manual',
                                    }),
                                  )
                                }
                              }}
                              className="w-56"
                            >
                              <option value="">Pick a client…</option>
                              {searchableClients.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} {c.email ? `(${c.email})` : ''}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-3 py-1.5">
                            <Badge tone={w.client.status === 'skipped' ? 'slate' : isUnmatched(w) ? 'amber' : 'green'}>
                              {w.client.status}
                            </Badge>
                            {w.client.error && <p className="mt-0.5 max-w-[200px] text-xs text-red-600">{w.client.error}</p>}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex gap-2">
                              {w.client.status !== 'skipped' && (
                                <Button
                                  variant="ghost"
                                  className="px-2 py-1 text-xs"
                                  onClick={() => setRecords(assignClient(records, w.record.id, { status: 'skipped' }))}
                                >
                                  Skip
                                </Button>
                              )}
                              {w.client.status === 'skipped' && (
                                <Button
                                  variant="ghost"
                                  className="px-2 py-1 text-xs"
                                  onClick={() => setRecords(assignClient(records, w.record.id, { status: 'unmatched' }))}
                                >
                                  Unskip
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    )
                  })}
                </table>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}