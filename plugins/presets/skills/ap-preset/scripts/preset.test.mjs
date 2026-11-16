// @ts-check
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { appliedPresets, buildBlock, listPresets, loadPreset, mergeMissing, removeSame, setBlock } from './preset.mjs';

const CLI = fileURLToPath(new URL('./preset.mjs', import.meta.url));
const base = loadPreset('base');

describe('presets catalog', () => {
	it('ships base, every preset loads with rules and valid regexes', () => {
		assert.ok(listPresets().includes('base'));
		for (const n of listPresets()) {
			const p = loadPreset(n);
			assert.ok(p.description, `${n}: description`);
			assert.ok(p.rules.trim(), `${n}: rules.md`);
			for (const id of Object.keys(p.covered)) assert.match(p.rules, new RegExp(`<!-- rule:${id} -->`), `${n}: covered.${id} has a rule section`);
		}
	});

	it('rejects an unknown or path-like name', () => {
		assert.throws(() => loadPreset('nope'), /unknown preset/);
		assert.throws(() => loadPreset('../journal'), /unknown preset/);
	});
});

describe('buildBlock (base)', () => {
	it('keeps every rule for an empty CLAUDE.md, without the section markers', () => {
		const { block, kept, skipped } = buildBlock(base, '');
		assert.deepEqual(kept, ['dev-server', 'worktree', 'commit', 'tests']);
		assert.deepEqual(skipped, []);
		assert.match(block ?? '', /^## Règles de travail des agents/);
		assert.doesNotMatch(block ?? '', /<!-- rule:/);
	});

	it('leaves out themes written by hand (wordings from real projects)', () => {
		const cases = /** @type {[string, string][]} */ ([
			['dev-server', '- **NEVER run `pnpm run dev` yourself, and NEVER kill a server you did not start.**'],
			['dev-server', '- Dev server is already running on `https://localhost:3000` with HMR enabled. NEVER launch it yourself'],
			['worktree', '- **Jamais de worktree** (`EnterWorktree`, `git worktree add`)'],
			['worktree', '- **No worktrees locally** with multiple agent sessions'],
			['commit', '- **No automatic commits** except from Claude Code (web) in a remote session'],
			['tests', '- Prefer targeted `pnpm exec vitest run <files>`; run the full suite once at the end'],
		]);
		for (const [id, line] of cases) assert.deepEqual(buildBlock(base, `# P\n\n${line}\n`).skipped, [id], line);
	});

	it('ignores managed blocks (journal, presets) when detecting', () => {
		const md = '# P\n\n<!-- journal:start -->\n- **Claude ne stage ni ne commite jamais de lui-même, en local.**\n<!-- journal:end -->\n\n<!-- preset:base:start -->\n- **Jamais de worktree en local**\n<!-- preset:base:end -->\n';
		assert.deepEqual(buildBlock(base, md).skipped, []);
	});

	it('does not mistake commands or "Conventional Commits" for rules', () => {
		const md = '- pnpm uniquement. Commits : Conventional Commits.\n\n```bash\npnpm dev   # :3000\n```\n- `pnpm exec vitest run <test-files>`: runs specific test files\n';
		assert.deepEqual(buildBlock(base, md).skipped, []);
	});

	it('returns no block once every theme is covered', () => {
		assert.equal(buildBlock(base, 'NEVER run `pnpm dev`\nJamais de worktree\nNo automatic commits\nTests unitaires rapides\n').block, null);
	});
});

describe('buildBlock (3d)', () => {
	const p3d = loadPreset('3d');

	it('leaves out what a three.js project already says, not words that merely contain a keyword', () => {
		const md = '1. **`three/webgpu` et `three/tsl`, jamais `three`**\n- la rue des Drapiers, le quartier des drapiers\n';
		const { kept, skipped } = buildBlock(p3d, md);
		assert.deepEqual(skipped, ['webgpu', 'tsl']);
		assert.ok(kept.includes('rapier'));
		assert.deepEqual(buildBlock(p3d, '- Physique : **Rapier** (`@dimforge/rapier3d-compat`)\n').skipped, ['rapier'], 'a real Rapier rule is detected');
	});
});

describe('buildBlock (unity-port)', () => {
	it('detects a pipeline already described by hand, keeps the rest', () => {
		const md = '- extraire avec `tools/unitypackage-extract.mjs` (écrit `guid-map.json`)\n- textures en `KHR_texture_basisu` avec repli PNG\n';
		const { kept, skipped } = buildBlock(loadPreset('unity-port'), md);
		assert.deepEqual(skipped, ['sources', 'compression']);
		assert.ok(kept.includes('shaders') && kept.includes('fidelity'));
	});
});

describe('setBlock', () => {
	it('appends, replaces in place (order kept), removes cleanly', () => {
		let t = setBlock('# P\n', 'base', 'A\n');
		t = setBlock(t, 'nuxt', 'N\n');
		assert.equal(t, '# P\n\n<!-- preset:base:start -->\nA\n<!-- preset:base:end -->\n\n<!-- preset:nuxt:start -->\nN\n<!-- preset:nuxt:end -->\n');
		assert.equal(setBlock(t, 'base', 'A\n'), t, 'idempotent');
		assert.match(setBlock(t, 'base', 'B\n'), /^# P\n\n<!-- preset:base:start -->\nB\n/);
		assert.deepEqual(appliedPresets(t), ['base', 'nuxt']);
		assert.equal(setBlock(setBlock(t, 'base', null), 'nuxt', null), '# P\n');
	});

	it('a block at the top of the file is removed without leaving blank lines', () => {
		assert.equal(setBlock('<!-- preset:base:start -->\nA\n<!-- preset:base:end -->\n\n# P\n', 'base', null), '# P\n');
		assert.equal(setBlock(setBlock('', 'base', 'A\n'), 'base', null), '');
	});
});

describe('settings merge', () => {
	it('adds only missing values, keeps the rest, unions arrays', () => {
		const out = mergeMissing({ worktree: { symlinkDirectories: ['node_modules'] }, permissions: { deny: ['a'] } }, { worktree: { bgIsolation: 'none' }, permissions: { deny: ['a', 'b'] } });
		assert.deepEqual(out, { worktree: { symlinkDirectories: ['node_modules'], bgIsolation: 'none' }, permissions: { deny: ['a', 'b'] } });
		assert.deepEqual(mergeMissing({ worktree: { bgIsolation: 'worktree' } }, base.settings), { worktree: { bgIsolation: 'worktree' } }, 'existing value kept');
	});

	it('removeSame undoes only the values still equal to the preset', () => {
		assert.deepEqual(removeSame({ a: 1, worktree: { bgIsolation: 'none' } }, base.settings), { a: 1 });
		assert.deepEqual(removeSame({ worktree: { bgIsolation: 'worktree' } }, base.settings), { worktree: { bgIsolation: 'worktree' } });
		assert.deepEqual(removeSame({ p: { deny: ['a', 'b'] } }, { p: { deny: ['b'] } }), { p: { deny: ['a'] } });
	});
});

describe('preset.mjs CLI', () => {
	it('apply is idempotent, remove restores the project', () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-'));
		try {
			execFileSync('git', ['init', '-q'], { cwd: tmp });
			fs.writeFileSync(path.join(tmp, 'CLAUDE.md'), '# P\n\n- **Jamais de worktree**\n');
			const run = (/** @type {string[]} */ ...a) => execFileSync(process.execPath, [CLI, ...a], { cwd: tmp, encoding: 'utf8' });
			assert.match(run('apply', 'base'), /left out: worktree/);
			const md = fs.readFileSync(path.join(tmp, 'CLAUDE.md'), 'utf8');
			assert.match(md, /<!-- preset:base:start -->/);
			assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, '.claude', 'settings.json'), 'utf8')).worktree.bgIsolation, 'none');
			assert.match(run('apply', 'base'), /= CLAUDE\.md/);
			assert.match(run('status'), /base: up to date/);
			run('remove', 'base');
			assert.equal(fs.readFileSync(path.join(tmp, 'CLAUDE.md'), 'utf8'), '# P\n\n- **Jamais de worktree**\n');
			assert.ok(!fs.existsSync(path.join(tmp, '.claude', 'settings.json')), 'settings.json created by apply is removed');
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});
