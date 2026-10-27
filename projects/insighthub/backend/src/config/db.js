import mongoose from 'mongoose';
export async function connectDB(){
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGODB_URI, {serverSelectionTimeoutMS: 10000});
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}
