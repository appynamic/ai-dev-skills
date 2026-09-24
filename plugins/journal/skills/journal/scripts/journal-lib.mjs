// @ts-check
// Pure logic of the journal skill (github.com/appynamic/ai-dev-skills): no filesystem, no
// process, no git. Everything here is covered by journal-lib.test.mjs (node:test).
import path from 'node:path';

export const SEPARATOR = '--------------------------------------------';

/** @typedef {'final' | 'text' | 'text+tools'} Verbosity */
/** @type {Verbosity[]} */
export const VERBOSITIES = ['final', 'text', 'text+tools'];

/**
 * @typedef {object} JournalConfig
 * @property {string} dir
 * @property {'fr' | 'en'} locale
 * @property {boolean} enforceCommit
 * @property {{ default?: Verbosity, web?: Verbosity } | Verbosity} [verbosity]
 * @property {string[]} [redact]
 */

/** @type {JournalConfig} */
export const DEFAULT_CONFIG = { dir: 'docs/journals', locale: 'fr', enforceCommit: true, verbosity: { default: 'final', web: 'text+tools' }, redact: [] };

export const LABELS = {
	fr: { claude: 'Claude', asks: 'Claude demande', options: 'Options', choice: 'choix', note: 'note', free: 'libre', noAnswer: 'sans réponse', files: 'fichiers', interrupted: 'tour interrompu', plan: 'Plan', sessions: 'Sessions', session: 'Session', none: '—', planValidated: 'Plan validé', draft: 'Brouillon', journal: 'Journal', file: 'Fichier', change: 'Changement', image: 'image jointe', status: { A: 'nouveau', M: 'modifié', D: 'supprimé', R: 'renommé', C: 'copié', T: 'type modifié', U: 'en conflit' } },
	en: { claude: 'Claude', asks: 'Claude asks', options: 'Options', choice: 'choice', note: 'note', free: 'free text', noAnswer: 'no answer', files: 'files', interrupted: 'interrupted turn', plan: 'Plan', sessions: 'Sessions', session: 'Session', none: '—', planValidated: 'Plan approved', draft: 'Draft', journal: 'Journal', file: 'File', change: 'Change', image: 'attached image', status: { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied', T: 'type changed', U: 'conflicted' } },
};

/** @param {string | undefined} locale */
export function labelsFor(locale) {
	return locale === 'en' ? LABELS.en : LABELS.fr;
}

// ─── Markers ──────────────────────────────────────────────────────────────────
// All machine markers share the `journal:` prefix so user/assistant text quoting them can be
// neutralised by escapeMarkers() without touching any other HTML comment.

/** @param {string} sessionId */
export function sessionMarker(sessionId) {
	return `<!-- journal:session ${sessionId} -->`;
}
/** @param {string} sessionId */
export function pausedMarker(sessionId) {
	return `<!-- journal:paused ${sessionId} -->`;
}
export const TURN_MARKER = '<!-- journal:turn -->';
export const REPLY_MARKER = '<!-- journal:reply -->';

/** @param {string} text */
export function escapeMarkers(text) {
	return text.replace(/<!--(\s*)journal:/g, '&lt;!--$1journal:');
}

/**
 * Anything appended after the last known reply (typically a `### Synthèse` block from `/journal
 * note`) is not reconstructible from a transcript: backfill must not silently drop it.
 * @param {string} content
 */
export function trailingExtras(content) {
	const at = content.lastIndexOf(REPLY_MARKER);
	if (at === -1) return '';
	return content.slice(at + REPLY_MARKER.length).replace(/^\s+/, '').replace(/\s+$/, '');
}

/** @param {string} content */
export function hasPendingReply(content) {
	return content.lastIndexOf(TURN_MARKER) > content.lastIndexOf(REPLY_MARKER);
}

/** @param {string} content @param {string} sessionId */
export function isPaused(content, sessionId) {
	return content.includes(pausedMarker(sessionId));
}

/**
 * @param {{ name: string, content: string }[]} files
 * @param {string} sessionId
 * @returns {string | null}
 */
export function findSessionJournal(files, sessionId) {
	const marker = sessionMarker(sessionId);
	const hit = files.find((f) => f.content.includes(marker));
	return hit ? hit.name : null;
}

// ─── Text normalisation ───────────────────────────────────────────────────────

/** NFC because macOS may hand us NFD text, which would produce phantom diffs between machines. @param {string} text */
export function normalizeText(text) {
	return String(text ?? '')
		.replace(/\r\n?/g, '\n')
		.normalize('NFC')
		.replace(/^\s*\n/, '')
		.replace(/\s+$/, '');
}

/** Every line gets its own `>` — a lone `>` on blank lines keeps multi-paragraph prompts inside one quote. @param {string} text */
export function quotePrompt(text) {
	return normalizeText(text)
		.split('\n')
		.map((l) => l.replace(/\s+$/, ''))
		.map((l) => (l ? `> ${l}` : '>'))
		.join('\n');
}

const IDE_TAGS = ['ide_opened_file', 'ide_selection', 'system-reminder', 'ide_diagnostics'];

/** Strips editor/harness wrappers that are not part of what the user typed. @param {string} raw */
export function cleanPrompt(raw) {
	let text = String(raw ?? '');
	for (const tag of IDE_TAGS) text = text.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g'), '');
	text = normalizeText(text);
	if (!text) return '';
	if (/^\[Request interrupted/.test(text)) return '';
	if (/^<(local-command-|task-notification|command-message)/.test(text)) return '';
	const cmd = text.match(/^<command-name>([^<]*)<\/command-name>/);
	if (cmd) {
		const name = cmd[1].trim();
		// Built-in harness commands (/model, /clear…) are noise; skills stay visible.
		if (/^\/(model|clear|compact|config|cost|help|hooks|login|logout|memory|permissions|status|resume|exit|fast|effort|context)$/.test(name)) return '';
		const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1].trim();
		return args ? `${name} ${args}` : name;
	}
	return text;
}

/** @param {string} text */
export function isJournalCommand(text) {
	return /^\/journal(\s|$)/.test(text.trim());
}

/** Journal headings stay the outline; assistant headings are pushed below them. @param {string} text */
export function demoteHeadings(text, by = 3) {
	let fence = false;
	return text
		.split('\n')
		.map((line) => {
			if (/^\s*(```|~~~)/.test(line)) fence = !fence;
			if (fence) return line;
			const m = line.match(/^(#{1,6})(\s.*)$/);
			if (!m) return line;
			return `${'#'.repeat(Math.min(6, m[1].length + by))}${m[2]}`;
		})
		.join('\n');
}

// ─── Secrets ──────────────────────────────────────────────────────────────────
// Journals are committed: a secret pasted in a prompt would otherwise live forever in git history.

const SECRET_PATTERNS = [
	[/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED:private-key]'],
	[/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '[REDACTED:jwt]'],
	[/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/g, '$1 [REDACTED]'],
	[/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}/g, '[REDACTED]'],
	[/\bsk-[A-Za-z0-9_-]{16,}/g, '[REDACTED]'],
	[/\bre_[A-Za-z0-9_]{16,}/g, '[REDACTED]'],
	[/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[REDACTED]'],
	[/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED]'],
	[/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]'],
	[/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED]'],
	[/\b([A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret))(\s*[:=]\s*)(["']?)([^\s"'`,;]{4,})\3/gi, '$1$2$3[REDACTED]$3'],
];

/** @param {string} text @param {string[]} [extra] extra regex sources from journal.config.json */
export function redactSecrets(text, extra = []) {
	let out = String(text ?? '');
	for (const [re, rep] of SECRET_PATTERNS) out = out.replace(/** @type {RegExp} */ (re), /** @type {string} */ (rep));
	for (const src of extra) {
		try {
			out = out.replace(new RegExp(src, 'g'), '[REDACTED]');
		} catch {
			// an invalid user pattern must never break journaling
		}
	}
	return out;
}

// ─── Names ────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'ou', 'pour', 'un', 'une', 'a', 'au', 'aux', 'en', 'sur', 'avec', 'dans', 'par', 'the', 'of', 'and', 'for', 'to', 'an', 'in', 'on', 'with', 'plan']);

/** @param {string} title */
export function slugify(title, maxWords = 5) {
	// Only the part before an em dash / colon names the feature; the rest is a subtitle.
	const head = String(title ?? '').split(/\s[—–-]\s|:\s/)[0];
	const words = head
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter((w) => w && !STOPWORDS.has(w));
	return words.slice(0, maxWords).join('-').slice(0, 60).replace(/-+$/, '') || 'journal';
}

/** @param {string} title */
export function shortTitle(title) {
	return String(title ?? '').split(/\s[—–-]\s/)[0].replace(/^plan\s*[:—-]\s*/i, '').trim();
}

export const JOURNAL_RE = /^(\d{4}-\d{2}-\d{2})--(\d{3})-(.+)\.md$/;

/** @param {string} date @param {number} seq @param {string} slug */
export function journalFileName(date, seq, slug) {
	return `${date}--${String(seq).padStart(3, '0')}-${slug}.md`;
}

/** @param {string} slug */
export function planFileName(slug) {
	return `plan-${slug}.md`;
}

/** @param {string} sessionId */
export function draftSlug(sessionId) {
	return `brouillon-${sessionId.slice(0, 8)}`;
}

/**
 * @param {string} name
 * @returns {{ date: string, seq: number, slug: string, draft: boolean } | null}
 */
export function parseJournalFileName(name) {
	const m = path.posix.basename(name).match(JOURNAL_RE);
	if (!m) return null;
	return { date: m[1], seq: Number(m[2]), slug: m[3], draft: m[3].startsWith('brouillon-') };
}

/** @param {string[]} names @param {string} date */
export function nextSeq(names, date) {
	let max = 0;
	for (const n of names) {
		const p = parseJournalFileName(n);
		if (p && p.date === date && p.seq > max) max = p.seq;
	}
	return max + 1;
}

/**
 * A slug names one feature: journal `…--NNN-<slug>.md` and `plan-<slug>.md` must stay a pair.
 * @param {string} slug @param {string[]} names existing file names in the journals dir @param {string} [ownName] the journal being renamed
 */
export function uniqueSlug(slug, names, ownName) {
	const taken = new Set();
	for (const n of names) {
		if (n === ownName) continue;
		const p = parseJournalFileName(n);
		if (p) taken.add(p.slug);
	}
	if (!taken.has(slug)) return slug;
	for (let i = 2; ; i++) if (!taken.has(`${slug}-${i}`)) return `${slug}-${i}`;
}

/** @param {string} md @param {string} [fallback] */
export function planTitle(md, fallback = 'Plan') {
	const line = String(md ?? '')
		.split(/\r?\n/)
		.find((l) => /^#\s+\S/.test(l));
	return line ? line.replace(/^#\s+/, '').trim() : fallback;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/** @param {number} n */
function pad(n) {
	return String(n).padStart(2, '0');
}
/** @param {Date} d */
export function localDate(d = new Date()) {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** @param {Date} d */
export function localTime(d = new Date()) {
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * @param {{ title: string, sessionId: string, date: string, machine: string, labels: typeof LABELS.fr }} o
 */
export function renderHeader(o) {
	return [`# ${o.title}`, '', sessionMarker(o.sessionId), '', `- ${o.labels.plan} : ${o.labels.none}`, `- ${o.labels.sessions} : \`${o.sessionId.slice(0, 8)}\` ${o.date} (${o.machine})`, ''].join('\n');
}

/** @param {{ date: string, sessionId: string, machine: string, labels: typeof LABELS.fr }} o */
export function renderSessionHeading(o) {
	return `## ${o.labels.session} ${o.date} · ${o.sessionId.slice(0, 8)} (${o.machine})`;
}

/**
 * Adds a second (third…) session to an existing journal header.
 * @param {string} content @param {{ sessionId: string, date: string, machine: string, labels: typeof LABELS.fr }} o
 */
export function attachSessionToHeader(content, o) {
	let out = content;
	if (!out.includes(sessionMarker(o.sessionId))) {
		const markers = [...out.matchAll(/<!-- journal:session [^>]+ -->\n/g)];
		const last = markers.at(-1);
		if (last && last.index !== undefined) out = out.slice(0, last.index + last[0].length) + `${sessionMarker(o.sessionId)}\n` + out.slice(last.index + last[0].length);
		else out = out.replace(/^(# .*\n)/, `$1\n${sessionMarker(o.sessionId)}\n`);
	}
	const entry = `\`${o.sessionId.slice(0, 8)}\` ${o.date} (${o.machine})`;
	const re = new RegExp(`^(- ${o.labels.sessions} : .*)$`, 'm');
	if (re.test(out) && !out.match(re)?.[1].includes(entry)) out = out.replace(re, `$1, ${entry}`);
	return out;
}

/** @param {string} content @param {string} planName @param {typeof LABELS.fr} labels */
export function setPlanLink(content, planName, labels) {
	const re = new RegExp(`^- ${labels.plan} : .*$`, 'm');
	const line = `- ${labels.plan} : [${planName}](${planName})`;
	return re.test(content) ? content.replace(re, line) : content.replace(/^(# .*\n)/, `$1\n${line}\n`);
}

/** @param {string} content @param {string} title */
export function setTitle(content, title) {
	return content.replace(/^# .*$/m, `# ${title}`);
}

/** Journal ends with a session heading → the next prompt opens the session, no separator. @param {string} content */
export function needsSeparator(content) {
	const lines = content.replace(/\s+$/, '').split('\n');
	const last = lines.at(-1) ?? '';
	return !/^## /.test(last) && !/^- .* : /.test(last) && !/^<!-- journal:session/.test(last);
}

/** @param {string} prompt @param {boolean} separator */
export function renderPrompt(prompt, separator) {
	return `${separator ? `${SEPARATOR}\n\n` : ''}${quotePrompt(escapeMarkers(prompt))}\n\n${TURN_MARKER}`;
}

/** @typedef {{ type: 'text', text: string } | { type: 'tools', tools: { name: string, count: number }[] }} AssistantBlock */

/** @param {{ name: string, count: number }[]} tools */
export function renderToolGroup(tools) {
	return `_⚙ ${tools.map((t) => (t.count > 1 ? `${t.name} ×${t.count}` : t.name)).join(', ')}_`;
}

/**
 * @param {{ time: string, blocks: AssistantBlock[], files: string[], interrupted?: boolean, labels: typeof LABELS.fr }} o
 */
export function renderReply(o) {
	const body = o.blocks.map((b) => (b.type === 'text' ? demoteHeadings(escapeMarkers(normalizeText(b.text))) : renderToolGroup(b.tools))).filter(Boolean);
	if (!body.length && !o.files.length) return REPLY_MARKER;
	const meta = [`**${o.labels.claude}** · ${o.time}`];
	if (o.interrupted) meta.push(`_(${o.labels.interrupted})_`);
	if (o.files.length) meta.push(`_${o.labels.files} : ${o.files.join(', ')}_`);
	return [meta.join(' · '), '', ...body.flatMap((b) => [b, '']), REPLY_MARKER].join('\n');
}

// ─── AskUserQuestion ──────────────────────────────────────────────────────────

/** Fallback when only the tool_result text is available: `"question"="answer", …`. @param {string} text */
export function parseAnswersText(text) {
	/** @type {Record<string, string>} */
	const out = {};
	for (const m of String(text ?? '').matchAll(/"((?:[^"\\]|\\.)*)"="((?:[^"\\]|\\.)*)"/g)) out[m[1]] = m[2];
	return out;
}

/**
 * @param {any} toolInput
 * @param {any} toolResponse
 * @param {typeof LABELS.fr} labels
 * @returns {string} empty when nothing could be understood
 */
export function renderQuestions(toolInput, toolResponse, labels) {
	const resp = typeof toolResponse === 'string' ? { answers: parseAnswersText(toolResponse) } : (toolResponse ?? {});
	/** @type {any[]} */
	const questions = toolInput?.questions ?? resp.questions ?? [];
	/** @type {Record<string, string>} */
	const answers = resp.answers ?? toolInput?.answers ?? {};
	/** @type {Record<string, { notes?: string }>} */
	const annotations = resp.annotations ?? toolInput?.annotations ?? {};
	const parts = [];
	for (const q of questions) {
		if (!q?.question) continue;
		/** @type {string[]} */
		const optionLabels = (q.options ?? []).map((/** @type {any} */ o) => String(o.label));
		const lines = [`**${labels.asks}** — ${escapeMarkers(normalizeText(q.question))}`];
		if (optionLabels.length) lines.push(`_${labels.options} : ${optionLabels.join(' · ')}_`);
		const answer = answers[q.question];
		if (answer === undefined || answer === '') lines.push(`> _(${labels.noAnswer})_`);
		else {
			const raw = String(answer);
			const pieces = q.multiSelect ? raw.split(/\s*,\s*/) : [raw];
			const allKnown = pieces.every((p) => optionLabels.includes(p));
			const kind = allKnown ? labels.choice : labels.free;
			const shown = allKnown ? pieces.join(' · ') : raw;
			lines.push(quotePrompt(`[${kind}] ${redactSecrets(shown)}`));
		}
		const note = annotations[q.question]?.notes;
		if (note) lines.push(quotePrompt(`[${labels.note}] ${redactSecrets(note)}`));
		parts.push(lines.join('\n'));
	}
	return parts.join('\n\n');
}

// ─── Transcript ───────────────────────────────────────────────────────────────

/** @param {string} jsonl @returns {any[]} */
export function parseTranscript(jsonl) {
	const out = [];
	for (const line of String(jsonl ?? '').split('\n')) {
		if (!line.trim()) continue;
		try {
			out.push(JSON.parse(line));
		} catch {
			// a partially flushed last line is expected while the session is live
		}
	}
	return out;
}

/** @param {any} entry @returns {string} cleaned prompt, '' when the entry is not something the user typed */
export function userPromptText(entry) {
	if (!entry || entry.type !== 'user' || entry.isMeta || entry.isSidechain) return '';
	// origin.kind is 'human' for a real prompt; absent for most tool-result entries (already
	// filtered below by the tool_result check); anything else (e.g. 'task-notification') is not typed input.
	if (entry.origin?.kind && entry.origin.kind !== 'human') return '';
	const c = entry.message?.content;
	if (typeof c === 'string') return cleanPrompt(c);
	if (!Array.isArray(c) || c.some((b) => b?.type === 'tool_result')) return '';
	const text = c
		.filter((b) => b?.type === 'text')
		.map((b) => b.text)
		.join('\n');
	return cleanPrompt(text);
}

/** @param {any} entry */
export function userPromptHasImage(entry) {
	const c = entry?.message?.content;
	return Array.isArray(c) && c.some((b) => b?.type === 'image');
}

/** @param {any[]} entries @returns {number[]} */
function promptIndexes(entries) {
	const idx = [];
	for (let i = 0; i < entries.length; i++) if (userPromptText(entries[i])) idx.push(i);
	return idx;
}

/** Entries of the turn opened by the last real prompt. @param {any[]} entries */
export function currentTurn(entries) {
	const idx = promptIndexes(entries);
	return idx.length ? entries.slice(idx.at(-1) + 1) : entries;
}

/**
 * Called from UserPromptSubmit: the new prompt may or may not already be in the transcript.
 * @param {any[]} entries @param {string} newPrompt
 */
export function previousTurn(entries, newPrompt) {
	const idx = promptIndexes(entries);
	if (!idx.length) return [];
	const lastIsNew = normalizeText(userPromptText(entries[idx.at(-1)])) === normalizeText(cleanPrompt(newPrompt));
	if (lastIsNew) return idx.length > 1 ? entries.slice(idx.at(-2) + 1, idx.at(-1)) : [];
	return entries.slice(idx.at(-1) + 1);
}

/**
 * @param {any[]} turn
 * @param {Verbosity} verbosity
 * @returns {AssistantBlock[]}
 */
export function extractAssistantBlocks(turn, verbosity) {
	/** @type {AssistantBlock[]} */
	const seq = [];
	for (const e of turn) {
		if (e?.type !== 'assistant' || e.isSidechain) continue;
		for (const b of e.message?.content ?? []) {
			if (b?.type === 'text' && b.text?.trim()) seq.push({ type: 'text', text: b.text });
			else if (b?.type === 'tool_use') {
				const last = seq.at(-1);
				if (last?.type === 'tools') {
					const t = last.tools.find((x) => x.name === b.name);
					if (t) t.count++;
					else last.tools.push({ name: b.name, count: 1 });
				} else seq.push({ type: 'tools', tools: [{ name: b.name, count: 1 }] });
			}
		}
	}
	const texts = seq.filter((b) => b.type === 'text');
	if (verbosity === 'final') return texts.length ? [/** @type {AssistantBlock} */ (texts.at(-1))] : [];
	if (verbosity === 'text') return texts;
	return seq;
}

/**
 * Stop's `last_assistant_message` is authoritative for the final message; the transcript may lag behind it.
 * @param {AssistantBlock[]} blocks @param {string | undefined} lastMessage @param {Verbosity} verbosity
 */
export function reconcileLastMessage(blocks, lastMessage, verbosity) {
	const last = normalizeText(lastMessage ?? '');
	if (!last) return blocks;
	if (verbosity === 'final') return [{ type: 'text', text: last }];
	const lastText = [...blocks].reverse().find((b) => b.type === 'text');
	if (lastText && lastText.type === 'text' && normalizeText(lastText.text) === last) return blocks;
	return [...blocks, { type: 'text', text: last }];
}

/** @param {string} p */
function looksWindows(p) {
	return /^[A-Za-z]:[\\/]/.test(p) || p.includes('\\');
}

/**
 * Repo-relative, posix paths of files the turn edited. Files outside the repo (plan files live in
 * ~/.claude/plans) and excluded dirs (the journals themselves) do not count as "code changed".
 * @param {any[]} turn @param {string} projectDir @param {string[]} [excludeDirs] posix, repo-relative
 */
export function turnTouchedFiles(turn, projectDir, excludeDirs = []) {
	const p = looksWindows(projectDir) ? path.win32 : path.posix;
	const out = new Set();
	for (const e of turn) {
		if (e?.type !== 'assistant' || e.isSidechain) continue;
		for (const b of e.message?.content ?? []) {
			if (b?.type !== 'tool_use' || !/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(b.name)) continue;
			const file = b.input?.file_path ?? b.input?.notebook_path;
			if (!file) continue;
			const rel = p.relative(projectDir, p.resolve(projectDir, file)).split(p.sep).join('/');
			if (!rel || rel.startsWith('..') || p.isAbsolute(rel)) continue;
			if (excludeDirs.some((d) => rel === d || rel.startsWith(`${d.replace(/\/$/, '')}/`))) continue;
			out.add(rel);
		}
	}
	return [...out];
}

// ─── Verbosity ────────────────────────────────────────────────────────────────

/** @param {Record<string, string | undefined>} env */
export function isWebEnv(env) {
	return env.CLAUDE_CODE_REMOTE === 'true' || /remote|web/i.test(env.CLAUDE_CODE_ENTRYPOINT ?? '');
}

/** @param {unknown} v @returns {v is Verbosity} */
export function isVerbosity(v) {
	return typeof v === 'string' && /** @type {string[]} */ (VERBOSITIES).includes(v);
}

/** @param {Partial<JournalConfig>} config @param {Record<string, string | undefined>} env @returns {Verbosity} */
export function resolveVerbosity(config, env) {
	if (isVerbosity(env.CLAUDE_JOURNAL_VERBOSITY)) return env.CLAUDE_JOURNAL_VERBOSITY;
	const v = config.verbosity;
	if (isVerbosity(v)) return v;
	if (v && typeof v === 'object') {
		if (isWebEnv(env) && isVerbosity(v.web)) return v.web;
		if (isVerbosity(v.default)) return v.default;
	}
	return 'final';
}

// ─── Git commit guard ─────────────────────────────────────────────────────────

/** @param {string} command */
export function isGitCommit(command) {
	return String(command ?? '')
		.split(/&&|\|\||;|\n|\|/)
		.some((seg) => /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:rtk\s+)?git(?:\s+-[cC]\s+\S+)*\s+commit\b/.test(seg));
}

/** @param {string} command */
export function isAmendNoEdit(command) {
	return /--amend\b/.test(command) && /--no-edit\b/.test(command);
}

/**
 * @param {string} command
 * @param {(file: string) => string | null} [readFile]
 * @returns {string | null} null when the message comes from an editor or cannot be read
 */
export function extractCommitMessage(command, readFile = () => null) {
	const cmd = String(command ?? '');
	const heredoc = cmd.match(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n\s*\2\b/);
	if (heredoc) return heredoc[3];
	const psHere = cmd.match(/@(['"])\r?\n([\s\S]*?)\r?\n\1@/);
	if (psHere) return psHere[2];
	const msgs = [];
	for (const m of cmd.matchAll(/(?:^|\s)(?:-m|--message)(?:\s+|=)(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/g)) msgs.push((m[1] !== undefined ? m[1].replace(/\\(["\\$`])/g, '$1') : (m[2] ?? m[3])) ?? '');
	if (msgs.length) return msgs.join('\n\n');
	const file = cmd.match(/(?:^|\s)(?:-F|--file)(?:\s+|=)(?:"([^"]+)"|'([^']+)'|(\S+))/);
	if (file) return readFile(file[1] ?? file[2] ?? file[3]);
	return null;
}

const TRAILER_RE = /^[A-Za-z][\w-]*: \S/;

/**
 * @param {string} msg
 * @param {{ journalRel: string, planRel?: string | null }} o
 * @returns {string[]} what is missing; empty = ok
 */
export function checkCommitMessage(msg, o) {
	const missing = [];
	const lines = String(msg ?? '').replace(/\r\n?/g, '\n').split('\n');
	if (!lines.some((l) => /^Journal:\s*\S/.test(l))) missing.push(`Journal: ${o.journalRel}`);
	if (o.planRel && !lines.some((l) => /^Plan:\s*\S/.test(l))) missing.push(`Plan: ${o.planRel}`);
	const body = lines.slice(1).filter((l) => l.trim() && !TRAILER_RE.test(l) && !l.startsWith('#'));
	if (!body.length) missing.push('synthèse');
	return missing;
}

/**
 * Idempotent: a trailer already present (same key and value) is not added twice. New trailers go
 * at the top of the existing trailer block so `Co-Authored-By` stays last; git comment lines stay at the end.
 * @param {string} msg @param {{ key: string, value: string }[]} trailers
 */
export function addTrailers(msg, trailers) {
	const eol = msg.includes('\r\n') ? '\r\n' : '\n';
	const lines = msg.replace(/\r\n/g, '\n').split('\n');
	let end = lines.length;
	while (end > 0 && (lines[end - 1].startsWith('#') || !lines[end - 1].trim())) end--;
	const body = lines.slice(0, end);
	const tail = lines.slice(end);
	const todo = trailers.filter((t) => !body.some((l) => l.trim().toLowerCase() === `${t.key}: ${t.value}`.toLowerCase()));
	if (!todo.length) return msg;
	let start = body.length;
	while (start > 0 && TRAILER_RE.test(body[start - 1])) start--;
	const hasBlock = start < body.length && start > 0 && !body[start - 1].trim();
	const add = todo.map((t) => `${t.key}: ${t.value}`);
	const next = hasBlock ? [...body.slice(0, start), ...add, ...body.slice(start)] : [...body, ...(body.length && body.at(-1)?.trim() ? [''] : []), ...add];
	return [...next, ...tail].join(eol);
}

/** @param {string} nameStatus output of `git diff --staged --name-status` @param {typeof LABELS.fr} labels */
export function renderChangeTable(nameStatus, labels) {
	const rows = [];
	for (const line of String(nameStatus ?? '').split(/\r?\n/)) {
		if (!line.trim()) continue;
		const [status, a, b] = line.split('\t');
		const code = /** @type {keyof typeof labels.status} */ (status[0]);
		const word = labels.status[code] ?? status;
		if ((code === 'R' || code === 'C') && b) rows.push(`| \`${b}\` | ${word} (← \`${a}\`) |`);
		else rows.push(`| \`${a}\` | ${word} |`);
	}
	if (!rows.length) return '';
	return [`| ${labels.file} | ${labels.change} |`, '| --- | --- |', ...rows].join('\n');
}
