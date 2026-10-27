import zlib from 'node:zlib';

function readUInt16(buf,off){return buf.readUInt16LE(off)}
function readUInt32(buf,off){return buf.readUInt32LE(off)}
function decodeEntities(s=''){return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'")}
function xmlText(xml=''){
  return decodeEntities(String(xml).replace(/<w:tab\/?\s*>/g,'\t').replace(/<w:br\/?\s*>/g,'\n').replace(/<a:br\/?\s*>/g,'\n').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
}
function unzipEntries(buf){
  const out=[];let pos=0;
  while(pos+30<=buf.length){
    const sig=readUInt32(buf,pos);if(sig!==0x04034b50)break;
    const flags=readUInt16(buf,pos+6),method=readUInt16(buf,pos+8),compSize=readUInt32(buf,pos+18),nameLen=readUInt16(buf,pos+26),extraLen=readUInt16(buf,pos+28);
    const name=buf.subarray(pos+30,pos+30+nameLen).toString('utf8');const start=pos+30+nameLen+extraLen;
    if(flags&0x08)break; // data descriptor archives are uncommon in Office files; fail safely
    const raw=buf.subarray(start,start+compSize);let data=null;
    try{data=method===0?raw:method===8?zlib.inflateRawSync(raw):null}catch{data=null}
    if(data)out.push({name,data});pos=start+compSize;
  }
  return out;
}
export function isOfficeFile(name='',mime=''){return /\.(docx|pptx|xlsx)$/i.test(name)||/officedocument|spreadsheetml|presentationml|wordprocessingml/i.test(mime)}
export function extractOfficeText(buffer,name=''){
  const entries=unzipEntries(buffer);if(!entries.length)return '';
  const lower=String(name).toLowerCase();let wanted=[];
  if(lower.endsWith('.docx'))wanted=entries.filter(e=>/^word\/(document|header\d*|footer\d*)\.xml$/i.test(e.name));
  else if(lower.endsWith('.pptx'))wanted=entries.filter(e=>/^ppt\/slides\/slide\d+\.xml$/i.test(e.name));
  else if(lower.endsWith('.xlsx'))wanted=entries.filter(e=>/^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(e.name));
  else wanted=entries.filter(e=>/\.(xml)$/i.test(e.name)).slice(0,30);
  return wanted.map(e=>`--- ${e.name} ---\n${xmlText(e.data.toString('utf8'))}`).join('\n\n').slice(0,500000);
}
