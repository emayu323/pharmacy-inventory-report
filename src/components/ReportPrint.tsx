import type { MedicationCheckItem, Report } from '../types'
import React from 'react'
import {
  formatPrintDate,
  resolvePatientAgeAtVisit,
  resolveReportRecipient,
  type ReportPrintRecipient
} from '../reportPrintModel'

interface Props {
  report: Omit<Report, 'id' | 'created_at' | 'updated_at'>
  recipients?: ReportPrintRecipient[]
}

export const ReportPrint = React.forwardRef<HTMLDivElement, Props>(({ report, recipients = ['medical'] }, ref) => {
  const printRecipients: ReportPrintRecipient[] = recipients.length > 0 ? recipients : ['medical']

  return (
    <div ref={ref} className="print-document">
      {printRecipients.map((recipient, index) => (
        <ReportPrintCopy
          key={recipient}
          report={report}
          recipient={recipient}
          isLast={index === printRecipients.length - 1}
        />
      ))}

      <style>{`
        .print-document {
          background: white;
          color: black;
        }
        .print-copy {
          padding: 12px;
          background: white;
          color: black;
          font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
          line-height: 1.3;
        }
        .print-copy:not(.print-copy-last) {
          break-after: page;
          page-break-after: always;
        }
        .print-header {
          text-align: center;
          margin-bottom: 4px;
          padding-bottom: 0;
          position: relative;
        }
        .print-header h1 {
          font-size: 18px;
          margin: 0;
        }
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
          background-color: #f3f4f6;
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
          padding-bottom: 8px;
        }
        .print-section h3 {
          font-size: 13px;
          margin: 0 0 6px 0;
          font-weight: bold;
          border-left: 3px solid #666;
          padding-left: 6px;
        }
        .print-guidance-row {
          display: flex;
          padding: 4px;
          border-bottom: 1px solid #e5e7eb;
        }
        .print-guidance-label {
          width: 100px;
          font-size: 11px;
          font-weight: bold;
          color: #666;
          padding-top: 2px;
        }
        .print-guidance-value {
          flex: 1;
          font-size: 12px;
          white-space: pre-wrap;
          line-height: 1.3;
        }
        .print-medication-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .print-medication-table th {
          padding: 0.25rem;
          background-color: #f3f4f6;
          border-bottom: 1px solid #e5e7eb;
        }
        .print-medication-table td {
          padding: 0.25rem;
          border-bottom: 1px solid #e5e7eb;
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

const ReportPrintCopy = ({
  report,
  recipient,
  isLast
}: {
  report: Omit<Report, 'id' | 'created_at' | 'updated_at'>
  recipient: ReportPrintRecipient
  isLast: boolean
}) => {
  const resolvedRecipient = resolveReportRecipient(report, recipient)
  const patientAge = resolvePatientAgeAtVisit(report.patient_dob, report.visit_date, report.patient_age_at_visit)

  return (
    <div className={`print-copy${isLast ? ' print-copy-last' : ''}`}>
      <div className="print-header">
        <h1>居宅療養管理指導報告書</h1>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '12px', marginTop: '4px', marginBottom: '8px', lineHeight: 1.4 }}>
          <div style={{ textAlign: 'left', width: '48%' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>[報告先]</div>
            <div>{resolvedRecipient.name}</div>
            {(resolvedRecipient.tel || resolvedRecipient.fax) && (
              <div>TEL: {resolvedRecipient.tel || '-'} / FAX: {resolvedRecipient.fax || '-'}</div>
            )}
          </div>

          <div style={{ width: '48%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>[報告元]</div>
              <div>{report.pharmacy_name} {report.pharmacist_name}</div>
              {report.pharmacy_address && <div>{report.pharmacy_address}</div>}
              <div>TEL: {report.pharmacy_tel} / FAX: {report.pharmacy_fax}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="print-grid">
        <div className="print-section form-container">
          <table className="form-table">
            <tbody>
              <tr>
                <td className="label-cell" style={{ width: '10%' }}>患者氏名</td>
                <td className="value-cell" style={{ width: '90%', fontSize: '16px', fontWeight: 'bold' }}>
                  {report.patient_name} <span style={{ fontSize: '12px', fontWeight: 'normal' }}>様</span>
                  <span style={{ fontSize: '12px', fontWeight: 'normal', marginLeft: '1rem' }}>
                    ({formatPrintDate(report.patient_dob)}生 {patientAge}歳)
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
                <td className="value-cell" style={{ width: '30%' }}>
                  {report.medical_institution_name}
                </td>
                <td className="label-cell" style={{ width: '10%' }}>処方医</td>
                <td className="value-cell" style={{ width: '20%' }}>{report.doctor_name}</td>
                <td className="label-cell" style={{ width: '10%' }}>訪問日</td>
                <td className="value-cell" style={{ width: '20%' }}>{formatPrintDate(report.visit_date)}</td>
              </tr>
            </tbody>
          </table>

          <table className="form-table" style={{ borderTop: 'none' }}>
            <tbody>
              <tr>
                <td className="label-cell" style={{ width: '15%' }}>処方日</td>
                <td className="value-cell" style={{ width: '35%' }}>{formatPrintDate(report.prescription_date)}</td>
                <td className="label-cell" style={{ width: '15%' }}>調剤日</td>
                <td className="value-cell" style={{ width: '35%' }}>{formatPrintDate(report.dispensing_date)}</td>
              </tr>
            </tbody>
          </table>

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
                <td className="label-cell">アレルギー/副作用歴</td>
                <td className="value-cell" colSpan={2}>{report.allergy_history}</td>
                <td className="label-cell">相互作用</td>
                <td className="value-cell" colSpan={2}>{report.interaction_status}</td>
              </tr>
            </tbody>
          </table>
        </div>

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
              <GuidanceRow label="主訴等" value={report.chief_complaint} />
            )}

            <GuidanceRow label="服薬指導" value={report.medication_instruction} />

            {report.side_effects && (
              <GuidanceRow label="その他伝達事項" value={report.side_effects} />
            )}

            {report.next_visit_date && (
              <GuidanceRow label="次回訪問予定日" value={formatPrintDate(report.next_visit_date)} isStrong />
            )}
          </div>
        </div>

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
                定期薬は今回調整後、最短で{formatPrintDate(report.regular_medication_supply_until)}まで分を確認しています
              </span>
            </div>
          )}

          {report.medications_check_list && report.medications_check_list.length > 0 && (
            <MedicationTable
              title="定期薬"
              items={report.medications_check_list}
              columns={['薬品名', '今回の合計残日数', '単位', '備考']}
              renderRow={(item) => (
                <>
                  <td>{item.name}</td>
                  <td style={{ textAlign: 'center' }}>{item.calculated_total_days || item.current_amount}</td>
                  <td style={{ textAlign: 'center' }}>{item.unit}</td>
                  <td style={{ color: '#6b7280' }}>{item.notes}</td>
                </>
              )}
            />
          )}

          {report.medications_check_list_prn && report.medications_check_list_prn.length > 0 && (
            <MedicationTable
              title="臨時薬・その他"
              items={report.medications_check_list_prn}
              columns={['薬品名', '数量/単位', '備考']}
              renderRow={(item) => (
                <>
                  <td>{item.name}</td>
                  <td style={{ textAlign: 'center' }}>
                    {[item.current_amount, item.unit].filter(Boolean).join(' / ')}
                  </td>
                  <td style={{ color: '#6b7280' }}>{item.notes}</td>
                </>
              )}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const GuidanceRow = ({ label, value, isStrong = false }: { label: string, value?: string, isStrong?: boolean }) => (
  <div className="print-guidance-row">
    <div className="print-guidance-label">{label}</div>
    <div className="print-guidance-value" style={{ fontWeight: isStrong ? 'bold' : undefined }}>
      {value}
    </div>
  </div>
)

const MedicationTable = ({
  title,
  items,
  columns,
  renderRow
}: {
  title: string
  items: MedicationCheckItem[]
  columns: string[]
  renderRow: (item: MedicationCheckItem) => React.ReactNode
}) => (
  <div style={{ marginBottom: '1rem' }}>
    <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 0.25rem 0', color: '#4b5563' }}>{title}</h4>
    <table className="print-medication-table">
      <thead>
        <tr>
          {columns.map((column, index) => (
            <th
              key={column}
              style={{
                textAlign: index === 0 || index === columns.length - 1 ? 'left' : 'center',
                width: index === 0 ? '30%' : undefined
              }}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.id}>{renderRow(item)}</tr>
        ))}
      </tbody>
    </table>
  </div>
)
