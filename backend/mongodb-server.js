require('dotenv').config({path:require('path').join(__dirname,'.env')});
const express=require('express');
const mongoose=require('mongoose');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const path=require('path');
const Contact=require('./src/models/Contact');
const app=express();
const ROOT=path.resolve(__dirname,'..');
const PORT=Number(process.env.PORT||5500);
const projects=[
 {id:'nexzo',name:'NEXZO 7.4',type:'flagship',stack:['Firebase','Firestore','JavaScript','AI']},
 {id:'gamepro',name:'GamePro',type:'interactive',stack:['HTML','CSS','JavaScript','Game Logic']},
 {id:'insighthub',name:'InsightHub',type:'fullstack',stack:['Node.js','Express','MongoDB','JWT']},
 {id:'codecollab',name:'CodeCollab',type:'in-development',stack:['React','Node.js','Socket.IO','MongoDB']}
];
app.set('trust proxy',1);app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'100kb'}));
app.use('/api',rateLimit({windowMs:15*60*1000,limit:150,standardHeaders:true,legacyHeaders:false}));
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'Rudra Sharma Portfolio API',database:mongoose.connection.readyState===1?'connected':'disconnected',time:new Date().toISOString()}));
app.get('/api/projects',(_req,res)=>res.json({ok:true,count:projects.length,projects}));
app.post('/api/contact',async(req,res,next)=>{try{const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),message=String(req.body.message||'').trim();if(name.length<2||name.length>80||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||message.length<10||message.length>3000)return res.status(400).json({error:'Enter a valid name, email and message (10–3000 characters).'});const row=await Contact.create({name,email,message});res.status(201).json({ok:true,message:'Message stored securely in MongoDB.',id:row._id});}catch(e){next(e)}});
app.use(express.static(ROOT,{index:'index.html'}));
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Internal server error'})});
async function start(){if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env and configure MongoDB.');await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});console.log('MongoDB connected');app.listen(PORT,()=>console.log(`Portfolio: http://127.0.0.1:${PORT}`));}
start().catch(e=>{console.error('Startup failed:',e.message);process.exit(1)});
