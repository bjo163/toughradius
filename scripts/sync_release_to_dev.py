#!/usr/bin/env python3
"""Apply an already-created release metadata commit to the current dev tip."""

from __future__ import annotations

import argparse
import subprocess
import sys


def git(repo: str, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(["git", *args], cwd=repo, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result


def is_ancestor(repo: str, ancestor: str, descendant: str) -> bool:
    return git(repo, "merge-base", "--is-ancestor", ancestor, descendant, check=False).returncode == 0


def sync_release_commit(repo: str, release_commit: str, attempts: int = 3) -> bool:
    """Cherry-pick release metadata onto dev, retrying if dev moves during push.

    Returns True when a commit was pushed and False when dev already contains
    the release commit or an equivalent release patch.
    """
    for _ in range(attempts):
        git(repo, "fetch", "origin", "dev")
        dev_tip = git(repo, "rev-parse", "refs/remotes/origin/dev").stdout.strip()
        if is_ancestor(repo, release_commit, dev_tip):
            return False

        git(repo, "checkout", "--detach", dev_tip)
        picked = git(repo, "cherry-pick", release_commit, check=False)
        if picked.returncode:
            conflicts = git(repo, "ls-files", "-u").stdout.strip()
            if not conflicts and "CONFLICT" not in (picked.stderr + picked.stdout):
                git(repo, "cherry-pick", "--skip")
                return False
            git(repo, "cherry-pick", "--abort", check=False)
            raise RuntimeError(picked.stderr.strip() or picked.stdout.strip())

        pushed = git(repo, "push", "origin", "HEAD:refs/heads/dev", check=False)
        if pushed.returncode == 0:
            return True

        git(repo, "reset", "--hard", dev_tip)
        if "non-fast-forward" not in pushed.stderr and "fetch first" not in pushed.stderr:
            raise RuntimeError(pushed.stderr.strip() or pushed.stdout.strip())

    raise RuntimeError("dev kept advancing while release metadata was being synchronized")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("release_commit", help="main-branch release commit SHA to sync")
    parser.add_argument("--repo", default=".", help="checked-out git repository")
    args = parser.parse_args()
    try:
        changed = sync_release_commit(args.repo, args.release_commit)
    except RuntimeError as error:
        print(f"Release metadata sync failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    print("Release metadata pushed to dev" if changed else "dev already contains this release metadata")


if __name__ == "__main__":
    main()
