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
# On a failure, keep a PNG preview of the first page of every PDF built so far, so the
# CI artifact shows the failing case without downloading and opening each PDF (#4).
import sys
def previews_on_failure(kind,value,trace):
 for pdf in sorted(out.glob('*.pdf')):
  if not pdf.with_suffix('.png').exists():
   subprocess.run(['pdftoppm','-scale-to','1100','-singlefile','-png',str(pdf),str(pdf.with_suffix(''))],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 print('Failure previews: '+str(out),file=sys.stderr)
 sys.__excepthook__(kind,value,trace)
sys.excepthook=previews_on_failure
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
STATES=['unreviewed','reviewed','revised','changed']
def progress(name):
 found=re.findall(r'\\AuthorshipSetReviewProgress\{([^}]+)\}',(out/(name+'.aux')).read_text())
 assert found,'Missing review progress: '+name
 return {k:int(v) for k,v in (part.split('=') for part in found[-1].split('|'))}
def ai_words(counts): return sum(int(e.rsplit(',',1)[1]) for e in counts[-1].split('|') if e.startswith('&'))
def pdf_text(name):
 with pdfplumber.open(out/(name+'.pdf')) as pdf: return ''.join(p.extract_text() for p in pdf.pages)
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
# Review progress (ADR-0021): every state occurs, states add up to the AI-origin words,
# and documents without review metadata keep their summary unless asked explicitly.
p=progress('legend');assert p['reviews']==3 and p['unreviewed']==0 and min(p[s] for s in STATES[1:])>0,p
assert sum(p[s] for s in STATES)==ai_words(a[0]),p
assert 'AI review progress (typeset words)' in text and 'Revised, unchanged since review' in text
q=progress('legend-plain');assert q['reviews']==0 and q['unreviewed']==ai_words(b[0]),q
assert 'AI review progress' not in pdf_text('legend-plain')
run('progress-explicit','\n'.join(l for l in source.split('\n') if not l.startswith('% authorship-review:')).replace(r'\AuthorshipSummary',r'\AuthorshipReviewProgress'))
assert 'AI review progress (typeset words)' in pdf_text('progress-explicit')
print('Review progress states reconcile with AI-origin words; opt-in table only with reviews or explicit command.',flush=True)
# A long multi-page passage, including a nested passage and a float.
body='\n\n'.join(['Long reviewed passage with text for checking page breaks. '*50]*5)
body+='\n%[&AI: Claude]\nNested AI text.\n%[/&AI: Claude]\n'+r'\begin{figure}[t]\centering Floating reviewed text.\caption{Reviewed caption.}\end{figure}'
r={'version':1,'status':'revised','by':'Anna','color':'#209050','hash':hashlib.sha256(('&AI: ChatGPT\n'+body).encode()).hexdigest()}
sub='%[&AI: ChatGPT]\n% authorship-review: '+json.dumps(r)+'\n'+body+'\n%[/&AI: ChatGPT]\n'
(out/'chapter.tex').write_text(sub)
main=r'\documentclass{article}\usepackage{authorship}\begin{document}\input{chapter}\end{document}'
a=run('multipage',main);assert 'changed since' not in a[2]
p=progress('multipage');assert p['unreviewed']==3 and p['revised']==ai_words(a[0])-3 and p['reviewed']==p['changed']==0,p  # nested passage keeps its own state
(out/'chapter.tex').write_text('\n'.join(l for l in sub.split('\n') if not l.startswith('% authorship-review:')))
b=run('multipage-plain',main);assert a[:2]==b[:2]
print('Legend excluded from counts; included-file/multi-page/nested/float geometry and counts match.',flush=True)
full=run('fullwidth',source.replace(r'\AuthorshipSummary',r'\AuthorshipSummaryFullWidth'))
assert 'AI review progress (typeset words)' in pdf_text('fullwidth')
assert full[0]==run('fullwidth-plain', '\n'.join(l for l in source.replace(r'\AuthorshipSummary',r'\AuthorshipSummaryFullWidth').split('\n') if not l.startswith('% authorship-review:')))[0]
print('Full-width summary counts match.',flush=True)

# Reviewer bars and legend colours (#4): the bars sit in the left margin in the reviewer's
# colour, single for reviewed, double for revised, short when changed since review, none on
# owner lines; each legend swatch has the colour of the reviewer it names.
BLUE,GREEN=(0.196,0.471,0.667),(0.125,0.565,0.314)
with pdfplumber.open(out/'legend.pdf') as pdf:
 page=pdf.pages[0]
 rows={}
 for c in page.chars: rows.setdefault(round(c['top']),[]).append(c)
 text_left=min(c['x0'] for c in page.chars)
 def row(start):
  found=[(top,cs) for top,cs in sorted(rows.items()) if start in ''.join(c['text'] for c in cs)]
  assert found,start
  return found[0][0],min(c['x0'] for c in found[0][1])
 def bars(top):
  return [(round(l['x0'],1),round(l['bottom']-l['top'],1),tuple(round(v,3) for v in l['stroking_color'])) for l in page.lines
   if l['x1']<text_left and l['top']<top+8 and l['bottom']>top-1]
 reviewed,revised,changed=bars(row('Readandaccepted')[0]),bars(row('EditedAItext')[0]),bars(row('Thispassagewaschanged')[0])
 assert len(reviewed)==1 and reviewed[0][2]==BLUE and reviewed[0][1]>5,reviewed
 assert len(revised)==2 and {b[2] for b in revised}=={GREEN} and len({b[0] for b in revised})==2,revised
 assert len(changed)==1 and changed[0][2]==BLUE and changed[0][1]<=2.5,changed
 owner=[top for top,cs in rows.items() if ''.join(c['text'] for c in cs)=='Ownertextbetweenpassages.']
 assert len(owner)==3 and not any(bars(top) for top in owner),'bars on owner lines'
 for label,colour in [('Reviewed(singlebar)',BLUE),('Revised(doublebar)',GREEN),('Changedsincereview(shortbar)',BLUE)]:
  top,x=row(label)
  swatch=[r for r in page.rects if r['x1']<=x+0.5 and abs(r['top']-top)<4]
  assert swatch and tuple(round(v,3) for v in swatch[0]['non_stroking_color'])==colour,(label,swatch)
print('Reviewer bars and legend swatches have the reviewer colours and shapes.',flush=True)

# Bibliography source metadata on reference passages (#4): the source comment line changes
# neither glyphs nor counts, with and without citation emphasis.
ref=lambda meta:(r'\documentclass{article}\usepackage[OPT]{authorship}\begin{document}'+'\nOwner text.\n%[*Reference]\n'
 +(r'% authorship-source: {"version":1,"citekey":"x"}'+'\n' if meta else '')
 +r'Quoted reference text with a citation \cite{x}.'+'\n%[/*Reference]\n'+r'\begin{thebibliography}{1}\bibitem{x} A reference.\end{thebibliography}'+'\n'+r'\end{document}')
for opt in ['show','citations']:
 a=run('source-'+opt,ref(True).replace('OPT',opt));b=run('source-'+opt+'-plain',ref(False).replace('OPT',opt))
 assert a[:2]==b[:2],opt
 assert any(e.startswith('*Reference=') for e in a[0][-1].split('|')),a[0]
print('Reference passages with source metadata keep glyphs and counts.',flush=True)

# More document classes (#4): two-column article, elsarticle and report with twoside. Review
# metadata must not move glyphs or counts, and the full-width summary must span the text
# width, on a fresh single-column page in two-column documents.
def text_width(log):
 return float(re.search(r'authorship-test-textwidth=([\d.]+)pt',log).group(1))*72/72.27   # TeX pt to PDF bp
def left_margin(name):
 with pdfplumber.open(out/(name+'.pdf')) as pdf: return min(c['x0'] for c in pdf.pages[0].chars if c['size']>=9)
for cls,opts in [('article','twocolumn'),('elsarticle','preprint'),('report','twoside')]:
 name=cls+'-'+opts
 variant=source.replace(r'\documentclass{article}',r'\documentclass[%s]{%s}'%(opts,cls)).replace(r'\begin{document}',r'\AtBeginDocument{\typeout{authorship-test-textwidth=\the\textwidth}}\begin{document}')
 body=variant.replace(r'\AuthorshipSummary','')
 a=run(name,body);b=run(name+'-plain','\n'.join(l for l in body.split('\n') if not l.startswith('% authorship-review:')))
 assert a[:2]==b[:2],name
 assert 'changed since reviewed' in a[2],name
 full=run(name+'-fullwidth',variant.replace(r'\AuthorshipSummary',r'\AuthorshipSummaryFullWidth'))
 width=text_width(full[2])
 with pdfplumber.open(out/(name+'-fullwidth.pdf')) as pdf:
  pages=[(i,pg) for i,pg in enumerate(pdf.pages) if 'Authorship summary' in (pg.extract_text() or '')]
  assert pages,name
  i,page=pages[-1]
  rows={}
  for c in page.chars: rows.setdefault(round(c['top']),[]).append(c)
  header=[cs for cs in rows.values() if ''.join(c['text'] for c in cs).startswith('AuthorCharacters')]
  assert header,name
  x0,x1=min(c['x0'] for c in header[0]),max(c['x1'] for c in header[0])
  assert abs((x1-x0)-width)<1,(name,x0,x1,width)
  if opts=='twocolumn': assert i>0 and abs(x0-left_margin(name))<0.5,(name,i,x0)   # fresh page, full width from the left margin
print('Two-column article, elsarticle and two-sided report: geometry, counts and full-width summary width.')
print('All PDF checks passed.')
