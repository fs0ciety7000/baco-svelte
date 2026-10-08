import {
	LayoutDashboard,
	Bus,
	CarTaxiFront,
	ClipboardList,
	Accessibility,
	History,
	Users,
	Combine,
	Radio,
	NotebookPen,
	ShieldCheck,
	MapPinned,
	Route,
	Tag,
	Database,
	BookUser,
	Building2,
	Car,
	FolderOpen,
	CalendarDays,
	Compass,
	Sparkles,
	BarChart3,
	UserCog,
	Signpost,
	MapPin,
	Activity,
	FileClock
} from 'lucide-svelte';
import { ACTIONS, hasPermission } from '$lib/permissions';

/**
 * @typedef {object} NavItem
 * @property {string} href
 * @property {string} label
 * @property {any} icon
 * @property {string} [permission]   action requise (voir permissions.js)
 * @property {string[]} [hideFor]    rôles pour lesquels l'entrée est masquée
 * @property {string[]} [keywords]   termes de recherche ⌘K
 * @property {string} [shortcut]     raccourci « g + touche »
 *
 * @typedef {object} NavGroup
 * @property {string} id
 * @property {string} label
 * @property {NavItem[]} items
 */

/** Architecture de l'information CSM (voir docs/PROPOSITION.md §3). @type {NavGroup[]} */
export const NAVIGATION = [
	{
		id: 'home',
		label: 'Vue d’ensemble',
		items: [
			{
				href: '/accueil',
				label: 'Tableau de bord',
				icon: LayoutDashboard,
				shortcut: 'a',
				keywords: ['accueil', 'home', 'widgets']
			}
		]
	},
	{
		id: 'commandes',
		label: 'Commandes',
		items: [
			{
				href: '/otto',
				label: 'Bus (C3)',
				icon: Bus,
				permission: ACTIONS.OTTO_READ,
				shortcut: 'b',
				keywords: ['otto', 'c3', 'bon de commande', 'bus']
			},
			{
				href: '/generateTaxi',
				label: 'Taxis',
				icon: CarTaxiFront,
				permission: ACTIONS.GENERATE_TAXI_READ,
				shortcut: 't',
				keywords: ['taxi', 'bon', 'commande', 'pmr']
			},
			{
				href: '/b201',
				label: 'Remise de service',
				icon: ClipboardList,
				permission: ACTIONS.B201_READ,
				keywords: ['b201', 'remise', 'relève']
			}
		]
	},
	{
		id: 'pmr',
		label: 'PMR',
		items: [
			{
				href: '/deplacements',
				label: 'Prestations du jour',
				icon: Accessibility,
				permission: ACTIONS.DEPLACEMENTS_READ,
				shortcut: 'p',
				keywords: ['déplacements', 'mouvements', 'assistance']
			},
			{
				href: '/deplacements/historique',
				label: 'Historique',
				icon: History,
				permission: ACTIONS.DEPLACEMENTS_READ,
				keywords: ['archives', 'déplacements']
			},
			{
				href: '/clients-pmr',
				label: 'Clients',
				icon: Users,
				permission: ACTIONS.PMR_READ,
				keywords: ['client', 'voyageur', 'pmr']
			},
			{
				href: '/pmr',
				label: 'Rampes & matériel',
				icon: Combine,
				permission: ACTIONS.PMR_READ,
				keywords: ['rampe', 'équipement']
			}
		]
	},
	{
		id: 'operations',
		label: 'Opérations',
		items: [
			{
				href: '/live',
				label: 'Trains en direct',
				icon: Radio,
				permission: ACTIONS.LIVE_READ,
				shortcut: 'l',
				keywords: ['départs', 'arrivées', 'irail', 'retard']
			},
			{
				href: '/journal',
				label: 'Main courante',
				icon: NotebookPen,
				permission: ACTIONS.JOURNAL_READ,
				shortcut: 'j',
				keywords: ['journal', 'événements', 'log']
			},
			{
				href: '/operationnel',
				label: 'Procédures',
				icon: ShieldCheck,
				permission: ACTIONS.OPERATIONNEL_READ,
				keywords: ['opérationnel', 'consignes']
			},
			{
				href: '/carte-pn',
				label: 'Carte PN',
				icon: MapPinned,
				permission: ACTIONS.CARTE_PN_READ,
				keywords: ['passage à niveau', 'carte']
			}
		]
	},
	{
		id: 'referentiels',
		label: 'Référentiels',
		items: [
			{
				href: '/lignes',
				label: 'Lignes',
				icon: Route,
				hideFor: ['otto_agent'],
				keywords: ['ligne', 'contenu']
			},
			{
				href: '/ptcar',
				label: 'PtCar',
				icon: Tag,
				permission: ACTIONS.PTCAR_READ,
				keywords: ['abréviation', 'gare', 'ptcar']
			},
			{
				href: '/ebp',
				label: 'Vues EBP',
				icon: Database,
				permission: ACTIONS.EBP_READ,
				keywords: ['ebp', 'vue']
			},
			{
				href: '/repertoire',
				label: 'Répertoire',
				icon: BookUser,
				permission: ACTIONS.REPERTOIRE_READ,
				shortcut: 'r',
				keywords: ['téléphone', 'contact', 'annuaire']
			},
			{
				href: '/bus',
				label: 'Sociétés de bus',
				icon: Building2,
				permission: ACTIONS.BUS_READ,
				keywords: ['autocariste', 'chauffeur', 'société']
			},
			{
				href: '/taxi',
				label: 'Sociétés de taxi',
				icon: Car,
				permission: ACTIONS.TAXI_READ,
				keywords: ['taxi', 'société']
			},
			{
				href: '/documents',
				label: 'Documents',
				icon: FolderOpen,
				permission: ACTIONS.DOCUMENTS_READ,
				keywords: ['fichier', 'pdf']
			}
		]
	},
	{
		id: 'equipe',
		label: 'Équipe',
		items: [
			{
				href: '/planning',
				label: 'Planning & congés',
				icon: CalendarDays,
				permission: ACTIONS.PLANNING_READ,
				keywords: ['congé', 'horaire', 'shift']
			},
			{
				href: '/decouvrir',
				label: 'Annuaire de l’équipe',
				icon: Compass,
				hideFor: ['otto_agent'],
				keywords: ['collègues', 'profils']
			},
			{
				href: '/changelog',
				label: 'Nouveautés',
				icon: Sparkles,
				hideFor: ['otto_agent'],
				keywords: ['changelog', 'version']
			}
		]
	},
	{
		id: 'pilotage',
		label: 'Pilotage',
		items: [
			{
				href: '/stats',
				label: 'Statistiques',
				icon: BarChart3,
				permission: ACTIONS.STATS_READ,
				shortcut: 's',
				keywords: ['kpi', 'chiffres', 'graphiques']
			}
		]
	},
	{
		id: 'admin',
		label: 'Administration',
		items: [
			{
				href: '/admin',
				label: 'Utilisateurs',
				icon: UserCog,
				permission: ACTIONS.ADMIN_ACCESS,
				keywords: ['admin', 'comptes', 'rôles']
			},
			{
				href: '/admin/lignes',
				label: 'Lignes & arrêts',
				icon: Signpost,
				permission: ACTIONS.ADMIN_ACCESS,
				keywords: ['arrêts', 'lignes bus']
			},
			{
				href: '/admin/gares',
				label: 'Gares (coordonnées)',
				icon: MapPin,
				permission: ACTIONS.ADMIN_ACCESS,
				keywords: ['géocodage', 'gare']
			},
			{
				href: '/admin/sante',
				label: 'Santé de l’app',
				icon: Activity,
				permission: ACTIONS.ADMIN_ACCESS,
				keywords: ['sauvegarde', 'erreurs', 'monitoring']
			},
			{
				href: '/audit',
				label: 'Journal d’audit',
				icon: FileClock,
				permission: ACTIONS.AUDIT_READ,
				keywords: ['audit', 'historique', 'modifications']
			}
		]
	}
];

/** Actions de création rapide (bouton « Nouveau » et palette ⌘K). */
export const QUICK_CREATE = [
	{ href: '/otto?new=1', label: 'Bon de commande bus', icon: Bus, permission: ACTIONS.OTTO_WRITE },
	{
		href: '/generateTaxi?new=1',
		label: 'Bon de commande taxi',
		icon: CarTaxiFront,
		permission: ACTIONS.GENERATE_TAXI_WRITE
	},
	{
		href: '/deplacements',
		label: 'Prestation PMR',
		icon: Accessibility,
		permission: ACTIONS.DEPLACEMENTS_WRITE
	},
	{
		href: '/journal',
		label: 'Entrée de main courante',
		icon: NotebookPen,
		permission: ACTIONS.JOURNAL_WRITE
	}
];

/**
 * @param {NavItem | { permission?: string, hideFor?: string[] }} item
 * @param {{ role?: string, permissions?: Record<string, boolean> } | null} profile
 */
export function isVisible(item, profile) {
	if (!profile) return false;
	if (item.hideFor?.includes(profile.role ?? '')) return false;
	if (!item.permission) return true;
	return hasPermission(profile, item.permission);
}

/** @param {{ role?: string, permissions?: Record<string, boolean> } | null} profile */
export function visibleNavigation(profile) {
	return NAVIGATION.map((group) => ({
		...group,
		items: group.items.filter((item) => isVisible(item, profile))
	})).filter((group) => group.items.length > 0);
}

/** Entrée de navigation correspondant le mieux au chemin courant. @param {string} path */
export function findNavItem(path) {
	let best = null;
	for (const group of NAVIGATION) {
		for (const item of group.items) {
			if (
				(path === item.href || path.startsWith(`${item.href}/`)) &&
				(!best || item.href.length > best.item.href.length)
			) {
				best = { item, group };
			}
		}
	}
	return best;
}
