/**
 * Recover a broken remote branch by force-pushing the current local tree
 * via the GitHub REST API.
 *
 * Use this when git push is blocked and previous API pushes accidentally
 * created partial commits (missing files from the parent tree).
 *
 * Usage: node scripts/recover-remote-via-api.js [baseRemoteRef=cf6939e]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
}

function ghApi(method, endpoint, body) {
  const args = ['api', '-X', method, endpoint];
  if (body) args.push('--input', '-');
  const result = run(`gh ${args.map(a => JSON.stringify(a)).join(' ')}`, {
    input: body ? JSON.stringify(body) : undefined,
  });
  return result ? JSON.parse(result) : null;
}

function getRemoteUrl() {
  return run('git remote get-url origin');
}

function parseRepo(remoteUrl) {
  const m = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`无法解析 GitHub 仓库地址：${remoteUrl}`);
  return { owner: m[1], repo: m[2] };
}

function getTrackedFiles() {
  const out = run('git ls-files');
  return out ? out.split('\n').filter(Boolean) : [];
}

function createBlob(owner, repo, content) {
  return ghApi('POST', `/repos/${owner}/${repo}/git/blobs`, { content, encoding: 'utf-8' });
}

function createBlobFromBuffer(owner, repo, buffer) {
  return ghApi('POST', `/repos/${owner}/${repo}/git/blobs`, {
    content: buffer.toString('base64'),
    encoding: 'base64',
  });
}

function isExec(mode) {
  return (mode & 0o111) !== 0;
}

async function main() {
  const baseRef = process.argv[2] || 'cf6939e';
  const remoteUrl = getRemoteUrl();
  const { owner, repo } = parseRepo(remoteUrl);

  console.log(`仓库: ${owner}/${repo}`);
  console.log(`基准远程 commit: ${baseRef}`);

  const baseCommit = ghApi('GET', `/repos/${owner}/${repo}/git/commits/${baseRef}`);
  const baseTreeSha = baseCommit.tree.sha;
  console.log(`基准 tree: ${baseTreeSha}`);

  const files = getTrackedFiles();
  console.log(`本地跟踪文件数: ${files.length}`);

  const treeItems = [];
  for (const file of files) {
    const fullPath = path.resolve(file);
    const stat = fs.statSync(fullPath);
    const mode = isExec(stat.mode) ? '100755' : '100644';
    const content = fs.readFileSync(fullPath);
    let blob;
    if (content.includes('\0')) {
      blob = createBlobFromBuffer(owner, repo, content);
    } else {
      blob = createBlob(owner, repo, content.toString('utf8'));
    }
    treeItems.push({ path: file.replace(/\\/g, '/'), mode, type: 'blob', sha: blob.sha });
    if (files.length <= 50 || treeItems.length % 10 === 0) {
      console.log(`  blob ${treeItems.length}/${files.length}: ${file}`);
    }
  }

  const tree = ghApi('POST', `/repos/${owner}/${repo}/git/trees`, { tree: treeItems });
  console.log(`新 tree: ${tree.sha}`);

  const localMessage = run('git log -1 --format=%B');
  const commit = ghApi('POST', `/repos/${owner}/${repo}/git/commits`, {
    message: localMessage,
    tree: tree.sha,
    parents: [baseCommit.sha],
  });
  console.log(`新 commit: ${commit.sha}`);

  ghApi('PATCH', `/repos/${owner}/${repo}/git/refs/heads/master`, {
    sha: commit.sha,
    force: true,
  });
  console.log(`已强制更新 refs/heads/master 到 ${commit.sha}`);
  console.log('注意：本地 commit SHA 与远程不同，网络恢复后请运行 git pull --force 或 git reset --hard origin/master');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
