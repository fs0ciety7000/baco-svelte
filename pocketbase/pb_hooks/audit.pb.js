/// <reference path="../pb_data/types.d.ts" />
// Journal d'audit : remplace les triggers Supabase log_audit_action / log_audit_diff.
// Chaque création, modification ou suppression faite par l'API (donc par un agent, via le serveur Next)
// écrit une ligne dans `audit_log` : auteur, action, différentiel avant/après.
// Les imports en ligne de commande ne passent pas par ces hooks (pas d'audit pour la reprise de données).
// Les hooks JSVM sont isolés : la logique partagée est chargée par require() dans chaque callback.

onRecordCreateRequest((e) => {
	e.next();
	const audit = require(`${__hooks}/lib/audit.js`);
	audit.write(e.app, 'create', e.record, {}, audit.snapshot(e.record), e.auth);
}, 'users', 'bus_companies', 'bus_orders', 'taxi_orders', 'bus_drivers', 'bus_contacts', 'bus_company_lines', 'taxi_companies', 'pmr_clients', 'order_templates', 'b201_reports', 'b201_notes', 'line_stations', 'pmr_zones', 'pmr_assists', 'pmr_equipment', 'ops_log', 'level_crossings', 'directory_contacts', 'spi_points', 'spi_zones', 'ptcar', 'ebp_views', 'procedures', 'documents', 'changelog', 'app_settings', 'quinyx_groups', 'quinyx_places', 'roles', 'planner_bases', 'bcs_counters', 'planner_templates');

onRecordUpdateRequest((e) => {
	const audit = require(`${__hooks}/lib/audit.js`);
	const before = audit.snapshot(e.record.original());
	e.next();
	audit.write(e.app, 'update', e.record, before, audit.snapshot(e.record), e.auth);
}, 'users', 'bus_companies', 'bus_orders', 'taxi_orders', 'bus_drivers', 'bus_contacts', 'bus_company_lines', 'taxi_companies', 'pmr_clients', 'order_templates', 'b201_reports', 'b201_notes', 'line_stations', 'pmr_zones', 'pmr_assists', 'pmr_equipment', 'ops_log', 'level_crossings', 'directory_contacts', 'spi_points', 'spi_zones', 'ptcar', 'ebp_views', 'procedures', 'documents', 'changelog', 'app_settings', 'stations', 'rail_lines', 'quinyx_places', 'roles', 'planner_bases', 'bcs_counters', 'planner_templates');

onRecordDeleteRequest((e) => {
	const audit = require(`${__hooks}/lib/audit.js`);
	const before = audit.snapshot(e.record);
	e.next();
	audit.write(e.app, 'delete', e.record, before, {}, e.auth);
}, 'users', 'bus_companies', 'bus_orders', 'taxi_orders', 'bus_drivers', 'bus_contacts', 'bus_company_lines', 'taxi_companies', 'pmr_clients', 'order_templates', 'b201_reports', 'b201_notes', 'line_stations', 'pmr_zones', 'pmr_assists', 'pmr_equipment', 'ops_log', 'level_crossings', 'directory_contacts', 'spi_points', 'spi_zones', 'ptcar', 'ebp_views', 'procedures', 'documents', 'changelog', 'app_settings', 'quinyx_groups', 'quinyx_places', 'roles', 'planner_bases', 'bcs_counters', 'planner_templates');
