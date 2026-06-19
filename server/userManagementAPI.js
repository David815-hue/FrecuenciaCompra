import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Load environment variables
config({ path: '.env.local' });

// Initialize Firebase Admin
const firebaseApp = initializeApp({
    credential: cert('./firebase-service-account.json')
});

const auth = getAuth(firebaseApp);
const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Helper
const usernameToEmail = (username) => `${username.toLowerCase().trim().replace(/\s+/g, '')}@puntofarma.com`;

// ===== USER MANAGEMENT ENDPOINTS =====

/**
 * GET /api/users - List all users
 */
app.get('/api/users', async (req, res) => {
    try {
        const listUsersResult = await auth.listUsers(1000); // Max 1000 users

        const users = listUsersResult.users.map(user => ({
            uid: user.uid,
            username: user.customClaims?.username || user.email?.split('@')[0] || '',
            displayName: user.displayName || '',
            email: user.email || '',
            role: user.customClaims?.role || 'gestora',
            createdAt: user.metadata.creationTime,
            lastSignIn: user.metadata.lastSignInTime
        }));

        res.json({ success: true, users });
    } catch (error) {
        console.error('Error listing users:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/users - Create new user
 * Body: { username, password, displayName, role }
 */
app.post('/api/users', async (req, res) => {
    try {
        const { username, password, displayName, role } = req.body;

        // Validation
        if (!username || !password || !displayName || !role) {
            return res.status(400).json({
                success: false,
                error: 'Todos los campos son requeridos'
            });
        }

        if (!['admin', 'gestora'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Rol invÃ¡lido'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'La contraseÃ±a debe tener al menos 6 caracteres'
            });
        }

        const email = usernameToEmail(username);

        // Create user
        const userRecord = await auth.createUser({
            email,
            password,
            displayName,
            emailVerified: true
        });

        // Set custom claims
        await auth.setCustomUserClaims(userRecord.uid, {
            role,
            username: username.toLowerCase().trim(),
            mustChangePassword: true // New users must change password
        });

        res.json({
            success: true,
            user: {
                uid: userRecord.uid,
                username: username.toLowerCase().trim(),
                displayName,
                role,
                mustChangePassword: true
            }
        });
    } catch (error) {
        console.error('Error creating user:', error);
        let errorMessage = error.message;

        if (error.code === 'auth/email-already-exists') {
            errorMessage = 'El usuario ya existe';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'La contraseÃ±a es demasiado dÃ©bil';
        }

        res.status(500).json({ success: false, error: errorMessage });
    }
});

/**
 * POST /api/change-password - Change user password
 * Body: { uid, newPassword }
 */
app.post('/api/change-password', async (req, res) => {
    try {
        const { uid, newPassword } = req.body;

        if (!uid || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Faltan datos requeridos'
            });
        }

        // Easter Egg & Validation
        if (newPassword === '123456' || newPassword === '12345678' || newPassword === '123456789') {
            return res.status(400).json({
                success: false,
                error: 'No ponga esa contraseÃ±a es muy facil'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'La contraseÃ±a debe tener al menos 6 caracteres'
            });
        }

        // Update password in Firebase
        await auth.updateUser(uid, {
            password: newPassword
        });

        // Remove mustChangePassword claim
        const user = await auth.getUser(uid);
        const currentClaims = user.customClaims || {};

        const newClaims = { ...currentClaims };
        delete newClaims.mustChangePassword;

        await auth.setCustomUserClaims(uid, newClaims);

        res.json({ success: true, message: 'ContraseÃ±a actualizada correctamente' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/users/:uid - Update user
 * Body: { displayName?, role? }
 */
app.put('/api/users/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        const { displayName, role } = req.body;

        const updates = {};
        if (displayName) updates.displayName = displayName;

        // Update user in Firebase Auth
        await auth.updateUser(uid, updates);

        // Update custom claims if role changed
        if (role) {
            const user = await auth.getUser(uid);
            const currentClaims = user.customClaims || {};
            await auth.setCustomUserClaims(uid, {
                ...currentClaims,
                role
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/users/:uid - Delete user
 */
app.delete('/api/users/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        await auth.deleteUser(uid);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/chat - IntegraciÃ³n con Groq (Llama 3.3 70B) â€” Optimizado
 */

// â”€â”€ Retry helper for 429 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchWithRetry(url, options, maxRetries = 1) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, options);
        if (response.status === 429 && attempt < maxRetries) {
            const retryAfter = response.headers.get('retry-after');
            const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 3000;
            console.log(`â³ Rate-limited (429). Reintentando en ${waitMs}ms...`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
        }
        return response;
    }
}

// —— Prompt builders ———————————————————————————————————————
function buildIntentPrompt(latestDbDate) {
    // Use the latest DB date as reference if provided, otherwise fall back to today
    const referenceDate = latestDbDate ? new Date(latestDbDate + 'T12:00:00') : new Date();
    const todayReadable = referenceDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const todayISO = latestDbDate || referenceDate.toISOString().split('T')[0];
    
    const sixtyDaysAgo = new Date(referenceDate.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const ninetyDaysAgo = new Date(referenceDate.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    return `You are a database query translation assistant for Punto Farma.
Analyze the user's natural language question about customer RFM segments, purchases, and city locations, and extract the filtering parameters.
You must return ONLY a JSON object. No introductory text. No markdown code blocks.

Available segments (s):
- Cha: Champions (Campeones)
- Loy: Loyal (Leales)
- Pot: Potential Loyalists (Potenciales)
- New: New Customers (Nuevos)
- NRec: Nuevos Compradores Recientes
- NIna: Nuevos Compradores Inactivos
- Oca: Compradores Ocasionales
- Cri: Can't Lose Them (Críticos)
- Hib: Hibernating (Inactivos)
- Los: Lost (Perdidos)

Available cities (c):
- Teg: Tegucigalpa
- SPS: San Pedro Sula

Fields to extract:
- segment: string ("Cha","Loy","Pot","New","NRec","NIna","Oca","Cri","Hib","Los" or null)
- city: string ("Teg","SPS" or null)
- searchTerm: string (a customer NAME or PHONE NUMBER only, or null. Do NOT put product names or SKU codes here.)
- sku: string (a product SKU code like "10005845", or a product description if the user mentions a specific product, or null. This is ONLY for product/item filtering.)
- minMonetary: number or null (extract minimum total purchase/gasto amount if mentioned, e.g. "igual o mayor de 700" -> 700)
- maxMonetary: number or null (extract maximum total purchase/gasto amount if mentioned, e.g. "menos de 500" -> 500)
- generalStats: boolean (true ONLY for questions asking for summary stats/metrics like "total de ventas", "promedio de recencia", "ventas por ciudad", "resumen general". It MUST be false if the user asks to list/show/export clients, or asks for a list, table, names, phones, database, e.g. "generar una BD", "lista de clientes", "muestrame los clientes", "dame los telefonos".)
- statsType: string (only when generalStats is true: "count" for simple counts, "breakdown_segment" for per-segment, "breakdown_city" for per-city, "full_summary" for everything. null when generalStats is false.)
- dateFilter: object or null. Extract date ranges when mentioned.
  * startDate: "YYYY-MM-DD" or null. IMPORTANT: The latest available data in the database is from ${todayReadable} (${todayISO}). Use this date as "today" for all relative calculations.
    - For relative filters like "últimos 2 meses" (last 2 months), calculate the start date relative to ${todayISO} (e.g. ${todayISO} minus 60 days -> ${sixtyDaysAgo}).
    - If the user says "últimos meses" (last few months) without specifying a number, assume a default of the last 3 months (90 days) relative to ${todayISO} (e.g. ${todayISO} minus 90 days -> ${ninetyDaysAgo}).
  * endDate: "YYYY-MM-DD" or null. Must NEVER exceed ${todayISO}.
  * type: "no_purchase" (clients who did NOT buy) or "purchase" (clients who DID buy).
`;
}

const FINAL_SYSTEM_PROMPT = `Eres un asistente de IA experto en anÃ¡lisis de datos para FrecuenciaCompra de Punto Farma.
Tienes acceso a datos filtrados o resÃºmenes agregados de clientes en formato JSON.

Claves en registros individuales:
- n: nombre, p: telÃ©fono, c: ciudad (Teg=Tegucigalpa, SPS=San Pedro Sula)
- s: segmento RFM (Cha=Campeones, Loy=Leales, Pot=Potenciales, New=Nuevos, NRec=Nuevos Recientes, NIna=Nuevos Inactivos, Oca=Ocasionales, Cri=CrÃ­ticos, Hib=Inactivos, Los=Perdidos)
- r: recencia (dÃ­as desde Ãºltima compra), f: frecuencia (total pedidos), m: valor monetario (gasto en Lempiras)
- i: producto principal comprado (si disponible)

Instrucciones:
1. Usa Ãºnicamente los datos proporcionados. Nunca inventes datos.
2. Traduce abreviaturas a nombres completos en espaÃ±ol.
3. SÃ© conciso, profesional, responde en espaÃ±ol.
4. Usa tablas Markdown para listados y comparaciones.
5. Si no hay datos suficientes, acláralo amablemente.
6. Moneda: Lempiras (L.).
7. Si los datos tienen "truncated: true", significa que la lista fue recortada para mostrarte solo los mejores clientes por gasto. El campo "totalFilteredCount" indica cuántos clientes EN TOTAL cumplen los criterios del filtro (NO es el total de la base de datos). El campo "note" contiene una explicación que puedes parafrasear al usuario. Siempre di "X clientes cumplen los criterios" y "aquí te muestro los 15 principales por gasto", NUNCA digas "X clientes en la base de datos original".
`;

const SEGMENT_NAMES = {
    'Cha': 'Champions (Campeones)', 'Loy': 'Loyal Customers (Leales)',
    'Pot': 'Potential Loyalists (Potenciales)', 'New': 'New Customers (Nuevos)',
    'NRec': 'Nuevos Compradores Recientes', 'NIna': 'Nuevos Compradores Inactivos',
    'Oca': 'Compradores Ocasionales', 'Cri': "Can't Lose Them (CrÃ­ticos)",
    'Hib': 'Hibernating (Inactivos)', 'Los': 'Lost (Perdidos)'
};
const CITY_NAMES = { 'Teg': 'Tegucigalpa', 'SPS': 'San Pedro Sula' };

app.post('/api/chat', async (req, res) => {
    const { message, getIntent, filteredData, customers, intent, history } = req.body;

    // â”€â”€ Validations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!message) {
        return res.status(400).json({ success: false, error: 'El mensaje es requerido.' });
    }
    if (message.length > 500) {
        return res.status(400).json({ success: false, error: 'El mensaje es demasiado largo. MÃ¡ximo 500 caracteres.' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.error('âŒ GROQ_API_KEY is missing');
        return res.status(500).json({ success: false, error: 'La clave de API de Groq no estÃ¡ configurada.' });
    }

    const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';

    // â”€â”€ Build conversation history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const historyMessages = [];
    if (history && Array.isArray(history)) {
        history.slice(-4).forEach(h => {
            if (h.role && h.content) {
                historyMessages.push({ role: h.role, content: h.content.slice(0, 300) });
            }
        });
    }

    try {
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // STEP 1: Intent Extraction
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        if (getIntent) {
            console.log(`ðŸ¤– [Local] Extrayendo intenciÃ³n para: "${message}"`);

            const intentMessages = [
                { role: 'system', content: buildIntentPrompt(req.body.latestDbDate) },
                ...historyMessages,
                { role: 'user', content: message }
            ];

            const response = await fetchWithRetry(groqUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: intentMessages,
                    response_format: { type: 'json_object' },
                    temperature: 0.0
                })
            });

            if (!response.ok) {
                if (response.status === 429) {
                    return res.status(429).json({ success: false, error: 'Demasiadas solicitudes. Espera unos segundos e intenta de nuevo.' });
                }
                const errorDetails = await response.text();
                throw new Error(`Groq API (Intent) status ${response.status}: ${errorDetails}`);
            }

            const data = await response.json();
            const jsonText = data.choices?.[0]?.message?.content;
            let parsedIntent = { segment: null, city: null, searchTerm: null, sku: null, generalStats: false, statsType: null };
            try {
                parsedIntent = JSON.parse(jsonText);
            } catch (e) {
                console.error('Failed to parse intent JSON:', jsonText);
            }

            return res.json({ success: true, intent: parsedIntent });
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // STEP 2: Final Response Generation
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const dataToUse = filteredData || customers;

        let filterExplanation = '';
        if (intent) {
            filterExplanation = `[SISTEMA - INFORMACIÃ“N IMPORTANTE]:
El frontend ya pre-filtrÃ³ la base de datos exactamente. Los datos JSON son la lista final filtrada:
- Segmento: ${intent.segment ? SEGMENT_NAMES[intent.segment] || intent.segment : 'Todos'}
- Ciudad: ${intent.city ? CITY_NAMES[intent.city] || intent.city : 'Todas'}
- BÃºsqueda: ${intent.searchTerm || 'Cualquiera'}
- SKU/Producto: ${intent.sku || 'Cualquiera'}
- Rango de fechas: ${intent.dateFilter ? `${intent.dateFilter.type === 'no_purchase' ? 'Clientes SIN compras' : 'Clientes CON compras'} entre ${intent.dateFilter.startDate} y ${intent.dateFilter.endDate}` : 'Ninguno'}

No re-apliques filtros. El filtrado YA SE HIZO. Analiza la lista proporcionada.\n\n`;
        }

        const dataContext = dataToUse
            ? `\nDatos (JSON):\n${JSON.stringify(dataToUse)}\n\n`
            : `\nNo hay datos de clientes cargados.\n`;

        const chatMessages = [
            { role: 'system', content: FINAL_SYSTEM_PROMPT },
            ...historyMessages,
            { role: 'user', content: `${filterExplanation}${dataContext}Pregunta del usuario: ${message}` }
        ];

        console.log(`ðŸ¤– [Local] Generando respuesta final con Groq...`);
        const response = await fetchWithRetry(groqUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: chatMessages,
                temperature: 0.2
            })
        });

        if (!response.ok) {
            if (response.status === 429) {
                return res.status(429).json({ success: false, error: 'Demasiadas solicitudes. Espera unos segundos e intenta de nuevo.' });
            }
            const errorDetails = await response.text();
            throw new Error(`Groq API status ${response.status}: ${errorDetails}`);
        }

        const data = await response.json();
        const replyText = data.choices?.[0]?.message?.content;

        if (!replyText) {
            throw new Error('No se recibiÃ³ texto del modelo de IA.');
        }

        res.json({ success: true, reply: replyText });

    } catch (error) {
        console.error('âŒ Error en endpoint de chat local:', error);
        res.status(500).json({
            success: false,
            error: `Error al conectar con la IA: ${error.message}`
        });
    }
});
// Start server
app.listen(PORT, () => {
    console.log(`\nðŸš€ User Management API Server running on http://localhost:${PORT}`);
    console.log('   Available endpoints:');
    console.log('   GET    /api/users       - List all users');
    console.log('   POST   /api/users       - Create user');
    console.log('   PUT    /api/users/:uid  - Update user');
    console.log('   DELETE /api/users/:uid  - Delete user');
    console.log('   POST   /api/chat        - Chat with Groq AI\n');
});
