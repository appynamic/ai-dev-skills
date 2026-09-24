#!/usr/bin/env node
// Written into the consuming project by the journal Claude Code plugin
// (https://github.com/appynamic/ai-dev-skills) via `/journal init`, at `.claude/journal-git-hook.mjs`.
//
// Adds `Journal:` / `Plan:` trailers to a commit message when a journal file is staged. Committed
// with the project on purpose: a git hook must keep working on any machine, whether or not the
// plugin itself is installed there (GitHub Desktop, a teammate without the plugin, CI…).
//
// Safe to regenerate any time with `/journal init` (e.g. after changing `dir` in
// `.claude/journal.config.json`); removed by `/journal init --uninstall`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const JOURNAL_RE = /^(\d{4}-\d{2}-\d{2})--(\d{3})-(.+)\.md$/;
const TRAILER_RE = /^[A-Za-z][\w-]*: \S/;

/** @param {string} slug */
function planFileName(slug) {
	return `plan-${slug}.md`;
}

/**
 * Idempotent: a trailer already present (same key and value) is not added twice. New trailers go
 * at the top of the existing trailer block so `Co-Authored-By` stays last; git comment lines stay at the end.
 * @param {string} msg @param {{ key: string, value: string }[]} trailers
 */
function addTrailers(msg, trailers) {
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

function main() {
	const [msgFile, source] = process.argv.slice(2);
	// A merge or squash message is written by git itself; trailers there would be misleading.
	if (!msgFile || source === 'merge' || source === 'squash') return;
	const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
	let dir = 'docs/journals';
	try {
		dir = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'journal.config.json'), 'utf8')).dir ?? dir;
	} catch {
		// default dir
	}
	dir = dir.replace(/\\/g, '/').replace(/\/$/, '');
	const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { cwd: root, encoding: 'utf8' })
		.split(/\r?\n/)
		.filter((f) => f.startsWith(`${dir}/`) && !f.slice(dir.length + 1).includes('/'));
	const journals = staged.filter((f) => JOURNAL_RE.test(path.posix.basename(f)));
	const plans = new Set(staged.filter((f) => /^plan-.+\.md$/.test(path.posix.basename(f))));
	for (const j of journals) {
		const m = path.posix.basename(j).match(JOURNAL_RE);
		if (m && fs.existsSync(path.join(root, dir, planFileName(m[3])))) plans.add(`${dir}/${planFileName(m[3])}`);
	}
	if (!journals.length && !plans.size) return;
	const msg = fs.readFileSync(msgFile, 'utf8');
	const next = addTrailers(msg, [...journals.map((value) => ({ key: 'Journal', value })), ...[...plans].map((value) => ({ key: 'Plan', value }))]);
	if (next !== msg) fs.writeFileSync(msgFile, next, 'utf8');
}

try {
	main();
} catch (err) {
	// Never block a commit because of the journal.
	process.stderr.write(`journal prepare-commit-msg: ${err instanceof Error ? err.message : String(err)}\n`);
}
