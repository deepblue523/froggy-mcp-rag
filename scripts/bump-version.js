#!/usr/bin/env node

/**
 * Version bump script for incrementing version numbers
 * Usage:
 *   node scripts/bump-version.js patch   (1.0.0 -> 1.0.1)
 *   node scripts/bump-version.js minor   (1.0.0 -> 1.1.0)
 *   node scripts/bump-version.js major   (1.0.0 -> 2.0.0)
 *   node scripts/bump-version.js         (defaults to patch)
 */

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const currentVersion = packageJson.version;
const versionParts = currentVersion.split('.').map(Number);

const bumpType = process.argv[2] || 'patch';

let newVersion;
switch (bumpType) {
  case 'major':
    newVersion = `${versionParts[0] + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${versionParts[0]}.${versionParts[1] + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${versionParts[0]}.${versionParts[1]}.${versionParts[2] + 1}`;
    break;
}

packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`Version bumped: ${currentVersion} -> ${newVersion}`);
console.log(`\nNext steps:`);
console.log(`  1. git add package.json`);
console.log(`  2. git commit -m "Bump version to ${newVersion}"`);
console.log(`  3. git tag v${newVersion}`);
console.log(`  4. git push origin main --tags`);
console.log(`  5. npm run build:publish`);

