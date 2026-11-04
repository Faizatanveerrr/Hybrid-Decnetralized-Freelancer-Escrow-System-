import mongoose from 'mongoose';

// Used when MONGODB_URI is not set (e.g. a fresh folder without a .env yet).
const DEFAULT_URI = 'mongodb://127.0.0.1:27017/escrowx';
const RETRY_MS = 5000;

/** Hide any username:password in a connection string before logging it. */
const redact = (uri) => uri.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:***@');

const resolveUri = () => {
  const uri = (process.env.MONGODB_URI || '').trim();
  if (uri) return uri;
  console.warn(`MONGODB_URI is not set - using ${DEFAULT_URI}. Create a .env file (copy .env.example) to change it.`);
  return DEFAULT_URI;
};

let retryTimer = null;

/**
 * One connection attempt. Returns true on success, false otherwise (with the
 * real reason printed - this is the line to look at when the app says
 * "MongoDB disconnected").
 */
const connectDB = async () => {
  const uri = resolveUri();
  try {
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.warn(`MongoDB connection failed (${redact(uri)}): ${error.message}`);
    return false;
  }
};

/**
 * Connect now and, if that fails, keep retrying in the background so the
 * backend recovers by itself when MongoDB / Docker comes up later.
 * (After the first successful connection mongoose reconnects on its own.)
 */
export const connectWithRetry = async () => {
  const connected = await connectDB();
  if (!connected && !retryTimer) {
    console.log(`Will retry every ${RETRY_MS / 1000}s until MongoDB is reachable...`);
    retryTimer = setInterval(async () => {
      if (mongoose.connection.readyState === 1) {
        clearInterval(retryTimer);
        retryTimer = null;
        return;
      }
      if (await connectDB()) {
        clearInterval(retryTimer);
        retryTimer = null;
        console.log('MongoDB connected successfully (after retry).');
      }
    }, RETRY_MS);
    retryTimer.unref?.();
  }
  return connected;
};

export default connectDB;
