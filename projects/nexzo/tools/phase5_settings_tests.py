from pathlib import Path
import re
R=Path(__file__).resolve().parents[1]
state=(R/'Frontend/js/settings-state.js').read_text(encoding='utf-8')
ctl=(R/'Frontend/js/settings-controller.js').read_text(encoding='utf-8')
html=(R/'Frontend/settings.html').read_text(encoding='utf-8')
rules=(R/'firestore.rules').read_text(encoding='utf-8')
checks={
 'black-gold + system theme': "['black-gold','system']" in state and "mode:'black-gold'" in state,
 'device/cloud split': 'DEVICE_KEYS' in state and 'CLOUD_KEYS' in state and 'saveConfirmed' in state,
 'confirmed Firestore save': 'await fs.setDoc(ref,payload,{merge:true})' in state and 'await fs.getDoc(ref)' in state,
 'reduced motion': "motion:['smooth','reduced','off']" in ctl.replace(' ','') or "opts('motion',['smooth','reduced','off']" in ctl,
 'notification + sound + read aloud': all(x in ctl for x in ['inAppNotifications','requestPermission','sound','readAloud']),
 'privacy + personalization + ai history': all(x in ctl for x in ['privacyConsent','personalizationConsent','aiHistory','clearAIHistory']),
 'safe local cache clear': 'Clear local device cache?' in ctl and 'Cloud profile, Level, XP, tasks, academic progress, posts and Study Groups are not deleted.' in ctl,
 'account info + logout + deletion request': all(x in ctl for x in ['Signed-in account','logoutUser','requestAccountDeletion']),
 'deletion request confirmed': 'await fs.getDoc(ref)' in ctl and 'Your account has not been deleted yet.' in ctl,
 'rules protect settings/account requests': 'validSettingsV5' in rules and 'match /accountRequests/{requestId}' in rules and 'allow update, delete: if false;' in rules,
 'settings assets loaded': 'settings-state.js?v=240' in html and 'settings-controller.js?v=240' in html,
}
failed=[k for k,v in checks.items() if not v]
for k,v in checks.items(): print(('PASS' if v else 'FAIL'), '-', k)
print(f'\n{len(checks)-len(failed)}/{len(checks)} checks passed')
raise SystemExit(1 if failed else 0)
