# 導入コード台数管理

## 概要

`api/install-code/verify.ts` は、環境変数の導入コード管理表でコードを確認します。追加でSupabaseの管理テーブルを設定すると、導入ページで自動生成した端末IDを登録し、利用台数を自動加算します。

Supabase未設定の場合は従来どおり、`INSTALL_CODE_REGISTRY` の `usedDevicesCount` または `usedDevices` を管理者が手動更新します。

## Vercel環境変数

必須:

- `INSTALL_CODE_REGISTRY`
- `WINDOWS_INSTALLER_URL`

台数自動加算を使う場合:

- `INSTALL_CODE_USAGE_SUPABASE_URL`
- `INSTALL_CODE_USAGE_SUPABASE_SERVICE_ROLE_KEY`
- `INSTALL_CODE_USAGE_TABLE`

`INSTALL_CODE_USAGE_TABLE` を省略した場合は `install_code_devices` を使います。

## Supabase SQL

```sql
create table if not exists install_code_devices (
  code text not null,
  device_id text not null,
  label text,
  first_verified_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  primary key (code, device_id)
);

create index if not exists idx_install_code_devices_code
  on install_code_devices (code);
```

Vercel FunctionからはService Role Keyでアクセスします。ブラウザにはService Role Keyを公開しません。

## 端末ID

導入ページはブラウザの `localStorage` に匿名の端末IDを保存し、導入コード確認時に送信します。同じPC/同じブラウザから再確認した場合は同一端末として扱います。

## 上限判定

- 新しい端末で `maxDevices` に達している場合は拒否します。
- 登録済み端末が再確認する場合は、上限到達後でも有効として扱います。
- Supabase確認に失敗した場合は、導入コードを有効扱いにせず `usage_store_error` を返します。
