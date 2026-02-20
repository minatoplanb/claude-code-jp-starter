#!/usr/bin/env node
/**
 * Claude Code JP Starter — One-Command Installer
 *
 * Usage:
 *   node install.js              # Install all hooks
 *   node install.js --dry-run    # Preview changes without modifying anything
 *   node install.js --with-template  # Also copy CLAUDE.md template to current project
 *   node install.js --uninstall  # Remove installed hooks
 *
 * What it does:
 *   1. Checks Node.js version (18+ required)
 *   2. Copies hooks to ~/.claude/hooks/jp-starter/
 *   3. Installs encoding-japanese to the hooks directory
 *   4. Merges hook configs into ~/.claude/settings.json (non-destructive)
 *   5. Creates config directory ~/.claude/jp-starter/
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// =====================================================================
// Configuration
// =====================================================================

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks', 'jp-starter');
const CONFIG_DIR = path.join(CLAUDE_DIR, 'jp-starter');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

const HOOKS = [
  {
    file: 'sjis-guard.js',
    description: 'SJIS エンコーディング保護',
    hookTypes: [
      { type: 'PreToolUse', matcher: 'Edit' },
      { type: 'PreToolUse', matcher: 'Write' },
      { type: 'PostToolUse', matcher: 'Edit' },
      { type: 'PostToolUse', matcher: 'Write' },
    ]
  },
  {
    file: 'package-safety.js',
    description: 'パッケージ安全チェック',
    hookTypes: [
      { type: 'PreToolUse', matcher: 'Bash' },
    ]
  },
  {
    file: 'ja-format.js',
    description: '日本語・ASCII スペース整形',
    hookTypes: [
      { type: 'PostToolUse', matcher: 'Edit' },
      { type: 'PostToolUse', matcher: 'Write' },
    ]
  },
  {
    file: 'danger-guard.js',
    description: '危険コマンドブロック',
    hookTypes: [
      { type: 'PreToolUse', matcher: 'Bash' },
    ]
  },
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const WITH_TEMPLATE = args.includes('--with-template');
const UNINSTALL = args.includes('--uninstall');

// =====================================================================
// Helpers
// =====================================================================

function log(msg) { console.log(msg); }
function success(msg) { console.log(`  ✅ ${msg}`); }
function info(msg) { console.log(`  📦 ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function error(msg) { console.error(`  ❌ ${msg}`); }

function ensureDir(dir) {
  if (!DRY_RUN) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read settings.json, or return empty structure
 */
function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch {
    warn('settings.json の読み込みに失敗。新規作成します。');
  }
  return {};
}

/**
 * Backup settings.json before modifying
 */
function backupSettings() {
  if (fs.existsSync(SETTINGS_FILE)) {
    const backupPath = SETTINGS_FILE + '.backup-' + Date.now();
    fs.copyFileSync(SETTINGS_FILE, backupPath);
    return backupPath;
  }
  return null;
}

// =====================================================================
// Install
// =====================================================================

function install() {
  log('');
  log('🇯🇵 Claude Code JP Starter — インストール');
  log('━'.repeat(50));
  if (DRY_RUN) {
    log('  🔍 ドライランモード — 変更は行いません');
    log('');
  }

  // 1. Check Node.js version
  const nodeVersion = parseInt(process.version.slice(1));
  if (nodeVersion < 18) {
    error(`Node.js 18+ が必要です（現在: ${process.version}）`);
    process.exit(1);
  }
  success(`Node.js ${process.version} ✓`);

  // 2. Create directories
  info('ディレクトリを作成...');
  ensureDir(HOOKS_DIR);
  ensureDir(CONFIG_DIR);
  success(`${HOOKS_DIR}`);
  success(`${CONFIG_DIR}`);

  // 3. Copy hook files
  log('');
  log('📋 フックをコピー:');
  const sourceDir = path.join(__dirname, 'hooks');
  for (const hook of HOOKS) {
    const src = path.join(sourceDir, hook.file);
    const dst = path.join(HOOKS_DIR, hook.file);

    if (!fs.existsSync(src)) {
      error(`${hook.file} が見つかりません: ${src}`);
      continue;
    }

    if (DRY_RUN) {
      info(`[DRY] ${hook.file} → ${dst}`);
    } else {
      fs.copyFileSync(src, dst);
      success(`${hook.description} (${hook.file})`);
    }
  }

  // 4. Install encoding-japanese in hooks directory
  log('');
  log('📦 依存パッケージをインストール:');
  const pkgJsonPath = path.join(HOOKS_DIR, 'package.json');
  const pkgJson = {
    name: 'claude-code-jp-starter-hooks',
    version: '1.0.0',
    private: true,
    dependencies: {
      'encoding-japanese': '^2.2.0'
    }
  };

  if (DRY_RUN) {
    info('[DRY] encoding-japanese をインストール');
  } else {
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
    try {
      execSync('npm install --production', { cwd: HOOKS_DIR, stdio: 'pipe' });
      success('encoding-japanese ✓');
    } catch (e) {
      error('encoding-japanese のインストールに失敗: ' + e.message);
      warn('手動で実行してください: cd ' + HOOKS_DIR + ' && npm install');
    }
  }

  // 5. Copy git-security.sh
  log('');
  log('🔒 Git セキュリティフック:');
  const gitSrc = path.join(sourceDir, 'git-security.sh');
  const gitDst = path.join(HOOKS_DIR, 'git-security.sh');
  if (DRY_RUN) {
    info(`[DRY] git-security.sh → ${gitDst}`);
  } else {
    fs.copyFileSync(gitSrc, gitDst);
    try {
      execSync(`chmod +x "${gitDst}"`, { stdio: 'pipe' });
    } catch {
      // Windows — chmod not needed
    }
    success('git-security.sh (リポジトリごとに手動インストール)');
    info(`インストール方法: cp ${gitDst} .git/hooks/pre-commit`);
  }

  // 6. Merge into settings.json
  log('');
  log('⚙️  settings.json を更新:');

  const settings = readSettings();

  if (!DRY_RUN) {
    const backupPath = backupSettings();
    if (backupPath) {
      info(`バックアップ: ${backupPath}`);
    }
  }

  // Build hook entries using Claude Code's nested format:
  // { matcher: "Tool", hooks: [{ type: "command", command: "...", timeout: N }] }
  if (!settings.hooks) settings.hooks = {};

  for (const hook of HOOKS) {
    const hookPath = path.join(HOOKS_DIR, hook.file);
    const command = `node "${hookPath.replace(/\\/g, '/')}"`;

    for (const { type, matcher } of hook.hookTypes) {
      if (!settings.hooks[type]) settings.hooks[type] = [];

      // Check if this exact hook already exists (check nested hooks array)
      const exists = settings.hooks[type].some(entry => {
        if (entry.hooks && Array.isArray(entry.hooks)) {
          return entry.matcher === matcher &&
            entry.hooks.some(h => h.command === command);
        }
        // Also check flat format for compatibility
        return entry.command === command && entry.matcher === matcher;
      });

      if (!exists) {
        // Find existing entry for this matcher to append to, or create new
        let matcherEntry = settings.hooks[type].find(entry =>
          entry.matcher === matcher && entry.hooks && Array.isArray(entry.hooks)
        );

        if (matcherEntry) {
          // Append to existing matcher entry's hooks array
          matcherEntry.hooks.push({
            type: 'command',
            command: command,
            timeout: 10
          });
        } else {
          // Create new entry with nested format
          settings.hooks[type].push({
            matcher: matcher,
            hooks: [{
              type: 'command',
              command: command,
              timeout: 10
            }]
          });
        }

        if (DRY_RUN) {
          info(`[DRY] ${type}/${matcher} ← ${hook.file}`);
        }
      } else {
        if (DRY_RUN) {
          info(`[SKIP] ${type}/${matcher} — 既に設定済み`);
        }
      }
    }
  }

  if (DRY_RUN) {
    log('');
    log('設定プレビュー (hooks 部分):');
    log(JSON.stringify(settings.hooks, null, 2));
  } else {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    success('settings.json を更新しました');
  }

  // 7. Create default config files
  log('');
  log('📝 設定ファイルを作成:');

  const trustedPkgPath = path.join(CONFIG_DIR, 'trusted-packages.json');
  if (!fs.existsSync(trustedPkgPath)) {
    const defaultConfig = {
      _comment: "信頼するパッケージを追加してください。package-safety.js が参照します。",
      packages: [],
      scopes: []
    };
    if (DRY_RUN) {
      info('[DRY] trusted-packages.json を作成');
    } else {
      fs.writeFileSync(trustedPkgPath, JSON.stringify(defaultConfig, null, 2));
      success('trusted-packages.json');
    }
  } else {
    info('trusted-packages.json — 既に存在（スキップ）');
  }

  const dangerConfigPath = path.join(CONFIG_DIR, 'danger-guard.json');
  if (!fs.existsSync(dangerConfigPath)) {
    const defaultDanger = {
      _comment: "カスタム危険パターンを追加してください。danger-guard.js が参照します。",
      patterns: []
    };
    if (DRY_RUN) {
      info('[DRY] danger-guard.json を作成');
    } else {
      fs.writeFileSync(dangerConfigPath, JSON.stringify(defaultDanger, null, 2));
      success('danger-guard.json');
    }
  } else {
    info('danger-guard.json — 既に存在（スキップ）');
  }

  // 8. Optional: copy CLAUDE.md template
  if (WITH_TEMPLATE) {
    log('');
    log('📄 CLAUDE.md テンプレート:');
    const templateSrc = path.join(__dirname, 'templates', 'CLAUDE.md');
    const templateDst = path.join(process.cwd(), 'CLAUDE.md');

    if (fs.existsSync(templateDst)) {
      warn('CLAUDE.md が既に存在します。上書きしません。');
    } else if (DRY_RUN) {
      info(`[DRY] CLAUDE.md → ${templateDst}`);
    } else {
      fs.copyFileSync(templateSrc, templateDst);
      success('CLAUDE.md テンプレートをコピーしました');
    }
  }

  // Done!
  log('');
  log('━'.repeat(50));
  if (DRY_RUN) {
    log('🔍 ドライラン完了。実際にインストールするには:');
    log('   node install.js');
  } else {
    log('🎉 インストール完了！');
    log('');
    log('インストールされたフック:');
    log('  🛡️  sjis-guard    — Shift_JIS ファイル保護');
    log('  📦 package-safety — サプライチェーン攻撃防止');
    log('  🔤 ja-format      — 日英スペース自動整形');
    log('  ⛔ danger-guard   — 危険コマンドブロック');
    log('');
    log('Git pre-commit フックを有効にするには:');
    log(`  cp "${path.join(HOOKS_DIR, 'git-security.sh')}" .git/hooks/pre-commit`);
    log('');
    log('設定をカスタマイズするには:');
    log(`  ${path.join(CONFIG_DIR, 'trusted-packages.json')} — 信頼パッケージ追加`);
    log(`  ${path.join(CONFIG_DIR, 'danger-guard.json')}     — 危険パターン追加`);
  }
  log('');
}

// =====================================================================
// Uninstall
// =====================================================================

function uninstall() {
  log('');
  log('🗑️  Claude Code JP Starter — アンインストール');
  log('━'.repeat(50));

  // 1. Remove hook entries from settings.json
  if (fs.existsSync(SETTINGS_FILE)) {
    const settings = readSettings();
    if (settings.hooks) {
      let removed = 0;
      for (const hookType of Object.keys(settings.hooks)) {
        const original = settings.hooks[hookType].length;
        settings.hooks[hookType] = settings.hooks[hookType].filter(entry => {
          // Handle nested format
          if (entry.hooks && Array.isArray(entry.hooks)) {
            entry.hooks = entry.hooks.filter(h =>
              !h.command || !h.command.includes('jp-starter')
            );
            // Remove entry if no hooks left
            return entry.hooks.length > 0;
          }
          // Handle flat format
          return !entry.command || !entry.command.includes('jp-starter');
        });
        removed += original - settings.hooks[hookType].length;
        if (settings.hooks[hookType].length === 0) {
          delete settings.hooks[hookType];
        }
      }
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
      success(`settings.json から ${removed} 件のフック設定を削除`);
    }
  }

  // 2. Remove hooks directory
  if (fs.existsSync(HOOKS_DIR)) {
    fs.rmSync(HOOKS_DIR, { recursive: true, force: true });
    success(`${HOOKS_DIR} を削除`);
  }

  // Note: keep config directory (user's custom settings)
  info(`${CONFIG_DIR} は保持（ユーザー設定を含む可能性があるため）`);

  log('');
  log('🎉 アンインストール完了');
  log('');
}

// =====================================================================
// Main
// =====================================================================

if (UNINSTALL) {
  uninstall();
} else {
  install();
}
