# ローカルファースト版 実装計画

作成日: 2026-06-10

## 1. 実装方針

既存のVite + React + TypeScriptアプリを土台に、Supabase前提のWebアプリから、Windowsローカルアプリ + ローカルDB + Vercel入口の構成へ段階的に移行する。

初期実装では、業務本体である報告書作成、保存、印刷、バックアップを優先する。AIモードは通常機能を壊さない補助機能として後段で追加する。

## 2. 推奨技術構成

- UI: 既存React/Viteを継続
- Windowsローカルアプリ: Electron
- ローカルDB: SQLite
- ローカルAPI/DBアクセス: デスクトップアプリ側のバックエンド
- AI補助: Ollamaローカル実行。初期版は訪問メモのテキスト入力のみ。
- ローカルLLM: Ollama
- 配布入口: Vercel
- バックアップ: 暗号化ZIPまたは暗号化DBエクスポート

Electronを正式採用する。既存React資産を流用し、Windowsインストーラー、自動起動、ローカルプロセス管理、ファイル操作、印刷、アップデート配布をElectron側で扱う。

帳票はHTML印刷を継続する。医療機関向け/ケアマネ向けの2通出力、A4レイアウト再現性、印刷ダイアログ制御はElectronと `react-to-print` の組み合わせで検証する。

ローカルDB本体の暗号化は、SQLCipher採用またはBitLocker有効化を導入要件にする案を比較する。初期版では少なくともBitLocker有効化を導入チェック項目に入れる。

## 3. フェーズ1: 仕様固定と現行資産整理

目的:

- 現行Supabase版のどの機能を残すかを明確にする。
- 既存帳票項目を削らない前提で、ローカル版のデータモデルへ落とす。

作業:

- `docs/local-first-requirements.md` を正仕様として扱う。
- 旧仕様である `docs/requirements.md` と `docs/deployment_manual.md` はSupabase版の参考資料として残す。
- 現行 `ReportPrint.tsx` の帳票項目をローカル版の帳票仕様へ対応付ける。
- 現行 `Report`, `Patient`, `Institution`, `MedicationCheckItem` 型をローカルDB向けに再定義する。

完了条件:

- ローカル版で必要なテーブル、画面、帳票項目、初期対象外が明文化されている。

## 4. フェーズ2: ローカルDB基盤

目的:

- Supabaseなしで患者、関係機関、報告書、薬剤リスト、定型文を保存できるようにする。

作業:

- SQLiteスキーマを作成する。
- 全テーブルに `id`, `created_at`, `updated_at`, `deleted_at` を持たせる。
- 報告書には作成時点の患者情報、宛先、報告元、薬剤情報、計算結果、訪問日時点年齢のスナップショットを保存する。
- 論理削除を実装する。
- 自動保存/手動保存の保存状態をUIに出す。
- ローカルPIN設定、15分無操作ロック、再開時PIN入力を実装する。
- 報告書保存時に患者情報/宛先の差分がある場合、「今回だけ変更」「患者マスタにも反映」「キャンセル」を選ばせる。
- ケアマネ未登録でも患者登録できるようにし、ケアマネ向け出力時だけ警告と今回報告書への一時入力を出す。
- 既存のSupabase呼び出しをローカルDBリポジトリ層へ置き換える。

現行先行実装:

- Electron起動時に `electron/localDatabase.mjs` がSQLiteファイルを作成し、患者、関係機関、報告書、報告書薬剤、定型文、薬剤マスタ、設定、バックアップ、マイグレーション管理テーブルを初期化する。
- ElectronのヘルスAPIはSQLite初期化に失敗した場合 `db_preparing` として応答する。
- Electron環境では、患者マスタの一覧/詳細読込/登録/更新を `electron/localPatientRepository.mjs` とIPC経由でSQLiteへ保存する。
- Electron環境では、報告書の保存/読込/前回取得/患者別履歴/次回訪問予定取得を `electron/localReportRepository.mjs` とIPC経由でSQLiteへ保存する。前回取得は作成日時ではなく訪問日降順を優先し、同一訪問日の場合のみ作成日時で判定する。
- Electron環境では、患者と報告書の削除は `deleted_at` を入れる論理削除とし、削除済み一覧と復元APIをIPC/Preload/Repository経由で呼び出せるようにする。患者詳細画面から患者/報告書を復元可能な形で削除でき、設定画面の削除済みデータ一覧から復元できる。通常の一覧、詳細、前回取得、予定取得からは削除済みを除外する。
- 報告書は `reports.payload_json` を再表示・再印刷用の完全スナップショットとし、患者ID、訪問日、次回訪問日、最短「いつまで分」など検索に必要な列を併せて保存する。
- 報告書内の定期薬/その他薬剤は `report_medications` に展開し、将来の検索・帳票補助に使える形で保持する。
- Electron環境では、関係機関の一覧/詳細読込/名称検索/保存/論理削除を `electron/localInstitutionRepository.mjs` とIPC経由でSQLiteへ保存する。
- Electron環境では、定型文の一覧/保存/論理削除を `electron/localTemplateRepository.mjs` とIPC経由でSQLiteへ保存する。
- Electron環境では、薬局設定、Google Drive同期フォルダ、PINロック設定/確認/解除を `electron/localAppSettingsRepository.mjs` とIPC経由でSQLiteへ保存する。
- Electron環境のPINは、Node側でsalt付きSHA-256ハッシュ化し、平文PINをDBに保存しない。
- 報告書の保存/読込/前回取得/予定取得は `src/reportRepository.ts` を経由する。
- 患者の一覧/登録/詳細読込/更新/完了切替は `src/patientRepository.ts` を経由する。
- 関係機関の一覧/詳細読込/保存/削除/名称検索は `src/institutionRepository.ts` を経由する。
- 定型文の一覧/保存/削除は `src/templateRepository.ts` を経由する。
- 薬局情報、Google Drive同期フォルダ、PINロック設定は `src/appSettingsRepository.ts` を経由する。
- PINは平文保存せず、salt付きSHA-256ハッシュを保存する。
- `ReportEdit.tsx` は入力変更時に「未保存あり」、保存中に「保存中」、失敗時に「保存失敗」を表示する。
- `ReportEdit.tsx` は患者氏名、生年月日、性別、訪問日、担当薬剤師が揃った報告書を2秒デバウンスで自動保存する。新規報告書は初回自動保存後のIDを保持し、以後は同じ下書きを更新する。同一内容の重複保存はfingerprintで避ける。
- `src/reportPatientMasterSync.ts` で報告書入力と患者マスタの差分を検出し、保存時に差分がある場合は「今回だけ変更」「患者マスタにも反映」「キャンセル」の3択を表示する。
- 「患者マスタにも反映」を選んだ場合だけ `src/patientRepository.ts` 経由で患者マスタの氏名、生年月日、性別、医療機関、主治医、居宅介護支援事業所、ケアマネージャー、薬局名を更新する。報告書スナップショットは保存済み内容を維持する。
- 前回報告書コピー時は固定情報と薬剤リストを引き継ぎ、主訴等、服薬指導内容、その他伝達事項、次回訪問予定日、申し送り事項、AI訪問メモは空にする。
- ケアマネ向け印刷時に居宅介護支援事業所または事業所FAXが未入力なら、印刷を止めて基本情報欄を開き、今回報告書だけの一時入力または患者マスタ反映を選べる導線にする。
- Web先行実装では `src/components/LocalPinLock.tsx` が起動時ロックと無操作ロックを担当する。
- Web先行実装では `src/localBackupRepository.ts` が `localStorage` 上の患者、関係機関、報告書、定型文、設定をパスワード付きAES-GCM暗号化JSONとして作成/復元する。
- アプリ本体はローカル保存のみとし、Electron環境ではSQLite、mac開発デモなどブラウザ単体では `localStorage` を使う。
- `localStorage` はブラウザ開発デモ用であり、本番の正本DBとは扱わない。
- ローカルデモ起動例: `npm run dev -- --host 127.0.0.1 --port 5174`

主要テーブル候補:

- `patients`
- `institutions`
- `reports`
- `report_medications`
- `patient_medications`
- `drug_master`
- `templates`
- `settings`
- `backups`

完了条件:

- ネットなしで患者登録、報告書作成、保存、再表示ができる。
- 過去報告書がスナップショットとして再印刷できる。

## 5. フェーズ3: 薬剤マスタ取り込み

目的:

- 支払基金の医薬品マスターから薬剤名、カナ名、単位だけを取り込み、薬剤検索に使う。

作業:

- `src/data/y_ALL20260522.csv` を取り込み元として使う。
- CSVの必要列を抽出する。
  - 薬剤名: 医薬品名・規格名
  - カナ名
  - 単位
- ローカルDBの `drug_master` に登録する。
- 薬剤名、カナ名で検索できるようにする。
- マスタ外薬剤の自由入力を許可する。
- Shift_JIS/CP932を正しく読み込む。
- 薬剤名、カナ名の検索用正規化を実装する。全角/半角、長音、大小かな、スペース差異を吸収する。
- アプリ内の「薬剤マスタ更新」ボタンで新しい支払基金CSVを取り込めるようにする。
- マスタ更新前に既存マスタを退避し、失敗時に戻せるようにする。

注意:

- 薬価、後発品区分、経過措置、HOT/JANは初期版では使わない。
- 旧 `scripts/upload_drugs.js` はSupabaseアップロード用のため `legacy/supabase/scripts/` に退避し、ローカルDB取り込みは別スクリプトで扱う。

完了条件:

- 薬剤名検索から薬剤名と単位を選択できる。
- 自由入力薬剤も患者薬剤リストに保存できる。

現行Web版での先行実装:

- `scripts/build_drug_master.js` で `src/data/y_ALL20260522.csv` から `src/data/drug-master.generated.json` を生成する。
- `src/drugMaster.ts` が生成JSONを動的に読み込み、薬剤名/カナ名のローカル検索を行う。
- Electron起動時は `src/data/drug-master.generated.json` を `drug_master` テーブルへ初回取り込みし、以後はSQLiteから検索する。
- Electron環境では、薬剤名/カナ名検索を `electron/localDrugMasterRepository.mjs` とIPC経由でSQLiteへ問い合わせる。
- SQLite取り込み時に検索用正規化文字列を保存し、全角/半角、長音、大小かな、スペース差異を吸収する。
- Electron環境では、設定画面の「CSVを選択して更新」から支払基金CSVを選択し、Shift_JIS/CP932として読み込んで `drug_master` を更新する。
- 薬剤マスタ更新は1トランザクションで実行し、取り込み可能行がない場合や途中失敗時は既存マスタを残す。
- 支払基金マスタに該当する候補がある場合は外部DBへ問い合わせない。
- 臨時薬・その他では、薬剤候補選択時にマスタ単位を自動入力する。
- ローカルDB版では、この検索APIの裏側をSQLite `drug_master` に差し替える。

## 6. フェーズ4: 薬剤管理と「いつまで分」計算

目的:

- 定期薬とその他薬剤を分け、定期薬の合計残日数と最短「いつまで分」を計算する。

作業:

- 薬剤区分を `regular` / `other` として保存する。
- 標準処方日数を報告書全体で入力できるようにする。
- 14日、21日、28日のクイック選択を用意する。
- 薬剤ごとの処方日数上書きを可能にする。
- 前回報告書から薬剤ごとの「いつまで分」を引き継ぐ。
- 薬剤ごとの前回「いつまで分」と今回訪問日から前回残日数を計算する。
- 前回に存在しない薬剤、前回「いつまで分」未登録の薬剤、今回訪問日より前に切れている薬剤は前回残0日とする。
- 患者宅で確認した実残日数を薬剤ごとに手動上書きできるようにする。
- 実残日数で上書きした場合は、理由メモを任意で残せるようにする。
- 薬剤ごとの今回合計残日数と「いつまで分」を計算する。
- 定期薬全体の最短「いつまで分」を計算する。

帳票:

- 定期薬は薬剤名 + 今回の合計残日数を表示する。
- 定期薬全体の最短「いつまで分」を1箇所表示する。
- その他薬剤は薬剤名、数量/単位、備考を1行ずつ表示する。

完了条件:

- 前回報告書から薬剤リストを引き継ぎ、今回の残日数計算ができる。
- 計算値と実残日数上書きの両方を扱える。
- 帳票に指定形式で薬剤情報が出る。

## 7. フェーズ5: 帳票/印刷

目的:

- 既存帳票項目を維持しつつ、A4 1枚原則の帳票へ整える。

作業:

- 既存 `ReportPrint.tsx` を新仕様へ調整する。
- 医療機関向け/ケアマネ向けで宛名とFAX番号だけ切り替える。
- 2通まとめて印刷できるようにする。
- A4 1枚を原則とし、薬剤情報で超過する場合は2枚目を許可する。
- 印刷前にページ数超過の可能性を表示する。
- PDF保存は任意とする。

完了条件:

- 医療機関向けとケアマネ向けの2通を出力できる。
- 定期薬が多い場合も情報を削らず出力できる。

現行Web版での先行実装:

- `src/reportPrintModel.ts` で、医療機関向け/ケアマネ向け/2通まとめての印刷対象を解決する。
- 医療機関向けとケアマネ向けは本文を共通にし、`ReportPrint.tsx` で宛名、TEL、FAXだけを宛先別に切り替える。
- `ReportEdit.tsx` に印刷対象の切替（2通/医療機関/ケアマネ）を追加する。
- ケアマネ向け出力時に居宅介護支援事業所またはFAXが未入力なら、印刷前の確認警告を表示する。
- 報告書の基本情報に、今回報告書だけの一時入力として居宅介護支援事業所、事業所TEL、事業所FAX、ケアマネージャーを入力できる。
- 薬剤数または本文量が多い場合、印刷前に「1通あたり2枚になる可能性」を表示する。
- 年齢は印刷時の現在日ではなく、訪問日時点の `patient_age_at_visit` として保存・表示する。
- 2通まとめて印刷する場合、1通目の後で改ページする。

## 8. フェーズ6: 定型文

目的:

- 薬局共通の定型文を使い、入力を速くする。

作業:

- `templates` テーブルを作る。
- 対象項目を固定する。
  - 服薬状況
  - 保管状況
  - 主訴等
  - 服薬指導内容
  - その他伝達事項
- 定型文の登録、編集、削除、選択を実装する。
- 入力欄への追記/置換を選べるようにする。

完了条件:

- 報告書作成画面から定型文を選び、対象欄へ反映できる。

## 9. フェーズ7: バックアップ/復元

目的:

- ローカルDB運用のデータ消失リスクを下げる。

作業:

- 毎日自動バックアップを実装する。
- 手動バックアップボタンを実装する。
- アップデート前バックアップを実装する。
- 暗号化バックアップファイルを作成する。
- 稼働中SQLiteファイルを直接ZIPせず、SQLite backup API または `VACUUM INTO` 相当の安全なDBエクスポートを使う。
- 薬局キーの発行、保管、再発行、復元時確認の運用を実装または運用手順化する。
- Google Drive for desktop の同期フォルダを任意設定できるようにする。
- 復元機能を実装する。
- 復元前に現在DBを退避する。

完了条件:

- PC内バックアップから復元できる。
- Google Drive同期フォルダが設定されている場合、そこにもコピーできる。

現行先行実装:

- Electron/SQLite環境では `electron/localSqliteBackupRepository.mjs` が `VACUUM INTO` で稼働中DBから安全な一時SQLiteを書き出す。
- 書き出したSQLite DBをAES-256-GCMで暗号化し、PBKDF2-SHA-256のパスワード派生情報、DB SHA-256、件数サマリーを含むJSONバックアップとして保存する。
- バックアップファイルには患者名などDB本文が平文で出ないことを自動テストで確認する。
- バックアップ作成後、`backups` テーブルへ作成履歴を記録する。
- Google Drive同期フォルダが設定されている場合、同じ暗号化バックアップファイルを同期フォルダへコピーする。
- 復元時はバックアップを復号し、SHA-256とSQLite `PRAGMA integrity_check` と必須テーブル存在を確認してからDBを差し替える。
- 復元前に現在DBを `before-restore` フォルダへ退避する。
- Electron IPC/Preload経由で、設定画面からSQLite暗号化バックアップ作成とバックアップファイル選択復元を呼び出せる。
- Electron起動時に薬局キーを自動生成し、同一日付の自動バックアップが未作成なら1日1回のSQLite暗号化バックアップを作成する。
- 自動バックアップは手入力パスワードを保存せず、生成済み薬局キーを暗号化キーとして使う。
- 自動バックアップ履歴は `backups.status = auto_created` と `metadata_json.auto_backup.date` で記録し、同日中の重複作成を避ける。
- 設定画面で稼働中SQLite DB本体の保護状態を確認できるようにする。WindowsではBitLocker状態を確認し、mac開発環境やWeb入口ではWindows端末で確認する旨を表示する。
- 設定画面から薬局キーを表示、非表示、コピーできる。初回や旧DBで未発行の場合は設定画面でも生成できる。
- アップデート前バックアップを `backups.status = pre_update_created` と `metadata_json.pre_update_backup` で履歴に残す。
- 設定画面から薬局キーを使ったアップデート前バックアップを作成できる。将来の配布アップデータからも同じIPCを呼ぶ。
- Electron起動時に前回起動バージョンと現在バージョンを比較し、バージョンが変わっていれば薬局キーでアップデート前SQLite暗号化バックアップを自動作成する。
- 初回起動時は現在バージョンだけを記録し、バックアップは作成しない。同一バージョンの再起動では重複作成しない。
- アプリ実行ファイルに `--pre-update-backup` を付けて起動すると、ウィンドウを開かずにアップデート前SQLite暗号化バックアップを作成し、結果JSONを標準出力へ返す。
- `scripts/windows_pre_update_backup.ps1` を追加し、Windows更新配布側から `--to-version`、`--db-path`、`--backup-dir` 付きでCLIバックアップを呼べるようにする。
- 設定画面から薬局キーの台帳用TSVをコピーできる。薬局名、所在地、TEL、FAX、薬局キー、控え日時を管理者台帳へ貼り付ける運用にする。
- 設定画面から確認付きで薬局キーを再発行できる。旧キーはアプリ内に保存せず、既存バックアップ復元用として管理者台帳に残す。
- `docs/backup-key-operations.md` に、薬局キーの台帳管理、再発行、復元時確認の手順をまとめる。
- ブラウザのmac開発デモでは、従来どおり `localStorage` 用の暗号化JSONバックアップを使う。

## 10. フェーズ8: Vercel入口/配布

目的:

- 素人でも導入できる入口を用意する。

作業:

- Vercelに導入ページを作る。
- 導入コード入力画面を作る。
- 導入コードの発行、失効、利用台数管理のための最小管理表を用意する。
- Windowsインストーラーのダウンロード導線を作る。
- 日常利用の主導線はWindowsデスクトップショートカットとし、Vercel入口は初回導入、更新案内、接続確認に限定する。
- ローカルアプリは `127.0.0.1` の固定ポート候補でHTTP APIを起動する。
- VercelページからローカルHTTP APIへ接続確認する。CORSはVercelドメインとlocalhostを標準許可し、カスタム入口ドメインは `LOCAL_HEALTH_ALLOWED_ORIGINS` で追加する。
- ポート競合時に複数ポート候補を順に試す。
- Windowsインストール時にカスタムURIスキームを登録し、Vercelページからローカルアプリ起動を促せるようにする。
- ローカルアプリ接続状態を表示する。
  - 未インストール
  - 未起動
  - 更新必要
  - DB準備中
  - AI未セットアップ
  - 接続OK
- マニュアル/FAQを配置する。

注意:

- Vercelアカウントは利用者に共有しない。
- インストーラー本体はサイズに応じてVercel、GitHub Releases、または専用ストレージに置く。
- 使用者からはVercel上の「Windows版をインストール」ボタンだけに見せる。
- Vercel↔localhostブリッジは凍結機能として残し、バグ修正以外の新規投資はしない。

完了条件:

- Vercel URLからインストール案内、接続確認、更新案内まで辿れる。
- 普段の操作はWindowsデスクトップショートカットから開始できる。

現行Web版での先行実装:

- `/entry` をVercel入口ページ候補として追加する。
- `src/localAppConnection.ts` で `127.0.0.1` のポート候補 `47831`, `47832`, `47833` を順に確認する。入口ページ側の候補列は `VITE_LOCAL_APP_PORT_CANDIDATES` で差し替えられる。
- mac開発デモ用に `scripts/local_health_server.js` を追加し、`npm run dev:local-health` で `GET /api/local/health` を返せるようにする。
- ローカルヘルスAPI側も標準で `47831`, `47832`, `47833` を順に起動候補にし、ポート競合時は次候補で待ち受ける。管理者向けに `LOCAL_APP_PORT_CANDIDATES` で候補列を差し替えられる。
- mac開発デモ用に `electron/main.mjs` を追加し、`npm run dev:electron` で既存Vite画面をElectron上で開き、同時にローカルヘルスAPIを起動できるようにする。
- Electron起動時に `pharmacy-report://open` のカスタムURIスキーム登録を試みる。
- ローカルAPIのヘルスチェック結果から、未検出、更新必要、DB準備中、AI未セットアップ、接続OKを表示できるようにする。
- ローカルヘルスAPIのCORSは、標準では `*.vercel.app` とlocalhost/127.0.0.1のみを許可し、カスタムドメインは `LOCAL_HEALTH_ALLOWED_ORIGINS` のカンマ区切りOriginで追加できる。
- 更新必要時は、導入コード確認済みなら更新版インストーラーへ進み、未確認なら導入コード欄へ誘導する。
- 導入コード欄とWindowsインストール導線を用意する。導入コード確認後だけインストールリンクを有効化する。
- `api/install-code/verify.ts` をVercel Functionとして追加し、`INSTALL_CODE_REGISTRY` と `WINDOWS_INSTALLER_URL` の環境変数から導入コード、失効、利用台数上限を検証する。
- `docs/install-code-registry.example.json` を最小管理表のサンプルとして配置する。
- `api/install-code/supabaseUsageStore.ts` を追加し、Supabase管理テーブルが設定されている場合は端末IDを登録して導入コードの利用台数を自動加算する。
- 導入ページはブラウザ内に匿名端末IDを生成/保持し、導入コード確認時にVercel Functionへ送信する。同じ端末の再確認は重複加算しない。
- `docs/install-code-usage-store.md` にSupabaseテーブル定義とVercel環境変数をまとめる。
- `vercel.ts` で `/api/(.*)` をAPIへ通し、SPAのcatch-all rewriteより前に評価されるようにする。
- `electron-builder` を導入し、`package.json` にWindows NSISインストーラー用の `dist:win`、mac検証用の `build:electron`、成果物検査用の `verify:electron-package` を追加する。
- パッケージ設定にはアプリID、製品名、`pharmacy-report://` URIスキーム、薬剤マスタJSON、ローカルヘルスAPI、CSV取り込み用依存を含める。
- Windowsパッケージ版の起動時にElectronのLogin Item設定を有効化し、Windowsログイン後にローカルアプリが自動起動してローカルDB/ローカルAPI/AI状態確認が戻るようにする。検証や管理用に `LOCAL_DISABLE_WINDOWS_AUTO_LAUNCH=1` で無効化できる。
- `.github/workflows/windows-installer.yml` を追加し、GitHub ActionsのWindows runnerで `npm run test:local-app`、`npm run dist:win`、更新前バックアップCLIスモーク、インストーラーartifact保存を実行できるようにする。
- CIのコード署名は `WINDOWS_CSC_LINK` と `WINDOWS_CSC_KEY_PASSWORD` のSecretsが設定されている場合に使う。秘密情報はリポジトリへ置かない。
- `electron-updater` を導入し、署名有効化後は起動時に更新確認、バックグラウンドダウンロード、アプリ終了時の `quitAndInstall` を行う。既定では `LOCAL_AUTO_UPDATE_ENABLED` と `LOCAL_CODE_SIGNING_ENABLED` が揃わない限り無効。
- 自動更新インストール前に `preUpdateBackupCommand` 経由で更新前バックアップを作成する。バックアップ失敗時はその回の自動更新を見送り、次回起動時に再確認する。
- `package.json` のWindows publish先を公開リリース用リポジトリ `emayu323/pharmacy-report-releases` に向け、`dist:win:publish` を追加する。
- CIには、タグpushかつ `AUTO_UPDATE_RELEASE_PUBLISH_ENABLED=1` と `LOCAL_CODE_SIGNING_ENABLED=1` の場合だけ `dist:win:publish` を実行する段を用意する。
- 設定画面に現在バージョン、更新状態、手動の「更新を確認」ボタンを追加する。
- `docs/windows-installer-build.md` に、macでの同梱物検証、WindowsでのNSIS作成、コード署名、アップロード、Vercel環境変数設定の手順をまとめる。
- `docs/vercel-production-env.md` に、本番環境変数、Supabase台数管理用の任意環境変数、設定/確認コマンドをまとめる。
- `scripts/verify_vercel_production_env.mjs` と `npm run verify:vercel-env` を追加し、`INSTALL_CODE_REGISTRY`、`WINDOWS_INSTALLER_URL`、任意のSupabase台数管理envを本番投入前に検査できるようにする。検査結果にはService Role Keyを出さない。
- `scripts/create_install_code_registry.mjs` と `npm run create:install-codes` を追加し、導入コード管理表と検査用 `.env.production.local` を `output/` に生成できるようにする。生成した導入コード実値はgit管理外で扱う。
- `scripts/release_readiness_check.mjs` と `npm run release:check` を追加し、実装ファイル、運用引き継ぎ文書、npm script、Windows workflow、mac同梱物、Windowsインストーラー、GitHub Actions上の配布artifact、Vercel本番env、現地AI結合証跡をまとめて確認できるようにする。通常モードでは外部環境待ちを `pending` として扱い、`--strict` では `pending` もリリース不可として扱う。
- `release:check -- --source-status` では、ローカルGitの未commit/未push状態を追加の `Source publication` ゲートとして扱い、GitHub Actionsへworkflowが届いていない原因を切り分けられるようにする。
- `npm run release:check:full` を追加し、ローカルGit状態、GitHub Actions上の配布artifact、Vercel本番env名、`output/local-ai-integration-result.json` を含む人間向けリリース判定を1コマンドで表示できるようにする。
- `release:check` では、報告書の自動保存/手動保存、保存状態表示、手動バックアップ、復元、更新前バックアップの導線も静的に確認する。
- `scripts/release_handoff.mjs` と `npm run release:handoff` を追加し、外部担当者へ渡す残作業サマリを秘密情報なしのMarkdownとして `output/release-handoff.md` に生成できるようにする。
- `scripts/source_release_status.mjs` と `npm run release:source-status` を追加し、ローカルGitの未commit/未push状態を読み取り専用で確認できるようにする。
- `npm run release:source-status -- --details` では、GitHubへ反映する前に確認できるよう、変更ファイル一覧を任意表示できるようにする。通常のハンドオフには件数だけを出し、詳細は必要時だけ表示する。
- `scripts/source_publication_checklist.mjs` と `npm run release:source-checklist` を追加し、GitHubへ反映する前の確認項目と変更ファイル一覧を `output/source-publication-checklist.md` に生成できるようにする。
- `npm run release:handoff:full` を追加し、ローカルGit状態、GitHub Actions状態、現地AI結合証跡を含む引き継ぎMarkdownを1コマンドで生成できるようにする。
- `public/manual.html` に利用者向けのかんたんマニュアル/FAQを配置し、Vercel入口ページから開けるようにする。
- mac開発デモでは、Vercel Functionが未起動でも `VITE_DEMO_INSTALL_CODES` と `VITE_WINDOWS_INSTALLER_URL` で導入コード確認を試せる。
- mac開発デモ向けに `scripts/mac_demo_readiness.mjs` / `npm run demo:mac-readiness` を追加し、起動コマンドと外部待ちを本番判定とは分けて表示できるようにする。
- mac開発デモ向けに `scripts/mac_demo_smoke.mjs` / `npm run demo:mac-smoke` を追加し、起動後に `/entry` と `127.0.0.1` のローカルヘルスAPI応答を確認できるようにする。

未実装:

- GitHub ActionsまたはWindows実機でのNSISインストーラー作成実行、署名Secrets設定、アップロード実行。
- リリース成果物専用の公開GitHubリポジトリ作成と `RELEASES_GITHUB_TOKEN` 設定。
- コード署名有効化後のWindows実機での自動更新スモーク。
- 実値を使ったVercel本番環境変数の設定。

## 11. フェーズ9: AIモード

目的:

- 訪問メモとローカルLLMにより、主訴等と服薬指導内容の入力を補助する。

作業:

- AIモードのオン/オフを追加する。
- Ollama、必要モデル、空き容量、PC性能の状態確認を行う。
- 長い訪問メモでは処理に時間がかかる可能性があるため、処理時間の目安を表示する。
- 足りないものを順番に案内するセットアップ画面を作る。
- 訪問メモを入力または貼り付けできる。
- LLMで主訴等、服薬指導内容へ振り分ける。
- 空欄なら直接入力、既存文があれば追記/置換/キャンセルを選ばせる。
- AI失敗時はエラー表示して通常手入力に戻す。

完了条件:

- AIなしでも通常機能が使える。
- AIモードON時に訪問メモから2項目への反映までできる。
- 訪問メモは報告書に保存され、前回報告書コピー時は引き継がない。

現行先行実装:

- `app_settings` にAIモード、Ollama URL、Ollamaモデル、自動起動、Ollama起動コマンドの設定を追加する。AIモード初期値はOFF。
- 設定画面にAIモードON/OFF、Ollama接続設定、自動起動設定を追加する。
- 設定画面にローカルAI環境の状態確認を追加する。Electron環境ではOllama、空き容量、CPU数、処理時間目安を確認できる。
- Electron IPC/Preload経由で `ai.getStatus()` を呼び出せる。
- ElectronのローカルヘルスAPIはAI状態を起動時に確認し、AI未セットアップの場合も通常機能を開ける状態として返す。
- GPUなしPC向けに、長い訪問メモでは処理に時間がかかる可能性がある旨を表示する。
- AI未セットアップでも、設定保存、ローカルDB、バックアップ、通常帳票機能は止めない。
- 報告書編集画面の指導内容セクションにAI下書きパネルを追加する。
- AIモードONの時だけ、訪問メモからAI下書きを作成できる。
- Electron IPC/Preload経由で `ai.createDraftFromVisitMemo()` を呼び出せる。
- 設定画面からOllama URL、Ollamaモデルを保存できる。設定値はAIモードOFFでも保持する。
- ElectronのAI状態確認、LLM抽出は、DBに保存されたローカルAI接続設定を使用する。未設定時は環境変数/既定値へフォールバックする。
- Ollamaモデルが設定されている場合、Ollama `/api/chat` で主訴等と服薬指導内容だけをJSON抽出する。未設定または失敗時はルールベース下書きにフォールバックする。
- 訪問メモを手入力または貼り付けて下書き作成できる。ブラウザのmac開発デモではこの経路で確認できる。
- AI下書きは主訴等と服薬指導内容だけに限定し、副作用、残薬、服薬状況は自動反映しない。
- 空欄は直接反映し、既存文がある場合は追記/置換/キャンセルを選ばせる。
- AI下書きを反映した項目には一時的に「AI反映済み」を表示し、直前のAI反映を「元に戻す」できる。反映後に手入力で編集された場合は自動復元しない。
- 設定画面からローカルAIサーバーの自動起動ON/OFF、Ollama起動コマンドを保存できる。初期値は自動起動OFF、Ollamaは `ollama serve`。
- Electron起動時に、AIモードONかつ自動起動ONの場合だけ、保存された起動コマンドをshellなしでプロセス起動する。同一プロセス種別は重複起動せず、アプリ終了時にアプリが起動したプロセスを停止する。
- 検証や障害対応用に `LOCAL_DISABLE_AI_AUTO_START=1` で自動起動を無効化できる。
- 報告書保存時に訪問メモ本文と保存日時を報告書スナップショットへ保存する。前回報告書コピー時はAI訪問メモを引き継がない。
- 設定画面にセットアップ手順を表示する。AIモード、Ollama起動、Ollamaモデル、処理時間目安を、状態確認結果に応じて完了/対応必要/確認待ちで表示する。
- Ollamaモデル未ダウンロード時は `ollama pull <モデル名>` を提示し、Ollama起動コマンドもコピーできる。実際のモデル取得は薬局Wi-Fi環境で利用者が実行する。
- `npm run test:local-ai-text -- --ollama-model <モデル名>` で、実運用Ollamaとのtext-only結合テストを実行できる。
- 結合テストではOllama状態確認、指定モデル確認、Ollama `/api/chat` の2項目JSON抽出を確認する。
- `test:local-ai-text` は、現地PCでの結合テスト結果を `output/local-ai-integration-result.json` に保存する。証跡には接続状態と成否だけを保存し、訪問メモ本文とAI下書き本文は保存しない。
- 結合テスト手順は `docs/local-ai-integration-check.md` に記載する。
- `npm run release:check -- --ai-receipt <証跡JSON>` で、現地PCのAI結合テスト完了をリリース前チェックに含められるようにする。証跡JSONに訪問メモ本文、AI下書き本文が含まれる場合は失敗として扱う。

未実装:

- 実運用サーバーを起動した現地PCでの結合テスト実行。

## 12. 検証方針

最低限の検証:

- ローカルDBの作成、保存、再起動後の再表示
- 患者マスタと報告書スナップショットの分離
- 薬剤マスタ検索
- 薬剤ごとの前回「いつまで分」を使った定期薬計算
- 実残日数で上書きした場合の再計算
- その他薬剤が計算対象外で帳票表示されること
- A4印刷表示
- 2通出力
- 自動保存/手動保存
- 論理削除/復元
- バックアップ/復元
- 暗号化バックアップの鍵忘れ/PC故障時の復元手順
- PINロック/15分無操作ロック
- Vercelページからlocalhost APIへの接続確認
- カスタムURIスキームからのローカルアプリ起動
- オフライン起動
- AI未セットアップでも通常機能が動くこと

現行の標準ローカル検証 `npm run test:local-app` には、薬剤マスタ正規化、薬剤ごとの残日数計算、帳票/印刷モデルのテストも含める。

## 13. 最初の技術検証

最初に確認すること:

1. 既存帳票をローカルアプリ内で安定してA4印刷できるか。
2. 医療機関向け/ケアマネ向けの2通を期待通りに出力できるか。
3. 既存React/ViteをTauriまたはElectronで包めるか。
4. Windowsインストーラーを作れるか。
5. SQLiteへ保存/読込できるか。
6. アプリ起動時の自動起動/常駐に近い動作が可能か。
7. Vercel入口からローカルアプリ状態確認ができるか。
8. カスタムURIスキームでローカルアプリを起動できるか。

この検証結果で、Tauri/Electronの最終選定を行う。

## 14. 残薬計算テストケース

フェーズ4着手前に、最低限以下のケースを自動テスト化する。

### ケース1: 前回値あり、標準処方日数

- 今回訪問日: 2026-06-10
- 薬剤A 前回いつまで分: 2026-06-14
- 今回処方日数: 28日
- 前回残日数: 5日
- 今回合計残日数: 33日
- 今回いつまで分: 2026-07-12

### ケース2: 薬剤ごとに前回値が違う

- 今回訪問日: 2026-06-10
- 薬剤A 前回いつまで分: 2026-06-14、今回処方28日、今回いつまで分: 2026-07-12
- 薬剤B 前回いつまで分: 2026-06-20、今回処方28日、今回いつまで分: 2026-07-18
- 定期薬全体の最短いつまで分: 2026-07-12

### ケース3: 前回値が今回訪問日より前

- 今回訪問日: 2026-06-10
- 薬剤A 前回いつまで分: 2026-06-05
- 今回処方日数: 28日
- 前回残日数: 0日
- 今回合計残日数: 28日
- 今回いつまで分: 2026-07-07

### ケース4: 新規薬剤

- 今回訪問日: 2026-06-10
- 薬剤A 前回なし
- 今回処方日数: 14日
- 前回残日数: 0日
- 今回合計残日数: 14日
- 今回いつまで分: 2026-06-23

### ケース5: 実残日数上書き

- 今回訪問日: 2026-06-10
- 薬剤A 計算上の前回残日数: 5日
- 実残日数上書き: 8日
- 今回処方日数: 28日
- 今回合計残日数: 36日
- 今回いつまで分: 2026-07-15
