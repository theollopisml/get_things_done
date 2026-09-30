"""Exercise deployment failures without touching a real Docker host."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
OLD = "ghcr.io/theollopisml/get_things_done@sha256:" + "a" * 64
NEW = "ghcr.io/theollopisml/get_things_done@sha256:" + "b" * 64


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.deploy = self.root / "deploy"
        shutil.copytree(ROOT / "deploy", self.deploy)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.log = self.root / "calls"
        self.env = dict(os.environ, PATH=f"{self.bin}:{os.environ['PATH']}", CALL_LOG=str(self.log))
        for name in ["production.env", "app.env", "backup.env"]:
            (self.deploy / name).write_text("# test configuration\n")
        (self.deploy / "smoke.env").write_text("SMOKE_URL=https://private.example\n")
        (self.deploy / "current-image").write_text(OLD + "\n")
        self.stub("docker", """
printf '%s %s\\n' "$APP_IMAGE" "$*" >> "$CALL_LOG"
if [[ "$*" == *scripts/migrate.mjs* && "${FAIL_MIGRATION:-}" == 1 ]]; then exit 1; fi
if [[ "$*" == *'up -d --no-deps --wait'* && "$APP_IMAGE" == *bbbbbbbb* && "${FAIL_APP:-}" == 1 ]]; then exit 1; fi
""")
        self.stub("curl", """
printf 'smoke %s\\n' "$APP_IMAGE" >> "$CALL_LOG"
if [[ "$APP_IMAGE" == *bbbbbbbb* && "${FAIL_SMOKE:-}" == 1 ]]; then exit 1; fi
""")
        self.stub("sleep", "exit 0")
        (self.deploy / "backup.sh").write_text("""#!/usr/bin/env bash
printf 'backup\\n' >> "$CALL_LOG"
[[ "${FAIL_BACKUP:-}" != 1 ]]
""")
        (self.deploy / "backup.sh").chmod(0o700)

    def stub(self, name, contents):
        path = self.bin / name
        path.write_text("#!/usr/bin/env bash\nset -euo pipefail\n" + contents)
        path.chmod(0o700)

    def run_deploy(self, image=NEW, **flags):
        return subprocess.run(
            ["bash", str(self.deploy / "deploy.sh"), image],
            env=dict(self.env, **flags), capture_output=True, text=True,
        )

    def calls(self):
        return self.log.read_text() if self.log.exists() else ""

    def test_success_saves_both_versions_after_checks(self):
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.deploy / "current-image").read_text().strip(), NEW)
        self.assertEqual((self.deploy / "previous-image").read_text().strip(), OLD)
        calls = self.calls()
        self.assertLess(calls.index("backup"), calls.index("scripts/migrate.mjs"))
        self.assertLess(calls.index("scripts/migrate.mjs"), calls.index("up -d --no-deps"))

    def test_backup_failure_never_migrates_or_replaces_app(self):
        result = self.run_deploy(FAIL_BACKUP="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("scripts/migrate.mjs", self.calls())
        self.assertNotIn("up -d --no-deps", self.calls())

    def test_migration_failure_keeps_running_app(self):
        result = self.run_deploy(FAIL_MIGRATION="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("up -d --no-deps", self.calls())
        self.assertEqual((self.deploy / "current-image").read_text().strip(), OLD)

    def test_failed_readiness_restores_previous_app_and_still_fails(self):
        result = self.run_deploy(FAIL_APP="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(OLD + " compose", self.calls())
        self.assertIn("Previous application image restored", result.stderr)
        self.assertEqual((self.deploy / "current-image").read_text().strip(), OLD)

    def test_failed_https_restores_previous_image(self):
        result = self.run_deploy(FAIL_SMOKE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Previous application image restored", result.stderr)
        self.assertEqual((self.deploy / "current-image").read_text().strip(), OLD)

    def test_first_failed_deployment_has_no_fake_rollback(self):
        (self.deploy / "current-image").unlink()
        result = self.run_deploy(FAIL_APP="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no previous image exists", result.stderr)
        self.assertNotIn("Previous application image restored", result.stderr)
        self.assertFalse((self.deploy / "current-image").exists())

    def test_untrusted_image_cannot_execute_shell_or_pull_another_repo(self):
        for image in [NEW + ";touch /tmp/unsafe", "ghcr.io/other/app@sha256:" + "c" * 64, "latest"]:
            result = self.run_deploy(image)
            self.assertEqual(result.returncode, 2)
        self.assertEqual(self.calls(), "")

    def test_parallel_manual_deploy_is_refused(self):
        with (self.deploy / "deploy.lock").open("w") as lock:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("already running", result.stderr)
        self.assertEqual(self.calls(), "")


class BackupTests(unittest.TestCase):
    def test_encrypted_backup_round_trip_and_dump_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            deploy = root / "deploy"
            shutil.copytree(ROOT / "deploy", deploy)
            cert, key = root / "recipient.crt", root / "recipient.key"
            subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
                            "-keyout", str(key), "-out", str(cert), "-days", "1",
                            "-subj", "/CN=backup-test"], check=True, capture_output=True)
            (deploy / "backup.env").write_text(
                f"BACKUP_TARGET='user@offsite:/backups/'\nBACKUP_RECIPIENT='{cert}'\n"
            )
            (deploy / "production.env").write_text("# test\n")
            (deploy / "current-image").write_text(OLD + "\n")
            bin_dir = root / "bin"
            bin_dir.mkdir()
            for name, contents in {
                "docker": "[[ ${FAIL_DUMP:-} != 1 ]] || exit 1\nprintf 'database-dump-fixture'\n",
                "scp": "[[ ${FAIL_COPY:-} != 1 ]]\n",
            }.items():
                path = bin_dir / name
                path.write_text("#!/usr/bin/env bash\nset -euo pipefail\n" + contents)
                path.chmod(0o700)
            env = dict(os.environ, PATH=f"{bin_dir}:{os.environ['PATH']}")
            result = subprocess.run(["bash", str(deploy / "backup.sh")], env=env, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            encrypted = next((deploy / "backups").glob("*.cms"))
            plain = subprocess.run(["openssl", "cms", "-decrypt", "-binary", "-inform", "DER",
                                    "-in", str(encrypted), "-inkey", str(key)],
                                   check=True, capture_output=True).stdout
            self.assertEqual(plain, b"database-dump-fixture")
            self.assertNotIn(plain, encrypted.read_bytes())
            corrupted = root / "corrupted.cms"
            data = bytearray(encrypted.read_bytes())
            data[-5] ^= 1
            corrupted.write_bytes(data)
            rejected = subprocess.run(["openssl", "cms", "-decrypt", "-binary", "-inform", "DER",
                                       "-in", str(corrupted), "-inkey", str(key)],
                                      capture_output=True)
            self.assertNotEqual(rejected.returncode, 0)
            for flag in ["FAIL_DUMP", "FAIL_COPY"]:
                failed = subprocess.run(["bash", str(deploy / "backup.sh")],
                                        env=dict(env, **{flag: "1"}), capture_output=True)
                self.assertNotEqual(failed.returncode, 0)
            self.assertEqual(list((deploy / "backups").glob(".backup.*")), [])


if __name__ == "__main__":
    unittest.main()
