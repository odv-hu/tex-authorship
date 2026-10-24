"""Exercise the archive gate against isolated synthetic packages and corruption."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('verify_artifacts', ROOT / 'scripts/verify-artifacts.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class ArchiveChecks(unittest.TestCase):
    def check_archive(self, change=None):
        package = json.loads((ROOT / 'package.json').read_text())
        version = package['version']
        entries = {
            '[Content_Types].xml': b'<Types/>',
            'extension.vsixmanifest': f'<PackageManifest><Identity Version="{version}" Publisher="odv-hu"/></PackageManifest>'.encode(),
            'extension/package.json': (ROOT / 'package.json').read_bytes(),
            'extension/readme.md': (ROOT / 'README.md').read_bytes(),
            'extension/LICENSE.txt': (ROOT / 'LICENSE').read_bytes(),
        }
        for name in ['CITATION.cff', 'examples/sample.tex', 'images/icon.png', 'images/logo.png', 'images/logo-dark.png']:
            entries['extension/' + name] = (ROOT / name).read_bytes()
        for directory in ['src', 'latex']:
            for file in (ROOT / directory).rglob('*'):
                if file.is_file():
                    entries['extension/' + file.relative_to(ROOT).as_posix()] = file.read_bytes()
        if change:
            change(entries)
        with tempfile.TemporaryDirectory(prefix='authorship-archive-test-') as folder:
            folder = Path(folder)
            with ZipFile(folder / f'tex-authorship-{version}.vsix', 'w') as archive:
                for name, data in entries.items():
                    archive.writestr(name, data)
            with ZipFile(folder / f'authorship-latex-{version}.zip', 'w') as archive:
                for name in ['authorship.sty', 'authorship.lua']:
                    archive.writestr(name, (ROOT / 'latex' / name).read_bytes())
            with contextlib.redirect_stdout(io.StringIO()):
                verifier.verify(ROOT, folder)

    def test_matching_sources(self):
        self.check_archive()

    def test_changed_source(self):
        with self.assertRaises(AssertionError):
            self.check_archive(lambda entries: entries.update({'extension/latex/authorship.lua': b'changed'}))

    def test_unexpected_file(self):
        with self.assertRaises(AssertionError):
            self.check_archive(lambda entries: entries.update({'extension/unexpected.txt': b'extra'}))

    def test_wrong_manifest_version(self):
        with self.assertRaises(AssertionError):
            self.check_archive(lambda entries: entries.update({'extension.vsixmanifest': b'<PackageManifest><Identity Version="0.0.0" Publisher="odv-hu"/></PackageManifest>'}))

    def test_prerelease(self):
        with self.assertRaises(AssertionError):
            def change(entries):
                entries['extension.vsixmanifest'] = entries['extension.vsixmanifest'].replace(b'</PackageManifest>', b'<Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="true"/></PackageManifest>')
            self.check_archive(change)
