import { NavLink, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard.js'
import SettingsPage from './pages/SettingsPage.js'
import TemplatesPage from './pages/TemplatesPage.js'
import BulkPage from './pages/BulkPage.js'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`

export default function App() {
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 w-56 border-r border-slate-200 bg-white">
        <div className="flex h-full flex-col">
          <div className="px-4 py-5">
            <h1 className="text-lg font-bold text-brand-700">Mailflow</h1>
            <p className="text-xs text-slate-500">Invoice automation</p>
          </div>
          <nav className="flex-1 space-y-1 px-2">
            <NavLink to="/" end className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/bulk" className={navLinkClass}>
              Bulk import
            </NavLink>
            <NavLink to="/templates" className={navLinkClass}>
              Templates
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              Settings
            </NavLink>
          </nav>
        </div>
      </aside>
      <main className="ml-56 p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bulk" element={<BulkPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
