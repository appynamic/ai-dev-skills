// @ts-check
// node --test plugins/journal/skills/journal/scripts/journal-lib.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as lib from './journal-lib.mjs';

const L = lib.LABELS.fr;

describe('slugify / names', () => {
	it('drops accents, stopwords and the subtitle after an em dash', () => {
		assert.equal(lib.slugify('Journal de conversations auto — hooks + skill'), 'journal-conversations-auto');
		assert.equal(lib.slugify('Écran Élève : détails'), 'ecran-eleve');
		assert.equal(lib.slugify('Plan de refonte des webhooks facturation'), 'refonte-webhooks-facturation');
		assert.equal(lib.slugify('!!!'), 'journal');
	});

	it('builds and parses YYYY-MM-DD--NNN-slug names', () => {
		assert.equal(lib.journalFileName('2026-09-24', 1, 'x'), '2026-09-24--001-x.md');
		assert.deepEqual(lib.parseJournalFileName('docs/journals/2026-09-24--012-brouillon-1dc5da85.md'), { date: '2026-09-24', seq: 12, slug: 'brouillon-1dc5da85', draft: true });
		assert.equal(lib.parseJournalFileName('plan-x.md'), null);
		assert.equal(lib.planFileName('x'), 'plan-x.md');
	});

	it('numbers per day and restarts each day', () => {
		const names = ['2026-09-24--001-a.md', '2026-09-24--002-b.md', '2026-09-23--007-c.md', 'plan-a.md', 'README.md'];
		assert.equal(lib.nextSeq(names, '2026-09-24'), 3);
		assert.equal(lib.nextSeq(names, '2026-09-25'), 1);
	});

	it('keeps a slug unique across features but lets a journal keep its own slug', () => {
		const names = ['2026-09-24--001-a.md', '2026-09-24--002-a-2.md'];
		assert.equal(lib.uniqueSlug('a', names), 'a-3');
		assert.equal(lib.uniqueSlug('a', names, '2026-09-24--001-a.md'), 'a');
		assert.equal(lib.uniqueSlug('b', names), 'b');
	});

	it('reads the plan title', () => {
		assert.equal(lib.planTitle('intro\n# Mon plan — détails\n## x'), 'Mon plan — détails');
		assert.equal(lib.shortTitle('Mon plan — détails'), 'Mon plan');
	});
});

describe('quotePrompt / cleanPrompt', () => {
	it('prefixes every line, blank lines included, and keeps code fences inside the quote', () => {
		assert.equal(lib.quotePrompt('ligne 1\r\nligne 2\n\n```ts\nconst x = 1   \n```'), '> ligne 1\n> ligne 2\n>\n> ```ts\n> const x = 1\n> ```');
	});

	it('normalises NFD (macOS) to NFC', () => {
		assert.equal(lib.quotePrompt('e\u0301te\u0301'), '> été');
	});

	it('strips IDE wrappers and harness noise', () => {
		assert.equal(lib.cleanPrompt('<ide_opened_file>The user opened x</ide_opened_file>le plan ne doit pas'), 'le plan ne doit pas');
		assert.equal(lib.cleanPrompt('[Request interrupted by user for tool use]'), '');
		assert.equal(lib.cleanPrompt('<local-command-stdout>Set model</local-command-stdout>'), '');
		assert.equal(lib.cleanPrompt('<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args>opus</command-args>'), '');
		assert.equal(lib.cleanPrompt('<command-name>/code-review</command-name>\n<command-args>high</command-args>'), '/code-review high');
		assert.ok(lib.isJournalCommand('/journal note'));
		assert.ok(!lib.isJournalCommand('/journaling'));
	});

	it('neutralises journal markers quoted in text', () => {
		assert.equal(lib.escapeMarkers('voir <!-- journal:turn -->'), 'voir &lt;!-- journal:turn -->');
	});

	it('demotes assistant headings outside code fences', () => {
		assert.equal(lib.demoteHeadings('## Titre\n```\n# code\n```'), '##### Titre\n```\n# code\n```');
	});
});

describe('redactSecrets', () => {
	it('masks common secrets and key=value pairs', () => {
		const out = lib.redactSecrets('Bearer abcdefghijklmnopqrstuv sk-ant-api03-abcdefghijklmnop password=hunter22 token: "abcd1234" re_1234567890abcdefgh eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJ');
		assert.doesNotMatch(out, /hunter22|abcd1234|abcdefghijklmnopqrstuv|sk-ant|re_1234|eyJhbG/);
		assert.match(out, /password=\[REDACTED\]/);
	});

	it('leaves ordinary text alone and applies extra patterns', () => {
		assert.equal(lib.redactSecrets('le token expire vite'), 'le token expire vite');
		assert.equal(lib.redactSecrets('client 58144883', ['\\b\\d{8}\\b']), 'client [REDACTED]');
		assert.equal(lib.redactSecrets('ok', ['(']), 'ok');
	});
});

describe('markers', () => {
	it('detects a pending reply and paused sessions', () => {
		assert.ok(lib.hasPendingReply(`> a\n\n${lib.TURN_MARKER}`));
		assert.ok(!lib.hasPendingReply(`> a\n\n${lib.TURN_MARKER}\n\n${lib.REPLY_MARKER}`));
		assert.ok(lib.isPaused(`x ${lib.pausedMarker('s1')}`, 's1'));
		assert.equal(lib.findSessionJournal([{ name: 'a.md', content: 'x' }, { name: 'b.md', content: lib.sessionMarker('s1') }], 's1'), 'b.md');
	});

	it('extracts what was appended after the last reply, for backfill to preserve it', () => {
		const content = `> a\n\n${lib.REPLY_MARKER}\n\n### Synthèse · x\nRésumé : fait.\n`;
		assert.equal(lib.trailingExtras(content), '### Synthèse · x\nRésumé : fait.');
		assert.equal(lib.trailingExtras(`> a\n\n${lib.REPLY_MARKER}`), '');
		assert.equal(lib.trailingExtras('no marker here'), '');
	});

	it('drops a trailing open, unanswered turn instead of preserving it as extras (backfill will reconstruct it from the transcript)', () => {
		const broken = `> a\n\n${lib.REPLY_MARKER}\n\n--------------------------------------------\n\n> b\n\n${lib.TURN_MARKER}`;
		assert.equal(lib.trailingExtras(broken), '');
	});

	it('keeps a manual synthesis even when a broken open turn was appended after it', () => {
		const content = `> a\n\n${lib.REPLY_MARKER}\n\n### Synthèse · x\nRésumé : fait.\n\n--------------------------------------------\n\n> broken prompt\n\n${lib.TURN_MARKER}`;
		assert.equal(lib.trailingExtras(content), '### Synthèse · x\nRésumé : fait.');
	});

	it('only separates exchanges, never the first one of a session', () => {
		assert.ok(!lib.needsSeparator('# T\n\n## Session 2026-09-24 · abc (windows)\n'));
		assert.ok(lib.needsSeparator(`> a\n\n${lib.REPLY_MARKER}\n`));
	});

	it('attaches a new session to the header once', () => {
		const h = lib.renderHeader({ title: 'T', sessionId: 'aaaaaaaa-1', date: '2026-09-24', machine: 'windows', labels: L });
		const o = { sessionId: 'bbbbbbbb-2', date: '2026-09-25', machine: 'mac', labels: L };
		const once = lib.attachSessionToHeader(h, o);
		assert.equal(lib.attachSessionToHeader(once, o), once);
		assert.match(once, /<!-- journal:session aaaaaaaa-1 -->\n<!-- journal:session bbbbbbbb-2 -->/);
		assert.match(once, /- Sessions : `aaaaaaaa` 2026-09-24 \(windows\), `bbbbbbbb` 2026-09-25 \(mac\)/);
		assert.match(lib.setPlanLink(once, 'plan-t.md', L), /- Plan : \[plan-t\.md\]\(plan-t\.md\)/);
	});
});

describe('renderQuestions', () => {
	const input = {
		questions: [
			{ question: 'Layout ?', multiSelect: false, options: [{ label: 'Plat' }, { label: 'Dossier' }] },
			{ question: 'Canaux ?', multiSelect: true, options: [{ label: 'Mail' }, { label: 'SMS' }] },
			{ question: 'Nom ?', multiSelect: false, options: [{ label: 'A' }] },
			{ question: 'Oublié ?', options: [{ label: 'X' }] },
		],
	};

	it('renders choices, multi-select, free text, notes and missing answers', () => {
		const out = lib.renderQuestions(input, { answers: { 'Layout ?': 'Plat', 'Canaux ?': 'Mail, SMS', 'Nom ?': 'autre chose\nsur 2 lignes' }, annotations: { 'Layout ?': { notes: 'plus simple' } } }, L);
		assert.match(out, /\*\*Claude demande\*\* — Layout \?\n_Options : Plat · Dossier_\n> \[choix\] Plat\n> \[note\] plus simple/);
		assert.match(out, /> \[choix\] Mail · SMS/);
		assert.match(out, /> \[libre\] autre chose\n> sur 2 lignes/);
		assert.match(out, /Oublié \?\n_Options : X_\n> _\(sans réponse\)_/);
	});

	it('falls back to the tool_result text', () => {
		const out = lib.renderQuestions({ questions: [input.questions[0]] }, 'User has answered your questions: "Layout ?"="Dossier". You can now continue.', L);
		assert.match(out, /> \[choix\] Dossier/);
	});

	it('returns an empty string when nothing is understood', () => {
		assert.equal(lib.renderQuestions({}, {}, L), '');
	});
});

// Minimal transcript builders mirroring the real JSONL shape (one content block per assistant entry).
// Real prompts carry origin.kind === 'human' — tool-result entries never do.
/** @param {string} text */
const user = (text) => ({ type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: [{ type: 'text', text }] } });
/** @param {string} text */
const say = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
/** @param {string} name @param {object} [input] */
const tool = (name, input = {}) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `t-${name}-${Math.random()}`, name, input }] } });
const result = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } };

describe('transcript', () => {
	const entries = [user('premier'), say('ancien'), user('deuxième'), say('Je lis.'), tool('Read'), result, tool('Read'), tool('Bash'), say('Je modifie.'), tool('Edit', { file_path: 'C:\\repo\\app\\a.ts' }), tool('Write', { file_path: 'C:\\Users\\me\\.claude\\plans\\p.md' }), tool('Edit', { file_path: 'C:\\repo\\docs\\journals\\j.md' }), say('Fini.')];

	it('parses JSONL and ignores a half-written last line', () => {
		assert.equal(lib.parseTranscript('{"a":1}\n{"b":\n').length, 1);
	});

	it('isolates the current turn and ignores tool results / interruptions as prompts', () => {
		const turn = lib.currentTurn([...entries, user('[Request interrupted by user for tool use]')]);
		assert.equal(lib.userPromptText(entries[2]), 'deuxième');
		assert.equal(turn[0], entries[3]);
	});

	it('extracts blocks for the three verbosity levels', () => {
		const turn = lib.currentTurn(entries);
		assert.deepEqual(lib.extractAssistantBlocks(turn, 'final'), [{ type: 'text', text: 'Fini.' }]);
		assert.deepEqual(
			lib.extractAssistantBlocks(turn, 'text').map((b) => b.type === 'text' && b.text),
			['Je lis.', 'Je modifie.', 'Fini.'],
		);
		const full = lib.extractAssistantBlocks(turn, 'text+tools');
		assert.deepEqual(full[1], {
			type: 'tools',
			tools: [
				{ name: 'Read', count: 2 },
				{ name: 'Bash', count: 1 },
			],
		});
		assert.equal(lib.renderToolGroup(/** @type {any} */ (full[1]).tools), '_⚙ Read ×2, Bash_');
	});

	it('lists repo files touched by the turn, excluding plans outside the repo and the journals', () => {
		assert.deepEqual(lib.turnTouchedFiles(lib.currentTurn(entries), 'C:\\repo', ['docs/journals']), ['app/a.ts']);
		assert.deepEqual(lib.turnTouchedFiles([tool('Edit', { file_path: '/home/u/repo/src/x.ts' })], '/home/u/repo'), ['src/x.ts']);
	});

	it('only counts entries with origin.kind human as prompts (tool results and notifications are not)', () => {
		const notif = { type: 'user', origin: { kind: 'task-notification' }, message: { content: [{ type: 'text', text: 'ceci ressemble à du texte' }] } };
		const bare = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } };
		assert.equal(lib.userPromptText(notif), '');
		assert.equal(lib.userPromptText(bare), '');
		assert.equal(lib.currentTurn([user('a'), notif, say('x')]).length, 2);
	});

	it('finds the previous turn whether or not the new prompt is already in the transcript', () => {
		assert.equal(lib.previousTurn(entries, 'troisième')[0], entries[3]);
		assert.deepEqual(lib.previousTurn([...entries, user('troisième')], 'troisième')[0], entries[3]);
	});

	it('prefers Stop last_assistant_message when the transcript lags', () => {
		/** @type {lib.AssistantBlock[]} */
		const blocks = [{ type: 'text', text: 'Je lis.' }];
		assert.deepEqual(lib.reconcileLastMessage(blocks, 'Fini.', 'final'), [{ type: 'text', text: 'Fini.' }]);
		assert.equal(lib.reconcileLastMessage(blocks, 'Fini.', 'text').length, 2);
		assert.equal(lib.reconcileLastMessage([{ type: 'text', text: 'Fini.' }], 'Fini.', 'text').length, 1);
	});

	it('renders a reply with files, interruption flag and closing marker', () => {
		const out = lib.renderReply({ time: '14:32', blocks: [{ type: 'text', text: '# Titre\ncorps' }], files: ['app/a.ts'], interrupted: true, labels: L });
		assert.match(out, /^\*\*Claude\*\* · 14:32 · _\(tour interrompu\)_ · _fichiers : app\/a\.ts_\n\n#### Titre\ncorps\n\n<!-- journal:reply -->$/);
		assert.equal(lib.renderReply({ time: '1', blocks: [], files: [], labels: L }), lib.REPLY_MARKER);
	});
});

describe('resolveVerbosity', () => {
	const config = { verbosity: /** @type {const} */ ({ default: 'final', web: 'text+tools' }) };
	it('env override > web default > local default', () => {
		assert.equal(lib.resolveVerbosity(config, { CLAUDE_JOURNAL_VERBOSITY: 'text', CLAUDE_CODE_REMOTE: 'true' }), 'text');
		assert.equal(lib.resolveVerbosity(config, { CLAUDE_CODE_REMOTE: 'true' }), 'text+tools');
		assert.equal(lib.resolveVerbosity(config, { CLAUDE_CODE_ENTRYPOINT: 'claude-vscode' }), 'final');
		assert.equal(lib.resolveVerbosity({ verbosity: 'text' }, {}), 'text');
		assert.equal(lib.resolveVerbosity({}, { CLAUDE_JOURNAL_VERBOSITY: 'nope' }), 'final');
	});
});

describe('commit guard', () => {
	it('detects git commit behind rtk, env vars, -c flags and chains', () => {
		assert.ok(lib.isGitCommit('git add -A && git commit -m "x"'));
		assert.ok(lib.isGitCommit('rtk git commit -m x'));
		assert.ok(lib.isGitCommit('GIT_AUTHOR_NAME=a git -c user.name=b commit -F msg.txt'));
		assert.ok(!lib.isGitCommit('git log --grep commit'));
		assert.ok(!lib.isGitCommit('echo "git commit"x'));
		assert.ok(lib.isAmendNoEdit('git commit --amend --no-edit'));
	});

	it('extracts messages from heredoc, PowerShell here-string, -m and -F', () => {
		assert.equal(lib.extractCommitMessage(`git commit -m "$(cat <<'EOF'\nfeat: x\n\nbody\nEOF\n)"`), 'feat: x\n\nbody');
		assert.equal(lib.extractCommitMessage("git commit -m @'\nfeat: y\n\nbody\n'@"), 'feat: y\n\nbody');
		assert.equal(lib.extractCommitMessage('git commit -m "feat: z" -m "corps \\"quoté\\""'), 'feat: z\n\ncorps "quoté"');
		assert.equal(
			lib.extractCommitMessage('git commit -F .git/MSG', (f) => (f === '.git/MSG' ? 'from file' : null)),
			'from file',
		);
		assert.equal(lib.extractCommitMessage('git commit'), null);
	});

	it('lists what a commit message lacks', () => {
		const o = { journalRel: 'docs/journals/j.md', planRel: 'docs/journals/plan-j.md' };
		assert.deepEqual(lib.checkCommitMessage('feat: x', o), ['Journal: docs/journals/j.md', 'Plan: docs/journals/plan-j.md', 'synthèse']);
		assert.deepEqual(lib.checkCommitMessage('feat: x\n\nRésumé : fait.\n\nJournal: docs/journals/j.md\nPlan: docs/journals/plan-j.md\nCo-Authored-By: C <c@x>', o), []);
		assert.deepEqual(lib.checkCommitMessage('feat: x\n\nJournal: a\nCo-Authored-By: C <c@x>', { journalRel: 'a' }), ['synthèse']);
	});

	it('adds trailers once, before Co-Authored-By, keeping git comments last', () => {
		const t = [
			{ key: 'Journal', value: 'docs/journals/j.md' },
			{ key: 'Plan', value: 'docs/journals/plan-j.md' },
		];
		const msg = 'feat: x\n\nbody\n\nCo-Authored-By: C <c@x>\n';
		const once = lib.addTrailers(msg, t);
		assert.equal(once, 'feat: x\n\nbody\n\nJournal: docs/journals/j.md\nPlan: docs/journals/plan-j.md\nCo-Authored-By: C <c@x>\n');
		assert.equal(lib.addTrailers(once, t), once);
		assert.equal(lib.addTrailers('fix: y\n# Please enter the commit message\n', t.slice(0, 1)), 'fix: y\n\nJournal: docs/journals/j.md\n# Please enter the commit message\n');
		assert.equal(lib.addTrailers('fix: y\r\n', t.slice(0, 1)), 'fix: y\r\n\r\nJournal: docs/journals/j.md\r\n');
	});

	it('renders the change table from git name-status', () => {
		const out = lib.renderChangeTable('A\tnew.ts\nM\tapp.ts\nD\told.ts\nR100\ta.ts\tb.ts\n', L);
		assert.equal(out, '| Fichier | Changement |\n| --- | --- |\n| `new.ts` | nouveau |\n| `app.ts` | modifié |\n| `old.ts` | supprimé |\n| `b.ts` | renommé (← `a.ts`) |');
		assert.equal(lib.renderChangeTable('', L), '');
	});
});

describe('plugin install scope', () => {
	const at = (projectPath) => ({ scope: 'project', projectPath });
	const inst = (...list) => ({ plugins: { 'journal@ai-dev-skills': list } });

	it('says nothing when the install file is unreadable, or the plugin is user-scoped', () => {
		assert.deepEqual(lib.pluginInstallProblems(null, 'C:/www/app', 'win32'), []);
		assert.deepEqual(lib.pluginInstallProblems(inst(at('C:\\www\\app'), { scope: 'user' }), 'C:/www/app', 'win32'), []);
	});

	it('flags a missing install, or one made for another project', () => {
		assert.match(lib.pluginInstallProblems({ plugins: {} }, '/repo', 'linux')[0], /not installed.*--scope user/);
		assert.match(lib.pluginInstallProblems(inst(at('/other')), '/repo', 'linux')[0], /other projects only \(\/other\)/);
	});

	it('flags a project-only install on Windows, whatever the drive-letter case', () => {
		for (const p of ['C:\\www\\app', 'c:\\www\\app', 'c:/www/app/']) assert.match(lib.pluginInstallProblems(inst(at(p)), 'C:/www/app', 'win32')[0], /case-sensitively.*--scope user/);
	});

	it('accepts a project-only install elsewhere, where paths are case-exact', () => {
		assert.deepEqual(lib.pluginInstallProblems(inst(at('/repo/')), '/repo', 'linux'), []);
		assert.equal(lib.pluginInstallProblems(inst(at('/Repo')), '/repo', 'darwin').length, 1);
	});
});
