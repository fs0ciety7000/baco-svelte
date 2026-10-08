-- Correctif BACO : XSS stocké par la carte PN (docs/design/AUDIT-UX-OPERATIONS.md, BUG-1).
-- `pn_data` était modifiable par tout compte connecté (deux policies UPDATE `using (true)`), et la popup de la carte
-- (Map.svelte, setHTML) affiche ses champs sans échappement. Aucun code de BACO (`main`) ne modifie `pn_data`
-- (`updatePnZone` n'est appelé nulle part) : seule la policy admin (FOR ALL) reste pour l'écriture.
-- NON APPLIQUÉ : accord explicite de l'utilisateur requis (SQL Editor), puis vérification par SELECT sur pg_policies.

begin;
drop policy if exists "Permettre update aux utilisateurs connectés" on public.pn_data;
drop policy if exists "update_zone_pn" on public.pn_data;
commit;

-- Vérification attendue : plus aucune policy UPDATE sur pn_data
-- select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'pn_data';
