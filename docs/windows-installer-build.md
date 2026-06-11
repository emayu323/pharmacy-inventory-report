# Windowsインストーラービルド手順

## 目的

Vercel入口ページから配布するWindows版インストーラーを作成します。開発はmacでも進められますが、最終の署名付きNSISインストーラーはWindows環境で作成します。

## 前提

- Node.js 24 LTS系
- `npm ci`
- `src/data/drug-master.generated.json` が存在すること

## macでの確認

macでは、インストーラーではなくアプリ同梱物の確認を行います。

```bash
npm run build:electron
npm run verify:electron-package
```

出力先:

```text
release/
```

`verify:electron-package` は、生成された `app.asar` に次が含まれることを確認します。

- Electron main/preload
- Windowsログイン自動起動設定
- Viteビルド済み画面
- ローカルヘルスAPI
- 初期薬剤マスタJSON
- CSV更新に必要な `csv-parse` / `iconv-lite`
- 自動更新に必要な `electron-updater`

## macからWindowsインストーラーをローカル作成

mac開発環境でも、署名なしのWindows NSISインストーラーをローカル作成できます。Codexや権限制限のあるmac環境では、Electron Builderのキャッシュ先をホームディレクトリではなく `/private/tmp` に固定します。

```bash
npm run dist:win:mac
```

出力例:

```text
release/pharmacy-report-setup-0.1.0-x64.exe
release/pharmacy-report-setup-0.1.0-x64.exe.blockmap
release/latest.yml
```

この手順は、mac上で配布物の形と `release:check` の判定を前倒し確認するためのものです。本番配布では、Windows環境またはGitHub Actionsで作成した署名付きインストーラーを使います。

## macでのデモ

Windows実機や本番Vercel環境がなくても、入口ページとローカルアプリ接続状態の見え方はmacで確認できます。これはデモ用の確認であり、本番リリース完了判定ではありません。

```bash
npm run demo:mac-readiness
```

出力には、次が表示されます。

- `/entry` を開くURL
- ブラウザだけでローカルアプリ接続を模擬するコマンド
- Electron開発版でローカルDB/ローカルAPIを起動するコマンド
- Windowsインストーラー、本番Vercel環境変数、現地AI結合証跡などの外部待ち

ブラウザだけで入口ページを見せる場合は、出力された「ブラウザのみデモ」の2コマンドを別々のターミナルで起動します。

Electron開発版まで見せる場合は、出力された「Electronデモ」の2コマンドを使います。この場合、Electron側がローカルヘルスAPIも起動するため、「ブラウザのみデモ」のヘルスサーバーとは同時に起動しません。

起動後、入口ページとローカルヘルスAPIが応答しているかを確認します。

```bash
npm run demo:mac-smoke
```

`macデモ実行確認: OK` と表示されれば、`http://127.0.0.1:5174/entry` を開いてデモできます。この確認はローカルホストだけを参照し、本番リリース判定は変更しません。

導入コードやインストーラーURLを差し替える場合:

```bash
npm run demo:mac-readiness -- \
  --demo-code DEMO-5678 \
  --installer-url https://example.com/pharmacy-report-setup-0.1.0-x64.exe
```

## リリース前チェック

mac開発環境では、Windows実機や本番Vercelでしか確認できない項目があります。`release:check` は、ローカルで揃っている項目と外部環境待ちの項目をJSONで分けて確認します。

```bash
npm run release:check
```

管理者が残作業だけを読みたい場合は、人間向け表示に切り替えます。

```bash
npm run release:check -- --format text
```

通常の引き継ぎ前確認では、ローカルの変更がGitHubへ反映済みか、公開リリース用リポジトリとGitHub Actions上のWindowsインストーラーartifactがあるか、Vercel本番env名が反映済みか、現地AI結合証跡があるかもまとめて確認します。

```bash
npm run release:check:full
```

`release:check:full` はGitHub Actions状態とVercel本番env名も読み取り専用で確認し、公開リリース用リポジトリ、`RELEASES_GITHUB_TOKEN` Secret名、コード署名用Secret名、自動更新公開用Variable名、最新workflow run/artifactの有無、必要な `INSTALL_CODE_REGISTRY` / `WINDOWS_INSTALLER_URL` の不足、旧 `VITE_SUPABASE_*` の残存を表示します。

証跡パスを変える場合:

```bash
npm run release:check -- --source-status --format text
```

GitHubへ反映する前に、含めるファイル一覧を確認する場合:

```bash
npm run release:source-checklist
npm run release:source-status -- --details
```

`release:source-checklist` は `output/source-publication-checklist.md` に、確認項目と変更ファイル一覧を保存します。

Vercel本番に必要な環境変数名が実際に反映済みか、値を表示せずに確認する場合:

```bash
npm run release:vercel-status
npm run release:vercel-smoke
```

この確認はenv名だけを読み取り、`INSTALL_CODE_REGISTRY` / `WINDOWS_INSTALLER_URL` の不足と、旧 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` の残存を表示します。
`release:vercel-smoke` は本番URLの `/entry` と `/api/install-code/verify` に実リクエストを送り、導入コードAPIがruntimeで500になっていないことを確認します。導入コード実値は使わず、無効コードが `400 invalid` として返ることだけを確認します。

実値入りのVercel環境変数ファイルと、現地PCで取得したAI結合テスト証跡がある場合:

```bash
npm run release:check -- \
  --source-status \
  --env-file .env.production.local \
  --ai-receipt output/local-ai-integration-result.json
```

本番配布直前は、未確認項目も失敗扱いにします。

```bash
npm run release:check -- \
  --env-file .env.production.local \
  --ai-receipt output/local-ai-integration-result.json \
  --strict
```

`ok: true` は致命的な設定不備がない状態です。`ready: true` はローカル成果物、GitHub Actions上の配布artifact、Vercel本番env、AI結合証跡まで揃った状態です。macだけで開発している間は、Windowsインストーラー、GitHub Actions上の配布artifact、実AI結合が `pending` になるのが正常です。

JSON出力の `nextActions`、または `--format text` の「次の作業」に、未完了項目ごとの参照文書と実行コマンドが表示されます。

外部担当者へ渡す作業サマリをMarkdownで作る場合:

```bash
npm run release:handoff:full
```

既定では `output/release-handoff.md` に保存します。このコマンドは、ローカルGitの未commit/未push状態、GitHub Actions上のworkflow公開状況、最新run、artifact有無、現地AI結合証跡の状態をまとめて読み取り専用で追記します。この文書には秘密情報、Service Role Key、導入コード実値、患者情報を書きません。

出力先や証跡パスを変える場合:

```bash
npm run release:handoff -- --source-status --github-status --vercel-status
```

`--source-status` を付けると、ローカルGitの未commit/未push状態を件数中心で追記します。`--github-status` を付けると、GitHub Actions上のworkflow公開状況、最新run、artifact有無も読み取り専用で追記します。`--vercel-status` を付けると、本番Vercelに必要な環境変数名が存在するかを値なしで追記します。`--vercel-smoke` を付けると、本番Vercelの入口ページと導入コードAPIのruntime応答も追記します。

## 外部操作の明示承認

GitHub Actions実行やVercel Production環境変数の変更は、外部CI、Secrets、本番設定に触れるため、読み取り確認とは分けて明示承認する。

Codexなどの作業エージェントへ依頼する場合は、次のように具体的に許可する。

- `GitHub ActionsのWindowsインストーラーworkflowを実行してよい`
- `Vercel Production環境変数を更新してよい`

想定コマンド:

```bash
gh workflow run windows-installer.yml
vercel env rm VITE_SUPABASE_URL production
vercel env rm VITE_SUPABASE_ANON_KEY production
vercel env add INSTALL_CODE_REGISTRY production
vercel env add WINDOWS_INSTALLER_URL production
```

Vercelへ入れる導入コード実値、Service Role Key、トークンは、手順書やチャットに書かない。必要な値はVercel CLIの入力プロンプトなど安全な経路で設定する。

## Windowsでのインストーラー作成

```bash
npm ci
npm run dist:win
```

出力例:

```text
release/pharmacy-report-setup-0.1.0-x64.exe
release/pharmacy-report-setup-0.1.0-x64.exe.blockmap
```

`.blockmap` は対象インストーラーのファイル名に `.blockmap` が付いたものを一緒に保管します。`release/` 直下には配布対象の1世代分だけを置き、別バージョンの `.exe` や `.blockmap` が混ざっている場合、`release:check` は不完全な成果物として扱います。`release/win-unpacked/` 配下のアプリ本体exeは配布インストーラー成果物としては数えません。

インストーラーのファイル名には `package.json` の `version` が含まれている必要があります。バージョンを上げた後は、古いインストーラーを `release/` 直下に残さないでください。

## GitHub Actionsでの作成

`.github/workflows/windows-installer.yml` でWindowsインストーラーを作成できます。

まず、GitHub上に公開リリース用リポジトリがあるか、`RELEASES_GITHUB_TOKEN`、`WINDOWS_CSC_LINK`、`WINDOWS_CSC_KEY_PASSWORD` のSecret名、`AUTO_UPDATE_RELEASE_PUBLISH_ENABLED`、`LOCAL_CODE_SIGNING_ENABLED` のVariable名が設定されているか、workflowが公開されているか、最新runにインストーラーartifactがあるかを読み取り確認します。Secret/Variableは名前だけを確認し、値は表示しません。

```bash
npm run release:github-status
```

このコマンドはGitHubの状態を読むだけで、workflow実行やartifactダウンロードは行いません。workflowがまだデフォルトブランチに存在しない場合は、ローカル変更をcommit/pushまたはPR mergeしてから再実行します。

最新の成功runに `pharmacy-report-windows-installer` artifact がある場合、次のようなダウンロードコマンドが表示されます。

```bash
gh run download <run-id> -n pharmacy-report-windows-installer -D release
```

実行タイミング:

- `v*` タグをpushした時
- GitHub Actions画面から手動実行した時

CIで実行する内容:

1. Node.js 24をセットアップする。
2. `npm ci` で依存関係を復元する。
3. `npm run test:local-app` を実行する。
4. `npm run dist:win` でNSISインストーラーを作成する。
5. タグpushかつ自動更新公開フラグとコード署名フラグが有効な場合だけ、`npm run dist:win:publish` で公開リリース用リポジトリへ `latest.yml` とインストーラーを公開する。
6. `node --test tests/preUpdateBackupCommand.test.mjs` で更新前バックアップCLIのWindows上スモークを実行する。
7. `npm run release:check -- --format text` を実行し、`release/release-readiness.txt` を作成する。
8. `release/*.exe`、`release/*.blockmap`、`release/release-readiness.txt` をartifactとして保存する。

コード署名する場合は、GitHub Secretsへ次を設定します。

- `WINDOWS_CSC_LINK`
- `WINDOWS_CSC_KEY_PASSWORD`

## Windowsログイン時の自動起動

Windowsパッケージ版は、通常起動時にElectronのLogin Item設定を有効化します。これによりPC再起動後、Windowsログイン時にローカルアプリが起動し、ローカルDB、ローカルAPI、AI状態確認が戻ります。

検証や管理上の理由で一時的に無効化する場合は、起動環境に `LOCAL_DISABLE_WINDOWS_AUTO_LAUNCH=1` を設定します。mac開発環境、未パッケージのElectron起動、更新前バックアップCLIではLogin Item設定を変更しません。

## アップデート前バックアップ

更新配布側から、インストール済みアプリをCLIモードで呼びます。ウィンドウは開かず、SQLite暗号化バックアップを作成してJSONを標準出力へ返します。

```powershell
.\scripts\windows_pre_update_backup.ps1 `
  -AppPath "C:\Users\<user>\AppData\Local\Programs\pharmacy-report\在宅報告アプリ.exe" `
  -ToVersion "0.2.0"
```

アプリ本体を直接呼ぶ場合:

```powershell
& "C:\Users\<user>\AppData\Local\Programs\pharmacy-report\在宅報告アプリ.exe" `
  --pre-update-backup `
  --to-version "0.2.0"
```

必要に応じて `--db-path`、`--backup-dir`、`--google-drive-folder` を指定できます。指定しない場合はアプリ既定のローカルDB/バックアップ先を使います。

## コード署名

初期検証では未署名ビルドでも動作確認できます。本番配布ではWindowsコード署名証明書を使います。

署名用の秘密情報はリポジトリへ置かず、CIまたはビルドPCの安全な保管場所から渡します。

代表的な環境変数:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

GitHub Actionsでは、上記に対応するSecretsとして `WINDOWS_CSC_LINK` と `WINDOWS_CSC_KEY_PASSWORD` を使います。

自動更新の本番有効化はコード署名が有効になってから行います。GitHub Actionsで公開リリースへ出す場合は、次を設定します。

- `RELEASES_GITHUB_TOKEN`: 公開リリース用リポジトリへ書き込めるトークン
- `AUTO_UPDATE_RELEASE_PUBLISH_ENABLED=1`: GitHub Actions Variables
- `LOCAL_CODE_SIGNING_ENABLED=1`: GitHub Actions Variables

アプリ本体側の自動更新確認も、実行環境で `LOCAL_AUTO_UPDATE_ENABLED=1` と `LOCAL_CODE_SIGNING_ENABLED=1` が揃うまで無効です。

## アップロード

インストーラーURLを確定したら、Vercel本番環境変数へ設定します。

```bash
vercel env add WINDOWS_INSTALLER_URL production
```

`release:check --env-file` では、`WINDOWS_INSTALLER_URL` のURL末尾ファイル名が `release/` 直下のインストーラー実物と一致しているかも確認します。

導入コード管理表も更新します。

```bash
vercel env add INSTALL_CODE_REGISTRY production
```

Supabase台数自動加算を使う場合は、次も設定します。

```bash
vercel env add INSTALL_CODE_USAGE_SUPABASE_URL production
vercel env add INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY production
vercel env add INSTALL_CODE_USAGE_TABLE production
```

## 確認

- Vercel入口ページで導入コードを確認できる。
- 「Windows版をインストール」ボタンがインストーラーURLへ遷移する。
- インストール後、`pharmacy-report://open` でローカルアプリを起動できる。
- ローカルヘルスAPIが `127.0.0.1:47831` などの候補ポートで応答する。
- 初回起動時にローカルDB、1日1回の自動バックアップ、薬局キーが作成される。
- Windows再ログイン後にローカルアプリが自動起動し、Vercel入口から接続確認できる。
- 更新前に `--pre-update-backup` または `windows_pre_update_backup.ps1` でアップデート前バックアップが作成される。
- コード署名有効化後は、旧バージョンを入れたWindows実機で、公開リリース作成、アプリ終了時更新、更新前バックアップ、DB無傷を確認する。
