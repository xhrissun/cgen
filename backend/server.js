import 'dotenv/config';
import { errDetail } from './utils/errors.js';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import connectDB from './database.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import positionRoutes from './routes/positions.js';
import contractRoutes from './routes/contracts.js';
import holidayRoutes from './routes/holidays.js';
import signatoryRoutes from './routes/signatories.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from './models/User.js';
import { startContractExpiryChecker } from './utils/contractExpiry.js';
import notificationRoutes from './routes/notifications.js';
import changeLogRoutes from './routes/changeLogs.js';
import eodbRoutes from './routes/eodb.js';
import { getLocalIP } from './utils/getLocalIP.js';

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
const LOCAL_IP = getLocalIP();

// Middleware
app.use(compression()); // gzip all responses
app.use((req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  next();
});
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3001',
  ],
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
connectDB();

// Initialize default admin user
// Credentials are taken from ADMIN_USERNAME/ADMIN_PASSWORD env vars so no
// hardcoded credentials ship in source control. If ADMIN_PASSWORD isn't set,
// a random one-time password is generated and printed to the server console
// only (never logged anywhere persistent) so the operator can log in once
// and must change it immediately.
const initializeAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: 'ADMINISTRATOR' });
    if (!adminExists) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const generatedPassword = !process.env.ADMIN_PASSWORD;
      const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');

      const hashedPassword = await bcrypt.hash(password, 10);
      const admin = new User({
        username,
        password: hashedPassword,
        role: 'ADMINISTRATOR',
        status: 'ACTIVE',
        personalInfo: {
          firstName: 'System',
          lastName: 'Administrator',
          email: 'admin@denr.gov.ph'
        }
      });
      await admin.save();
      if (generatedPassword) {
        console.log(`Default admin user created — username: ${username}. A random one-time password was generated since ADMIN_PASSWORD was not set: ${password}`);
        console.log('Log in immediately and change this password. Set ADMIN_USERNAME / ADMIN_PASSWORD env vars to control this on future deploys.');
      } else {
        console.log(`Default admin user created — username: ${username} (password taken from ADMIN_PASSWORD env var).`);
      }
    }
  } catch (error) {
    console.error('Error initializing admin:', errDetail(error));
  }
};

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/signatories', signatoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/change-logs', changeLogRoutes);
app.use('/api/eodb', eodbRoutes);

// Start contract expiry checker
startContractExpiryChecker();

// Health check — also exposes the detected IP to the frontend
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    ip: LOCAL_IP,
    port: PORT
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: errDetail(err) });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Backend running on port ${PORT}`);
  initializeAdmin();
  startKeepAlive();
});

export default app;

// ── Keep-alive self-ping ──────────────────────────────────────────────────────
// Pings /api/health every 14 minutes so Render's free tier doesn't spin down.
// Only runs when a RENDER_EXTERNAL_URL or BACKEND_URL env var is set (i.e. in production).
function startKeepAlive() {
  const backendUrl = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL;
  if (!backendUrl) {
    console.log('Keep-alive: no RENDER_EXTERNAL_URL set — skipping (local dev).');
    return;
  }

  const url = `${backendUrl.replace(/\/$/, '')}/api/health`;
  const INTERVAL_MS = 14 * 60 * 1000; // 14 minutes

  setInterval(async () => {
    try {
      const res = await fetch(url);
      console.log(`Keep-alive ping → ${url} [${res.status}]`);
    } catch (err) {
      console.warn(`Keep-alive ping failed: ${err.message}`);
    }
  }, INTERVAL_MS);

  console.log(`Keep-alive: pinging ${url} every 14 minutes.`);
}