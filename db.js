const mongoose = require('mongoose');

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };
    cached.promise = mongoose.connect(process.env.MONGO_URI, opts).then((mongoose) => {
      console.log('Connected to MongoDB database.');
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error('Error connecting to MongoDB', e);
    throw e;
  }

  return cached.conn;
}

// Setup User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, lowercase: true, trim: true },
  email: { type: String, unique: true, required: true },
  firebase_uid: { type: String, unique: true, sparse: true },
  name: { type: String, default: '' },
  full_name: { type: String, default: '' },
  bio: { type: String, default: '' },
  about: { type: String, default: '' },
  specialty: { type: String, default: 'Fine Art & Cinematic Frames' },
  profile_picture_url: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

// Setup Photo Schema
const photoSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true }, // will store Cloudinary URL
  original_name: { type: String },
  created_at: { type: Date, default: Date.now },
  deleted_by_user: { type: Boolean, default: false },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

const Photo = mongoose.models.Photo || mongoose.model('Photo', photoSchema);

module.exports = { User, Photo, dbConnect };
