import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext.js'
import { Badge, Button, Card, Input, Spinner } from '../components/ui.js'

export default function SettingsPage() {
  const { ninja, ninjaSettings, ninjaLoading, saveNinjaSettings, testNinja } = useApp()
  const [instanceUrl, setInstanceUrl] = useState('')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ninjaSettings?.configured && ninjaSettings.baseUrl && !instanceUrl) {
      setInstanceUrl(ninjaSettings.baseUrl)
    }
  }, [ninjaSettings, instanceUrl])

  const submit = async () => {
    setSaving(true)
    try {
      await saveNinjaSettings({ baseUrl: instanceUrl, token })
      setToken('')
    } catch {
      // error toast handled by the caller
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Values saved here are stored on this device and override server environment variables (`NINJA_API_URL`, `NINJA_API_TOKEN`). The token is masked in every
        response.
      </p>

      <Card
        className="mt-6"
        title="Invoice Ninja"
        subtitle="API token from Settings → Account Management → Integrations → API Tokens."
        actions={
          <Button variant="secondary" onClick={() => void testNinja()} disabled={ninjaLoading}>
            {ninjaLoading ? <Spinner size="sm" /> : 'Test connection'}
          </Button>
        }
      >
        <div className="mb-4 flex items-center gap-2 text-sm">
          {ninjaSettings?.configured ? (
            <>
              <Badge tone="green">Configured</Badge>
              <span className="text-slate-600">
                {ninjaSettings.baseUrl} · token <span className="font-mono">{ninjaSettings.tokenMasked}</span>
              </span>
            </>
          ) : (
            <>
              <Badge tone="amber">Not configured</Badge>
              <span className="text-slate-500">Server env vars are used when set.</span>
            </>
          )}
        </div>
        <div
          className={`mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            ninja?.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {ninjaLoading ? (
            <Spinner size="sm" />
          ) : ninja?.ok ? (
            <>
              <Badge tone="green">Connected</Badge>
              <span>
                Organization: <strong>{ninja.companyName}</strong>
                {ninja.subdomain ? <span className="text-slate-500"> · {ninja.subdomain}.invoicing.co</span> : null}
              </span>
            </>
          ) : (
            <span>{ninja?.error || 'Not connected yet — test the connection.'}</span>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Instance URL"
            value={instanceUrl}
            onChange={(e) => setInstanceUrl(e.target.value)}
            placeholder="https://invoicing.co or your self-hosted URL"
          />
          <Input
            label="API token (blank = keep current)"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={ninjaSettings?.configured ? '••••••••' : 'Paste the API token'}
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Hosted: https://invoicing.co — Demo: https://demo.invoiceninja.com — Self-hosted: https://your-domain.com. The app appends <code>/api/v1</code>.
        </p>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => void submit()} loading={saving} disabled={!instanceUrl.trim()}>
            Save settings
          </Button>
        </div>
      </Card>
    </div>
  )
}
