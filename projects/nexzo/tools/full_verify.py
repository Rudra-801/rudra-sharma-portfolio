from pathlib import Path
import subprocess, sys, shutil
ROOT=Path(__file__).resolve().parents[1]
commands=[
 ('Home trajectory behaviour',['node','--test','tools/home_trajectory_tests.mjs']),
 ('Assistant client behaviour',['node','--test','tools/assistant_client_tests.mjs']),
 ('Assistant history isolation',['node','--test','tools/assistant_history_tests.mjs']),
 ('Persistence confirmation',['node','--test','tools/persistence_confirmation_tests.mjs']),
 ('Academic workflow client behaviour',['node','--test','tools/academic_workflow_client_tests.mjs']),
 ('Planner behavioural regression',['node','--test','tools/planner_regression_tests.mjs']),
 ('Planner demo reliability',['node','--test','tools/planner_demo_tests.mjs']),
 ('Planner evaluation reliability',['node','--test','tools/planner_v184_reliability_tests.mjs']),
 ('Curated academic examples',['python3','tools/academic_content_execution_tests.py']),
 ('Production build behaviour',['python3','tools/release_build_tests.py']),
 ('Academics curriculum',['node','tools/academics_v235_tests.mjs']),
 ('Academics subject save v242',['node','tools/academics_subject_save_v242_tests.mjs']),
 ('Career Explorer v242',['node','tools/phase7_career_tests.mjs']),
 ('V250 release contracts',['node','tools/v250_release_contracts.mjs']),
 ('Workflow safety',['node','tools/workflow_tests.mjs']),
 ('Core frontend tests',['node','tools/core_unit_tests.mjs']),
 ('Community quality',['node','tools/community_quality_tests.mjs']),
 ('Community Phase 2',['node','tools/community_phase2_tests.mjs']),
 ('Firestore rules',['python3','tools/firestore_rules_contract_test.py']),
 ('Project validation',['python3','tools/validate.py']),
 ('Maintainability',['python3','tools/maintainability_audit.py']),
 ('Backend syntax',['npm','--prefix','Backend','run','check']),
 ('Backend tests',['npm','--prefix','Backend','test']),
]
failed=[]
for name,cmd in commands:
    print(f'\n=== {name} ===',flush=True)
    cmd = list(cmd)
    cmd[0] = sys.executable if cmd[0] == 'python3' else (shutil.which(cmd[0]) or cmd[0])
    try:
        result=subprocess.run(cmd,cwd=ROOT)
    except OSError as exc:
        print(f'Unable to run {name}: {exc}', flush=True)
        failed.append(name)
        continue
    if result.returncode: failed.append(name)
if failed:
    print('\nFAILED:',', '.join(failed)); sys.exit(1)
print(f'\nFULL VERIFY PASSED: {len(commands)}/{len(commands)} suites')
