import pathlib, tempfile, shutil, subprocess, sys, unittest, json

ROOT = pathlib.Path(__file__).resolve().parents[1]

class ProductionCssTests(unittest.TestCase):
    def fixture(self, root):
        (root/'tools').mkdir()
        shutil.copy2(ROOT/'tools/build_production.py', root/'tools/build_production.py')
        (root/'Frontend/css/dist').mkdir(parents=True)
        (root/'Frontend/js').mkdir()
        (root/'Frontend/data').mkdir()
        (root/'Backend/src/services').mkdir(parents=True)
        shutil.copy2(ROOT/'Frontend/data/mriirs-cse-2023-27.json', root/'Frontend/data/mriirs-cse-2023-27.json')
        for name in ['academic-notes','level-system']:
            shutil.copy2(ROOT/f'Frontend/js/{name}.js', root/f'Frontend/js/{name}.js')
        (root/'Frontend/css/style.css').write_text('/* WRONG SUBSTITUTE */')
        (root/'Frontend/css/dist/style.abc.css').write_text('.source{color:gold}')
        (root/'Frontend/css/dist/runtime.abc.css').write_text('.runtime{display:grid}')
        (root/'Frontend/Home.html').write_text('<link rel="stylesheet" href="css/dist/style.abc.css"><link rel="stylesheet" href="css/dist/runtime.abc.css">')
        (root/'Frontend/service-worker.js').write_text('const cache="__CACHE_NAME__";const files=__PRECACHE__;')

    def test_exact_declared_css_and_order(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder); self.fixture(root)
            result=subprocess.run([sys.executable,str(root/'tools/build_production.py')],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            manifest=json.loads((root/'dist/asset-manifest.json').read_text())
            bundle=(root/'dist'/manifest['pageBundles']['Home.html']).read_text()
            self.assertNotIn('WRONG SUBSTITUTE',bundle)
            self.assertLess(bundle.index('.source'),bundle.index('.runtime'))

    def test_missing_declared_css_is_build_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder); self.fixture(root)
            (root/'Frontend/css/dist/runtime.abc.css').unlink()
            result=subprocess.run([sys.executable,str(root/'tools/build_production.py')],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('Missing or invalid stylesheet',result.stderr)

if __name__=='__main__': unittest.main()
