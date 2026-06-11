import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const brief = fs.readFileSync(new URL('codex-implementation-brief-v3.md', root), 'utf8')
const reportEdit = fs.readFileSync(new URL('src/pages/ReportEdit.tsx', root), 'utf8')
const medicationListForm = fs.readFileSync(new URL('src/components/MedicationListForm.tsx', root), 'utf8')
const indexCss = fs.readFileSync(new URL('src/index.css', root), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'))
const ofl = fs.readFileSync(new URL('src/assets/fonts/biz-udp-gothic/OFL.txt', root), 'utf8')
const verifyDoc = fs.readFileSync(new URL('docs/verify-v3-report-ui.md', root), 'utf8')
const auditReadme = fs.readFileSync(new URL('docs/product-design-audit/2026-06-11-v3-report-ui/README.md', root), 'utf8')

test('v3 UI brief is checked in as the active UI implementation brief', () => {
    assert.match(brief, /^# codex実装指示書 v3:/)
    assert.match(brief, /タスクE: 報告書作成画面のUI再設計/)
    assert.match(brief, /2カラム化/)
    assert.match(brief, /定型文チップ/)
})

test('BIZ UDPGothic is bundled for offline screen and print rendering', () => {
    assert.match(indexCss, /@font-face/)
    assert.match(indexCss, /BIZ UDPGothic/)
    assert.match(indexCss, /BIZUDPGothic-Regular\.ttf/)
    assert.match(indexCss, /BIZUDPGothic-Bold\.ttf/)
    assert.match(indexCss, /--font-family:\s*'BIZ UDPGothic'/)
    assert.match(ofl, /SIL Open Font License/)
    assert.equal(fs.existsSync(new URL('src/assets/fonts/biz-udp-gothic/BIZUDPGothic-Regular.ttf', root)), true)
    assert.equal(fs.existsSync(new URL('src/assets/fonts/biz-udp-gothic/BIZUDPGothic-Bold.ttf', root)), true)
})

test('report edit screen exposes the v3 desktop summary rail and mobile summary bar structure', () => {
    assert.match(reportEdit, /report-edit-layout/)
    assert.match(reportEdit, /report-edit-main/)
    assert.match(reportEdit, /report-summary-rail/)
    assert.match(reportEdit, /report-summary-details/)
    assert.match(reportEdit, /summary-supply-date/)
    assert.match(reportEdit, /estimateReportPrintPages/)
    assert.match(reportEdit, /ケアマネ未登録/)
    assert.match(reportEdit, /A4ページ目安/)
})

test('basic information collapse control is keyboard reachable', () => {
    assert.match(reportEdit, /className="compact-section-toggle"/)
    assert.match(reportEdit, /type="button"[\s\S]*aria-expanded=\{isBasicInfoOpen\}/)
    assert.match(reportEdit, /aria-controls="section-basic-fields"/)
    assert.match(reportEdit, /id="section-basic-fields"/)
})

test('report edit screen uses template chips instead of dropdown template selectors', () => {
    assert.match(reportEdit, /template-chip-list/)
    assert.match(reportEdit, /template-chip-replace/)
    assert.doesNotMatch(reportEdit, /selectedTemplateIds/)
    assert.doesNotMatch(reportEdit, /<select[\s\S]*定型文を選択/)
})

test('calculated medication values are styled as read-only aligned numbers', () => {
    assert.match(medicationListForm, /medication-calculated/)
    assert.match(medicationListForm, /font-variant-numeric:\s*tabular-nums/)
    assert.match(medicationListForm, /text-align:\s*right/)
    assert.match(medicationListForm, /border:\s*0/)
    assert.match(medicationListForm, /background-color:\s*transparent/)
})

test('local app test gate includes v3 UI coverage', () => {
    assert.ok(packageJson.scripts['test:local-app'].includes('tests/reportEditUiV3.test.mjs'))
})

test('v3 UI verification procedure is documented with screenshot evidence paths', () => {
    assert.match(verifyDoc, /v3報告書作成画面UIの検証手順/)
    assert.match(verifyDoc, /npm run test:local-app/)
    assert.match(verifyDoc, /docs\/product-design-audit\/2026-06-11-v3-report-ui/)
    assert.match(verifyDoc, /01-v3-1440\.png/)
    assert.match(verifyDoc, /04-v3-390\.png/)
    assert.match(verifyDoc, /overflowing: false/)
    assert.doesNotMatch(auditReadme, /キーボード操作は未確認/)
    assert.match(auditReadme, /キーボード到達性/)
})
