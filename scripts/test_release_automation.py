import unittest

from release_automation import bump_version, classify, parse_commit_records, pending_release, validate_new_tag


class ReleaseAutomationTest(unittest.TestCase):
    def test_conventional_commit_classification(self):
        bump, groups = classify([
            ("a", "fix(api): reject foreign tenant IDs", ""),
            ("b", "feat: add organization selector", ""),
        ])
        self.assertEqual("minor", bump)
        self.assertEqual(["add organization selector"], groups["Features"])

    def test_commit_log_keeps_empty_bodies(self):
        records = parse_commit_records(
            "feature-sha\x1ffeat(tenancy): add organization isolation\x1f\x1e"
            "fix-sha\x1ffix(api): reject foreign IDs\x1f\x1e"
        )
        self.assertEqual(2, len(records))
        self.assertEqual(("minor", {"Features": ["add organization isolation"], "Fixes and Improvements": ["reject foreign IDs"]}), classify(records))

    def test_breaking_change_wins(self):
        bump, groups = classify([("a", "feat(api)!: require tenant identity", "")])
        self.assertEqual("major", bump)
        self.assertIn("require tenant identity", groups["Breaking Changes"])

    def test_docs_only_does_not_release(self):
        bump, groups = classify([("a", "docs: update install guide", ""), ("b", "chore: tidy workflow", "")])
        self.assertIsNone(bump)
        self.assertEqual({}, groups)

    def test_semver_bumps(self):
        self.assertEqual("v2.0.0", bump_version("v1.4.8", "major"))
        self.assertEqual("v1.5.0", bump_version("v1.4.8", "minor"))
        self.assertEqual("v1.4.9", bump_version("v1.4.8", "patch"))

    def test_existing_tag_collision_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "tag already exists"):
            validate_new_tag("v1.5.0", ["v1.5.0", "v1.4.8"])

    def test_pending_version_commit_is_recovered_without_bumping_twice(self):
        commits = [("release-sha", "chore(release): v1.5.0", ""), ("feature-sha", "feat: a new feature", "")]
        self.assertEqual(("v1.5.0", "release-sha"), pending_release(commits, ["v1.4.9"]))
        self.assertIsNone(pending_release(commits, ["v1.5.0", "v1.4.9"]))


if __name__ == "__main__":
    unittest.main()
