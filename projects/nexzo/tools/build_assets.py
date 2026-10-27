from pathlib import Path
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[1]; FRONT=ROOT/'Frontend'; OUT=FRONT/'css'/'dist'; OUT.mkdir(parents=True,exist_ok=True)
def minify(css):
 css=re.sub(r'/\*(?!\!)[\s\S]*?\*/','',css)
 css=re.sub(r'\s+',' ',css)
 return re.sub(r'\s*([{}:;,>])\s*',r'\1',css).strip()
def emit(src,prefix):
 data=minify(src.read_text()); h=hashlib.sha256(data.encode()).hexdigest()[:12]; name=f'{prefix}.{h}.css'; (OUT/name).write_text(data); return name,len(data.encode())
for f in OUT.glob('*.css'):f.unlink()
style,ss=emit(FRONT/'css/style.css','style'); runtime,rs=emit(FRONT/'css/runtime-v2.css','runtime')
for html in FRONT.glob('*.html'):
 text=html.read_text()
 text=re.sub(r'css/(?:dist/)?(?:style|page-[\w-]+)(?:\.prod)?(?:\.[a-f0-9]{12})?\.css(?:\?v=[^"\']+)?',f'css/dist/{style}',text)
 text=re.sub(r'css/(?:dist/)?runtime(?:-v2|\.prod)?(?:\.[a-f0-9]{12})?\.css(?:\?v=[^"\']+)?',f'css/dist/{runtime}',text)
 html.write_text(text)
(FRONT/'asset-manifest.json').write_text(json.dumps({'style':style,'runtime':runtime,'sizes':{'style':ss,'runtime':rs}},indent=2))
print(f'Built {style} ({ss}) and {runtime} ({rs})')
