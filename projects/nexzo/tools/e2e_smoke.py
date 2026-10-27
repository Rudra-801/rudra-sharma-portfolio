import contextlib,http.server,socketserver,threading,shutil,socket,os
from pathlib import Path
from playwright.sync_api import sync_playwright
PROJECT=Path(__file__).resolve().parents[1];ROOT=(PROJECT/"dist").resolve();RESULTS=PROJECT/"test-results";RESULTS.mkdir(exist_ok=True)
with socket.socket() as _sock:
 _sock.bind(("127.0.0.1",0));PORT=_sock.getsockname()[1]
PUBLIC=["Home.html","academics.html","career.html","login.html","signup.html"]
PROTECTED=["planner.html","dashboard.html","settings.html","community.html","profile.html","ai-assistant.html","nexzo-hub.html"]
VIEWPORTS=[(1440,900),(1024,768),(768,1024),(390,844)]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
@contextlib.contextmanager
def server():
 h=lambda *a,**k:Quiet(*a,directory=str(ROOT),**k);s=socketserver.ThreadingTCPServer(("127.0.0.1",PORT),h);threading.Thread(target=s.serve_forever,daemon=True).start()
 try:yield
 finally:s.shutdown();s.server_close()
def v16_contracts():
 root=PROJECT/"Frontend"
 assert all('runtime-observability.js' in page.read_text(encoding='utf-8') for page in root.glob('*.html'))
 project=root.parent
 assert 'allow delete: if false' in (project/'firestore.rules').read_text(encoding='utf-8')
 assert 'nexzo_legacy_cache_owner' in (root/'js/shared-state.js').read_text(encoding='utf-8')
 assert 'event.key===scopedKey(PRIMARY)' in (root/'js/task-store.js').read_text(encoding='utf-8')
 assert not (root/'js/script.js').exists()
 assert all('js/script.js' not in page.read_text(encoding='utf-8') for page in root.glob('*.html'))
 assert (PROJECT/'dist/sw.js').stat().st_size>200
 assert 'localhost' in (root/'js/performance-runtime.js').read_text(encoding='utf-8')
 assert 'Math.sqrt(xp/120)' not in (root/'js/app-shell.js').read_text(encoding='utf-8')
 
 assert all('event-actions.js' in page.read_text(encoding='utf-8') for page in root.glob('*.html'))
 assert not any(__import__('re').search(r'\son(?:click|change|keydown)=',page.read_text(encoding='utf-8'),__import__('re').I) for page in root.glob('*.html'))
 assert 'await authority.saveConfirmed(next)' in (root/'js/profile-controller.js').read_text(encoding='utf-8')
 print('V16 contracts passed: modular pages, strict declarative events, UID profile state, no-delete, owner-safe sync, production service worker')
v16_contracts()
with server(),sync_playwright() as p:
 launch={'headless':True,'args':['--no-sandbox']}; system_browser=shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome');
 if os.environ.get('PLAYWRIGHT_CHANNEL'):launch['channel']=os.environ['PLAYWRIGHT_CHANNEL']
 elif system_browser:launch['executable_path']=system_browser
 b=p.chromium.launch(**launch);fail=[]
 for w,h in VIEWPORTS:
  page=b.new_page(viewport={"width":w,"height":h});errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
  for name in PUBLIC:
   errors.clear();page.goto(f"http://127.0.0.1:{PORT}/{name}",wait_until="networkidle");page.wait_for_timeout(250)
   if page.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth+4"):fail.append(f"overflow {name} {w}")
   if errors:fail.append(f"errors {name}: {errors[:2]}")
   duplicate_ids=page.evaluate("[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,a)=>a.indexOf(id)!==i)")
   if duplicate_ids:fail.append(f'duplicate ids {name}: {duplicate_ids[:3]}')
   if page.locator('img:not([alt])').count():fail.append(f'image alt missing {name}')
  page.close()
 page=b.new_page(viewport={"width":1440,"height":900});errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
 for name in PROTECTED:
  errors.clear()
  page.goto(f"http://127.0.0.1:{PORT}/{name}?e2e=1",wait_until="networkidle");page.wait_for_timeout(300)
  if not page.locator('body').is_visible():fail.append(f"hidden {name}")
  if page.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth+4"):fail.append(f"overflow protected {name}")
  if name in {"planner.html","dashboard.html","settings.html","community.html","nexzo-hub.html"} and page.locator('#nxShellTopbar').count()!=1:fail.append(f"topbar count {name}")
  if name=="ai-assistant.html" and page.locator('header.topbar').count()!=1:fail.append("assistant topbar missing")
  if name=="planner.html" and page.locator('[data-action="delete"],button:has-text("Delete")').count():fail.append("planner delete control present")
  if name=="profile.html":
   if page.locator('.sync-stats .sync-stat').count()!=4:fail.append('profile must have exactly four stat cards')
   if page.locator('#heroBadge .nexzo-badge-img').count()!=1:fail.append('profile hero badge missing')
   if page.locator('#track .level').count()!=10:fail.append('profile journey slide must show ten levels')
   rank=page.locator('.rank-stat-premium').first
   if rank.count():
    box=rank.bounding_box(); vw=page.viewport_size['width']
    if box and box['x']+box['width']>vw+2:fail.append('profile rank card overflow')
   if page.locator('#rankVal').inner_text().strip()!='STARTER':fail.append('profile rank binding incorrect at 0 XP')
   if page.locator('#rankTier').inner_text().strip()!='Tier I':fail.append('profile tier binding missing')
   # STARTER ends at level 3; account for the daily-login XP awarded on page load.
   expected_rank_xp=page.evaluate("Math.max(0,window.NEXZOLevelSystem.xpGoals[3]-window.NEXZOProfileAuthority.stats().xp).toLocaleString('en-IN')+' XP'")
   actual_rank_xp=page.locator('#rankXpLeft').inner_text().strip()
   if actual_rank_xp!=expected_rank_xp:fail.append(f'profile XP-left binding: expected {expected_rank_xp}, got {actual_rank_xp}')
   if page.locator('#track .nexzo-badge-img').count()!=10:fail.append('profile journey must use one image badge engine')
   if page.locator('#track .badge').count():fail.append('legacy profile badge renderer still active')
   if errors:fail.append(f'profile runtime errors: {errors[:2]}')
   if page.locator('#editBtn').count() and not page.locator('#editModal').is_visible():
    page.locator('#editBtn').click();page.wait_for_timeout(100)
    if not page.locator('#editModal').is_visible():fail.append('profile edit modal did not open')
    if page.locator('#closeEdit').count():page.locator('#closeEdit').click()
  if page.locator('main,.main').count():
   box=page.locator('main,.main').first.bounding_box()
   if box and box['width']<520:fail.append(f"compressed {name}")
 # Real public interactions on production build
 page.goto(f"http://127.0.0.1:{PORT}/academics.html",wait_until="networkidle")
 if page.locator('#curriculumGrid .nx-subject-card').count()<100:fail.append('academics curriculum missing')
 if page.locator('[data-acad-tab="catalog"]').count()!=1:fail.append('academics catalog tab missing')
 if page.locator('#manageCurriculumBtn').count()!=1:fail.append('academics subject manager missing')
 page.locator('#manageCurriculumBtn').click();page.wait_for_timeout(100)
 if not page.locator('#curriculumManager').is_visible():fail.append('academics subject manager did not open')
 page.goto(f"http://127.0.0.1:{PORT}/career.html",wait_until="networkidle")
 if page.locator('[data-career-role]').count()!=12:fail.append('career must expose 12 CSE paths')
 page.locator('[data-career-role]').nth(1).click()
 page.locator('[data-career-tab=roadmap]').click();page.wait_for_timeout(100)
 if page.locator('[data-add-step]').count()<1:fail.append('career roadmap planner actions missing')
 page.goto(f"http://127.0.0.1:{PORT}/Home.html",wait_until="networkidle")
 if page.locator('#nxShellTopbar').count()!=1:fail.append('home topbar missing')
 # fail-closed without bypass
 for name in PROTECTED:
  page.goto(f"http://127.0.0.1:{PORT}/{name}",wait_until="domcontentloaded")
  try:page.wait_for_url("**/login.html**",timeout=6000)
  except Exception:
   if not page.locator('[data-auth-error],.auth-error').count():fail.append(f"auth fail-open {name}")
 b.close()
 if fail:
  (RESULTS/"failures.txt").write_text("\n".join(fail),encoding="utf-8")
  try:page.screenshot(path=str(RESULTS/"last-page.png"),full_page=True)
  except Exception:pass
  raise SystemExit("E2E failed:\n- "+"\n- ".join(fail))
 print("V16 production browser workflows passed")
