import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('compiled own-property policy lookup', () => {
  it('rejects inherited matches while preserving own paths and values', () => {
    const root = resolve(__dirname, '../../../..');
    const run = spawnSync(process.execPath, [resolve(root, 'scripts/probe-own-path.cjs'), root], {
      encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH },
    });
    expect(run.status).toBe(0);
    const result = JSON.parse(run.stdout);
    expect(result.holdout).toHaveLength(6);
    expect(result.anchors).toHaveLength(8);
    for (const check of [...result.holdout, ...result.anchors]) {
      expect(check).toEqual({ id: expect.any(String), passed: true });
    }
  });
});
