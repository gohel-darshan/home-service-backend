import { body, validationResult } from 'express-validator';

// Validation middleware
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// User registration validation
export const validateUserRegistration = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('phone').optional().isMobilePhone(),
  body('role').isIn(['CUSTOMER', 'WORKER']).withMessage('Invalid role'),
  validate
];

// Booking validation
export const validateBooking = [
  body('serviceId').isUUID().withMessage('Invalid service ID'),
  body('scheduledAt').isISO8601().withMessage('Invalid date format'),
  body('totalAmount').isFloat({ min: 0 }).withMessage('Invalid amount'),
  body('address').isObject().withMessage('Address is required'),
  body('address.street').notEmpty().withMessage('Street address is required'),
  body('address.city').notEmpty().withMessage('City is required'),
  validate
];

// Service validation
export const validateService = [
  body('name').trim().isLength({ min: 2 }).withMessage('Service name is required'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('category').notEmpty().withMessage('Category is required'),
  body('basePrice').isFloat({ min: 0 }).withMessage('Invalid price'),
  validate
];

// Review validation
export const validateReview = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().isLength({ max: 500 }).withMessage('Comment too long'),
  body('workerId').isUUID().withMessage('Invalid worker ID'),
  validate
];

// Complaint validation
export const validateComplaint = [
  body('title').trim().isLength({ min: 5 }).withMessage('Title must be at least 5 characters'),
  body('description').trim().isLength({ min: 20 }).withMessage('Description must be at least 20 characters'),
  body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  validate
];