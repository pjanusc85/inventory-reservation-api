# Setup Guide

This guide walks you through setting up the Inventory Reservation API from scratch.

## Prerequisites

- Node.js 18+ and npm 9+
- A Supabase account (free tier works)
- Git (for version control)

## Step 1: Install Dependencies ✅ COMPLETED

Dependencies have already been installed.

```bash
npm install
```

## Step 2: Set Up Supabase Database

### 2.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign in or create an account
3. Click "New Project"
4. Fill in project details:
   - Name: `inventory-reservation-api` (or any name you prefer)
   - Database Password: Choose a strong password (save this!)
   - Region: Choose the closest region to you
5. Click "Create new project" and wait for setup to complete (~2 minutes)

### 2.2 Run the Database Migration

1. Once your project is ready, click on the **SQL Editor** in the left sidebar
2. Click "New query"
3. Open the `migration.sql` file in this project
4. Copy the entire contents and paste it into the SQL Editor
5. Click "Run" to execute the migration
6. You should see a success message

This creates:
- `items` table with constraints and indexes
- `reservations` table with status enum, foreign keys, and indexes
- All necessary database constraints for concurrency control

### 2.3 Get Your Supabase Credentials

1. In your Supabase project, click on **Settings** (gear icon in sidebar)
2. Click on **API** in the settings menu
3. You'll need three values:
   - **Project URL** (under "Project URL")
   - **anon public** key or **publishable** key (see note below)
   - **service_role** key or **secret** key (click "Reveal" to see it)

**Note on API Keys:**
- **New projects (recommended):** Use the new `sb_publishable_...` and `sb_secret_...` keys for better security and easier rotation
- **Legacy projects:** You may see "Legacy anon, service_role API keys" - these still work fine
- **Both formats are supported** - no code changes needed when switching between them

⚠️ **IMPORTANT**: The `service_role` or `secret` key has admin access. Never commit it to version control or expose it publicly!

## Step 3: Configure Environment Variables

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Open `.env` and fill in your Supabase credentials:
```env
# Server Configuration
NODE_ENV=development
PORT=3000

# Supabase Configuration
# Note: Supports both legacy (JWT) and new (sb_publishable_/sb_secret_) key formats
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here  # or sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here  # or sb_secret_...

# Reservation Configuration
RESERVATION_EXPIRY_MINUTES=10
```

Replace:
- `https://your-project-id.supabase.co` with your Project URL
- `your-anon-key-here` with your anon public key (or publishable key if using new format)
- `your-service-role-key-here` with your service_role key (or secret key if using new format)

## Step 4: Build the Project ✅ COMPLETED

The TypeScript build has already been verified successfully.

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

## Step 5: Start the Development Server

Start the server in development mode with hot reload:

```bash
npm run dev
```

You should see:
```
╔════════════════════════════════════════════════════════════╗
║  Inventory Reservation API Server                         ║
╟────────────────────────────────────────────────────────────╢
║  Environment: development                                  ║
║  Port:        3000                                         ║
║  Base URL:    http://localhost:3000                        ║
║  Docs:        http://localhost:3000/docs                   ║
║  OpenAPI:     http://localhost:3000/openapi.json           ║
║  Health:      http://localhost:3000/health                 ║
╚════════════════════════════════════════════════════════════╝
```

## Step 6: Test the API

### 6.1 Health Check

Open your browser or use curl:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-09T12:00:00.000Z",
  "uptime": 5.123
}
```

### 6.2 Explore the API with Swagger

Open your browser and navigate to:
```
http://localhost:3000/docs
```

You'll see the interactive Swagger UI where you can:
- View all endpoints
- Read endpoint documentation
- Try out API requests directly in the browser

### 6.3 Test Basic Functionality

**Create an item:**
```bash
curl -X POST http://localhost:3000/v1/items \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Widget",
    "initial_quantity": 10
  }'
```

**Create a reservation:**
```bash
curl -X POST http://localhost:3000/v1/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "item_id": "ITEM_ID_FROM_PREVIOUS_RESPONSE",
    "customer_id": "customer-123",
    "quantity": 2
  }'
```

## Step 7: Run Concurrency Tests

This is the **critical test** required by the assignment.

**Important**: Make sure the dev server is running first!

```bash
# In a new terminal window
npm run test:concurrency
```

This test:
1. Creates an item with quantity 50
2. Makes 200 concurrent reservation requests
3. Verifies exactly 50 succeed and 150 fail with 409 status
4. Proves the concurrency guarantees work correctly

Expected output:
```
✅ CONCURRENCY TEST PASSED
✓ Exactly 50 reservations succeeded
✓ Exactly 150 requests failed with 409 Insufficient Quantity
✓ No unexpected errors occurred
✓ Invariant maintained: reserved + confirmed ≤ total
```

### Run Race Condition Tests

```bash
npm run test:race
```

This tests:
- Confirm vs Expire race conditions
- Cancel vs Confirm race conditions
- Multiple concurrent expire operations
- Concurrent cancellations
- Concurrent confirmations

## Step 8: Deploy to Vercel

### 8.1 Install Vercel CLI

```bash
npm install -g vercel
```

### 8.2 Login to Vercel

```bash
vercel login
```

### 8.3 Deploy

```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Choose your account
- Link to existing project? **N**
- Project name? Press Enter to accept default
- In which directory is your code located? Press Enter (current directory)
- Want to override settings? **N**

### 8.4 Set Environment Variables

After deployment, add your environment variables to Vercel:

```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
```

For each variable:
1. Paste the value when prompted
2. Select: Production, Preview, and Development

### 8.5 Deploy to Production

```bash
vercel --prod
```

You'll get a production URL like: `https://your-project.vercel.app`

### 8.6 Test Deployed API

```bash
# Health check
curl https://your-project.vercel.app/health

# View Swagger docs
# Open in browser: https://your-project.vercel.app/docs
```

### 8.7 Run Concurrency Test Against Production

```bash
API_BASE_URL=https://your-project.vercel.app npm run test:concurrency
```

## Step 9: Record Demo Video

Record a 5-10 minute screen recording showing:

1. **Local Development** (2-3 min)
   - Start the server with `npm run dev`
   - Open Swagger UI at `http://localhost:3000/docs`
   - Create an item with quantity 5
   - Create a reservation for quantity 2
   - Confirm the reservation
   - Show database state in Supabase (SQL Editor: `SELECT * FROM items; SELECT * FROM reservations;`)

2. **Concurrency Test** (2-3 min)
   - Run `npm run test:concurrency`
   - Show the test output
   - Explain what the test proves

3. **Expiration/Cancellation** (1-2 min)
   - Create a reservation
   - Cancel it
   - Create another reservation
   - Call the expire endpoint: `POST /v1/maintenance/expire-reservations`
   - Show database state after expiration

4. **Production Deployment** (1-2 min)
   - Show the deployed URL
   - Open Swagger docs on production
   - Test one endpoint (e.g., create item)
   - Show it works

### Recommended Tools
- **macOS**: QuickTime Player (File → New Screen Recording)
- **Windows**: Xbox Game Bar (Win + G)
- **Linux**: OBS Studio
- **Cross-platform**: Loom (free for 5-minute videos)

## Troubleshooting

### Server won't start - Database connection failed
- Verify your `.env` file has correct Supabase credentials
- Check that the migration was run successfully in Supabase
- Ensure your Supabase project is active (not paused)

### TypeScript errors during build
- Run `npm install` to ensure all dependencies are installed
- Delete `dist/` and `node_modules/` and reinstall: `rm -rf dist node_modules && npm install`

### Concurrency test fails
- Ensure the dev server is running (`npm run dev`)
- Check that the database migration created the necessary constraints
- Verify you're not hitting rate limits (especially on production)

### Vercel deployment fails
- Ensure `vercel.json` exists with correct configuration
- Check that all environment variables are set in Vercel
- Review build logs: `vercel logs`

## Next Steps

Once you've completed all steps above:

1. ✅ Local development working
2. ✅ Concurrency tests passing
3. ✅ Deployed to Vercel
4. ✅ Demo video recorded

Submit the following:
- Link to GitHub repository (if applicable)
- Deployed Vercel URL
- Demo video (upload to YouTube/Loom or share file)
- Any additional notes or design decisions

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

## Support

If you encounter any issues not covered in this guide, check:
- `README.md` for project overview
- `ARCHITECTURE.md` for system design details
- `DATABASE_SCHEMA.md` for database structure
- `API_SPECIFICATION.md` for endpoint documentation
