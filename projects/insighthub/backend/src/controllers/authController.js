import fs from 'fs/promises';
import path from 'path';
import {fileURLToPath} from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {ApiError} from '../utils/apiError.js';
import {asyncHandler} from '../utils/asyncHandler.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.resolve(here,'../../data');
const usersFile=path.join(dataDir,'users.json');
const publicUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role,avatar:u.avatar||''});
async function readUsers(){try{return JSON.parse(await fs.readFile(usersFile,'utf8'))}catch{return []}}
async function writeUsers(users){await fs.mkdir(dataDir,{recursive:true});await fs.writeFile(usersFile,JSON.stringify(users,null,2))}
async function ensureAdmin(){let users=await readUsers();const email=(process.env.ADMIN_EMAIL||'admin@insighthub.dev').toLowerCase();if(!users.some(u=>u.email===email)){users.push({id:'admin-'+Date.now(),name:process.env.ADMIN_NAME||'Rudra Sharma',email,password:await bcrypt.hash(process.env.ADMIN_PASSWORD||'Admin123!',12),role:'admin',createdAt:new Date().toISOString()});await writeUsers(users)}return users}
const tokenFor=u=>jwt.sign({id:u.id,role:u.role},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||'7d'});
export const register=asyncHandler(async(req,res)=>{const {name,email,password}=req.validated.body;let users=await ensureAdmin();const clean=email.toLowerCase().trim();if(users.some(u=>u.email===clean))throw new ApiError(409,'Email already registered');const user={id:'usr-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),name:name.trim(),email:clean,password:await bcrypt.hash(password,12),role:'user',createdAt:new Date().toISOString()};users.push(user);await writeUsers(users);res.status(201).json({success:true,token:tokenFor(user),user:publicUser(user)});});
export const login=asyncHandler(async(req,res)=>{const {email,password}=req.validated.body;const users=await ensureAdmin();const user=users.find(u=>u.email===email.toLowerCase().trim());if(!user||!(await bcrypt.compare(password,user.password)))throw new ApiError(401,'Incorrect email or password');res.json({success:true,token:tokenFor(user),user:publicUser(user)});});
export const me=asyncHandler(async(req,res)=>{const users=await ensureAdmin();const h=req.headers.authorization;if(!h?.startsWith('Bearer '))throw new ApiError(401,'Authentication required');let decoded;try{decoded=jwt.verify(h.slice(7),process.env.JWT_SECRET)}catch{throw new ApiError(401,'Invalid or expired session')}const user=users.find(u=>u.id===decoded.id);if(!user)throw new ApiError(401,'User no longer exists');res.json({success:true,user:publicUser(user)});});
