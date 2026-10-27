from pathlib import Path
import re, tinycss2
ROOT=Path(__file__).resolve().parents[1]
CSS=ROOT/'Frontend/css/style.css'
CORPUS='\n'.join(p.read_text(encoding='utf-8',errors='ignore') for p in list((ROOT/'Frontend').glob('*.html'))+list((ROOT/'Frontend/js').glob('*.js')))
KEEP_PREFIX=('nx-','nexzo-','firebaseui-')
GLOBAL_RE=re.compile(r'(^|[\s>+~,(])(?:html|body|:root|\*|main|header|footer|section|article|aside|nav|button|input|select|textarea|a|img|svg|dialog)(?:$|[\s>+~.#:\[,])',re.I)
TOKEN_RE=re.compile(r'([.#])(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)')

def used_selector(sel:str)->bool:
    sel=sel.strip()
    if not sel:return False
    if GLOBAL_RE.search(sel):return True
    toks=TOKEN_RE.findall(sel)
    if not toks:return True
    for kind,tok in toks:
        if tok.startswith(KEEP_PREFIX):
            if tok in CORPUS:return True
        elif re.search(r'(?<![\w-])'+re.escape(tok)+r'(?![\w-])',CORPUS):return True
    return False

def split_selectors(text):
    out=[];buf='';depth=0
    for ch in text:
        if ch in '([':depth+=1
        elif ch in ')]':depth=max(0,depth-1)
        if ch==',' and depth==0:out.append(buf);buf=''
        else:buf+=ch
    if buf.strip():out.append(buf)
    return out

def clean_rules(rules):
    out=[];seen=set()
    for rule in rules:
        if rule.type=='qualified-rule':
            pre=tinycss2.serialize(rule.prelude).strip()
            sels=[s.strip() for s in split_selectors(pre) if used_selector(s)]
            if not sels:continue
            body=tinycss2.serialize(rule.content).strip()
            key=(','.join(sels),re.sub(r'\s+',' ',body))
            if key in seen:continue
            seen.add(key)
            rule.prelude=tinycss2.parse_component_value_list(','.join(sels))
            out.append(rule)
        elif rule.type=='at-rule' and rule.content is not None and rule.lower_at_keyword in {'media','supports','layer','container','document'}:
            nested=tinycss2.parse_rule_list(rule.content,skip_whitespace=False,skip_comments=True)
            cleaned=clean_rules(nested)
            if not any(x.type in {'qualified-rule','at-rule'} for x in cleaned):continue
            rule.content=tinycss2.parse_component_value_list(tinycss2.serialize(cleaned))
            out.append(rule)
        elif rule.type=='at-rule':
            out.append(rule)
        elif rule.type=='whitespace':
            out.append(rule)
    return out

original=CSS.read_text(encoding='utf-8')
rules=tinycss2.parse_stylesheet(original,skip_comments=True,skip_whitespace=False)
cleaned=tinycss2.serialize(clean_rules(rules))
backup=CSS.with_suffix('.legacy.css')
if not backup.exists():backup.write_text(original,encoding='utf-8')
CSS.write_text(cleaned,encoding='utf-8')
print(f'CSS {len(original):,} -> {len(cleaned):,} bytes ({(1-len(cleaned)/len(original))*100:.1f}% removed)')
