-- Custom migration (not generated from the Drizzle schema).
-- 1. Create a profile row whenever a user signs up (Google fills full_name/name/avatar_url).
-- 2. Keep profiles.updated_at current for updates made through the Supabase client.
-- 3. Limit which profile columns clients may update.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Player'
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  RETURN new;
END;
$$;
--> statement-breakpoint
-- Only the auth trigger should call this.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
--> statement-breakpoint
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
-- RLS restricts *which rows* a user can update; column grants restrict *which columns*.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
--> statement-breakpoint
GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;
