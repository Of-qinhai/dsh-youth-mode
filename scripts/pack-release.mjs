import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, globSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const name = '@ohmynpm/dsh-youth-mode';
const output = join(root, 'dist');
const staging = realpathSync(mkdtempSync(join(tmpdir(), 'youth-mode-release-')));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'run this script with npm run pack:release');

try {
  for (const file of ['README.md', ...globSync(manifest.files, { cwd: root })]) {
    const target = join(staging, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(root, file), target);
  }

  // Keep the development link working under its local bundle name.
  for (const file of ['client.js', 'cordis.patch.yml']) {
    const target = join(staging, file);
    const content = readFileSync(target, 'utf8');
    assert.ok(content.includes(`'${manifest.name}'`), `${file} must register the bundle name`);
    writeFileSync(target, content.replace(`'${manifest.name}'`, `'${name}'`));
  }
  const { scripts, ...release } = manifest;
  release.name = name;
  release.publishConfig = { access: 'public', registry: 'https://registry.npmjs.org' };
  writeFileSync(join(staging, 'package.json'), `${JSON.stringify(release, null, 2)}\n`);

  mkdirSync(output, { recursive: true });
  const [pack] = JSON.parse(execFileSync(process.execPath, [
    npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', output,
  ], { cwd: staging, encoding: 'utf8' }));
  console.log(join(output, pack.filename));
} finally {
  rmSync(staging, { recursive: true, force: true });
}
