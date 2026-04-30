# Development

このファイルは、このリポジトリを開発・保守するためのメモです。利用者向けの説明は `README.md` にまとめます。

## ファイル構成

```text
kintone-design-doc-exporter/
├── manifest.json
├── README.md
├── DEVELOPMENT.md
├── css/
│   └── config.css
├── html/
│   └── config.html
├── image/
│   ├── icon.png
│   └── icon.svg
├── scripts/
│   └── package-plugin.sh
└── js/
    ├── config.js
    └── desktop.js
```

## パッケージング

`kintone` に直接インポートできるのは、単純なZIPではなく `plugin-packer` で署名済みのプラグインZIPです。

このプロジェクトでは、アップロード用の署名済みZIPはファイル名の末尾に `manifest.json` の `version` を付けます。

```text
kintone-design-doc-exporter-plugin-v{version}.zip
```

生成は次のスクリプトを使います。

```bash
export KINTONE_PLUGIN_PPK=/path/to/existing.private.ppk
./scripts/package-plugin.sh
```

たとえば `manifest.json` の `version` が `0.2.4` の場合、次のファイルを生成します。

```text
../kintone-design-doc-exporter-plugin-v0.2.4.zip
```

## ppk の扱い

既存のプラグインを更新する場合は、プラグインIDを維持するために同じ `.ppk` ファイルを使用します。

`.ppk` は署名用の秘密鍵です。リポジトリには含めないでください。

CLI版で生成する例:

```bash
kintone-plugin-packer --ppk "$KINTONE_PLUGIN_PPK" .
```

## ソース ZIP 化

`plugin-packer` の Web 版に渡しやすいように、ソース一式をZIPにまとめる場合は次の形です。

```bash
cd /path/to/kintone-design-doc-exporter
zip -r ../kintone-design-doc-exporter-source.zip manifest.json js css html image
```

その後、次のいずれかで署名済みZIPを作成します。

- Web版: `https://plugin-packer.kintone.dev/`
- CLI版: `@kintone/plugin-packer`

## リリース作業

1. `manifest.json` の `version` を更新する
2. 必要な動作確認を行う
3. `./scripts/package-plugin.sh` で署名済みプラグインZIPを生成する
4. 変更をコミットする
5. GitHub に push する
6. GitHub Releases に署名済みプラグインZIPを添付する

## GitHub への反映

変更後は、自動では GitHub に反映されません。必要に応じて次の流れで反映します。

```bash
git status
git add .
git commit -m "Update plugin"
git push
```

## 実装メモ

- 設計書出力は、プラグイン設定画面にある `保存済み設定で出力` ボタンから実行します。
- フォームに未保存の変更がある場合でも、出力には `保存済み設定` のみを使います。
- 通知や権限の対象者は、まずコード値のまま出力しています。ユーザー名や組織名への変換は、必要に応じて `User API` 連携を追加してください。
- `Get Customization` など、`API Token` では扱いづらい設定も、`kintone` 上で動くプラグインから `Session Authentication` で取得できる前提です。

## 今後の拡張案

- `Markdown` や `Excel` 出力の追加
- ユーザー/組織/グループコードを表示名に変換
- 出力対象セクションのさらに細かいON/OFF
- 設計書を別アプリへ保存して履歴管理
