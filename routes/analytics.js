import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get comprehensive analytics (Admin only)
router.get('/overview', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { timeRange = '30' } = req.query;
    const days = parseInt(timeRange);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [
      userGrowth,
      bookingTrends,
      revenueAnalytics,
      workerPerformance,
      servicePopularity
    ] = await Promise.all([
      // User growth over time
      prisma.user.groupBy({
        by: ['role'],
        where: { createdAt: { gte: startDate } },
        _count: { id: true },
        orderBy: { role: 'asc' }
      }),
      
      // Booking trends
      prisma.booking.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startDate } },
        _count: { id: true },
        _sum: { totalAmount: true }
      }),
      
      // Revenue analytics
      prisma.booking.findMany({
        where: { 
          status: 'COMPLETED',
          completedAt: { gte: startDate }
        },
        select: {
          totalAmount: true,
          completedAt: true,
          service: { select: { category: true } }
        }
      }),
      
      // Worker performance
      prisma.worker.findMany({
        include: {
          user: { select: { name: true } },
          bookings: {
            where: { status: 'COMPLETED', completedAt: { gte: startDate } },
            select: { totalAmount: true }
          },
          reviews: { select: { rating: true } }
        },
        orderBy: { rating: 'desc' },
        take: 10
      }),
      
      // Service popularity
      prisma.service.findMany({
        include: {
          bookings: {
            where: { createdAt: { gte: startDate } },
            select: { id: true, totalAmount: true }
          }
        }
      })
    ]);

    // Process revenue by day
    const revenueByDay = revenueAnalytics.reduce((acc, booking) => {
      const date = booking.completedAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + booking.totalAmount;
      return acc;
    }, {});

    // Process service analytics
    const serviceStats = servicePopularity.map(service => ({
      ...service,
      totalBookings: service.bookings.length,
      totalRevenue: service.bookings.reduce((sum, b) => sum + b.totalAmount, 0)
    })).sort((a, b) => b.totalBookings - a.totalBookings);

    res.json({
      userGrowth,
      bookingTrends,
      revenueByDay,
      workerPerformance: workerPerformance.map(worker => ({
        ...worker,
        totalEarnings: worker.bookings.reduce((sum, b) => sum + b.totalAmount, 0),
        avgRating: worker.reviews.length > 0 
          ? worker.reviews.reduce((sum, r) => sum + r.rating, 0) / worker.reviews.length 
          : 0
      })),
      serviceStats: serviceStats.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get worker analytics
router.get('/worker', authenticateToken, requireRole('WORKER'), async (req, res) => {
  try {
    const worker = await prisma.worker.findUnique({ where: { userId: req.userId } });
    if (!worker) throw new Error('Worker profile not found');

    const { timeRange = '30' } = req.query;
    const days = parseInt(timeRange);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [earnings, bookings, reviews] = await Promise.all([
      prisma.booking.findMany({
        where: {
          workerId: worker.id,
          status: 'COMPLETED',
          completedAt: { gte: startDate }
        },
        select: { totalAmount: true, completedAt: true }
      }),
      
      prisma.booking.groupBy({
        by: ['status'],
        where: { workerId: worker.id, createdAt: { gte: startDate } },
        _count: { id: true }
      }),
      
      prisma.review.findMany({
        where: { workerId: worker.id, createdAt: { gte: startDate } },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // Process earnings by day
    const earningsByDay = earnings.reduce((acc, booking) => {
      const date = booking.completedAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + booking.totalAmount;
      return acc;
    }, {});

    res.json({
      earningsByDay,
      bookingStats: bookings,
      recentReviews: reviews,
      totalEarnings: earnings.reduce((sum, e) => sum + e.totalAmount, 0),
      avgRating: reviews.length > 0 
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
        : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;