import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const releaseDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(releaseDirectory, '../..');
const checkScript = join(releaseDirectory, 'check-release.mjs');
const notesScript = join(releaseDirectory, 'release-notes.mjs');
const currentVersion = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
const coreVersionMatch = /^(\d+)\.(\d+)\.(\d+)/u.exec(currentVersion);
assert.ok(coreVersionMatch, 'root package version must start with major.minor.patch');
const mismatchedVersion = coreVersionMatch[1] + '.' + coreVersionMatch[2] + '.' + (Number(coreVersionMatch[3]) + 1);

function run(script, argument) {
  return spawnSync(process.execPath, [script, argument], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('release metadata accepts the current v-prefixed version', () => {
  const result = run(checkScript, 'v' + currentVersion);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /发布元数据校验通过/u);
});

test('release metadata rejects a tag that differs from package.json', () => {
  const result = run(checkScript, 'v' + mismatchedVersion);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /与根 package\.json 版本/u);
});

test('release metadata requires the v tag prefix', () => {
  const result = run(checkScript, currentVersion);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /必须使用 v 前缀/u);
});

test('release metadata rejects build metadata', () => {
  const result = run(checkScript, 'v' + currentVersion + '+build.1');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /不允许 build metadata/u);
});

test('release notes contain versioned Docker and MCP install commands', () => {
  const result = run(notesScript, 'v' + currentVersion);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp('uno-online-server:v' + currentVersion.replaceAll('.', '\\.'), 'u'));
  assert.match(result.stdout, new RegExp('@uno-online/mcp@' + currentVersion.replaceAll('.', '\\.'), 'u'));
});
