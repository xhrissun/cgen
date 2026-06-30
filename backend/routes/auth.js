import express from 'express';
import rateLimit from 'express-rate-limit';
import { errDetail } from '../utils/errors.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// JWT secret MUST come from the environment. In production we refuse to boot
// with a guessable fallback secret, since that would make every token
// (including admin tokens) trivially forgeable.
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production.');
  }
  console.warn('⚠️  JWT_SECRET not set — using an insecure development-only secret. Set JWT_SECRET before deploying.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-production';

// Basic brute-force protection on login.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' }
});

// Login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    if (user.status === 'PENDING') {
      return res.status(403).json({ message: 'Account pending validation' });
    }
    
    if (user.status === 'INACTIVE') {
      return res.status(403).json({ message: 'Account is inactive' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { 
        userId: user._id, 
        role: user.role,
        placeOfAssignment: user.placeOfAssignment  // ← Added this
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        personalInfo: user.personalInfo,
        placeOfAssignment: user.placeOfAssignment
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Change Password
router.post('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const { currentPassword, newPassword } = req.body;
    
    const user = await User.findById(decoded.userId).select('+password');
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.updatedAt = new Date();
    await user.save();
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Middleware to verify token
export const verifyToken = (req, res, next) => {
  // Try to get token from Authorization header first
  let token = req.headers.authorization?.replace('Bearer ', '');
  
  // If not in header, try query parameter (for image requests)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Middleware factory to restrict a route to one or more roles.
// Usage: router.post('/', verifyToken, requireRole('ADMINISTRATOR'), handler)
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

export default router;