import { Outlet, NavLink, Navigate } from 'react-router-dom'
import { FileText, PlusCircle, User, Calendar, LogOut, Building2 } from 'lucide-react'
import { useAuth } from './contexts/AuthProvider'

// Components for protected layout
function ProtectedLayout() {
  const { user, signOut } = useAuth()

  if (!user) return <Navigate to="/login" replace />

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
              to="/patients/new"
              className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
            >
              <PlusCircle size={18} />
              新規患者登録
            </NavLink>
            <NavLink
              to="/calendar"
              className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
            >
              <Calendar size={18} />
              スケジュール
            </NavLink>
            <NavLink
              to="/institutions"
              className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
            >
              <Building2 size={18} />
              関係機関
            </NavLink>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.7 }}>
              <User size={18} />
              <span style={{ fontSize: '0.875rem' }}>{user.email}</span>
            </div>
            <button
              onClick={signOut}
              className="btn btn-ghost"
              style={{ padding: '0.25rem 0.5rem', height: 'auto', minHeight: 'auto' }}
              title="ログアウト"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header >

      <main style={{ flex: 1, padding: '2rem 0' }}>
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div >
  )
}

export default ProtectedLayout
