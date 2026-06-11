# Vercel本番環境変数

## 方針

Vercelアカウントは管理者だけが扱います。利用者にはVercelログイン情報を共有せず、入口URLと導入コードだけを渡します。

## 必須

### `INSTALL_CODE_REGISTRY`

導入コード管理表です。JSON文字列で設定します。

本番では、有効な導入コードを最低1件含め、各有効コードに `maxDevices` を必ず設定します。これにより、設定ミスで無制限にインストーラーを配布する状態をリリース前チェックで止めます。

有効な導入コードに `expiresAt` を設定する場合、期限切れのコードは本番投入前チェックで失敗します。使わないコードは `disabled: true` にするか、管理表から削除します。

例:

```json
{
  "codes": [
    {
      "code": "ABCD-1234",
      "label": "サンプル薬局",
      "expiresAt": "2026-12-31",
      "maxDevices": 3,
      "installerUrl": "https://example.com/pharmacy-report-setup-0.1.0-x64.exe",
      "disabled": false
    }
  ]
}
```

### `WINDOWS_INSTALLER_URL`

Windowsインストーラーの配布URLです。導入コード側に `installerUrl` がない場合の既定値になります。

URLは `https://` で始まり、URLパスの末尾が `.exe` で終わるインストーラーファイルへの直リンクにします。ダウンロード案内ページやフォルダURLは本番投入前チェックで失敗します。

`INSTALL_CODE_REGISTRY` の各コードに個別の `installerUrl` を設定する場合も、`release/` 直下に置いた配布対象 `.exe` と同じファイル名にします。古いバージョンのURLが残っている場合、`release:check --env-file` で失敗します。

## 任意

Supabaseで導入台数を自動加算する場合に設定します。

### `INSTALL_CODE_USAGE_SUPABASE_URL`

導入台数管理用SupabaseプロジェクトURLです。

### `INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY`

Vercel Functionだけで使うService Role Keyです。ブラウザへ公開しません。

### `INSTALL_CODE_USAGE_TABLE`

導入台数管理テーブル名です。省略時は `install_code_devices` です。

## 旧Supabase版envの撤去

ローカル一本化後のアプリ本体では、患者データ用のSupabase接続を使いません。旧Web版で使っていた次のVercel本番envが残っている場合は撤去します。

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`INSTALL_CODE_USAGE_SUPABASE_*` は導入コード台数管理用で、患者データを含まないため任意で残せます。`VITE_SUPABASE_*` とは用途が違います。

## 入口URLとローカルアプリCORS

Vercel入口を `*.vercel.app` のURLで使う場合、ローカルアプリ側の追加設定は不要です。ローカルヘルスAPIは標準でVercelドメイン、localhost、127.0.0.1からの接続確認だけを許可します。

独自ドメインを入口URLにする場合は、Windowsアプリの起動環境に次を設定します。これはVercel環境変数ではなく、ローカルアプリ側の実行時設定です。

```text
LOCAL_HEALTH_ALLOWED_ORIGINS=https://report.example.com
```

複数ある場合はカンマ区切りにします。

ローカルヘルスAPIのポート候補は標準で `47831,47832,47833` です。管理上の理由で変更する場合は、ローカルアプリ側の `LOCAL_APP_PORT_CANDIDATES` と、入口ページ側の `VITE_LOCAL_APP_PORT_CANDIDATES` を同じ値に揃えます。通常配布では変更しません。

## 設定コマンド

実値をVercelへ入れる前に、ローカルで構文を確認します。

```bash
INSTALL_CODE_REGISTRY='{"codes":[{"code":"ABCD-1234","maxDevices":3}]}' \
WINDOWS_INSTALLER_URL='https://example.com/pharmacy-report-setup-0.1.0-x64.exe' \
npm run verify:vercel-env
```

`.env.production.local` などに一時保存して確認する場合:

```bash
npm run verify:vercel-env -- --env-file .env.production.local
```

検査結果にはService Role Keyや導入コード値などの秘密値は出しません。導入コード管理表のエラーは `INSTALL_CODE_REGISTRY.codes[0]` のように位置で表示します。

導入コード管理表と検査用envファイルを作る場合:

```bash
npm run create:install-codes -- \
  --label "サンプル薬局" \
  --max-devices 3 \
  --expires-at 2026-12-31 \
  --installer-url https://example.com/pharmacy-report-setup-0.1.0-x64.exe
```

既定では次の2ファイルを `output/` に作成します。

- `output/install-code-registry.generated.json`
- `output/.env.production.local.generated`

`output/` はgit管理対象外です。生成した導入コード実値は利用者へ配布する秘密値として扱い、チャットやリポジトリへ貼り付けないでください。

リリース前の総合確認へ含める場合:

```bash
npm run release:check -- --env-file .env.production.local
```

```bash
vercel env add INSTALL_CODE_REGISTRY production
vercel env add WINDOWS_INSTALLER_URL production
```

Supabase台数管理を使う場合:

```bash
vercel env add INSTALL_CODE_USAGE_SUPABASE_URL production
vercel env add INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY production
vercel env add INSTALL_CODE_USAGE_TABLE production
```

## 確認

```bash
vercel env ls
npm run verify:vercel-env -- --env-file .env.production.local
vercel deploy --prod
```

`verify:vercel-env` は `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` が残っている場合に警告を出します。

本番反映後:

- `npm run release:vercel-status` で `INSTALL_CODE_REGISTRY` / `WINDOWS_INSTALLER_URL` がProductionに存在し、旧 `VITE_SUPABASE_*` が残っていない。
- `/entry` で導入コードを入力できる。
- 正しい導入コードで「Windows版をインストール」が有効になる。
- 台数上限に達した新規端末は拒否される。
- 登録済み端末の再確認は重複加算されない。
