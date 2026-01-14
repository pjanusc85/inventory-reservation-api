import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/logger.middleware';
import { errorHandler } from './middleware/error.middleware';
import routes from './routes';
import { logger } from './config/logger';

/**
 * Creates and configures the Express application
 */
export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for Swagger UI
  }));

  // CORS middleware
  app.use(cors({
    origin: process.env['NODE_ENV'] === 'production'
      ? ['https://inventory-reservation-api-eosin.vercel.app']
      : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  }));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware
  app.use(requestLogger);

  // API Documentation - Swagger UI
  // Use CDN-hosted Swagger UI for serverless compatibility
  app.get('/docs', (_req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Inventory Reservation API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true
      });
    };
  </script>
</body>
</html>`;
    res.send(html);
  });

  // OpenAPI JSON endpoint - serve pre-generated spec
  app.get('/openapi.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');

    try {
      // Try to import generated spec (created at build time)
      const { generatedSpec } = require('./swagger/generated-spec');
      res.json(generatedSpec);
    } catch (error) {
      // Fallback to runtime generation for development
      const { swaggerSpec } = require('./swagger/swagger.config');
      res.json(swaggerSpec);
    }
  });

  // Mount API routes
  app.use('/', routes);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found',
      },
    });
  });

  // Global error handling middleware (must be last)
  app.use(errorHandler);

  logger.info('Express application configured successfully');

  return app;
}
