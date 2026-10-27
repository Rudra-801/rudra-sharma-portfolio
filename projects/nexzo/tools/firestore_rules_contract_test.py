from pathlib import Path
import re
r=Path('firestore.rules').read_text(encoding='utf-8')
checks={
 'default deny': bool(re.search(r'match /\{document=\*\*\}.*?allow read, write: if false',r,re.S)),
 'task delete blocked': bool(re.search(r'match /tasks/\{taskId\}.*?allow delete: if false',r,re.S)),
 'task owner uid enforced': 'request.resource.data.uid == uid' in r,
 'stats bounded': all(x in r for x in ['completedTasks <= request.resource.data.totalTasks','nonNegativeInt(request.resource.data.level, 100)','nonNegativeInt(request.resource.data.aiScore, 100)']),
 'post author immutable': 'request.resource.data.uid == resource.data.uid' in r,
 'comment owner delete': 'allow delete: if signedIn() && resource.data.uid == request.auth.uid;' in r,
 'like identity enforced': 'request.auth.uid == likeUid' in r,
 'group owner protected': 'request.resource.data.ownerUid == resource.data.ownerUid' in r,
 'group message membership check': 'members/$(request.auth.uid)' in r,
 'unknown documents denied': r.rstrip().endswith('}') and 'allow read, write: if false;' in r,
 'community reports create-only': 'match /reports/{reportId}' in r and 'allow read, update, delete: if false' in r,
}
failed=[name for name,ok in checks.items() if not ok]
for name,ok in checks.items(): print(('PASS' if ok else 'FAIL'),name)
if failed: raise SystemExit('Rules contract failures: '+', '.join(failed))
print(f'Firestore rules contracts passed: {len(checks)}/{len(checks)}')

