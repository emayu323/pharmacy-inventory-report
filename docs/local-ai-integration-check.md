# ローカルAI結合テスト

実運用のOllama/Whisper系サーバーとアプリ側の接続を確認するための手順。

通常の `npm run test:local-app` では実サーバーへ接続しない。実サーバー検証時は、下記の専用コマンドを使う。

## Ollamaのみ確認

```bash
npm run test:local-ai-text -- --ollama-model llama3.1:8b
```

確認内容:

- Ollama `/api/tags` に接続できる
- 指定モデルが存在する
- Ollama `/api/chat` で主訴等/服薬指導内容のJSON抽出ができる

## Whisperも確認

```bash
npm run test:local-ai-audio -- \
  --ollama-model llama3.1:8b \
  --whisper-health-url http://127.0.0.1:8178/health \
  --whisper-transcribe-url http://127.0.0.1:8178/transcribe \
  --audio-path /path/to/sample.webm
```

確認内容:

- WhisperヘルスURLに接続できる
- サンプル音声をWhisperへ送信できる
- 文字起こし結果からOllamaで2項目の下書きを作れる

環境によりWhisperのファイル項目名が違う場合は `--whisper-file-field` を指定する。

従来の環境変数指定も利用できるが、Windowsでは環境変数の書き方がシェルごとに変わるため、通常は上記のCLIフラグを使う。

## 証跡ファイル

`test:local-ai-text` と `test:local-ai-audio` は、結合テスト結果を `output/local-ai-integration-result.json` に保存する。
直接 `node scripts/local_ai_integration_check.mjs` を使う場合は、`--result-path` で保存先を指定できる。
`release:check --ai-receipt` には、証跡ファイルをリポジトリルートからの相対パス、または絶対パスで指定できる。

保存されるもの:

- 作成日時
- アプリバージョン
- Ollama/Whisperの接続状態
- 指定モデルの確認結果
- 下書き作成がローカルLLM経由で成功したか
- 音声テストを実施したか

保存しないもの:

- 文字起こし本文
- AI下書き本文
- 音声ファイル本体

リリース前チェックでは、証跡JSONに `transcript`、`chief_complaint`、`medication_instruction`、`audioPath` など本文や音声詳細を示すフィールドが混ざっている場合は失敗として扱う。

証跡JSONの `app_version` が現在の `package.json` のバージョンと違う場合も失敗として扱う。アプリ更新後は、現地PCでAI結合テストを取り直す。

`Ollamaのみ確認` の証跡は、ローカルLLMで主訴等/服薬指導内容を下書きできることの部分証跡として扱う。この場合、`release:check` では失敗ではなく `pending` になり、Whisperの音声確認が残っていることを表示する。

本番配布前にAI機能を `pass` にするには、`ready: true`、`ollama.status: "ready"`、`whisper.status: "ready"`、ローカルLLM由来の下書き成功、主訴等/服薬指導内容の両方の抽出成功が必要。サンプル音声を指定した場合は、音声経由の下書き成功も必要になる。

リリース前チェックへ含める場合:

```bash
npm run release:check -- --ai-receipt output/local-ai-integration-result.json
```

本番配布直前は、Vercel本番envと合わせて `--strict` を付けます。
