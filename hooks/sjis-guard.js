#!/usr/bin/env node
/**
 * SJIS Guard — Encoding Protection Hook for Claude Code
 *
 * Problem: Claude Code writes all files as UTF-8. When editing Shift_JIS,
 * EUC-JP, or ISO-2022-JP files, all Japanese text gets destroyed.
 *
 * Solution:
 *   PreToolUse (Edit|Write): Detect encoding → convert to UTF-8 → backup original
 *   PostToolUse (Edit|Write): Convert back to original encoding → delete backup
 *
 * Dependency: encoding-japanese (npm, 1.7M downloads, zero deps, pure JS)
 *
 * Hook types: PreToolUse, PostToolUse
 * Tools: Edit, Write
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// encoding-japanese: resolve from multiple locations
let Encoding;
try {
  Encoding = require('encoding-japanese');
} catch {
  // Try loading from the jp-starter install directory
  const globalPath = path.join(os.homedir(), '.claude', 'hooks', 'jp-starter', 'node_modules', 'encoding-japanese');
  try {
    Encoding = require(globalPath);
  } catch {
    // Try loading from the package's own node_modules
    const localPath = path.join(__dirname, '..', 'node_modules', 'encoding-japanese');
    Encoding = require(localPath);
  }
}

const STATE_DIR = path.join(os.tmpdir(), 'sjis-guard');

/**
 * Get state file path for a given file path (Base64-encoded key)
 */
function getStateFile(filePath) {
  const key = Buffer.from(path.resolve(filePath)).toString('base64url');
  return path.join(STATE_DIR, `${key}.json`);
}

/**
 * Detect if a buffer contains binary data (has null bytes)
 */
function isBinary(buffer) {
  for (let i = 0; i < Math.min(buffer.length, 8192); i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/**
 * Detect encoding of a file buffer using encoding-japanese
 * Returns: 'UTF8', 'SJIS', 'EUCJP', 'JIS', or null
 */
function detectEncoding(buffer) {
  if (buffer.length === 0) return 'UTF8';
  if (isBinary(buffer)) return null;

  const detected = Encoding.detect(buffer);

  // Map encoding-japanese's detection results
  const encodingMap = {
    'SJIS': 'SJIS',
    'UTF8': 'UTF8',
    'EUCJP': 'EUCJP',
    'JIS': 'JIS',
    'ASCII': 'UTF8',  // ASCII is valid UTF-8
    'UNICODE': 'UTF8', // UTF-16 → treat as UTF-8 for safety
  };

  return encodingMap[detected] || null;
}

/**
 * Extract file path from tool input
 */
function getFilePath(toolName, toolInput) {
  if (toolName === 'Edit') return toolInput.file_path;
  if (toolName === 'Write') return toolInput.file_path;
  return null;
}

/**
 * PreToolUse: Convert non-UTF-8 file to UTF-8, keep backup
 */
function handlePre(toolName, toolInput) {
  const filePath = getFilePath(toolName, toolInput);
  if (!filePath) return;

  // If file doesn't exist yet (new file), nothing to do
  if (!fs.existsSync(filePath)) return;

  const buffer = fs.readFileSync(filePath);
  const encoding = detectEncoding(buffer);

  // If UTF-8 or undetectable, nothing to do
  if (!encoding || encoding === 'UTF8') return;

  // Non-UTF-8 detected! Convert to UTF-8.
  // Create state directory
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // Create backup of original file
  const backupPath = filePath + '.sjis-backup';
  fs.copyFileSync(filePath, backupPath);

  // Convert to UTF-8 in-place
  const unicodeArray = Encoding.convert(buffer, {
    to: 'UNICODE',
    from: encoding,
    type: 'string'
  });
  fs.writeFileSync(filePath, unicodeArray, 'utf8');

  // Save state for PostToolUse
  const state = {
    originalEncoding: encoding,
    backupPath: backupPath,
    filePath: filePath,
    timestamp: Date.now()
  };
  fs.writeFileSync(getStateFile(filePath), JSON.stringify(state));

  // Notify Claude about the conversion
  const output = {
    decision: 'approve',
    reason: `[sjis-guard] ${path.basename(filePath)} は ${encoding} です。UTF-8 に一時変換しました。編集後に自動で ${encoding} に戻します。`
  };
  console.log(JSON.stringify(output));
}

/**
 * PostToolUse: Convert back to original encoding, delete backup
 */
function handlePost(toolName, toolInput) {
  const filePath = getFilePath(toolName, toolInput);
  if (!filePath) return;

  const stateFile = getStateFile(filePath);
  if (!fs.existsSync(stateFile)) return;

  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return; // Corrupted state, skip
  }

  const encoding = state.originalEncoding;
  const backupPath = state.backupPath;

  // Read the UTF-8 file that Claude just edited
  const utf8Content = fs.readFileSync(filePath, 'utf8');

  // Convert back to original encoding
  const codeArray = Encoding.stringToCode(utf8Content);
  const encodedArray = Encoding.convert(codeArray, {
    to: encoding,
    from: 'UNICODE'
  });
  const encodedBuffer = Buffer.from(encodedArray);
  fs.writeFileSync(filePath, encodedBuffer);

  // Clean up backup and state
  try { fs.unlinkSync(backupPath); } catch { /* ignore */ }
  try { fs.unlinkSync(stateFile); } catch { /* ignore */ }

  // Notify
  const output = {
    message: `[sjis-guard] ${path.basename(filePath)} を ${encoding} に復元しました。`
  };
  console.log(JSON.stringify(output));
}

/**
 * Clean up old state files (older than 1 hour)
 */
function cleanupOldState() {
  if (!fs.existsSync(STATE_DIR)) return;
  const cutoff = Date.now() - (60 * 60 * 1000);
  try {
    for (const file of fs.readdirSync(STATE_DIR)) {
      const fp = path.join(STATE_DIR, file);
      try {
        const state = JSON.parse(fs.readFileSync(fp, 'utf8'));
        if (state.timestamp < cutoff) {
          fs.unlinkSync(fp);
          // Also clean up backup if it still exists
          if (state.backupPath && fs.existsSync(state.backupPath)) {
            fs.unlinkSync(state.backupPath);
          }
        }
      } catch { /* ignore individual file errors */ }
    }
  } catch { /* ignore directory read errors */ }
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const toolName = data.tool_name;
      const toolInput = data.tool_input || {};
      const hookType = data.hook_type || '';

      // Only process Edit and Write tools
      if (toolName !== 'Edit' && toolName !== 'Write') {
        process.exit(0);
        return;
      }

      // Periodic cleanup
      cleanupOldState();

      if (hookType === 'PreToolUse') {
        handlePre(toolName, toolInput);
      } else if (hookType === 'PostToolUse') {
        handlePost(toolName, toolInput);
      }

    } catch (e) {
      // Fail open — don't block editing on errors
      console.error(`[sjis-guard] Error: ${e.message}`);
    }
    process.exit(0);
  });
}

main();
