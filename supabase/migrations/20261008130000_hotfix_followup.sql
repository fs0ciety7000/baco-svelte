-- =============================================================================
-- CSM · Suite du hotfix sécurité (à appliquer après 20261008120000_security_hotfix.sql)
-- -----------------------------------------------------------------------------
-- admin_update_user_role et admin_set_presence testaient `get_my_role() <> 'admin'`.
-- Pour un compte connecté SANS ligne dans profiles, get_my_role() vaut NULL, la comparaison
-- vaut NULL et le IF ne lève pas d'exception : l'appel passait. On teste désormais
-- has_any_role() (faux sans profil). Corps des fonctions inchangé par ailleurs.
-- Compatible BACO : les appels légitimes (admin) se comportent comme avant.
-- =============================================================================

begin;

create or replace function public.admin_update_user_role(p_user_id uuid, p_new_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_any_role('admin') then
    raise exception 'Accès refusé: vous devez être admin.' using errcode = '42501';
  end if;
  update auth.users
     set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', p_new_role)
   where id = p_user_id;
  update public.profiles set role = p_new_role where id = p_user_id;
end;
$$;

create or replace function public.admin_set_presence(p_user_id uuid, p_date date, p_shift text, p_service text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.has_any_role('admin') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_service = 'NONE' then
    update public.presences
       set check_out_time = now(), checked_out_by = auth.uid()
     where user_id = p_user_id and date = p_date and shift = p_shift;
  else
    insert into public.presences (user_id, date, shift, service, checked_in_by)
    values (p_user_id, p_date, p_shift, p_service, auth.uid())
    on conflict (user_id, date, shift) do update
      set service = excluded.service, check_in_time = now(), checked_in_by = auth.uid(), check_out_time = null;
  end if;
end;
$$;

commit;
