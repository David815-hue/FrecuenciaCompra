import { pb } from '../config/pocketbase';

const COLLECTION_NAME = 'customers';

/**
 * Utility: Add delay between batches to prevent overload
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Save customers to PocketBase (optimized for large datasets)
 * Groups orders by customer to reduce data size
 */
export const saveCustomersToPocketBase = async (orders) => {
    try {
        console.log(`Starting PocketBase save for ${orders.length} orders...`);

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

        // Step 2: Save customers one by one (PocketBase handles this efficiently)
        let totalSaved = 0;
        const BATCH_SIZE = 50; // Process in batches for progress updates

        for (let i = 0; i < customers.length; i += BATCH_SIZE) {
            const chunk = customers.slice(i, i + BATCH_SIZE);

            // Save each customer in the batch
            await Promise.all(chunk.map(async (customer) => {
                const customerId = customer.email
                    ? customer.email.replace(/[^a-zA-Z0-9]/g, '_')
                    : customer.phone
                        ? customer.phone.replace(/[^a-zA-Z0-9]/g, '_')
                        : `customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                const customerData = {
                    customerId: customerId,
                    name: customer.name || 'Sin nombre',
                    email: customer.email || '',
                    phone: customer.phone || '',
                    city: customer.city || '',
                    identity: customer.identity || '',
                    orders: JSON.stringify(customer.orders || []) // Store as JSON string
                };

                try {
                    // Try to update first, if not exists, create
                    const existing = await pb.collection(COLLECTION_NAME).getFirstListItem(`customerId="${customerId}"`, { $autoCancel: false }).catch(() => null);

                    if (existing) {
                        await pb.collection(COLLECTION_NAME).update(existing.id, customerData, { $autoCancel: false });
                    } else {
                        await pb.collection(COLLECTION_NAME).create(customerData, { $autoCancel: false });
                    }
                } catch (error) {
                    console.error(`Error saving customer ${customerId}:`, error);
                }
            }));

            totalSaved += chunk.length;
            console.log(`✅ Saved ${totalSaved}/${customers.length} customers`);

            // Small delay between batches
            if (i + BATCH_SIZE < customers.length) {
                await delay(100);
            }
        }

        console.log(`🎉 Successfully saved ${totalSaved} customers to PocketBase`);

        return {
            success: true,
            count: totalSaved,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('❌ Error saving to PocketBase:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Load all customers from PocketBase
 */
export const loadCustomersFromPocketBase = async () => {
    try {
        // Fetch all customers (PocketBase handles pagination automatically with getFullList)
        const records = await pb.collection(COLLECTION_NAME).getFullList({
            sort: '-created',
            $autoCancel: false
        });

        const orders = [];
        records.forEach((customer) => {
            // Parse orders from JSON string
            const customerOrders = JSON.parse(customer.orders || '[]');

            // Transform back: each customer.orders[] -> individual order records
            if (customerOrders && customerOrders.length > 0) {
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

        console.log(`✅ Loaded ${orders.length} orders from ${records.length} customers`);

        return {
            success: true,
            customers: orders, // Return as "customers" but it's actually orders (for compatibility)
            count: orders.length,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('Error loading from PocketBase:', error);
        return {
            success: false,
            error: error.message,
            customers: []
        };
    }
};

/**
 * Clear all customer data from PocketBase
 */
export const clearAllData = async () => {
    try {
        // Get all records
        const records = await pb.collection(COLLECTION_NAME).getFullList({ $autoCancel: false });

        let deletedCount = 0;

        // Delete in batches
        const BATCH_SIZE = 50;
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
            const chunk = records.slice(i, i + BATCH_SIZE);

            await Promise.all(chunk.map(async (record) => {
                await pb.collection(COLLECTION_NAME).delete(record.id, { $autoCancel: false });
            }));

            deletedCount += chunk.length;
            console.log(`🗑️ Deleted ${deletedCount}/${records.length} customers`);

            if (i + BATCH_SIZE < records.length) {
                await delay(100);
            }
        }

        console.log(`✅ Total deleted: ${deletedCount} customers`);

        return {
            success: true,
            deletedCount: deletedCount
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
        const existing = await pb.collection(COLLECTION_NAME).getFirstListItem(`customerId="${customerId}"`, { $autoCancel: false });

        await pb.collection(COLLECTION_NAME).update(existing.id, data, { $autoCancel: false });

        return { success: true };
    } catch (error) {
        console.error('Error updating customer:', error);
        return {
            success: false,
            error: error.message
        };
    }
};
