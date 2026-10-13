import * as XLSX from 'xlsx';
import { getCustomerKey, getProductTerms, getPurchaseDateKey, getPurchaseExportMetadata, orderMatchesProducts } from './purchaseActivity.js';

// Find the most recent identified gestor across all purchases, independently
// of the report's product, month, zone or gestor filters.
export const buildLastGestorIndex = data => {
    const index = new Map();
    for (const order of data || []) {
        const key = getCustomerKey(order);
        const date = getPurchaseDateKey(order.orderDate);
        const name = String(order.gestorName || '').trim();
        if (!key || !date || !name || /^sin\s*(asignar|gestor|gestora)$/i.test(name)) continue;
        const hasTime = order.orderDate instanceof Date || /[T ]\d{2}:\d{2}/.test(String(order.orderDate));
        const time = hasTime ? new Date(order.orderDate).getTime() : 0;
        const previous = index.get(key);
        if (!previous || date > previous.date || (date === previous.date && time >= previous.time)) {
            index.set(key, { name, date, time });
        }
    }
    return index;
};

export const getLastGestorExportColumns = (customer, index) => ({
    'Último gestor': index.get(getCustomerKey(customer))?.name || 'Sin gestor registrado'
});

export const getExportableCustomers = (customers, query = '') => {
    const terms = getProductTerms(query);
    return (customers || []).filter(customer => {
        if (customer.isContactSuppressed) return false;
        const suppressedSkus = (customer.contactSuppressedSkus || []).map(sku => String(sku).toLowerCase());
        return !suppressedSkus.some(sku => terms.some(term => term === sku || term.includes(sku)))
            && !(customer.orders || []).some(order => (order.items || []).some(item =>
                suppressedSkus.includes(String(item.sku || '').toLowerCase())
                && orderMatchesProducts({ items: [item] }, terms)));
    });
};

export const appendReportFilters = (workbook, { purchaseFilter, lastDate, extraFilters = [] } = {}) => {
    const filters = [...extraFilters];
    if (purchaseFilter?.enabled) filters.push(...getPurchaseExportMetadata(purchaseFilter, lastDate));
    if (filters.length) {
        const sheet = XLSX.utils.json_to_sheet(filters);
        sheet['!cols'] = [{ wch: 38 }, { wch: 90 }];
        XLSX.utils.book_append_sheet(workbook, sheet, 'Filtros');
    }
};
