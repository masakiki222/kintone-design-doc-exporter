# kintone Design Doc Exporter

`kintone` のアプリ設定を取得し、`HTML` 形式の設計書としてダウンロードするサンプルプラグインです。

## できること

- プラグイン設定画面から `保存済み設定で出力` を実行
- フィールド定義、レイアウト、一覧、プロセス管理を設計書化
- 必要に応じて権限、通知、カスタマイズ、アプリ管理者メモも出力
- `本番反映済み設定` と `未反映を含むプレビュー設定` を切り替え
- 必要なら各セクションに `生データ (JSON)` を添付

## ファイル構成

```text
kintone-design-doc-exporter/
├── manifest.json
├── README.md
├── css/
│   └── config.css
├── html/
│   └── config.html
└── js/
    ├── config.js
    └── desktop.js
```

## 重要

`kintone` に直接インポートできるのは、単純なZIPではなく `plugin-packer` で署名済みの `plugin.zip` です。  
このフォルダとここで作るZIPは、`plugin-packer` に渡すためのソースです。

## ソース ZIP 化

`plugin-packer` の Web 版に渡しやすいように、ソース一式をZIPにまとめる場合は次の形です。

```bash
cd /path/to/kintone-design-doc-exporter
zip -r ../kintone-design-doc-exporter-source.zip manifest.json js css html image
```

その後、次のいずれかで署名済みZIPを作成します。

- Web版: `https://plugin-packer.kintone.dev/`
- CLI版: `@kintone/plugin-packer`

既存のプラグインを更新する場合は、プラグインIDを維持するために次の `ppk` ファイルを使用します。

```text
/Users/masaki/Documents/kintone_plugin_ppk/secrets/kintone-design-doc-exporter-source.pikfdfclhfeodmelolamkkphpacankgp.private.ppk
```

CLI版で生成する例:

```bash
kintone-plugin-packer --ppk /Users/masaki/Documents/kintone_plugin_ppk/secrets/kintone-design-doc-exporter-source.pikfdfclhfeodmelolamkkphpacankgp.private.ppk .
```

## 導入手順

1. `plugin-packer` で署名済みの `plugin.zip` を生成する
2. `kintone` のシステム管理でその `plugin.zip` を読み込む
3. 対象アプリにこのプラグインを追加する
4. プラグイン設定画面で出力オプションを保存する
5. アプリを更新する
6. プラグイン設定画面の `保存済み設定で出力` ボタンを押す

## 実装メモ

- 設計書出力は、プラグイン設定画面にある `保存済み設定で出力` ボタンから実行します。
- フォームに未保存の変更がある場合でも、出力には `保存済み設定` のみを使います。
- 設計書は `HTML` としてダウンロードされるので、そのまま共有したり、ブラウザの印刷機能で `PDF` に変換できます。
- 通知や権限の対象者は、まずコード値のまま出力しています。ユーザー名や組織名への変換は、必要に応じて `User API` 連携を追加してください。
- `Get Customization` など、`API Token` では扱いづらい設定も、`kintone` 上で動くプラグインから `Session Authentication` で取得できる前提のサンプルです。

## 今後の拡張案

- `Markdown` や `Excel` 出力の追加
- ユーザー/組織/グループコードを表示名に変換
- 出力対象セクションのさらに細かいON/OFF
- 設計書を別アプリへ保存して履歴管理
