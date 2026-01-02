// src/lib/permissions.js

// --- 1. DÉFINITION DE TOUTES LES ACTIONS POSSIBLES ---
export const ACTIONS = {
    // --- ADMINISTRATION ---
    ADMIN_ACCESS: 'admin:access',      // Accès au panel admin global
    USERS_MANAGE: 'users:manage',      // Voir/Editer les utilisateurs
    USERS_BAN: 'users:ban',            // Bannir/Débannir
    AUDIT_READ: 'audit:read',          // Voir les logs d'audit

    // --- MODULES PRINCIPAUX ---
    PLANNING_READ: 'planning:read',
    PLANNING_WRITE: 'planning:write',  // Ajouter/Modifier des shifts

    JOURNAL_READ: 'journal:read',
    JOURNAL_WRITE: 'journal:write',    // Écrire dans le journal de bord

    DOCUMENTS_READ: 'documents:read',
    DOCUMENTS_WRITE: 'documents:write',
    DOCUMENTS_DELETE: 'documents:delete',

    REPERTOIRE_READ: 'repertoire:read',
    REPERTOIRE_WRITE: 'repertoire:write', // Ajouter/Modifier des contacts

    // --- TRANSPORTS & OPÉRATIONS ---
    BUS_READ: 'bus:read',              // Pages /bus et /lignes
    BUS_WRITE: 'bus:write',

    TAXI_READ: 'taxi:read',            // Pages /taxi et /generateTaxi
    TAXI_WRITE: 'taxi:write',

    OTTO_READ: 'otto:read',            // Page /otto
    OTTO_WRITE: 'otto:write',

    PTCAR_READ: 'ptcar:read',          // Page /ptcar
    PTCAR_WRITE: 'ptcar:write',

    B201_READ: 'b201:read',            // Page /b201
    B201_WRITE: 'b201:write',

    EBP_READ: 'ebp:read',              // Page /ebp
    EBP_WRITE: 'ebp:write',

    OPERATIONNEL_READ: 'ops:read',     // Page /operationnel
    OPERATIONNEL_WRITE: 'ops:write',

    CARTE_PN_READ: 'carte_pn:read',    // Page /carte-pn
    CARTE_PN_WRITE: 'carte_pn:write',

    // --- ASSISTANCE (PMR) ---
    PMR_READ: 'pmr:read',              // Pages /pmr et /clients-pmr
    PMR_WRITE: 'pmr:write',

    // --- DIVERS / LOISIRS ---
    DARTS_READ: 'darts:read',          // Page /darts
    DARTS_WRITE: 'darts:write',        // Enregistrer des scores
};

// --- 2. DÉFINITION DES RÔLES PAR DÉFAUT ---
export const ROLE_DEFAULTS = {
    // ADMIN : Accès absolu (géré par le joker '*' dans la fonction hasPermission)
    admin: ['*'],

    // MODERATOR : Peut tout voir et tout modifier, sauf les zones dangereuses (Ban, Audit, Delete Docs)
    moderator: [
        // Admin light
        'users:manage', 
        // Modules Lecture/Écriture
        'planning:read', 'planning:write',
        'journal:read', 'journal:write',
        'documents:read', 'documents:write', // Pas de delete
        'repertoire:read', 'repertoire:write',
        'bus:read', 'bus:write',
        'taxi:read', 'taxi:write',
        'otto:read', 'otto:write',
        'ptcar:read', 'ptcar:write',
        'b201:read', 'b201:write',
        'ebp:read', 'ebp:write',
        'ops:read', 'ops:write',
        'carte_pn:read', 'carte_pn:write',
        'pmr:read', 'pmr:write',
        'darts:read', 'darts:write'
    ],

    // USER : Lecture seule sur la plupart des outils pro, écriture sur le "social/quotidien"
    user: [
        // Lecture globale
        'planning:read', 'planning:write',
        'journal:read', 'journal:write', // Souvent les users écrivent dans le journal
        'documents:read', 'documents:write',
        'repertoire:read',
        'bus:read', 'bus:write',
        'taxi:read', 'taxi:write',
        'otto:read', 'otto:write',
        'ptcar:read',
        'b201:read',
        'ebp:read',
        'ops:read', 'ops:write',
        'carte_pn:read',
        'pmr:read', 'pmr:write',
        'darts:read', 'darts:write' // Loisir autorisé
    ]
};

// --- 3. FONCTION DE VÉRIFICATION (Inchangée) ---
export function hasPermission(userProfile, action) {
    if (!userProfile) return false;
    if (userProfile.role === 'admin') return true;

    const customPerms = userProfile.permissions || {};
    
    // 1. Surcharge explicite (Priorité max)
    if (customPerms[action] === true) return true;
    if (customPerms[action] === false) return false;

    // 2. Rôle par défaut
    const rolePerms = ROLE_DEFAULTS[userProfile.role] || [];
    return rolePerms.includes(action) || rolePerms.includes('*');
}