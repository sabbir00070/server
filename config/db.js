import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_DB);
    console.log(`Connection Succesfull host is ${conn.connection.host}`);
  } catch (Err) {
    console.log(`Mongoose connect failed error message is : ${Err}`);
    process.exit(1);
  }
}

export default connectDB;