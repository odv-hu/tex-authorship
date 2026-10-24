"""Inspect release archives without extracting them. Python standard library only."""
import argparse
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile


def verify(root, folder):
    package = json.loads((root / 'package.json').read_text())
    version = package['version']
    with ZipFile(folder / f'tex-authorship-{version}.vsix') as vsix:
        assert vsix.testzip() is None, 'Unreadable VSIX'
        names = vsix.namelist()
        assert len(names) == len(set(names)), 'Duplicate archive paths'
        expected = {'[Content_Types].xml', 'extension.vsixmanifest',
                    'extension/package.json', 'extension/readme.md', 'extension/LICENSE.txt',
                    'extension/CITATION.cff', 'extension/examples/sample.tex',
                    'extension/images/icon.png', 'extension/images/logo.png', 'extension/images/logo-dark.png'}
        for directory in ('src', 'latex'):
            for file in (root / directory).rglob('*'):
                if file.is_file():
                    name = 'extension/' + file.relative_to(root).as_posix()
                    expected.add(name)
                    assert vsix.read(name) == file.read_bytes(), f'Source mismatch: {name}'
        assert set(names) == expected, f'Unexpected/missing files: {set(names) ^ expected}'
        assert json.loads(vsix.read('extension/package.json')) == package, 'Package metadata differs'
        # VSCE expands relative README links for Marketplace display.
        readme = vsix.read('extension/readme.md').decode()
        for kind in ('blob', 'raw'):
            readme = readme.replace(f'https://github.com/odv-hu/tex-authorship/{kind}/HEAD/', '')
        assert readme == (root / 'README.md').read_text(), 'README content differs'
        for name in expected - {'[Content_Types].xml', 'extension.vsixmanifest',
                                'extension/readme.md', 'extension/package.json'}:
            local = name.removeprefix('extension/')
            if local == 'LICENSE.txt':
                local = 'LICENSE'
            assert vsix.read(name) == (root / local).read_bytes(), f'Content mismatch: {name}'
        tree = ET.fromstring(vsix.read('extension.vsixmanifest'))
        identity = next(e for e in tree.iter() if e.tag.endswith('Identity'))
        assert identity.attrib['Version'] == version and identity.attrib['Publisher'] == package['publisher']
        assert not any(e.attrib.get('Id') == 'Microsoft.VisualStudio.Code.PreRelease' and
                       e.attrib.get('Value', '').lower() == 'true' for e in tree.iter()), 'Unexpected pre-release flag'
        sty = vsix.read('extension/latex/authorship.sty').decode()
        assert re.search(r'\\ProvidesPackage\{authorship\}\[[^\]]* v' + re.escape(version) + r'\s', sty)
        with ZipFile(folder / f'authorship-latex-{version}.zip') as latex:
            assert latex.testzip() is None and sorted(latex.namelist()) == ['authorship.lua', 'authorship.sty']
            for name in latex.namelist():
                assert latex.read(name) == vsix.read('extension/latex/' + name), f'LaTeX mismatch: {name}'
    print(f'Verified {version}: versions, publisher, normal channel, archive allowlist and bundled sources')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('folder', type=Path)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    verify(args.root.resolve(), args.folder.resolve())
