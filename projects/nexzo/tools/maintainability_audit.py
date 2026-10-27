from pathlib import Path
import json,re,sys
ROOT=Path(__file__).resolve().parents[1]
F=ROOT/'Frontend'
fail=[]
html=list(F.glob('*.html'))
# No parser-blocking external scripts.
for p in html:
    text=p.read_text(encoding='utf-8')
    for tag in re.findall(r'<script\b[^>]*\bsrc=[^>]*>',text,re.I):
        if not re.search(r'\b(defer|async|type=["\']module["\'])\b',tag,re.I): fail.append(f'parser-blocking script: {p.name}: {tag[:100]}')
# Production HTML must use immutable fingerprinted CSS.
dist_html=list((ROOT/'dist').glob('*.html'))
for p in dist_html:
    text=p.read_text(encoding='utf-8')
    refs=re.findall(r'href=["\'](css/[^"\'?]+\.css)',text,re.I)
    if any(not re.search(r'\.[a-f0-9]{12}\.css$',ref) for ref in refs): fail.append(f'non-fingerprinted production style: {p.name}')
# Prevent regression budgets. These budgets describe the current legacy ceiling and must only move downward.
style=(F/'css/style.css').read_text(encoding='utf-8')
legacy_path=F/'js/script.js'; legacy=legacy_path.read_text(encoding='utf-8') if legacy_path.exists() else ''
metrics={
 'source_css_bytes':len(style.encode()),
 'legacy_js_bytes':len(legacy.encode()),
 'important_count':style.count('!important'),
 'inline_event_handlers':sum(len(re.findall(r'\son[a-z]+\s*=',p.read_text(encoding='utf-8'),re.I)) for p in html),
}
limits={'source_css_bytes':700000,'legacy_js_bytes':0,'important_count':7500,'inline_event_handlers':0}
for k,v in metrics.items():
    if v>limits[k]: fail.append(f'{k} budget exceeded: {v}>{limits[k]}')
# Contradictory task deletion APIs must not be callable.
for rel in ['js/task-store.js','js/data-service.js']:
    text=(F/rel).read_text(encoding='utf-8')
    if 'allowDelete: true' in text: fail.append(f'delete enabled in {rel}')
print(json.dumps({'metrics':metrics,'limits':limits,'failures':fail},indent=2))

# V13 architecture requirements
for required in ['js/shared-state.js','service-worker.js','manifest.webmanifest']:
    if not (F/required).exists(): fail.append(f'missing {required}')
if 'deleteTask:' in (F/'js/data-service.js').read_text(encoding='utf-8'): fail.append('dead deleteTask API remains')
for p in html:
    if p.name!='index.html' and 'js/shared-state.js' not in p.read_text(encoding='utf-8'): fail.append(f'shared state missing: {p.name}')

# V14 deploy-output guarantees: source-only CSS/JS are not hosted and every runtime asset is fingerprinted.
dist=ROOT/'dist'
if dist.exists():
    assert not (dist/'css/style.css').exists(), 'Unfingerprinted source CSS leaked into dist'
    assert not (dist/'js/script.js').exists(), 'Unfingerprinted legacy JS leaked into dist'
    assert (dist/'asset-manifest.json').exists(), 'Production asset manifest missing'
print('V14 maintainability: dist deploy directory and fingerprint contracts passed')

if fail:
    print('Final maintainability failures:',*fail,sep='\n- ')
    sys.exit(1)
print('Maintainability/performance audit passed')
