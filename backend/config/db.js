const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;

    if (!mongoURI) {
      throw new Error('MONGO_URI is not defined in .env file');
    }

    console.log('Connecting to MongoDB...');

    await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 10000 });

    console.log('MongoDB connected successfully');
  } catch (error) {
    throw new Error('MongoDB connection failed. Check MONGO_URI, database availability and network access.', { cause: error });
  }
};

module.exports = connectDB;
