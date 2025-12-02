import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Create review
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { workerId, bookingId, rating, comment } = req.body;
    
    const review = await prisma.review.create({
      data: {
        customerId: req.userId,
        workerId,
        bookingId,
        rating: parseInt(rating),
        comment
      },
      include: {
        customer: { select: { name: true } },
        worker: {
          include: {
            user: { select: { name: true } }
          }
        }
      }
    });
    
    // Update worker rating
    const workerReviews = await prisma.review.findMany({
      where: { workerId }
    });
    
    const avgRating = workerReviews.reduce((sum, r) => sum + r.rating, 0) / workerReviews.length;
    
    await prisma.worker.update({
      where: { id: workerId },
      data: { rating: avgRating }
    });
    
    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get worker reviews
router.get('/worker/:workerId', async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { workerId: req.params.workerId },
      include: {
        customer: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;