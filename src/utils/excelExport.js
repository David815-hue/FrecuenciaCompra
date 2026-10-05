import * as XLSX from 'xlsx';
import { getProductTerms, getPurchaseExportMetadata, orderMatchesProducts } from './purchaseActivity.js';

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
