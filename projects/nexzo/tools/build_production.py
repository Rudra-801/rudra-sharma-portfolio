from pathlib import Path
import argparse,hashlib,json,re,shutil
ROOT=Path(__file__).resolve().parents[1]; SRC=ROOT/'Frontend'
# Copy canonical shared inputs into the existing Backend-only Render context.
(ROOT/'Backend/data').mkdir(exist_ok=True)
shutil.copyfile(SRC/'data/mriirs-cse-2023-27.json',ROOT/'Backend/data/mriirs-cse-2023-27.json')
for name in ['academic-notes','level-system']:
 shutil.copyfile(SRC/f'js/{name}.js',ROOT/f'Backend/src/services/{name}.cjs')
parser=argparse.ArgumentParser()
parser.add_argument('--output', help='Create a fresh build in a new directory inside this project')
args=parser.parse_args()
OUT=(ROOT/args.output).resolve() if args.output else ROOT/'dist'
if args.output:
 if not OUT.is_relative_to(ROOT) or OUT.exists():
  parser.error('--output must be a new directory inside this project')
elif OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir()
manifest={}
def digest(data): return hashlib.sha256(data).hexdigest()[:12]
def emit_bytes(data,folder,stem,suffix):
 name=f"{stem}.{digest(data)}{suffix}"; target=OUT/folder/name; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data); return target,f"{folder}/{name}"
def emit(src,folder):
 data=src.read_bytes(); target,rel=emit_bytes(data,folder,src.stem,src.suffix); manifest[str(src.relative_to(SRC))]=rel; return target
# Immutable media/data keep stable names.
for folder in ['assets','badges-webp','data']:
 if (SRC/folder).exists(): shutil.copytree(SRC/folder,OUT/folder)
for extra in ['manifest.webmanifest','favicon.png','logo.png','nexzo-icon.png','robots.txt','sitemap.xml']:
 if (SRC/extra).exists(): shutil.copy2(SRC/extra,OUT/extra)
# Keep one fingerprinted base stylesheet for audit/debugging, but production pages use one ordered CSS bundle each.
if (SRC/'css/style.css').exists(): emit(SRC/'css/style.css','css')

def resolve_css(ref):
 # Bundle the exact stylesheet served by the source page, in its declared order.
 clean=ref.split('?',1)[0]
 source=(SRC/clean).resolve()
 if not source.is_relative_to(SRC.resolve()) or not source.is_file():
  raise SystemExit(f'Missing or invalid stylesheet: {ref}')
 return source

page_bundles={}
link_re=re.compile(r'<link\b[^>]*rel=["\']stylesheet["\'][^>]*href=["\'](css/[^"\']+)["\'][^>]*>',re.I)
for page in sorted(SRC.glob('*.html')):
 text=page.read_text(encoding='utf-8')
 refs=[m.group(1) for m in link_re.finditer(text)]
 ordered=[]; seen=set()
 for ref in refs:
  src=resolve_css(ref)
  key=str(src)
  if src.exists() and key not in seen:
   seen.add(key); ordered.append(src)
 if ordered:
  chunks=[]
  for src in ordered:
   chunks.append(f"\n/* ---- {src.relative_to(SRC)} ---- */\n".encode())
   chunks.append(src.read_bytes())
   chunks.append(b"\n")
  data=b''.join(chunks)
  _,rel=emit_bytes(data,'css',f"page-{page.stem}",'.css')
  page_bundles[page.name]=rel
  manifest[f"bundle:{page.name}"]=rel
# Fingerprint all maintained JS modules.
for src in sorted((SRC/'js').glob('*.js')): emit(src,'js')
# Rewrite HTML: one CSS bundle per page, fingerprinted JS refs.
for html in SRC.glob('*.html'):
 text=html.read_text(encoding='utf-8')
 bundle=page_bundles.get(html.name)
 if bundle:
  def replace_link(match):
   # Python closures cannot assign to a plain bool without nonlocal inside nested helper created in loop;
   # use function attribute as a tiny mutable marker.
   if not getattr(replace_link,'used',False):
    replace_link.used=True
    return f'<link rel="stylesheet" href="{bundle}">'
   return ''
  replace_link.used=False
  text=link_re.sub(replace_link,text)
 for old,new in sorted(manifest.items(),key=lambda x:-len(x[0])):
  if old.startswith('bundle:'): continue
  clean=old.replace('\\','/')
  text=re.sub(re.escape(clean)+r'(?:\?v=[^"\']+)?',new,text)
 (OUT/html.name).write_text('\n'.join(line.rstrip() for line in text.splitlines())+'\n',encoding='utf-8',newline='\n')
# Service worker receives current manifest and deterministic precache list.
sw_src=SRC/'service-worker.js'
if not sw_src.exists(): raise SystemExit('Missing Frontend/service-worker.js')
cache='nexzo-v17-'+digest(json.dumps(manifest,sort_keys=True).encode())
precache=['./','./Home.html','./login.html','./offline.html','./privacy.html','./terms.html','./data-deletion.html','./favicon.png','./manifest.webmanifest']
precache += ['./'+v for v in manifest.values()]
sw=sw_src.read_text(encoding='utf-8').replace('__CACHE_NAME__',cache).replace('__PRECACHE__',json.dumps(sorted(set(precache))))
(OUT/'sw.js').write_text(sw,encoding='utf-8',newline='\n')
(OUT/'asset-manifest.json').write_text(json.dumps({'cache':cache,'assets':manifest,'pageBundles':page_bundles,'precache':sorted(set(precache))},indent=2),encoding='utf-8',newline='\n')
print(f'Production dist built: {len(list(OUT.rglob("*")))} entries, cache={cache}, pageCssBundles={len(page_bundles)}')
