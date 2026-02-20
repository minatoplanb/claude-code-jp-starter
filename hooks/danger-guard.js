#!/usr/bin/env node
/**
 * Danger Guard — Dangerous Command Blocker for Claude Code
 *
 * Blocks potentially destructive commands like rm -rf, force push, DROP TABLE, etc.
 * Configurable via ~/.claude/jp-starter/danger-guard.json
 *
 * Hook type: PreToolUse
 * Tools: Bash
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Built-in dangerous command patterns
const DANGEROUS_PATTERNS = [
  // Destructive file operations
  { pattern: /rm\s+-[^\s]*r[^\s]*f[^\s]*\s+[\/~.]/, label: 'rm -rf (再帰的強制削除)' },
  { pattern: /rm\s+-[^\s]*f[^\s]*r[^\s]*\s+[\/~.]/, label: 'rm -rf (再帰的強制削除)' },
  { pattern: /rm\s+-rf\s+\/(?!\S*tmp)/, label: 'rm -rf / (ルートディレクトリ削除)' },

  // Git force push to main/master
  { pattern: /git\s+push\s+.*--force.*(?:main|master)/, label: 'force push to main/master' },
  { pattern: /git\s+push\s+-f\s+.*(?:main|master)/, label: 'force push to main/master' },
  { pattern: /git\s+push\s+.*(?:main|master).*--force/, label: 'force push to main/master' },

  // Git destructive operations
  { pattern: /git\s+reset\s+--hard/, label: 'git reset --hard (変更を全て破棄)' },
  { pattern: /git\s+clean\s+-[^\s]*f/, label: 'git clean -f (未追跡ファイルを削除)' },

  // SQL destructive operations
  { pattern: /drop\s+(table|database|schema)\s/i, label: 'DROP TABLE/DATABASE (データ削除)' },
  { pattern: /truncate\s+table\s/i, label: 'TRUNCATE TABLE (データ全削除)' },
  { pattern: /delete\s+from\s+\w+\s*;?\s*$/i, label: 'DELETE FROM without WHERE (全行削除)' },

  // System-level dangerous commands
  { pattern: /mkfs\./, label: 'mkfs (ディスクフォーマット)' },
  { pattern: /dd\s+if=.*of=\/dev\//, label: 'dd to device (ディスク上書き)' },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, label: 'fork bomb' },

  // chmod/chown dangerous patterns
  { pattern: /chmod\s+-R\s+777\s+\//, label: 'chmod -R 777 / (全権限変更)' },
  { pattern: /chown\s+-R\s+.*\s+\/(?!\S)/, label: 'chown -R on / (所有者変更)' },
];

/**
 * Load user's custom dangerous patterns from config file
 */
function loadUserPatterns() {
  const configPath = path.join(os.homedir(), '.claude', 'jp-starter', 'danger-guard.json');
  const userPatterns = [];
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (Array.isArray(config.patterns)) {
        for (const p of config.patterns) {
          if (p.regex && p.label) {
            userPatterns.push({
              pattern: new RegExp(p.regex, p.flags || ''),
              label: p.label
            });
          }
        }
      }
    }
  } catch {
    // Ignore config errors
  }
  return userPatterns;
}

function main() {
  const userPatterns = loadUserPatterns();
  const allPatterns = [...DANGEROUS_PATTERNS, ...userPatterns];

  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      if (data.tool_name !== 'Bash') {
        process.exit(0);
        return;
      }

      const command = (data.tool_input || {}).command || '';

      for (const { pattern, label } of allPatterns) {
        if (pattern.test(command)) {
          const output = {
            decision: 'block',
            reason: `危険なコマンドを検出しました: ${label}\n\nコマンド: ${command}\n\nこのコマンドは取り消しが困難です。本当に実行する場合は、ターミナルで直接実行してください。`
          };
          console.log(JSON.stringify(output));
          process.exit(0);
          return;
        }
      }

    } catch (e) {
      console.error(`[danger-guard] Error: ${e.message}`);
    }
    process.exit(0);
  });
}

main();
