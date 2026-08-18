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
const checkScriptSource = readFileSync(checkScript, 'utf8');
const stableDiffScript = readFileSync(join(releaseDirectory, 'stable-diff.mjs'), 'utf8');
const releaseWorkflow = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8');
const composeDefinition = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf8');
const betaComposeDefinition = readFileSync(join(repoRoot, 'docker-compose.beta.yml'), 'utf8');
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

test('stable release preparation compares against a stable tag with git diff', () => {
  assert.match(stableDiffScript, /stableTagPattern/u);
  assert.ok(stableDiffScript.includes("git(['diff', '--stat', range])"));
  assert.ok(stableDiffScript.includes("git(['diff', '--name-status', range])"));
});

test('stable client changelog replaces prerelease entries instead of retaining them', () => {
  assert.ok(checkScriptSource.includes('clientVersions[0] !== version'));
  assert.ok(checkScriptSource.includes("candidate.startsWith(version + '-')"));
  assert.match(checkScriptSource, /正式版客户端 changelog 不能保留同版本预发布条目/u);
});

test('release workflow can recover an existing tag from the default branch', () => {
  assert.match(releaseWorkflow, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*tag:/u);
  assert.ok(releaseWorkflow.includes('RELEASE_TAG: ${{ inputs.tag || github.ref_name }}'));
  assert.ok(releaseWorkflow.includes('ref: ${{ env.RELEASE_TAG }}'));
  assert.ok(releaseWorkflow.includes('refs/tags/$RELEASE_TAG^{commit}'));
});

test('release workflow keeps prereleases away from stable distribution tags', () => {
  const dockerVersionRule = 'type=raw,value=${{ env.RELEASE_TAG }}';
  const dockerLatestRule = "type=raw,value=latest,enable=${{ !contains(env.RELEASE_TAG, '-') }}";
  const dockerBetaRule = "type=raw,value=beta,enable=${{ contains(env.RELEASE_TAG, '-beta.') }}";
  assert.equal(releaseWorkflow.split(dockerVersionRule).length - 1, 2);
  assert.equal(releaseWorkflow.split(dockerLatestRule).length - 1, 2);
  assert.equal(releaseWorkflow.split(dockerBetaRule).length - 1, 2);
  assert.ok(releaseWorkflow.includes('if [[ "$version" == *-* ]]; then'));
  assert.ok(releaseWorkflow.includes('prerelease_tag=${version#*-}'));
  assert.ok(releaseWorkflow.includes('publish_args+=(--tag "$prerelease_tag")'));
  assert.ok(releaseWorkflow.includes('elif [[ "$RELEASE_TAG" == *-* ]]; then'));
});

test('compose exposes concrete stable and beta image channels for deployment tooling', () => {
  assert.ok(composeDefinition.includes('djkcyl/uno-online-server:latest'));
  assert.ok(composeDefinition.includes('djkcyl/uno-online-caddy:latest'));
  assert.ok(betaComposeDefinition.includes('djkcyl/uno-online-server:beta'));
  assert.ok(betaComposeDefinition.includes('djkcyl/uno-online-caddy:beta'));
  assert.doesNotMatch(composeDefinition + betaComposeDefinition, /UNO_IMAGE_TAG/u);
  assert.ok(composeDefinition.includes("fetch('http://127.0.0.1:3001/api/health')"));
  assert.ok(composeDefinition.includes('http://127.0.0.1:2019/config/'));
  assert.match(composeDefinition, /server:\s*\n\s*condition: service_healthy/u);
});
