#!/usr/bin/env node

/**
 * Bump the version in src/version.ts and package.json based on
 * conventional commit prefix (feat/fix/breaking).
 *
 * Usage:
 *   node scripts/bump-version.mjs patch   # bug fixes
 *   node scripts/bump-version.mjs minor   # new features
 *   node scripts/bump-version.mjs major   # breaking changes
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const bump = process.argv[2] || 'patch';
if (!['major', 'minor', 'patch'].includes(bump)) {
  console.error('Usage: bump-version.mjs [major|minor|patch]');
  process.exit(1);
}

// Read current version from src/version.ts
const versionFile = resolve(root, 'src/version.ts');
const versionContent = readFileSync(versionFile, 'utf-8');
const match = versionContent.match(/VERSION = '(\d+)\.(\d+)\.(\d+)'/);
if (!match) {
  console.error('Could not parse version from src/version.ts');
  process.exit(1);
}

let [, major, minor, patch] = match.map(Number);

if (bump === 'major') { major++; minor = 0; patch = 0; }
else if (bump === 'minor') { minor++; patch = 0; }
else { patch++; }

const newVersion = `${major}.${minor}.${patch}`;

// Update src/version.ts
writeFileSync(versionFile, `export const VERSION = '${newVersion}';\n`);

// Update package.json
const pkgFile = resolve(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgFile, 'utf-8'));
pkg.version = newVersion;
writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Bumped version to ${newVersion}`);
