# Windows実機スモーク証跡

## 目的

`codex-implementation-brief-v3.md` の最終条件である、Windows実機でのインストール、起動、保存、印刷、バックアップ、自動更新後のデータ保持を、リリース判定に含めるための証跡手順です。

mac開発環境やGitHub Actionsでは代替できないため、署名Secret設定後の本番配布直前に、対象Windows PCで確認します。

## 実行前提

- GitHub ActionsのWindowsインストーラーartifactが最新ソース由来である。
- `RELEASES_GITHUB_TOKEN`、`WINDOWS_CSC_LINK`、`WINDOWS_CSC_KEY_PASSWORD` が設定済みである。
- 公開リリース用リポジトリに `latest.yml` とインストーラーが公開され、自動更新が有効である。
- テスト用データには実患者名、実住所、実FAX番号、実薬剤名を使わない。

## 確認項目

1. Windows版インストーラーを実行し、インストールが完了する。
2. デスクトップショートカットから起動できる。
3. ローカルヘルスAPIがreadyになる。
4. ローカルDBが作成または既存DBを読める。
5. PINロック画面が表示され、解除できる。
6. テスト用報告書を作成し、保存後に再表示できる。
7. 印刷プレビューまたは印刷ダイアログを開ける。
8. 手動バックアップを作成できる。
9. Windowsログイン時の自動起動設定が有効になる。
10. 旧バージョンから新バージョンへの自動更新が完了する。
11. 自動更新前バックアップが作成される。
12. 更新後もDBと保存済みテストデータが残っている。

## 証跡作成

確認後、Windows実機上で次を実行します。

```bash
npm run create:windows-smoke-receipt -- --all-confirmed
```

このコマンドは `output/windows-target-smoke-result.json` を作成します。Windows以外では通常作成できません。本文、患者名、薬剤名、導入コード実値、秘密情報は保存しません。

出力形式:

```json
{
  "created_at": "2026-06-11T12:00:00.000Z",
  "app_version": "0.1.0",
  "source_revision": "CURRENT_GIT_SHA_40_CHARS",
  "platform": "win32",
  "ok": true,
  "ready": true,
  "checks": {
    "installer_installed": true,
    "desktop_shortcut_launch": true,
    "local_health_ready": true,
    "local_db_ready": true,
    "pin_lock_ready": true,
    "report_save": true,
    "print_preview": true,
    "backup_create": true,
    "windows_auto_launch_enabled": true,
    "pre_update_backup_created": true,
    "auto_update_completed": true,
    "data_intact_after_update": true
  }
}
```

`source_revision` は、配布元ソースの40文字SHAです。通常はCLIが自動取得します。確認する場合:

```bash
git rev-parse HEAD
```

## リリース判定

証跡保存後に実行します。

```bash
npm run release:check:full
npm run release:check:full:strict
```

証跡がない場合、`Windows target PC smoke receipt` は `pending` になります。証跡が不完全、ソース不一致、または個人情報らしいフィールドを含む場合は `fail` になります。
