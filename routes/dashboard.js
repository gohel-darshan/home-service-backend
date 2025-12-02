import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get role-specific dashboard data
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { role } = req.user;
    let dashboardData = {};

    if (role === 'CUSTOMER') {
      const [bookings, totalSpent, recentServices] = await Promise.all([
        prisma.booking.findMany({
          where: { customerId: req.userId },
          include: { service: true, worker: { include: { user: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5
        }),
        prisma.booking.aggregate({
          where: { customerId: req.userId, status: 'COMPLETED' },
          _sum: { totalAmount: true }
        }),
        prisma.service.findMany({
          take: 6,
          orderBy: { createdAt: 'desc' }
        })
      ]);

      dashboardData = {
        stats: {
          totalBookings: bookings.length,
          activeBookings: bookings.filter(b => ['CONFIRMED', 'IN_PROGRESS'].includes(b.status)).length,
          completedBookings: bookings.filter(b => b.status === 'COMPLETED').length,
          totalSpent: totalSpent._sum.totalAmount || 0
        },
        recentBookings: bookings,
        availableServices: recentServices
      };
    } 
    
    else if (role === 'WORKER') {
      const worker = await prisma.worker.findUnique({ where: { userId: req.userId } });
      if (!worker) throw new Error('Worker profile not found');

      const [bookings, earnings, availableJobs] = await Promise.all([
        prisma.booking.findMany({
          where: { workerId: worker.id },
          include: { service: true, customer: true },
          orderBy: { createdAt: 'desc' },
          take: 10
        }),
        prisma.booking.aggregate({
          where: { workerId: worker.id, status: 'COMPLETED' },
          _sum: { totalAmount: true }
        }),
        prisma.booking.findMany({
          where: { status: 'PENDING', workerId: null },
          include: { service: true, customer: true },
          take: 5
        })
      ]);

      dashboardData = {
        stats: {
          totalJobs: bookings.length,
          activeJobs: bookings.filter(b => ['CONFIRMED', 'IN_PROGRESS'].includes(b.status)).length,
          completedJobs: bookings.filter(b => b.status === 'COMPLETED').length,
          totalEarnings: earnings._sum.totalAmount || 0,
          rating: worker.rating,
          isVerified: worker.isVerified
        },
        recentJobs: bookings,
        availableJobs
      };
    }
    
    else if (role === 'ADMIN') {
      const [users, workers, bookings, revenue, complaints] = await Promise.all([
        prisma.user.groupBy({ by: ['role'], _count: { id: true } }),
        prisma.worker.findMany({ include: { user: true } }),
        prisma.booking.findMany({
          include: { service: true, customer: true, worker: { include: { user: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10
        }),
        prisma.booking.aggregate({
          where: { status: 'COMPLETED' },
          _sum: { totalAmount: true }
        }),
        prisma.complaint.findMany({
          where: { status: 'OPEN' },
          include: { customer: true },
          take: 5
        })
      ]);

      const usersByRole = users.reduce((acc, u) => {
        acc[u.role.toLowerCase()] = u._count.id;
        return acc;
      }, {});

      dashboardData = {
        stats: {
          totalUsers: users.reduce((sum, u) => sum + u._count.id, 0),
          customers: usersByRole.customer || 0,
          workers: usersByRole.worker || 0,
          totalBookings: bookings.length,
          totalRevenue: revenue._sum.totalAmount || 0,
          pendingComplaints: complaints.length
        },
        recentBookings: bookings,
        pendingComplaints: complaints,
        topWorkers: workers.sort((a, b) => b.rating - a.rating).slice(0, 5)
      };
    }

    res.json(dashboardData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;