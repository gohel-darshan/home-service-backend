import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all workers with filters
router.get('/', async (req, res) => {
  try {
    const { profession, city, minRating, maxPrice, isVerified } = req.query;
    
    const workers = await prisma.worker.findMany({
      where: {
        isAvailable: true,
        ...(profession && { profession: { contains: profession, mode: 'insensitive' } }),
        ...(minRating && { rating: { gte: parseFloat(minRating) } }),
        ...(maxPrice && { hourlyRate: { lte: parseFloat(maxPrice) } }),
        ...(isVerified !== undefined && { isVerified: isVerified === 'true' })
      },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        reviews: {
          include: {
            customer: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        },
        bookings: {
          where: { status: 'COMPLETED' },
          select: { id: true }
        }
      },
      orderBy: [
        { rating: 'desc' },
        { totalJobs: 'desc' }
      ]
    });
    
    res.json(workers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get worker by ID with complete profile
router.get('/:id', async (req, res) => {
  try {
    const worker = await prisma.worker.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { name: true, email: true, phone: true, createdAt: true } },
        reviews: {
          include: {
            customer: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' }
        },
        bookings: {
          include: {
            service: true,
            customer: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });
    
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    // Calculate additional stats
    const completedJobs = worker.bookings.filter(b => b.status === 'COMPLETED').length;
    const avgRating = worker.reviews.length > 0 
      ? worker.reviews.reduce((sum, r) => sum + r.rating, 0) / worker.reviews.length 
      : 0;
    
    res.json({
      ...worker,
      stats: {
        completedJobs,
        avgRating: Math.round(avgRating * 10) / 10,
        totalReviews: worker.reviews.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available jobs for workers
router.get('/jobs/available', async (req, res) => {
  try {
    const { profession } = req.query;
    
    const jobs = await prisma.booking.findMany({
      where: {
        status: 'PENDING',
        workerId: null,
        ...(profession && {
          service: {
            category: { contains: profession, mode: 'insensitive' }
          }
        })
      },
      include: {
        service: true,
        customer: { select: { name: true, phone: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update KYC status
router.put('/kyc/status', async (req, res) => {
  try {
    const { userId, kycStatus } = req.body;
    
    const worker = await prisma.worker.update({
      where: { userId },
      data: { 
        kycStatus,
        ...(kycStatus === 'VERIFIED' && { isVerified: true })
      },
      include: {
        user: { select: { name: true, email: true } }
      }
    });
    
    res.json(worker);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit KYC documents
router.post('/kyc/submit', async (req, res) => {
  try {
    const { userId, aadharCard, panCard, profilePhoto } = req.body;
    
    const worker = await prisma.worker.update({
      where: { userId },
      data: {
        kycStatus: 'PENDING',
        aadharCard,
        panCard,
        profilePhoto
      },
      include: {
        user: { select: { name: true, email: true } }
      }
    });
    
    res.json({ message: 'KYC documents submitted successfully', worker });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get worker profile (authenticated)
router.get('/profile/me', authenticateToken, async (req, res) => {
  try {
    const worker = await prisma.worker.findUnique({
      where: { userId: req.user.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true
          }
        },
        bookings: {
          include: {
            service: true,
            customer: {
              include: {
                user: {
                  select: { name: true }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        reviews: {
          include: {
            customer: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!worker) {
      return res.status(404).json({ error: 'Worker profile not found' });
    }

    // Calculate stats
    const completedJobs = worker.bookings.filter(b => b.status === 'COMPLETED').length;
    const totalEarnings = worker.bookings
      .filter(b => b.status === 'COMPLETED')
      .reduce((sum, b) => sum + b.totalAmount, 0);
    const avgRating = worker.reviews.length > 0
      ? worker.reviews.reduce((sum, r) => sum + r.rating, 0) / worker.reviews.length
      : 0;

    res.json({
      ...worker,
      stats: {
        completedJobs,
        totalEarnings,
        avgRating: Math.round(avgRating * 10) / 10,
        totalReviews: worker.reviews.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update worker profile
router.put('/profile/me', authenticateToken, async (req, res) => {
  try {
    const { profession, experience, hourlyRate, skills, portfolio, availability } = req.body;
    
    const worker = await prisma.worker.update({
      where: { userId: req.user.id },
      data: {
        profession,
        experience,
        hourlyRate,
        skills,
        portfolio,
        availability
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    res.json(worker);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;