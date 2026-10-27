from pathlib import Path
from html.parser import HTMLParser
import sys,json
ROOT=Path(__file__).resolve().parents[1]/'Frontend'
class Audit(HTMLParser):
 def __init__(self):super().__init__();self.ids=[];self.issues=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);line=self.getpos()[0]
  if 'id' in a:self.ids.append((a['id'],line))
  if tag=='img' and 'alt' not in a:self.issues.append(f'line {line}: image missing alt')
  if tag in {'input','select','textarea'} and not any(k in a for k in ('aria-label','aria-labelledby','title')) and 'id' not in a:self.issues.append(f'line {line}: unlabelled {tag}')
 def finish(self):
  seen=set()
  for id_,line in self.ids:
   if id_ in seen:self.issues.append(f'line {line}: duplicate id {id_}')
   seen.add(id_)
reports={}
for p in ROOT.glob('*.html'):
 a=Audit();a.feed(p.read_text(encoding='utf8'));a.finish();reports[p.name]=a.issues
bad={k:v for k,v in reports.items() if v}
print(json.dumps({'pages':len(reports),'issues':bad},indent=2))
if bad:sys.exit(1)
print('Accessibility structural audit passed')
