import type { Report } from '../types'
import React from 'react'
import { calculateAge } from '../utils'

interface Props {
  report: Omit<Report, 'id' | 'created_at' | 'updated_at'>
}

export const ReportPrint = React.forwardRef<HTMLDivElement, Props>(({ report }, ref) => {
  return (
    <div ref={ref} className="print-container">
      <div className="print-header">
        <h1>居宅療養管理指導報告書</h1>

        {/* Header Info: Destination & Source */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '12px', marginTop: '4px', marginBottom: '8px', lineHeight: 1.4 }}>
          {/* Left: Destination */}
          <div style={{ textAlign: 'left', width: '48%' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>[報告先]</div>
            <div>{report.medical_institution_name}</div>
            <div>{report.doctor_name} 先生</div>
          </div>

          {/* Right: Source */}
          <div style={{ textAlign: 'right', width: '48%' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>[報告元]</div>
            <div>担当薬剤師: {report.pharmacist_name}</div>
            <div>{report.pharmacy_name}</div>
            <div>TEL: {report.pharmacy_tel} / FAX: {report.pharmacy_fax}</div>
          </div>
        </div>
      </div>

      <div className="print-grid">
        {/* Basic Info Row */}
        {/* Basic Info Table */}
        <div className="print-section form-container">
          <table className="form-table">
            <tbody>
              <tr>
                <td className="label-cell" style={{ width: '10%' }}>氏名</td>
                <td className="value-cell" style={{ width: '90%', fontSize: '16px', fontWeight: 'bold' }}>
                  {report.patient_name} <span style={{ fontSize: '12px', fontWeight: 'normal' }}>様</span>
                  <span style={{ fontSize: '12px', fontWeight: 'normal', marginLeft: '1rem' }}>
                    ({report.patient_dob.replace(/-/g, '/')}生 {calculateAge(report.patient_dob)}歳)
                    <span style={{ marginLeft: '0.5rem' }}>
                      {report.patient_gender === 'male' ? '男性' : report.patient_gender === 'female' ? '女性' : ''}
                    </span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <table className="form-table" style={{ borderTop: 'none' }}>
            <tbody>
              <tr>
                <td className="label-cell" style={{ width: '10%' }}>医療機関</td>
                <td className="value-cell" style={{ width: '30%' }}>{report.medical_institution_name}</td>
                <td className="label-cell" style={{ width: '10%' }}>処方医</td>
                <td className="value-cell" style={{ width: '20%' }}>{report.doctor_name}</td>
                <td className="label-cell" style={{ width: '10%' }}>訪問日</td>
                <td className="value-cell" style={{ width: '20%' }}>{report.visit_date.replace(/-/g, '/')}</td>
              </tr>
            </tbody>
          </table>

          <table className="form-table" style={{ borderTop: 'none' }}>
            <tbody>
              <tr>
                <td className="label-cell" style={{ width: '10%' }}>処方日</td>
                <td className="value-cell" style={{ width: '40%' }}>{report.prescription_date ? report.prescription_date.replace(/-/g, '/') : ''}</td>
                <td className="label-cell" style={{ width: '10%' }}>調剤日</td>
                <td className="value-cell" style={{ width: '40%' }}>{report.dispensing_date ? report.dispensing_date.replace(/-/g, '/') : ''}</td>
              </tr>
            </tbody>
          </table>

          {/* 状況確認 Table (Merged into same container for zero gap) */}
          <table className="form-table" style={{ borderTop: 'none' }}>
            <tbody>
              <tr>
                <td className="label-cell" style={{ width: '12%' }}>指導対象</td>
                <td className="value-cell" style={{ width: '21%' }}>{report.guidance_recipient}</td>
                <td className="label-cell" style={{ width: '12%' }}>服薬状況</td>
                <td className="value-cell" style={{ width: '21%' }}>{report.medication_status}</td>
                <td className="label-cell" style={{ width: '12%' }}>保管状況</td>
                <td className="value-cell" style={{ width: '22%' }}>{report.storage_status}</td>
              </tr>
              <tr>
                <td className="label-cell">他科受診</td>
                <td className="value-cell">{report.other_dept_consultation}</td>
                <td className="label-cell">併用薬</td>
                <td className="value-cell" colSpan={3}>{report.concomitant_medications}</td>
              </tr>
              <tr>
                <td className="label-cell">アレルギー</td>
                <td className="value-cell" colSpan={2}>{report.allergy_history}</td>
                <td className="label-cell">相互作用</td>
                <td className="value-cell" colSpan={2}>{report.interaction_status}</td>
              </tr>
            </tbody>
          </table>
        </div>






        {/* Instructions */}
        <div className="print-section" style={{ border: 'none', padding: 0 }}>
          <h3 style={{
            fontSize: '13px',
            borderLeft: '4px solid #333',
            paddingLeft: '8px',
            marginBottom: '8px',
            background: 'transparent'
          }}>指導内容</h3>

          <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid #e5e7eb' }}>
            {report.chief_complaint && (
              <div style={{ display: 'flex', padding: '4px 4px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ width: '100px', fontSize: '11px', fontWeight: 'bold', color: '#666', paddingTop: '2px' }}>主訴等</div>
                <div style={{ flex: 1, fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>
                  {report.chief_complaint}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', padding: '4px 4px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ width: '100px', fontSize: '11px', fontWeight: 'bold', color: '#666', paddingTop: '2px' }}>服薬指導</div>
              <div style={{ flex: 1, fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: 1.3, minHeight: 'auto' }}>
                {report.medication_instruction}
              </div>
            </div>

            {report.side_effects && (
              <div style={{ display: 'flex', padding: '4px 4px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ width: '100px', fontSize: '11px', fontWeight: 'bold', color: '#666', paddingTop: '2px' }}>その他伝達事項</div>
                <div style={{ flex: 1, fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>
                  {report.side_effects}
                </div>
              </div>
            )}

            {report.next_visit_date && (
              <div style={{ display: 'flex', padding: '4px 4px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ width: '100px', fontSize: '11px', fontWeight: 'bold', color: '#666' }}>次回訪問予定日</div>
                <div style={{ flex: 1, fontSize: '12px', fontWeight: 'bold' }}>
                  {report.next_visit_date.replace(/-/g, '/')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Medication Status */}
        <div className="print-section" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <h3 className="section-title">薬剤管理状況</h3>

          {report.regular_medication_supply_until && (
            <div style={{ margin: '8px 0 12px 0' }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 'bold',
                border: '1px solid #4b5563',
                borderRadius: '4px',
                padding: '4px 8px',
                backgroundColor: '#f9fafb',
                display: 'inline-block',
                color: '#1f2937'
              }}>
                定期薬残: {report.regular_medication_supply_until.replace(/-/g, '/')} まであり
              </span>
            </div>
          )}

          {/* Medication Detail Table (Regular) */}
          {report.medications_check_list && report.medications_check_list.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.25rem' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0, color: '#4b5563' }}>定期薬</h4>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '0.25rem', textAlign: 'left', width: '30%' }}>薬品名</th>
                    <th style={{ padding: '0.25rem', textAlign: 'center' }}>現在残数</th>
                    <th style={{ padding: '0.25rem', textAlign: 'center' }}>次回必要数</th>
                    <th style={{ padding: '0.25rem', textAlign: 'center' }}>単位</th>
                    <th style={{ padding: '0.25rem', textAlign: 'left' }}>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {report.medications_check_list.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.25rem' }}>{item.name}</td>
                      <td style={{ padding: '0.25rem', textAlign: 'center' }}>{item.current_amount}</td>
                      <td style={{ padding: '0.25rem', textAlign: 'center' }}>{item.next_required_amount}</td>
                      <td style={{ padding: '0.25rem', textAlign: 'center' }}>{item.unit}</td>
                      <td style={{ padding: '0.25rem', color: '#6b7280' }}>{item.notes}</td>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '0.25rem', textAlign: 'left', width: '30%' }}>薬品名</th>
                    <th style={{ padding: '0.25rem', textAlign: 'center' }}>現在残数</th>
                    <th style={{ padding: '0.25rem', textAlign: 'center' }}>次回必要数</th>
                    <th style={{ padding: '0.25rem', textAlign: 'center' }}>単位</th>
                    <th style={{ padding: '0.25rem', textAlign: 'left' }}>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {report.medications_check_list_prn.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.25rem' }}>{item.name}</td>
                      <td style={{ padding: '0.25rem', textAlign: 'center' }}>{item.current_amount}</td>
                      <td style={{ padding: '0.25rem', textAlign: 'center' }}>{item.next_required_amount}</td>
                      <td style={{ padding: '0.25rem', textAlign: 'center' }}>{item.unit}</td>
                      <td style={{ padding: '0.25rem', color: '#6b7280' }}>{item.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>

        {/* Plan */}

      </div>

      <style>{`
        .print-container {
          padding: 12px;
          background: white;
          color: black;
          font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
          line-height: 1.3;
        }
        .print-header {
          text-align: center;
          margin-bottom: 4px;
          /* border-bottom: 1px solid #333;  <-- Removed per user request */
          padding-bottom: 0;
          position: relative;
        }
        .print-header h1 {
          font-size: 18px;
          margin: 0;
        }
        .print-date {
          position: absolute;
          right: 0;
          bottom: 2px;
          font-size: 10px;
        }

        /* Form Table Layout */
        .form-container {
          margin-bottom: 4px;
        }
        .form-table {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid #000;
          font-size: 12px;
        }
        .form-table td {
          border: 1px solid #000;
          padding: 4px 6px;
          vertical-align: middle;
        }
        .label-cell {
          background-color: #f3f4f6; /* Light gray background */
          font-weight: bold;
          color: #333;
          text-align: center;
          white-space: nowrap;
        }
        .value-cell {
          background-color: #fff;
          color: #000;
        }

        .print-section {
          margin-bottom: 8px;
          /* border-bottom: 1px solid #ddd;  <-- Removed old border style */
          padding-bottom: 8px;
        }
        .print-section:last-child {
            border-bottom: none;
        }
        .print-section h3 {
          font-size: 13px;
          margin: 0 0 6px 0;
          font-weight: bold;
          border-left: 3px solid #666;
          padding-left: 6px;
        }
        .print-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
        }
        .print-item {
          display: flex;
          gap: 6px;
          align-items: baseline;
        }
        .print-label {
          font-weight: bold;
          font-size: 11px;
          color: #333;
          min-width: 60px;
        }
        .print-value {
          font-size: 13px;
        }
        .print-row-block {
          margin-bottom: 6px;
        }
        .print-value-block {
          margin: 2px 0 0 4px;
          padding: 0 0 0 8px;
          border-left: 2px solid #ccc;
          white-space: pre-wrap;
          font-size: 12px;
          min-height: 1.2em;
          line-height: 1.4;
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
        }
      `}</style>
    </div>
  )
})
