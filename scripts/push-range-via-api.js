/**
 * Push a range of local commits to GitHub via the REST API, preserving
 * commit history. Use when git HTTPS/SSH push is blocked but `gh api`
 * can reach api.github.com.
 *
 * Each commit is replayed in order against the remote tree:
 *   - Read files at that commit via `git show <sha>:<path>`
 *   - Build tree based on current remote tree
 *   - Create commit with parent = current remote HEAD
 *   - Force-update remote ref
 *
 * Usage: node scripts/push-range-via-api.js <fromSha> <toSha>
 *   (commits in (fromSha, toSha] are pushed in chronological order)
 */

const { execSync } = require('child_process');

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

function parseRepo(remoteUrl) {
  const m = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`无法解析 GitHub 仓库地址：${remoteUrl}`);
  return { owner: m[1], repo: m[2] };
}

function listCommitsToPush(fromSha, toSha) {
  // git rev-list returns oldest-first by default when args are in this order
  const out = run(`git rev-list --reverse --no-commit-header ${fromSha}..${toSha}`);
  return out ? out.split('\n').filter(Boolean) : [];
}

function getCommitMessage(sha) {
  return run(`git log -1 --format=%B ${sha}`);
}

function getChangedFiles(sha) {
  const out = run(`git diff-tree --no-commit-id --name-only -r ${sha}`);
  return out ? out.split('\n').filter(Boolean) : [];
}

function getFileModeAtCommit(sha, filePath) {
  try {
    const posixPath = filePath.replace(/\\/g, '/');
    const line = run(`git ls-tree ${sha} -- ${posixPath}`);
    if (!line) return '100644';
    const parts = line.split(/\s+/);
    return parts[0] || '100644';
  } catch {
    return '100644';
  }
}

function readFileAtCommit(sha, filePath) {
  // Returns Buffer; throws if file was deleted in this commit
  const posixPath = filePath.replace(/\\/g, '/');
  return execSync(`git show ${sha}:${posixPath}`);
}

function createBlobFromBuffer(owner, repo, buffer) {
  return ghApi('POST', `/repos/${owner}/${repo}/git/blobs`, {
    content: buffer.toString('base64'),
    encoding: 'base64',
  });
}

async function main() {
  const fromSha = process.argv[2];
  const toSha = process.argv[3] || 'HEAD';
  if (!fromSha) {
    console.error('Usage: node scripts/push-range-via-api.js <fromSha> [toSha]');
    process.exit(1);
  }

  const remoteUrl = run('git remote get-url origin');
  const { owner, repo } = parseRepo(remoteUrl);
  const commits = listCommitsToPush(fromSha, toSha);

  console.log(`仓库: ${owner}/${repo}`);
  console.log(`基准 commit (exclusive): ${fromSha}`);
  console.log(`目标 commit: ${toSha}`);
  console.log(`待推送 commit 数: ${commits.length}`);

  if (commits.length === 0) {
    console.log('没有 commit 需要推送');
    return;
  }

  for (const sha of commits) {
    const subject = run(`git log -1 --format=%s ${sha}`);
    console.log(`\n=== 推送 ${sha.substring(0, 8)} — ${subject} ===`);

    const refResp = ghApi('GET', `/repos/${owner}/${repo}/git/refs/heads/master`);
    const remoteSha = refResp.object.sha;
    const remoteCommit = ghApi('GET', `/repos/${owner}/${repo}/git/commits/${remoteSha}`);
    const parentTreeSha = remoteCommit.tree.sha;
    console.log(`  远程 master: ${remoteSha.substring(0, 8)}  tree: ${parentTreeSha.substring(0, 8)}`);

    const files = getChangedFiles(sha);
    if (files.length === 0) {
      console.log('  无文件变更，跳过');
      continue;
    }

    const treeItems = [];
    for (const file of files) {
      const posixPath = file.replace(/\\/g, '/');
      const mode = getFileModeAtCommit(sha, file);
      let content;
      try {
        content = readFileAtCommit(sha, file);
      } catch {
        // File was deleted in this commit — skip (tree entry deletion is more complex)
        console.log(`  (deleted) ${posixPath} — 注意：删除操作未实现`);
        continue;
      }
      const blob = createBlobFromBuffer(owner, repo, content);
      treeItems.push({ path: posixPath, mode, type: 'blob', sha: blob.sha });
      console.log(`  blob: ${posixPath} → ${blob.sha.substring(0, 8)}`);
    }

    const tree = ghApi('POST', `/repos/${owner}/${repo}/git/trees`, {
      base_tree: parentTreeSha,
      tree: treeItems,
    });
    console.log(`  新 tree: ${tree.sha.substring(0, 8)}`);

    const message = getCommitMessage(sha);
    const commit = ghApi('POST', `/repos/${owner}/${repo}/git/commits`, {
      message,
      tree: tree.sha,
      parents: [remoteSha],
    });
    console.log(`  新 commit: ${commit.sha.substring(0, 8)}`);

    ghApi('PATCH', `/repos/${owner}/${repo}/git/refs/heads/master`, {
      sha: commit.sha,
      force: true,
    });
    console.log(`  已更新 refs/heads/master → ${commit.sha.substring(0, 8)}`);
  }

  console.log('\n注意：本地 commit SHA 与远程不同，网络恢复后请运行 git fetch && git reset --hard origin/master');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
