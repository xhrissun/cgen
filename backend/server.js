import 'dotenv/config';
import { errDetail } from './utils/errors.js';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
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

// Render (and most PaaS hosts) sit the app behind a reverse proxy that sets
// X-Forwarded-For. Without this, Express refuses to trust that header by
// default, which breaks express-rate-limit's ability to identify clients by
// IP (it was falling back to misidentifying every request, logging an
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR warning on every single request in
// production). `1` means "trust exactly one hop" — i.e. the platform's own
// load balancer — which matches Render's setup and avoids blindly trusting
// an arbitrary chain of forwarded headers a client could spoof.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
const LOCAL_IP = getLocalIP();

// Middleware
app.use(compression()); // gzip all responses

// Security headers. contentSecurityPolicy is disabled because this process
// only ever serves JSON/API responses and proxied files — CSP is meant for
// HTML documents, which the separately-hosted frontend serves, not this API.
// crossOriginResourcePolicy is relaxed to 'cross-origin' because the
// frontend and this API intentionally live on different origins (see the
// CORS config below) — helmet's 'same-origin' default would otherwise block
// the frontend from loading proxied files (photos, signed contracts, etc.)
// straight out of the box.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

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

// Strips any request key starting with '$' or containing '.' from
// body/query/params, so a value like { "$ne": null } can never be
// interpreted as a MongoDB query operator instead of a literal string —
// closes off NoSQL operator-injection attempts on any route that builds a
// query directly from user input (e.g. login's `findOne({ username })`).
app.use(mongoSanitize());

// General API-wide rate limit — a coarser, higher-ceiling backstop on top
// of the tighter per-route limiter already on /api/auth/login. Slows down
// brute-force/enumeration attempts and basic scripted abuse across every
// endpoint, not just login.
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,                 // requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
}));

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

// Start server — wait for MongoDB to finish connecting before doing anything
// that issues queries (admin init, contract expiry checker, or accepting
// requests), since the connection is configured with bufferCommands: false.
const startServer = async () => {
  await connectDB();

  app.listen(PORT, HOST, async () => {
    console.log(`Backend running on port ${PORT}`);
    await initializeAdmin();
    startContractExpiryChecker();
  });
};

startServer();

export default app;