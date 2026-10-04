#!/usr/bin/env python3
"""Prepare an idempotent Conventional Commit based MWX-ISP release."""

from __future__ import annotations

import argparse
import os
import re
import subprocess
from pathlib import Path


SEMVER = re.compile(r"^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$")
SUBJECT = re.compile(r"^(feat|fix|perf|refactor|revert|docs|style|test|build|ci|chore|ops)(?:\([^\n)]*\))?(!)?:\s*(.+)$", re.I)


def run_git(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True).strip()


def classify(commits: list[tuple[str, str, str]]) -> tuple[str | None, dict[str, list[str]]]:
    """Return bump level and grouped release notes for parsed commit records."""
    bump = None
    groups: dict[str, list[str]] = {"Breaking Changes": [], "Features": [], "Fixes and Improvements": []}
    for _, subject, body in commits:
        match = SUBJECT.match(subject)
        if not match:
            continue
        kind, breaking_mark, description = match.groups()
        kind = kind.lower()
        breaking = bool(breaking_mark) or bool(re.search(r"(?im)^BREAKING CHANGE:", body))
        if breaking:
            bump = "major"
            groups["Breaking Changes"].append(description)
        elif kind == "feat":
            if bump != "major":
                bump = "minor"
            groups["Features"].append(description)
        elif kind in {"fix", "perf", "refactor", "revert"}:
            if bump not in {"major", "minor"}:
                bump = "patch"
            groups["Fixes and Improvements"].append(description)
    return bump, {name: values for name, values in groups.items() if values}


def bump_version(version: str, bump: str) -> str:
    match = SEMVER.match(version)
    if not match:
        raise ValueError(f"latest tag is not a supported SemVer version: {version}")
    major, minor, patch = map(int, match.groups())
    if bump == "major":
        major, minor, patch = major + 1, 0, 0
    elif bump == "minor":
        minor, patch = minor + 1, 0
    elif bump == "patch":
        patch += 1
    else:
        raise ValueError(f"unsupported bump: {bump}")
    return f"v{major}.{minor}.{patch}"


def validate_new_tag(version: str, existing_tags: list[str]) -> None:
    if version in existing_tags:
        raise ValueError(f"release tag already exists: {version}")


def read_commits(previous_tag: str) -> list[tuple[str, str, str]]:
    raw = run_git("log", "--no-merges", "--format=%H%x1f%s%x1f%b%x1e", f"{previous_tag}..HEAD")
    records = []
    for record in raw.split("\x1e"):
        if not record.strip():
            continue
        fields = record.strip().split("\x1f", 2)
        if len(fields) == 3:
            records.append((fields[0], fields[1].strip(), fields[2].strip()))
    return records


def pending_release(commits: list[tuple[str, str, str]], existing_tags: list[str]) -> tuple[str, str] | None:
    """Find an already-written release commit whose tag push needs retrying."""
    for commit_hash, subject, _ in reversed(commits):
        match = re.fullmatch(r"chore\(release\):\s*(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)", subject)
        if match and match.group(1) not in existing_tags:
            return match.group(1), commit_hash
    return None


def write_changelog(path: Path, previous_tag: str, version: str, groups: dict[str, list[str]]) -> str:
    lines = [f"## {version} — {run_git('show', '-s', '--format=%cs', 'HEAD')}", "", f"Changes since {previous_tag}:", ""]
    for heading, entries in groups.items():
        lines.extend([f"### {heading}", ""])
        lines.extend(f"- {entry}" for entry in entries)
        lines.append("")
    section = "\n".join(lines).rstrip() + "\n"
    if path.exists():
        existing = path.read_text(encoding="utf-8")
        if not existing.startswith("# MWX-ISP Changelog"):
            existing = "# MWX-ISP Changelog\n\n" + existing.lstrip()
        prefix = "# MWX-ISP Changelog\n\n"
        path.write_text(prefix + section + "\n" + existing[len(prefix):], encoding="utf-8")
    else:
        path.write_text("# MWX-ISP Changelog\n\n" + section, encoding="utf-8")
    return section


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    args = parser.parse_args()

    tags = run_git("tag", "--list", "v*", "--sort=-version:refname").splitlines()
    if not tags:
        raise SystemExit("No v* release tag exists; seed the repository with its initial version tag first.")
    previous_tag = tags[0]
    commits = read_commits(previous_tag)
    pending = pending_release(commits, tags)
    output = Path(args.github_output) if args.github_output else None
    if pending:
        version, commit_hash = pending
        if output:
            with output.open("a", encoding="utf-8") as stream:
                stream.write("release=true\n")
                stream.write("tag_only=true\n")
                stream.write(f"release_tag={version}\n")
                stream.write(f"release_sha={commit_hash}\n")
                stream.write(f"previous_tag={previous_tag}\n")
        return
    bump, groups = classify(commits)
    if bump is None:
        if output:
            with output.open("a", encoding="utf-8") as stream:
                stream.write("release=false\n")
                stream.write(f"previous_tag={previous_tag}\n")
        return

    version = bump_version(previous_tag, bump)
    validate_new_tag(version, tags)
    write_changelog(Path("CHANGELOG.md"), previous_tag, version, groups)
    Path("VERSION").write_text(version.removeprefix("v") + "\n", encoding="utf-8")
    if output:
        with output.open("a", encoding="utf-8") as stream:
            stream.write("release=true\n")
            stream.write(f"release_tag={version}\n")
            stream.write("tag_only=false\n")
            stream.write(f"previous_tag={previous_tag}\n")
            stream.write(f"bump={bump}\n")


if __name__ == "__main__":
    main()
