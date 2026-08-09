import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const packagesRoot = join(repoRoot, 'packages');
const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$(){}|[\]\\]/gu, '\\$&');
}

const rootPackage = await readJson(join(repoRoot, 'package.json'));
const requestedTag = process.argv[2] ?? 'v' + rootPackage.version;
const version = requestedTag.startsWith('v') ? requestedTag.slice(1) : requestedTag;
const errors = [];

if (!releaseVersionPattern.test(version)) {
  errors.push('版本号必须是 SemVer，允许 prerelease，但不允许 build metadata: ' + version);
} else {
  const prerelease = version.split('-', 2)[1];
  if (
    prerelease
      ?.split('.')
      .some(identifier => /^\d+$/u.test(identifier) && identifier.length > 1 && identifier[0] === '0')
  ) {
    errors.push('SemVer prerelease 的纯数字标识不能包含前导零: ' + version);
  }
}
if (requestedTag !== 'v' + version) {
  errors.push('发布 Tag 必须使用 v 前缀: v' + version);
}
if (rootPackage.version !== version) {
  errors.push('Tag ' + requestedTag + ' 与根 package.json 版本 ' + rootPackage.version + ' 不一致');
}

const packageEntries = (await readdir(packagesRoot, { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name));
const workspacePackages = [];

for (const entry of packageEntries) {
  const packagePath = join(packagesRoot, entry.name, 'package.json');
  const packageJson = await readJson(packagePath);
  workspacePackages.push({ directory: entry.name, packageJson });
  if (packageJson.version !== version) {
    errors.push('packages/' + entry.name + '/package.json 版本为 ' + packageJson.version + '，应为 ' + version);
  }
}

const mcpPackage = workspacePackages.find(entry => entry.packageJson.name === '@uno-online/mcp');
if (!mcpPackage) {
  errors.push('缺少 @uno-online/mcp workspace');
} else if (mcpPackage.packageJson.private === true) {
  errors.push('@uno-online/mcp 不能标记为 private');
}

const changelog = await readFile(join(repoRoot, 'CHANGELOG.md'), 'utf8');
const changelogHeading = new RegExp('^## \\[' + escapeRegExp(version) + '\\] - \\d{4}-\\d{2}-\\d{2}$', 'mu');
if (!changelogHeading.test(changelog)) {
  errors.push('CHANGELOG.md 缺少版本标题: ## [' + version + '] - YYYY-MM-DD');
}

const clientChangelog = await readFile(
  join(repoRoot, 'packages', 'client', 'src', 'shared', 'data', 'changelog.ts'),
  'utf8',
);
const clientVersion = new RegExp('version:\\s*[\'"]' + escapeRegExp(version) + '[\'"]', 'u');
if (!clientVersion.test(clientChangelog)) {
  errors.push('客户端 changelog 缺少版本 ' + version);
}

if (errors.length > 0) {
  console.error('发布元数据校验失败:\n' + errors.map(error => '  - ' + error).join('\n'));
  process.exit(1);
}

console.log(
  '发布元数据校验通过: ' +
    requestedTag +
    '；workspace 包 ' +
    workspacePackages.length +
    ' 个；CHANGELOG 与客户端 changelog 已同步。',
);
