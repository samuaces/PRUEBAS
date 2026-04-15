-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','starter','growth','business')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sites table
CREATE TABLE public.sites (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  tracking_id UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pageviews table
CREATE TABLE public.pageviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  url TEXT,
  referrer TEXT,
  country TEXT,
  device TEXT CHECK (device IN ('desktop','mobile','tablet')),
  browser TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Goals table
CREATE TABLE public.goals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  path_pattern TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Goal completions table
CREATE TABLE public.goal_completions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  goal_id UUID REFERENCES public.goals(id) ON DELETE CASCADE NOT NULL,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX pageviews_site_id_created_at_idx ON public.pageviews(site_id, created_at DESC);
CREATE INDEX pageviews_site_id_idx ON public.pageviews(site_id);
CREATE INDEX sites_user_id_idx ON public.sites(user_id);
CREATE INDEX sites_tracking_id_idx ON public.sites(tracking_id);

-- Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pageviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_completions ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Sites policies
CREATE POLICY "Users can view own sites" ON public.sites
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own sites" ON public.sites
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own sites" ON public.sites
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own sites" ON public.sites
  FOR DELETE USING (user_id = auth.uid());

-- Pageviews policies (service role can insert, users can read own)
CREATE POLICY "Users can view pageviews for own sites" ON public.pageviews
  FOR SELECT USING (
    site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid())
  );
CREATE POLICY "Service role can insert pageviews" ON public.pageviews
  FOR INSERT WITH CHECK (true);

-- Goals policies
CREATE POLICY "Users can manage own goals" ON public.goals
  FOR ALL USING (
    site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid())
  );

-- Goal completions policies
CREATE POLICY "Users can view own goal completions" ON public.goal_completions
  FOR SELECT USING (
    site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid())
  );
CREATE POLICY "Service role can insert goal completions" ON public.goal_completions
  FOR INSERT WITH CHECK (true);

-- Function to auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
