import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Create address
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Customer access required' });
    }

    const { type, street, city, state, zipCode, isDefault } = req.body;
    
    const customer = await prisma.customer.findUnique({
      where: { userId: req.userId }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer profile not found' });
    }

    // If this is set as default, unset other defaults
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

    res.status(201).json(address);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all addresses for customer
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Customer access required' });
    }

    const customer = await prisma.customer.findUnique({
      where: { userId: req.userId },
      include: { addresses: { orderBy: { isDefault: 'desc' } } }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer profile not found' });
    }

    res.json(customer.addresses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update address
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { type, street, city, state, zipCode, isDefault } = req.body;
    
    const customer = await prisma.customer.findUnique({
      where: { userId: req.userId }
    });

    // If this is set as default, unset other defaults
    if (isDefault) {
      await prisma.address.updateMany({
        where: { customerId: customer.id },
        data: { isDefault: false }
      });
    }

    const address = await prisma.address.update({
      where: { 
        id: req.params.id,
        customerId: customer.id 
      },
      data: { type, street, city, state, zipCode, isDefault }
    });

    res.json(address);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete address
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { userId: req.userId }
    });

    await prisma.address.delete({
      where: { 
        id: req.params.id,
        customerId: customer.id 
      }
    });

    res.json({ message: 'Address deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set address as default
router.put('/:id/default', authenticateToken, async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { userId: req.userId }
    });

    // Unset all defaults first
    await prisma.address.updateMany({
      where: { customerId: customer.id },
      data: { isDefault: false }
    });

    // Set this address as default
    const address = await prisma.address.update({
      where: { 
        id: req.params.id,
        customerId: customer.id 
      },
      data: { isDefault: true }
    });

    res.json(address);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;