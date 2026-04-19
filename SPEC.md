# Music Marketplace — Architecture Specification

**Version:** 1.0  
**Status:** Draft / In Progress  
**Target:** Multi-seller music marketplace on GitHub Pages + Zo Space API

---

## 1. Concept & Vision

A self-serve marketplace where independent artists sign up, upload their music, and sell directly to fans. No platform fees by default — artists keep 100% of revenue. The platform handles the storefront presentation, file hosting, and payment processing via Stripe Connect.

**Core Principles:**
- Self-serve onboarding: artists register, configure their store, upload music
- Per-artist storefronts: each artist gets `gots.li/{artist-slug}` (or GitHub Pages equivalent)
- Audio previews: optional, controlled by artist
- No mandatory platform cut (pro features may come later)
- Hosting: GitHub Pages (static) + Zo Space API (dynamic)

---

## 2. Tech Stack

### Frontend (Static, GitHub Pages)
- **Vanilla HTML/CSS/JS** — no build step, maximum portability
- Single-page apps per route, shareable URLs
- Audio playback via native `<audio>` tag with optional previews

### API Layer (Zo Space)
- **Node.js + TypeScript** — existing `/api` structure maintained
- **Hono** framework for route handlers
- Auth via **Supabase Auth** (email magic links, OAuth)
- Database via **Supabase Postgres** (artists, albums, tracks, orders, users)
- File storage: **Cloudflare R2** (audio files, cover art) with presigned URLs
  - Fallback: Supabase Storage (if R2 setup is complex)
- Payments: **Stripe Connect** (artist onboarding, checkout, payouts)
- Email: Reserved for future (no email service required initially)

### External Services
| Service | Purpose | Free Tier |
|---------|---------|-----------|
| Supabase | Auth + Database | Yes (< 50k MAU) |
| Cloudflare R2 | Audio + cover art storage | 10GB egress/mo |
| Stripe Connect | Artist payouts | No monthly fee, 2.9% + $0.30/sale |
| GitHub Pages | Static frontend hosting | Free |

---

## 3. Data Model

### Supabase Tables

```sql
-- Artists (sellers)
artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  slug VARCHAR(64) UNIQUE NOT NULL,          -- URL: /artist/{slug}
  name VARCHAR(255) NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  cover_image_url TEXT,
  stripe_account_id TEXT,                    -- Stripe Connect account
  stripe_onboarding_complete BOOLEAN DEFAULT FALSE,
  social_links JSONB DEFAULT '{}',           -- {twitter, instagram, website}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Albums
albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,    -- 0 = name-your-price
  minimum_price_cents INTEGER DEFAULT 500,  -- for name-your-price
  is_name_your_price BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT FALSE,
  release_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Tracks
tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID REFERENCES albums(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  track_number INTEGER NOT NULL,
  duration_seconds INTEGER,
  audio_preview_url TEXT,                    -- optional 30-sec preview
  audio_file_key TEXT,                      -- R2 key for full track
  is_preview_available BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Orders
orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID REFERENCES artists(id),
  album_id UUID REFERENCES albums(id),
  customer_email VARCHAR(255) NOT NULL,
  stripe_session_id VARCHAR(255) UNIQUE,
  stripe_payment_intent_id VARCHAR(255),
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER DEFAULT 0,     -- 0 by default
  artist_payout_cents INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',    -- pending, completed, refunded
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Users (buyers) — lightweight, no auth required for purchases
users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### Row-Level Security (Supabase)
- Artists can read/write their own artist record
- Artists can read/write their own albums and tracks
- Orders are readable by the artist who owns the album
- Public read access for browsing published albums/tracks

---

## 4. Pages & Routes

### Public Pages (Static, GitHub Pages)

| Path | Description |
|------|-------------|
| `/` | Homepage — featured artists, recent releases, browse all |
| `/browse.html` | Full marketplace browse — filter by genre, price |
| `/artist/{slug}.html` | Individual artist storefront |
| `/album/{id}.html` | Album detail page with tracklist + buy button |
| `/register.html` | Artist self-service registration |
| `/success.html` | Order confirmation after payment |
| `/cancel.html` | Cancelled payment page |

### Dashboard Pages (Static, GitHub Pages + Supabase Auth)

| Path | Description |
|------|-------------|
| `/dashboard/` | Artist dashboard — overview, recent sales |
| `/dashboard/albums/` | Manage albums |
| `/dashboard/albums/new.html` | Create new album |
| `/dashboard/albums/{id}/edit.html` | Edit album, upload tracks |
| `/dashboard/settings/` | Profile, stripe connect, social links |
| `/login.html` | Supabase Auth UI |

### API Routes (Zo Space)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/callback` | GET | None | Supabase OAuth callback |
| `/api/artists` | POST | None | Register new artist |
| `/api/artists/:slug` | GET | None | Get artist by slug (public) |
| `/api/artists/me` | GET | Artist | Get current artist profile |
| `/api/artists/me` | PATCH | Artist | Update artist profile |
| `/api/albums` | POST | Artist | Create album |
| `/api/albums` | GET | None | List published albums |
| `/api/albums/:id` | GET | None | Get album details |
| `/api/albums/:id` | PUT | Artist | Update album |
| `/api/albums/:id/publish` | POST | Artist | Publish album |
| `/api/tracks` | POST | Artist | Add track to album |
| `/api/tracks/:id` | PUT | Artist | Update track |
| `/api/tracks/:id` | DELETE | Artist | Delete track |
| `/api/upload/cover` | POST | Artist | Upload cover image (presigned URL) |
| `/api/upload/audio` | POST | Artist | Upload audio file (presigned URL) |
| `/api/checkout` | POST | None | Create Stripe Checkout session |
| `/api/stripe/connect` | GET | Artist | Get Stripe Connect onboarding link |
| `/api/stripe/connect/callback` | GET | Artist | Handle Stripe Connect callback |
| `/api/stripe/webhook` | POST | Stripe | Stripe webhook handler |
| `/api/orders` | GET | Artist | List artist's orders |

---

## 5. Auth Strategy

### Supabase Auth
- **Email Magic Links** — no password, link expires in 1 hour
- **OAuth** — Google, GitHub (optional, future)
- Session stored in Supabase, accessed via `@supabase/ssr` on dashboard pages
- API routes validate session via Supabase client

### Artist Registration Flow
1. Artist visits `/register.html`
2. Submits email → Supabase sends magic link
3. Artist clicks link → confirmed Supabase account
4. Form collects: name, slug, bio
5. API creates `artists` record linked to `supabase_user_id`
6. Artist redirected to `/dashboard/`

### Dashboard Auth Guard
- Static JS checks for Supabase session on page load
- If no session → redirect to `/login.html`
- Session passed to API requests via Authorization header

---

## 6. Payment Flow (Stripe Connect)

### Artist Onboarding
1. Artist visits `/dashboard/settings/`
2. Clicks "Connect Stripe" → API calls `stripe.accounts.create()` (Express account)
3. API returns onboarding URL from `stripe.accounts.createLoginLink()`
4. Artist completes Stripe onboarding
5. Webhook (`account.updated`) updates `stripe_onboarding_complete = true`

### Checkout Flow
1. Buyer clicks "Buy" on album page
2. Frontend calls `POST /api/checkout` with `album_id`, `customer_email`
3. API creates Stripe Checkout Session with:
   - `payment_intent_data.application_fee_amount = 0` (no platform fee)
   - `payment_intent_data.transfer_data.destination = artist.stripe_account_id`
4. Buyer pays on Stripe → webhook fires `checkout.session.completed`
5. Webhook creates `orders` record with artist payout calculated
6. Buyer redirected to `/success.html` with download link

### Payout Schedule
- Stripe transfers funds to artist's connected account on standard schedule (2-day rolling)
- Platform fee = 0 by default; extensible for premium features

---

## 7. File Upload Flow

### Cover Images
1. Artist selects image in dashboard form
2. Frontend calls `POST /api/upload/cover` → API returns R2 presigned PUT URL
3. Frontend uploads directly to R2 via presigned URL
4. Frontend sends final R2 object URL to album create/update API

### Audio Files
1. Artist drops audio files in dashboard
2. Frontend calls `POST /api/upload/audio` per file → API returns presigned PUT URL
3. Frontend uploads directly to R2
4. Frontend sends R2 keys + metadata to track create API

### R2 Bucket Structure
```
/artists/{artist_id}/covers/{album_id}/{filename}
/artists/{artist_id}/audio/{album_id}/{track_id}/{filename}
```

### Cloudflare R2 + Workers (Future)
- For gots.li domain: Cloudflare Worker handles presigned URLs
- Worker validates session, generates time-limited presigned PUT/GET URLs
- Presigned URLs expire after 15 minutes

---

## 8. Frontend Structure

```
/
├── index.html                    # Homepage
├── browse.html                   # Browse all albums
├── register.html                 # Artist registration
├── login.html                    # Supabase Auth UI
├── success.html                  # Order success
├── cancel.html                   # Order cancelled
├── artist/
│   └── {slug}.html               # Artist storefront (generated/dynamic)
├── album/
│   └── {id}.html                 # Album page (generated/dynamic)
├── dashboard/
│   ├── index.html                # Dashboard home
│   ├── albums.html               # Album list
│   ├── albums-new.html           # New album form
│   ├── albums-edit.html          # Edit album
│   └── settings.html             # Profile + Stripe settings
├── assets/
│   ├── css/
│   │   └── styles.css            # Shared styles
│   ├── js/
│   │   ├── api.js                # API client
│   │   ├── auth.js               # Auth helpers
│   │   ├── router.js             # Simple client-side router
│   │   └── utils.js              # Helpers
│   └── images/
└── api/                          # Zo Space API routes
    ├── auth/
    │   └── callback.ts
    ├── artists/
    │   ├── index.ts              # GET (list), POST (create)
    │   └── [slug].ts             # GET by slug
    ├── artists-me.ts             # GET/PATCH current artist
    ├── albums/
    │   ├── index.ts              # GET (list), POST (create)
    │   └── [id].ts              # GET, PUT, DELETE
    ├── tracks/
    │   ├── index.ts              # POST (create)
    │   └── [id].ts              # PUT, DELETE
    ├── upload/
    │   ├── cover.ts
    │   └── audio.ts
    ├── checkout.ts               # Stripe checkout
    ├── stripe/
    │   ├── connect.ts           # Get onboarding link
    │   ├── connect-callback.ts   # Handle callback
    │   └── webhook.ts           # Stripe webhook
    └── orders.ts                # List orders

supabase/
├── config.toml                   # Supabase CLI config
├── migrations/
│   └── 001_initial_schema.sql   # DB schema
└── functions/
    └── seed.ts                  # Optional seed data
```

---

## 9. Implementation Phases

### Phase 1: Foundation (Current)
- [x] Create SPEC.md
- [x] Branch `marketplace`
- [ ] Set up directory structure
- [ ] Create Supabase schema migration
- [ ] Build base HTML pages (homepage, register, dashboard skeleton)
- [ ] Build core API routes

### Phase 2: Artist Onboarding
- [ ] Artist registration form + API
- [ ] Supabase Auth integration
- [ ] Stripe Connect onboarding flow
- [ ] Dashboard profile page

### Phase 3: Album & Track Management
- [ ] Album CRUD API
- [ ] Track upload API (presigned R2)
- [ ] Album creation dashboard
- [ ] Cover image upload

### Phase 4: Public Storefront
- [ ] Artist storefront page
- [ ] Album detail page with tracklist
- [ ] Browse page with filtering
- [ ] Homepage with featured artists

### Phase 5: Checkout & Payments
- [ ] Stripe Checkout for albums
- [ ] Webhook handler for order completion
- [ ] Artist order history in dashboard
- [ ] Download link delivery

### Phase 6: Polish
- [ ] Audio preview playback
- [ ] Mobile responsiveness pass
- [ ] GitHub Pages deployment
- [ ] gots.li domain setup

---

## 10. Configuration

### Environment Variables (Zo Settings → Advanced)

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
CLOUDFLARE_R2_ACCOUNT_ID=xxx
CLOUDFLARE_R2_ACCESS_KEY_ID=xxx
CLOUDFLARE_R2_SECRET_ACCESS_KEY=xxx
CLOUDFLARE_R2_BUCKET=music-marketplace
CLOUDFLARE_R2_PUBLIC_URL=https://xxx.r2.dev
BASE_URL=https://snugos.github.io/music-store
```

### Stripe Connect Events
- `account.updated` → update `stripe_onboarding_complete`
- `checkout.session.completed` → create order, trigger delivery

---

## 11. Constraints & Notes

- **No platform fee by default** — this is a design choice. `application_fee_amount = 0` in Stripe Checkout.
- **Audio previews are optional** — artists choose whether to upload preview clips. Full files always available post-purchase.
- **Supabase free tier limits** — auth + database sufficient for early marketplace. Scale DB if needed.
- **GitHub Pages limitations** — no server-side logic. All dynamic data loaded via API calls from browser JS.
- **Zo Space for API** — API routes run on Zo Space, not Vercel. Update `vercel.json` references.