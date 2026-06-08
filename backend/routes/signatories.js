import express from 'express';
import Signatory from '../models/Signatory.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Get all signatories
router.get('/', verifyToken, async (req, res) => {
  try {
    const { role, isActive } = req.query;
    let query = {};
    
    if (role) {
      query.role = role;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    const signatories = await Signatory.find(query).sort({ role: 1, name: 1 });
    res.json(signatories);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get signatory by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const signatory = await Signatory.findById(req.params.id);
    
    if (!signatory) {
      return res.status(404).json({ message: 'Signatory not found' });
    }
    
    res.json(signatory);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get default signatories for contract generation
router.get('/defaults/all', verifyToken, async (req, res) => {
  try {
    const defaultSignatories = await Signatory.find({ 
      isDefault: true, 
      isActive: true 
    });
    
    // Organize by role
    const organized = {
      RECOMMENDING_APPROVAL: null,
      FUNDS_AVAILABLE_ACCOUNTANT: null,
      FUNDS_AVAILABLE_FINANCE: null,
      FIRST_PARTY: null,
      APPROVER: null,
      SUPERVISOR: null
    };
    
    defaultSignatories.forEach(sig => {
      organized[sig.role] = sig;
    });
    
    res.json(organized);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create signatory
router.post('/', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const { name, designation, role, title, isActive, isDefault } = req.body;
    
    // If setting as default, unset other defaults for the same role
    if (isDefault) {
      await Signatory.updateMany(
        { role, isDefault: true },
        { isDefault: false }
      );
    }
    
    const newSignatory = new Signatory({
      name,
      designation,
      role,
      title,
      isActive,
      isDefault
    });
    
    await newSignatory.save();
    res.status(201).json(newSignatory);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update signatory
router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // If setting as default, unset other defaults for the same role
    if (req.body.isDefault) {
      const currentSignatory = await Signatory.findById(req.params.id);
      if (currentSignatory) {
        await Signatory.updateMany(
          { role: currentSignatory.role, isDefault: true, _id: { $ne: req.params.id } },
          { isDefault: false }
        );
      }
    }
    
    const signatory = await Signatory.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    
    if (!signatory) {
      return res.status(404).json({ message: 'Signatory not found' });
    }
    
    res.json(signatory);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete signatory
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const signatory = await Signatory.findByIdAndDelete(req.params.id);
    
    if (!signatory) {
      return res.status(404).json({ message: 'Signatory not found' });
    }
    
    res.json({ message: 'Signatory deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;