import mongoose from 'mongoose';import bcrypt from 'bcryptjs';import validator from 'validator';
const userSchema=new mongoose.Schema({name:{type:String,required:true,trim:true,maxlength:60},email:{type:String,required:true,unique:true,lowercase:true,trim:true,validate:[validator.isEmail,'Invalid email']},password:{type:String,required:true,minlength:8,select:false},role:{type:String,enum:['user','admin'],default:'user'},avatar:{type:String,default:''}},{timestamps:true});
userSchema.pre('save',async function(next){if(!this.isModified('password'))return next();this.password=await bcrypt.hash(this.password,12);next();});
userSchema.methods.comparePassword=function(candidate){return bcrypt.compare(candidate,this.password)};
export default mongoose.model('User',userSchema);