import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App' // Now simply the ProtectedLayout
import ReportList from './pages/ReportList'
import ReportEdit from './pages/ReportEdit'
import PatientDetail from './pages/PatientDetail'
import PatientCreate from './pages/PatientCreate'
import CalendarView from './pages/CalendarView'
import InstitutionList from './pages/InstitutionList'
import InstitutionEdit from './pages/InstitutionEdit'
import Settings from './pages/Settings'
import EntryPortal from './pages/EntryPortal'
import { AuthProvider } from './contexts/AuthProvider'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/entry" element={<EntryPortal />} />
        <Route
          path="/*"
          element={(
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<Navigate to="/reports" replace />} />
                <Route path="/" element={<App />}> {/* App is ProtectedLayout */}
                  <Route index element={<Navigate to="/reports" replace />} />
                  <Route path="reports" element={<ReportList />} />
                  <Route path="reports/new" element={<ReportEdit />} />
                  <Route path="reports/:id" element={<ReportEdit />} />
                  <Route path="reports/:id/edit" element={<ReportEdit />} />
                  <Route path="patients/new" element={<PatientCreate />} />
                  <Route path="patients/:id" element={<PatientDetail />} />
                  <Route path="institutions" element={<InstitutionList />} />
                  <Route path="institutions/new" element={<InstitutionEdit />} />
                  <Route path="institutions/:id/edit" element={<InstitutionEdit />} />
                  <Route path="calendar" element={<CalendarView />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Routes>
            </AuthProvider>
          )}
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
