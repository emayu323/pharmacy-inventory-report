# codex実装指示書 v2: pharmacy-inventory-report

作成日: 2026-06-11
対象: https://github.com/emayu323/pharmacy-inventory-report （main, 調査時点）
位置づけ: リポジトリ実態を調査済みのため、v1にあった「リポジトリ調査タスク」は不要。本書は**現状からの差分タスク**を定義する。`docs/local-first-requirements.md` が業務仕様の正本。本書と矛盾する場合は作業を止めて質問すること。

---

## 0. 現状認識（前提として共有）

このリポジトリは旧実装計画をElectronベースでほぼ実装済みである。以下は**完成済み・品質良好**であり、原則手を入れない。

- 残薬計算（`src/medicationCalculations.ts`）: 薬剤ごとの「いつまで分」引き継ぎ、実残日数上書き（理由欄付き）、全体最短算出。テスト有り
- ローカルDB（`electron/localDatabase.mjs`）: node:sqlite、schema_migrations、WAL、論理削除、報告書スナップショット
- 暗号化バックアップ（日次/手動/更新前）、薬局キー控えTSV台帳
- PINロック、BitLocker状態チェック（`localSecurityStatus.mjs`）
- 定型文、患者マスタ3択同期（`reportPatientMasterSync.ts`）、自動保存、印刷2枚警告
- 薬剤マスタ取込（Shift_JIS→generated JSON、`scripts/build_drug_master.js`）
- NSISインストーラ + GitHub Actions（`windows-installer.yml`）
- AI下書き: テキスト→主訴等/服薬指導内容の振り分け、Ollama不在時のルールベースフォールバック、追記/置換/キャンセルUI

## 1. 方針転換（オーナー決定済み・本書の主目的）

| # | 決定 | 旧実装との差分 |
|---|------|----------------|
| D-1 | **シェルはElectronを正式採用**（Tauri移行はしない） | 現状維持を追認 |
| D-2 | **録音機能を全廃する** | MediaRecorder・Whisper連携・録音設定を削除 |
| D-3 | AI入力は**テキストの「訪問メモ」欄のみ** | 既存のtranscriptテキスト経路を訪問メモとして再定義 |
| D-4 | Ollamaは当面継続（自薬局運用フェーズ）。llama.cpp同梱化は横展開フェーズの課題として保留 | 現状維持＋ルールベースフォールバック必須維持 |
| D-5 | アプリ内の**Supabaseモードを完全削除**（ローカル一本化） | 二重経路の解消 |
| D-6 | Vercel↔localhostブリッジは**凍結**（削除はしないが新規投資禁止。主導線はデスクトップショートカット） | ドキュメント上の主導線を変更 |
| D-7 | 導入コードのVercel API + Supabase利用記録ストアは存続可（患者データを含まないため） | 現状維持 |
| D-8 | 帳票は**HTML印刷（react-to-print）を継続**。PDF生成への置き換えはしない | 現状維持を追認 |

## 2. タスクA: 録音全廃と「訪問メモ」化（最優先）

1. `src/pages/ReportEdit.tsx` から MediaRecorder/getUserMedia、録音開始・一時停止・停止UI、録音エラー処理を削除する
2. `electron/localAiDraftService.mjs` の `createAiDraftFromAudio` と `transcribeAudio`、`localAiEnvironment.mjs` のWhisperプローブ（`probeWhisper`、`whisperHealthUrl` 等）を削除する。`ready` 判定はOllamaと容量のみで構成し直す
3. `src/pages/Settings.tsx` の「患者会話録音を使う」トグルと関連注意文を削除する
4. 既存のtranscriptテキストエリアを「訪問メモ」に改名する。placeholder例:「訪問内容のメモ。Windowsの音声入力（Win+H）でも入力できます」
5. `ai_save_transcript_enabled` 等の音声/文字起こし保存設定を「訪問メモは報告書とともに常に保存」へ単純化する（メモはテキストなので保存して良い。要件書§17の音声非保存規定は録音廃止により対象消滅）
6. `aiSetupGuide.ts`・セットアップ画面からWhisper導入手順を削除し、Ollama＋モデルのみの案内にする
7. 関連テスト（`localAiDraftService.test.mjs`、`localAiEnvironment.test.mjs`、`aiSetupGuide.test.ts` 等）を新仕様に更新。`test:local-ai-audio` スクリプトを削除し、`test:local-ai-text` を正式経路にする
8. 完了条件: 録音関連コード・設定・文言がゼロ。訪問メモ→下書き生成→項目別プレビュー→反映が、Ollama有り/無し（ルールベース）双方で動作

## 3. タスクB: Supabaseモードの完全削除

対象: アプリ側のみ。`api/install-code/` のSupabase利用記録ストアは**対象外**（存続）。

1. `src/patientRepository.ts` / `reportRepository.ts` / `institutionRepository.ts` / `templateRepository.ts` 等から `'supabase'` ストレージモード分岐を削除し、ローカル（nativeBridge）一本にする
2. `src/supabase.ts`、`src/contexts/AuthProvider.tsx`・`authContext.ts`、`src/pages/Login.tsx`、`src/authMode.ts` のSupabase認証経路を削除（ローカルPIN認証に一本化）
3. `@supabase/supabase-js` をアプリ依存から外す（`api/` 側で必要ならVercel関数側の依存として分離）
4. ルート直下の `supabase_*.sql`（27本）と `scripts/upload_drugs.js` 等のSupabase用スクリプトを `legacy/` へ移動（削除はしない。参照資料として保持）
5. 完了条件: アプリ本体のビルド成果物にSupabase URL/キー/SDKが一切含まれない。`grep -r supabase src/ electron/` がヒットゼロ（コメント除く）

## 4. タスクC: 凍結・確認・小修正

1. **ブリッジ凍結**: `localAppConnection.ts`・`local_health_service.js`・`EntryPortal.tsx` は現状維持。バグ修正以外の変更禁止。`docs/` とマニュアルの主導線記述を「デスクトップショートカットから起動」に改める
2. **15分無操作ロック**: `LocalPinLock` にアイドルタイマーが実装済みか確認。なければ追加（要件書§5）
3. **ケアマネ未登録警告**: ケアマネ宛出力時の警告＋今回限り一時入力（要件書§8）の実装有無を確認。なければ追加
4. **自動更新**: タスクDとして実施（下記）
5. **BitLocker警告の扱い**: BitLocker無効端末での起動時に警告表示があるか確認。なければ「警告表示＋利用は可能」で追加（ブロックはしない）
6. **コード署名**: 現状未署名（`identity: null` / SmartScreen警告が出る状態）。署名導入はオーナーの証明書取得待ち。CIに署名ステップのプレースホルダだけ用意

## 4.5 タスクD: 自動更新（electron-updater）

目的: 利用者のPCを個別に触らずに全端末を更新できるようにする。オーナーの更新作業は「タグを打ってリリース公開」のみとする。

1. `electron-updater` を導入し、起動時に更新確認→バックグラウンドダウンロード→終了時インストール（quitAndInstall）とする。利用者への表示は「新しいバージョンを準備しました。アプリ終了時に更新されます」程度の控えめな通知のみ
2. 更新インストール直前に既存の `preUpdateBackupCommand` を必ず実行する（バックアップ失敗時は更新を中断し、次回起動時に再試行）
3. 配布チャネル: ソースは現Privateリポジトリのまま、**リリース成果物専用の公開リポジトリ**（例: `emayu323/pharmacy-report-releases`）を新設し、CIからそこへ `latest.yml`＋インストーラを公開する。electron-builderの `publish` 設定をこの公開リポに向ける
4. CI（`windows-installer.yml`）にタグpush時の自動公開ステップを追加する
5. Settings画面に「現在のバージョン / 更新を確認」表示を追加する
6. **コード署名が有効になるまで、自動更新の本番有効化はしない**（フラグで無効化しておく）。署名はAzure Trusted Signing想定でCIに署名ステップを実装し、証明書情報はGitHub Secretsから注入する
7. 完了条件: 旧バージョンを入れたWin実機で、リリース公開→自動更新→更新前バックアップ生成→DBとデータ無傷、までが通ること

## 5. 実装ルール（継続）

- 既存の `RULES.md` に従う（修正後の自動検証必須、ビルド成功だけで完了としない）
- 計算ロジック・スナップショット・バックアップ復元に触れる場合はテスト先行
- 患者情報をログ・エラー出力・実名テストデータに含めない
- 外部ネットワークアクセスはOllama(127.0.0.1)・モデルDL・導入コード検証・更新確認以外に追加しない
- スキーマ変更は `schema_migrations` のバージョンを上げ、旧DBからの自動移行をテストする
- 各タスク完了時に動作確認手順を `docs/verify-*.md` に残す

## 6. 着手順序

1. タスクA（録音全廃・訪問メモ化）
2. タスクB（Supabase削除）
3. タスクC（凍結・確認・小修正）
4. タスクD（自動更新。本番有効化は署名取得後）
5. 全テスト（`npm run test:local-app`）緑化 → Winインストーラビルド → 実機スモーク

## 7. 質問すべき未確定事項

1. Ollamaの既定モデル名（`LOCAL_OLLAMA_MODEL` の既定値。オーナーがGemma系/Qwen系を比較中）
2. 訪問メモのスマホ→PC受け渡し（初期版は運用対応の想定。アプリ側対応は保留で良いか）
3. コード署名の取得状況（Azure Trusted Signing想定。Secrets設定はオーナー作業）
4. リリース公開用リポジトリの名称
5. EntryPortal/ブリッジを将来削除するか、凍結のまま残すか
