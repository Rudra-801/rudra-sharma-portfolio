import subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
commands=[
 [sys.executable,"tools/build_assets.py"],
 [sys.executable,"tools/validate.py"],
 [sys.executable,"tools/production_audit.py"],
 [sys.executable,"tools/maintainability_audit.py"],
 ["node","--check","Backend/src/app.js"],
 ["node","--check","Backend/src/server.js"],
]
for command in commands:
    print("+", " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)
print("Core quality checks passed")
