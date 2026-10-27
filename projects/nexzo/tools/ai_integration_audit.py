from pathlib import Path
root=Path(__file__).resolve().parents[1]
html=(root/'Frontend/ai-assistant.html').read_text(encoding='utf-8')
css=(root/'Frontend/css/ai-assistant-v81.css').read_text(encoding='utf-8')
js=(root/'Frontend/js/ai-assistant-v81-runtime.js').read_text(encoding='utf-8')
checks={
 'body scope': 'ai-page-v76' in html,
 'css scope': '.ai-page-v76' in css and 'ai-page-v71' not in css,
 'runtime scope': "contains('ai-page-v76')" in js and 'ai-page-v71' not in js,
 'single history ui': html.count('ai-history-drawer')==1 and 'id="sessionsModal"' not in html,
 'overlay nav': 'ai-site-drawer' in html and 'aiNavToggle' in html,
 'composer': 'composerPlusMenu' in html and 'userInput' in html,
 'compact shell': 'ai-chat-state-hooks' in html and 'ai-mode-pill' not in html,
 'compact composer': 'min-height:28px' in css and 'Math.max(28' in js,
 'secure api': 'GEMINI_API_KEY' not in html,
}
failed=[k for k,v in checks.items() if not v]
for k,v in checks.items(): print(f"{'PASS' if v else 'FAIL'}: {k}")
raise SystemExit(1 if failed else 0)
