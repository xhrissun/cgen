import express from 'express';
import Holiday from '../models/Holiday.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Get all holidays
router.get('/', verifyToken, async (req, res) => {
  try {
    const { year, startDate, endDate } = req.query;
    let query = {};
    
    if (year) {
      query.year = parseInt(year);
    }
    
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const holidays = await Holiday.find(query).sort({ date: 1 });
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get holiday by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    
    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }
    
    res.json(holiday);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create holiday
router.post('/', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const { name, date, type, year, isRecurring } = req.body;
    
    const newHoliday = new Holiday({
      name,
      date,
      type,
      year,
      isRecurring
    });
    
    await newHoliday.save();
    res.status(201).json(newHoliday);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update holiday
router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const holiday = await Holiday.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    
    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }
    
    res.json(holiday);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete holiday
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const holiday = await Holiday.findByIdAndDelete(req.params.id);
    
    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }
    
    res.json({ message: 'Holiday deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk create holidays (useful for importing annual holidays)
router.post('/bulk', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const { holidays } = req.body;
    
    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({ message: 'Invalid holidays data' });
    }
    
    const createdHolidays = await Holiday.insertMany(holidays);
    res.status(201).json({ 
      message: `${createdHolidays.length} holidays created successfully`,
      holidays: createdHolidays
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;