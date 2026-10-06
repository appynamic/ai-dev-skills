// @ts-check
// Antigravity adapter of the journal skill (github.com/appynamic/ai-dev-skills): pure logic, no
// filesystem. Turns an Antigravity `transcript_full.jsonl` (one JSON step per line) into journal
// events, and steps into the Claude-shaped entries journal-lib already knows how to render.
//
// Antigravity has no UserPromptSubmit and may stop several times per prompt (a plan waiting for
// review stops the loop, its approval resumes it without a new prompt). So instead of "one pending
// reply per prompt", the journal is synced from the transcript: the hooks remember the last
// journaled step_index and journal whatever came after it. Calibrated on Antigravity 2.19.1 —
// see scripts/fixtures/antigravity/ and docs/plans/antigravity-hooks-reference.md.
import { cleanPrompt, isJournalCommand } from '../journal-lib.mjs';

export const SPEAKER = 'Antigravity';

/** Antigravity tool → the Claude tool name journal-lib counts as an edit (turnTouchedFiles). */
const EDIT_TOOLS = /** @type {Record<string, string>} */ ({ write_to_file: 'Write', replace_file_content: 'Edit', multi_replace_file_content: 'Edit' });

/**
 * @typedef {{ step_index: number, type: string, source?: string, status?: string, created_at?: string, content?: string, tool_calls?: { name: string, args?: any }[] }} Step
 * @typedef {{ type: 'prompt', text: string, step: Step }
 *   | { type: 'reply', steps: Step[], interrupted: boolean }
 *   | { type: 'planWritten', file: string, content: string }
 *   | { type: 'planApproved' }} JournalEvent
 */

/** Sorted by step_index (the file is not always in order), duplicates and broken lines dropped. @param {string} jsonl @returns {Step[]} */
export function parseSteps(jsonl) {
	/** @type {Map<number, Step>} */
	const byIndex = new Map();
	for (const line of String(jsonl ?? '').split('\n')) {
		if (!line.trim()) continue;
		try {
			const s = JSON.parse(line);
			if (typeof s?.step_index === 'number') byIndex.set(s.step_index, s);
		} catch {
			// a partially flushed last line is expected while the conversation is live
		}
	}
	return [...byIndex.values()].sort((a, b) => a.step_index - b.step_index);
}

/** What the user typed: the `<USER_REQUEST>` body, without Antigravity's metadata blocks. @param {string | undefined} content */
export function userText(content) {
	const raw = String(content ?? '');
	const req = raw.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
	const text = req ? req[1] : raw.replace(/<(ADDITIONAL_METADATA|USER_SETTINGS_CHANGE)>[\s\S]*?<\/\1>/g, '');
	return cleanPrompt(text);
}

/** Antigravity's args are objects in transcript_full.jsonl but JSON-encoded strings in transcript.jsonl. @param {unknown} v */
function arg(v) {
	if (typeof v !== 'string') return v;
	try {
		return JSON.parse(v);
	} catch {
		return v;
	}
}

/** @param {{ name: string, args?: any }} call @returns {{ file: string, content: string } | null} */
export function planArtifact(call) {
	if (call?.name !== 'write_to_file') return null;
	const meta = arg(call.args?.ArtifactMetadata);
	if (!meta || !arg(meta.RequestFeedback)) return null;
	const file = arg(call.args?.TargetFile);
	return typeof file === 'string' && file ? { file, content: String(arg(call.args?.CodeContent) ?? '') } : null;
}

/** @param {Step} step */
export function isPlanApproval(step) {
	return step.type === 'SYSTEM_MESSAGE' && /approved the artifact/i.test(step.content ?? '');
}

/**
 * Claude-shaped entries for journal-lib (extractAssistantBlocks, turnTouchedFiles). Edit tools are
 * renamed to Write/Edit with a `file_path`; other tools keep their Antigravity name.
 * @param {Step[]} steps
 */
export function toEntries(steps) {
	return steps
		.filter((s) => s.type === 'PLANNER_RESPONSE')
		.map((s) => {
			/** @type {any[]} */
			const content = [];
			if (s.content?.trim()) content.push({ type: 'text', text: s.content });
			for (const call of s.tool_calls ?? []) {
				const edit = EDIT_TOOLS[call.name];
				const file = arg(call.args?.TargetFile);
				content.push(edit && typeof file === 'string' ? { type: 'tool_use', name: edit, input: { file_path: file } } : { type: 'tool_use', name: call.name, input: {} });
			}
			return { type: 'assistant', message: { content } };
		});
}

/** Empty prompts and `/journal …` commands are not journaled, nor is the turn that answers them. @param {Step} userInput */
function isSkipped(userInput) {
	const text = userText(userInput.content);
	return !text || isJournalCommand(text);
}

/**
 * Journal events for the steps after `from`. `prompt` mode (PreInvocation of a new turn) stops at
 * the last user prompt — the turn has only just started; `stop` mode journals everything.
 * A `/journal …` command is not journaled, nor is what the agent did to answer it.
 * @param {Step[]} steps @param {{ from: number, mode: 'prompt' | 'stop' }} o
 * @returns {{ events: JournalEvent[], last: number }}
 */
export function syncEvents(steps, o) {
	const fresh = steps.filter((s) => s.step_index > o.from);
	let end = fresh.length;
	if (o.mode === 'prompt') {
		end = 0;
		fresh.forEach((s, i) => {
			if (s.type === 'USER_INPUT') end = i + 1;
		});
	}
	const todo = fresh.slice(0, end);
	/** @type {JournalEvent[]} */
	const events = [];
	/** @type {Step[]} */
	let buffer = [];
	// The turn may have started in an earlier sync (prompt journaled at PreInvocation, reply at Stop):
	// whether it is a /journal command comes from its prompt, already behind `from`.
	const opening = steps.filter((s) => s.step_index <= o.from && s.type === 'USER_INPUT').at(-1);
	let skipping = opening ? isSkipped(opening) : false;
	/** @param {boolean} interrupted */
	const flush = (interrupted) => {
		if (buffer.length && !skipping) events.push({ type: 'reply', steps: buffer, interrupted });
		buffer = [];
	};
	for (const s of todo) {
		if (s.type === 'USER_INPUT') {
			// A reply still buffered here never reached a Stop: the turn was interrupted.
			flush(true);
			skipping = isSkipped(s);
			if (!skipping) events.push({ type: 'prompt', text: userText(s.content), step: s });
		} else if (isPlanApproval(s)) {
			flush(false);
			if (!skipping) events.push({ type: 'planApproved' });
		} else if (s.type === 'PLANNER_RESPONSE') {
			buffer.push(s);
			if (skipping) continue;
			for (const call of s.tool_calls ?? []) {
				const plan = planArtifact(call);
				if (plan) events.push({ type: 'planWritten', ...plan });
			}
		}
	}
	if (o.mode === 'stop') flush(false);
	return { events, last: todo.length ? todo[todo.length - 1].step_index : o.from };
}

/** The shell command of a `run_command` PreToolUse payload (args may be JSON-encoded). @param {any} input */
export function commandOf(input) {
	if (input?.toolCall?.name !== 'run_command') return { command: '', cwd: undefined };
	const args = input.toolCall.args ?? {};
	const cwd = arg(args.Cwd);
	return { command: String(arg(args.CommandLine) ?? ''), cwd: typeof cwd === 'string' && cwd ? cwd : undefined };
}
