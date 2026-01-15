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
                channel: order.channel
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
 * Load all customers from Supabase
 */
export const loadCustomersFromSupabase = async () => {
    try {
        // Fetch all customers
        const { data: customers, error } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

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
                        channel: order.channel
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

// Export with Firebase-compatible aliases
export const saveCustomersToFirestore = saveCustomersToSupabase;
export const loadCustomersFromFirestore = loadCustomersFromSupabase;
