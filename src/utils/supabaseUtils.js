import { supabase } from '../config/supabase';

const TABLE_NAME = 'customers';

/**
 * Utility: Add delay between batches
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Save customers to Supabase (optimized for large datasets)
 */
export const saveCustomersToSupabase = async (orders) => {
    try {
        console.log(`Starting Supabase save for ${orders.length} orders...`);

        // Step 1: Group orders by customer
        const customerMap = {};
        orders.forEach(order => {
            const key = order.email || order.phone || `unknown_${order.customerName || order.name}`;

            if (!customerMap[key]) {
                customerMap[key] = {
                    name: order.customerName || order.name,
                    email: order.email,
                    phone: order.phone,
                    city: order.city,
                    identity: order.identity,
                    orders: []
                };
            }

            customerMap[key].orders.push({
                orderId: order.orderId,
                rawId: order.rawId,
                orderDate: order.orderDate,
                totalAmount: order.totalAmount,
                items: order.items || [],
                channel: order.channel,
                // Gestor information
                posUser: order.posUser || '',
                gestorName: order.gestorName || null,
                gestorZone: order.gestorZone || null
            });
        });

        const customers = Object.values(customerMap);
        console.log(`Grouped into ${customers.length} unique customers`);

        // Step 2: Save customers in batches
        let totalSaved = 0;
        const BATCH_SIZE = 100; // Supabase can handle larger batches

        for (let i = 0; i < customers.length; i += BATCH_SIZE) {
            const chunk = customers.slice(i, i + BATCH_SIZE);

            // Prepare data for upsert
            const customerData = chunk.map(customer => {
                const customerId = customer.email
                    ? customer.email.replace(/[^a-zA-Z0-9]/g, '_')
                    : customer.phone
                        ? customer.phone.replace(/[^a-zA-Z0-9]/g, '_')
                        : `customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                return {
                    customer_id: customerId,
                    name: customer.name || 'Sin nombre',
                    email: customer.email || null,
                    phone: customer.phone || null,
                    city: customer.city || null,
                    identity: customer.identity || null,
                    orders: customer.orders || [] // JSONB field in Supabase
                };
            });

            // Upsert (insert or update if exists)
            const { data, error } = await supabase
                .from(TABLE_NAME)
                .upsert(customerData, {
                    onConflict: 'customer_id',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error(`Error in batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
                throw error;
            }

            totalSaved += chunk.length;
            console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: Saved ${totalSaved}/${customers.length} customers`);

            // Small delay between batches
            if (i + BATCH_SIZE < customers.length) {
                await delay(100);
            }
        }

        console.log(`🎉 Successfully saved ${totalSaved} customers to Supabase`);

        return {
            success: true,
            count: totalSaved,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('❌ Error saving to Supabase:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Helper to fetch all customers from Supabase, paginating to bypass the max rows limit (e.g. 8999).
 */
export const fetchAllCustomers = async (columns = '*') => {
    let allData = [];
    let from = 0;
    const pageSize = 5000;
    let hasMore = true;

    while (hasMore) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select(columns)
            .range(from, to)
            .order('created_at', { ascending: false });

        if (error) throw error;

        allData = allData.concat(data || []);

        if (!data || data.length < pageSize) {
            hasMore = false;
        } else {
            from += pageSize;
        }
    }

    return allData;
};

/**
 * Load all customers from Supabase
 */
export const loadCustomersFromSupabase = async () => {
    try {
        // Fetch all customers using the paginated helper
        const customers = await fetchAllCustomers('*');

        // Transform to orders format
        const orders = [];
        customers.forEach((customer) => {
            const customerOrders = customer.orders || [];

            if (customerOrders.length > 0) {
                customerOrders.forEach(order => {
                    orders.push({
                        // Customer info
                        name: customer.name || 'Sin nombre',
                        email: customer.email || '',
                        phone: customer.phone || '',
                        city: customer.city || '',
                        identity: customer.identity || 'No se encontró',

                        // Order info
                        orderId: order.orderId,
                        rawId: order.rawId,
                        orderDate: order.orderDate,
                        totalAmount: order.totalAmount,
                        items: order.items || [],
                        channel: order.channel,
                        // Gestor information
                        posUser: order.posUser || '',
                        gestorName: order.gestorName || null,
                        gestorZone: order.gestorZone || null
                    });
                });
            }
        });

        console.log(`✅ Loaded ${orders.length} orders from ${customers.length} customers`);

        return {
            success: true,
            customers: orders,
            count: orders.length,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('Error loading from Supabase:', error);
        return {
            success: false,
            error: error.message,
            customers: []
        };
    }
};

/**
 * Clear all customer data from Supabase
 */
export const clearAllData = async () => {
    try {
        // Delete all records
        const { error } = await supabase
            .from(TABLE_NAME)
            .delete()
            .neq('customer_id', ''); // Delete all (workaround for "delete all")

        if (error) throw error;

        console.log(`✅ All data cleared from Supabase`);

        return {
            success: true,
            deletedCount: 'all'
        };
    } catch (error) {
        console.error('Error clearing data:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Update a single customer
 */
export const updateCustomer = async (customerId, data) => {
    try {
        const { error } = await supabase
            .from(TABLE_NAME)
            .update(data)
            .eq('customer_id', customerId);

        if (error) throw error;

        return { success: true };
    } catch (error) {
        console.error('Error updating customer:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Safely parses database date strings (like "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss")
 * into local Date objects, avoiding any timezone shift issues.
 */
export const parseDatabaseDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;

    const str = String(dateStr).trim();
    const justDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (justDateRegex.test(str)) {
        const [year, month, day] = str.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    const normalized = str.replace(' ', 'T');
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) {
        return d;
    }
    const fallback = new Date(str);
    if (!isNaN(fallback.getTime())) {
        return fallback;
    }
    return null;
};

export const formatLatestOrderDate = (date) => {
    if (!date) return '';
    const rawStr = date.rawStr || '';
    const hasTime = rawStr ? rawStr.includes(':') : (date.getHours() !== 0 || date.getMinutes() !== 0);
    const datePart = date.toLocaleDateString('es-HN', { year: 'numeric', month: 'short', day: 'numeric' });
    if (!hasTime) return `${datePart} 11:59 p. m.`;

    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'p. m.' : 'a. m.';
    hours = hours % 12 || 12;
    return `${datePart} ${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

/**
 * Get the latest order date from Supabase
 */
export const getLatestOrderDate = async () => {
    try {
        // Fetch only customers' orders column, using paginated helper
        const customers = await fetchAllCustomers('orders');

        let latestDate = null;
        let latestDateRaw = null;

        customers.forEach(customer => {
            const customerOrders = customer.orders || [];
            customerOrders.forEach(order => {
                // Get latest date from any order synced (Albatross orders)
                if (order.orderDate) {
                    const parsed = parseDatabaseDate(order.orderDate);
                    if (parsed && !isNaN(parsed.getTime())) {
                        if (!latestDate || parsed > latestDate) {
                            latestDate = parsed;
                            latestDateRaw = order.orderDate;
                        }
                    }
                }
            });
        });

        console.log(`📅 Latest Albatross order date in Supabase: ${latestDateRaw || 'No data'}`);
        if (latestDate && latestDateRaw) {
            latestDate.rawStr = latestDateRaw;
        }
        return latestDate;
    } catch (error) {
        console.error('Error getting latest order date:', error);
        return null;
    }
};

/**
 * Save customers to Supabase in INCREMENTAL mode
 * This fetches existing customers, merges orders, and updates/inserts
 */
export const saveCustomersToSupabaseIncremental = async (orders) => {
    try {
        console.log(`Starting INCREMENTAL Supabase save for ${orders.length} orders...`);

        // Step 1: Fetch all existing customers and build a map
        // Note: For very large datasets, this might be heavy. 
        // A more scalable approach would be to query only relevant customers, 
        // but since we're processing a file that could contain anyone, fetching all is often simplest for now.
        const existingData = await fetchAllCustomers('*');

        const existingCustomersMap = {};
        existingData.forEach(customer => {
            // customer_id is the unique key in Supabase
            existingCustomersMap[customer.customer_id] = customer;

            // Also map by email/phone/name keys to match incoming data logic
            const legacyKey = customer.email || customer.phone || `unknown_${customer.name}`;
            if (!existingCustomersMap[legacyKey]) {
                existingCustomersMap[legacyKey] = customer;
            }
        });

        console.log(`Found ${existingData.length} existing customers in Supabase`);

        // Step 2: Group new orders by customer
        const customerMap = {};
        orders.forEach(order => {
            const key = order.email || order.phone || `unknown_${order.customerName || order.name}`;

            if (!customerMap[key]) {
                customerMap[key] = {
                    name: order.customerName || order.name,
                    email: order.email,
                    phone: order.phone,
                    city: order.city,
                    identity: order.identity,
                    orders: []
                };
            }

            customerMap[key].orders.push({
                orderId: order.orderId,
                rawId: order.rawId,
                orderDate: order.orderDate,
                totalAmount: order.totalAmount,
                items: order.items || [],
                channel: order.channel,
                // Gestor information
                posUser: order.posUser || '',
                gestorName: order.gestorName || null,
                gestorZone: order.gestorZone || null
            });
        });

        // Step 3: Merge and Prepare for Upsert
        const customersToUpsert = [];
        const newCustomerKeys = Object.keys(customerMap);

        // Sanitize helper similar to firestoreUtils
        const sanitize = (obj) => {
            const clean = {};
            Object.keys(obj).forEach(key => {
                if (obj[key] !== undefined) clean[key] = obj[key];
            });
            return clean;
        };

        newCustomerKeys.forEach(key => {
            const newCustomer = customerMap[key];

            // Determine ID
            const customerId = newCustomer.email
                ? newCustomer.email.replace(/[^a-zA-Z0-9]/g, '_')
                : newCustomer.phone
                    ? newCustomer.phone.replace(/[^a-zA-Z0-9]/g, '_')
                    : `customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            let mergedOrders = [];

            // Check if exists by ID or key
            const existingCustomer = existingCustomersMap[customerId] || existingCustomersMap[key];

            if (existingCustomer) {
                // Merge logic
                const existingOrdersMap = {};
                (existingCustomer.orders || []).forEach(order => {
                    existingOrdersMap[order.orderId] = order;
                });

                newCustomer.orders.forEach(order => {
                    // Check if we are overwriting an existing order
                    if (existingOrdersMap[order.orderId]) {
                        console.log(`⚠️ Overwriting duplicate order! Customer: ${newCustomer.name || newCustomer.email || newCustomer.phone}`);
                        console.log(`   - Order ID: ${order.orderId}`);
                        console.log(`   - Old Date: ${existingOrdersMap[order.orderId].orderDate} | Old Total: ${existingOrdersMap[order.orderId].totalAmount}`);
                        console.log(`   - New Date: ${order.orderDate} | New Total: ${order.totalAmount}`);
                    }
                    existingOrdersMap[order.orderId] = order;
                });

                mergedOrders = Object.values(existingOrdersMap);
            } else {
                mergedOrders = newCustomer.orders;
            }

            customersToUpsert.push({
                customer_id: customerId, // Important: keep ID consistent
                name: newCustomer.name || 'Sin nombre',
                email: newCustomer.email || null,
                phone: newCustomer.phone || null,
                city: newCustomer.city || null,
                identity: newCustomer.identity || null,
                orders: mergedOrders
            });
        });

        // Step 4: Batch Upsert
        let totalSaved = 0;
        const BATCH_SIZE = 100;

        for (let i = 0; i < customersToUpsert.length; i += BATCH_SIZE) {
            const chunk = customersToUpsert.slice(i, i + BATCH_SIZE);

            const { error: upsertError } = await supabase
                .from(TABLE_NAME)
                .upsert(chunk, {
                    onConflict: 'customer_id',
                    ignoreDuplicates: false
                });

            if (upsertError) throw upsertError;

            totalSaved += chunk.length;
            console.log(`✅ Incremental Batch ${Math.floor(i / BATCH_SIZE) + 1}: Saved ${chunk.length} customers`);

            if (i + BATCH_SIZE < customersToUpsert.length) await delay(100);
        }

        console.log(`🎉 Successfully synced ${totalSaved} customers to Supabase (Incremental)`);

        return {
            success: true,
            count: totalSaved,
            timestamp: new Date()
        };

    } catch (error) {
        console.error('❌ Error in incremental Supabase save:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Export with Firebase-compatible aliases
export const saveCustomersToFirestore = saveCustomersToSupabase;
export const saveCustomersToFirestoreIncremental = saveCustomersToSupabaseIncremental;
export const loadCustomersFromFirestore = loadCustomersFromSupabase;
