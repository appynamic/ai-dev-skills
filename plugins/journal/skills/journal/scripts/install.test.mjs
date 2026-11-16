// @ts-check
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const INSTALL = fileURLToPath(new URL('./install.mjs', import.meta.url));

describe('install.mjs CLAUDE.md section', () => {
	it('a journal block at the top of CLAUDE.md moves to the end without leaving a leading blank line', () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-install-'));
		try {
			execFileSync('git', ['init', '-q'], { cwd: tmp });
			fs.writeFileSync(path.join(tmp, 'CLAUDE.md'), '<!-- journal:start -->\nold\n<!-- journal:end -->\n\n# Project\n');
			const run = () => execFileSync(process.execPath, [INSTALL, '--quiet'], { cwd: tmp, env: { ...process.env, CLAUDE_CONFIG_DIR: tmp } });
			run();
			const first = fs.readFileSync(path.join(tmp, 'CLAUDE.md'), 'utf8');
			assert.match(first, /^# Project\n\n<!-- journal:start -->\n## Journal/);
			run();
			assert.equal(fs.readFileSync(path.join(tmp, 'CLAUDE.md'), 'utf8'), first, 'idempotent');
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});
