import { useCallback, useContext, useEffect, useMemo, useState, createContext } from 'react'
import type { ReactNode } from 'react'
import type { NinjaConnectionState, NinjaSettingsResponse } from '../../shared/types.js'
import { apiGet, apiPost } from '../lib/api.js'
import { useToast } from './ToastContext.js'

export interface AppContextValue {
  ninja: NinjaConnectionState | null
  ninjaLoading: boolean
  ninjaSettings: NinjaSettingsResponse | null
  refreshAll: () => Promise<void>
  refreshNinja: () => Promise<void>
  refreshNinjaSettings: () => Promise<void>
  saveNinjaSettings: (values: { baseUrl: string; token: string }) => Promise<void>
  testNinja: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const [ninja, setNinja] = useState<NinjaConnectionState | null>(null)
  const [ninjaLoading, setNinjaLoading] = useState(true)
  const [ninjaSettings, setNinjaSettings] = useState<NinjaSettingsResponse | null>(null)

  const refreshNinja = useCallback(async () => {
    setNinjaLoading(true)
    try {
      setNinja(await apiGet<NinjaConnectionState>('/api/ninja/status'))
    } catch {
      setNinja({ ok: false, error: 'Could not reach the API.' })
    } finally {
      setNinjaLoading(false)
    }
  }, [])

  const refreshNinjaSettings = useCallback(async () => {
    try {
      setNinjaSettings(await apiGet<NinjaSettingsResponse>('/api/ninja/settings'))
    } catch {
      setNinjaSettings(null)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshNinja(), refreshNinjaSettings()])
  }, [refreshNinja, refreshNinjaSettings])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  const saveNinjaSettings = useCallback(
    async (values: { baseUrl: string; token: string }) => {
      const result = await apiPost<NinjaSettingsResponse>('/api/ninja/settings', values)
      setNinjaSettings(result)
      await refreshNinja()
      toast('success', 'Invoice Ninja settings saved.')
    },
    [toast, refreshNinja],
  )

  const testNinja = useCallback(async () => {
    const result = await apiGet<NinjaConnectionState>('/api/ninja/status')
    setNinja(result)
    if (result.ok) toast('success', `Connected to ${result.companyName}`)
    else toast('error', result.error || 'Connection failed.')
  }, [toast])

  const value = useMemo(
    () => ({
      ninja,
      ninjaLoading,
      ninjaSettings,
      refreshAll,
      refreshNinja,
      refreshNinjaSettings,
      saveNinjaSettings,
      testNinja,
    }),
    [ninja, ninjaLoading, ninjaSettings, refreshAll, refreshNinja, refreshNinjaSettings, saveNinjaSettings, testNinja],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
