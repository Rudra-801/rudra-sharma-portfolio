const http=require('http'),fs=require('fs'),path=require('path'),url=require('url');
const ROOT=path.resolve(__dirname,'..'),DATA=path.join(__dirname,'data','store.json'),PORT=process.env.PORT||5500;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.txt':'text/plain'};
const projects=[
 {id:'nexzo',name:'NEXZO V170',stack:['Firebase','Firestore','Node.js','Express','AI'],type:'flagship'},
 {id:'insighthub',name:'InsightHub',stack:['Node.js','Express','MongoDB'],type:'fullstack'},
 {id:'pulsechat',name:'PulseChat',stack:['Socket.io','Node.js','Express'],type:'fullstack'},
 {id:'cartforge',name:'CartForge',stack:['Node.js','Express','Catalog API'],type:'fullstack'},
 {id:'quizops',name:'QuizOps',stack:['Node.js','MySQL','Validation'],type:'backend'},
 {id:'taskflow',name:'TaskFlow Pro',stack:['CRUD','REST','Persistence'],type:'fullstack'},
 {id:'studenthub',name:'StudentHub',stack:['Node.js','MySQL-ready','CRUD'],type:'backend'},
 {id:'expenseflow',name:'ExpenseFlow',stack:['CRUD','Aggregation','Analytics'],type:'fullstack'}
];
const productSeed=[{id:1,name:'Mechanical Pro 75',cat:'Accessories',price:5999},{id:2,name:'Precision Wireless Mouse',cat:'Accessories',price:2899},{id:3,name:'USB-C 9-in-1 Hub',cat:'Workspace',price:3499},{id:4,name:'27-inch QHD Display',cat:'Displays',price:21999},{id:5,name:'Aluminium Laptop Stand',cat:'Workspace',price:2199},{id:6,name:'4K Creator Webcam',cat:'Workspace',price:5499},{id:7,name:'NVMe SSD 1TB',cat:'Storage',price:7499},{id:8,name:'NVMe Toolless Enclosure',cat:'Storage',price:2799}];
const quizSeed=[{id:1,q:'Which HTTP method is typically idempotent for full updates?',options:['POST','PUT','PATCH','CONNECT'],answer:1},{id:2,q:'Which SQL normal form removes partial dependency on a composite key?',options:['1NF','2NF','3NF','BCNF'],answer:1},{id:3,q:'What should controllers primarily do in layered architecture?',options:['Render CSS','Coordinate request/response flow','Store database files','Compile JavaScript'],answer:1}];
function readStore(){try{const s=JSON.parse(fs.readFileSync(DATA,'utf8'));s.contacts??=[];s.states??={};s.orders??=[];s.quizAttempts??=[];return s}catch{return{contacts:[],states:{},orders:[],quizAttempts:[]}}}
function writeStore(s){fs.mkdirSync(path.dirname(DATA),{recursive:true});fs.writeFileSync(DATA,JSON.stringify(s,null,2))}
function send(res,code,data,type='application/json'){res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'});res.end(type.includes('json')?JSON.stringify(data):data)}
function body(req){return new Promise((ok,no)=>{let b='';req.on('data',d=>{b+=d;if(b.length>1e6){no(new Error('Payload too large'));req.destroy()}});req.on('end',()=>{try{ok(b?JSON.parse(b):{})}catch(e){no(new Error('Invalid JSON body'))}})})}
function stateValue(s,key,fallback){return s.states?.[key]??fallback}
const server=http.createServer(async(req,res)=>{try{const parsed=new URL(req.url,'http://localhost'),u={pathname:parsed.pathname,query:Object.fromEntries(parsed.searchParams)},p=decodeURIComponent(u.pathname);
 if(req.method==='OPTIONS')return send(res,204,'','text/plain');
 if(p==='/api/health')return send(res,200,{ok:true,service:'Rudra Portfolio V4 API',runtime:process.version,uptimeSeconds:Math.round(process.uptime()),time:new Date().toISOString(),persistence:'backend/data/store.json'});
 if(p==='/api/projects')return send(res,200,{ok:true,count:projects.length,projects});
 if(p==='/api/contact'&&req.method==='POST'){const d=await body(req);if(!d.name||String(d.name).trim().length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email||'')||String(d.message||'').trim().length<10)return send(res,400,{error:'Valid name, email and message (10+ characters) are required.'});const s=readStore(),row={id:Date.now(),name:String(d.name).trim(),email:String(d.email).trim(),message:String(d.message).trim(),createdAt:new Date().toISOString()};s.contacts.unshift(row);writeStore(s);return send(res,201,{ok:true,message:'Message validated and stored by the Node backend.',id:row.id});}
 if(p.startsWith('/api/state/')){const key=p.split('/').pop(),s=readStore();if(req.method==='GET')return send(res,200,{ok:true,key,state:s.states[key]??null,updatedAt:s.states[key+'UpdatedAt']??null});if(req.method==='POST'){const d=await body(req);s.states[key]=d.state??d;s.states[key+'UpdatedAt']=new Date().toISOString();writeStore(s);return send(res,200,{ok:true,key,saved:true,updatedAt:s.states[key+'UpdatedAt']});}}
 // PulseChat resource API
 if(p==='/api/pulsechat/rooms'&&req.method==='GET'){const s=readStore(),state=stateValue(s,'pulsechat',{rooms:{general:[],engineering:[],frontend:[],random:[]},current:'general'});return send(res,200,{ok:true,current:state.current||'general',rooms:Object.keys(state.rooms||{}).map(name=>({name,messageCount:(state.rooms[name]||[]).length}))});}
 if(p.match(/^\/api\/pulsechat\/rooms\/[^/]+\/messages$/)&&req.method==='POST'){const room=p.split('/')[4],d=await body(req);if(!String(d.text||'').trim())return send(res,400,{error:'Message text is required.'});const s=readStore(),state=stateValue(s,'pulsechat',{rooms:{},current:room});state.rooms??={};state.rooms[room]??=[];const row={u:d.user||'Rudra Sharma',t:String(d.text).trim(),at:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),r:'♡ React'};state.rooms[room].push(row);s.states.pulsechat=state;s.states.pulsechatUpdatedAt=new Date().toISOString();writeStore(s);return send(res,201,{ok:true,message:row});}
 // CartForge resource API
 if(p==='/api/cartforge/products'&&req.method==='GET'){let list=productSeed;const q=String(u.query.q||'').toLowerCase(),cat=String(u.query.category||'');if(q)list=list.filter(x=>x.name.toLowerCase().includes(q));if(cat)list=list.filter(x=>x.cat===cat);return send(res,200,{ok:true,count:list.length,products:list});}
 if(p==='/api/cartforge/orders'&&req.method==='POST'){const d=await body(req);if(!d.items||typeof d.items!=='object'||!Object.keys(d.items).length)return send(res,400,{error:'Order requires at least one cart item.'});const s=readStore(),order={id:'CF-'+Math.random().toString(36).slice(2,8).toUpperCase(),items:d.items,createdAt:new Date().toISOString(),status:'created'};s.orders.unshift(order);writeStore(s);return send(res,201,{ok:true,order});}
 // QuizOps resource API
 if(p==='/api/quizops/questions'&&req.method==='GET'){return send(res,200,{ok:true,count:quizSeed.length,questions:quizSeed.map(({answer,...q})=>q)});}
 if(p==='/api/quizops/attempts'&&req.method==='POST'){const d=await body(req);const s=readStore(),attempt={id:Date.now(),score:Number(d.score)||0,total:Number(d.total)||0,createdAt:new Date().toISOString()};s.quizAttempts.unshift(attempt);writeStore(s);return send(res,201,{ok:true,attempt});}
 // Current persisted demo resources
 if(p==='/api/taskflow/tasks'&&req.method==='GET'){const s=readStore();return send(res,200,{ok:true,tasks:stateValue(s,'taskflow',[])});}
 if(p==='/api/studenthub/students'&&req.method==='GET'){const s=readStore();return send(res,200,{ok:true,students:stateValue(s,'studenthub',[])});}
 if(p==='/api/expenseflow/transactions'&&req.method==='GET'){const s=readStore();return send(res,200,{ok:true,transactions:stateValue(s,'expenseflow',[])});}
 // Static files
 let rel=p==='/'?'index.html':p.replace(/^\//,'');let file=path.normalize(path.join(ROOT,rel));if(!file.startsWith(ROOT))return send(res,403,'Forbidden','text/plain');if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))return send(res,404,'Not found','text/plain');const ext=path.extname(file).toLowerCase();res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-store':'public, max-age=3600'});fs.createReadStream(file).pipe(res);
 }catch(e){send(res,500,{error:e.message})}});
if(require.main===module)server.listen(PORT,()=>console.log(`\nRudra Portfolio Ultimate + API\nhttp://127.0.0.1:${PORT}\n`));

module.exports=server;


