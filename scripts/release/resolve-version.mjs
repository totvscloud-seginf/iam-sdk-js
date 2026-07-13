#!/usr/bin/env node
/* global console, process */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const workspace = requiredArg("--workspace");
const tagPrefix = requiredArg("--tag-prefix");
const branch = requiredArg("--branch");
const packageJson = JSON.parse(readFileSync(`${workspace}/package.json`, "utf8"));

const rootRelevantFiles = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
]);

const rootRelevantDirectories = [
  ".github/workflows/",
  "scripts/release/",
];

const stableTags = listTags(`${tagPrefix}@[0-9]*`)
  .filter((tag) => isStablePackageTag(tagPrefix, tag))
  .sort(comparePackageTagsDesc);
const lastStableTag = stableTags[0] ?? "";
const currentVersion = lastStableTag
  ? parseVersion(lastStableTag.slice(tagPrefix.length + 1))
  : parseVersion(packageJson.version);

const relevantCommits = listCommits(lastStableTag)
  .map((commit) => ({ ...commit, files: listChangedFiles(commit.hash) }))
  .filter((commit) => commit.files.some(isRelevantFile));

const bump = resolveBump(relevantCommits);

if (!bump) {
  emit({
    publish: "false",
    reason: "No relevant Conventional Commit release changes found.",
  });
  process.exit(0);
}

const baseVersion = bumpVersion(currentVersion, bump);
const nextVersion =
  branch === "development"
    ? `${formatVersion(baseVersion)}-dev.${nextDevNumber(baseVersion)}`
    : formatVersion(baseVersion);
const tag = `${tagPrefix}@${nextVersion}`;

if (tagExists(tag)) {
  throw new Error(`Resolved tag already exists: ${tag}`);
}

emit({
  publish: "true",
  package_name: packageJson.name,
  version: nextVersion,
  tag,
  npm_tag: branch === "development" ? "dev" : "latest",
  bump,
  last_stable_tag: lastStableTag,
  commit_count: String(relevantCommits.length),
});

function requiredArg(name) {
  const value = args.get(name);
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function emit(outputs) {
  for (const [key, value] of Object.entries(outputs)) {
    console.log(`${key}=${value}`);
  }
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function listTags(pattern) {
  const output = git(["tag", "--list", pattern]);
  return output ? output.split("\n") : [];
}

function tagExists(tag) {
  try {
    git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

function isStablePackageTag(prefix, tag) {
  return new RegExp(`^${escapeRegExp(prefix)}@\\d+\\.\\d+\\.\\d+$`).test(tag);
}

function comparePackageTagsDesc(left, right) {
  const leftVersion = parseVersion(left.slice(tagPrefix.length + 1));
  const rightVersion = parseVersion(right.slice(tagPrefix.length + 1));
  return compareVersions(rightVersion, leftVersion);
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Unsupported SemVer version: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

function listCommits(fromTag) {
  const range = fromTag ? `${fromTag}..HEAD` : "HEAD";
  const output = git(["log", "--format=%H%x1f%B%x1e", range]);
  if (!output) {
    return [];
  }

  return output
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, message] = entry.split("\x1f");
      return { hash, message };
    });
}

function listChangedFiles(hash) {
  const output = git([
    "diff-tree",
    "--root",
    "--no-commit-id",
    "--name-only",
    "-r",
    hash,
  ]);
  return output ? output.split("\n") : [];
}

function isRelevantFile(file) {
  const normalizedWorkspace = workspace.endsWith("/")
    ? workspace
    : `${workspace}/`;
  return (
    file.startsWith(normalizedWorkspace) ||
    rootRelevantFiles.has(file) ||
    rootRelevantDirectories.some((directory) => file.startsWith(directory))
  );
}

function resolveBump(commits) {
  let bump = null;
  for (const commit of commits) {
    const header = commit.message.split("\n")[0] ?? "";
    const type = header.match(/^([a-z]+)(?:\([^)]+\))?!?:/)?.[1];
    const breaking =
      /^[a-z]+(?:\([^)]+\))?!:/.test(header) ||
      /\nBREAKING CHANGE:/.test(`\n${commit.message}`);

    if (breaking) {
      return "major";
    }
    if (type === "feat") {
      bump = "minor";
    } else if (type === "fix" && bump !== "minor") {
      bump = "patch";
    }
  }
  return bump;
}

function bumpVersion(version, bump) {
  if (bump === "major") {
    return { major: version.major + 1, minor: 0, patch: 0 };
  }
  if (bump === "minor") {
    return { major: version.major, minor: version.minor + 1, patch: 0 };
  }
  return { major: version.major, minor: version.minor, patch: version.patch + 1 };
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function nextDevNumber(baseVersion) {
  const base = formatVersion(baseVersion);
  const devTags = listTags(`${tagPrefix}@${base}-dev.*`)
    .map((tag) => tag.match(new RegExp(`^${escapeRegExp(tagPrefix)}@${escapeRegExp(base)}-dev\\.(\\d+)$`)))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return devTags.length ? Math.max(...devTags) + 1 : 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
