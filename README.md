# jimmyyao-admin

Unified admin center for jimmyyao.com — admin.jimmyyao.com

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Auth**: Supabase Auth (SSR)
- **Database**: Supabase (shared with study.jimmyyao.com & forum.jimmyyao.com)

## Getting Started

### Prerequisites

- Node.js >= 22
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/yaojunxiong/jimmyyao-admin.git
cd jimmyyao-admin

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

See `.env.example` for all required variables.

| Variable | Required | Client-safe | Description |
|----------|----------|-------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | **No** | Service role key (server only) |
| `NEXT_PUBLIC_SITE_URL` | Yes | Yes | Canonical site URL |

### Scripts

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Project Structure

```
src/
  app/
    (admin)/          # Protected admin routes
      dashboard/      # Dashboard page
      study/          # Study management
      forum/          # Forum management
      users/          # User management
      workflows/      # Workflow management
      visitors/       # Visitor records
      system/         # System settings
      logs/           # System logs
    login/            # Login page
    layout.tsx        # Root layout
    page.tsx          # Home (redirects to /dashboard)
  components/
    admin-layout.tsx  # Admin layout wrapper
    sidebar.tsx       # Sidebar navigation
    topbar.tsx        # Top bar with user info
  lib/
    admin-auth.ts     # Admin permission check
    supabase/         # Supabase client utilities
  middleware.ts       # Auth middleware
```

## Deployment

The project is automatically deployed via Vercel:

1. Push to the `main` branch on GitHub
2. Vercel auto-deploys to admin.jimmyyao.com
3. Environment variables are configured in Vercel dashboard

## Architecture

See [docs/admin-center-architecture.md](docs/admin-center-architecture.md) for detailed architecture documentation.
