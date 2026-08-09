import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const rootPackage = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
const requestedTag = process.argv[2] ?? 'v' + rootPackage.version;
const version = requestedTag.startsWith('v') ? requestedTag.slice(1) : requestedTag;
const changelog = await readFile(join(repoRoot, 'CHANGELOG.md'), 'utf8');
const lines = changelog.split(/\r?\n/u);
const headingPrefix = '## [' + version + '] - ';
const start = lines.findIndex(line => line.startsWith(headingPrefix));

if (start < 0) {
  throw new Error('CHANGELOG.md 缺少版本 ' + version);
}

let end = lines.length;
for (let index = start + 1; index < lines.length; index += 1) {
  if (lines[index].startsWith('## [')) {
    end = index;
    break;
  }
}

const body = lines
  .slice(start + 1, end)
  .join('\n')
  .trim();
if (!body) {
  throw new Error('CHANGELOG.md 的版本 ' + version + ' 没有正文');
}

const installNotes = [
  '### Docker',
  '',
  '~~~bash',
  'docker pull djkcyl/uno-online-server:v' + version,
  'docker pull djkcyl/uno-online-caddy:v' + version,
  '~~~',
  '',
  '### MCP',
  '',
  '~~~bash',
  'npx @uno-online/mcp@' + version,
  '~~~',
].join('\n');

process.stdout.write(body + '\n\n' + installNotes + '\n');
