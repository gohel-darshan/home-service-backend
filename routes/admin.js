import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get comprehensive dashboard stats
router.get('/stats', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const [userStats, workerStats, bookingStats, revenueStats, recentActivity] = await Promise.all([
      prisma.user.groupBy({
        by: ['role'],
        _count: { id: true }
      }),
      prisma.worker.aggregate({
        _count: { id: true },
        _avg: { rating: true }
      }),
      prisma.booking.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { totalAmount: true }
      }),
      prisma.booking.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { totalAmount: true },
        _count: { id: true }
      }),
      prisma.booking.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          service: { select: { name: true } },
          customer: { select: { name: true } },
          worker: { include: { user: { select: { name: true } } } }
        }
      })
    ]);

    const usersByRole = userStats.reduce((acc, stat) => {
      acc[stat.role.toLowerCase()] = stat._count.id;
      return acc;
    }, {});

    const bookingsByStatus = bookingStats.reduce((acc, stat) => {
      acc[stat.status.toLowerCase()] = {
        count: stat._count.id,
        revenue: stat._sum.totalAmount || 0
      };
      return acc;
    }, {});

    res.json({
      users: {
        total: userStats.reduce((sum, stat) => sum + stat._count.id, 0),
        customers: usersByRole.customer || 0,
        workers: usersByRole.worker || 0,
        admins: usersByRole.admin || 0
      },
      workers: {
        total: workerStats._count.id,
        averageRating: Math.round((workerStats._avg.rating || 0) * 10) / 10
      },
      bookings: {
        total: bookingStats.reduce((sum, stat) => sum + stat._count.id, 0),
        byStatus: bookingsByStatus
      },
      revenue: {
        total: revenueStats._sum.totalAmount || 0,
        completedBookings: revenueStats._count.id
      },
      recentActivity
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all bookings for admin
router.get('/bookings', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      include: {
        service: true,
        customer: { select: { name: true, email: true, phone: true } },
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

// Get all complaints for admin
router.get('/complaints', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const complaints = await prisma.complaint.findMany({
      include: {
        customer: { select: { name: true, email: true, phone: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify worker
router.put('/workers/:id/verify', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const worker = await prisma.worker.update({
      where: { id: req.params.id },
      data: { isVerified: true },
      include: {
        user: { select: { name: true, email: true } }
      }
    });
    
    res.json(worker);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Suspend worker
router.put('/workers/:id/suspend', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const worker = await prisma.worker.update({
      where: { id: req.params.id },
      data: { isAvailable: false },
      include: {
        user: { select: { name: true, email: true } }
      }
    });
    
    res.json(worker);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users with filters
router.get('/users', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const where = {
      ...(role && { role }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          customerProfile: { include: { addresses: true } },
          workerProfile: true,
          bookings: { select: { id: true, status: true } }
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all workers for admin management
router.get('/workers', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const workers = await prisma.worker.findMany({
      include: {
        user: { select: { name: true, email: true, phone: true, createdAt: true } },
        reviews: { select: { rating: true } },
        bookings: { 
          select: { id: true, status: true, totalAmount: true },
          where: { status: 'COMPLETED' }
        }
      },
      orderBy: { user: { createdAt: 'desc' } }
    });

    const workersWithStats = workers.map(worker => ({
      ...worker,
      stats: {
        totalEarnings: worker.bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        completedJobs: worker.bookings.length,
        averageRating: worker.reviews.length > 0 
          ? worker.reviews.reduce((sum, r) => sum + r.rating, 0) / worker.reviews.length 
          : worker.rating
      }
    }));

    res.json({
      workers: workersWithStats,
      pagination: {
        total: workers.length,
        page: 1,
        limit: workers.length,
        pages: 1
      }
    });
  } catch (error) {
    console.error('Admin workers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update complaint status
router.put('/complaints/:id/status', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { status, priority } = req.body;
    
    const complaint = await prisma.complaint.update({
      where: { id: req.params.id },
      data: { 
        status,
        ...(priority && { priority })
      },
      include: {
        customer: { select: { name: true, email: true } }
      }
    });
    
    res.json(complaint);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pending KYC requests
router.get('/kyc/pending', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const pendingKyc = await prisma.worker.findMany({
      where: {
        kycStatus: 'PENDING'
      },
      include: {
        user: { select: { name: true, email: true, phone: true, createdAt: true } }
      },
      orderBy: { user: { createdAt: 'desc' } }
    });
    
    res.json(pendingKyc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve/Reject KYC
router.put('/kyc/:workerId/status', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { status } = req.body; // VERIFIED or REJECTED
    
    const worker = await prisma.worker.update({
      where: { id: req.params.workerId },
      data: {
        kycStatus: status,
        isVerified: status === 'VERIFIED'
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

export default router;