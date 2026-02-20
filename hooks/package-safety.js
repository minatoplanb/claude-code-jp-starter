#!/usr/bin/env node
/**
 * Package Safety — Supply Chain Attack Protection for Claude Code
 *
 * Intercepts npm/yarn/pnpm/bun install commands and blocks unknown packages.
 * Prevents typosquatting, malicious packages, and accidental installs.
 *
 * Trusted packages can be extended via:
 *   ~/.claude/jp-starter/trusted-packages.json
 *
 * Hook type: PreToolUse
 * Tools: Bash
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// =====================================================================
// Core trusted packages — widely used, well-maintained packages
// =====================================================================
const TRUSTED_PACKAGES = new Set([
  // Build tools
  'vite', 'webpack', 'esbuild', 'rollup', 'parcel', 'turbo', 'tsup', 'unbuild',
  // Frameworks
  'react', 'react-dom', 'next', 'vue', 'nuxt', 'svelte', 'angular', 'express',
  'fastify', 'hono', 'koa', 'nest', '@nestjs/core', '@nestjs/common',
  'expo', 'react-native', 'astro',
  // TypeScript
  'typescript', 'ts-node', 'tsx', '@types/node', '@types/react', '@types/react-dom',
  // Testing
  'jest', 'vitest', 'mocha', 'chai', 'cypress', 'playwright', '@playwright/test',
  'supertest', '@testing-library/react', '@testing-library/jest-dom',
  // Linting / Formatting
  'eslint', 'prettier', 'biome', '@biomejs/biome', 'stylelint',
  // CSS / UI
  'tailwindcss', 'postcss', 'autoprefixer', 'sass', 'less',
  'styled-components', 'lucide-react',
  'class-variance-authority', 'clsx', 'tailwind-merge',
  // State management
  'zustand', 'jotai', 'recoil', 'redux', '@reduxjs/toolkit', 'mobx',
  // Data fetching
  'axios', 'swr', '@tanstack/react-query', 'ky', 'got', 'node-fetch',
  // Database / ORM
  'prisma', '@prisma/client', 'drizzle-orm', 'sequelize', 'mongoose', 'knex',
  'better-sqlite3', 'pg', 'mysql2',
  // Auth
  'next-auth', '@auth/core', 'passport', 'jsonwebtoken', 'bcrypt', 'bcryptjs',
  // Validation
  'zod', 'yup', 'joi', 'ajv',
  // Utils
  'lodash', 'ramda', 'date-fns', 'dayjs', 'moment', 'uuid', 'nanoid',
  'dotenv', 'cross-env', 'concurrently', 'nodemon',
  'chalk', 'commander', 'yargs', 'inquirer', 'ora', 'glob', 'minimatch',
  'fs-extra', 'rimraf', 'mkdirp', 'semver',
  // Firebase
  'firebase', 'firebase-admin', 'firebase-functions', 'firebase-tools',
  // Cloud
  '@aws-sdk/client-s3', '@google-cloud/storage', 'stripe',
  // AI SDKs
  '@anthropic-ai/sdk', 'openai', '@google/generative-ai',
  // Routers
  'react-router-dom',
  // PWA
  'vite-plugin-pwa',
  // Astro plugins
  '@astrojs/mdx', '@astrojs/sitemap', '@astrojs/rss', '@astrojs/tailwind',
  // Image processing
  'sharp',
  // CLI tools
  'wrangler', 'vercel', 'zenn-cli',
  // Encoding (for sjis-guard)
  'encoding-japanese',
  // YAML
  'yaml',
  // Monorepo
  'lerna', 'nx', 'changesets', '@changesets/cli',
]);

// Trusted scopes — any package under these scopes is allowed
const TRUSTED_SCOPES = new Set([
  '@types', '@babel', '@rollup', '@esbuild', '@vitejs',
  '@react-native', '@expo', '@firebase',
  '@tanstack', '@radix-ui', '@headlessui',
  '@testing-library', '@playwright',
  '@nestjs', '@trpc',
  '@anthropic-ai', '@aws-sdk', '@google-cloud',
  '@tailwindcss', '@biomejs',
  '@astrojs',
  '@modelcontextprotocol',
]);

// Suspicious patterns
const SUSPICIOUS_PATTERNS = [
  /shai.?hulud/i,
  /antigravity/i,
  /[0-9]{5,}/,           // Long number sequences in names
  /^[a-z]-[a-z]$/,       // Single letter packages like "a-b"
  /.{50,}/,              // Extremely long names
  /--/,                   // Double hyphens (typosquatting)
  /\.(js|ts|sh|exe|bat)$/, // File extensions in names
];

/**
 * Load user's custom trusted packages from config file
 */
function loadUserTrusted() {
  const configPath = path.join(os.homedir(), '.claude', 'jp-starter', 'trusted-packages.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (Array.isArray(config.packages)) {
        config.packages.forEach(pkg => TRUSTED_PACKAGES.add(pkg));
      }
      if (Array.isArray(config.scopes)) {
        config.scopes.forEach(scope => TRUSTED_SCOPES.add(scope));
      }
    }
  } catch {
    // Ignore config errors — use defaults
  }
}

function parsePackageInstallCommand(command) {
  // Strip shell operators before parsing
  const sanitized = command
    .replace(/\s*\d*>[>&]?\s*\S+/g, '')   // redirects
    .replace(/\s*\|.*$/g, '')              // pipes
    .replace(/\s*&&.*$/g, '')              // chained commands
    .replace(/\s*;.*$/g, '')               // sequential commands
    .trim();

  const installPatterns = [
    /npm\s+(?:install|i|add)\s+(.+)/i,
    /npx\s+(.+)/i,
    /yarn\s+(?:add|global\s+add)\s+(.+)/i,
    /pnpm\s+(?:add|install)\s+(.+)/i,
    /bun\s+(?:add|install)\s+(.+)/i,
  ];

  for (const pattern of installPatterns) {
    const match = sanitized.match(pattern);
    if (match) {
      const args = match[1].trim();
      const packages = args.split(/\s+/)
        .filter(arg => !arg.startsWith('-'))
        .filter(arg => arg.length > 0)
        .reduce((acc, part) => {
          if (part.startsWith('@') && !part.includes('/')) {
            acc.push(part);
          } else if (acc.length > 0 && acc[acc.length - 1].startsWith('@') && !acc[acc.length - 1].includes('/')) {
            acc[acc.length - 1] = acc[acc.length - 1] + '/' + part;
          } else {
            acc.push(part);
          }
          return acc;
        }, [])
        .map(p => p.replace(/@[\^~]?[\d.*]+.*$/, '').replace(/@latest$/, ''));

      if (/npx/i.test(command) && packages.length > 0) {
        return { isInstall: true, packages: [packages[0]], isNpx: true };
      }
      return { isInstall: true, packages, isNpx: /npx/i.test(command) };
    }
  }

  if (/^(npm|yarn|pnpm|bun)\s+(install|i|ci)\s*$/.test(command.trim())) {
    return { isInstall: true, packages: [], isFromLockfile: true };
  }

  return { isInstall: false, packages: [] };
}

function checkPackage(name) {
  if (!name || name.length === 0) return { safe: true };
  if (TRUSTED_PACKAGES.has(name)) return { safe: true };

  const scope = name.match(/^(@[^/]+)\//);
  if (scope && TRUSTED_SCOPES.has(scope[1])) return { safe: true };

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(name)) {
      return { safe: false, reason: `不審なパターンに一致: ${pattern}` };
    }
  }

  return { safe: false, reason: '信頼リストに未登録' };
}

function main() {
  loadUserTrusted();

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
      const parsed = parsePackageInstallCommand(command);

      if (!parsed.isInstall || parsed.isFromLockfile || parsed.packages.length === 0) {
        process.exit(0);
        return;
      }

      const flagged = [];
      for (const pkg of parsed.packages) {
        const result = checkPackage(pkg);
        if (!result.safe) {
          flagged.push({ name: pkg, reason: result.reason });
        }
      }

      if (flagged.length > 0) {
        const warnings = flagged.map(f => `  - "${f.name}" (${f.reason})`).join('\n');
        const configPath = path.join('~', '.claude', 'jp-starter', 'trusted-packages.json');
        const output = {
          decision: 'block',
          reason: `パッケージ安全チェック: 以下のパッケージを確認してください:\n${warnings}\n\nインストール前に:\n1. npmjs.com で実在するか確認\n2. ダウンロード数とメンテナーを確認\n3. パッケージ名が正しいか確認（タイポスクワッティング注意）\n\n信頼リストに追加する場合:\n  ${configPath}`
        };
        console.log(JSON.stringify(output));
      }

    } catch (e) {
      console.error(`[package-safety] Error: ${e.message}`);
    }
    process.exit(0);
  });
}

main();
