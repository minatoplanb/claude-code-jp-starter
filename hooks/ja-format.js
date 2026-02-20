#!/usr/bin/env node
/**
 * Japanese Format — Auto-insert spaces between Japanese and ASCII characters
 *
 * Based on wasabeef's ja-space-format.sh (macOS-only bash + sed).
 * This version uses pure Node.js for cross-platform compatibility (Windows/macOS/Linux).
 *
 * Rules:
 *   日本語ABC → 日本語 ABC
 *   ABC日本語 → ABC 日本語
 *
 * Characters matched: Hiragana, Katakana, CJK Unified Ideographs, CJK Extension A
 *
 * Hook type: PostToolUse
 * Tools: Edit, Write
 */

const fs = require('fs');
const path = require('path');

// Japanese character ranges (same as wasabeef's regex)
// ぁ-ゟ  Hiragana
// ァ-ヿ  Katakana
// 一-鿿  CJK Unified Ideographs
// 㐀-䶿  CJK Extension A
const JP_CHAR = '[\\u3041-\\u309F\\u30A1-\\u30FF\\u4E00-\\u9FFF\\u3400-\\u4DBF]';
const ASCII_ALNUM = '[a-zA-Z0-9]';

// Insert space: Japanese followed by ASCII
const JP_THEN_ASCII = new RegExp(`(${JP_CHAR})(${ASCII_ALNUM})`, 'g');
// Insert space: ASCII followed by Japanese
const ASCII_THEN_JP = new RegExp(`(${ASCII_ALNUM})(${JP_CHAR})`, 'g');

// File extensions to format (only text files that might have mixed JP/ASCII)
const TARGET_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt',
  '.js', '.jsx', '.ts', '.tsx',
  '.vue', '.svelte', '.astro',
  '.html', '.css', '.scss',
  '.json', '.yaml', '.yml',
  '.py', '.rb', '.go', '.rs',
]);

/**
 * Check if a line is inside a code block or inline code
 * We skip formatting inside code to avoid breaking syntax
 */
function isCodeContext(line) {
  // Skip lines that are part of code blocks (indented or fenced)
  if (line.match(/^```/) || line.match(/^    /)) return true;
  return false;
}

/**
 * Format a single line: add spaces between Japanese and ASCII characters
 * Preserves code blocks, URLs, and inline code
 */
function formatLine(line) {
  // Skip code fence lines
  if (line.match(/^```/)) return line;
  // Skip indented code blocks
  if (line.match(/^    \S/)) return line;

  // Process the line, but protect inline code and URLs
  let result = '';
  let inCode = false;
  let i = 0;

  while (i < line.length) {
    if (line[i] === '`') {
      // Toggle inline code mode
      inCode = !inCode;
      result += line[i];
      i++;
    } else if (!inCode && line.substring(i).match(/^https?:\/\/\S+/)) {
      // Skip URLs
      const urlMatch = line.substring(i).match(/^https?:\/\/\S+/);
      result += urlMatch[0];
      i += urlMatch[0].length;
    } else {
      result += line[i];
      i++;
    }
  }

  // If the line has inline code, we need to format only the non-code parts
  if (line.includes('`')) {
    const parts = [];
    let current = '';
    let inBacktick = false;
    for (let j = 0; j < result.length; j++) {
      if (result[j] === '`') {
        if (inBacktick) {
          current += '`';
          parts.push({ text: current, isCode: true });
          current = '';
          inBacktick = false;
        } else {
          if (current) parts.push({ text: current, isCode: false });
          current = '`';
          inBacktick = true;
        }
      } else {
        current += result[j];
      }
    }
    if (current) parts.push({ text: current, isCode: inBacktick });

    return parts.map(p => {
      if (p.isCode) return p.text;
      return p.text
        .replace(JP_THEN_ASCII, '$1 $2')
        .replace(ASCII_THEN_JP, '$1 $2');
    }).join('');
  }

  // No inline code — format the whole line
  return result
    .replace(JP_THEN_ASCII, '$1 $2')
    .replace(ASCII_THEN_JP, '$1 $2');
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

      if (toolName !== 'Edit' && toolName !== 'Write') {
        process.exit(0);
        return;
      }

      const filePath = toolInput.file_path;
      if (!filePath) {
        process.exit(0);
        return;
      }

      // Check file extension
      const ext = path.extname(filePath).toLowerCase();
      if (!TARGET_EXTENSIONS.has(ext)) {
        process.exit(0);
        return;
      }

      // Read and format
      if (!fs.existsSync(filePath)) {
        process.exit(0);
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      let inCodeBlock = false;
      const lines = content.split('\n');
      const formatted = lines.map(line => {
        // Track fenced code blocks
        if (line.match(/^```/)) {
          inCodeBlock = !inCodeBlock;
          return line;
        }
        if (inCodeBlock) return line;
        return formatLine(line);
      });

      const result = formatted.join('\n');

      // Only write if something changed
      if (result !== content) {
        fs.writeFileSync(filePath, result, 'utf8');
        const output = {
          message: `[ja-format] ${path.basename(filePath)} の日本語・ASCII 間にスペースを挿入しました。`
        };
        console.log(JSON.stringify(output));
      }

    } catch (e) {
      console.error(`[ja-format] Error: ${e.message}`);
    }
    process.exit(0);
  });
}

main();
