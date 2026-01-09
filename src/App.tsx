import { Outlet, NavLink } from 'react-router-dom'
import { FileText, PlusCircle, User, Calendar } from 'lucide-react'

function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '1rem 0',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              backgroundColor: 'var(--color-primary)',
              color: 'white',
              padding: '0.35rem',
              borderRadius: '6px'
            }}>
              <FileText size={20} />
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>訪問薬剤管理指導報告書</h1>
          </div>

          <nav style={{ display: 'flex', gap: '0.5rem' }}>
            <NavLink
              to="/reports"
              className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
              end
            >
              <FileText size={18} />
              一覧
            </NavLink>
            <NavLink
              to="/reports/new"
              className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
            >
              <PlusCircle size={18} />
              新規作成
            </NavLink>
            <NavLink
              to="/calendar"
              className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
            >
              <Calendar size={18} />
              スケジュール
            </NavLink>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <User size={20} color="var(--color-text-muted)" />
          </div>
        </div>
      </header>

      <main style={{ flex: 1, padding: '2rem 0' }}>
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default App
