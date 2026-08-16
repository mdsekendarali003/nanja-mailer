import { useApp } from '../context/AppContext.js'
import { Badge, Button, Card, Spinner } from '../components/ui.js'

export default function Dashboard() {
  const { ninja, ninjaLoading, testNinja } = useApp()

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Connect your Invoice Ninja account to get started.</p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card
          title="Invoice Ninja"
          subtitle="Invoices are created and emailed through your Invoice Ninja account."
          actions={
            <Button variant="secondary" onClick={() => void testNinja()} disabled={ninjaLoading}>
              {ninjaLoading ? <Spinner size="sm" /> : 'Test connection'}
            </Button>
          }
        >
          {ninjaLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Spinner /> Checking connection…
            </div>
          ) : ninja?.ok ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge tone="green">Connected</Badge>
                <span className="text-sm font-medium text-slate-800">{ninja.companyName}</span>
              </div>
              <p className="text-sm text-slate-500">Create and email invoices from the bulk invoicing wizard.</p>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-sm text-slate-600">{ninja?.error || 'Invoice Ninja is not connected yet.'}</p>
              <a href="/settings">
                <Button className="mt-4" variant="secondary">
                  Configure Invoice Ninja
                </Button>
              </a>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
