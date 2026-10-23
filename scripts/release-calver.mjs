#!/usr/bin/env node
// Computes the next npm CalVer release (YYYY.M.DDNN, UTC date) and release notes
// from commits since the last CalVer tag.
//
// npm run release:preview          # print tag + notes; writes nothing
// node scripts/release-calver.mjs --dry-run --notes-file notes.md --tag-file tag.txt
// node scripts/release-calver.mjs --apply --notes-file notes.md
//   # CI: bump package.json + package-lock.json; no CHANGELOG
//
// CI (.github/workflows/publish.yml) plans a release, publishes to npm, tags
// RELEASE_SHA, and opens a GitHub release. main keeps a dev placeholder version.
//
// GITHUB_OUTPUT (when set): has_changes, next_tag, next_version, previous_tag,
// release_date, skip_publish.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** npm CalVer: YYYY.M.DDNN (month without leading zero; patch = day*100 + counter). */
export const CALVER_VERSION_PATTERN = /^\d{4}\.\d{1,2}\.\d+$/;

export const RELEASE_COMMIT_PATTERN =
	/^chore\(release\):\s+(?:CHANGELOG for\s+)?\d{4}\.\d{1,2}\.\d+(?:\s+\(#\d+\))?$/i;

const TYPE_TITLES = new Map([
	['feat', 'Features'],
	['fix', 'Fixes'],
	['perf', 'Performance'],
	['refactor', 'Refactors'],
	['docs', 'Documentation'],
	['build', 'Build'],
	['chore', 'Chores'],
	['test', 'Tests'],
	['ci', 'CI'],
	['revert', 'Reverts'],
	['other', 'Other'],
]);

export function parseArgs(argv) {
	const known = new Set(['--dry-run', '--apply', '--notes-file', '--tag-file', '--version-file']);
	for (const arg of argv) {
		if (arg.startsWith('--') && !known.has(arg)) throw new Error(`unknown argument '${arg}'`);
	}
	const apply = argv.includes('--apply');
	if (apply && argv.includes('--dry-run')) throw new Error('--dry-run and --apply are mutually exclusive');
	return {
		apply,
		notesFile: readArgValue(argv, '--notes-file'),
		tagFile: readArgValue(argv, '--tag-file'),
		versionFile: readArgValue(argv, '--version-file'),
	};
}

function readArgValue(argv, flag) {
	const index = argv.indexOf(flag);
	if (index === -1) return '';
	const value = argv[index + 1];
	if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a file path`);
	return value;
}

export function stripTagPrefix(tag) {
	const trimmed = tag.trim();
	return trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
}

export function parseCalverVersion(version) {
	const normalized = stripTagPrefix(version);
	if (!CALVER_VERSION_PATTERN.test(normalized)) return null;
	const [yearRaw, monthRaw, patchRaw] = normalized.split('.');
	const year = Number(yearRaw);
	const month = Number(monthRaw);
	const patch = Number(patchRaw);
	if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(patch)) return null;
	const day = Math.floor(patch / 100);
	const counter = patch % 100;
	if (day < 1 || day > 31 || counter < 0 || counter > 99) return null;
	return { year, month, day, counter, version: normalized };
}

export function compareCalverVersions(a, b) {
	const aParts = stripTagPrefix(a).split('.').map(Number);
	const bParts = stripTagPrefix(b).split('.').map(Number);
	for (let index = 0; index < 3; index += 1) {
		if (aParts[index] !== bParts[index]) return aParts[index] - bParts[index];
	}
	return 0;
}

export function sortCalverVersions(versions) {
	return versions
		.map((tag) => stripTagPrefix(tag))
		.filter((version) => CALVER_VERSION_PATTERN.test(version))
		.sort(compareCalverVersions);
}

export function utcDateParts(now) {
	return {
		year: now.getUTCFullYear(),
		month: now.getUTCMonth() + 1,
		day: now.getUTCDate(),
	};
}

export function formatCalverVersion(now, counter) {
	const { year, month, day } = utcDateParts(now);
	const patch = day * 100 + counter;
	return `${year}.${month}.${patch}`;
}

export function formatCalverTag(version) {
	return `v${stripTagPrefix(version)}`;
}

/**
 * Next version for `now` (UTC), incrementing the same-day counter from existing tags.
 */
export function getNextVersion(tags, now) {
	const { year, month, day } = utcDateParts(now);
	const counters = tags
		.map((tag) => parseCalverVersion(tag))
		.filter(
			(parsed) =>
				parsed &&
				parsed.year === year &&
				parsed.month === month &&
				parsed.day === day,
		)
		.map((parsed) => parsed.counter);
	const nextCounter = counters.length === 0 ? 0 : Math.max(...counters) + 1;
	if (nextCounter > 99) {
		throw new Error(`same-day release counter exceeded 99 for ${year}-${month}-${day} UTC`);
	}
	return formatCalverVersion(now, nextCounter);
}

/** `raw` is `git log --pretty=format:%H%x09%s` output. */
export function parseCommits(raw) {
	return raw
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [sha, ...subjectParts] = line.split('\t');
			return { sha, shortSha: sha.slice(0, 7), subject: subjectParts.join('\t').trim() };
		})
		.filter((commit) => !RELEASE_COMMIT_PATTERN.test(commit.subject));
}

export function classifyCommit(subject) {
	const match = subject.match(/^([a-z]+)(\([^)]*\))?(!)?:\s+(.+)$/i);
	if (!match) return { typeKey: 'other', breaking: false };
	const rawType = match[1].toLowerCase();
	return { typeKey: TYPE_TITLES.has(rawType) ? rawType : 'other', breaking: Boolean(match[3]) };
}

export function renderGroupedNotes(commits) {
	const groups = new Map();
	for (const commit of commits) {
		const { typeKey, breaking } = classifyCommit(commit.subject);
		if (!groups.has(typeKey)) groups.set(typeKey, []);
		groups.get(typeKey).push(`- ${breaking ? '**Breaking:** ' : ''}${commit.subject} (${commit.shortSha})`);
	}
	const sections = [...TYPE_TITLES.keys()]
		.filter((key) => groups.has(key))
		.map((key) => [`### ${TYPE_TITLES.get(key)}`, ...groups.get(key)].join('\n'));
	return sections.length === 0 ? '- No changes in this release.' : sections.join('\n\n');
}

export function renderReleaseSection(tag, date, body) {
	return `## [${tag}] - ${date}\n\n${body}`;
}

export function githubOutputLine(name, value, delimiter = `EOF_${randomBytes(8).toString('hex')}`) {
	return `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
}

export function resolveLastCalverTagRef(sortedVersions, tagNames) {
	const lastVersion = sortedVersions.at(-1) ?? '';
	if (!lastVersion) return '';
	const withV = `v${lastVersion}`;
	if (tagNames.includes(withV)) return withV;
	if (tagNames.includes(lastVersion)) return lastVersion;
	return withV;
}

/** Most recent `v*` tag at HEAD (CalVer or legacy semver), for commit range only. */
export function resolveCommitRangeTag(lastAnnotatedTag) {
	return lastAnnotatedTag?.trim() ?? '';
}

export function planRelease({ tags, commitLog, now, lastAnnotatedTag = '' }) {
	const tagNames = tags.map((tag) => tag.trim()).filter(Boolean);
	const sorted = sortCalverVersions(tagNames);
	const lastCalverVersion = sorted.at(-1) ?? '';
	const lastCalverTagRef = resolveLastCalverTagRef(sorted, tagNames);
	const rangeTagRef = resolveCommitRangeTag(lastAnnotatedTag);
	const commits = parseCommits(commitLog);
	if (commits.length === 0) {
		return {
			hasChanges: false,
			lastCalverVersion,
			lastCalverTagRef,
			rangeTagRef,
			commits,
		};
	}
	const nextVersion = getNextVersion(tagNames, now);
	const nextTag = formatCalverTag(nextVersion);
	const date = now.toISOString().slice(0, 10);
	const notes = renderGroupedNotes(commits);
	return {
		hasChanges: true,
		lastCalverVersion,
		lastCalverTagRef,
		rangeTagRef,
		nextVersion,
		nextTag,
		date,
		commits,
		notes,
		releaseNotes: renderReleaseSection(nextTag, date, notes),
	};
}

export function bumpPackageFiles(version, rootDir = process.cwd()) {
	const pkgPath = path.join(rootDir, 'package.json');
	const lockPath = path.join(rootDir, 'package-lock.json');
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
	pkg.version = version;
	writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
	const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
	lock.version = version;
	if (lock.packages?.['']) {
		lock.packages[''].version = version;
	}
	writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

function git(args) {
	return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function gitLastAnnotatedTag() {
	try {
		return git(['describe', '--tags', '--abbrev=0', '--match', 'v*']);
	} catch {
		return '';
	}
}

function main() {
	let args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (err) {
		console.error(`release-calver: ${err.message}`);
		process.exit(2);
	}

	const tags = git(['tag', '--list']).split('\n').filter(Boolean);
	const lastAnnotatedTag = gitLastAnnotatedTag();
	const range = lastAnnotatedTag ? `${lastAnnotatedTag}..HEAD` : 'HEAD';
	const commitLog = git(['log', '--pretty=format:%H%x09%s', range]);
	const plan = planRelease({ tags, commitLog, now: new Date(), lastAnnotatedTag });

	const output = (name, value) => {
		if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, githubOutputLine(name, value), 'utf8');
	};

	if (!plan.hasChanges) {
		console.log('No commits since the last CalVer tag. Skipping release.');
		output('has_changes', 'false');
		output('previous_tag', plan.rangeTagRef || 'none');
		output('skip_publish', 'no_commits');
		return;
	}

	if (args.apply) {
		bumpPackageFiles(plan.nextVersion);
	}

	if (args.notesFile) writeFileSync(args.notesFile, `${plan.releaseNotes}\n`, 'utf8');
	if (args.tagFile) writeFileSync(args.tagFile, `${plan.nextTag}\n`, 'utf8');
	if (args.versionFile) writeFileSync(args.versionFile, `${plan.nextVersion}\n`, 'utf8');

	output('has_changes', 'true');
	output('next_tag', plan.nextTag);
	output('next_version', plan.nextVersion);
	output('previous_tag', plan.rangeTagRef || 'none');
	output('release_date', plan.date);
	output('skip_publish', 'false');

	console.log(
		`Next release: ${plan.nextTag} (${plan.nextVersion}, since: ${plan.rangeTagRef || 'none'}, ${plan.commits.length} commits)\n`,
	);
	console.log(plan.releaseNotes);
	const wrote = [
		args.apply && 'package.json + package-lock.json',
		args.notesFile,
		args.tagFile,
		args.versionFile,
	].filter(Boolean);
	console.log(`\n${wrote.length ? `Wrote: ${wrote.join(', ')}` : 'Preview only — no files written.'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
