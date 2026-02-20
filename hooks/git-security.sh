#!/bin/bash
# =============================================================
# Git Security — Pre-Commit Hook for Claude Code Projects
#
# Blocks sensitive files and content from being committed.
# Part of claude-code-jp-starter.
#
# Install into any repo:
#   cp ~/.claude/hooks/jp-starter/git-security.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Custom blocked strings: create .claude-jp-security.json in repo root
#   { "blocked_strings": ["secret_term_1", "secret_term_2"] }
# =============================================================

echo "🔒 Pre-commit security check..."
FAILED=0

STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
if [ -z "$STAGED_FILES" ]; then
  echo "✅ No staged files."
  exit 0
fi

# --- 1. Blocked exact filenames ---
BLOCKED_EXACT=(
  "CLAUDE.md"
)

for blocked in "${BLOCKED_EXACT[@]}"; do
  if echo "$STAGED_FILES" | grep -qx "$blocked" 2>/dev/null; then
    echo "❌ BLOCKED FILE: $blocked"
    FAILED=1
  fi
done

# --- 2. Blocked directory prefixes ---
BLOCKED_DIRS=(
  ".claude/"
  "docs/"
)

for prefix in "${BLOCKED_DIRS[@]}"; do
  MATCHES=$(echo "$STAGED_FILES" | grep "^${prefix}" 2>/dev/null || true)
  if [ -n "$MATCHES" ]; then
    echo "❌ BLOCKED DIRECTORY: $MATCHES"
    FAILED=1
  fi
done

# --- 3. Blocked file extensions ---
BLOCKED_EXT=(
  ".docx"
  ".doc"
  ".pdf"
  ".key"
  ".pem"
  ".p12"
  ".keystore"
)

for ext in "${BLOCKED_EXT[@]}"; do
  MATCHES=$(echo "$STAGED_FILES" | grep "${ext}$" 2>/dev/null || true)
  if [ -n "$MATCHES" ]; then
    echo "❌ BLOCKED EXTENSION: $MATCHES"
    FAILED=1
  fi
done

# --- 4. Env files (exclude .example files and next-env.d.ts) ---
ENV_FILES=$(echo "$STAGED_FILES" | grep -E '\.env($|\.[^e])' | grep -v '\.example$' 2>/dev/null || true)
if [ -n "$ENV_FILES" ]; then
  echo "❌ BLOCKED ENV FILE: $ENV_FILES"
  FAILED=1
fi

# --- 5. Files with "secret" or "credential" in the name ---
SENSITIVE=$(echo "$STAGED_FILES" | grep -iE 'secret|credential' 2>/dev/null || true)
if [ -n "$SENSITIVE" ]; then
  echo "❌ BLOCKED SENSITIVE FILE: $SENSITIVE"
  FAILED=1
fi

# --- 6. Content checks ---
STAGED_DIFF=$(git diff --cached -U0 2>/dev/null || true)

# Load custom blocked strings from .claude-jp-security.json if it exists
CUSTOM_BLOCKED=()
if [ -f ".claude-jp-security.json" ]; then
  # Parse JSON array using basic text processing (no jq dependency)
  while IFS= read -r line; do
    # Extract strings between quotes in blocked_strings array
    term=$(echo "$line" | sed -n 's/.*"\([^"]*\)".*/\1/p')
    if [ -n "$term" ] && [ "$term" != "blocked_strings" ]; then
      CUSTOM_BLOCKED+=("$term")
    fi
  done < ".claude-jp-security.json"
fi

# Check custom blocked strings
for term in "${CUSTOM_BLOCKED[@]}"; do
  if echo "$STAGED_DIFF" | grep -qF "+$term" 2>/dev/null; then
    echo "❌ BLOCKED CONTENT: Found '$term' in staged changes"
    FAILED=1
  fi
done

# API key patterns (always checked)
if echo "$STAGED_DIFF" | grep -E '^\+.*sk-ant-[a-zA-Z0-9]' 2>/dev/null | grep -qv 'process\.env' 2>/dev/null; then
  echo "❌ BLOCKED: Possible Anthropic API key"
  FAILED=1
fi
if echo "$STAGED_DIFF" | grep -E '^\+.*sk-proj-[a-zA-Z0-9]' 2>/dev/null | grep -qv 'process\.env' 2>/dev/null; then
  echo "❌ BLOCKED: Possible OpenAI API key"
  FAILED=1
fi
if echo "$STAGED_DIFF" | grep -E '^\+.*(ghp_|gho_)[a-zA-Z0-9]{20,}' 2>/dev/null; then
  echo "❌ BLOCKED: Possible GitHub token"
  FAILED=1
fi

# --- Result ---
if [ $FAILED -eq 1 ]; then
  echo ""
  echo "🚫 コミットを拒否しました。機密ファイル・内容を削除してからコミットしてください。"
  echo "   ステージ解除: git reset HEAD <file>"
  echo "   差分確認:     git diff --cached"
  exit 1
fi

echo "✅ Security check passed."
