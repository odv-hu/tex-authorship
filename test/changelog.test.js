'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {releaseNotes,unwrap,validate}=require('../scripts/changelog');
const sample=[
 '# Changelog','','Intro.','','## [Unreleased]','','### Added','','- Not released yet.','',
 '## [1.2.3] - 2026-10-24','','### Added','','- A wrapped','  entry.','','### Fixed','','* Another.','',
 '## [1.2.2] - 2026-10-01','','- Older.','',
 '[Unreleased]: https://example.com/compare/v1.2.3...HEAD','[1.2.3]: https://example.com/compare/v1.2.2...v1.2.3',
].join('\n');
test('returns only the requested section, without link definitions',()=>{
 assert.deepEqual(releaseNotes(sample,'1.2.3'),{date:'2026-10-24',notes:'### Added\n\n- A wrapped\n  entry.\n\n### Fixed\n\n* Another.'});
 assert.equal(releaseNotes(sample,'1.2.2').notes,'- Older.');
 assert.equal(releaseNotes(sample.replaceAll('\n','\r\n'),'1.2.2').notes,'- Older.');
});
test('missing, duplicate, undated or empty sections fail',()=>{
 assert.throws(()=>releaseNotes(sample,'1.2.4'),/no "## \[1\.2\.4\] - YYYY-MM-DD" section/);
 assert.throws(()=>releaseNotes(sample+'\n## [1.2.2] - 2026-10-02\n\n- Again.\n','1.2.2'),/more than one/);
 for(const heading of ['## [1.2.3]','## [1.2.3] - 2026-02-31','## [1.2.3] 2026-10-24','## [1.2.3] - 24/10/2026'])
  assert.throws(()=>releaseNotes(sample.replace('## [1.2.3] - 2026-10-24',heading),'1.2.3'),/valid date/);
 assert.throws(()=>releaseNotes('## [1.2.3] - 2026-10-24\n\n### Added\n\n## [1.2.2] - 2026-10-01\n- x\n','1.2.3'),/no entries/);
 for(const version of ['Unreleased','v1.2.3','1.2','01.2.3']) assert.throws(()=>releaseNotes(sample,version),/MAJOR\.MINOR\.PATCH/);
});
test('unwrap joins wrapped paragraphs and list items for GitHub release notes',()=>{
 assert.equal(unwrap('### Added\n\n- A wrapped\n  entry.\n- Next\n  - nested\n    item\n\nA para\ngraph.\n\n```\ncode\nlines\n```\n| a |\n| b |'),
  '### Added\n\n- A wrapped entry.\n- Next\n  - nested item\n\nA para graph.\n\n```\ncode\nlines\n```\n| a |\n| b |');
});
test('the repository changelog has a dated section for the package version',()=>{
 const root=path.resolve(__dirname,'..');
 const {version}=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.match(validate(root,version).notes,/^### /);
 assert.match(fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8'),/^## \[Unreleased\]$/m);
});
