import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get user notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { role } = req.user;
    let notifications = [];

    if (role === 'CUSTOMER') {
      const bookings = await prisma.booking.findMany({
        where: { 
          customerId: req.userId,
          status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] }
        },
        include: { service: true, worker: { include: { user: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 10
      });

      notifications = bookings.map(booking => ({
        id: booking.id,
        type: 'booking_update',
        title: `Booking ${booking.status.toLowerCase().replace('_', ' ')}`,
        message: `Your ${booking.service.name} booking is ${booking.status.toLowerCase().replace('_', ' ')}`,
        data: booking,
        createdAt: booking.updatedAt,
        read: false
      }));
    }
    
    else if (role === 'WORKER') {
      const worker = await prisma.worker.findUnique({ where: { userId: req.userId } });
      if (!worker) throw new Error('Worker profile not found');

      const [newBookings, completedBookings] = await Promise.all([
        prisma.booking.findMany({
          where: { status: 'PENDING', workerId: null },
          include: { service: true, customer: true },
          orderBy: { createdAt: 'desc' },
          take: 5
        }),
        prisma.booking.findMany({
          where: { workerId: worker.id, status: 'COMPLETED' },
          include: { service: true, customer: true },
          orderBy: { completedAt: 'desc' },
          take: 5
        })
      ]);

      notifications = [
        ...newBookings.map(booking => ({
          id: `new_${booking.id}`,
          type: 'new_job',
          title: 'New Job Available',
          message: `${booking.service.name} job available for ₹${booking.totalAmount}`,
          data: booking,
          createdAt: booking.createdAt,
          read: false
        })),
        ...completedBookings.map(booking => ({
          id: `completed_${booking.id}`,
          type: 'job_completed',
          title: 'Job Completed',
          message: `You earned ₹${booking.totalAmount} from ${booking.service.name}`,
          data: booking,
          createdAt: booking.completedAt,
          read: false
        }))
      ];
    }
    
    else if (role === 'ADMIN') {
      const [pendingWorkers, recentComplaints, recentBookings] = await Promise.all([
        prisma.worker.findMany({
          where: { isVerified: false },
          include: { user: true },
          take: 5
        }),
        prisma.complaint.findMany({
          where: { status: 'OPEN' },
          include: { customer: true },
          orderBy: { createdAt: 'desc' },
          take: 5
        }),
        prisma.booking.findMany({
          where: { status: 'COMPLETED' },
          include: { service: true, customer: true },
          orderBy: { completedAt: 'desc' },
          take: 5
        })
      ]);

      notifications = [
        ...pendingWorkers.map(worker => ({
          id: `verify_${worker.id}`,
          type: 'worker_verification',
          title: 'Worker Verification Pending',
          message: `${worker.user.name} is waiting for verification`,
          data: worker,
          createdAt: worker.user.createdAt,
          read: false
        })),
        ...recentComplaints.map(complaint => ({
          id: `complaint_${complaint.id}`,
          type: 'new_complaint',
          title: 'New Complaint Filed',
          message: `${complaint.customer.name}: ${complaint.title}`,
          data: complaint,
          createdAt: complaint.createdAt,
          read: false
        })),
        ...recentBookings.map(booking => ({
          id: `revenue_${booking.id}`,
          type: 'revenue_update',
          title: 'New Revenue',
          message: `₹${booking.totalAmount} earned from ${booking.service.name}`,
          data: booking,
          createdAt: booking.completedAt,
          read: false
        }))
      ];
    }

    // Sort by creation date
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      notifications: notifications.slice(0, 20),
      unreadCount: notifications.filter(n => !n.read).length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    // In a real app, you'd store notifications in database
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;