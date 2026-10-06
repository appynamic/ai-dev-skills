// @ts-check
// node --test plugins/journal/skills/journal/scripts/agents/antigravity.test.mjs
// Fixtures: a real Antigravity 2.19.1 conversation (anonymised), see ../fixtures/antigravity/.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as lib from '../journal-lib.mjs';
import * as agy from './antigravity.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'antigravity');
const STEPS = agy.parseSteps(fs.readFileSync(path.join(FIXTURES, 'transcript_full.jsonl'), 'utf8'));
/** @param {number} max */
const upTo = (max) => STEPS.filter((s) => s.step_index <= max);
/** @param {string} name */
const payload = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, 'payloads', name), 'utf8'));

describe('antigravity: transcript', () => {
	it('sorts steps by index (the file is not always in order) and skips broken lines', () => {
		assert.deepEqual(
			STEPS.map((s) => s.step_index),
			STEPS.map((_, i) => i),
		);
		assert.deepEqual(
			agy.parseSteps('{"step_index":2,"type":"B"}\n{"step_index":1,"type":"A"}\n{"step_ind').map((s) => s.type),
			['A', 'B'],
		);
	});

	it('extracts what the user typed from USER_INPUT', () => {
		assert.equal(agy.userText(STEPS[0].content), 'liste les fichiers du dossier');
		assert.equal(agy.userText('<USER_REQUEST>\n/plan fais X\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nlocal time\n</ADDITIONAL_METADATA>'), '/plan fais X');
		assert.equal(agy.userText('sans balise\n<USER_SETTINGS_CHANGE>model</USER_SETTINGS_CHANGE>'), 'sans balise');
	});

	it('maps edit tools to Write/Edit so touched files are found', () => {
		const entries = agy.toEntries(upTo(9));
		const root = 'c:\\www\\appy\\demo-project';
		assert.deepEqual(lib.turnTouchedFiles(entries, root), ['tmp-journal-test.md']);
		assert.deepEqual(lib.extractAssistantBlocks(entries, 'text+tools').map((b) => b.type), ['tools', 'text', 'tools', 'text']);
	});

	it('reads JSON-encoded args too (transcript.jsonl flavour)', () => {
		const step = { step_index: 0, type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'write_to_file', args: { TargetFile: '"c:\\\\p\\\\a.md"' } }] };
		assert.deepEqual(lib.turnTouchedFiles(agy.toEntries([step]), 'c:\\p'), ['a.md']);
	});
});

describe('antigravity: sync events', () => {
	it('journals the new prompt at the start of a turn, nothing more', () => {
		const { events, last } = agy.syncEvents(upTo(0), { from: -1, mode: 'prompt' });
		assert.deepEqual(events.map((e) => e.type), ['prompt']);
		assert.equal(/** @type {any} */ (events[0]).text, 'liste les fichiers du dossier');
		assert.equal(last, 0);
	});

	it('journals the reply at Stop', () => {
		const { events, last } = agy.syncEvents(upTo(3), { from: 0, mode: 'stop' });
		assert.equal(events.length, 1);
		const reply = /** @type {any} */ (events[0]);
		assert.equal(reply.type, 'reply');
		assert.equal(reply.interrupted, false);
		assert.deepEqual(reply.steps.map((/** @type {any} */ s) => s.step_index), [1, 3]);
		assert.equal(last, 3);
	});

	it('is idempotent: nothing new, nothing journaled', () => {
		assert.deepEqual(agy.syncEvents(upTo(3), { from: 3, mode: 'stop' }), { events: [], last: 3 });
		assert.deepEqual(agy.syncEvents(upTo(4), { from: 3, mode: 'prompt' }).events.map((e) => e.type), ['prompt']);
	});

	it('flushes a reply that never reached Stop as interrupted when the next prompt comes', () => {
		const { events } = agy.syncEvents(upTo(4), { from: 0, mode: 'prompt' });
		assert.deepEqual(events.map((e) => e.type), ['reply', 'prompt']);
		assert.equal(/** @type {any} */ (events[0]).interrupted, true);
	});

	it('follows a plan through review: written, stop, approved, execution resumes without a prompt', () => {
		const first = agy.syncEvents(upTo(27), { from: 14, mode: 'stop' });
		assert.deepEqual(first.events.map((e) => e.type), ['planWritten', 'planWritten', 'reply']);
		const plan = /** @type {any} */ (first.events[1]);
		assert.match(plan.file, /plan_ameliorations_claw_machine\.md$/);
		assert.match(plan.content, /^# .*Plan d'Améliorations/);
		const second = agy.syncEvents(STEPS, { from: first.last, mode: 'stop' });
		assert.deepEqual(second.events.map((e) => e.type), ['planApproved', 'reply']);
		assert.equal(second.last, 41);
	});

	it('skips /journal commands and what the agent did to answer them', () => {
		const steps = [
			{ step_index: 0, type: 'USER_INPUT', content: '<USER_REQUEST>\n/journal note\n</USER_REQUEST>' },
			{ step_index: 1, type: 'PLANNER_RESPONSE', content: 'synthèse écrite' },
			{ step_index: 2, type: 'USER_INPUT', content: '<USER_REQUEST>\nsuite\n</USER_REQUEST>' },
			{ step_index: 3, type: 'PLANNER_RESPONSE', content: 'ok' },
		];
		assert.deepEqual(agy.syncEvents(steps, { from: -1, mode: 'stop' }).events.map((e) => e.type), ['prompt', 'reply']);
	});

	it('still skips the answer to a /journal command when its prompt was synced earlier (live regression)', () => {
		const steps = [
			{ step_index: 0, type: 'USER_INPUT', content: '<USER_REQUEST>\nliste\n</USER_REQUEST>' },
			{ step_index: 1, type: 'PLANNER_RESPONSE', content: 'voici' },
			{ step_index: 2, type: 'USER_INPUT', content: '<USER_REQUEST>\n/journal status\n</USER_REQUEST>' },
			{ step_index: 3, type: 'PLANNER_RESPONSE', content: 'Journal : brouillon' },
		];
		const atPrompt = agy.syncEvents(steps.slice(0, 3), { from: 1, mode: 'prompt' });
		assert.deepEqual(atPrompt, { events: [], last: 2 });
		assert.deepEqual(agy.syncEvents(steps, { from: atPrompt.last, mode: 'stop' }).events, []);
		// …while an ordinary turn split the same way keeps its reply.
		assert.deepEqual(agy.syncEvents(steps.slice(0, 2), { from: 0, mode: 'stop' }).events.map((e) => e.type), ['reply']);
	});
});

describe('antigravity: hook payloads', () => {
	it('reads the shell command of a run_command PreToolUse', () => {
		assert.deepEqual(agy.commandOf(payload('002-PreToolUse-run_command.json')), { command: 'Get-ChildItem -Force | Select-Object Name, Mode, Length, LastWriteTime', cwd: 'c:\\www\\appy\\demo-project' });
		assert.deepEqual(agy.commandOf(payload('009-PreToolUse-write_to_file.json')), { command: '', cwd: undefined });
	});

	it('detects the plan artifact of a write_to_file', () => {
		assert.equal(agy.planArtifact(payload('009-PreToolUse-write_to_file.json').toolCall), null);
		assert.ok(agy.planArtifact(payload('045-PreToolUse-write_to_file.json').toolCall));
	});
});
