from pathlib import Path
import sys
R=Path(__file__).resolve().parents[1]
checks={
 'agent registry':(R/'Backend/src/agents/agent-registry.js').exists(),
 'orchestrator':(R/'Backend/src/agents/orchestrator.js').exists(),
 'stream endpoint':'/multi-agent/stream' in (R/'Backend/src/routes/ai.routes.js').read_text(),
 'parallel specialists':'Promise.all' in (R/'Backend/src/agents/orchestrator.js').read_text(),
 'validation loop':'validateResults' in (R/'Backend/src/agents/orchestrator.js').read_text(),
 'agent failure fallback':'if(!results.length)' in (R/'Backend/src/agents/orchestrator.js').read_text(),
 'frontend multi-agent stream':'multiAgentStream' in (R/'Frontend/js/ai-service.js').read_text(),
 'agent route UI':'agent-route' in (R/'Frontend/js/ai-assistant-controller.js').read_text(),
 'Academics not linked to agent scripts':'multi-agent' not in (R/'Frontend/academics.html').read_text(),
}
for k,v in checks.items():print(('PASS' if v else 'FAIL'),k)
if not all(checks.values()):sys.exit(1)
print(f'Multi-agent audit passed: {sum(checks.values())}/{len(checks)}')
