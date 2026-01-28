// ============================================
// Configuración de Gestores POS
// ============================================
// Mapeo de email de Usuario POS → Nombre del Gestor y Zona

export const GESTORES_MAP = {
    'callcenter1@puntofarma.hn': { gestor: 'Karen Lino', zona: 'Centro' },
    'callcenter2@puntofarma.hn': { gestor: 'Jennifer Cruz', zona: 'Centro' },
    'callcenter3@puntofarma.hn': { gestor: 'Gloria Ochoa', zona: 'Centro' },
    'callcenter4@puntofarma.hn': { gestor: 'Kesia Rivera', zona: 'Centro' },
    'callcenter5@puntofarma.hn': { gestor: 'Larissa Silva', zona: 'Centro' },
    'coreakimberly848@gmail.com': { gestor: 'Kimberly Corea', zona: 'Centro' },
    'marielllandino28@gmail.com': { gestor: 'Alondra Salgado', zona: 'Centro' },
    'f4987740@gmail.com': { gestor: 'Maria Fernanda Amador', zona: 'Centro' },
    'josselyndanielamartinez@gmail.com': { gestor: 'Daniela Martinez', zona: 'Centro' },
    'callcentersap1@puntofarma.hn': { gestor: 'Evelyn Maldonado', zona: 'Norte' },
    'callcentersap2@puntofarma.hn': { gestor: 'Paola Melendez', zona: 'Norte' },
    'jsanchez@puntofarma.hn': { gestor: 'Yohana Sanchez', zona: 'Norte' },
    'callcentersap3@puntofarma.hn': { gestor: 'Carlos Garcia', zona: 'Norte' }
};

// Obtener información del gestor por email
export const getGestorInfo = (email) => {
    if (!email) return null;

    const emailLower = email.toLowerCase().trim();
    return GESTORES_MAP[emailLower] || null;
};

// Obtener lista única de zonas
export const getZonas = () => {
    const zonas = new Set(Object.values(GESTORES_MAP).map(g => g.zona));
    return Array.from(zonas).sort();
};

// Obtener lista de gestores por zona
export const getGestoresByZona = (zona = null) => {
    const gestores = Object.entries(GESTORES_MAP).map(([email, info]) => ({
        email,
        nombre: info.gestor,
        zona: info.zona
    }));

    if (zona) {
        return gestores.filter(g => g.zona === zona).sort((a, b) => a.nombre.localeCompare(b.nombre));
    }

    return gestores.sort((a, b) => a.nombre.localeCompare(b.nombre));
};

// Verificar si un email es de un gestor conocido
export const isGestor = (email) => {
    if (!email) return false;
    const emailLower = email.toLowerCase().trim();
    return emailLower in GESTORES_MAP;
};
