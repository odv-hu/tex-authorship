"""Compile isolated fixtures; retain logs, PDFs and previews for diagnosis."""
import pathlib, tempfile, subprocess, shutil, os, re, hashlib, json
import pdfplumber
import argparse
parser=argparse.ArgumentParser()
parser.add_argument('--output',type=pathlib.Path)
args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
out=args.output.resolve() if args.output else pathlib.Path(tempfile.mkdtemp(prefix='authorship-pdf-'))
out.mkdir(parents=True,exist_ok=True)
if any(out.iterdir()): raise SystemExit('Use an empty output directory to preserve prior results.')
print('PDF artifacts: '+str(out),flush=True)
for tool in ['lualatex','pdflatex','pdftoppm']:
 if not shutil.which(tool): raise SystemExit('Required tool missing: '+tool)
for n in ['authorship.sty','authorship.lua']:shutil.copyfile(root/'latex'/n,out/n)
env=os.environ.copy();cache=out/'tex-cache';cache.mkdir()
env.update(TEXMFCACHE=str(cache),TEXMFVAR=str(cache))
source=(root/'test/reviews.tex').read_text()
def run(name,text,engine='lualatex'):
 (out/(name+'.tex')).write_text(text)
 for _ in range(3):
  p=subprocess.run([engine,'-interaction=nonstopmode','-halt-on-error',name+'.tex'],cwd=out,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120)
  (out/(name+'-build.txt')).write_bytes(p.stdout)
  if p.returncode:raise RuntimeError(p.stdout.decode()[-4000:])
 log=(out/(name+'.log')).read_text();assert 'Overfull' not in log,name
 aux=(out/(name+'.aux')).read_text();counts=re.findall(r'\\AuthorshipSetSummary\{([^}]+)\}',aux)
 with pdfplumber.open(out/(name+'.pdf')) as pdf:
  chars=[(number,c['text'],round(c['x0'],3),round(c['top'],3)) for number,page in enumerate(pdf.pages) for c in page.chars]
  assert chars, 'No glyphs extracted: '+name
 return counts,chars,log
for mode in ['show','citations','gradient','natbib','hide','pdf','nopackage']:
 text=source.replace(r'\ReviewOptions{citations}',r'\ReviewOptions{'+('citations' if mode in ['natbib','pdf'] else mode)+'}')
 if mode=='natbib':text=text.replace(r'\begin{document}',r'\usepackage{natbib}'+'\n'+r'\begin{document}').replace(r'\cite{x}',r'\citep{x}').replace(r'\bibitem{x}',r'\bibitem[Example(2024)]{x}')
 if mode=='nopackage':
  text=re.sub(r'\\usepackage\[[^\n]+\]\{authorship\}\n','',text)
  text=re.sub(r'\\AuthorshipOwner\{[^}]*\}\n','',text)
 # omit the explicit summary here to compare text geometry, test legend separately
 text=text.replace(r'\AuthorshipSummary','')
 plain='\n'.join(l for l in text.split('\n') if not l.startswith('% authorship-review:'))
 engine='pdflatex' if mode=='pdf' else 'lualatex'
 a=run(mode+'-review',text,engine);b=run(mode+'-plain',plain,engine)
 assert a[:2]==b[:2],mode
 if mode not in ['hide','pdf','nopackage']:assert a[0], 'Missing attribution counts: '+mode
 if mode not in ['hide','pdf','nopackage']:assert 'changed since reviewed' in a[2],mode
 print(mode+': identical attribution counts and glyph positions',flush=True)
 if mode in ['citations','hide','gradient']:
  subprocess.run(['pdftoppm','-scale-to','1100','-singlefile','-png',str(out/(mode+'-review.pdf')),str(out/mode)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
a=run('legend',source);b=run('legend-plain','\n'.join(l for l in source.split('\n') if not l.startswith('% authorship-review:')))
assert a[0]==b[0]
with pdfplumber.open(out/'legend.pdf') as pdf: text=''.join(p.extract_text() for p in pdf.pages)
assert all(t in text for t in ['Reviewed (single bar)','Revised (double bar)','Changed since review','Balázs','Anna'])
subprocess.run(['pdftoppm','-scale-to','1100','-singlefile','-png',str(out/'legend.pdf'),str(out/'legend')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
# A long multi-page passage, including a nested passage and a float.
body='\n\n'.join(['Long reviewed passage with text for checking page breaks. '*50]*5)
body+='\n%[&AI: Claude]\nNested AI text.\n%[/&AI: Claude]\n'+r'\begin{figure}[t]\centering Floating reviewed text.\caption{Reviewed caption.}\end{figure}'
r={'version':1,'status':'revised','by':'Anna','color':'#209050','hash':hashlib.sha256(('&AI: ChatGPT\n'+body).encode()).hexdigest()}
sub='%[&AI: ChatGPT]\n% authorship-review: '+json.dumps(r)+'\n'+body+'\n%[/&AI: ChatGPT]\n'
(out/'chapter.tex').write_text(sub)
main=r'\documentclass{article}\usepackage{authorship}\begin{document}\input{chapter}\end{document}'
a=run('multipage',main);assert 'changed since' not in a[2]
(out/'chapter.tex').write_text('\n'.join(l for l in sub.split('\n') if not l.startswith('% authorship-review:')))
b=run('multipage-plain',main);assert a[:2]==b[:2]
print('Legend excluded from counts; included-file/multi-page/nested/float geometry and counts match.',flush=True)
full=run('fullwidth',source.replace(r'\AuthorshipSummary',r'\AuthorshipSummaryFullWidth'))
assert full[0]==run('fullwidth-plain', '\n'.join(l for l in source.replace(r'\AuthorshipSummary',r'\AuthorshipSummaryFullWidth').split('\n') if not l.startswith('% authorship-review:')))[0]
print('Full-width summary counts match; all PDF checks passed.')
