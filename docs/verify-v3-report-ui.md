# v3報告書作成画面UIの検証手順

作成日: 2026-06-11

## 対象

`codex-implementation-brief-v3.md` のタスクE「報告書作成画面のUI再設計」に対応した確認手順。

主な確認対象:

- `src/pages/ReportEdit.tsx`
- `src/components/MedicationListForm.tsx`
- `src/index.css`
- `docs/product-design-audit/2026-06-11-v3-report-ui/`

## 自動確認

```bash
npm run build
npm run lint
npm run test:local-app
git diff --check
```

期待結果:

- `build` が成功する。
- `lint` が成功する。
- `test:local-app` が全件成功し、`tests/reportEditUiV3.test.mjs` が含まれる。
- `git diff --check` で空白エラーが出ない。

UI仕様だけを短く確認する場合:

```bash
node --test --experimental-strip-types tests/reportEditUiV3.test.mjs tests/releaseReadinessCheck.test.mjs
```

期待結果:

- v3仕様書が存在する。
- BIZ UDPゴシックが同梱されている。
- 報告書作成画面にデスクトップ用サマリーレールと狭幅用サマリー構造がある。
- 定型文がプルダウンではなくチップ表示になっている。
- 合計残日数と「いつまで分」が枠なし・右揃え・tabular nums表示になっている。

## 画面確認

開発サーバーを起動する。

```bash
npm run dev -- --host 127.0.0.1 --port 5174
```

確認するURL:

```text
http://127.0.0.1:5174/reports/new
```

確認幅:

- 1440px
- 1100px
- 960px
- 390px

期待結果:

- 1440px/1100pxでは、左に入力フォーム、右に固定サマリーレールが表示される。
- 960px/390pxでは、サマリーがフォーム上部に移動する。
- 保存バー、サマリー、フォーム入力が重ならない。
- ページ全体に横はみ出しがない。
- 定型文は各テキストエリア直下のチップから追記/置換できる。
- 訪問メモと「メモからAI下書き」は指導内容セクションの先頭にある。
- キーボードのみで、戻る、セクション展開、入力、定型文チップ、印刷対象、保存へ到達できる。

## 証跡

スクリーンショットとCDP実測値は次に保存する。

```text
docs/product-design-audit/2026-06-11-v3-report-ui/
```

必須ファイル:

- `01-v3-1440.png`
- `02-v3-1100.png`
- `03-v3-960.png`
- `04-v3-390.png`
- `README.md`

`README.md` には、各幅の `scrollWidth` と `clientWidth` が一致し、`overflowing: false` であることを記録する。

## 注意

mac開発環境では、Windows実機でのフォント描画、印刷ダイアログ、プリンター依存の余白は完了判定にしない。Windowsインストーラー作成後の実機スモークで別途確認する。
