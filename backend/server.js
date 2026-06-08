import express from 'express';
import cors from 'cors';
import connectDB from './database.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import positionRoutes from './routes/positions.js';
import contractRoutes from './routes/contracts.js';
import holidayRoutes from './routes/holidays.js';
import signatoryRoutes from './routes/signatories.js';
import bcrypt from 'bcryptjs';
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
app.use(cors({
  origin: [
    'http://localhost:3001',
    `http://${LOCAL_IP}:3001`
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Connect to MongoDB
connectDB();

// Initialize default admin user
const initializeAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: 'ADMINISTRATOR' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const admin = new User({
        username: 'admin',
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
      console.log('Default admin user created - username: admin, password: admin123');
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
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
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log('\n================================================');
  console.log('   CONTRACT MANAGEMENT SYSTEM - SERVER STARTED  ');
  console.log('================================================');
  console.log(`  Local access:   http://localhost:${PORT}`);
  console.log(`  LAN access:     http://${LOCAL_IP}:${PORT}`);
  console.log('------------------------------------------------');
  console.log(`  Share this URL with users:`);
  console.log(`  >>> http://${LOCAL_IP}:3001 <<<`);
  console.log('================================================\n');
  initializeAdmin();
});

export default app;