# ローカルAI結合テスト

実運用のOllamaサーバーとアプリ側の接続を確認するための手順。

通常の `npm run test:local-app` では実サーバーへ接続しない。実サーバー検証時は、下記の専用コマンドを使う。

## 訪問メモ下書き確認

```bash
npm run test:local-ai-text -- --ollama-model llama3.1:8b
```

確認内容:

- Ollama `/api/tags` に接続できる
- 指定モデルが存在する
- Ollama `/api/chat` で訪問メモから主訴等/服薬指導内容のJSON抽出ができる

検証用メモを差し替える場合:

```bash
npm run test:local-ai-text -- --ollama-model llama3.1:8b --visit-memo "主訴等: 眠気あり。服薬指導内容: 主治医へ相談するよう説明。"
```

従来の環境変数指定も利用できるが、Windowsでは環境変数の書き方がシェルごとに変わるため、通常は上記のCLIフラグを使う。

## 証跡ファイル

`test:local-ai-text` は、結合テスト結果を `output/local-ai-integration-result.json` に保存する。
直接 `node scripts/local_ai_integration_check.mjs` を使う場合は、`--result-path` で保存先を指定できる。
`release:check --ai-receipt` には、証跡ファイルをリポジトリルートからの相対パス、または絶対パスで指定できる。

保存されるもの:

- 作成日時
- アプリバージョン
- Ollamaの接続状態
- 指定モデルの確認結果
- 下書き作成がローカルLLM経由で成功したか

保存しないもの:

- 訪問メモ本文
- AI下書き本文

リリース前チェックでは、証跡JSONに `visitMemo`、`visit_memo`、`chief_complaint`、`medication_instruction` など本文を示すフィールドが混ざっている場合は失敗として扱う。

証跡JSONの `app_version` が現在の `package.json` のバージョンと違う場合も失敗として扱う。アプリ更新後は、現地PCでAI結合テストを取り直す。

本番配布前にAI機能を `pass` にするには、`ready: true`、`ollama.status: "ready"`、ローカルLLM由来の下書き成功、主訴等/服薬指導内容の両方の抽出成功が必要。

リリース前チェックへ含める場合:

```bash
npm run release:check -- --ai-receipt output/local-ai-integration-result.json
```

本番配布直前は、Vercel本番envと合わせて `--strict` を付けます。
