// @ts-check
// node --test plugins/journal/skills/journal/scripts/journal.e2e.test.mjs
// Auto title against journal.mjs in a throwaway git repo, with a fake title command in place of
// `claude -p` (no model call): the hooks write a draft, `autotitle` names it, the name stays
// provisional until `rename`.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as lib from './journal-lib.mjs';

const JOURNAL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'journal.mjs');
const SID = 'abcd1234-0000-4000-8000-000000000000';

/** @type {string} */ let root;

/** @param {string[]} args @param {string} [input] @param {Record<string, string>} [extraEnv] */
function run(args, input = '', extraEnv = {}) {
	const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDE|^ANTIGRAVITY/.test(k))), CLAUDE_PROJECT_DIR: root, ...extraEnv };
	const r = spawnSync(process.execPath, [JOURNAL, ...args], { input, cwd: root, env, encoding: 'utf8' });
	assert.equal(r.status, 0, r.stderr);
	return r.stdout;
}

function journals() {
	return fs.readdirSync(path.join(root, 'docs', 'journals')).filter((n) => lib.JOURNAL_RE.test(n));
}

/** @param {string} name */
function readJournal(name) {
	return fs.readFileSync(path.join(root, 'docs', 'journals', name), 'utf8');
}

describe('auto title end to end', () => {
	before(() => {
		root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'journal-title-')));
		execFileSync('git', ['init', '-q'], { cwd: root });
		const fake = `node -e "process.stdin.resume();process.stdin.on('end',()=>console.log('Sure!\\n\\nLogin Bug Fix'))"`;
		fs.mkdirSync(path.join(root, '.claude'));
		fs.writeFileSync(path.join(root, '.claude', 'journal.config.json'), `${JSON.stringify({ autoTitle: fake })}\n`);
	});
	after(() => fs.rmSync(root, { recursive: true, force: true }));

	it('names the draft after its first reply, provisionally', () => {
		run(['prompt'], JSON.stringify({ session_id: SID, prompt: 'corrige le bug de login' }));
		assert.match(journals()[0], /brouillon-abcd1234/);
		const name = journals()[0];
		fs.appendFileSync(path.join(root, 'docs', 'journals', name), `\n**Claude** · 10:00\n\nFixed.\n\n${lib.REPLY_MARKER}\n`);
		assert.equal(run(['autotitle', '--session', SID]).trim(), `docs/journals/${name.slice(0, 10)}--001-login-bug-fix.md`);
		const [titled] = journals();
		assert.match(readJournal(titled), /^# Login Bug Fix$/m);
		assert.ok(lib.isAutoTitled(readJournal(titled)));
		assert.equal(JSON.parse(run(['status', '--session', SID])).autoTitle, true);
	});

	it('leaves an already named journal alone', () => {
		const r = spawnSync(process.execPath, [JOURNAL, 'autotitle', '--session', SID], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
		assert.equal(r.status, 1);
		assert.match(r.stderr, /already named/);
	});

	it('/journal <title> makes the name final', () => {
		run(['rename', '--session', SID, 'Login redirect fix']);
		const [named] = journals();
		assert.match(named, /--001-login-redirect-fix\.md$/);
		assert.ok(!lib.isAutoTitled(readJournal(named)));
	});

	it('hooks stay silent inside the title command', () => {
		run(['prompt'], JSON.stringify({ session_id: 'ffff0000-1', prompt: 'hello' }), { CLAUDE_JOURNAL_DISABLED: '1' });
		assert.equal(journals().length, 1);
	});
});

describe('launched from a subfolder of the repo', () => {
	before(() => {
		root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'journal-sub-')));
		execFileSync('git', ['init', '-q'], { cwd: root });
		fs.mkdirSync(path.join(root, '.claude'));
		fs.writeFileSync(path.join(root, '.claude', 'journal.config.json'), `${JSON.stringify({ autoTitle: false })}\n`);
		fs.mkdirSync(path.join(root, 'app'));
	});
	after(() => fs.rmSync(root, { recursive: true, force: true }));

	it('journals at the repo root, not in the launch folder', () => {
		const sub = path.join(root, 'app');
		const r = spawnSync(process.execPath, [JOURNAL, 'prompt'], {
			input: JSON.stringify({ session_id: 'eeee0000-2', prompt: 'hello', cwd: sub }),
			cwd: sub,
			env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDE|^ANTIGRAVITY/.test(k))), CLAUDE_PROJECT_DIR: sub },
			encoding: 'utf8',
		});
		assert.equal(r.status, 0, r.stderr);
		assert.equal(journals().length, 1);
		assert.ok(!fs.existsSync(path.join(sub, 'docs')));
	});
});
