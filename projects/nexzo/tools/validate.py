from pathlib import Path
import json, re, subprocess, sys
root=Path(__file__).resolve().parents[1]
front=root/'Frontend'
errors=[]

for js in list((front/'js').glob('*.js')) + list((root/'Backend'/'src').rglob('*.js')) + list((root/'Backend'/'test').rglob('*.js')):
    r=subprocess.run(['node','--check',str(js)],capture_output=True,text=True)
    if r.returncode: errors.append(f'JS syntax: {js.relative_to(root)}: {r.stderr.strip()}')

for jf in [root/'firebase.json',root/'firestore.indexes.json',root/'Backend'/'package.json']:
    try: json.loads(jf.read_text(encoding='utf-8'))
    except Exception as e: errors.append(f'JSON: {jf.relative_to(root)}: {e}')

for html in front.glob('*.html'):
    s=html.read_text(encoding='utf-8',errors='ignore')
    ids=re.findall(r'\bid=["\']([^"\']+)',s)
    dup=sorted({x for x in ids if ids.count(x)>1})
    if dup: errors.append(f'Duplicate IDs in {html.name}: {dup}')
    for ref in re.findall(r'(?:src|href)=["\']([^"\']+)',s):
        if ref.startswith(('http:','https:','#','mailto:','javascript:','data:')): continue
        path=(front/ref.split('?')[0].split('#')[0])
        if ref and not path.exists(): errors.append(f'Missing ref in {html.name}: {ref}')

public={'404.html','login.html','signup.html'}
for name in public:
    s=(front/name).read_text(encoding='utf-8')
    if 'data-service.js' in s or 'canonical-ui.js' in s:
        errors.append(f'Public page initializes private data service: {name}')

if (front/'js'/'script.js').exists(): errors.append('Legacy global script.js must not exist')

if (root/'functions').exists(): errors.append('Duplicate Firebase Functions backend still present')

# The repaired runtime pages must stay isolated from the 8k-line legacy bundle.
weak_pages={
    'Home.html':['app-shell.js','task-store.js','home-controller.js'],
    'academics.html':['app-shell.js','academics-controller.js'],
    'career.html':['app-shell.js','career-controller.js'],
    'profile.html':['app-shell.js','profile-controller.js'],
    'planner.html':['app-shell.js','data-service.js','task-store.js','planner-controller.js'],
    'dashboard.html':['app-shell.js','data-service.js','task-store.js','dashboard-controller.js'],
    'settings.html':['app-shell.js','data-service.js','task-store.js','settings-controller.js'],
    'community.html':['app-shell.js','community-service.js'],
    'ai-assistant.html':['firebase-client.js','data-service.js','shared-state.js','auth-guard.js','ai-clean.js'],
}
for name,required in weak_pages.items():
    text=(front/name).read_text(encoding='utf-8',errors='ignore')
    if 'js/script.js' in text: errors.append(f'Legacy script loaded by repaired page: {name}')
    for module in required:
        if module not in text: errors.append(f'Missing repaired runtime module in {name}: {module}')

# One Firebase web initializer prevents duplicate app/auth instances.
initializers=[]
for js in (front/'js').glob('*.js'):
    text=js.read_text(encoding='utf-8',errors='ignore')
    if 'initializeApp(' in text: initializers.append(js.name)
if initializers != ['firebase-client.js']:
    errors.append(f'Firebase initializeApp must exist only in firebase-client.js: {initializers}')

# Authentication and redirect pages must not download the legacy application bundle.
for name in ['login.html','signup.html','index.html','404.html']:
    if 'js/script.js' in (front/name).read_text(encoding='utf-8',errors='ignore'):
        errors.append(f'Lightweight page loads legacy script: {name}')

# Protected pages must verify a Firebase session before their page controllers run.
for name in ['planner.html','dashboard.html','settings.html','community.html','profile.html','ai-assistant.html','nexzo-hub.html']:
    text=(front/name).read_text(encoding='utf-8',errors='ignore')
    if 'auth-guard.js' not in text: errors.append(f'Protected page missing Firebase auth guard: {name}')

config=(front/'js'/'config.js').read_text(encoding='utf-8',errors='ignore')
if 'nexzo-backend.onrender.com/api' not in config: errors.append('Production backend URL missing from config.js')
if "const stored=local?" not in config: errors.append('Production API endpoint can be overridden from browser storage')

firebase_client=(front/'js'/'firebase-client.js').read_text(encoding='utf-8',errors='ignore')
if "SDK_VERSION='10.12.5'" not in firebase_client: errors.append('Firebase SDK version is not pinned centrally')

rules=(root/'firestore.rules').read_text(encoding='utf-8',errors='ignore')
for required in ['validLikeCounterChange','validMembershipCounterChange','validHttpUrl','match /messages/{messageId}']:
    if required not in rules: errors.append(f'Firestore hardening missing: {required}')

hosting=json.loads((root/'firebase.json').read_text(encoding='utf-8'))
headers=json.dumps(hosting.get('hosting',{}).get('headers',[]))
for required in ['Content-Security-Policy','Strict-Transport-Security','immutable']:
    if required not in headers: errors.append(f'Hosting security/cache header missing: {required}')

try:
    firebase=json.loads((root/'firebase.json').read_text(encoding='utf-8'))
    for target in ['hosting','firestore','storage']:
        if target not in firebase: errors.append(f'firebase.json missing {target} target')
except Exception:
    pass

for forbidden in list(root.rglob('.env')) + [p for p in root.rglob('*.json') if 'service-account' in p.name.lower() or 'firebase-adminsdk' in p.name.lower()]:
    errors.append(f'Private credential included: {forbidden.relative_to(root)}')

if errors:
    print('\n'.join('ERROR: '+e for e in errors)); sys.exit(1)
print('NEXZO clean validation passed')
