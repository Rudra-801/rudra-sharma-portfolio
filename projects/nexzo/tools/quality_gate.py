from pathlib import Path
import re, sys
root=Path(__file__).resolve().parents[1]
checks=[]
def check(name,ok):
    checks.append((name,bool(ok)))
    print(('PASS' if ok else 'FAIL')+': '+name)
html=list((root/'Frontend').glob('*.html'))
check('performance runtime loaded on every HTML page', all('js/performance-runtime.js' in p.read_text(encoding='utf-8',errors='ignore') for p in html))
auth=(root/'Frontend/js/auth-guard.js').read_text(encoding='utf-8')
check('auth guard fails closed', "return redirect('session')" in auth)
check('Firebase ID token is not persisted by auth guard', "localStorage.setItem('token'" not in auth)
rules=(root/'firestore.rules').read_text(encoding='utf-8')
check('task deletion blocked by Firestore rules', re.search(r'match /tasks/\{taskId\}.*?allow delete: if false;',rules,re.S))
storage=(root/'storage.rules').read_text(encoding='utf-8')
check('profile image deletion has owner-only rule', 'allow delete: if owner(uid);' in storage)
ai=(root/'Backend/src/routes/ai.routes.js').read_text(encoding='utf-8')
check('AI requires verified email', 'router.use(requireVerifiedEmail);' in ai)
task=(root/'Frontend/js/task-store.js').read_text(encoding='utf-8')
check('task cache is user scoped', 'scopedKey(PRIMARY)' in task)
check('client task deletion disabled', "Task deletion is disabled" in task)
check('no inline event handlers', not any(re.search(r'\son(?:click|change|keydown)=',p.read_text(encoding='utf-8',errors='ignore'),re.I) for p in html))
check('strict script CSP enabled', "script-src 'self' 'unsafe-inline'" not in (root/'firebase.json').read_text(encoding='utf-8'))
check('profile writes use UID-scoped shared state', 'NEXZOProfileAuthority?.save' in (root/'Frontend/js/profile-controller.js').read_text(encoding='utf-8') and (root/'Frontend/js/profile-authority.js').exists())
check('planner catalog split from controller', (root/'Frontend/js/planner-data.js').exists() and 'NEXZOPlannerData' in (root/'Frontend/js/planner-controller.js').read_text(encoding='utf-8'))
failed=[name for name,ok in checks if not ok]
if failed:
    print(f'Quality gate failed: {len(failed)} issue(s)')
    sys.exit(1)
print(f'Quality gate passed: {len(checks)} checks')
