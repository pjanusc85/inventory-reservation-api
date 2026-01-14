import { Router } from 'express';
import itemsRoutes from './v1/items.routes';
import reservationsRoutes from './v1/reservations.routes';
import maintenanceRoutes from './v1/maintenance.routes';

/**
 * API Routes Aggregator
 */
const router = Router();

// v1 routes
router.use('/v1/items', itemsRoutes);
router.use('/v1/reservations', reservationsRoutes);
router.use('/v1/maintenance', maintenanceRoutes);

// Health check endpoint
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API version info
router.get('/v1', (_req, res) => {
  res.status(200).json({
    version: '1.0.0',
    api: 'Inventory Reservation API',
  });
});

export default router;
