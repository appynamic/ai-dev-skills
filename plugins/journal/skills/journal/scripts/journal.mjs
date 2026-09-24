#!/usr/bin/env node
// @ts-check
// Entry point of the journal skill (github.com/appynamic/ai-dev-skills). Two families of commands:
//   hooks (read a JSON payload on stdin): session | prompt | stop | tool | precommit
//   CLI   (called by /journal or by hand): status | rename | use | pause | resume | verbosity | table | backfill | help
// Hook commands must never break a Claude Code session: every error is swallowed into
// .claude/journal-errors.log and the process exits 0. Only `precommit` may deny, on purpose.
//
// This plugin ships no per-project code (hooks load from hooks/hooks.json via ${CLAUDE_PLUGIN_ROOT},
// so nothing needs copying into a consuming repo). The only thing that's per project is
// `.claude/journal.config.json` (optional — `{ dir, locale, enforceCommit, verbosity, redact }`,
// see DEFAULT_CONFIG in journal-lib.mjs), written by `install.mjs`/`/journal init`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as lib from './journal-lib.mjs';

// ─── Context ──────────────────────────────────────────────────────────────────

/** @param {string} cwd */
function gitRoot(cwd) {
	try {
		return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return null;
	}
}

/** @param {any} [input] */
function projectRoot(input) {
	if (process.env.CLAUDE_PROJECT_DIR) return path.resolve(process.env.CLAUDE_PROJECT_DIR);
	return gitRoot(input?.cwd ?? process.cwd()) ?? process.cwd();
}

/** @param {string} root */
function projectConfigPath(root) {
	return path.join(root, '.claude', 'journal.config.json');
}

/** @param {string} root @returns {lib.JournalConfig} */
function loadConfig(root) {
	try {
		const raw = JSON.parse(fs.readFileSync(projectConfigPath(root), 'utf8'));
		return { ...lib.DEFAULT_CONFIG, ...raw, verbosity: typeof raw.verbosity === 'string' ? raw.verbosity : { ...(/** @type {object} */ (lib.DEFAULT_CONFIG.verbosity)), ...raw.verbosity } };
	} catch {
		return { ...lib.DEFAULT_CONFIG };
	}
}

/** @param {any} [input] */
function context(input) {
	const root = projectRoot(input);
	const config = loadConfig(root);
	const dirRel = config.dir.replace(/\\/g, '/').replace(/\/$/, '');
	const dir = path.join(root, dirRel);
	const labels = lib.labelsFor(config.locale);
	const verbosity = lib.resolveVerbosity(config, process.env);
	return { root, config, dirRel, dir, labels, verbosity };
}
/** @typedef {ReturnType<typeof context>} Ctx */

function machine() {
	if (lib.isWebEnv(process.env)) return 'web';
	return { win32: 'windows', darwin: 'mac', linux: 'linux' }[process.platform] ?? process.platform;
}

/** @param {Ctx} ctx */
function listJournalNames(ctx) {
	try {
		return fs.readdirSync(ctx.dir).filter((n) => lib.JOURNAL_RE.test(n));
	} catch {
		return [];
	}
}

/** Most recently modified first: the session's journal is almost always the newest file. @param {Ctx} ctx @param {string} sessionId */
function findJournal(ctx, sessionId) {
	const names = listJournalNames(ctx)
		.map((name) => ({ name, mtime: fs.statSync(path.join(ctx.dir, name)).mtimeMs }))
		.sort((a, b) => b.mtime - a.mtime);
	const marker = lib.sessionMarker(sessionId);
	for (const { name } of names) if (read(path.join(ctx.dir, name)).includes(marker)) return name;
	return null;
}

/** @param {string} file */
function read(file) {
	try {
		return fs.readFileSync(file, 'utf8');
	} catch {
		return '';
	}
}

/** @param {string} file @param {string} content */
function write(file, content) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content.normalize('NFC'), 'utf8');
}

/** Appends a block separated from the previous content by exactly one blank line. @param {string} file @param {string} block */
function appendBlock(file, block) {
	const current = read(file).replace(/\s+$/, '');
	write(file, `${current}\n\n${block.replace(/\s+$/, '')}\n`);
}

/** @param {Ctx} ctx @param {string} sessionId */
function ensureJournal(ctx, sessionId) {
	const existing = findJournal(ctx, sessionId);
	if (existing) return existing;
	const date = lib.localDate();
	const name = lib.journalFileName(date, lib.nextSeq(listJournalNames(ctx), date), lib.draftSlug(sessionId));
	const header = lib.renderHeader({ title: `${ctx.labels.draft} ${sessionId.slice(0, 8)}`, sessionId, date, machine: machine(), labels: ctx.labels });
	write(path.join(ctx.dir, name), `${header}\n${lib.renderSessionHeading({ date, sessionId, machine: machine(), labels: ctx.labels })}\n`);
	return name;
}

/** @param {string | undefined} file */
function readTranscript(file) {
	if (!file) return [];
	return lib.parseTranscript(read(file));
}

/** @param {Ctx} ctx @param {string} name */
function rel(ctx, name) {
	return `${ctx.dirRel}/${name}`;
}

/** @param {Ctx} ctx @param {string} name */
function planOf(ctx, name) {
	const p = lib.parseJournalFileName(name);
	if (!p) return null;
	const plan = lib.planFileName(p.slug);
	return fs.existsSync(path.join(ctx.dir, plan)) ? plan : null;
}

/** @param {string} root @param {unknown} err @param {unknown} [extra] */
function logError(root, err, extra) {
	try {
		const line = `[${new Date().toISOString()}] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}${extra ? `\n  payload: ${JSON.stringify(extra).slice(0, 4000)}` : ''}\n`;
		fs.appendFileSync(path.join(root, '.claude', 'journal-errors.log'), line, 'utf8');
	} catch {
		// nowhere left to report
	}
}

function readStdin() {
	try {
		return fs.readFileSync(0, 'utf8');
	} catch {
		return '';
	}
}

/** @param {string} root @param {string[]} args */
function git(root, args) {
	return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** @param {string[]} args @param {string} flag */
function takeFlag(args, flag) {
	const i = args.indexOf(flag);
	if (i === -1) return undefined;
	const v = args[i + 1];
	args.splice(i, 2);
	return v;
}

/** @param {string[]} args */
function sessionFrom(args) {
	const sid = takeFlag(args, '--session') ?? process.env.CLAUDE_CODE_SESSION_ID;
	if (!sid) throw new Error('unknown session: pass --session <id> (or run from Claude Code, which sets CLAUDE_CODE_SESSION_ID)');
	return sid;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** @param {Ctx} ctx @param {any} input */
async function hookSession(ctx, input) {
	try {
		const { installGitHook } = await import('./install.mjs');
		installGitHook(ctx.root, { quiet: true });
	} catch (err) {
		logError(ctx.root, err);
	}
	const sid = input?.session_id;
	const own = sid ? findJournal(ctx, sid) : null;
	const recent = listJournalNames(ctx)
		.map((name) => ({ name, mtime: fs.statSync(path.join(ctx.dir, name)).mtimeMs }))
		.sort((a, b) => b.mtime - a.mtime)
		.slice(0, 5)
		.map((f) => `- ${f.name} — ${(read(path.join(ctx.dir, f.name)).match(/^# (.*)$/m) ?? [])[1] ?? ''}`);
	const lines = [`Journal auto actif (${ctx.dirRel}, verbosité ${ctx.verbosity}).`];
	if (own) lines.push(`Journal de cette session : ${rel(ctx, own)}.`);
	else if (recent.length) lines.push('Journaux récents — si cette session continue une de ces features, propose `/journal use <slug>` :', ...recent);
	process.stdout.write(`${lines.join('\n')}\n`);
}

/** @param {Ctx} ctx @param {any} input */
function hookPrompt(ctx, input) {
	const sid = input?.session_id;
	if (!sid) return;
	const text = lib.cleanPrompt(input.prompt ?? input.user_input ?? '');
	if (!text || lib.isJournalCommand(text)) return;
	const name = ensureJournal(ctx, sid);
	const file = path.join(ctx.dir, name);
	let content = read(file);
	if (lib.isPaused(content, sid)) return;
	// A turn interrupted by the user never reaches Stop: recover its text now, before the next prompt.
	if (lib.hasPendingReply(content)) {
		const turn = lib.previousTurn(readTranscript(input.transcript_path), text);
		const blocks = lib.extractAssistantBlocks(turn, ctx.verbosity);
		const files = lib.turnTouchedFiles(turn, ctx.root, [ctx.dirRel]);
		appendBlock(file, lib.renderReply({ time: lib.localTime(), blocks: redactBlocks(ctx, blocks), files, interrupted: blocks.length > 0, labels: ctx.labels }));
		content = read(file);
	}
	appendBlock(file, lib.renderPrompt(lib.redactSecrets(text, ctx.config.redact), lib.needsSeparator(content)));
}

/** @param {Ctx} ctx @param {lib.AssistantBlock[]} blocks */
function redactBlocks(ctx, blocks) {
	return blocks.map((b) => (b.type === 'text' ? { ...b, text: lib.redactSecrets(b.text, ctx.config.redact) } : b));
}

/** @param {Ctx} ctx @param {any} input */
function hookStop(ctx, input) {
	const sid = input?.session_id;
	if (!sid) return;
	const name = findJournal(ctx, sid);
	if (!name) return;
	const file = path.join(ctx.dir, name);
	const content = read(file);
	// No open turn = the prompt was a /journal command or the session is paused.
	if (lib.isPaused(content, sid) || !lib.hasPendingReply(content)) return;
	const turn = lib.currentTurn(readTranscript(input.transcript_path));
	const blocks = lib.reconcileLastMessage(lib.extractAssistantBlocks(turn, ctx.verbosity), input.last_assistant_message, ctx.verbosity);
	const files = lib.turnTouchedFiles(turn, ctx.root, [ctx.dirRel]);
	appendBlock(file, lib.renderReply({ time: lib.localTime(), blocks: redactBlocks(ctx, blocks), files, labels: ctx.labels }));
}

/** @param {Ctx} ctx @param {any} input */
function hookTool(ctx, input) {
	const sid = input?.session_id;
	if (!sid) return;
	if (input.tool_name === 'AskUserQuestion') {
		const name = findJournal(ctx, sid);
		if (!name) return;
		const file = path.join(ctx.dir, name);
		if (lib.isPaused(read(file), sid)) return;
		const block = lib.renderQuestions(input.tool_input, input.tool_response, ctx.labels);
		if (!block) return logError(ctx.root, 'AskUserQuestion: unrecognised answer shape', input);
		appendBlock(file, block);
		return;
	}
	if (input.tool_name === 'ExitPlanMode') {
		const resp = typeof input.tool_response === 'object' && input.tool_response ? input.tool_response : {};
		const planText = resp.plan ?? input.tool_input?.plan ?? (resp.filePath ? read(resp.filePath) : '');
		if (!planText) return logError(ctx.root, 'ExitPlanMode: plan text not found', input);
		const name = ensureJournal(ctx, sid);
		if (lib.isPaused(read(path.join(ctx.dir, name)), sid)) return;
		recordPlan(ctx, name, planText);
	}
}

/** Draft journals take their name from the first approved plan; the plan file always follows the journal's slug. @param {Ctx} ctx @param {string} name @param {string} planText */
function recordPlan(ctx, name, planText) {
	let current = name;
	const parsed = lib.parseJournalFileName(current);
	if (!parsed) return;
	const title = planTitle(planText);
	if (parsed.draft) current = renameJournal(ctx, current, title);
	const slug = /** @type {NonNullable<ReturnType<typeof lib.parseJournalFileName>>} */ (lib.parseJournalFileName(current)).slug;
	const planName = lib.planFileName(slug);
	write(path.join(ctx.dir, planName), `> ${ctx.labels.journal} : [${current}](${current})\n\n${lib.normalizeText(planText)}\n`);
	const file = path.join(ctx.dir, current);
	const content = lib.setPlanLink(read(file), planName, ctx.labels);
	const version = (content.match(new RegExp(`_${ctx.labels.planValidated}`, 'g')) ?? []).length + 1;
	write(file, content);
	appendBlock(file, `_${ctx.labels.planValidated}${version > 1 ? ` (v${version})` : ''} — [${planName}](${planName})_`);
}

/** @param {string} planText */
function planTitle(planText) {
	return lib.shortTitle(lib.planTitle(planText));
}

/**
 * Keeps date + NNN, changes the slug, carries the plan file along (git mv when tracked so history follows).
 * @param {Ctx} ctx @param {string} name @param {string} title @param {string} [forcedSlug]
 */
function renameJournal(ctx, name, title, forcedSlug) {
	const parsed = lib.parseJournalFileName(name);
	if (!parsed) throw new Error(`invalid journal file name: ${name}`);
	const slug = lib.uniqueSlug(forcedSlug ?? lib.slugify(title), listJournalNames(ctx), name);
	const next = lib.journalFileName(parsed.date, parsed.seq, slug);
	if (next !== name) move(ctx, name, next);
	const oldPlan = lib.planFileName(parsed.slug);
	const newPlan = lib.planFileName(slug);
	const file = path.join(ctx.dir, next);
	let content = lib.setTitle(read(file), lib.shortTitle(title));
	if (oldPlan !== newPlan && fs.existsSync(path.join(ctx.dir, oldPlan))) {
		move(ctx, oldPlan, newPlan);
		content = lib.setPlanLink(content, newPlan, ctx.labels).replaceAll(`](${oldPlan})`, `](${newPlan})`).replaceAll(`[${oldPlan}]`, `[${newPlan}]`);
		const planFile = path.join(ctx.dir, newPlan);
		write(planFile, read(planFile).replaceAll(name, next));
	}
	write(file, content);
	return next;
}

/** @param {Ctx} ctx @param {string} from @param {string} to */
function move(ctx, from, to) {
	const a = path.join(ctx.dir, from);
	const b = path.join(ctx.dir, to);
	try {
		git(ctx.root, ['ls-files', '--error-unmatch', rel(ctx, from)]);
		git(ctx.root, ['mv', rel(ctx, from), rel(ctx, to)]);
	} catch {
		fs.renameSync(a, b);
	}
}

/** @param {Ctx} ctx @param {any} input */
function hookPrecommit(ctx, input) {
	const command = String(input?.tool_input?.command ?? '');
	if (!lib.isGitCommit(command)) return;
	const sid = input?.session_id;
	const name = sid ? findJournal(ctx, sid) : null;
	if (!name || lib.isPaused(read(path.join(ctx.dir, name)), sid)) return;
	const journalRel = rel(ctx, name);
	const plan = planOf(ctx, name);
	const planRel = plan ? rel(ctx, plan) : null;
	// Auto-staging is only for the web sandbox, where anything left uncommitted dies with it.
	// Locally this skill never runs `git add`/`git commit` on its own initiative — this hook is a
	// safety net for whatever commit ends up happening (yours, or Claude's on your explicit request).
	if (lib.isWebEnv(process.env)) {
		try {
			git(ctx.root, ['add', '--', journalRel, ...(planRel ? [planRel] : [])]);
		} catch (err) {
			logError(ctx.root, err);
		}
	}
	if (!ctx.config.enforceCommit || lib.isAmendNoEdit(command)) return;
	const msg = lib.extractCommitMessage(command, (f) => read(path.resolve(ctx.root, f)) || null);
	if (msg === null) return;
	const missing = lib.checkCommitMessage(msg, { journalRel, planRel });
	if (!missing.length) return;
	const reason = [
		`Commit blocked by the journal: missing ${missing.join(', ')}.`,
		'1. Run `/journal note` (synthesis + file table in the journal).',
		'2. Reuse that synthesis in the commit BODY (after the subject line).',
		`3. End with the trailers: Journal: ${journalRel}${planRel ? ` then Plan: ${planRel}` : ''}, before Co-Authored-By.`,
		'Then retry the same commit.',
	].join('\n');
	process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

/** @param {Ctx} ctx @param {string[]} args */
function cmdStatus(ctx, args) {
	const sid = sessionFrom(args);
	const name = findJournal(ctx, sid);
	const plan = name ? planOf(ctx, name) : null;
	const content = name ? read(path.join(ctx.dir, name)) : '';
	const out = { session: sid, journal: name ? rel(ctx, name) : null, plan: plan ? rel(ctx, plan) : null, draft: name ? Boolean(lib.parseJournalFileName(name)?.draft) : null, paused: name ? lib.isPaused(content, sid) : false, verbosity: ctx.verbosity, machine: machine() };
	process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

/** @param {Ctx} ctx @param {string[]} args */
function cmdRename(ctx, args) {
	const sid = sessionFrom(args);
	const slug = takeFlag(args, '--slug');
	const title = args.join(' ').trim();
	if (!title) throw new Error('usage: rename <title> [--slug <slug>]');
	const name = ensureJournal(ctx, sid);
	const next = renameJournal(ctx, name, title, slug ? lib.slugify(slug, 99) : undefined);
	process.stdout.write(`${rel(ctx, next)}\n`);
}

/** @param {Ctx} ctx @param {string[]} args */
function cmdUse(ctx, args) {
	const sid = sessionFrom(args);
	const query = args.join(' ').trim();
	if (!query) throw new Error('usage: use <slug | file name>');
	const names = listJournalNames(ctx);
	const matches = names.filter((n) => n === query || lib.parseJournalFileName(n)?.slug === query);
	const loose = matches.length ? matches : names.filter((n) => n.includes(query));
	if (loose.length !== 1) throw new Error(loose.length ? `ambiguous: ${loose.join(', ')}` : `no journal matches "${query}"`);
	const target = loose[0];
	const current = findJournal(ctx, sid);
	if (current === target) return void process.stdout.write(`${rel(ctx, target)}\n`);
	const targetFile = path.join(ctx.dir, target);
	const date = lib.localDate();
	let draftBody = '';
	if (current) {
		if (!lib.parseJournalFileName(current)?.draft) throw new Error(`session already attached to ${rel(ctx, current)}`);
		const draftContent = read(path.join(ctx.dir, current));
		const at = draftContent.search(/^## /m);
		draftBody = at === -1 ? '' : draftContent.slice(at);
		fs.rmSync(path.join(ctx.dir, current));
	}
	write(targetFile, lib.attachSessionToHeader(read(targetFile), { sessionId: sid, date, machine: machine(), labels: ctx.labels }));
	appendBlock(targetFile, draftBody || lib.renderSessionHeading({ date, sessionId: sid, machine: machine(), labels: ctx.labels }));
	process.stdout.write(`${rel(ctx, target)}\n`);
}

/** @param {Ctx} ctx @param {string[]} args @param {boolean} pause */
function cmdPause(ctx, args, pause) {
	const sid = sessionFrom(args);
	const name = ensureJournal(ctx, sid);
	const file = path.join(ctx.dir, name);
	const content = read(file);
	const marker = lib.pausedMarker(sid);
	if (pause && !content.includes(marker)) appendBlock(file, marker);
	if (!pause) write(file, content.replace(new RegExp(`\\n*${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'g'), '\n'));
	process.stdout.write(`${pause ? 'paused' : 'resumed'}: ${rel(ctx, name)}\n`);
}

/** @param {Ctx} ctx @param {string[]} args */
function cmdVerbosity(ctx, args) {
	const web = args.includes('--web');
	const level = args.find((a) => !a.startsWith('--'));
	if (!lib.isVerbosity(level)) throw new Error(`usage: verbosity <${lib.VERBOSITIES.join('|')}> [--web]`);
	const cfgPath = projectConfigPath(ctx.root);
	let raw = {};
	try {
		raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
	} catch {
		raw = {};
	}
	const current = typeof raw.verbosity === 'object' && raw.verbosity ? raw.verbosity : { default: raw.verbosity ?? 'final', web: 'text+tools' };
	raw.verbosity = { ...current, [web ? 'web' : 'default']: level };
	fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
	fs.writeFileSync(cfgPath, `${JSON.stringify(raw, null, '\t')}\n`, 'utf8');
	process.stdout.write(`${web ? 'web' : 'default'} verbosity = ${level} (${path.relative(ctx.root, cfgPath).split(path.sep).join('/')})\n`);
}

/** @param {Ctx} ctx */
function cmdTable(ctx) {
	let out = '';
	try {
		out = git(ctx.root, ['diff', '--staged', '--name-status', '-M']);
	} catch {
		// not a git repo or nothing staged
	}
	process.stdout.write(`${lib.renderChangeTable(out, ctx.labels) || '(no staged file)'}\n`);
}

/**
 * Rebuilds a whole journal from a transcript with exactly the hooks' rendering. Needed for the
 * session that installs the plugin (hooks only load at the next session) and for older sessions.
 * @param {Ctx} ctx @param {string[]} args
 */
function cmdBackfill(ctx, args) {
	const title = takeFlag(args, '--title');
	const slugArg = takeFlag(args, '--slug');
	const level = takeFlag(args, '--verbosity');
	const force = args.includes('--force');
	const transcriptPath = args.find((a) => !a.startsWith('--'));
	if (!transcriptPath) throw new Error('usage: backfill <transcript.jsonl> [--title t] [--slug s] [--verbosity v] [--force]');
	const verbosity = lib.isVerbosity(level) ? level : ctx.verbosity;
	const entries = lib.parseTranscript(read(transcriptPath));
	const sid = entries.find((e) => e.sessionId)?.sessionId;
	if (!sid) throw new Error('transcript has no sessionId');
	const existing = findJournal(ctx, sid);
	if (existing && !force) throw new Error(`already journaled: ${rel(ctx, existing)} (--force to overwrite)`);
	// A synthesis written by /journal note (or any manual edit) after the last transcript reply is
	// not reconstructible from the transcript — regenerating must not silently drop it.
	const extras = existing ? lib.trailingExtras(read(path.join(ctx.dir, existing))) : '';
	const firstTs = entries.find((e) => e.timestamp)?.timestamp;
	const date = lib.localDate(firstTs ? new Date(firstTs) : new Date());
	const m = entries.find((e) => e.entrypoint)?.entrypoint?.includes('remote') ? 'web' : machine();

	/** @type {Map<string, any>} tool_use id → tool_result entry */
	const results = new Map();
	for (const e of entries) {
		if (e.type !== 'user' || !Array.isArray(e.message?.content)) continue;
		for (const b of e.message.content) if (b?.type === 'tool_result') results.set(b.tool_use_id, { block: b, entry: e });
	}

	const idx = [];
	for (let i = 0; i < entries.length; i++) if (lib.userPromptText(entries[i])) idx.push(i);
	const chunks = [];
	let approvedPlan = '';
	for (let k = 0; k < idx.length; k++) {
		const promptEntry = entries[idx[k]];
		const text = lib.userPromptText(promptEntry);
		const turn = entries.slice(idx[k] + 1, k + 1 < idx.length ? idx[k + 1] : entries.length);
		if (lib.isJournalCommand(text)) continue;
		const prompt = lib.userPromptHasImage(promptEntry) ? `${text}\n\n_[${ctx.labels.image}]_` : text;
		chunks.push(lib.renderPrompt(lib.redactSecrets(prompt, ctx.config.redact), chunks.length > 0));
		for (const e of turn) {
			if (e.type !== 'assistant') continue;
			for (const b of e.message?.content ?? []) {
				if (b?.type !== 'tool_use') continue;
				const r = results.get(b.id);
				if (!r || r.block.is_error) continue;
				if (b.name === 'AskUserQuestion') {
					const block = lib.renderQuestions(b.input, r.entry.toolUseResult ?? (typeof r.block.content === 'string' ? r.block.content : ''), ctx.labels);
					if (block) chunks.push(block);
				}
				if (b.name === 'ExitPlanMode') {
					approvedPlan = r.entry.toolUseResult?.plan ?? b.input?.plan ?? approvedPlan;
					chunks.push(`_${ctx.labels.planValidated} — [@@PLAN@@](@@PLAN@@)_`);
				}
			}
		}
		const interrupted = turn.some((e) => e.type === 'user' && /\[Request interrupted/.test(JSON.stringify(e.message?.content ?? '')));
		const blocks = redactBlocks(ctx, lib.extractAssistantBlocks(turn, verbosity));
		const lastTs = [...turn].reverse().find((e) => e.type === 'assistant' && e.timestamp)?.timestamp;
		chunks.push(lib.renderReply({ time: lib.localTime(lastTs ? new Date(lastTs) : new Date()), blocks, files: lib.turnTouchedFiles(turn, ctx.root, [ctx.dirRel]), interrupted: interrupted && blocks.length > 0, labels: ctx.labels }));
	}

	const featureTitle = title ?? (approvedPlan ? planTitle(approvedPlan) : `${ctx.labels.draft} ${sid.slice(0, 8)}`);
	const names = listJournalNames(ctx).filter((n) => n !== existing);
	const parsedExisting = existing ? lib.parseJournalFileName(existing) : null;
	const baseSlug = slugArg ? lib.slugify(slugArg, 99) : approvedPlan || title ? lib.slugify(featureTitle) : lib.draftSlug(sid);
	const slug = lib.uniqueSlug(baseSlug, names);
	const name = lib.journalFileName(parsedExisting?.date ?? date, parsedExisting?.seq ?? lib.nextSeq(names, date), slug);
	if (existing && existing !== name) fs.rmSync(path.join(ctx.dir, existing));
	const planName = lib.planFileName(slug);
	let header = lib.renderHeader({ title: lib.shortTitle(featureTitle), sessionId: sid, date, machine: m, labels: ctx.labels });
	if (approvedPlan) header = lib.setPlanLink(header, planName, ctx.labels);
	const body = chunks.join('\n\n').replaceAll('@@PLAN@@', planName);
	write(path.join(ctx.dir, name), `${header}\n${lib.renderSessionHeading({ date, sessionId: sid, machine: m, labels: ctx.labels })}\n\n${body}${extras ? `\n\n${extras}` : ''}\n`);
	if (approvedPlan) write(path.join(ctx.dir, planName), `> ${ctx.labels.journal} : [${name}](${name})\n\n${lib.normalizeText(approvedPlan)}\n`);
	process.stdout.write(`${rel(ctx, name)}${approvedPlan ? `\n${rel(ctx, planName)}` : ''}\n`);
	if (extras) process.stderr.write('backfill: content appended after the last exchange (synthesis…) preserved\n');
}

const HELP = `journal.mjs — Claude Code conversation journal (github.com/appynamic/ai-dev-skills)

Hooks (JSON on stdin): session | prompt | stop | tool | precommit
CLI:
  status                      journal/plan/verbosity of the current session (JSON)
  rename <title> [--slug s]   renames the session's journal (date + NNN kept)
  use <slug>                  attaches the session to an existing journal
  pause | resume              suspends / resumes journaling for the session
  verbosity <level> [--web]   final | text | text+tools
  table                       markdown table of staged files
  backfill <transcript.jsonl> [--title t] [--slug s] [--verbosity v] [--force]
Common options: --session <id> (default: $CLAUDE_CODE_SESSION_ID)
`;

// ─── Main ─────────────────────────────────────────────────────────────────────

const HOOKS = new Set(['session', 'prompt', 'stop', 'tool', 'precommit']);

async function main() {
	const [cmd = 'help', ...args] = process.argv.slice(2);
	if (HOOKS.has(cmd)) {
		let input = {};
		const raw = readStdin();
		try {
			input = raw.trim() ? JSON.parse(raw) : {};
		} catch (err) {
			logError(projectRoot(), err, raw.slice(0, 2000));
			return;
		}
		const ctx = context(input);
		try {
			if (cmd === 'session') await hookSession(ctx, input);
			else if (cmd === 'prompt') hookPrompt(ctx, input);
			else if (cmd === 'stop') hookStop(ctx, input);
			else if (cmd === 'tool') hookTool(ctx, input);
			else if (cmd === 'precommit') hookPrecommit(ctx, input);
		} catch (err) {
			logError(ctx.root, err, { cmd, session: /** @type {any} */ (input).session_id });
		}
		return;
	}
	const ctx = context();
	try {
		if (cmd === 'status') cmdStatus(ctx, args);
		else if (cmd === 'rename') cmdRename(ctx, args);
		else if (cmd === 'use') cmdUse(ctx, args);
		else if (cmd === 'pause') cmdPause(ctx, args, true);
		else if (cmd === 'resume') cmdPause(ctx, args, false);
		else if (cmd === 'verbosity') cmdVerbosity(ctx, args);
		else if (cmd === 'table') cmdTable(ctx);
		else if (cmd === 'backfill') cmdBackfill(ctx, args);
		else process.stdout.write(HELP);
	} catch (err) {
		process.stderr.write(`journal: ${err instanceof Error ? err.message : String(err)}\n`);
		process.exitCode = 1;
	}
}

await main();
