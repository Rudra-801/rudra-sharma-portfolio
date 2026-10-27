"""Read-only local browser checks against the user's actual Live Server."""
import json
import sys
import shutil
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'test-results' / 'auth-pet-20260928'
# Live Server watches this project: writing screenshots there during the test
# reloads the page under test. Collect captures outside its watch tree first.
captures = tempfile.TemporaryDirectory(prefix='nexzo-auth-pet-')
OUT = Path(captures.name)
BASE = 'http://127.0.0.1:5500/Frontend'

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='msedge', headless=True)
    for width in ([int(value) for value in sys.argv[1:]] or (1440, 1024, 768, 390)):
        print(f'Checking Live Server at {width}px', flush=True)
        context = browser.new_context(viewport={'width': width, 'height': 900})
        context.add_init_script("localStorage.setItem('nexzo:consent:v1',JSON.stringify({decided:true,necessary:true}))")
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        for name in ('login', 'signup'):
            page.goto(f'{BASE}/{name}.html', wait_until='domcontentloaded')
            page.wait_for_timeout(400)
            assert 'study-group-scene.webp' in page.locator('body').evaluate('(el) => getComputedStyle(el).backgroundImage')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (name, width, 'overflow')
            page.screenshot(path=str(OUT / f'{width}-{name}.png'), full_page=True)
        page.goto(f'{BASE}/ai-assistant.html?e2e=1', wait_until='domcontentloaded')
        page.wait_for_function('window.NEXZOLivingPetV4?.snapshot().model?.skinnedMeshes > 0', timeout=30000)
        model = page.evaluate('window.NEXZOLivingPetV4.snapshot().model')
        assert model['skinnedMeshes'] == 7 and model['bones'] == 14, model
        assert page.locator('#nexzoPetCanvas').count() == 1
        assert page.locator('script[src*="living-pet.js"]').count() == 0
        assert not page.locator('#activePetCreature').is_visible()
        page.evaluate("window.NEXZOLivingPetV4.transition('IDLE',{force:true,duration:0})")
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / f'{width}-nyro.png'))
        page.locator('#nexzoCompanion .pet-stage').click()
        page.locator('#petZoneModal').wait_for(state='visible')
        assert page.locator('#petZoneModal #nexzoPetCanvas').count() == 1
        print('Pet Zone opened; checking preview', flush=True)
        page.screenshot(path=str(OUT / f'{width}-pet-zone.png'), animations='disabled', timeout=10000)
        page.locator('#petZoneClose').click()
        page.locator('#petZoneModal').wait_for(state='hidden')
        assert page.locator('#nexzoCompanion #nexzoPetCanvas').count() == 1
        page.evaluate("window.dispatchEvent(new CustomEvent('nexzo:assistant-thinking'))")
        assert page.evaluate('window.NEXZOLivingPetV4.snapshot().state') == 'THINKING'
        page.evaluate('window.NEXZOLivingPetV4.setEnabled(false)')
        page.wait_for_timeout(100)
        assert page.locator('#nexzoPetCanvas').count() == 0
        assert not errors, errors
        print(json.dumps({'width': width, 'authBackground': 'PASS', 'pet': model, 'off': 'PASS', 'errors': errors}), flush=True)
        context.close()
    browser.close()
shutil.copytree(OUT, DEST, dirs_exist_ok=True)
captures.cleanup()
