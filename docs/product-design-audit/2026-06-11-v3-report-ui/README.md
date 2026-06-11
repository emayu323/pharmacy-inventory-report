# Product Design UI監査: v3報告書作成画面

監査日: 2026-06-11
対象: `/reports/new` 新規報告書作成画面

## 変更方針

- `codex-implementation-brief-v3.md` のタスクEに基づき、報告書作成画面を入力カラム + 固定サマリーレールへ再構成した。
- 1100px以上では右側に作成サマリー、A4ページ目安、印刷/保存操作を固定表示する。
- 960px/390pxではサマリーを上部バー化し、主操作は下部アクションへ戻す。
- 定型文はプルダウンではなく、各入力欄直下のチップ操作へ変更した。
- BIZ UDPゴシックをOFL同梱でアプリ内に持たせ、オフラインでも同一書体を使う。

## 証跡

1. `01-v3-1440.png`: 1440px幅。右サマリーレールあり。
2. `02-v3-1100.png`: 1100px幅。右サマリーレールあり。
3. `03-v3-960.png`: 960px幅。上部サマリー表示。
4. `04-v3-390.png`: 390px幅。上部サマリー表示、入力欄の横はみ出しなし。

## CDP実測

Chrome DevTools ProtocolでCSS viewportを固定して確認した。

```json
[
  { "width": 1440, "scrollWidth": 1440, "clientWidth": 1440, "overflowing": false },
  { "width": 1100, "scrollWidth": 1100, "clientWidth": 1100, "overflowing": false },
  { "width": 960, "scrollWidth": 960, "clientWidth": 960, "overflowing": false },
  { "width": 390, "scrollWidth": 390, "clientWidth": 390, "overflowing": false }
]
```

全幅で `font-family` は `"BIZ UDPGothic", system-ui, -apple-system, sans-serif`。

## 残る注意

- キーボード到達性は `tests/reportEditUiV3.test.mjs` で、基本情報の展開操作と主要操作がbutton/summaryとして到達可能であることを確認する。
- Windows実機でのフォント描画、印刷ダイアログ、プリンター依存の余白は未確認。
- 右レール導入により、薬剤入力は横長表ではなくカード表示へ寄せた。v3の2カラム幅ではこの方が横はみ出しを防ぎやすい。
