import { config } from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
config();

// Define environment variable schema with Zod for type-safe validation
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server configuration
  PORT: z.string().default('3000').transform(Number),

  // Supabase configuration (required)
  SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anon key is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Supabase service role key is required'),

  // Reservation configuration
  RESERVATION_EXPIRY_MINUTES: z.string().default('10').transform(Number),

  // Logging configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_SQL_QUERIES: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  // CORS configuration
  ALLOWED_ORIGINS: z.string().default('*'),
});

// Parse and validate environment variables
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errorMessage = `❌ Invalid environment variables: ${JSON.stringify(parsed.error.format(), null, 2)}`;
  console.error(errorMessage);
  // Don't use process.exit() in serverless environments - throw instead
  throw new Error(errorMessage);
}

// Export validated environment variables
export const env = parsed.data;

// Export reservation expiry in milliseconds (for convenience)
export const RESERVATION_EXPIRY_MS = env.RESERVATION_EXPIRY_MINUTES * 60 * 1000;

// Log environment on startup
if (env.NODE_ENV !== 'test') {
  console.log('✅ Environment variables validated successfully');
  console.log(`📝 Environment: ${env.NODE_ENV}`);
  console.log(`🚀 Port: ${env.PORT}`);
  console.log(`⏱️  Reservation expiry: ${env.RESERVATION_EXPIRY_MINUTES} minutes`);
}
