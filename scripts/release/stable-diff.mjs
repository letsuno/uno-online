import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const targetRef = process.argv[3] ?? 'HEAD';
const stableTagPattern = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

function git(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `git ${args.join(' ')} 执行失败\n`);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

const requestedTag = process.argv[2];
const stableTag =
  requestedTag ??
  git(['tag', '--merged', targetRef, '--list', 'v*', '--sort=-version:refname'])
    .split(/\r?\n/u)
    .find(tag => stableTagPattern.test(tag));

if (!stableTag) {
  console.error('没有找到可达的正式版 Tag；请先执行 git fetch --tags --prune。');
  process.exit(1);
}
if (!stableTagPattern.test(stableTag)) {
  console.error(`正式版基线必须是 vX.Y.Z，不能使用预发布 Tag：${stableTag}`);
  process.exit(1);
}

git(['merge-base', '--is-ancestor', stableTag, targetRef]);
const range = `${stableTag}..${targetRef}`;

console.log(`正式版基线：${stableTag}`);
console.log(`比较范围：${range}`);
console.log('\n提交记录\n');
console.log(git(['log', '--oneline', '--no-merges', range]) || '（没有提交）');
console.log('\n差异统计\n');
console.log(git(['diff', '--stat', range]) || '（没有差异）');
console.log('\n文件变更\n');
console.log(git(['diff', '--name-status', range]) || '（没有差异）');
