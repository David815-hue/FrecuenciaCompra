import {
    collection,
    getDocs,
    setDoc,
    doc,
    deleteDoc,
    writeBatch,
    serverTimestamp,
    query,
    orderBy
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COLLECTION_NAME = 'customers';

/**
 * Save customers to Firestore (optimized for large datasets)
 * Groups orders by customer to reduce data size
 * Uses batch writes with size limits
 */
export const saveCustomersToFirestore = async (orders) => {
    try {
        console.log(`Starting Firestore save for ${orders.length} orders...`);

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

        // Helper: Remove undefined values (Firestore doesn't allow them)
        const sanitize = (obj) => {
            const clean = {};
            Object.keys(obj).forEach(key => {
                const value = obj[key];
                if (value !== undefined && value !== null) {
                    if (Array.isArray(value)) {
                        clean[key] = value;
                    } else if (typeof value === 'object') {
                        clean[key] = sanitize(value);
                    } else {
                        clean[key] = value;
                    }
                }
            });
            return clean;
        };

        // Step 2: Save in small batches (to avoid 10MB limit)
        const BATCH_SIZE = 100; // Conservative size
        let totalSaved = 0;

        for (let i = 0; i < customers.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = customers.slice(i, i + BATCH_SIZE);

            chunk.forEach((customer) => {
                const docId = customer.email
                    ? customer.email.replace(/[^a-zA-Z0-9]/g, '_')
                    : customer.phone
                        ? customer.phone.replace(/[^a-zA-Z0-9]/g, '_')
                        : `customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                const docRef = doc(db, COLLECTION_NAME, docId);

                // Sanitize data before saving
                const cleanCustomer = sanitize({
                    name: customer.name || 'Sin nombre',
                    email: customer.email || '',
                    phone: customer.phone || '',
                    city: customer.city || '',
                    identity: customer.identity || '',
                    orders: customer.orders || [],
                    lastUpdated: serverTimestamp()
                });

                batch.set(docRef, cleanCustomer);
            });

            await batch.commit();
            totalSaved += chunk.length;
            console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: Saved ${totalSaved}/${customers.length} customers`);
        }

        console.log(`🎉 Successfully saved ${totalSaved} customers to Firestore`);

        return {
            success: true,
            count: totalSaved,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('❌ Error saving to Firestore:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Load all customers from Firestore
 * Transforms grouped customer data back to flat order list
 */
export const loadCustomersFromFirestore = async () => {
    try {
        const q = query(collection(db, COLLECTION_NAME), orderBy('lastUpdated', 'desc'));
        const querySnapshot = await getDocs(q);

        const orders = [];
        querySnapshot.forEach((doc) => {
            const customer = doc.data();

            // Transform back: each customer.orders[] -> individual order records
            if (customer.orders && customer.orders.length > 0) {
                customer.orders.forEach(order => {
                    orders.push({
                        // Customer info (with fallbacks to prevent undefined)
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

        console.log(`✅ Loaded ${orders.length} orders from ${querySnapshot.size} customers`);

        return {
            success: true,
            customers: orders, // Return as "customers" but it's actually orders (for compatibility)
            count: orders.length,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('Error loading from Firestore:', error);
        return {
            success: false,
            error: error.message,
            customers: []
        };
    }
};

/**
 * Clear all customer data from Firestore
 * Use with caution!
 */
export const clearAllData = async () => {
    try {
        const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
        const batch = writeBatch(db);

        querySnapshot.forEach((document) => {
            batch.delete(document.ref);
        });

        await batch.commit();

        return {
            success: true,
            deletedCount: querySnapshot.size
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
        const docRef = doc(db, COLLECTION_NAME, customerId);
        await setDoc(docRef, {
            ...data,
            lastUpdated: serverTimestamp()
        }, { merge: true });

        return { success: true };
    } catch (error) {
        console.error('Error updating customer:', error);
        return {
            success: false,
            error: error.message
        };
    }
};
