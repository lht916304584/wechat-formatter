/**
 * Push the current local commit to GitHub via the REST API.
 *
 * Use this when git HTTPS/SSH push is blocked but `gh api` can reach
 * api.github.com (e.g. github.com is behind a firewall).
 *
 * IMPORTANT: This script creates a new tree based on the remote parent
 * tree, preserving all unchanged files. It does NOT create a partial tree.
 *
 * Usage: node scripts/push-via-gh-api.js [remoteName=origin] [branch=master]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [, , remoteName = 'origin', branch = 'master'] = process.argv;

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
  return run(`git remote get-url ${remoteName}`);
}

function parseRepo(remoteUrl) {
  const m = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`无法解析 GitHub 仓库地址：${remoteUrl}`);
  return { owner: m[1], repo: m[2] };
}

function getLocalHeadCommit() {
  const sha = run(`git rev-parse ${branch}`);
  const message = run(`git log -1 --format=%B ${branch}`);
  return { sha, message };
}

function getChangedFiles(commitSha) {
  const out = run(`git diff-tree --no-commit-id --name-only -r ${commitSha}`);
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
  const remoteUrl = getRemoteUrl();
  const { owner, repo } = parseRepo(remoteUrl);
  const { sha: localSha, message } = getLocalHeadCommit();
  const files = getChangedFiles(localSha);

  console.log(`仓库: ${owner}/${repo}`);
  console.log(`本地 commit: ${localSha}`);
  console.log(`变更文件数: ${files.length}`);

  if (files.length === 0) {
    console.log('没有文件变更，无需推送');
    return;
  }

  // Get current remote branch ref and its tree
  const refResp = ghApi('GET', `/repos/${owner}/${repo}/git/refs/heads/${branch}`);
  const remoteSha = refResp.object.sha;
  console.log(`远程 ${branch}: ${remoteSha}`);

  const remoteCommit = ghApi('GET', `/repos/${owner}/${repo}/git/commits/${remoteSha}`);
  const parentTreeSha = remoteCommit.tree.sha;
  console.log(`远程 tree: ${parentTreeSha}`);

  // Create blobs for changed files and build tree entries
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
    treeItems.push({
      path: file.replace(/\\/g, '/'),
      mode,
      type: 'blob',
      sha: blob.sha,
    });
    console.log(`  blob: ${file} → ${blob.sha}`);
  }

  // Create tree based on remote parent tree, updating changed files
  const tree = ghApi('POST', `/repos/${owner}/${repo}/git/trees`, {
    base_tree: parentTreeSha,
    tree: treeItems,
  });
  console.log(`新 tree: ${tree.sha}`);

  // Create commit
  const commit = ghApi('POST', `/repos/${owner}/${repo}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [remoteSha],
  });
  console.log(`新 commit: ${commit.sha}`);

  // Update ref (force in case remote moved since we read it)
  ghApi('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    sha: commit.sha,
    force: true,
  });
  console.log(`已更新 refs/heads/${branch} 到 ${commit.sha}`);
  console.log('注意：本地 commit SHA 与远程不同，网络恢复后请运行 git pull --force 或 git reset --hard origin/master');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
