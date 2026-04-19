-- Music Marketplace Schema
-- Run with: supabase db push or psql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Artists (sellers)
CREATE TABLE artists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  slug VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  cover_image_url TEXT,
  stripe_account_id TEXT,
  stripe_onboarding_complete BOOLEAN DEFAULT FALSE,
  social_links JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Albums
CREATE TABLE albums (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id UUID REFERENCES artists(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  genre VARCHAR(100),
  price_cents INTEGER NOT NULL DEFAULT 0,
  minimum_price_cents INTEGER DEFAULT 500,
  is_name_your_price BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT FALSE,
  release_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tracks
CREATE TABLE tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  album_id UUID REFERENCES albums(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255) NOT NULL,
  track_number INTEGER NOT NULL,
  duration_seconds INTEGER,
  audio_preview_url TEXT,
  audio_file_key TEXT,
  is_preview_available BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id UUID REFERENCES artists(id) NOT NULL,
  album_id UUID REFERENCES albums(id) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  stripe_session_id VARCHAR(255) UNIQUE,
  stripe_payment_intent_id VARCHAR(255),
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER DEFAULT 0,
  artist_payout_cents INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  download_token VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (buyers)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_albums_artist_id ON albums(artist_id);
CREATE INDEX idx_albums_is_published ON albums(is_published) WHERE is_published = TRUE;
CREATE INDEX idx_tracks_album_id ON tracks(album_id);
CREATE INDEX idx_orders_artist_id ON orders(artist_id);
CREATE INDEX idx_orders_album_id ON orders(album_id);
CREATE INDEX idx_orders_customer_email ON orders(customer_email);
CREATE INDEX idx_artists_slug ON artists(slug);

-- Row Level Security
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Artists: public read, artist write own
CREATE POLICY "Public read artists" ON artists FOR SELECT USING (true);
CREATE POLICY "Artists manage own record" ON artists FOR ALL USING (auth.uid() = supabase_user_id);

-- Albums: public read published, artist write own
CREATE POLICY "Public read published albums" ON albums FOR SELECT USING (is_published = true);
CREATE POLICY "Artists manage own albums" ON albums FOR ALL USING (
  artist_id IN (SELECT id FROM artists WHERE supabase_user_id = auth.uid())
);

-- Tracks: public read, artist write via album ownership
CREATE POLICY "Public read tracks" ON tracks FOR SELECT USING (true);
CREATE POLICY "Artists manage tracks" ON tracks FOR ALL USING (
  album_id IN (
    SELECT a.id FROM albums a
    JOIN artists ar ON a.artist_id = ar.id
    WHERE ar.supabase_user_id = auth.uid()
  )
);

-- Orders: artist read own, system write
CREATE POLICY "Artists read own orders" ON orders FOR SELECT USING (
  artist_id IN (SELECT id FROM artists WHERE supabase_user_id = auth.uid())
);
CREATE POLICY "Service role can insert orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update orders" ON orders FOR UPDATE USING (true);

-- Users: public read for email lookup
CREATE POLICY "Public read users" ON users FOR SELECT USING (true);
CREATE POLICY "Public insert users" ON users FOR INSERT WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER artists_updated_at BEFORE UPDATE ON artists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER albums_updated_at BEFORE UPDATE ON albums
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tracks_updated_at BEFORE UPDATE ON tracks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();