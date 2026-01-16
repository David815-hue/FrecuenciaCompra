import { differenceInDays } from 'date-fns';

/**
 * Calculate RFM (Recency, Frequency, Monetary) values for customers
 * @param {Array} customers - Array of customer objects with orders
 * @param {Date} referenceDate - Reference date for recency calculation (usually today)
 * @returns {Array} Customers with RFM values
 */
export const calculateRFM = (customers, referenceDate = new Date()) => {
    return customers.map(customer => {
        // Recency: Days since last purchase
        const orderDates = customer.orders.map(o => new Date(o.orderDate)).filter(d => !isNaN(d));
        const lastPurchaseDate = orderDates.length > 0
            ? new Date(Math.max(...orderDates))
            : null;

        const recency = lastPurchaseDate
            ? differenceInDays(referenceDate, lastPurchaseDate)
            : Infinity;

        // Frequency: Number of purchases
        const frequency = customer.orders.length;

        // Monetary: Total amount spent
        const monetary = customer.totalInvestment || customer.orders.reduce((sum, order) => {
            return sum + (parseFloat(order.totalAmount) || 0);
        }, 0);

        return {
            ...customer,
            rfm: {
                recency,
                frequency,
                monetary,
                recencyScore: 0,
                frequencyScore: 0,
                monetaryScore: 0,
                totalScore: 0,
                segment: ''
            }
        };
    });
};

/**
 * Calculate quintile scores (1-5) for RFM metrics
 * @param {Array} customers - Customers with RFM values
 * @returns {Array} Customers with RFM scores
 */
export const scoreRFM = (customers) => {
    if (customers.length === 0) return [];

    // Get all valid values for each metric
    const recencies = customers.map(c => c.rfm.recency).filter(r => r !== Infinity);
    const frequencies = customers.map(c => c.rfm.frequency);
    const monetaries = customers.map(c => c.rfm.monetary);

    // Calculate quintiles (20th, 40th, 60th, 80th percentiles)
    const getQuintiles = (arr) => {
        const sorted = [...arr].sort((a, b) => a - b);
        return [
            sorted[Math.floor(sorted.length * 0.2)],
            sorted[Math.floor(sorted.length * 0.4)],
            sorted[Math.floor(sorted.length * 0.6)],
            sorted[Math.floor(sorted.length * 0.8)]
        ];
    };

    const recencyQuintiles = getQuintiles(recencies);
    const frequencyQuintiles = getQuintiles(frequencies);
    const monetaryQuintiles = getQuintiles(monetaries);

    // Assign scores (note: for recency, lower is better, so we reverse the score)
    const getRecencyScore = (val) => {
        if (val === Infinity) return 1;
        if (val <= recencyQuintiles[0]) return 5;
        if (val <= recencyQuintiles[1]) return 4;
        if (val <= recencyQuintiles[2]) return 3;
        if (val <= recencyQuintiles[3]) return 2;
        return 1;
    };

    const getFrequencyScore = (val) => {
        if (val >= frequencyQuintiles[3]) return 5;
        if (val >= frequencyQuintiles[2]) return 4;
        if (val >= frequencyQuintiles[1]) return 3;
        if (val >= frequencyQuintiles[0]) return 2;
        return 1;
    };

    const getMonetaryScore = (val) => {
        if (val >= monetaryQuintiles[3]) return 5;
        if (val >= monetaryQuintiles[2]) return 4;
        if (val >= monetaryQuintiles[1]) return 3;
        if (val >= monetaryQuintiles[0]) return 2;
        return 1;
    };

    return customers.map(customer => {
        const rScore = getRecencyScore(customer.rfm.recency);
        const fScore = getFrequencyScore(customer.rfm.frequency);
        const mScore = getMonetaryScore(customer.rfm.monetary);

        return {
            ...customer,
            rfm: {
                ...customer.rfm,
                recencyScore: rScore,
                frequencyScore: fScore,
                monetaryScore: mScore,
                totalScore: rScore + fScore + mScore
            }
        };
    });
};

/**
 * Segment customers based on RFM scores
 * @param {Array} customers - Customers with RFM scores
 * @returns {Array} Customers with segment classification
 */
export const segmentCustomers = (customers) => {
    const uncategorized = [];

    const segmented = customers.map(customer => {
        const { recencyScore: r, frequencyScore: f, monetaryScore: m, frequency } = customer.rfm;
        let segment = '';

        // Champions: Best customers - Must be recent (≤30 days)
        if (r >= 4 && f >= 4 && m >= 4 && customer.rfm.recency <= 30) {
            segment = 'Champions';
        }
        // Loyal Customers: Regular buyers with good spending - Must be recent (≤60 days)
        else if (r >= 3 && f >= 4 && m >= 3 && customer.rfm.recency <= 60) {
            segment = 'Loyal Customers';
        }
        // Potential Loyalists: Recent customers with potential - Must be very recent (≤45 days)
        else if (r >= 4 && f >= 2 && f <= 3 && m >= 2 && m <= 3 && customer.rfm.recency <= 45) {
            segment = 'Potential Loyalists';
        }
        // New Customers (by score): Recently purchased, only 1 time
        else if (r >= 4 && f === 1) {
            segment = 'New Customers';
        }
        // NUEVO: Nuevos Compradores Recientes - 1 purchase in last 60 days
        else if (frequency === 1 && customer.rfm.recency <= 60) {
            segment = 'Nuevos Compradores Recientes';
        }
        // NUEVO: Nuevos Compradores Inactivos - 1 purchase more than 60 days ago
        else if (frequency === 1 && customer.rfm.recency > 60) {
            segment = 'Nuevos Compradores Inactivos';
        }
        // NUEVO: Compradores Ocasionales - 2 or 3 purchases
        else if (frequency === 2 || frequency === 3) {
            segment = 'Compradores Ocasionales';
        }
        // Críticos: High-value customers at risk or already declining
        // Includes: valuable customers losing activity, high-value without recent purchases, 
        // AND high-frequency customers who haven't purchased recently (>60 days)
        else if ((r >= 2 && r <= 3 && f >= 3 && m >= 3) ||
            (r <= 2 && f >= 4 && m >= 4) ||
            (frequency >= 4 && customer.rfm.recency > 60)) {
            segment = "Can't Lose Them";
        }
        // Hibernating: Low activity, may be lost
        else if (r <= 2 && f <= 2 && m >= 2 && m <= 3) {
            segment = 'Hibernating';
        }
        // Lost: Haven't purchased in a long time
        else if (r === 1 && f === 1 && m === 1) {
            segment = 'Lost';
        }
        // If still not categorized, log it
        else {
            uncategorized.push({
                name: customer.name,
                frequency: customer.rfm.frequency,
                recency: customer.rfm.recency,
                monetary: customer.rfm.monetary,
                scores: { r, f, m }
            });
            // Fallback to Compradores Ocasionales for safety
            segment = 'Compradores Ocasionales';
        }

        return {
            ...customer,
            rfm: {
                ...customer.rfm,
                segment
            }
        };
    });

    // Log uncategorized customers for debugging
    if (uncategorized.length > 0) {
        console.warn('⚠️ Clientes NO catalogados:', uncategorized.length);
        console.table(uncategorized);
    } else {
        console.log('✅ Todos los clientes fueron catalogados correctamente');
    }

    return segmented;
};

/**
 * Get segment information (description, color, icon, recommendations)
 * @param {string} segment - Segment name
 * @returns {Object} Segment info
 */
export const getSegmentInfo = (segment) => {
    const segmentData = {
        'Champions': {
            name: 'Campeones',
            icon: '🏆',
            color: '#FFD700',
            bgColor: '#FFF9E6',
            darkBgColor: '#4A3F00',
            description: 'Compran muy seguido (4+ pedidos), última compra ≤30 días, gasto alto',
            tooltip: 'Mejores clientes. Son embajadores de tu marca que compran frecuentemente y recientemente.',
            priority: 1
        },
        'Loyal Customers': {
            name: 'Leales',
            icon: '💎',
            color: '#4F46E5',
            bgColor: '#EEF2FF',
            darkBgColor: '#1E1B4B',
            description: 'Compran regularmente (4+ pedidos), última compra ≤60 días, gasto consistente',
            tooltip: 'Base sólida del negocio. Clientes confiables que mantienen actividad regular.',
            priority: 2
        },
        'Potential Loyalists': {
            name: 'Potenciales',
            icon: '🌟',
            color: '#10B981',
            bgColor: '#ECFDF5',
            darkBgColor: '#064E3B',
            description: '2-3 compras, última ≤45 días. Gran oportunidad de fidelización',
            tooltip: 'Clientes prometedores en camino a ser leales. Requieren incentivos para aumentar frecuencia.',
            priority: 3
        },
        'New Customers': {
            name: 'Nuevos',
            icon: '🆕',
            color: '#06B6D4',
            bgColor: '#ECFEFF',
            darkBgColor: '#164E63',
            description: 'Primera compra reciente (clasificación automática por score)',
            tooltip: 'Clientes que hicieron su primera compra muy recientemente y obtuvieron score alto de recencia. Primera impresión es crucial.',
            priority: 4
        },
        'Nuevos Compradores Recientes': {
            name: 'Nuevos Compradores Recientes',
            icon: '🌱',
            color: '#84CC16',
            bgColor: '#F7FEE7',
            darkBgColor: '#365314',
            description: '1 compra ≤60 días. Alta oportunidad para segunda compra',
            tooltip: 'Compraron recientemente pero solo una vez. Necesitan incentivo para regresar.',
            priority: 5
        },
        'Nuevos Compradores Inactivos': {
            name: 'Nuevos Compradores Inactivos',
            icon: '💤',
            color: '#1F2937',
            bgColor: '#F9FAFB',
            darkBgColor: '#111827',
            description: '1 compra hace >60 días. Requieren reactivación urgente',
            tooltip: 'Probablemente perdidos. Necesitan campaña agresiva o descartarlos.',
            priority: 6
        },
        'Compradores Ocasionales': {
            name: 'Compradores Ocasionales',
            icon: '🔄',
            color: '#A855F7',
            bgColor: '#FAF5FF',
            darkBgColor: '#581C87',
            description: '2-3 compras totales. Pueden ser regulares o abandonar',
            tooltip: 'Compran ocasionalmente. Necesitan incentivos para aumentar frecuencia de compra.',
            priority: 7
        },
        "Can't Lose Them": {
            name: 'Críticos',
            icon: '⚠️',
            color: '#EF4444',
            bgColor: '#FEE2E2',
            darkBgColor: '#7F1D1D',
            description: 'Buenos clientes (4+ compras) pero >60 días inactivos. ¡CONTACTAR YA!',
            tooltip: 'URGENTE: Alto riesgo de pérdida definitiva. Requieren acción inmediata.',
            priority: 8
        },
        'Hibernating': {
            name: 'Inactivos',
            icon: '😴',
            color: '#6B7280',
            bgColor: '#F3F4F6',
            darkBgColor: '#374151',
            description: 'Baja frecuencia y mucho tiempo sin comprar',
            tooltip: 'Clientes con pocas compras y mucho tiempo inactivos. Difícil pero posible recuperar con ofertas especiales.',
            priority: 9
        },
        'Lost': {
            name: 'Perdidos',
            icon: '👋',
            color: '#374151',
            bgColor: '#E5E7EB',
            darkBgColor: '#1F2937',
            description: 'Sin actividad significativa. Gastos, frecuencia y recencia mínimos',
            tooltip: 'Clientes perdidos definitivamente. Scores mínimos en todo (1-1-1). No vale la pena invertir recursos en reactivarlos.',
            priority: 10
        }
    };

    return segmentData[segment] || segmentData['Compradores Ocasionales'];
};

/**
 * Get aggregated segment statistics
 * @param {Array} customers - Segmented customers
 * @returns {Object} Segment statistics
 */
export const getSegmentStats = (customers) => {
    const stats = {};

    customers.forEach(customer => {
        const segment = customer.rfm.segment;
        if (!stats[segment]) {
            stats[segment] = {
                count: 0,
                totalRevenue: 0,
                avgRecency: 0,
                avgFrequency: 0,
                avgMonetary: 0,
                customers: []
            };
        }

        stats[segment].count++;
        stats[segment].totalRevenue += customer.rfm.monetary;
        stats[segment].avgRecency += customer.rfm.recency;
        stats[segment].avgFrequency += customer.rfm.frequency;
        stats[segment].avgMonetary += customer.rfm.monetary;
        stats[segment].customers.push(customer);
    });

    // Calculate averages
    Object.keys(stats).forEach(segment => {
        const count = stats[segment].count;
        stats[segment].avgRecency = Math.round(stats[segment].avgRecency / count);
        stats[segment].avgFrequency = Math.round(stats[segment].avgFrequency / count);
        stats[segment].avgMonetary = Math.round(stats[segment].avgMonetary / count);
        stats[segment].percentage = ((count / customers.length) * 100).toFixed(1);
        stats[segment].info = getSegmentInfo(segment);
    });

    return stats;
};

/**
 * Process complete RFM analysis
 * @param {Array} customers - Customer array
 * @param {Date} referenceDate - Reference date
 * @returns {Object} Complete RFM analysis
 */
export const performRFMAnalysis = (customers, referenceDate = new Date()) => {
    // Step 1: Calculate RFM values
    let analyzedCustomers = calculateRFM(customers, referenceDate);

    // Step 2: Score RFM
    analyzedCustomers = scoreRFM(analyzedCustomers);

    // Step 3: Segment customers
    analyzedCustomers = segmentCustomers(analyzedCustomers);

    // Step 4: Get statistics
    const segmentStats = getSegmentStats(analyzedCustomers);

    return {
        customers: analyzedCustomers,
        stats: segmentStats,
        totalCustomers: analyzedCustomers.length,
        totalSegments: Object.keys(segmentStats).length
    };
};
