// @ts-check
// node --test plugins/journal/skills/journal/scripts/agents/antigravity.e2e.test.mjs
// Replays the captured Antigravity conversation (../fixtures/antigravity/) hook by hook against
// journal.mjs in a throwaway git repo: the transcript grows as it did live, and each hook sees
// only the steps that existed when Antigravity fired it.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as agy from './antigravity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JOURNAL = path.join(HERE, '..', 'journal.mjs');
const FIXTURES = path.join(HERE, '..', 'fixtures', 'antigravity');
const FIXTURE_ROOT = 'c:\\www\\appy\\demo-project';
const CONV = '8a86ee2a-0b13-4df6-968c-d286ada93d69';

/** @type {string} */ let root;
/** @type {string} */ let brain;
/** @type {string} */ let transcript;
/** @type {any[]} */ let steps;

/** Fixture paths point at the capture machine: move them into the temp workspace. @param {any} v @returns {any} */
function relocate(v) {
	if (typeof v === 'string') {
		return v
			.split(FIXTURE_ROOT)
			.join(root)
			.replace(/C:\/Users\/dev\/\.gemini\/antigravity\/brain\/[0-9a-f-]+/gi, brain.split(path.sep).join('/'))
			.replace(/C:\\Users\\dev\\\.gemini\\antigravity\\brain\\[0-9a-f-]+/gi, brain);
	}
	if (Array.isArray(v)) return v.map(relocate);
	if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, relocate(x)]));
	return v;
}

/** @param {string} event @param {Record<string, unknown>} extra @param {number} [maxStep] transcript as Antigravity had it */
function hook(event, extra = {}, maxStep = Infinity) {
	fs.writeFileSync(transcript, `${steps.filter((s) => s.step_index <= maxStep).map((s) => JSON.stringify(s)).join('\n')}\n`);
	const input = { conversationId: CONV, workspacePaths: [root.split(path.sep).join('/')], transcriptPath: transcript, artifactDirectoryPath: brain, modelName: 'test', ...extra };
	const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDE|^ANTIGRAVITY/.test(k)));
	// Like Antigravity: cwd is the dir holding hooks.json (here: not the workspace).
	const r = spawnSync(process.execPath, [JOURNAL, event, '--agent', 'antigravity'], { input: JSON.stringify(input), cwd: os.tmpdir(), env, encoding: 'utf8' });
	assert.equal(r.status, 0, r.stderr);
	return JSON.parse(r.stdout);
}

function journalFiles() {
	const dir = path.join(root, 'docs', 'journals');
	return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

/** @param {string} name */
function readJournal(name) {
	return fs.readFileSync(path.join(root, 'docs', 'journals', name), 'utf8');
}

describe('antigravity: hooks end to end', () => {
	before(() => {
		root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'journal-agy-')));
		brain = path.join(root, '.brain', CONV);
		fs.mkdirSync(brain, { recursive: true });
		transcript = path.join(brain, 'transcript_full.jsonl');
		execFileSync('git', ['init', '-q'], { cwd: root });
		steps = relocate(agy.parseSteps(fs.readFileSync(path.join(FIXTURES, 'transcript_full.jsonl'), 'utf8')));
		// The plan artifact Antigravity wrote at step 25.
		const plan = agy.planArtifact(steps.find((s) => s.step_index === 25).tool_calls[0]);
		fs.writeFileSync(/** @type {any} */ (plan).file, /** @type {any} */ (plan).content);
	});
	after(() => fs.rmSync(root, { recursive: true, force: true }));

	it('answers every hook with JSON, PreToolUse with allow', () => {
		assert.deepEqual(hook('prompt', { invocationNum: 1, initialNumSteps: 3 }, 0), {});
		assert.deepEqual(journalFiles(), [], 'only the first invocation of a turn journals');
		assert.deepEqual(hook('precommit', { toolCall: { name: 'run_command', args: { CommandLine: 'git status', Cwd: root } }, stepIdx: 2 }), { decision: 'allow' });
	});

	it('journals prompts and replies turn by turn', () => {
		hook('prompt', { invocationNum: 0, initialNumSteps: 1 }, 0);
		const [name] = journalFiles();
		assert.match(name, /--001-brouillon-8a86ee2a\.md$/);
		assert.match(readJournal(name), /> liste les fichiers du dossier\n\n<!-- journal:turn -->\n$/);
		hook('stop', { executionNum: 0, terminationReason: 'NO_TOOL_CALL', fullyIdle: true }, 3);
		hook('stop', { executionNum: 0, terminationReason: 'NO_TOOL_CALL', fullyIdle: true }, 3);
		const content = readJournal(name);
		assert.equal(content.match(/\*\*Antigravity\*\* · \d\d:\d\d/g)?.length, 1, 'a repeated Stop journals nothing twice');
		assert.match(content, /Voici la liste des fichiers/);

		hook('prompt', { invocationNum: 0, initialNumSteps: 5 }, 4);
		hook('stop', { executionNum: 0 }, 9);
		assert.match(readJournal(name), /_fichiers : tmp-journal-test\.md_/);
	});

	it('names the journal after the plan once the plan is approved', () => {
		hook('prompt', { invocationNum: 0, initialNumSteps: 11 }, 10);
		hook('stop', { executionNum: 0 }, 13);
		hook('prompt', { invocationNum: 0, initialNumSteps: 15 }, 14);
		hook('stop', { executionNum: 0 }, 27);
		assert.match(journalFiles()[0], /brouillon/, 'a plan waiting for review is not approved yet');
		hook('stop', { executionNum: 1 }, 41);
		const files = journalFiles();
		const journal = files.find((f) => /^\d{4}-/.test(f));
		const plan = files.find((f) => f.startsWith('plan-'));
		assert.ok(journal && plan, files.join(', '));
		// "🕹️ Plan d'Améliorations - Cyber Claw Machine 3D": the subtitle after " - " and "plan" don't name the feature.
		assert.match(journal, /--001-ameliorations\.md$/);
		assert.equal(plan, 'plan-ameliorations.md');
		const content = readJournal(journal);
		assert.match(content, new RegExp(`_Plan validé — \\[${plan}\\]`));
		assert.match(content, /Double-Tap Stop & Close/, 'the execution after approval is journaled');
		assert.ok(content.indexOf('_Plan validé') < content.indexOf('Double-Tap Stop & Close'));
		assert.match(fs.readFileSync(path.join(root, 'docs', 'journals', plan), 'utf8'), /Plan d'Améliorations/);
	});

	it('installs the git hook in .agents/ with the first journal', () => {
		assert.ok(fs.existsSync(path.join(root, '.agents', 'journal-git-hook.mjs')));
		assert.ok(fs.existsSync(path.join(root, '.agents', 'journal-state.json')));
		assert.ok(!fs.existsSync(path.join(root, '.agents', 'journal-errors.log')), fs.existsSync(path.join(root, '.agents', 'journal-errors.log')) ? fs.readFileSync(path.join(root, '.agents', 'journal-errors.log'), 'utf8') : '');
	});

	it('refuses a commit without journal trailers', () => {
		const out = hook('precommit', { toolCall: { name: 'run_command', args: { CommandLine: 'git commit -m "feat: x"', Cwd: root } }, stepIdx: 50 });
		assert.equal(out.decision, 'deny');
		assert.match(out.reason, /Journal: docs\/journals\//);
	});
});
