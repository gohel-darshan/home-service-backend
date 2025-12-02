import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Create complaint
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Customer access required' });
    }

    const { title, description, priority = 'MEDIUM' } = req.body;
    
    const complaint = await prisma.complaint.create({
      data: {
        customerId: req.userId,
        title,
        description,
        priority,
        status: 'OPEN'
      },
      include: {
        customer: { select: { name: true, email: true } }
      }
    });

    res.status(201).json(complaint);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get customer's complaints
router.get('/my', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Customer access required' });
    }

    const complaints = await prisma.complaint.findMany({
      where: { customerId: req.userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(complaints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get complaint by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const complaint = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: {
        customer: { select: { name: true, email: true, phone: true } }
      }
    });

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    // Check if user has access to this complaint
    if (req.user.role === 'CUSTOMER' && complaint.customerId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(complaint);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;