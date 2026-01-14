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
    return customers.map(customer => {
        const { recencyScore: r, frequencyScore: f, monetaryScore: m } = customer.rfm;
        let segment = '';

        // Champions: Best customers
        if (r >= 4 && f >= 4 && m >= 4) {
            segment = 'Champions';
        }
        // Loyal Customers: Regular buyers with good spending
        else if (r >= 3 && f >= 4 && m >= 3) {
            segment = 'Loyal Customers';
        }
        // Potential Loyalists: Recent customers with potential
        else if (r >= 4 && f >= 2 && f <= 3 && m >= 2 && m <= 3) {
            segment = 'Potential Loyalists';
        }
        // New Customers: Just started buying
        else if (r >= 4 && f === 1) {
            segment = 'New Customers';
        }
        // At Risk: Used to be good, declining activity
        else if (r >= 2 && r <= 3 && f >= 3 && m >= 3) {
            segment = 'At Risk';
        }
        // Can't Lose Them: High-value customers who haven't purchased recently
        else if (r <= 2 && f >= 4 && m >= 4) {
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
        // Others
        else {
            segment = 'Others';
        }

        return {
            ...customer,
            rfm: {
                ...customer.rfm,
                segment
            }
        };
    });
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
            description: 'Mejores clientes: compran con frecuencia, recientemente y gastan más',
            tooltip: 'Clientes de máximo valor que compran frecuentemente, han comprado recientemente y tienen el gasto más alto. Son tus embajadores de marca.',
            priority: 1
        },
        'Loyal Customers': {
            name: 'Leales',
            icon: '💎',
            color: '#4F46E5',
            bgColor: '#EEF2FF',
            darkBgColor: '#1E1B4B',
            description: 'Compradores regulares con buen gasto promedio',
            tooltip: 'Clientes confiables que compran regularmente y mantienen un gasto consistente. Base sólida de tu negocio.',
            priority: 2
        },
        'Potential Loyalists': {
            name: 'Potenciales',
            icon: '🌟',
            color: '#10B981',
            bgColor: '#ECFDF5',
            darkBgColor: '#064E3B',
            description: 'Clientes recientes con potencial de volverse leales',
            tooltip: 'Clientes que han comprado recientemente pero con frecuencia moderada. Gran oportunidad de convertirlos en clientes leales.',
            priority: 3
        },
        'New Customers': {
            name: 'Nuevos',
            icon: '🆕',
            color: '#06B6D4',
            bgColor: '#ECFEFF',
            darkBgColor: '#164E63',
            description: 'Acaban de realizar su primera compra',
            tooltip: 'Clientes que realizaron su primera compra recientemente. Es crucial crear una buena primera impresión.',
            priority: 4
        },
        'At Risk': {
            name: 'En Riesgo',
            icon: '💤',
            color: '#F59E0B',
            bgColor: '#FEF3C7',
            darkBgColor: '#78350F',
            description: 'Clientes valiosos que están perdiendo actividad',
            tooltip: 'Clientes que solían comprar frecuentemente pero han reducido su actividad. Necesitan atención para evitar perderlos.',
            priority: 5
        },
        "Can't Lose Them": {
            name: 'Críticos',
            icon: '⚠️',
            color: '#EF4444',
            bgColor: '#FEE2E2',
            darkBgColor: '#7F1D1D',
            description: 'Alto valor pero sin compras recientes',
            tooltip: 'Clientes de alto gasto que no han comprado recientemente. Requieren acción inmediata para recuperarlos.',
            priority: 6
        },
        'Hibernating': {
            name: 'Inactivos',
            icon: '😴',
            color: '#6B7280',
            bgColor: '#F3F4F6',
            darkBgColor: '#374151',
            description: 'Baja actividad, pueden estar perdidos',
            tooltip: 'Clientes con baja frecuencia y que no han comprado recientemente. Difícil pero posible de recuperar.',
            priority: 7
        },
        'Lost': {
            name: 'Perdidos',
            icon: '👋',
            color: '#374151',
            bgColor: '#E5E7EB',
            darkBgColor: '#1F2937',
            description: 'No han comprado en mucho tiempo',
            tooltip: 'Clientes que no han mostrado actividad en largo tiempo. Gastos mínimos, frecuencia mínima y recencia mínima.',
            priority: 8
        },
        'Others': {
            name: 'Otros',
            icon: '📊',
            color: '#8B5CF6',
            bgColor: '#F5F3FF',
            darkBgColor: '#4C1D95',
            description: 'Patrones de compra variados',
            tooltip: 'Clientes con combinaciones de RFM que no encajan en las categorías principales. Requieren análisis individual.',
            priority: 9
        }
    };

    return segmentData[segment] || segmentData['Others'];
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
