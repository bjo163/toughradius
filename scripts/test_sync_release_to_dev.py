import subprocess
import tempfile
import unittest
from pathlib import Path

from sync_release_to_dev import sync_release_commit


def git(cwd, *args):
    return subprocess.check_output(["git", *args], cwd=cwd, text=True).strip()


class ReleaseMetadataSyncTest(unittest.TestCase):
    def test_syncs_release_commit_onto_advanced_dev_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bare = root / "origin.git"
            repo = root / "repo"
            subprocess.check_call(["git", "init", "--bare", str(bare)], stdout=subprocess.DEVNULL)
            subprocess.check_call(["git", "init", "-b", "main", str(repo)], stdout=subprocess.DEVNULL)
            git(repo, "config", "user.name", "Release test")
            git(repo, "config", "user.email", "release@example.invalid")
            git(repo, "remote", "add", "origin", str(bare))

            (repo / "VERSION").write_text("1.0.0\n", encoding="utf-8")
            (repo / "CHANGELOG.md").write_text("# Changelog\n", encoding="utf-8")
            git(repo, "add", ".")
            git(repo, "commit", "-m", "chore: initial state")
            base = git(repo, "rev-parse", "HEAD")
            git(repo, "push", "-u", "origin", "main")
            git(repo, "branch", "dev")
            git(repo, "push", "origin", "dev")

            (repo / "VERSION").write_text("1.1.0\n", encoding="utf-8")
            (repo / "CHANGELOG.md").write_text("# Changelog\n\n## v1.1.0\n", encoding="utf-8")
            git(repo, "add", "VERSION", "CHANGELOG.md")
            git(repo, "commit", "-m", "chore(release): v1.1.0")
            release_commit = git(repo, "rev-parse", "HEAD")
            git(repo, "push", "origin", "main")

            git(repo, "checkout", "dev")
            (repo / "feature.txt").write_text("dev continued after promotion\n", encoding="utf-8")
            git(repo, "add", "feature.txt")
            git(repo, "commit", "-m", "feat: continue development")
            git(repo, "push", "origin", "dev")

            self.assertTrue(sync_release_commit(str(repo), release_commit))
            synced_tip = git(repo, "rev-parse", "refs/remotes/origin/dev")
            self.assertEqual("1.1.0", git(repo, "show", f"{synced_tip}:VERSION"))
            self.assertTrue((repo / "feature.txt").exists())
            self.assertFalse(sync_release_commit(str(repo), release_commit))
            self.assertEqual(base, git(repo, "merge-base", "main", "dev"))


if __name__ == "__main__":
    unittest.main()
