# v2方針変更の検証手順

作成日: 2026-06-11

## 対象

`codex-implementation-brief-v2.md` の方針変更に対応した確認手順。

## 確認コマンド

```bash
npm run build
npm run test:local-app
npm run lint
npm run release:check:full
```

期待結果:

- `build` が成功する。
- `test:local-app` が全件成功する。
- `lint` が成功する。
- `release:check:full` は `fail 0` で、GitHub Actions上のWindowsインストーラーartifact、本番Vercel env、現地AI結合証跡など外部実行待ちだけが `pending` になる。

## 方針別確認

録音廃止:

```bash
rg -n "MediaRecorder|getUserMedia|Whisper|whisper|test:local-ai-audio|createDraftFromAudio|transcribeAudio|患者会話録音|録音を使う場合|音声と文字起こし" src electron package.json public/manual.html docs/local-first-requirements.md docs/local-first-implementation-plan.md docs/local-ai-integration-check.md tests scripts
```

期待結果:

- 実装・文書には録音/Whisper導線が残らない。
- `whisper` を含まないことを確認するテストだけは許容する。

Supabaseアプリモード削除:

```bash
rg -n "supabase|Supabase|VITE_SUPABASE|@supabase" src electron
npm ls @supabase/supabase-js --depth=0
```

期待結果:

- `src/` と `electron/` にSupabase参照がない。
- `@supabase/supabase-js` がアプリ依存に存在しない。
- `api/install-code/` の導入コード台数管理用Supabase REST実装は対象外として残る。

自動更新:

```bash
node --test --experimental-strip-types tests/autoUpdateService.test.mjs tests/packageBuildConfig.test.mjs
```

期待結果:

- コード署名フラグがない場合、自動更新は無効。
- 更新ダウンロード後、更新前バックアップ成功時だけ `quitAndInstall` へ進む。
- `electron-updater` と公開リリース用publish設定がパッケージに含まれる。

## 画面確認

mac開発環境ではWindowsインストーラーと実更新は完了判定にしない。

```bash
npm run dev -- --host 127.0.0.1 --port 5174
```

確認する画面:

- `/settings`: 「アプリ更新」セクションが表示される。
- `/manual.html`: 普段の起動がWindowsデスクトップショートカット、AIが訪問メモ入力で案内される。

Chrome DevToolsやPlaywrightが使えない環境では、Viteの応答と文言配信を確認する。
