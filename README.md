# Claude Code JP Starter 🇯🇵

**日本語開発者のための Claude Code フック & テンプレート集**

Claude Code を日本語環境で安全・快適に使うためのスターターキット。
Shift_JIS ファイル破壊防止、サプライチェーン攻撃対策、日英スペース整形などを **ワンコマンド** でセットアップできます。

> **Windows / macOS / Linux 対応** — 既存の日本語 Claude Code ツール（wasabeef 氏の cookbook 等）は macOS 専用ですが、本キットは Node.js ベースでクロスプラットフォーム対応です。

---

## 🎯 解決する問題

| # | 問題 | フック |
|---|------|--------|
| 1 | Claude Code が Shift_JIS ファイルを UTF-8 で上書き → 日本語が文字化け | `sjis-guard.js` |
| 2 | 不明なパッケージの自動インストール → サプライチェーン攻撃リスク | `package-safety.js` |
| 3 | API キーや機密ファイルの誤コミット | `git-security.sh` |
| 4 | 日本語と ASCII の間にスペースがない → 読みにくい | `ja-format.js` |
| 5 | `rm -rf /` や `git push --force main` などの危険なコマンド | `danger-guard.js` |

---

## 📦 インストール

```bash
git clone https://github.com/minatoplanb/claude-code-jp-starter.git
cd claude-code-jp-starter
npm install
node install.js
```

これだけで、すべてのフックが `~/.claude/hooks/jp-starter/` にインストールされ、`~/.claude/settings.json` に自動設定されます。

### オプション

```bash
# 変更内容をプレビュー（実際には何も変更しない）
node install.js --dry-run

# CLAUDE.md テンプレートも現在のプロジェクトにコピー
node install.js --with-template

# アンインストール
node install.js --uninstall
```

---

## 🛡️ フック詳細

### 1. SJIS Guard（Shift_JIS エンコーディング保護）

**最重要フック。** Claude Code はすべてのファイルを UTF-8 として読み書きします。Shift_JIS（Windows のデフォルト）や EUC-JP のファイルを編集すると、日本語コメントや文字列が完全に破壊されます。

**動作原理:**
```
編集前（PreToolUse）:
  ファイルのエンコーディングを検出
  → SJIS/EUC-JP/JIS なら UTF-8 に変換（原本はバックアップ）
  → Claude Code が UTF-8 として安全に編集

編集後（PostToolUse）:
  → 元のエンコーディングに自動復元
  → バックアップを削除
```

**対応エンコーディング:** Shift_JIS, EUC-JP, ISO-2022-JP (JIS)

**依存:** [`encoding-japanese`](https://www.npmjs.com/package/encoding-japanese)（ダウンロード数 170 万+、依存ゼロ、純粋 JS）

### 2. Package Safety（パッケージ安全チェック）

`npm install` や `npx` コマンドを監視し、信頼リストにないパッケージをブロックします。タイポスクワッティング（`lodash` → `1odash`）やマルウェアパッケージからプロジェクトを守ります。

**カスタマイズ:**

```json
// ~/.claude/jp-starter/trusted-packages.json
{
  "packages": ["my-company-ui", "internal-utils"],
  "scopes": ["@my-company"]
}
```

### 3. Git Security（Git セキュリティ）

Git pre-commit フックとして、機密ファイルやコンテンツのコミットをブロックします。

**ブロック対象:**
- `CLAUDE.md`, `.claude/`, `.env` ファイル
- `.pem`, `.key`, `.p12` などの証明書
- API キーパターン（`sk-ant-*`, `sk-proj-*`, `ghp_*`）
- カスタムブロック文字列

**カスタマイズ:** リポジトリルートに `.claude-jp-security.json` を作成:

```json
{
  "blocked_strings": ["社外秘", "internal-only"]
}
```

**インストール（リポジトリごとに手動）:**
```bash
cp ~/.claude/hooks/jp-starter/git-security.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### 4. Japanese Format（日英スペース整形）

日本語と ASCII 文字の間に半角スペースを自動挿入します。

```
Before: Claude Codeで開発する
After:  Claude Code で開発する
```

コードブロック、インラインコード、URL 内はスキップします。
[wasabeef 氏の ja-space-format.sh](https://github.com/nicewook/claude-code-cookbook-ja/blob/main/hooks/ja-space-format.sh) の Node.js 移植版です。

### 5. Danger Guard（危険コマンドブロック）

取り消しが困難なコマンドをブロックします:

- `rm -rf /` / `rm -rf ~` / `rm -rf .`
- `git push --force main`
- `git reset --hard`
- `DROP TABLE` / `TRUNCATE TABLE`
- `chmod -R 777 /`

**カスタマイズ:**

```json
// ~/.claude/jp-starter/danger-guard.json
{
  "patterns": [
    { "regex": "kubectl delete namespace", "label": "namespace 削除" }
  ]
}
```

---

## 📁 ファイル構成

```
claude-code-jp-starter/
├── README.md                     ← このファイル
├── package.json                  ← 依存: encoding-japanese
├── install.js                    ← ワンコマンドインストーラー
├── hooks/
│   ├── sjis-guard.js             ← SJIS エンコーディング保護
│   ├── package-safety.js         ← パッケージ安全チェック
│   ├── git-security.sh           ← Git pre-commit セキュリティ
│   ├── ja-format.js              ← 日英スペース整形
│   └── danger-guard.js           ← 危険コマンドブロック
├── templates/
│   ├── CLAUDE.md                 ← 日本語プロジェクト用テンプレート
│   └── settings-example.json     ← 設定例
└── LICENSE                       ← MIT
```

---

## 🤝 コントリビュート

Issue や PR を歓迎します！特に以下の貢献を求めています:

- 新しいフックのアイデア
- 信頼パッケージリストの追加提案
- バグ報告
- ドキュメントの改善

---

## ⚙️ 動作要件

- Node.js 18+
- Claude Code（[公式 CLI](https://docs.anthropic.com/en/docs/claude-code)）
- Git（git-security.sh を使用する場合）

---

## 📝 ライセンス

MIT License

---

## 💡 関連リソース

- [Claude Code 公式ドキュメント](https://docs.anthropic.com/en/docs/claude-code)
- [Claude Code Hooks ドキュメント](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [wasabeef/claude-code-cookbook-ja](https://github.com/nicewook/claude-code-cookbook-ja) — macOS 向け日本語フック集

---

# Claude Code JP Starter 🇯🇵 (English)

**Claude Code hooks & templates for Japanese developers**

A starter kit for using Claude Code safely in Japanese development environments. Includes Shift_JIS file protection, supply chain attack prevention, Japanese typography formatting, and more — all installable with **one command**.

> **Cross-platform (Windows / macOS / Linux)** — Unlike existing Japanese Claude Code tools (macOS-only bash scripts), this kit uses Node.js for full cross-platform support.

## Quick Start

```bash
git clone https://github.com/minatoplanb/claude-code-jp-starter.git
cd claude-code-jp-starter
npm install
node install.js
```

## What's Included

| Hook | What it does |
|------|-------------|
| `sjis-guard.js` | Protects Shift_JIS/EUC-JP files from being destroyed by UTF-8 writes |
| `package-safety.js` | Blocks unknown npm packages (supply chain attack protection) |
| `git-security.sh` | Pre-commit hook blocking secrets, API keys, and sensitive files |
| `ja-format.js` | Auto-inserts spaces between Japanese and ASCII characters |
| `danger-guard.js` | Blocks dangerous commands (`rm -rf`, `force push`, `DROP TABLE`) |

See the Japanese section above for detailed documentation on each hook.

## License

MIT
