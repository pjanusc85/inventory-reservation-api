import { createApp } from './app';
import { env } from './config/environment';
import { logger } from './config/logger';
import { getSupabaseClient } from './config/database';

/**
 * Application Entry Point
 *
 * Starts the Express server and handles graceful shutdown
 */

// Verify database connection on startup
async function verifyDatabaseConnection(): Promise<void> {
  try {
    const client = getSupabaseClient();
    const { error } = await client.from('items').select('count').limit(1);

    if (error) {
      logger.error('Database connection failed', { error: error.message });
      throw new Error(`Database connection failed: ${error.message}`);
    }

    logger.info('Database connection verified successfully');
  } catch (error) {
    logger.error('Failed to verify database connection', { error });
    throw error;
  }
}

// Start server
async function startServer(): Promise<void> {
  try {
    // Verify database connection before starting server
    await verifyDatabaseConnection();

    // Create Express app
    const app = createApp();

    // Start listening
    const server = app.listen(env.PORT, () => {
      logger.info(`
╔════════════════════════════════════════════════════════════╗
║  Inventory Reservation API Server                         ║
╟────────────────────────────────────────────────────────────╢
║  Environment: ${env.NODE_ENV.padEnd(42)} ║
║  Port:        ${String(env.PORT).padEnd(42)} ║
║  Base URL:    http://localhost:${env.PORT}${' '.repeat(30)} ║
║  Docs:        http://localhost:${env.PORT}/docs${' '.repeat(25)} ║
║  OpenAPI:     http://localhost:${env.PORT}/openapi.json${' '.repeat(17)} ║
║  Health:      http://localhost:${env.PORT}/health${' '.repeat(23)} ║
╚════════════════════════════════════════════════════════════╝
      `.trim());

      logger.info('Server is ready to accept connections');
    });

    // Graceful shutdown handler
    const gracefulShutdown = (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown...`);

      server.close(() => {
        logger.info('HTTP server closed');

        // Close database connections if needed
        logger.info('Shutting down gracefully');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled Rejection', { reason });
      gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// For Vercel serverless deployment, export the app
// For local development, start the server
if (process.env['VERCEL']) {
  // Serverless environment - Vercel will handle the server
  // The app is exported below
} else {
  // Local development - start the server
  startServer();
}

// Export app for Vercel serverless (must be at top level)
export default createApp();
