-- =============================================================================
-- CSM · Phase 0 · Hotfix sécurité (compatible BACO)
-- -----------------------------------------------------------------------------
-- Corrige :
--   S1  escalade de privilèges via UPDATE profiles.role / permissions / banned_until
--   S2  11 tables sans RLS + 6 tables métier ouvertes à anon via des policies `public … true`
--   S3  policies et fonctions qui font confiance à user_metadata (modifiable par l'utilisateur)
--   S6  fonctions SECURITY DEFINER exécutables par anon, sans contrôle de l'appelant,
--       search_path non fixé, vue SECURITY DEFINER
--
-- Principe de compatibilité : le comportement des utilisateurs légitimes ne change pas.
-- `sync_user_role` maintient user_metadata.role = profiles.role ; on lit maintenant
-- la source de vérité (profiles) au lieu de la copie falsifiable (JWT).
--
-- Hors périmètre (étapes ultérieures, nécessitent un patch applicatif) :
--   - buckets Storage publics `documents` / `movements_pdf` -> URLs signées
--   - nettoyage des 254 policies permissives redondantes (perf)
--   - protection des mots de passe compromis : à activer dans le dashboard Auth
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Helpers de rôle (source de vérité : public.profiles)
-- -----------------------------------------------------------------------------
create or replace function public.has_any_role(variadic roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = any (roles) from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function public.has_any_role(text[]) is
  'Vrai si le rôle de l''utilisateur courant (profiles.role) est dans la liste. Ne jamais utiliser user_metadata.';

-- is_staff() : même sémantique qu'avant (admin / moderator) mais lue depuis profiles.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_any_role('admin', 'moderator');
$$;

-- -----------------------------------------------------------------------------
-- 2. S1 — Garde des colonnes privilégiées de profiles
--    SECURITY INVOKER volontaire : current_user vaut 'authenticated' / 'anon' pour
--    une requête PostgREST, et 'postgres' quand l'écriture vient d'une fonction
--    SECURITY DEFINER (RPC admin, triggers) ou du service_role.
-- -----------------------------------------------------------------------------
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new; -- backend / service_role / fonctions SECURITY DEFINER
  end if;

  if public.has_any_role('admin', 'sysop') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.role, 'user') <> 'user'
       or coalesce(new.permissions, '{}'::jsonb) <> '{}'::jsonb
       or new.banned_until is not null then
      raise exception 'Création de profil privilégié refusée' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.permissions is distinct from old.permissions
     or new.banned_until is distinct from old.banned_until then
    raise exception 'Modification du rôle, des permissions ou du bannissement réservée aux administrateurs'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- -----------------------------------------------------------------------------
-- 3. S3 — Policies basées sur user_metadata -> profiles
--    Mêmes noms, même portée ; seule la source du rôle change.
-- -----------------------------------------------------------------------------

-- 3a. "Enable insert for authenticated users only" (FOR ALL, admin) sur les référentiels
do $$
declare
  t text;
begin
  foreach t in array array[
    'chauffeurs_bus', 'contacts_bus', 'contacts_repertoire', 'ligne_data',
    'lignes_bus', 'pn_data', 'societes_bus', 'spi_data', 'taxis'
  ] loop
    execute format('drop policy if exists "Enable insert for authenticated users only" on public.%I', t);
    execute format(
      'create policy "Enable insert for authenticated users only" on public.%I
         as permissive for all to authenticated
         using ((select public.has_any_role(''admin'')))
         with check (true)', t);
  end loop;
end $$;

-- 3b. changelog
drop policy if exists "Allow admin delete access" on public.changelog;
create policy "Allow admin delete access" on public.changelog
  for delete to authenticated using ((select public.has_any_role('admin')));
drop policy if exists "Allow admin insert access" on public.changelog;
create policy "Allow admin insert access" on public.changelog
  for insert to authenticated with check ((select public.has_any_role('admin')));

-- 3c. main_courante
drop policy if exists "Allow admin or author to delete" on public.main_courante;
create policy "Allow admin or author to delete" on public.main_courante
  for delete to authenticated
  using ((select public.has_any_role('admin')) or (select auth.uid()) = user_id);

-- 3d. pmr_clients
drop policy if exists "Allow admin delete access" on public.pmr_clients;
create policy "Allow admin delete access" on public.pmr_clients
  for delete to authenticated using ((select public.has_any_role('admin')));

-- 3e. pmr_data
drop policy if exists "Allow admin delete" on public.pmr_data;
create policy "Allow admin delete" on public.pmr_data
  for delete to authenticated using ((select public.has_any_role('admin')));
drop policy if exists "Allow admin insert" on public.pmr_data;
create policy "Allow admin insert" on public.pmr_data
  for insert to authenticated with check ((select public.has_any_role('admin')));
drop policy if exists "Allow admin update" on public.pmr_data;
create policy "Allow admin update" on public.pmr_data
  for update to authenticated
  using ((select public.has_any_role('admin')))
  with check ((select public.has_any_role('admin')));

-- 3f. procedures
drop policy if exists "Allow admin delete" on public.procedures;
create policy "Allow admin delete" on public.procedures
  for delete to authenticated using ((select public.has_any_role('admin')));
drop policy if exists "Allow admin insert" on public.procedures;
create policy "Allow admin insert" on public.procedures
  for insert to authenticated with check ((select public.has_any_role('admin')));
drop policy if exists "Allow admin update" on public.procedures;
create policy "Allow admin update" on public.procedures
  for update to authenticated using ((select public.has_any_role('admin')));

-- 3g. storage.objects (bucket documents)
drop policy if exists "Allow admins to upload documents" on storage.objects;
create policy "Allow admins to upload documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (select public.has_any_role('admin')));
drop policy if exists "Allow admins to update documents" on storage.objects;
create policy "Allow admins to update documents" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (select public.has_any_role('admin')));
drop policy if exists "Allow admins to delete documents" on storage.objects;
create policy "Allow admins to delete documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (select public.has_any_role('admin')));

-- -----------------------------------------------------------------------------
-- 4. S2 — RLS sur les 11 tables exposées
-- -----------------------------------------------------------------------------

-- 4a. Tables qui avaient déjà des policies : on active simplement RLS.
alter table public.liaisons_contenu    enable row level security;
alter table public.remise_bus          enable row level security;
alter table public.remise_taxi         enable row level security;
alter table public.remise_intervention enable row level security;
alter table public.remise_pmr          enable row level security;

-- 4b. ebp — référentiel (lignes / PtCar / vues EBP).
--     Lecture laissée à anon pour ne pas casser le `load` SSR de BACO (/generateTaxi)
--     qui s'exécute sans session. À restreindre à `authenticated` dans CSM.
alter table public.ebp enable row level security;
drop policy if exists "ebp_select_all" on public.ebp;
create policy "ebp_select_all" on public.ebp
  for select to anon, authenticated using (true);
drop policy if exists "ebp_write_staff" on public.ebp;
create policy "ebp_write_staff" on public.ebp
  for all to authenticated
  using ((select public.has_any_role('admin', 'sysop', 'moderator')))
  with check ((select public.has_any_role('admin', 'sysop', 'moderator')));

-- 4c. app_settings — lu par hooks.server.js sans session (anon), écrit par admin/sysop.
alter table public.app_settings enable row level security;
drop policy if exists "app_settings_select_all" on public.app_settings;
create policy "app_settings_select_all" on public.app_settings
  for select to anon, authenticated using (true);
drop policy if exists "app_settings_insert_admin" on public.app_settings;
create policy "app_settings_insert_admin" on public.app_settings
  for insert to authenticated with check ((select public.has_any_role('admin', 'sysop')));
drop policy if exists "app_settings_update_admin" on public.app_settings;
create policy "app_settings_update_admin" on public.app_settings
  for update to authenticated
  using ((select public.has_any_role('admin', 'sysop')))
  with check ((select public.has_any_role('admin', 'sysop')));
drop policy if exists "app_settings_delete_admin" on public.app_settings;
create policy "app_settings_delete_admin" on public.app_settings
  for delete to authenticated using ((select public.has_any_role('admin', 'sysop')));

-- 4d. audit_logs — lecture admin/sysop (permission audit:read) ; écrit par triggers SECURITY DEFINER.
alter table public.audit_logs enable row level security;
drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin" on public.audit_logs
  for select to authenticated using ((select public.has_any_role('admin', 'sysop')));

-- 4e. b201_reports — même accès effectif qu'avant pour les utilisateurs connectés.
alter table public.b201_reports enable row level security;
drop policy if exists "b201_reports_authenticated" on public.b201_reports;
create policy "b201_reports_authenticated" on public.b201_reports
  for all to authenticated using (true) with check (true);

-- 4f. Tables mortes : RLS sans policy = accès refusé (sauf service_role).
alter table public.darts_games   enable row level security;
alter table public.temp_geo_data enable row level security;

-- 4h. Policies ouvertes à `public` (donc anon, sans connexion) sur des données métier
--     sensibles : déplacements PMR, interventions, commandes taxi/bus, présences.
--     Même règle qu'avant, mais réservée aux utilisateurs connectés.
alter policy "Public access" on public.daily_movements to authenticated;
alter policy "Public access" on public.movement_interventions to authenticated;
alter policy "Enable all access for authenticated users" on public.taxi_commands to authenticated;
alter policy "Tout le monde peut voir" on public.otto_commandes to authenticated;
alter policy "Lecture publique" on public.pmr_data to authenticated;
alter policy "Tout le monde voit les presences" on public.user_presence to authenticated;

-- 4g. Vue d'audit : respecter la RLS de l'appelant.
alter view public.admin_audit_view set (security_invoker = true);

-- -----------------------------------------------------------------------------
-- 5. S6 — Fonctions SECURITY DEFINER : contrôle de l'appelant
-- -----------------------------------------------------------------------------

create or replace function public.admin_create_user(new_email text, new_role text, new_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  new_user_id uuid;
begin
  if not public.has_any_role('admin', 'sysop') then
    raise exception 'Accès refusé: privilèges admin requis.' using errcode = '42501';
  end if;
  if new_role not in ('user', 'moderator', 'otto_agent', 'admin', 'sysop') then
    raise exception 'Rôle invalide.';
  end if;
  if new_role = 'sysop' and not public.has_any_role('sysop') then
    raise exception 'Seul un sysop peut créer un sysop.' using errcode = '42501';
  end if;
  if char_length(new_password) < 8 then
    raise exception 'Le mot de passe doit faire au moins 8 caractères.';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, created_at, updated_at, last_sign_in_at
  ) values (
    gen_random_uuid(), gen_random_uuid(), 'authenticated', 'authenticated', new_email,
    auth.crypt(new_password, auth.gen_salt('bf')),
    now(), jsonb_build_object('role', new_role), now(), now(), now()
  )
  returning id into new_user_id;

  -- handle_new_user crée le profil (rôle 'user' par défaut) : on aligne le rôle.
  update public.profiles set role = new_role where id = new_user_id;

  return json_build_object('status', 'success', 'user_id', new_user_id, 'email', new_email, 'role', new_role);
end;
$$;

create or replace function public.admin_set_ban_status(user_id_to_modify uuid, should_ban boolean)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_any_role('admin', 'sysop') then
    raise exception 'Accès refusé: privilèges admin requis.' using errcode = '42501';
  end if;
  if auth.uid() = user_id_to_modify then
    raise exception 'Un administrateur ne peut pas se bannir lui-même.';
  end if;

  if should_ban then
    update auth.users set banned_until = now() + interval '100 years' where id = user_id_to_modify;
    return json_build_object('status', 'success', 'user_id', user_id_to_modify, 'action', 'banned');
  else
    update auth.users set banned_until = null where id = user_id_to_modify;
    return json_build_object('status', 'success', 'user_id', user_id_to_modify, 'action', 'unbanned');
  end if;
end;
$$;

create or replace function public.admin_pardon_infraction(p_infraction_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_any_role('admin', 'sysop', 'moderator') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  update public.infractions set is_active = false where id = p_infraction_id;
end;
$$;

create or replace function public.admin_add_infraction(
  target_user_id uuid, p_card_type text, p_reason text, duration_months_if_yellow integer default 6
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  active_yellow_cards int;
  active_red_cards int;
  current_ban_status timestamptz;
begin
  if not public.has_any_role('admin', 'sysop', 'moderator') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  insert into public.infractions (user_id, admin_id, card_type, reason, expires_at)
  values (
    target_user_id, auth.uid(), p_card_type, p_reason,
    case when p_card_type = 'yellow'
         then now() + (duration_months_if_yellow * interval '1 month')
         else null end
  );

  select
    count(*) filter (where card_type = 'yellow' and is_active and (expires_at is null or expires_at > now())),
    count(*) filter (where card_type = 'red' and is_active)
  into active_yellow_cards, active_red_cards
  from public.infractions
  where user_id = target_user_id;

  select banned_until into current_ban_status from public.profiles where id = target_user_id;

  return json_build_object(
    'status', 'success',
    'yellow_cards', active_yellow_cards,
    'red_cards', active_red_cards,
    'banned_until', current_ban_status
  );
end;
$$;

create or replace function public.get_all_users()
returns table(
  user_id uuid, email text, role text, full_name text, avatar_url text,
  last_sign_in_at timestamptz, banned_until timestamptz,
  active_yellow_cards bigint, active_red_cards bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_any_role('admin', 'sysop', 'moderator') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select
    au.id, au.email::text, p.role, p.full_name, p.avatar_url, au.last_sign_in_at, p.banned_until,
    (select count(*) from public.infractions i where i.user_id = au.id and i.card_type = 'yellow' and i.is_active),
    (select count(*) from public.infractions i where i.user_id = au.id and i.card_type = 'red' and i.is_active)
  from auth.users au
  left join public.profiles p on au.id = p.id
  order by au.last_sign_in_at desc nulls last;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. search_path figé sur toutes les fonctions qui ne l'avaient pas
-- -----------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proconfig is null
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') -- hors extensions (pg_trgm)
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Droits EXECUTE
-- -----------------------------------------------------------------------------

-- 7a. Plus rien n'est exécutable par anon / public par défaut…
revoke execute on all functions in schema public from public, anon;

-- …sauf les helpers utilisés dans des policies évaluées pour anon (renvoient false sans session).
grant execute on function public.has_any_role(text[]) to anon, authenticated;
grant execute on function public.is_staff()           to anon, authenticated;
grant execute on function public.get_my_role()        to anon, authenticated;

-- …et les fonctions des extensions (pg_trgm) restent accessibles.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where n.nspname = 'public'
  loop
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;

-- 7b. Fonctions de trigger : jamais appelables via /rest/v1/rpc.
revoke execute on function public.archive_procedure()               from authenticated;
revoke execute on function public.handle_new_mention_notification() from authenticated;
revoke execute on function public.handle_new_user()                 from authenticated;
revoke execute on function public.handle_procedure_update()         from authenticated;
revoke execute on function public.handle_updated_at()               from authenticated;
revoke execute on function public.handle_updated_at_with_user()     from authenticated;
revoke execute on function public.log_audit_action()                from authenticated;
revoke execute on function public.log_audit_diff()                  from authenticated;
revoke execute on function public.sync_user_role()                  from authenticated;
revoke execute on function public.guard_profile_privileged_columns() from authenticated;

-- 7c. Les fonctions futures ne seront plus exécutables par anon par défaut.
alter default privileges in schema public revoke execute on functions from public, anon;

commit;
