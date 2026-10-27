from pathlib import Path
import json,re,sys
R=Path(__file__).resolve().parents[1]
errors=[]; warnings=[]
for required in ['Frontend/robots.txt','Frontend/sitemap.xml','Frontend/privacy.html','Frontend/terms.html','Frontend/data-deletion.html','Frontend/offline.html','Backend/.env.example','firebase.json']:
    if not (R/required).exists(): errors.append('Missing '+required)
config=(R/'Frontend/js/config.js').read_text(encoding='utf-8')
m=re.search(r"const production='([^']+)'",config)
if not m: errors.append('Production API URL not found in config.js')
else: print('Production API:',m.group(1))
if not (R/'Backend/package-lock.json').exists(): warnings.append('Backend/package-lock.json is missing; run Backend/INSTALL_BACKEND.cmd on a normal npm connection.')
fb=json.loads((R/'firebase.json').read_text())
if fb.get('hosting',{}).get('public')!='dist': errors.append('Firebase Hosting must deploy dist')
for page in (R/'Frontend').glob('*.html'):
    text=page.read_text(encoding='utf-8')
    if '<meta name="description"' not in text: errors.append(f'{page.name}: missing description')
    if '<meta name="robots"' not in text: errors.append(f'{page.name}: missing robots directive')
print('\nWarnings:')
for w in warnings: print('-',w)
if errors:
    print('\nFAILED:')
    for e in errors: print('-',e)
    sys.exit(1)
print('\nPre-deployment structural check passed.')
