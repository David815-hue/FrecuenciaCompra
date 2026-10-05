const TIME_ZONE = 'America/Tegucigalpa';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});
const monthFormatter = new Intl.DateTimeFormat('es-HN', {
    timeZone: 'UTC', month: 'long', year: 'numeric'
});

export const emptyPurchaseFilter = () => ({
    enabled: false, boughtMonths: [], missingMonths: [], scope: 'all', productQuery: ''
});

export const getCustomerKey = customer =>
    customer.email || customer.phone || customer.name || customer.customerName || '';

// Date-only values are calendar dates; timestamps are interpreted in Honduras.
export const getPurchaseDateKey = value => {
    if (!value) return '';
    const text = String(value).trim();
    const calendar = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const latin = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (calendar || latin) {
        const [, year, month, day] = calendar || [null, latin[3], latin[2], latin[1]];
        const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month)
            && date.getUTCDate() === Number(day) ? `${year}-${month}-${day}` : '';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
};

export const getPurchaseMonth = value => getPurchaseDateKey(value).slice(0, 7);
export const formatPurchaseMonth = key => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key || '')) return '';
    return monthFormatter.format(new Date(`${key}-01T12:00:00Z`));
};
export const formatPurchaseDate = key => key ? key.split('-').reverse().join('/') : 'Sin datos';

export const comparisonEndDate = (filter, fallback) => {
    if (!filter?.enabled) return fallback;
    const lastMonth = [...filter.boughtMonths, ...filter.missingMonths]
        .filter(month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)).sort().at(-1);
    return lastMonth ? new Date(`${lastMonth}-01T12:00:00`) : fallback;
};

export const previousMonthFilter = (now = new Date()) => {
    const current = getPurchaseMonth(now);
    const date = new Date(`${current}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - 1);
    return { ...emptyPurchaseFilter(), enabled: true,
        boughtMonths: [date.toISOString().slice(0, 7)], missingMonths: [current] };
};

export const getProductTerms = query => String(query || '').toLowerCase()
    .split(/[\n,]+/).map(t => t.trim()).filter(Boolean);

export const orderMatchesProducts = (order, terms) => (order.items || []).some(item =>
    terms.some(term => String(item.sku || '').toLowerCase().includes(term)
        || String(item.description || '').toLowerCase().includes(term)));

// The existing search bar determines the comparison; customer searches still
// check absence of any purchase. Never retain a product from an older query.
export const resolvePurchaseFilterForSearch = (filter, data, query = '') => {
    const terms = getProductTerms(query);
    const isProductSearch = filter.enabled && terms.length > 0
        && data.some(order => orderMatchesProducts(order, terms));
    return { ...filter, scope: isProductSearch ? 'product' : 'all',
        productQuery: isProductSearch ? String(query).trim() : '' };
};

export const buildPurchaseHistory = (data, productQuery = '') => {
    const terms = getProductTerms(productQuery);
    const byCustomer = new Map();
    let firstMonth = '';
    let lastDate = '';
    for (const order of data) {
        const date = getPurchaseDateKey(order.orderDate);
        const key = getCustomerKey(order);
        if (!date || !key) continue;
        const month = date.slice(0, 7);
        if (!firstMonth || month < firstMonth) firstMonth = month;
        if (date > lastDate) lastDate = date;
        if (terms.length && !orderMatchesProducts(order, terms)) continue;
        if (!byCustomer.has(key)) byCustomer.set(key, { months: new Set(), lastDate: '' });
        const history = byCustomer.get(key);
        history.months.add(month);
        if (date > history.lastDate) history.lastDate = date;
    }
    return { byCustomer, firstMonth, lastDate };
};

export const purchaseFilterError = filter => {
    if (!filter?.enabled) return '';
    if (!filter.missingMonths.length) return 'Selecciona al menos un mes sin compra.';
    if ([...filter.boughtMonths, ...filter.missingMonths].some(m => !/^\d{4}-(0[1-9]|1[0-2])$/.test(m))) {
        return 'Selecciona meses válidos, incluyendo el año.';
    }
    if (filter.boughtMonths.some(m => filter.missingMonths.includes(m))) {
        return 'Un mes no puede estar en ambas selecciones. Quita el mes repetido.';
    }
    if (filter.scope === 'product' && !getProductTerms(filter.productQuery).length) {
        return 'Indica el SKU o producto que quieres comparar.';
    }
    return '';
};

// Keep the purchase cohort in the selected gestor/search scope. Check absence
// against ALL channels and gestores, without trimming history by display dates.
export const filterCustomersByPurchaseActivity = (customers, filter, history) => {
    if (!filter?.enabled) return customers;
    if (purchaseFilterError(filter)) return [];
    const bought = new Set(filter.boughtMonths);
    const firstMissing = [...filter.missingMonths].sort()[0];
    const terms = filter.scope === 'product' ? getProductTerms(filter.productQuery) : [];
    return customers.flatMap(customer => {
        const activity = history.byCustomer.get(getCustomerKey(customer));
        if (!activity || filter.missingMonths.some(month => activity.months.has(month))) return [];
        const orders = customer.orders.filter(order => {
            const month = getPurchaseMonth(order.orderDate);
            return month && (bought.size ? bought.has(month) : month < firstMissing)
                && (!terms.length || orderMatchesProducts(order, terms));
        });
        if (!orders.length) return [];
        const total = orders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);
        return [{ ...customer, orders, totalInvestment: total, totalSpent: total,
            comparisonLastPurchase: activity.lastDate }];
    });
};

export const getPurchaseExportColumns = (customer, filter) => !filter?.enabled ? {} : ({
    'Compraron en': filter.boughtMonths.length
        ? [...filter.boughtMonths].sort().map(formatPurchaseMonth).join(', ')
        : 'Historial anterior a los meses sin compra',
    'Sin compras en': [...filter.missingMonths].sort().map(formatPurchaseMonth).join(', '),
    'Criterio de recompra': filter.scope === 'product' ? `Producto: ${filter.productQuery}` : 'Cualquier compra',
    'Última compra del criterio': formatPurchaseDate(customer.comparisonLastPurchase)
});

export const getPurchaseExportMetadata = (filter, lastDate) => [
    { Filtro: 'Compraron en', Valor: filter.boughtMonths.length
        ? [...filter.boughtMonths].sort().map(formatPurchaseMonth).join(', ') : 'Historial anterior a los meses sin compra' },
    { Filtro: 'No han comprado en', Valor: [...filter.missingMonths].sort().map(formatPurchaseMonth).join(', ') },
    { Filtro: 'Criterio', Valor: filter.scope === 'product' ? `Producto: ${filter.productQuery}` : 'Cualquier compra' },
    { Filtro: 'Última compra registrada en la base', Valor: formatPurchaseDate(lastDate) },
    { Filtro: 'Totales del reporte', Valor: 'Compras de los meses seleccionados; si no se seleccionaron, historial anterior a los meses sin compra.' },
    { Filtro: 'Verificación de recompra', Valor: 'Todos los gestores y canales. El mes actual se evalúa con la información cargada.' }
];
