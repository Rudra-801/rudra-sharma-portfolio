const UA='Mozilla/5.0 (compatible; NEXZO-CampusDiscovery/2.0; +https://personalized-recommendersystem.web.app)';
const OFFICIAL={
'Manav Rachna International Institute of Research and Studies (MRIIRS)':'https://manavrachna.edu.in/mriirs',
'Manav Rachna University (MRU)':'https://manavrachna.edu.in/mru'
};
const SPECIAL={'Manav Rachna International Institute of Research and Studies (MRIIRS)':['https://manavrachna.edu.in/happening/events','https://manavrachna.edu.in/mriirs/life/dsw'],'Manav Rachna University (MRU)':['https://manavrachna.edu.in/mru/life/events','https://manavrachna.edu.in/mru/life/dsw','https://manavrachna.edu.in/mru/school-of-engineering/department-of-computer-science-technology/life/technical-clubs','https://manavrachna.edu.in/mru/research/research-cluster']};
const KEY=/(event|events|hackathon|hack|workshop|club|clubs|societ|student.?life|campus.?life|fest|festival|competition|contest|conference|seminar|webinar|activities|activity|news|notice)/i;
const decode=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();
const abs=(href,base)=>{try{return new URL(href,base).toString()}catch{return ''}};
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return ''}};
const typeOf=s=>/hackathon|hack\b|hackmor/i.test(s)?'Hackathon':/workshop|bootcamp|training|fdp|seminar|webinar/i.test(s)?'Workshop':/club|societ|chapter|student body|council/i.test(s)?'Club':'Event';
function dateFrom(s){const a=String(s);let m=a.match(/\b(\d{1,2})[.\-/\s](Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\-/\s,]*(20\d{2}|\d{2})\b/i)||a.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i);if(!m)return '';let d,mon,y;if(/^\d/.test(m[1])){d=+m[1];mon=m[2];y=m[3]}else{mon=m[1];d=+m[2];y=m[3]}if(String(y).length===2)y=2000+Number(y);const mi=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(String(mon).slice(0,3).toLowerCase());return mi<0?'':`${y}-${String(mi+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function useful(t){return t.length>=5&&t.length<=190&&!/^(home|about|admission|contact|read more|click here|view all|next|previous|apply now|login|menu)$/i.test(t)&&KEY.test(t)}
async function fetchPage(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),9000);try{const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html,application/xhtml+xml'},redirect:'follow',signal:c.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);const ct=r.headers.get('content-type')||'';if(!ct.includes('text/html'))throw new Error('Not HTML');return {url:r.url,html:(await r.text()).slice(0,1600000)}}finally{clearTimeout(t)}}
function links(page,root){const out=[],re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;const h=host(root);while((m=re.exec(page.html))){const title=decode(m[2]),u=abs(m[1],page.url);if(u&&officialUrl(u,root)&&KEY.test(`${title} ${u}`)&&!out.includes(u))out.push(u)}return out.slice(0,8)}
function extract(page,sourceName,root){const out=[],re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(page.html))){const title=decode(m[2]);if(!useful(title))continue;const around=decode(page.html.slice(Math.max(0,m.index-300),Math.min(page.html.length,re.lastIndex+360))),url=abs(m[1],page.url);if(!url||!officialUrl(url,root))continue;out.push({type:typeOf(`${title} ${around}`),title,date:dateFrom(around)||dateFrom(title),description:around.slice(0,300),tags:[typeOf(`${title} ${around}`)],sourceName,sourceUrl:url,status:'current'})}return out}
function jsonLdEvents(page,sourceName,root){const out=[],re=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m;while((m=re.exec(page.html))){try{const raw=JSON.parse(m[1]),stack=Array.isArray(raw)?raw:[raw];for(const top of stack){const nodes=top?.['@graph']||[top];for(const x of nodes){const types=[].concat(x?.['@type']||[]).map(String);if(!types.some(t=>/event/i.test(t)))continue;const title=decode(x.name||'');if(!title)continue;const date=String(x.startDate||'').slice(0,10);const u=typeof x.url==='string'?x.url:(typeof x.mainEntityOfPage==='string'?x.mainEntityOfPage:page.url);const sourceUrl=abs(u,page.url);if(!sourceUrl||!officialUrl(sourceUrl,root))continue;out.push({type:typeOf(`${title} ${decode(x.description||'')}`),title,date:/^20\d\d-\d\d-\d\d$/.test(date)?date:'',description:decode(x.description||'').slice(0,300),tags:[typeOf(title)],sourceName,sourceUrl,status:'current'})}}}catch{}}return out}
async function sitemapLinks(root){const candidates=['/sitemap.xml','/sitemap_index.xml'],out=[];for(const path of candidates){try{const u=new URL(path,root).toString(),c=new AbortController(),t=setTimeout(()=>c.abort(),6500);try{const r=await fetch(u,{headers:{'User-Agent':UA},signal:c.signal});if(!r.ok)continue;const xml=(await r.text()).slice(0,2500000),loc=[...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(x=>x[1].replace(/&amp;/g,'&'));for(const x of loc){if(officialUrl(x,root)&&KEY.test(x)&&!out.includes(x))out.push(x)}}finally{clearTimeout(t)}}catch{}}return out.slice(0,12)}
function dedupe(rows){const seen=new Set(),now=Date.now();return rows.filter(x=>{const k=x.title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();if(seen.has(k))return false;seen.add(k);if(x.date&&x.type!=='Club'&&new Date(x.date+'T23:59:59').getTime()<now-21*86400000)return false;return true}).slice(0,36)}
const BRANCH_TERMS={
'CSE':['computer science','cse','coding','programming','software','developer','algorithm','web development','app development'],
'ARTIFICIAL INTELLIGENCE':['artificial intelligence','machine learning','deep learning','generative ai','data science','computer vision','nlp','prompt'],
'DATA SCIENCE':['data science','analytics','data analytics','machine learning','statistics'],
'CYBER SECURITY':['cyber security','cybersecurity','infosec','ctf','ethical hacking','digital forensics'],
'INFORMATION TECHNOLOGY':['information technology','software','coding','cloud','network','devops'],
'ECE':['electronics','ece','vlsi','embedded','semiconductor','communication','signal'],
'ELECTRICAL':['electrical','power','energy','circuit','ev','renewable'],
'MECHANICAL':['mechanical','automotive','manufacturing','cad','cam','robotics','thermal','sae'],
'CIVIL':['civil','construction','structure','infrastructure','survey','architecture'],
'CHEMICAL':['chemical','process','materials','polymer'],
'BIOTECH':['biotech','bioengineering','biology','life science','biomedical'],
'ROBOTICS':['robot','robotics','automation','mechatronics','embedded'],
'ARCHITECTURE':['architecture','urban','planning','design'],
'DESIGN':['design','creative','ui','ux','product design'],
'MANAGEMENT':['business','management','entrepreneur','startup','finance','marketing'],
'LAW':['law','legal','moot','advocacy'],
'PHARMACY':['pharmacy','pharma','drug','clinical'],
'JOURNALISM':['media','journalism','mass communication','film']};
function branchTerms(branch){const b=String(branch||'').toUpperCase();if(!b||b==='ALL')return [];const out=[];for(const [k,v] of Object.entries(BRANCH_TERMS))if(b.includes(k))out.push(...v);return [...new Set([...out,...String(branch).toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>3)])]}
function relevance(row,terms){if(!terms.length)return 0;const hay=`${row.title} ${row.description} ${(row.tags||[]).join(' ')} ${row.sourceName}`.toLowerCase();return terms.reduce((n,t)=>n+(hay.includes(t)?2:0),0)}
function categoryPaths(category,terms){
 const paths=['/events','/news','/student-life','/campus-life','/activities'];
 if(category==='Hackathon')paths.unshift('/hackathons','/hackathon','/innovation','/competitions','/entrepreneurship');
 if(category==='Workshop')paths.unshift('/workshops','/seminars','/training','/conferences');
 if(category==='Club')paths.unshift('/clubs','/technical-clubs','/student-clubs','/societies','/student-activities');
 if(category==='Event')paths.unshift('/events','/calendar');
 for(const t of terms.slice(0,3))paths.push(`/search?q=${encodeURIComponent(t)}`);
 return [...new Set(paths)]
}
function siteDomain(root){
 try{const h=new URL(root).hostname.replace(/^www\./,'').toLowerCase(),a=h.split('.');if(h.endsWith('.ac.in')||h.endsWith('.edu.in')||h.endsWith('.ernet.in'))return a.slice(-3).join('.');return a.slice(-2).join('.')}catch{return ''}
}
function officialUrl(u,root){try{const h=new URL(u).hostname.replace(/^www\./,'').toLowerCase(),d=siteDomain(root);return !!d&&(h===d||h.endsWith('.'+d))}catch{return false}}
async function webDiscover(root,name,branch,category){
 const domain=siteDomain(root);if(!domain)return [];
 const kind=category==='All'?'events hackathons workshops clubs':category.toLowerCase();
 const branchPart=branch&&branch!=='All'?` "${branch}"`:'';
 const queries=[`site:${domain}${branchPart} ${kind}`,`site:${domain} ${kind} students`];
 const out=[];
 for(const q of queries){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),7000);
  try{const r=await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,{headers:{'User-Agent':UA,'Accept':'text/html'},signal:c.signal});if(!r.ok)continue;const html=(await r.text()).slice(0,900000);for(const m of html.matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["']/gi)){let u=m[1].replace(/&amp;/g,'&');try{const x=new URL(u,'https://duckduckgo.com');const red=x.searchParams.get('uddg');if(red)u=decodeURIComponent(red)}catch{}if(officialUrl(u,root)&&!out.includes(u))out.push(u)}}catch{}finally{clearTimeout(t)}
 }
 return out.slice(0,10)
}

export async function liveCampus(college,context={}){
 const root=OFFICIAL[college];
 if(!root)return {items:[],sourcesChecked:[],coverage:'manual-unconfigured',message:'This college does not have a verified official domain in NEXZO yet.'};
 const name=college.replace(/\s*\([^)]*\)\s*/g,' ').trim(),checked=[];
 const program=String(context.program||'All'),branch=String(context.branch||'All'),category=String(context.category||'All');
 const terms=branchTerms(branch);
 // Keep live discovery bounded and deterministic: fetch the official university root,
 // known official campus hubs, and category/branch-specific official paths in parallel.
 // This avoids slow third-party search/sitemap crawls blocking the UI while still
 // returning data read from the university's public site on this request.
 const urls=[root,...(SPECIAL[college]||[])];
 for(const path of categoryPaths(category,terms)){
  try{urls.push(new URL(path,root).toString())}catch{}
 }
 const unique=[...new Set(urls)].filter(u=>officialUrl(u,root)).slice(0,18);
 const settled=await Promise.allSettled(unique.map(fetchPage));
 const pages=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
 pages.forEach(p=>checked.push(p.url));
 let rows=dedupe(pages.flatMap(p=>[...jsonLdEvents(p,name,root),...extract(p,name,root)]));
 if(category!=='All')rows=rows.filter(x=>x.type===category);
 rows=rows.map(x=>{const score=relevance(x,terms);return {...x,relevanceScore:score,branchMatch:terms.length?score>0:false}});
 if(terms.length){rows=(context.strictBranch?rows.filter(x=>x.branchMatch):rows).sort((a,b)=>(b.branchMatch-a.branchMatch)||(b.relevanceScore-a.relevanceScore)).slice(0,36)}
 return {items:rows,selectedProgram:program,selectedBranch:branch,selectedCategory:category,sourcesChecked:[...new Set(checked)],officialDomain:root,coverage:'official-domain-live',refreshedAt:new Date().toISOString(),message:rows.length?`${rows.length} current ${category==='All'?'campus':category.toLowerCase()} items found from ${name} official public sources${branch==='All'?'.':`; ${rows.filter(x=>x.branchMatch).length} directly match ${branch}.`}`:`${name} official public sources were checked live, but no current ${category==='All'?'campus':category.toLowerCase()} items could be extracted.`}
}
