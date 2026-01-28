import * as XLSX from 'xlsx';
import { getGestorInfo } from '../config/gestores';

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
        const hasSku = item.items && item.items.some(prod =>
            terms.some(term => prod.sku.toLowerCase().includes(term))
        );

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

// Export to Excel with Monthly SKU Breakdown
export const exportToExcel = (customers, activeQuery) => {
    // Parse active query to get filtered SKUs
    const terms = activeQuery ? activeQuery.split(/[\n,]+/).map(t => t.trim().toLowerCase()).filter(Boolean) : [];

    // Step 1: Calculate global date range and identify all unique SKUs in filter
    let minTime = Infinity;
    let maxTime = -Infinity;
    const skuSet = new Set();

    customers.forEach(customer => {
        customer.orders.forEach(order => {
            const d = new Date(order.orderDate);
            if (!isNaN(d)) {
                const t = d.getTime();
                if (t < minTime) minTime = t;
                if (t > maxTime) maxTime = t;
            }

            // Collect SKUs that match the filter
            if (terms.length > 0 && order.items) {
                order.items.forEach(item => {
                    if (terms.some(term => item.sku.toLowerCase().includes(term))) {
                        skuSet.add(item.sku);
                    }
                });
            }
        });
    });

    // If no date range found, use current month
    if (minTime === Infinity) {
        const now = new Date();
        minTime = now.getTime();
        maxTime = now.getTime();
    }

    // Step 2: Generate list of months
    const months = [];
    const minDate = new Date(minTime);
    minDate.setDate(1); // Start of month
    const maxDate = new Date(maxTime);
    maxDate.setDate(1);

    let current = new Date(minDate);
    while (current <= maxDate) {
        months.push({
            key: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
            label: `${current.toLocaleDateString('es-HN', { month: 'short' })} ${String(current.getFullYear()).slice(2)}`
        });
        current.setMonth(current.getMonth() + 1);
    }

    const skus = Array.from(skuSet);

    // Step 3: Build rows
    const rows = [];

    customers.forEach(customer => {
        // Aggregate sales by month-SKU for this customer
        const salesMap = {}; // { "2025-07-SKU123": 5, "2025-08-SKU456": 3 }

        customer.orders.forEach(order => {
            const orderDate = new Date(order.orderDate);
            if (isNaN(orderDate)) return;

            const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;

            if (order.items) {
                order.items.forEach(item => {
                    // Only count items that match the filter
                    if (terms.length === 0 || terms.some(term => item.sku.toLowerCase().includes(term))) {
                        const key = `${monthKey}-${item.sku}`;
                        salesMap[key] = (salesMap[key] || 0) + (item.quantity || 0);
                    }
                });
            }
        });

        // Build row object
        const row = {
            'Cliente': customer.name || 'Sin nombre',
            'Correo electrónico del cliente': customer.email || '',
            'Celular del cliente': customer.phone || '',
            'Identidad': customer.identity || '',
            'Total Gastado': customer.orders.reduce((acc, o) => acc + (parseFloat(o.totalAmount) || 0), 0).toFixed(2)
        };

        // Add dynamic columns for each month-SKU combination
        months.forEach(month => {
            skus.forEach(sku => {
                const key = `${month.key}-${sku}`;
                const columnName = `${month.label} - ${sku}`;
                row[columnName] = salesMap[key] || 0;
            });
        });

        rows.push(row);
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
    XLSX.writeFile(workbook, "Reporte_Frecuencia_SKU.xlsx");
};
