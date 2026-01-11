import { Outlet, NavLink, Navigate, useLocation } from 'react-router-dom'
import { FileText, PlusCircle, User, Calendar, LogOut, Building2, Menu, X } from 'lucide-react'
import { useAuth } from './contexts/AuthProvider'
import { useState, useEffect } from 'react'

// Components for protected layout
function ProtectedLayout() {
  const { user, signOut } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const location = useLocation()

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false)
  }, [location])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '1rem 0',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', zIndex: 51, position: 'relative' }}>
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

          {/* Desktop Nav */}
          <nav className="mobile-hidden" style={{ display: 'flex', gap: '0.5rem' }}>
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

          {/* Desktop User Menu */}
          <div className="mobile-hidden" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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

          {/* Mobile Hamburger Button */}
          <button
            className="desktop-hidden btn btn-ghost"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{ zIndex: 51, position: 'relative' }}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          {/* Mobile Menu Overlay */}
          {isMenuOpen && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'var(--color-surface)',
              padding: '5rem 1rem 2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              zIndex: 40
            }}>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <NavLink
                  to="/reports"
                  className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ justifyContent: 'flex-start', padding: '1rem' }}
                  end
                >
                  <FileText size={20} />
                  一覧
                </NavLink>
                <NavLink
                  to="/patients/new"
                  className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ justifyContent: 'flex-start', padding: '1rem' }}
                >
                  <PlusCircle size={20} />
                  新規患者登録
                </NavLink>
                <NavLink
                  to="/calendar"
                  className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ justifyContent: 'flex-start', padding: '1rem' }}
                >
                  <Calendar size={20} />
                  スケジュール
                </NavLink>
                <NavLink
                  to="/institutions"
                  className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ justifyContent: 'flex-start', padding: '1rem' }}
                >
                  <Building2 size={20} />
                  関係機関
                </NavLink>
              </nav>

              <div style={{ marginTop: 'auto', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', opacity: 0.7 }}>
                  <User size={18} />
                  <span>{user.email}</span>
                </div>
                <button
                  onClick={signOut}
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--color-danger)' }}
                >
                  <LogOut size={20} />
                  ログアウト
                </button>
              </div>
            </div>
          )}
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
