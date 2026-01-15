import type { Report } from '../types'
import React from 'react'

interface Props {
  report: Omit<Report, 'id' | 'created_at' | 'updated_at'>
}

export const ReportPrint = React.forwardRef<HTMLDivElement, Props>(({ report }, ref) => {
  return (
    <div ref={ref} className="print-container">
      <div className="print-header">
        <h1>居宅療養管理指導報告書</h1>

      </div>

      <div className="print-grid">
        {/* Basic Info Row */}
        <div className="print-section">
          <div className="print-row">
            <div className="print-item">
              <span className="print-label">患者氏名</span>
              <span className="print-value">{report.patient_name} 様</span>
            </div>
            <div className="print-item">
              <span className="print-label">生年月日</span>
              <span className="print-value">{report.patient_dob.replace(/-/g, '/')}</span>
            </div>
            <div className="print-item">
              <span className="print-label">性別</span>
              <span className="print-value">{report.patient_gender === 'male' ? '男性' : report.patient_gender === 'female' ? '女性' : 'その他'}</span>
            </div>
          </div>
          <div className="print-row">
            <div className="print-item">
              <span className="print-label">医療機関名</span>
              <span className="print-value">{report.medical_institution_name}</span>
            </div>
            <div className="print-item">
              <span className="print-label">処方医</span>
              <span className="print-value">{report.doctor_name}</span>
            </div>
            <div className="print-item">
              <span className="print-label">担当薬剤師</span>
              <span className="print-value">{report.pharmacist_name}</span>
            </div>
          </div>
          <div className="print-row">
            <div className="print-item">
              <span className="print-label">処方日</span>
              <span className="print-value">{report.prescription_date ? report.prescription_date.replace(/-/g, '/') : ''}</span>
            </div>
            <div className="print-item">
              <span className="print-label">調剤日</span>
              <span className="print-value">{report.dispensing_date ? report.dispensing_date.replace(/-/g, '/') : ''}</span>
            </div>
            <div className="print-item">
              <span className="print-label">訪問日</span>
              <span className="print-value">{report.visit_date.replace(/-/g, '/')}</span>
            </div>
          </div>
        </div>

        {/* Medication Status */}
        <div className="print-section">
          <h3 className="section-title">薬剤管理状況</h3>

          {/* Medication Detail Table (Regular) */}
          {report.medications_check_list && report.medications_check_list.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#4b5563' }}>定期薬</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '0.5rem', textAlign: 'left', width: '30%' }}>薬品名</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>現在残数</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>次回必要数</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>単位</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {report.medications_check_list.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.5rem' }}>{item.name}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{item.current_amount}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{item.next_required_amount}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{item.unit}</td>
                      <td style={{ padding: '0.5rem', color: '#6b7280' }}>{item.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Medication Detail Table (PRN/Other) */}
          {report.medications_check_list_prn && report.medications_check_list_prn.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#4b5563' }}>臨時薬・その他</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '0.5rem', textAlign: 'left', width: '30%' }}>薬品名</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>現在残数</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>次回必要数</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>単位</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {report.medications_check_list_prn.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.5rem' }}>{item.name}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{item.current_amount}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{item.next_required_amount}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{item.unit}</td>
                      <td style={{ padding: '0.5rem', color: '#6b7280' }}>{item.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>




        {/* Instructions */}
        <div className="print-section">
          <h3>指導内容</h3>
          <div className="print-row-block">
            {report.chief_complaint && (
              <div className="print-row-block" style={{ marginBottom: '15px' }}>
                <span className="print-label">主訴等</span>
                <p className="print-value-block">{report.chief_complaint}</p>
              </div>
            )}
            <span className="print-label">服薬指導</span>
            <p className="print-value-block" style={{ minHeight: '100px' }}>{report.medication_instruction}</p>
          </div>
          {report.side_effects && (
            <div className="print-row-block">
              <span className="print-label">その他伝達事項</span>
              <p className="print-value-block">{report.side_effects}</p>
            </div>
          )}
          {report.next_visit_date && (
            <div className="print-row-block">
              <span className="print-label">次回訪問予定日</span>
              <p className="print-value-block" style={{ minHeight: 'auto' }}>{report.next_visit_date.replace(/-/g, '/')}</p>
            </div>
          )}
        </div>

        {/* Plan */}

      </div>

      <style>{`
        .print-container {
          padding: 20px;
          background: white;
          color: black;
          font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
        }
        .print-header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #333;
          padding-bottom: 10px;
          position: relative;
        }
        .print-header h1 {
          font-size: 24px;
          margin: 0;
        }
        .print-date {
          position: absolute;
          right: 0;
          bottom: 10px;
          font-size: 12px;
        }
        .print-section {
          margin-bottom: 20px;
          border: 1px solid #ccc;
          padding: 10px;
        }
        .print-section h3 {
          font-size: 16px;
          margin: 0 0 10px 0;
          background: #eee;
          padding: 5px;
          border-left: 4px solid #666;
        }
        .print-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .print-item {
          display: flex;
          gap: 10px;
          align-items: baseline;
        }
        .print-label {
          font-weight: bold;
          font-size: 14px;
          color: #444;
          min-width: 80px;
        }
        .print-value {
          font-size: 16px;
        }
        .print-row-block {
          margin-bottom: 15px;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 8px;
          background-color: #fafafa;
        }
        .print-value-block {
          margin: 5px 0 0 0;
          padding: 5px;
          white-space: pre-wrap;
          font-size: 14px;
          min-height: 2em;
        }
        @media print {
          @page {
            size: A4;
            margin: 5mm;
          }
          body {
            background: white;
          }
          button {
            display: none !important;
          }
          /* Hide everything else when printing if needed, though react-to-print handles this via portal */
        }
      `}</style>
    </div>
  )
})
