from pathlib import Path
import re,sys
R=Path(__file__).resolve().parents[1]; F=R/'Frontend'
checks=[]
def ck(name,ok): checks.append((name,bool(ok)))
ai=(F/'js/ai-clean.js').read_text()
perf=(F/'js/performance-runtime.js').read_text()
css=(F/'css/style.css').read_text()
sw=(F/'service-worker.js').read_text()
ck('assistant has no 30-second health polling loop', "setInterval(()=>{if(!document.hidden)health(false)},30000)" not in ai)
ck('assistant health requests are deduplicated', 'healthInFlight' in ai and 'now-lastHealthAt<30000' in ai)
ck('assistant only rechecks stale health after tab return', 'Date.now()-lastHealthAt>120000' in ai)
ck('performance runtime lazy-loads noncritical images', "img.loading=critical?'eager':'lazy'" in perf)
ck('local dev unregisters stale service workers', 'reg.unregister()' in perf)
ck('service worker removes prior nexzo caches', "key.startsWith('nexzo-')" in sw)
ck('reduced-motion guard exists', '@media (prefers-reduced-motion: reduce)' in css)
ck('hidden/performance mode pauses animations', 'animation-play-state:paused!important' in css)
ck('low-power blur is capped', 'backdrop-filter:blur(8px)!important' in css)
# Explicit decorative pointer parallax should remain disabled; companion pointermove is drag interaction, not parallax.
parallax='\n'.join(p.read_text(errors='ignore') for p in (F/'js').glob('*.js') if p.name!='study-companion.js')
ck('decorative mouse parallax remains disabled', not re.search(r"addEventListener\(['\"]mousemove['\"]",parallax))
for n,v in checks: print(('PASS' if v else 'FAIL'),n)
failed=[n for n,v in checks if not v]
if failed: sys.exit(1)
print(f'Phase 9 performance tests passed: {len(checks)}/{len(checks)}')
