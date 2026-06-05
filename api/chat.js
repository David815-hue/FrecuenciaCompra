/**
 * Vercel Serverless Function: POST /api/chat
 * Integración con Groq (Llama 3.3 70B) — Optimizado
 */

// ── Retry helper for 429 rate-limit errors ──────────────────────────
async function fetchWithRetry(url, options, maxRetries = 1) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, options);
        if (response.status === 429 && attempt < maxRetries) {
            const retryAfter = response.headers.get('retry-after');
            const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 3000;
            console.log(`⏳ Rate-limited (429). Reintentando en ${waitMs}ms...`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
        }
        return response;
    }
}

// ── Prompt builders (dynamic date) ──────────────────────────────────
function buildIntentPrompt() {
    const now = new Date();
    const todayReadable = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const todayISO = now.toISOString().split('T')[0];

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
- generalStats: boolean (true ONLY for totals, counts, averages, or summary statistics. false for customer lists, details, or phone numbers.)
- statsType: string (only when generalStats is true: "count" for simple counts, "breakdown_segment" for per-segment, "breakdown_city" for per-city, "full_summary" for everything. null when generalStats is false.)
- dateFilter: object or null. Extract date ranges when mentioned.
  * startDate: "YYYY-MM-DD" or null. IMPORTANT: Today is ${todayReadable} (${todayISO}).
  * endDate: "YYYY-MM-DD" or null.
  * type: "no_purchase" (clients who did NOT buy) or "purchase" (clients who DID buy).
`;
}

const FINAL_SYSTEM_PROMPT = `Eres un asistente de IA experto en análisis de datos para FrecuenciaCompra de Punto Farma.
Tienes acceso a datos filtrados o resúmenes agregados de clientes en formato JSON.

Claves en registros individuales:
- n: nombre, p: teléfono, c: ciudad (Teg=Tegucigalpa, SPS=San Pedro Sula)
- s: segmento RFM (Cha=Campeones, Loy=Leales, Pot=Potenciales, New=Nuevos, NRec=Nuevos Recientes, NIna=Nuevos Inactivos, Oca=Ocasionales, Cri=Críticos, Hib=Inactivos, Los=Perdidos)
- r: recencia (días desde última compra), f: frecuencia (total pedidos), m: valor monetario (gasto en Lempiras)
- i: producto principal comprado (si disponible)

Instrucciones:
1. Usa únicamente los datos proporcionados. Nunca inventes datos.
2. Traduce abreviaturas a nombres completos en español.
3. Sé conciso, profesional, responde en español.
4. Usa tablas Markdown para listados y comparaciones.
5. Si no hay datos suficientes, acláralo amablemente.
6. Moneda: Lempiras (L.).
7. Si los datos tienen "truncated: true", significa que la lista fue recortada para mostrarte solo los mejores clientes por gasto. El campo "totalFilteredCount" indica cuántos clientes EN TOTAL cumplen los criterios del filtro (NO es el total de la base de datos). El campo "note" contiene una explicación que puedes parafrasear al usuario. Siempre di "X clientes cumplen los criterios" y "aquí te muestro los 15 principales por gasto", NUNCA digas "X clientes en la base de datos original".
`;

// ── Segment & city name maps ────────────────────────────────────────
const SEGMENT_NAMES = {
    'Cha': 'Champions (Campeones)', 'Loy': 'Loyal Customers (Leales)',
    'Pot': 'Potential Loyalists (Potenciales)', 'New': 'New Customers (Nuevos)',
    'NRec': 'Nuevos Compradores Recientes', 'NIna': 'Nuevos Compradores Inactivos',
    'Oca': 'Compradores Ocasionales', 'Cri': "Can't Lose Them (Críticos)",
    'Hib': 'Hibernating (Inactivos)', 'Los': 'Lost (Perdidos)'
};
const CITY_NAMES = { 'Teg': 'Tegucigalpa', 'SPS': 'San Pedro Sula' };

// ── Main handler ────────────────────────────────────────────────────
export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { message, getIntent, filteredData, customers, intent, history } = req.body;

    // ── Validations ─────────────────────────────────────────────────
    if (!message) {
        return res.status(400).json({ success: false, error: 'El mensaje es requerido.' });
    }
    if (message.length > 500) {
        return res.status(400).json({ success: false, error: 'El mensaje es demasiado largo. Máximo 500 caracteres.' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.error('❌ GROQ_API_KEY is missing');
        return res.status(500).json({ success: false, error: 'La clave de API de Groq no está configurada.' });
    }

    const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';

    // ── Build conversation history array ────────────────────────────
    const historyMessages = [];
    if (history && Array.isArray(history)) {
        history.slice(-4).forEach(h => {
            if (h.role && h.content) {
                historyMessages.push({ role: h.role, content: h.content.slice(0, 300) });
            }
        });
    }

    try {
        // ════════════════════════════════════════════════════════════
        // STEP 1: Intent Extraction
        // ════════════════════════════════════════════════════════════
        if (getIntent) {
            console.log(`🤖 Extrayendo intención para: "${message}"`);

            const intentMessages = [
                { role: 'system', content: buildIntentPrompt() },
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

            return res.status(200).json({ success: true, intent: parsedIntent });
        }

        // ════════════════════════════════════════════════════════════
        // STEP 2: Final Response Generation
        // ════════════════════════════════════════════════════════════
        const dataToUse = filteredData || customers;

        let filterExplanation = '';
        if (intent) {
            filterExplanation = `[SISTEMA - INFORMACIÓN IMPORTANTE]:
El frontend ya pre-filtró la base de datos exactamente. Los datos JSON son la lista final filtrada:
- Segmento: ${intent.segment ? SEGMENT_NAMES[intent.segment] || intent.segment : 'Todos'}
- Ciudad: ${intent.city ? CITY_NAMES[intent.city] || intent.city : 'Todas'}
- Búsqueda: ${intent.searchTerm || 'Cualquiera'}
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

        console.log(`🤖 Generando respuesta final con Groq...`);
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
            throw new Error('No se recibió texto del modelo de IA.');
        }

        return res.status(200).json({ success: true, reply: replyText });

    } catch (error) {
        console.error('❌ Error en endpoint de chat:', error);
        return res.status(500).json({
            success: false,
            error: `Error al conectar con la IA: ${error.message}`
        });
    }
}
