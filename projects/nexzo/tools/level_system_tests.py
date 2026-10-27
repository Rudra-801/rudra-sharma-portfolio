from pathlib import Path
import re
text=(Path(__file__).resolve().parents[1]/'Frontend/js/level-system.js').read_text()
match=re.search(r'const xpGoals=Object\.freeze\(\[([^\]]+)\]\)',text)
assert match,'level threshold table missing'
values=[int(x.strip()) for x in match.group(1).split(',') if x.strip()]
assert len(values)==50, f'expected 50 thresholds, got {len(values)}'
def level(xp):
    result=1
    for i,start in enumerate(values,1):
        if xp>=start: result=i
        else: break
    return result
cases={0:1,99:1,100:2,249:2,250:3,1125:6,1171:6,1499:6,1500:7,6800:11}
for xp,expected in cases.items():
    actual=level(xp)
    assert actual==expected,f'{xp} XP => level {actual}, expected {expected}'
print(f'Canonical level boundary tests passed: {len(cases)}/{len(cases)}')
