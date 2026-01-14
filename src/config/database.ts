import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';
import { env } from './environment';

// Singleton Supabase client instance
let supabaseClient: SupabaseClient | null = null;

/**
 * Get or create Supabase client instance (singleton pattern)
 *
 * Configuration:
 * - Uses service role key for admin access (bypasses RLS)
 * - Disables auth (no user sessions needed for API-only application)
 * - Connection pooling managed by Supabase
 */
export const getSupabaseClient = (): SupabaseClient => {
  if (!supabaseClient) {
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public',
      },
    });

    logger.info('Supabase client initialized', {
      url: env.SUPABASE_URL,
      schema: 'public',
    });
  }

  return supabaseClient;
};

/**
 * Test database connection
 *
 * @returns Promise<boolean> - true if connection successful
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    const client = getSupabaseClient();

    // Simple query to test connection
    const { error } = await client.from('items').select('id').limit(1);

    if (error) {
      logger.error('Database connection test failed', { error: error.message });
      return false;
    }

    logger.info('Database connection test successful');
    return true;
  } catch (error) {
    logger.error('Database connection test failed', { error });
    return false;
  }
};

/**
 * Close database connection (for graceful shutdown)
 */
export const closeConnection = (): void => {
  if (supabaseClient) {
    // Supabase client doesn't have an explicit close method
    // Connection pooling is managed by Supabase
    supabaseClient = null;
    logger.info('Supabase client connection closed');
  }
};

export default getSupabaseClient;
