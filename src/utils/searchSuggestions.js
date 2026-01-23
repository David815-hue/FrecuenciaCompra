/**
 * Get search suggestions based on query
 * Returns SKUs, Customers, and Identities that match the query
 */
export const getSuggestions = (data, query) => {
    if (!query || query.length < 2) return null;

    const normalizedQuery = query.toLowerCase().trim();

    const skuMatches = new Map(); // Map to avoid duplicates
    const customerMatches = new Map();
    const identityMatches = new Map();

    // Search through all orders
    data.forEach(order => {
        // Search in SKUs
        if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
                const sku = item.sku || '';
                const description = item.description || '';

                if (sku.toLowerCase().includes(normalizedQuery) ||
                    description.toLowerCase().includes(normalizedQuery)) {

                    if (!skuMatches.has(sku)) {
                        skuMatches.set(sku, {
                            sku: sku,
                            description: description,
                            count: 1
                        });
                    } else {
                        skuMatches.get(sku).count++;
                    }
                }
            });
        }

        // Search in Customer Names
        const customerName = order.name || order.customerName || '';
        if (customerName.toLowerCase().includes(normalizedQuery)) {
            const key = customerName.toLowerCase();
            if (!customerMatches.has(key)) {
                customerMatches.set(key, {
                    name: customerName,
                    email: order.email || '',
                    phone: order.phone || '',
                    identity: order.identity || ''
                });
            }
        }

        // Search in Identities
        const identity = order.identity || '';
        if (identity !== 'No se encontró' &&
            identity.toLowerCase().includes(normalizedQuery)) {

            const key = identity.toLowerCase();
            if (!identityMatches.has(key)) {
                identityMatches.set(key, {
                    identity: identity,
                    name: customerName,
                    phone: order.phone || ''
                });
            }
        }

        // Search in Email
        const email = order.email || '';
        if (email.toLowerCase().includes(normalizedQuery)) {
            const key = (order.name || order.customerName || '').toLowerCase();
            if (!customerMatches.has(key)) {
                customerMatches.set(key, {
                    name: order.name || order.customerName || 'Sin nombre',
                    email: email,
                    phone: order.phone || '',
                    identity: order.identity || ''
                });
            }
        }

        // Search in Phone
        const phone = order.phone || '';
        if (phone.toLowerCase().includes(normalizedQuery)) {
            const key = (order.name || order.customerName || '').toLowerCase();
            if (!customerMatches.has(key)) {
                customerMatches.set(key, {
                    name: order.name || order.customerName || 'Sin nombre',
                    email: order.email || '',
                    phone: phone,
                    identity: order.identity || ''
                });
            }
        }
    });

    // Convert to arrays and limit results
    const MAX_RESULTS = 10;

    const skus = Array.from(skuMatches.values())
        .sort((a, b) => b.count - a.count) // Sort by count (most popular first)
        .slice(0, MAX_RESULTS);

    const customers = Array.from(customerMatches.values())
        .slice(0, MAX_RESULTS);

    const identities = Array.from(identityMatches.values())
        .slice(0, MAX_RESULTS);

    // Return null if no matches found
    if (skus.length === 0 && customers.length === 0 && identities.length === 0) {
        return null;
    }

    return {
        skus,
        customers,
        identities,
        totalResults: skus.length + customers.length + identities.length
    };
};
