import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App'
import ReportList from './pages/ReportList'
import ReportEdit from './pages/ReportEdit'
import PatientDetail from './pages/PatientDetail'
import CalendarView from './pages/CalendarView' // Import CalendarView
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/reports" replace />} />
          <Route path="reports" element={<ReportList />} />
          <Route path="reports/new" element={<ReportEdit />} />
          <Route path="reports/:id" element={<ReportEdit />} />
          <Route path="reports/:id/edit" element={<ReportEdit />} />
          <Route path="patients/:id" element={<PatientDetail />} />
          <Route path="calendar" element={<CalendarView />} /> {/* Add Calendar Route */}
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
