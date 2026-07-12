# Admin Center Architecture — admin.jimmyyao.com

## 1. Why a Separate Admin Domain

Previously, admin functionality was scattered across study.jimmyyao.com/admin/* paths.
As the platform grows (study system, forum, visitor workflows, etc.), a dedicated admin
domain provides:

- **Clear separation of concerns** — admin features are decoupled from frontend apps
- **Independent deployment** — admin changes don't affect study/forum deployments
- **Focused security** — admin-only auth, audit logging, and access controls
- **Scalable architecture** — new subsystems (analytics, monitoring, etc.) are added without touching frontends
- **Consistent UX** — unified admin interface across all subsystems

## 2. Current Transition State

| State | Description |
|-------|-------------|
| ✅ | admin.jimmyyao.com project scaffold created |
| ✅ | GitHub repo: yaojunxiong/jimmyyao-admin |
| ✅ | Vercel project: jimmyyao-admin |
| ⬜ | DNS CNAME configured for admin.jimmyyao.com |
| ⬜ | Supabase auth cross-domain cookie sharing verified |
| ⬜ | Admin pages at study.jimmyyao.com/admin/* still active |
| ⬜ | Real admin features migrated from study.jimmyyao.com |

## 3. Domain Responsibilities

| Domain | Purpose | Status |
|--------|---------|--------|
| www.jimmyyao.com | Main portal / personal homepage / project entry | ✅ Live |
| study.jimmyyao.com | Japanese learning system frontend | ✅ Live |
| forum.jimmyyao.com | Learning community forum | ✅ Live |
| admin.jimmyyao.com | Unified admin center | 🚧 This project |
| auth.jimmyyao.com | Dedicated auth service | ⬜ Future |

## 4. Migration Plan — study.jimmyyao.com Admin

Current admin routes under study.jimmyyao.com/admin/* will be migrated:

| Route | Priority | Migration Status |
|-------|----------|------------------|
| /admin/dashboard | P0 | 🚧 Skeleton in admin project |
| /admin/visitors | P0 | 📍 Placeholder page |
| /admin/workflows | P0 | 📍 Placeholder page |
| /admin/system | P0 | 📍 Placeholder page |
| /admin/users | P1 | 📍 Placeholder page |
| /admin/forum | P1 | 📍 Placeholder page |
| /admin/activity | P1 | ⬜ Future |
| /admin/checkins | P1 | ⬜ Future |
| /admin/recordings | P2 | ⬜ Future |
| /admin/email-logs | P2 | ⬜ Future |
| /admin/monitor | P2 | ⬜ Future |
| /admin/recitation-videos | P2 | ⬜ Future |
| /admin/recording-health | P3 | ⬜ Future |
| /admin/membership-requests | P3 | ⬜ Future |
| /admin/knowledge-base | P3 | ⬜ Future |
| /admin/lessons/* | P3 | ⬜ Future |

## 5. Forum Management Migration

forum.jimmyyao.com currently uses admin.jimmyyao.com tabs for moderation:

- Post moderation (approve/reject/hide/delete)
- Reply management
- Board configuration
- User reports

These will be migrated to dedicated pages under admin.jimmyyao.com/forum/*.

## 6. Supabase Authentication Sharing

All subdomains share the same Supabase project:

- **Supabase Project**: `ycjuceortcduakxscfes`
- **Auth Strategy**: Cross-subdomain cookies via `.jimmyyao.com` domain
- **Cookie Config**: `domain: '.jimmyyao.com'`, `sameSite: 'lax'`, `secure: true` (prod)
- **Client Keys**: `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, safe for client)
- **Service Role**: `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never exposed)

## 7. Admin Permission System

Admin access is evaluated server-side in this order:

1. **Local Dev Bypass** (dev only): `NEXT_PUBLIC_ENABLE_LOCAL_ADMIN_BYPASS=true`
2. **Database Role** (production authority): `user_roles` table with `role = 'admin'`

The check is performed server-side in `src/lib/admin-auth.ts`. Unauthenticated users
are redirected to `/login`. Non-admin users see an "Access Denied" page. Production
access is never granted from an email allowlist.

## 8. Deployment Architecture

```
GitHub: yaojunxiong/jimmyyao-admin
         ↓ push
Vercel Project: jimmyyao-admin
         ↓
Domain: admin.jimmyyao.com
         ↓ (CNAME → cname.vercel-dns.com)
Porkbun DNS
```

**Environment Variables** (set in Vercel dashboard):

| Variable | Visibility | Description |
|----------|-----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Admin operations (if needed) |
| `NEXT_PUBLIC_SITE_URL` | Public | Canonical site URL |

## 9. Migration Roadmap

### Phase 1 — Foundation (this sprint)
- [x] Create admin project with Next.js App Router
- [x] Set up GitHub repo and Vercel project
- [x] Configure admin.jimmyyao.com domain
- [x] Implement Supabase auth sharing
- [x] Build admin layout with sidebar navigation
- [x] Implement admin permission check
- [x] Create placeholder pages for all modules

### Phase 2 — Read-Only Migration
- [ ] Migrate dashboard stats from study project
- [ ] Migrate visitor records read-only view
- [ ] Migrate workflow list read-only view
- [ ] Migrate user list read-only view
- [ ] Migrate system status view
- [ ] Migrate forum moderation read-only view

### Phase 3 — Write Operations
- [ ] Workflow approval actions
- [ ] Forum moderation actions
- [ ] User role management
- [ ] System settings configuration
- [ ] Email log viewing

### Phase 4 — Advanced Features
- [ ] Real-time monitoring dashboard
- [ ] Audit logging
- [ ] Deployment management
- [ ] Analytics and reporting
- [ ] Multi-admin collaboration

## 10. Technical Decisions

- **Next.js App Router**: Server Components for data fetching, Client Components for interactivity
- **No i18n**: Admin UI is primarily Chinese (zh-CN), no internationalization needed yet
- **Minimal dependencies**: Keep the project lean — avoid unnecessary libraries
- **No complex animations**: Admin UI prioritizes speed and clarity
- **Mobile responsive**: Basic responsive layout, admin is primarily desktop-focused
