import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get user profile with role-specific data
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        customerProfile: {
          include: {
            addresses: true
          }
        },
        workerProfile: {
          include: {
            reviews: {
              include: {
                customer: { select: { name: true } }
              },
              orderBy: { createdAt: 'desc' },
              take: 10
            },
            bookings: {
              include: {
                service: true,
                customer: { select: { name: true, phone: true } }
              },
              orderBy: { createdAt: 'desc' },
              take: 10
            }
          }
        },
        bookings: {
          include: {
            service: true,
            worker: {
              include: {
                user: { select: { name: true, phone: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        reviews: {
          include: {
            worker: {
              include: {
                user: { select: { name: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone, profession, experience, hourlyRate, skills } = req.body;
    
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { name, phone },
      include: {
        customerProfile: true,
        workerProfile: true
      }
    });
    
    // Update worker profile if user is a worker
    if (user.role === 'WORKER' && user.workerProfile) {
      await prisma.worker.update({
        where: { userId: req.userId },
        data: {
          ...(profession && { profession }),
          ...(experience && { experience: parseInt(experience) }),
          ...(hourlyRate && { hourlyRate: parseFloat(hourlyRate) }),
          ...(skills && { skills })
        }
      });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new address
router.post('/addresses', authenticateToken, async (req, res) => {
  try {
    const { type, street, city, state, zipCode, isDefault } = req.body;
    
    // Get or create customer profile
    let customer = await prisma.customer.findUnique({
      where: { userId: req.userId }
    });
    
    if (!customer) {
      customer = await prisma.customer.create({
        data: { userId: req.userId }
      });
    }
    
    // If this is default, unset other defaults
    if (isDefault) {
      await prisma.address.updateMany({
        where: { customerId: customer.id },
        data: { isDefault: false }
      });
    }
    
    const address = await prisma.address.create({
      data: {
        customerId: customer.id,
        type,
        street,
        city,
        state,
        zipCode,
        isDefault: isDefault || false
      }
    });
    
    res.json(address);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user dashboard stats
router.get('/dashboard-stats', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true }
    });

    let stats = {};

    if (user.role === 'CUSTOMER') {
      const [totalBookings, activeBookings, completedBookings, totalSpent] = await Promise.all([
        prisma.booking.count({ where: { customerId: req.userId } }),
        prisma.booking.count({ where: { customerId: req.userId, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } } }),
        prisma.booking.count({ where: { customerId: req.userId, status: 'COMPLETED' } }),
        prisma.booking.aggregate({
          where: { customerId: req.userId, status: 'COMPLETED' },
          _sum: { totalAmount: true }
        })
      ]);

      stats = {
        totalBookings,
        activeBookings,
        completedBookings,
        totalSpent: totalSpent._sum.totalAmount || 0
      };
    } else if (user.role === 'WORKER') {
      const worker = await prisma.worker.findUnique({ where: { userId: req.userId } });
      if (worker) {
        const [totalJobs, activeJobs, completedJobs, totalEarnings] = await Promise.all([
          prisma.booking.count({ where: { workerId: worker.id } }),
          prisma.booking.count({ where: { workerId: worker.id, status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } }),
          prisma.booking.count({ where: { workerId: worker.id, status: 'COMPLETED' } }),
          prisma.booking.aggregate({
            where: { workerId: worker.id, status: 'COMPLETED' },
            _sum: { totalAmount: true }
          })
        ]);

        stats = {
          totalJobs,
          activeJobs,
          completedJobs,
          totalEarnings: totalEarnings._sum.totalAmount || 0,
          rating: worker.rating,
          isVerified: worker.isVerified
        };
      }
    }

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;