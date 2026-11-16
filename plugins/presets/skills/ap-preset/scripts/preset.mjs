#!/usr/bin/env node
// @ts-check
// Applies rule presets (https://github.com/appynamic/ai-dev-skills) to the current git project:
//   node preset.mjs list
//   node preset.mjs status
//   node preset.mjs apply <name>... [--dry-run]
//   node preset.mjs remove <name>... [--dry-run]
// A preset is a folder in ../presets/<name>/:
//   rules.md     rules, one `<!-- rule:<id> -->` section each, written into the project's CLAUDE.md
//                between `<!-- preset:<name>:start -->` / `<!-- preset:<name>:end -->`
//   preset.json  { description, covered: { <id>: "<regex>" }, settings: { … } }
//                `covered`: a rule whose theme is already written by hand elsewhere in CLAUDE.md
//                is left out of the block rather than said twice.
//                `settings`: merged into .claude/settings.json, only where the project has no value.
// Idempotent; `remove` deletes the block and the settings values still equal to the preset's.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRESETS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'presets');

/** @typedef {{ name: string, description: string, covered: Record<string, RegExp>, settings: Record<string, any>, rules: string }} Preset */

/** @param {string} file */
function read(file) {
	try {
		return fs.readFileSync(file, 'utf8');
	} catch {
		return null;
	}
}

/** @returns {string[]} */
export function listPresets(dir = PRESETS_DIR) {
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'preset.json')))
		.map((e) => e.name)
		.sort();
}

/** @param {string} name @returns {Preset} */
export function loadPreset(name, dir = PRESETS_DIR) {
	if (!/^[\w-]+$/.test(name) || !listPresets(dir).includes(name)) throw new Error(`unknown preset: ${name} (${listPresets(dir).join(' | ')})`);
	const meta = JSON.parse(read(path.join(dir, name, 'preset.json')) ?? '{}');
	const covered = Object.fromEntries(Object.entries(meta.covered ?? {}).map(([id, re]) => [id, new RegExp(String(re), 'i')]));
	return { name, description: meta.description ?? '', covered, settings: meta.settings ?? {}, rules: (read(path.join(dir, name, 'rules.md')) ?? '').replace(/\r\n/g, '\n') };
}

// ─── CLAUDE.md blocks ─────────────────────────────────────────────────────────

/** @param {string} name */
export const markers = (name) => ({ start: `<!-- preset:${name}:start -->`, end: `<!-- preset:${name}:end -->` });

/** @param {string} s */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** @param {string} name */
const blockRe = (name) => {
	const { start, end } = markers(name);
	return new RegExp(`${escapeRe(start)}\\n[\\s\\S]*?${escapeRe(end)}\\n?`);
};

/** Every managed block removed: `<!-- preset:*:… -->` and the journal's. @param {string} text */
function withoutManagedBlocks(text) {
	return text.replace(/<!-- (preset:[\w-]+|journal):start -->[\s\S]*?<!-- \1:end -->\n?/g, '');
}

/**
 * The block for `preset`, leaving out each rule whose theme `memory` already covers outside managed blocks.
 * @param {Preset} preset @param {string} memory
 * @returns {{ block: string | null, kept: string[], skipped: string[] }} block null = nothing left to add
 */
export function buildBlock(preset, memory) {
	const own = withoutManagedBlocks(memory.replace(/\r\n/g, '\n'));
	const [header, ...parts] = preset.rules.split(/^<!-- rule:([\w-]+) -->\n/m);
	/** @type {string[]} */ const kept = [];
	/** @type {string[]} */ const skipped = [];
	let body = '';
	for (let i = 0; i < parts.length; i += 2) {
		if (preset.covered[parts[i]]?.test(own)) skipped.push(parts[i]);
		else {
			kept.push(parts[i]);
			body += parts[i + 1];
		}
	}
	if (!parts.length) return { block: header.trim() ? `${header.replace(/\n+$/, '')}\n` : null, kept, skipped };
	return { block: kept.length ? `${header.replace(/\n+$/, '')}\n\n${body.replace(/\n+$/, '')}\n` : null, kept, skipped };
}

/**
 * Replaces the preset's block where it already is (so presets keep their order), appends it otherwise;
 * `block` null removes it.
 * @param {string} text @param {string} name @param {string | null} block
 */
export function setBlock(text, name, block) {
	const { start, end } = markers(name);
	const src = text.replace(/\r\n/g, '\n');
	const wrapped = block === null ? '' : `${start}\n${block.replace(/\n+$/, '')}\n${end}\n`;
	if (blockRe(name).test(src)) {
		const out = src.replace(blockRe(name), () => wrapped);
		return block === null ? `${out.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')}\n`.replace(/^\n$/, '') : out;
	}
	if (block === null) return src;
	const base = src.replace(/\n+$/, '');
	return `${base}${base ? '\n\n' : ''}${wrapped}`;
}

/** Presets with a block in `text`. @param {string} text */
export function appliedPresets(text) {
	return [...text.matchAll(/<!-- preset:([\w-]+):start -->/g)].map((m) => m[1]);
}

// ─── settings.json ────────────────────────────────────────────────────────────

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `src` merged into `dst` only where `dst` has no value: objects recurse, arrays get the missing items.
 * Returns a new object.
 * @param {Record<string, any>} dst @param {Record<string, any>} src
 */
export function mergeMissing(dst, src) {
	const out = { ...dst };
	for (const [k, v] of Object.entries(src)) {
		if (isObj(v)) out[k] = mergeMissing(isObj(out[k]) ? out[k] : {}, v);
		else if (Array.isArray(v)) out[k] = Array.isArray(out[k]) ? [...out[k], ...v.filter((x) => !out[k].some((/** @type {any} */ y) => JSON.stringify(y) === JSON.stringify(x)))] : out[k] === undefined ? [...v] : out[k];
		else if (out[k] === undefined) out[k] = v;
	}
	return out;
}

/**
 * Undoes `mergeMissing`: drops the values still equal to `src`'s and objects left empty. Returns a new object.
 * @param {Record<string, any>} dst @param {Record<string, any>} src
 */
export function removeSame(dst, src) {
	const out = { ...dst };
	for (const [k, v] of Object.entries(src)) {
		if (!(k in out)) continue;
		if (isObj(v) && isObj(out[k])) {
			const sub = removeSame(out[k], v);
			if (Object.keys(sub).length) out[k] = sub;
			else delete out[k];
		} else if (Array.isArray(v) && Array.isArray(out[k])) {
			const rest = out[k].filter((/** @type {any} */ y) => !v.some((x) => JSON.stringify(x) === JSON.stringify(y)));
			if (rest.length) out[k] = rest;
			else delete out[k];
		} else if (JSON.stringify(out[k]) === JSON.stringify(v)) delete out[k];
	}
	return out;
}

// ─── main ─────────────────────────────────────────────────────────────────────

/** @param {string} file @param {string} next @param {boolean} dryRun @param {string} label */
function write(file, next, dryRun, label) {
	const prev = read(file);
	if ((prev ?? '').replace(/\r\n/g, '\n') === next) return void process.stdout.write(`  = ${label}\n`);
	if (prev !== null && !next.trim()) {
		process.stdout.write(`  - ${label}${dryRun ? ' (dry-run)' : ''}\n`);
		if (!dryRun) fs.rmSync(file);
		return;
	}
	process.stdout.write(`  ${prev === null ? '+' : '~'} ${label}${dryRun ? ' (dry-run)' : ''}\n`);
	if (dryRun) return;
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, prev?.includes('\r\n') ? next.replace(/\n/g, '\r\n') : next);
}

/** @param {string} root @param {Preset} preset @param {boolean} remove @param {boolean} dryRun */
function applySettings(root, preset, remove, dryRun) {
	if (!Object.keys(preset.settings).length) return;
	const file = path.join(root, '.claude', 'settings.json');
	const prev = read(file);
	if (prev === null && remove) return;
	let settings;
	try {
		settings = JSON.parse(prev ?? '{}');
	} catch {
		return void process.stdout.write('  ⚠ .claude/settings.json is not valid JSON: left as is\n');
	}
	const next = remove ? removeSame(settings, preset.settings) : mergeMissing(settings, preset.settings);
	const indent = prev?.match(/^\{\r?\n([ \t]+)/)?.[1] ?? '\t';
	if (prev !== null && JSON.stringify(next) === JSON.stringify(settings)) return void process.stdout.write(`  = .claude/settings.json (${preset.name})\n`);
	write(file, Object.keys(next).length ? `${JSON.stringify(next, null, indent)}\n` : '', dryRun, `.claude/settings.json (${preset.name})`);
}

function main() {
	const [cmd = 'list', ...rest] = process.argv.slice(2);
	const dryRun = rest.includes('--dry-run');
	const names = rest.filter((a) => !a.startsWith('--'));
	const root = (() => {
		try {
			return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		} catch {
			return process.cwd();
		}
	})();
	const claudeMd = path.join(root, 'CLAUDE.md');
	if (cmd === 'list') {
		for (const n of listPresets()) process.stdout.write(`${n.padEnd(12)} ${loadPreset(n).description}\n`);
		return;
	}
	if (cmd === 'status') {
		const text = (read(claudeMd) ?? '').replace(/\r\n/g, '\n');
		const applied = appliedPresets(text);
		if (!applied.length) return void process.stdout.write('no preset applied\n');
		for (const n of applied) {
			if (!listPresets().includes(n)) {
				process.stdout.write(`${n}: unknown preset (block left by hand or removed from the plugin)\n`);
				continue;
			}
			const { block } = buildBlock(loadPreset(n), text);
			process.stdout.write(`${n}: ${setBlock(text, n, block) === text ? 'up to date' : 'outdated — run `apply ' + n + '`'}\n`);
		}
		return;
	}
	if (cmd !== 'apply' && cmd !== 'remove') throw new Error(`unknown command: ${cmd} (list | status | apply <name>… | remove <name>…)`);
	if (!names.length) throw new Error(`${cmd}: preset name required (${listPresets().join(' | ')})`);
	const remove = cmd === 'remove';
	process.stdout.write(`${remove ? 'Removing' : 'Applying'} ${names.join(', ')} in ${root}${dryRun ? ' (dry-run)' : ''}\n`);
	let text = (read(claudeMd) ?? '').replace(/\r\n/g, '\n');
	for (const name of names) {
		const preset = loadPreset(name);
		if (remove) text = setBlock(text, name, null);
		else {
			const { block, skipped } = buildBlock(preset, text);
			if (skipped.length) process.stdout.write(`  · ${name}: already written by hand in CLAUDE.md, left out: ${skipped.join(', ')}\n`);
			text = setBlock(text, name, block);
		}
		applySettings(root, preset, remove, dryRun);
	}
	if (read(claudeMd) !== null || text.trim()) write(claudeMd, text, dryRun, 'CLAUDE.md');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (err) {
		process.stderr.write(`preset: ${err instanceof Error ? err.message : String(err)}\n`);
		process.exitCode = 1;
	}
}
