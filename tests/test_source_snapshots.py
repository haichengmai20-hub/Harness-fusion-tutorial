"""The local source checkouts must match what the course snapshot embeds; the snapshot reader must parse its rows."""
import importlib.util
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("source_snapshots", ROOT / "tools" / "source_snapshots.py")
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


def payload(*rows):
    """Raw text rows split over several rows (same id) or separate values (different ids), between JSON rows."""
    head = [b'0:{"b":"kmlR_r3nY0eufm7KiGEJ3"}']
    tail = [b"9:null"]
    return b"\n".join(head + [b"%s:T%x,%s" % (identifier, len(chunk), chunk) for identifier, chunks in rows
                             for chunk in chunks] + tail) + b"\n"


class EmbeddedCode(unittest.TestCase):
    def test_text_rows_are_joined_by_byte_length(self):
        code = "#!/usr/bin/env python3\nprint('— 缓存')\n".encode("utf-8")
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "s01").mkdir()
            (Path(tmp) / "s01" / "index.txt").write_bytes(payload((b"12", [code[:31], code[31:70], code[70:]])))
            with mock.patch.object(tool, "SITE", Path(tmp)):
                self.assertEqual(tool.embedded_code("s01"), code)

    def test_a_page_without_exactly_one_python_file_is_rejected(self):
        shebang = b"#!/usr/bin/env python3\n"
        for rows in ([(b"12", [b"const x = 1;\n"])], [(b"12", [shebang]), (b"13", [shebang])]):
            with self.subTest(rows=rows), tempfile.TemporaryDirectory() as tmp:
                (Path(tmp) / "s01").mkdir()
                (Path(tmp) / "s01" / "index.txt").write_bytes(payload(*rows))
                with mock.patch.object(tool, "SITE", Path(tmp)), self.assertRaises(ValueError):
                    tool.embedded_code("s01")


class DeployedCourse(unittest.TestCase):
    def test_launch_commands_name_the_twenty_chapter_folders(self):
        commands = tool.course_commands()
        self.assertEqual(list(commands), [f"s{i:02d}" for i in range(1, 21)])
        self.assertEqual((commands["s10"], commands["s20"]), ("s10_system_prompt", "s20_comprehensive"))

    def test_every_chapter_page_embeds_the_pinned_python(self):
        # Digest of the 20 code.py SHA-256 digests, in chapter order, at 20e7cbb.
        # Keep detecting content drift in a plain clone without either checkout.
        bundle = hashlib.sha256()
        for number in range(1, 21):
            with self.subTest(chapter=number):
                code = tool.embedded_code(f"s{number:02}")
                self.assertTrue(code.startswith(b"#!/usr/bin/env python3\n"))
                bundle.update(hashlib.sha256(code).digest())
        self.assertEqual(bundle.hexdigest(), "f63c6e74c8d4b5965ec9c6b0783dee0b0efd3cb58a28248d12956496233456b0")


class CheckoutDetection(unittest.TestCase):
    def test_directory_or_gitfile_marks_a_checkout(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            marker = root / ".git"
            self.assertFalse(tool.has_checkout_marker(root))
            marker.write_text("gitdir: ../modules/source\n", encoding="utf-8")
            self.assertTrue(tool.has_checkout_marker(root))
            marker.unlink()
            marker.mkdir()
            self.assertTrue(tool.has_checkout_marker(root))

    def test_a_missing_checkout_fails_instead_of_inspecting_the_parent(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(tool, "SOURCES", Path(tmp)):
            for repo, check in ((tool.TEACHING, tool.check_teaching), (tool.PRODUCT, tool.check_product)):
                with self.subTest(repo=repo["directory"]):
                    root = Path(tmp) / repo["directory"]
                    with self.assertRaisesRegex(ValueError, "missing checkout"):
                        check()
                    root.mkdir()  # A non-recursive clone may leave an empty submodule directory.
                    with mock.patch.object(tool, "git", side_effect=AssertionError("parent git queried")):
                        with self.assertRaisesRegex(ValueError, "missing checkout"):
                            check()


@unittest.skipUnless(tool.has_checkout_marker(tool.SOURCES / tool.TEACHING["directory"]),
                     "optional Learn Claude Code source checkout is not initialized")
class TeachingCheckout(unittest.TestCase):
    def test_teaching_commit_and_twenty_local_source_files(self):
        self.assertEqual(tool.check_teaching()[1], [])

    def test_drift_in_embedded_code_or_the_pinned_revision_is_reported(self):
        embedded = tool.embedded_code
        with mock.patch.object(tool, "embedded_code", side_effect=lambda chapter: embedded(chapter) + b"# drift\n"):
            self.assertEqual(len(tool.check_teaching()[1]), 20)
        with mock.patch.dict(tool.TEACHING, {"commit": "0" * 40}):
            self.assertEqual(len(tool.check_teaching()[1]), 1)


@unittest.skipUnless(tool.has_checkout_marker(tool.SOURCES / tool.PRODUCT["directory"]),
                     "optional product source checkout is not initialized")
class ProductCheckout(unittest.TestCase):
    def test_product_commit_and_worktree(self):
        self.assertEqual(tool.check_product()[1], [])

    def test_clean_or_locally_edited_manifest_is_allowed_but_source_drift_fails(self):
        actual_git = tool.git
        for status, expected_problems in (("", 0), (" M package.json", 0),
                                          (" D package.json", 1), (" M src/query.ts", 1)):
            def with_status(root, *args):
                return status if args[0] == "status" else actual_git(root, *args)
            with self.subTest(status=status), mock.patch.object(tool, "git", side_effect=with_status):
                self.assertEqual(len(tool.check_product()[1]), expected_problems)


if __name__ == "__main__":
    unittest.main()
