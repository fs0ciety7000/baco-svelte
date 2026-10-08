// Test hors-ligne de la migration de sécurité sur un schéma simulé (PGlite).
// Usage : npm i --no-save @electric-sql/pglite && node supabase/tests/hotfix.test.mjs supabase/migrations/20261008120000_security_hotfix.sql
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
await db.exec(fs.readFileSync(new URL("./hotfix_stub.sql", import.meta.url),'utf8'));
await db.exec(fs.readFileSync(process.argv[2],'utf8'));
console.log('MIGRATION OK');
const A='00000000-0000-0000-0000-00000000000a', U='00000000-0000-0000-0000-00000000000b';
async function as(role, sub, sql, label, expectFail=false){
  try {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${sub??''}',false); set role ${role};`);
    const r = await db.query(sql);
    console.log(expectFail?'❌ UNEXPECTED OK':'✅', label, JSON.stringify(r.rows).slice(0,120), 'affected', r.affectedRows);
  } catch(e){ console.log(expectFail?'✅ (refusé)':'❌ ERROR', label, '→', e.message); }
  finally { await db.exec('reset role'); }
}
await as('authenticated',U,`update profiles set role='admin' where id='${U}'`,'user -> se promeut admin',true);
await as('authenticated',U,`update profiles set permissions='{"x":1}' where id='${U}'`,'user -> modifie ses permissions',true);
await as('authenticated',U,`update profiles set full_name='Bob' where id='${U}' returning full_name`,'user -> modifie son nom');
await as('authenticated',A,`update profiles set role='moderator' where id='${U}' returning role`,'admin -> change rôle user');
await db.exec("update profiles set role='user' where id='"+U+"'");
await as('authenticated',U,`insert into profiles(id, role) values ('00000000-0000-0000-0000-00000000000c','admin')`,'user -> insère profil admin',true);
await as('anon',null,`select key from app_settings`,'anon -> lit app_settings');
await as('anon',null,`update app_settings set value='true' returning key`,'anon -> modifie app_settings (0 ligne attendue)');
await as('authenticated',U,`update app_settings set value='true' returning key`,'user -> modifie app_settings (0 ligne attendue)');
await as('authenticated',A,`update app_settings set value='false' returning key`,'admin -> modifie app_settings');
await as('anon',null,`select * from get_all_users()`,'anon -> get_all_users',true);
await as('authenticated',U,`select * from get_all_users()`,'user -> get_all_users',true);
await as('authenticated',A,`select count(*) from get_all_users()`,'admin -> get_all_users');
await as('authenticated',U,`select admin_create_user('a@b','admin','12345678')`,'user -> admin_create_user',true);
await as('authenticated',A,`select admin_create_user('new@b','otto_agent','12345678')`,'admin -> admin_create_user');
await as('authenticated',U,`select admin_add_infraction('${A}','red','x')`,'user -> admin_add_infraction',true);
await as('authenticated',U,`select handle_updated_at()`,'user -> appelle fonction trigger',true);
await as('anon',null,`select * from darts_games`,'anon -> darts_games (vide attendu)');
await as('authenticated',U,`select count(*) from audit_logs`,'user -> audit_logs (0)');
await as('authenticated',U,`select global_search('x')`,'user -> global_search');
await as('anon',null,`select global_search('x')`,'anon -> global_search',true);
await as('authenticated',U,`insert into ebp(key) values ('x')`,'user -> écrit ebp',true);
await as('anon',null,`select count(*) from ebp`,'anon -> lit ebp');
const r = await db.query(`select p.role, u.raw_user_meta_data->>'role' meta from profiles p join auth.users u on u.id=p.id where u.email='new@b'`);
console.log('créé via RPC:', JSON.stringify(r.rows));
