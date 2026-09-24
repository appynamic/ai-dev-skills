#!/usr/bin/env node
// @ts-check
// Sets up the journal plugin (https://github.com/appynamic/ai-dev-skills) in the current git
// project. Hooks themselves need NO setup — they load automatically once the plugin is enabled
// (hooks/hooks.json, via ${CLAUDE_PLUGIN_ROOT}). This script only touches what a plugin cannot
// wire up by itself:
//   node install.mjs [--dry-run] [--check] [--uninstall] [--hooks-only]
//          [--dir <path>] [--verbosity <final|text|text+tools>] [--verbosity-web <…>]
// Idempotent and reversible: every file written is delimited by markers, or is a config file
// merged non-destructively, so --uninstall removes exactly what install added — and never
// touches the journals themselves.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, '..');
const TEMPLATES = path.join(SKILL_DIR, 'templates');
const GIT_HOOK_SCRIPT_REL = '.claude/journal-git-hook.mjs';
const GITHOOK_LINE = `node "$(git rev-parse --show-toplevel)/${GIT_HOOK_SCRIPT_REL}" "$@" # journal-skill`;
const PREPARE_CMD = 'git config core.hooksPath .githooks';
const BLOCK_START = '# journal-skill:start';
const BLOCK_END = '# journal-skill:end';
const MD_START = '<!-- journal:start -->';
const MD_END = '<!-- journal:end -->';

/** @typedef {{ dryRun?: boolean, quiet?: boolean }} Opts */

/** @param {string} root @param {string[]} args */
function git(root, args) {
	return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** @param {string} root @param {string[]} args */
function tryGit(root, args) {
	try {
		return git(root, args);
	} catch {
		return null;
	}
}

/** @param {string} file */
function read(file) {
	try {
		return fs.readFileSync(file, 'utf8');
	} catch {
		return null;
	}
}

/** Keeps the file's existing line endings (e.g. a CRLF package.json on Windows). @param {string} file @param {string} content @param {string | null} previous */
function writeKeepingEol(file, content, previous) {
	const lf = content.replace(/\r\n/g, '\n');
	const out = previous?.includes('\r\n') ? lf.replace(/\n/g, '\r\n') : lf;
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, out, 'utf8');
}

/** @param {string} root */
function projectConfigPath(root) {
	return path.join(root, '.claude', 'journal.config.json');
}

/** @param {string} root */
function loadConfig(root) {
	try {
		return JSON.parse(read(projectConfigPath(root)) ?? '{}');
	} catch {
		return {};
	}
}

/**
 * @param {string} text @param {string} start @param {string} end @param {string | null} block null removes it
 */
function upsertBlock(text, start, end, block) {
	const re = new RegExp(`\\n*${escapeRe(start)}[\\s\\S]*?${escapeRe(end)}\\n?`);
	const stripped = text.replace(re, '\n').replace(/\n{3,}$/, '\n\n');
	if (block === null) return stripped.replace(/\n+$/, '\n');
	const base = stripped.replace(/\n+$/, '');
	return `${base}${base ? '\n\n' : ''}${start}\n${block.replace(/\n+$/, '')}\n${end}\n`;
}

/** @param {string} s */
function escapeRe(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {Opts} opts @param {string} msg */
function log(opts, msg) {
	if (!opts.quiet) process.stdout.write(`${msg}\n`);
}

/**
 * @param {string} file @param {string} next @param {Opts} opts @param {string} label
 * @returns {boolean} changed
 */
function apply(file, next, opts, label) {
	const prev = read(file);
	// On uninstall, a file left empty was created by install: remove it rather than leave a blank file.
	if (/** @type {any} */ (opts).uninstall && prev !== null && !next.trim()) {
		log(opts, `  - ${label}${opts.dryRun ? ' (dry-run)' : ''}`);
		if (!opts.dryRun) fs.rmSync(file);
		return true;
	}
	if ((prev ?? '').replace(/\r\n/g, '\n') === next.replace(/\r\n/g, '\n')) {
		log(opts, `  = ${label}`);
		return false;
	}
	log(opts, `  ${prev === null ? '+' : '~'} ${label}${opts.dryRun ? ' (dry-run)' : ''}`);
	if (!opts.dryRun) writeKeepingEol(file, next, prev);
	return true;
}

// ─── git hook ─────────────────────────────────────────────────────────────────

/**
 * Where the one-line hook invocation must live without disabling hooks the repo already has:
 * an existing core.hooksPath (husky…) wins; active hooks in .git/hooks keep .git/hooks;
 * otherwise a versioned .githooks/ is created and wired with core.hooksPath.
 * @param {string} root
 */
function resolveHookDir(root) {
	const hooksPath = tryGit(root, ['config', '--get', 'core.hooksPath']);
	if (hooksPath) {
		const abs = path.resolve(root, hooksPath);
		// husky v9 points core.hooksPath at .husky/_ (generated); user hooks live one level up.
		const dir = path.basename(abs) === '_' && fs.existsSync(path.join(path.dirname(abs), '_')) ? path.dirname(abs) : abs;
		return { dir, setHooksPath: false };
	}
	const gitDir = tryGit(root, ['rev-parse', '--git-dir']);
	const legacy = gitDir ? path.resolve(root, gitDir, 'hooks') : null;
	const active = legacy && fs.existsSync(legacy) ? fs.readdirSync(legacy).filter((f) => !f.endsWith('.sample')) : [];
	if (legacy && active.length) return { dir: legacy, setHooksPath: false };
	return { dir: path.join(root, '.githooks'), setHooksPath: true };
}

/**
 * Writes the self-contained trailer logic at `.claude/journal-git-hook.mjs` (committed with the
 * project — a git hook must work on any machine, whether or not the plugin is installed there),
 * then wires a one-line invocation into whatever hook location `resolveHookDir` picked. Also
 * called by the SessionStart hook (`{ quiet: true }`): on Claude Code web the clone never ran
 * a package manager's install step.
 * @param {string} root @param {Opts & { uninstall?: boolean }} [opts]
 */
export function installGitHook(root, opts = {}) {
	if (!tryGit(root, ['rev-parse', '--git-dir'])) return;
	const scriptFile = path.join(root, GIT_HOOK_SCRIPT_REL);
	if (opts.uninstall) {
		if (read(scriptFile) !== null) {
			log(opts, `  - ${GIT_HOOK_SCRIPT_REL}${opts.dryRun ? ' (dry-run)' : ''}`);
			if (!opts.dryRun) fs.rmSync(scriptFile);
		}
	} else {
		apply(scriptFile, read(path.join(TEMPLATES, 'journal-git-hook.mjs')) ?? '', opts, GIT_HOOK_SCRIPT_REL);
	}

	const { dir, setHooksPath } = resolveHookDir(root);
	const file = path.join(dir, 'prepare-commit-msg');
	const label = path.relative(root, file).split(path.sep).join('/') || file;
	const prev = read(file);
	// A marked block (like .gitattributes/.gitignore/CLAUDE.md below), not a single suffixed line:
	// our comment lines need removing on uninstall too, and an existing hook (husky…) may have its
	// own unrelated comments that must NOT be mistaken for ours.
	const block = read(path.join(TEMPLATES, 'prepare-commit-msg')) ?? GITHOOK_LINE;
	const base = prev !== null ? prev.replace(/\r\n/g, '\n') : '';
	const shebangMatch = base.match(/^#!.*\n?/);
	const shebang = shebangMatch ? shebangMatch[0] : '#!/bin/sh\n';
	const rest = shebangMatch ? base.slice(shebangMatch[0].length) : base;
	const nextRest = upsertBlock(rest, BLOCK_START, BLOCK_END, opts.uninstall ? null : block);
	if (opts.uninstall && !nextRest.trim()) {
		if (prev === null) return;
		log(opts, `  - ${label}${opts.dryRun ? ' (dry-run)' : ''}`);
		if (!opts.dryRun) {
			fs.rmSync(file);
			// .githooks is the dir install creates; any other hooksPath (husky…) belongs to the repo.
			const ours = path.resolve(root, '.githooks');
			if (path.resolve(dir) === ours && fs.existsSync(ours) && !fs.readdirSync(ours).length) fs.rmdirSync(ours);
			if (tryGit(root, ['config', '--get', 'core.hooksPath']) === '.githooks' && !fs.existsSync(ours)) {
				tryGit(root, ['config', '--unset', 'core.hooksPath']);
				log(opts, '  - git config core.hooksPath');
			}
		}
		void setHooksPath;
		return;
	}
	const next = shebang + nextRest;
	const changed = apply(file, next, { ...opts, quiet: opts.quiet }, label);
	if (opts.dryRun || opts.uninstall) return;
	// Force LF: a CRLF shebang (`/bin/sh^M`) breaks the hook on macOS/Linux.
	if (changed) fs.writeFileSync(file, next.replace(/\r\n/g, '\n'), 'utf8');
	try {
		fs.chmodSync(file, 0o755);
	} catch {
		// chmod is a no-op on Windows filesystems
	}
	if (setHooksPath && tryGit(root, ['config', '--get', 'core.hooksPath']) !== '.githooks') {
		tryGit(root, ['config', 'core.hooksPath', '.githooks']);
		log(opts, '  ~ git config core.hooksPath .githooks');
	}
	// Windows has core.filemode=false: the executable bit only reaches the Mac through the index,
	// so the hook is staged with +x — otherwise git on macOS silently ignores it (mode 100644).
	if (!label.startsWith('.git/') && !path.isAbsolute(label)) {
		const tracked = tryGit(root, ['ls-files', '--error-unmatch', label]) !== null;
		if (tracked) tryGit(root, ['update-index', '--chmod=+x', label]);
		else if (!opts.quiet) {
			tryGit(root, ['add', '--chmod=+x', '--', label]);
			log(opts, `  ~ git add --chmod=+x ${label}`);
		}
	}
}

// ─── text files ───────────────────────────────────────────────────────────────

/** @param {string} root @param {string} dirRel @param {Opts & { uninstall?: boolean }} opts */
function installGitattributes(root, dirRel, opts) {
	const file = path.join(root, '.gitattributes');
	const prev = read(file) ?? '';
	const block = ['.githooks/* text eol=lf', `${GIT_HOOK_SCRIPT_REL} text eol=lf`, '.claude/journal.config.json text eol=lf', `${dirRel}/*.md text eol=lf`].join('\n');
	const next = upsertBlock(prev.replace(/\r\n/g, '\n'), BLOCK_START, BLOCK_END, opts.uninstall ? null : block);
	if (opts.uninstall && !next.trim() && read(file) !== null) {
		log(opts, `  - .gitattributes${opts.dryRun ? ' (dry-run)' : ''}`);
		if (!opts.dryRun) fs.rmSync(file);
		return;
	}
	apply(file, next, opts, '.gitattributes');
}

/** @param {string} root @param {Opts & { uninstall?: boolean }} opts */
function installGitignore(root, opts) {
	const file = path.join(root, '.gitignore');
	const prev = (read(file) ?? '').replace(/\r\n/g, '\n');
	// settings.local.json holds machine-specific permissions and absolute paths: a `git add .claude`
	// must not sweep it in next to journal.config.json (which IS meant to be shared/committed).
	const outside = upsertBlock(prev, BLOCK_START, BLOCK_END, null);
	const wanted = ['.claude/settings.local.json', '.claude/journal-errors.log'].filter((l) => !outside.split('\n').some((x) => x.trim() === l));
	const next = upsertBlock(prev, BLOCK_START, BLOCK_END, opts.uninstall || !wanted.length ? null : wanted.join('\n'));
	if (!opts.uninstall && !wanted.length && !prev.includes(BLOCK_START)) return log(opts, '  = .gitignore');
	apply(file, next, opts, '.gitignore');
}

/** @param {string} root @param {boolean} usesGithooksDir @param {Opts & { uninstall?: boolean }} opts */
function installPackageJson(root, usesGithooksDir, opts) {
	const file = path.join(root, 'package.json');
	const prev = read(file);
	if (prev === null) return;
	const pkg = JSON.parse(prev);
	const indent = prev.match(/^\{\r?\n([ \t]+)/)?.[1] ?? '\t';
	const current = pkg.scripts?.prepare ?? '';
	let prepare = current
		.split(/\s*&&\s*/)
		.filter((/** @type {string} */ s) => s && s !== PREPARE_CMD)
		.join(' && ');
	// Only needed when we own .githooks/: core.hooksPath is local git config, lost on every fresh
	// clone. When an existing hooksPath (husky…) is reused instead, that tool already re-sets it.
	if (!opts.uninstall && usesGithooksDir) prepare = prepare ? `${prepare} && ${PREPARE_CMD}` : PREPARE_CMD;
	if (prepare === current) return log(opts, '  = package.json (prepare)');
	pkg.scripts ??= {};
	if (prepare) pkg.scripts.prepare = prepare;
	else delete pkg.scripts.prepare;
	apply(file, `${JSON.stringify(pkg, null, indent)}\n`, opts, 'package.json (prepare)');
}

/** @param {string} root @param {string} dirRel @param {Opts & { uninstall?: boolean }} opts */
function installClaudeMd(root, dirRel, opts) {
	const file = path.join(root, 'CLAUDE.md');
	const prev = read(file);
	if (prev === null && opts.uninstall) return;
	const section = (read(path.join(TEMPLATES, 'claude-md-section.md')) ?? '').replaceAll('{{dir}}', dirRel).replace(/\r\n/g, '\n');
	const next = upsertBlock((prev ?? '').replace(/\r\n/g, '\n'), MD_START, MD_END, opts.uninstall ? null : section);
	apply(file, next, opts, 'CLAUDE.md (section Journal)');
}

/** @param {string} root @param {string} dirRel @param {Opts & { uninstall?: boolean }} opts */
function installJournalsReadme(root, dirRel, opts) {
	if (opts.uninstall) return;
	const file = path.join(root, dirRel, 'README.md');
	if (read(file) !== null) return log(opts, `  = ${dirRel}/README.md`);
	apply(file, (read(path.join(TEMPLATES, 'journals-README.md')) ?? '').replaceAll('{{dir}}', dirRel), opts, `${dirRel}/README.md`);
}

/** Project-level overrides — shared/committed, unlike settings.local.json. @param {string} root @param {Opts & { uninstall?: boolean, dir?: string, verbosity?: string, verbosityWeb?: string }} opts */
function installConfig(root, opts) {
	const file = projectConfigPath(root);
	if (opts.uninstall) {
		if (read(file) !== null) {
			log(opts, `  - .claude/journal.config.json${opts.dryRun ? ' (dry-run)' : ''}`);
			if (!opts.dryRun) fs.rmSync(file);
		}
		return;
	}
	if (!opts.dir && !opts.verbosity && !opts.verbosityWeb) return;
	const cfg = loadConfig(root);
	if (opts.dir) cfg.dir = opts.dir;
	if (opts.verbosity || opts.verbosityWeb) cfg.verbosity = { ...(typeof cfg.verbosity === 'object' ? cfg.verbosity : {}), ...(opts.verbosity ? { default: opts.verbosity } : {}), ...(opts.verbosityWeb ? { web: opts.verbosityWeb } : {}) };
	apply(file, `${JSON.stringify(cfg, null, '\t')}\n`, opts, '.claude/journal.config.json');
}

// ─── check ────────────────────────────────────────────────────────────────────

/** @param {string} root @param {string} dirRel */
function check(root, dirRel) {
	const problems = [];
	const paths = [GIT_HOOK_SCRIPT_REL, '.claude/journal.config.json', '.githooks/prepare-commit-msg', `${dirRel}/README.md`, `${dirRel}/2000-01-01--001-probe.md`, `${dirRel}/plan-probe.md`];
	for (const p of paths) {
		const hit = tryGit(root, ['check-ignore', '--no-index', '-v', p]);
		if (hit) problems.push(`git-ignored: ${p}  ←  ${hit}`);
	}
	if (!read(path.join(root, GIT_HOOK_SCRIPT_REL))) problems.push(`${GIT_HOOK_SCRIPT_REL} missing`);
	const { dir } = resolveHookDir(root);
	const hook = read(path.join(dir, 'prepare-commit-msg'));
	if (!hook?.includes('# journal-skill')) problems.push(`git hook prepare-commit-msg missing (${path.relative(root, dir) || dir})`);
	else if (hook.includes('\r\n')) problems.push('git hook has CRLF line endings (breaks on Mac/Linux)');
	const local = tryGit(root, ['check-ignore', '-q', '--no-index', '.claude/settings.local.json']);
	if (local === null && fs.existsSync(path.join(root, '.claude', 'settings.local.json'))) problems.push('.claude/settings.local.json is not git-ignored (risk of committing it)');
	return problems;
}

// ─── main ─────────────────────────────────────────────────────────────────────

/** @param {string[]} argv */
function parseArgs(argv) {
	/** @param {string} f */
	const val = (f) => {
		const i = argv.indexOf(f);
		return i === -1 ? undefined : argv[i + 1];
	};
	const levels = ['final', 'text', 'text+tools'];
	const verbosity = val('--verbosity');
	const verbosityWeb = val('--verbosity-web');
	for (const v of [verbosity, verbosityWeb]) if (v && !levels.includes(v)) throw new Error(`invalid verbosity: ${v} (${levels.join(' | ')})`);
	return { dryRun: argv.includes('--dry-run'), check: argv.includes('--check'), uninstall: argv.includes('--uninstall'), hooksOnly: argv.includes('--hooks-only'), quiet: argv.includes('--quiet'), dir: val('--dir'), verbosity, verbosityWeb };
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const root = tryGit(process.cwd(), ['rev-parse', '--show-toplevel']) ?? process.cwd();
	if (opts.hooksOnly) return installGitHook(root, { quiet: true });
	const dirRel = String(opts.dir ?? loadConfig(root).dir ?? 'docs/journals').replace(/\\/g, '/').replace(/\/$/, '');
	if (opts.check) {
		const problems = check(root, dirRel);
		if (problems.length) {
			process.stdout.write(`✗ ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
			process.exitCode = 1;
		} else process.stdout.write('✓ journal set up, nothing git-ignored\n');
		return;
	}
	log(opts, `${opts.uninstall ? 'Removing' : 'Setting up'} the journal plugin in ${root}${opts.dryRun ? ' (dry-run)' : ''}`);
	// Resolved BEFORE installGitHook, which — if it creates .githooks — sets core.hooksPath as a
	// side effect; resolving again afterwards would then always see an existing hooksPath.
	// `usesGithooksDir` (not resolveHookDir's own `setHooksPath`, which only means "wasn't set
	// yet this run") is what installPackageJson needs: is OUR .githooks what governs this repo,
	// whether just created now or already set by a previous run.
	const usesGithooksDir = path.resolve(resolveHookDir(root).dir) === path.resolve(root, '.githooks');
	installConfig(root, opts);
	installGitHook(root, opts);
	installGitattributes(root, dirRel, opts);
	installGitignore(root, opts);
	installPackageJson(root, usesGithooksDir, opts);
	installClaudeMd(root, dirRel, opts);
	installJournalsReadme(root, dirRel, opts);
	if (!opts.uninstall && !opts.dryRun) log(opts, '\nVerify the plugin is enabled with `/plugin`, then `install.mjs --check`.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (err) {
		process.stderr.write(`install: ${err instanceof Error ? err.message : String(err)}\n`);
		process.exitCode = 1;
	}
}
