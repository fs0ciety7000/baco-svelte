// src/lib/permissions.js

// --- 1. DÉFINITION DE TOUTES LES ACTIONS POSSIBLES ---
export const ACTIONS = {
    // --- ADMINISTRATION ---
    ADMIN_ACCESS: 'admin:access',
    USERS_MANAGE: 'users:manage',
    USERS_BAN: 'users:ban',
    AUDIT_READ: 'audit:read',

    // --- MODULES ---
    PLANNING_READ: 'planning:read',
    PLANNING_WRITE: 'planning:write',
    PLANNING_DELETE: 'planning:delete', // Nouveau

    JOURNAL_READ: 'journal:read',
    JOURNAL_WRITE: 'journal:write',
    JOURNAL_DELETE: 'journal:delete',   // Nouveau

    DOCUMENTS_READ: 'documents:read',
    DOCUMENTS_WRITE: 'documents:write',
    DOCUMENTS_DELETE: 'documents:delete',

    REPERTOIRE_READ: 'repertoire:read',
    REPERTOIRE_WRITE: 'repertoire:write',
    REPERTOIRE_DELETE: 'repertoire:delete', // Nouveau

    BUS_READ: 'bus:read',
    BUS_WRITE: 'bus:write',
    BUS_DELETE: 'bus:delete', // Nouveau

    TAXI_READ: 'taxi:read',
    TAXI_WRITE: 'taxi:write',
    TAXI_DELETE: 'taxi:delete', // Nouveau

    OTTO_READ: 'otto:read',
    OTTO_WRITE: 'otto:write',
    OTTO_DELETE: 'otto:delete', // Nouveau

    PTCAR_READ: 'ptcar:read',
    PTCAR_WRITE: 'ptcar:write',
    PTCAR_DELETE: 'ptcar:delete', // Nouveau

    B201_READ: 'b201:read',
    B201_WRITE: 'b201:write',
    B201_DELETE: 'b201:delete', // Nouveau

    EBP_READ: 'ebp:read',
    EBP_WRITE: 'ebp:write',
    EBP_DELETE: 'ebp:delete', // Nouveau

    OPERATIONNEL_READ: 'ops:read',
    OPERATIONNEL_WRITE: 'ops:write',
    OPERATIONNEL_DELETE: 'ops:delete', // Nouveau

    CARTE_PN_READ: 'carte_pn:read',
    CARTE_PN_WRITE: 'carte_pn:write',
    CARTE_PN_DELETE: 'carte_pn:delete', // Nouveau

    PMR_READ: 'pmr:read',
    PMR_WRITE: 'pmr:write',
    PMR_DELETE: 'pmr:delete', // Nouveau

    DARTS_READ: 'darts:read',
    DARTS_WRITE: 'darts:write',
    DARTS_DELETE: 'darts:delete', // Nouveau

    // --- NOUVEAU : GENERATE TAXI ---
    GENERATE_TAXI_READ: 'generate_taxi:read',
    GENERATE_TAXI_WRITE: 'generate_taxi:write',
    GENERATE_TAXI_DELETE: 'generate_taxi:delete',
};

export const ROLE_DEFAULTS = {
    // ADMIN : A accès à tout (*) y compris les DELETE
    admin: ['*'],

    // MODERATOR : Peut lire et écrire, MAIS PAS SUPPRIMER (sécurité)
    moderator: [
        'users:manage',

        'planning:read', 'planning:write', // Pas de delete
        'journal:read', 'journal:write',   // Pas de delete
        'documents:read', 'documents:write',
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
        'darts:read', 'darts:write',
        'generate_taxi:read', 'generate_taxi:write'
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
        'generate_taxi:read', 'generate_taxi:write',
        'carte_pn:read',
        'pmr:read', 'pmr:write',
        'darts:read', 'darts:write' // Loisir autorisé
    ],

    // READER : Lecture seule sur tous les modules (rôle par défaut pour les nouveaux utilisateurs)
    reader: [
        'planning:read',
        'journal:read',
        'documents:read',
        'repertoire:read',
        'bus:read',
        'taxi:read',
        'otto:read',
        'ptcar:read',
        'b201:read',
        'ebp:read',
        'ops:read',
        'carte_pn:read',
        'pmr:read',
        'darts:read',
        'generate_taxi:read'
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