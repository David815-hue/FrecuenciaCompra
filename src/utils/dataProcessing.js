import * as XLSX from 'xlsx';
import { getGestorInfo } from '../config/gestores.js';
import { getPurchaseExportColumns, orderMatchesProducts } from './purchaseActivity.js';
import { appendReportFilters, buildLastGestorIndex, getExportableCustomers, getLastGestorExportColumns } from './excelExport.js';

// Helper to parse Excel file to JSON
export const parseExcel = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
                resolve(jsonData);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

// Clean Albatross Data
// Requirement: Order ID starts with '00', remove it. May end with '-I', remove it.
// NEW Requirement: Only 'Entregado' status.
// NEW: Extract 'Usuario POS' field and map to gestor info
export const cleanAlbatrossData = (data) => {
    return data
        .filter(row => row['Estado'] === 'Entregado')
        .map((row) => {
            let rawId = String(row['Número de Pedido'] || '');

            // Remove leading zeros
            let cleanedId = rawId.replace(/^0+/, '');

            // Remove '-I' suffix if present
            cleanedId = cleanedId.replace(/-I$/, '');

            // Extract POS User and map to gestor info
            const posUserEmail = row['Usuario POS'] || '';
            const gestorInfo = getGestorInfo(posUserEmail);

            // Keep only relevant fields, but keep originalRow for export
            // Robust Date Parsing
            const parseDate = (dateVal) => {
                if (!dateVal) return null;
                // If it's a number (Excel serial date) - though we use raw:false, sometimes it leaks or if changed later
                if (typeof dateVal === 'number') {
                    return new Date(Math.round((dateVal - 25569) * 86400 * 1000));
                }

                // If string
                if (typeof dateVal === 'string') {
                    // Try standard date first
                    let d = new Date(dateVal);
                    if (!isNaN(d.getTime())) return dateVal; // If standard parsing works (e.g. YYYY-MM-DD), keep it.

                    // Try DD/MM/YYYY format which is common in LATAM
                    const parts = dateVal.split('/');
                    if (parts.length === 3) {
                        // Swap to MM/DD/YYYY for JS parsing or YYYY-MM-DD
                        return `${parts[2]}-${parts[1]}-${parts[0]}`;
                    }
                }
                return dateVal;
            };

            return {
                orderId: cleanedId,
                rawId: rawId,
                channel: row['Canal'],
                orderType: row['Tipo de Pedido'],
                paymentType: row['Tipo de pago o descuento'],
                status: row['Estado'],
                customerName: row['Cliente'],
                email: row['Correo electrónico del cliente'],
                phone: row['Celular del cliente'],
                city: row['Ciudad'],
                pharmacy: row['Farmacia'],
                orderDate: parseDate(row['Pedido Generado']),
                // POS User / Gestor Information
                posUser: posUserEmail,
                gestorName: gestorInfo?.gestor || null,
                gestorZone: gestorInfo?.zona || null,
                originalRow: row // Keep for full export
            };
        });
};

// Process RMS Data
// Modified to keep detailed item info for filtering and tooltips
export const processRMSData = (data) => {
    const grouped = {};

    data.forEach((row) => {
        // Exclude "SOMPOPO TGU" store transactions to avoid order number collisions
        const storeName = String(row['NombreTienda'] || '').trim().toUpperCase();
        if (storeName === 'SOMPOPO TGU') return;

        const orderId = String(row['Pedido'] || '');
        if (!orderId) return;

        if (!grouped[orderId]) {
            grouped[orderId] = {
                totalAmount: 0,
                // storage for detailed items
                items: [],
                identity: null
            };
        }

        // Sum Total
        const amount = parseFloat(row['Total']) || 0;
        grouped[orderId].totalAmount += amount;

        // Store Item Details
        grouped[orderId].items.push({
            sku: String(row['Codigo'] || ''),
            description: row['Descripcion'] || '',
            quantity: parseFloat(row['Cantidad']) || 0,
            total: amount
        });

        // Collect Identity (Prefer non-zero)
        if (row['Identidad'] && String(row['Identidad']) !== '0' && !grouped[orderId].identity) {
            grouped[orderId].identity = String(row['Identidad']);
        }
    });

    return grouped;
};

// Join Datasets
export const joinDatasets = (albatrossData, rmsDataMap) => {
    return albatrossData.map((order) => {
        const rmsInfo = rmsDataMap[order.orderId];

        if (rmsInfo) {
            return {
                ...order,
                totalAmount: rmsInfo.totalAmount,
                items: rmsInfo.items,
                identity: rmsInfo.identity || 'No se encontró'
            };
        } else {
            return {
                ...order,
                items: [],
                totalAmount: 0,
                identity: 'No se encontró'
            };
        }
    });
};

// Filter Data
// Support comma-separated SKUs
export const filterData = (data, query) => {
    if (!query) return data;

    // Normalize query: split by comma or space if comma not present? 
    // User said "lista de sku", usually comma separated or new lines. 
    // Let's split by comma, and also handle just spaces if needed, but comma is safer for SKUs.
    const terms = query.split(/[\n,]+/).map(t => t.trim().toLowerCase()).filter(Boolean);

    if (terms.length === 0) return data;

    return data.filter((item) => {
        // Search in Name, Email, Phone, Identity (DNI)
        // The prompt implies "pegar lista de SKUs", so priority is SKU search.
        // But we should retain basic search capabilities.

        const name = item.customerName || item.name ? String(item.customerName || item.name).toLowerCase() : '';
        const email = item.email ? String(item.email).toLowerCase() : '';
        const phone = item.phone ? String(item.phone).toLowerCase() : '';
        const identity = item.identity ? String(item.identity).toLowerCase() : '';

        // SKU check: does this order contain ANY of the terms?
        const hasSku = orderMatchesProducts(item, terms);

        // If the query looks like an exact SKU list (numbers), we might want strict matching?
        // For now "includes" is generous. 

        // Also check basic fields if terms is size 1 (standard search)
        if (terms.length === 1) {
            return hasSku || name.includes(terms[0]) || email.includes(terms[0]) || phone.includes(terms[0]) || identity.includes(terms[0]);
        }

        return hasSku;
    });
};

// Filter data by date (for incremental uploads)
// Returns only orders with orderDate AFTER the specified cutoff date
export const filterDataByDate = (data, cutoffDate) => {
    if (!cutoffDate) return data;

    const cutoffTime = new Date(cutoffDate).getTime();

    const filtered = data.filter(order => {
        const orderDate = new Date(order.orderDate);
        if (isNaN(orderDate)) return false;

        return orderDate.getTime() > cutoffTime;
    });

    console.log(`📊 Filtered data: ${data.length} total → ${filtered.length} after ${cutoffDate.toLocaleDateString('es-HN')}`);

    return filtered;
};

// One row per customer, without expanding products into individual columns.
export const buildFrequencyWorkbook = (customers, activeQuery, options = {}) => {
    const contactableCustomers = getExportableCustomers(customers,
        options.purchaseFilter?.enabled && options.purchaseFilter.scope === 'product'
            ? [activeQuery, options.purchaseFilter.productQuery].filter(Boolean).join(',') : activeQuery);
    const lastGestorByCustomer = options.lastGestorByCustomer
        || buildLastGestorIndex((customers || []).flatMap(customer => customer.orders || []));
    const rows = contactableCustomers.map(customer => ({
        'Cliente': customer.name || 'Sin nombre',
        'Correo electrónico del cliente': customer.email || '',
        'Celular del cliente': customer.phone || '',
        'Identidad': customer.identity || '',
        ...getLastGestorExportColumns(customer, lastGestorByCustomer),
        'Total Gastado': customer.orders.reduce((acc, o) => acc + (parseFloat(o.totalAmount) || 0), 0).toFixed(2),
        ...getPurchaseExportColumns(customer, options.purchaseFilter)
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
    appendReportFilters(workbook, options);
    return workbook;
};

export const exportToExcel = (customers, activeQuery, options = {}) => {
    XLSX.writeFile(buildFrequencyWorkbook(customers, activeQuery, options),
        options.purchaseFilter?.enabled ? 'Reporte_Clientes_Sin_Recompra.xlsx' : 'Reporte_Frecuencia.xlsx');
};
