from pathlib import Path
import json, re, sys
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(name, ok):
    checks.append((name,bool(ok)))

front=ROOT/"Frontend"; dist=ROOT/"dist"; back=ROOT/"Backend"
html=list(dist.glob("*.html"))
check("fingerprinted production CSS exists", any((dist/"css").glob("style.*.css")))
check("all production CSS references are fingerprinted", all(all(re.search(r'\.[a-f0-9]{12}\.css$',ref) for ref in re.findall(r'href=[\"\'](css/[^\"\'?]+\.css)',p.read_text(errors='ignore'),re.I)) for p in html))
check("protected auth guard fails closed", "nx-auth-pending body{visibility:hidden" in (front/"js/auth-guard.js").read_text(errors="ignore") and "return redirect('session')" in (front/"js/auth-guard.js").read_text(errors="ignore"))
check("backend readiness endpoint", 'app.get("/ready"' in (back/"src/app.js").read_text())
check("graceful shutdown", 'SIGTERM' in (back/"src/server.js").read_text())
check("durable AI quota", 'systemUsage' in (back/"src/middleware/ai-quota.js").read_text())
check("storage deletion owner rule", "allow delete" in (ROOT/"storage.rules").read_text())
check("task delete denied", "allow delete: if false" in (ROOT/"firestore.rules").read_text())
check("non-empty production service worker", (dist/"sw.js").exists() and (dist/"sw.js").stat().st_size>200)
check("legacy global script removed", not (front/"js/script.js").exists())
workflow=ROOT/".github/workflows/verify.yml"
check("CI workflow present", workflow.exists())
check("CI browser smoke configured", workflow.exists() and "e2e_smoke.py" in workflow.read_text(errors="ignore"))
failed=[n for n,v in checks if not v]
for n,v in checks: print(("PASS" if v else "FAIL"), n)
if failed: sys.exit(1)
print(f"Production audit passed: {len(checks)}/{len(checks)}")
