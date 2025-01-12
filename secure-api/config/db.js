// config/db.js

import mongoose from 'mongoose';

// This function will be called from server.js to connect to the database
const connectDB = async () => {
  try {
    // Use the DB_URI from .env
    await mongoose.connect(process.env.DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1); // Stop the app if there's a critical error
  }
};

export default connectDB;
