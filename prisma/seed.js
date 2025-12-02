import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.review.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.address.deleteMany();
  await prisma.worker.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.service.deleteMany();

  console.log('Cleared existing data...');

  // Create services
  const services = await Promise.all([
    prisma.service.create({
      data: {
        name: 'House Cleaning',
        description: 'Professional house cleaning service',
        category: 'Cleaning',
        basePrice: 50.0
      }
    }),
    prisma.service.create({
      data: {
        name: 'Plumbing',
        description: 'Professional plumbing services',
        category: 'Maintenance',
        basePrice: 80.0
      }
    }),
    prisma.service.create({
      data: {
        name: 'Electrical Work',
        description: 'Electrical installation and repair',
        category: 'Maintenance',
        basePrice: 90.0
      }
    }),
    prisma.service.create({
      data: {
        name: 'Gardening',
        description: 'Garden maintenance and landscaping',
        category: 'Outdoor',
        basePrice: 40.0
      }
    })
  ]);

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@homeservice.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'ADMIN'
    }
  });

  // Create sample customer
  const customerPassword = await bcrypt.hash('customer123', 10);
  const customer = await prisma.user.create({
    data: {
      email: 'customer@example.com',
      password: customerPassword,
      name: 'John Doe',
      phone: '+1234567890',
      role: 'CUSTOMER',
      customerProfile: {
        create: {
          addresses: {
            create: {
              type: 'home',
              street: '123 Main St',
              city: 'New York',
              state: 'NY',
              zipCode: '10001',
              isDefault: true
            }
          }
        }
      }
    }
  });

  // Create sample worker (unverified)
  const workerPassword = await bcrypt.hash('worker123', 10);
  const worker = await prisma.user.create({
    data: {
      email: 'worker@example.com',
      password: workerPassword,
      name: 'Jane Smith',
      phone: '+1234567891',
      role: 'WORKER',
      workerProfile: {
        create: {
          profession: 'AC Technician',
          experience: 5,
          hourlyRate: 500.0,
          kycStatus: 'VERIFIED',
          isVerified: true,
          rating: 4.8,
          totalJobs: 25,
          skills: ['AC Installation', 'Gas Refill', 'Copper Piping', 'Electrical Work'],
          portfolio: [
            'https://images.unsplash.com/photo-1581092921461-eab62e97a783?w=400',
            'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400'
          ],
          availability: {
            "monday": { "available": true, "startTime": "09:00", "endTime": "18:00" },
            "tuesday": { "available": true, "startTime": "09:00", "endTime": "18:00" },
            "wednesday": { "available": true, "startTime": "09:00", "endTime": "18:00" },
            "thursday": { "available": true, "startTime": "09:00", "endTime": "18:00" },
            "friday": { "available": true, "startTime": "09:00", "endTime": "18:00" },
            "saturday": { "available": true, "startTime": "10:00", "endTime": "16:00" },
            "sunday": { "available": false }
          }
        }
      }
    }
  });

  // Get the created worker profile ID
  const workerProfile = await prisma.worker.findUnique({
    where: { userId: worker.id }
  });

  // Create some sample bookings for the worker
  const sampleBookings = await Promise.all([
    prisma.booking.create({
      data: {
        customerId: customer.id,
        workerId: workerProfile.id,
        serviceId: services[1].id, // Plumbing
        status: 'COMPLETED',
        scheduledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 2 hours later
        totalAmount: 850.0,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001'
        },
        notes: 'Fixed kitchen sink leak'
      }
    }),
    prisma.booking.create({
      data: {
        customerId: customer.id,
        workerId: workerProfile.id,
        serviceId: services[2].id, // Electrical
        status: 'COMPLETED',
        scheduledAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 1.5 * 60 * 60 * 1000),
        totalAmount: 1200.0,
        address: {
          street: '456 Oak Ave',
          city: 'New York',
          state: 'NY',
          zipCode: '10002'
        },
        notes: 'Installed new ceiling fan'
      }
    })
  ]);

  // Create sample reviews
  await Promise.all([
    prisma.review.create({
      data: {
        bookingId: sampleBookings[0].id,
        customerId: customer.id,
        workerId: workerProfile.id,
        rating: 5,
        comment: 'Excellent work! Very professional and quick.'
      }
    }),
    prisma.review.create({
      data: {
        bookingId: sampleBookings[1].id,
        customerId: customer.id,
        workerId: workerProfile.id,
        rating: 4,
        comment: 'Good service, arrived on time.'
      }
    })
  ]);

  console.log('Database seeded successfully!');
  console.log('Admin:', admin.email, '/ admin123');
  console.log('Customer:', customer.email, '/ customer123');
  console.log('Worker:', worker.email, '/ worker123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });