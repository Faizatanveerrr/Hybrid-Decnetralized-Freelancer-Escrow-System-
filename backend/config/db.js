import dns from 'node:dns';
import mongoose from 'mongoose';

// Used when MONGODB_URI is not set (e.g. a fresh folder without a .env yet).
const DEFAULT_URI = 'mongodb://127.0.0.1:27017/escrowx';
const RETRY_MS = 5000;
const PUBLIC_DNS = ['8.8.8.8', '1.1.1.1'];

/** Hide any username:password in a connection string before logging it. */
const redact = (uri) => uri.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:***@');

const resolveUri = () => {
  const uri = (process.env.MONGODB_URI || '').trim();
  if (uri) return uri;
  console.warn(`MONGODB_URI is not set - using ${DEFAULT_URI}. Create a .env file (copy .env.example) to change it.`);
  return DEFAULT_URI;
};

/**
 * MongoDB Atlas "mongodb+srv://" links need a DNS SRV lookup. Many home/college routers, VPNs
 * and ISPs refuse SRV queries ("querySrv ECONNREFUSED"). Set DNS_SERVERS="8.8.8.8,1.1.1.1" to
 * force the resolver, or let the first failure switch to public DNS automatically.
 */
const setDnsServers = (servers) => {
  try {
    dns.setServers(servers);
    return true;
  } catch (e) {
    console.warn(`Could not set DNS servers (${servers.join(', ')}): ${e.message}`);
    return false;
  }
};
if (process.env.DNS_SERVERS) {
  setDnsServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean));
}
let publicDnsTried = false;

let retryTimer = null;

/**
 * One connection attempt. Returns true on success, false otherwise (with the
 * real reason printed - this is the line to look at when the app says
 * "MongoDB disconnected").
 */
const connectDB = async () => {
  const uri = resolveUri();
  const isSrv = uri.startsWith('mongodb+srv://');
  try {
    // Atlas needs a TLS handshake, so allow longer than for a local database.
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: isSrv ? 10000 : 3000 });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.warn(`MongoDB connection failed (${redact(uri)}): ${error.message}`);

    const dnsProblem = /querySrv|queryTxt|ENOTFOUND|EAI_AGAIN/i.test(error.message);
    if (isSrv && dnsProblem && !publicDnsTried) {
      publicDnsTried = true;
      console.warn(`Your DNS server cannot look up Atlas addresses. Retrying with public DNS (${PUBLIC_DNS.join(', ')})...`);
      if (setDnsServers(PUBLIC_DNS)) return connectDB();
    } else if (isSrv && dnsProblem) {
      console.warn(
        'Still cannot resolve the Atlas address. Try another network (phone hotspot / no VPN), or in Atlas use ' +
        'Connect > Drivers > "Node.js 2.2.12 or later" to copy the long mongodb:// (non-SRV) connection string into MONGODB_URI.'
      );
    } else if (isSrv && /timed out|Server selection|ReplicaSetNoPrimary|whitelist|IP/i.test(error.message)) {
      console.warn('If this keeps happening: in Atlas open Network Access and add your current IP (or 0.0.0.0/0 for a demo).');
    }
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
