import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Create booking
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { serviceId, workerId, scheduledAt, address, notes, totalAmount } = req.body;
    
    const booking = await prisma.booking.create({
      data: {
        customerId: req.userId,
        serviceId,
        workerId: workerId || null,
        scheduledAt: new Date(scheduledAt),
        address,
        notes,
        totalAmount: parseFloat(totalAmount),
        status: workerId ? 'CONFIRMED' : 'PENDING'
      },
      include: {
        service: true,
        customer: { select: { name: true, email: true, phone: true } },
        worker: {
          include: {
            user: { select: { name: true, phone: true } }
          }
        }
      }
    });
    
    res.status(201).json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get worker bookings
router.get('/worker', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'WORKER') {
      return res.status(403).json({ error: 'Worker access required' });
    }
    
    const worker = await prisma.worker.findUnique({
      where: { userId: req.userId }
    });
    
    if (!worker) {
      return res.status(404).json({ error: 'Worker profile not found' });
    }
    
    const bookings = await prisma.booking.findMany({
      where: { workerId: worker.id },
      include: {
        service: true,
        customer: { select: { name: true, email: true, phone: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Accept booking (for workers)
router.put('/:id/accept', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'WORKER') {
      return res.status(403).json({ error: 'Worker access required' });
    }
    
    const worker = await prisma.worker.findUnique({
      where: { userId: req.userId }
    });
    
    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        workerId: worker.id,
        status: 'CONFIRMED'
      },
      include: {
        service: true,
        customer: { select: { name: true, email: true, phone: true } }
      }
    });
    
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update booking status
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    
    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: { 
        status,
        ...(status === 'COMPLETED' && { completedAt: new Date() })
      },
      include: {
        service: true,
        customer: { select: { name: true, email: true, phone: true } },
        worker: {
          include: {
            user: { select: { name: true, phone: true } }
          }
        }
      }
    });
    
    // Update worker stats if completed
    if (status === 'COMPLETED' && booking.workerId) {
      await prisma.worker.update({
        where: { id: booking.workerId },
        data: {
          totalJobs: { increment: 1 }
        }
      });
    }
    
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user bookings
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { customerId: req.userId },
      include: {
        service: true,
        worker: {
          include: {
            user: { select: { name: true, phone: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get booking by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        service: true,
        customer: { select: { name: true, email: true, phone: true } },
        worker: {
          include: {
            user: { select: { name: true, phone: true } }
          }
        }
      }
    });
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;