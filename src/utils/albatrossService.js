import { supabase } from '../config/supabase';
import { getGestorInfo } from '../config/gestores';
import * as XLSX from 'xlsx';

const LOGIN_URL = "https://api.puntof4rm4.com/api/auth/signin_cs";
const ORDERS_URL = "https://api.puntof4rm4.com/api/order/get_filter/?cur_page=1&per_page=5000&sort=-order_code";
const BP_URL_TEMPLATE = "https://api.puntof4rm4.com/api/business_partner/get/?cur_page={page}&per_page=5000&sort=+name&register_type=TODOS";
const RMS_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-x6oan91deeTNI7zSDoxK7OoxkZJtAU13krsHxij8Ujv07f_H9R5YHA7wUwLwXw/pub?output=csv";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Gets the Albatross Bearer Token, either from Supabase cache or login API
 */
export const getAlbatrossToken = async () => {
    try {
        console.log("🔑 [albatrossService] Fetching token from Supabase...");
        const { data, error } = await supabase
            .from('albatross_tokens')
            .select('*')
            .eq('id', 1)
            .single();

        if (data && data.token && data.expires_at && Date.now() < new Date(data.expires_at).getTime()) {
            console.log("🔑 [albatrossService] Valid token retrieved from Supabase cache.");
            return data.token;
        }

        console.log("🔑 [albatrossService] Token missing or expired. Performing auto-login...");
        const loginResponse = await fetch(LOGIN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*'
            },
            body: JSON.stringify({
                userName: "puntofarma.admin",
                password: ".Farma2025++"
            })
        });

        if (!loginResponse.ok) {
            throw new Error(`Login failed with status ${loginResponse.status}`);
        }

        const loginData = await loginResponse.json();
        if (!loginData.token) {
            throw new Error("No token returned in login response.");
        }

        const token = `Bearer ${loginData.token}`;
        const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(); // Expires in 23 hours

        console.log("🔑 [albatrossService] Auto-login successful. Caching token in Supabase...");
        await supabase
            .from('albatross_tokens')
            .upsert({ id: 1, token, expires_at: expiresAt });

        return token;
    } catch (err) {
        console.error("❌ [albatrossService] Error getting token:", err);
        throw err;
    }
};

/**
 * Fetches all orders from Albatross API for a date range
 */
export const fetchAlbatrossOrders = async (token, startDateStr, endDateStr) => {
    try {
        console.log(`📦 [albatrossService] Fetching orders from ${startDateStr} to ${endDateStr}...`);
        const payload = {
            "agroup": "ALL",
            "bussinessPartnerProvider": 1,
            "city": ["907", "801", "318", "502", "501", "301", "101", "601"],
            "codeOffice": 1,
            "codeRoute": [null, 92, 133, 32, 17, 4, 26, 14, 60, 21, 12, 13, 821, 68, 25, 15, 9, 4592, 39, 4663, 135],
            "courier": null,
            "dateini": startDateStr,
            "datefin": endDateStr,
            "department": ["FCO", "COR", "ATL", "CHO", "COM", "COP"],
            "discount_type": "ALL",
            "order_type": "ALL",
            "paymentMethod": "ALL",
            "pickup": "",
            "userType": "ALL"
        };

        const response = await fetch(ORDERS_URL, {
            method: 'POST',
            headers: {
                "Authorization": token,
                "Content-Type": "application/json",
                "Accept": "application/json, text/plain, */*"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Orders fetch failed: ${response.status}`);
        }

        const result = await response.json();
        const rawOrders = result.data || [];
        console.log(`📦 [albatrossService] Fetched ${rawOrders.length} raw orders.`);

        // Filter: status is '8' (Entregado) and not canceled
        const validOrders = rawOrders.filter(row => {
            const statusStr = row.status?.toString().trim();
            const hasCancelNote = !!row.order_cancel_note;
            const storeCanceled = row.order_stores_canceled?.toString() === "1";
            const isCanceled = statusStr === "0" || hasCancelNote || storeCanceled;

            return !isCanceled && statusStr === "8";
        });

        // Deduplicate by order_code
        const dedupedOrders = validOrders.filter((row, idx, self) =>
            idx === self.findIndex((t) => t.order_code === row.order_code)
        );

        console.log(`📦 [albatrossService] Filtered down to ${dedupedOrders.length} unique delivered orders.`);
        return dedupedOrders;
    } catch (err) {
        console.error("❌ [albatrossService] Error fetching orders:", err);
        throw err;
    }
};

/**
 * Fetches all Business Partners paginated (5000 per page) and maps them by bp_id
 */
export const fetchBusinessPartners = async (token, updateCallback) => {
    try {
        console.log("👥 [albatrossService] Starting business partners sync...");
        const bpMap = new Map();
        let page = 1;
        let totalPages = 1;

        do {
            if (updateCallback) {
                updateCallback(`Descargando clientes (Página ${page} de ${totalPages || '...'})...`);
            }
            console.log(`👥 [albatrossService] Fetching business partners page ${page}...`);
            const url = BP_URL_TEMPLATE.replace("{page}", page);
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    "Authorization": token,
                    "Accept": "application/json, text/plain, */*"
                }
            });

            if (!response.ok) {
                throw new Error(`Business partner fetch page ${page} failed: ${response.status}`);
            }

            const resData = await response.json();
            const list = resData.data || [];
            const meta = resData.meta || {};
            totalPages = parseInt(meta.totalPages) || 1;

            list.forEach(bp => {
                if (bp.bp_id) {
                    bpMap.set(Number(bp.bp_id), {
                        email: bp.bp_email?.trim() || null,
                        mobile: bp.bp_mobile?.trim() || bp.bp_phone?.trim() || null,
                        identity: bp.bp_identificationDocument?.trim() || null,
                        name: bp.bp_agent?.trim() || null,
                        city: bp.lt_name?.trim() || null
                    });
                }
            });

            page++;
        } while (page <= totalPages);

        console.log(`👥 [albatrossService] Successfully indexed ${bpMap.size} unique business partners.`);
        return bpMap;
    } catch (err) {
        console.error("❌ [albatrossService] Error fetching business partners:", err);
        throw err;
    }
};

/**
 * Downloads and parses Google Sheet CSV for RMS
 */
export const fetchRmsSheet = async () => {
    try {
        console.log("🧾 [albatrossService] Downloading Google Sheet RMS CSV...");
        const response = await fetch(RMS_SHEET_URL);
        if (!response.ok) {
            throw new Error(`Google Sheet download failed with status ${response.status}`);
        }

        const csvText = await response.text();
        console.log("XLSX parsing Google Sheet CSV...");
        const workbook = XLSX.read(csvText, { type: 'string' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

        console.log(`🧾 [albatrossService] Parsed ${rows.length} rows from Google Sheets.`);
        return rows;
    } catch (err) {
        console.error("❌ [albatrossService] Error downloading Google Sheet:", err);
        throw err;
    }
};

/**
 * Orchester of the automated sync process
 */
export const runAutomaticSync = async ({ startDate, endDate, isIncremental, onProgress }) => {
    try {
        // Step 1: Token
        onProgress({ step: 1, text: "Iniciando sesión en Albatross..." });
        const token = await getAlbatrossToken();

        // Step 2: Fetch Albatross orders
        onProgress({ step: 2, text: "Descargando órdenes desde la API..." });
        const albatrossOrders = await fetchAlbatrossOrders(token, startDate, endDate);

        // Step 3: Fetch Business Partners (Clients catalog)
        onProgress({ step: 3, text: "Sincronizando catálogo de clientes..." });
        const bpMap = await fetchBusinessPartners(token, (text) => {
            onProgress({ step: 3, text });
        });

        // Step 4: Fetch Google Sheet RMS rows
        onProgress({ step: 4, text: "Descargando registros de RMS desde Google Sheets..." });
        const rmsRows = await fetchRmsSheet();

        // Step 5: Fetch existing database customers
        onProgress({ step: 5, text: "Cargando clientes existentes desde la nube..." });
        const { data: existingCustomers, error: selectErr } = await supabase
            .from('customers')
            .select('*');

        if (selectErr) throw selectErr;

        // Build mapping of existing orders in database for January/February 2026 rule
        const existingOrdersMap = new Map(); // orderId -> orderObject
        const existingCustomersMap = new Map(); // customer_id -> customerObject

        existingCustomers.forEach(customer => {
            existingCustomersMap.set(customer.customer_id, customer);
            const orders = customer.orders || [];
            orders.forEach(order => {
                existingOrdersMap.set(String(order.orderId), order);
            });
        });

        console.log(`🔄 [albatrossService] Loaded ${existingCustomers.length} customers and ${existingOrdersMap.size} orders from database.`);

        // Step 6: Process and merge
        onProgress({ step: 5, text: "Procesando y cruzando información..." });

        // Build a grouped RMS order map
        const rmsOrderMap = new Map(); // cleanOrderId -> { amount, items }
        rmsRows.forEach(row => {
            // Find order code column
            const rawOrderId = row['NoPEdido'] || row['NoPedido'] || row['Pedido'] || '';
            const orderId = String(rawOrderId).split('-')[0].replace(/^0+/, '').trim();
            if (!orderId) return;

            // Exclude delivery surcharge code 20000025
            const productCode = String(row['CodProducto'] || row['Codigo'] || '').trim();
            if (productCode === '20000025') return;

            const amount = parseFloat(row['SubTotal'] || row['Total'] || 0) || 0;
            const quantity = parseFloat(row['CantidadComprada'] || row['Cantidad'] || 0) || 0;
            const item = {
                sku: String(row['CodProducto'] || row['Codigo'] || ''),
                description: String(row['NombreProducto'] || row['Descripcion'] || ''),
                quantity,
                total: amount
            };

            if (!rmsOrderMap.has(orderId)) {
                rmsOrderMap.set(orderId, {
                    amount: 0,
                    items: [],
                    channel: row['canal'] || row['Canal'] || 'VENTA NO PRESENCIALES'
                });
            }

            const current = rmsOrderMap.get(orderId);
            current.amount += amount;
            current.items.push(item);
        });

        console.log(`🔄 [albatrossService] Grouped RMS data into ${rmsOrderMap.size} orders.`);

        // Process Albatross orders
        const processedCustomersMap = {}; // key -> customerObject

        albatrossOrders.forEach(row => {
            const rawId = row.order_code || '';
            const orderId = rawId.replace(/^0+/, '').split('-')[0].trim();

            const posUser = row.username?.trim() || '';
            const gestorInfo = getGestorInfo(posUser);

            const bpId = Number(row.bp_id);
            const clientInfo = bpMap.get(bpId);

            // Customer details
            const customerName = clientInfo?.name || row.agent || 'Sin nombre';
            const email = clientInfo?.email || null;
            const phone = clientInfo?.mobile || null;
            const city = clientInfo?.city || row.location_two || 'TEGUCIGALPA D.C.';
            const identity = clientInfo?.identity || row.identification_document || 'No se encontró';

            // Key to group by customer
            const customerKey = email || phone || `unknown_${customerName}`;

            // Parse Date
            const orderDateStr = row.creation_date || ''; // YYYY-MM-DD
            const orderDate = new Date(orderDateStr);

            // Determine if order date is in January or February 2026
            const isJanFeb2026 = !isNaN(orderDate.getTime()) &&
                orderDate.getFullYear() === 2026 &&
                (orderDate.getMonth() === 0 || orderDate.getMonth() === 1);

            let totalAmount = 0;
            let items = [];

            const rmsOrder = rmsOrderMap.get(orderId);

            if (rmsOrder) {
                // If it is in Google Sheet, use those values
                totalAmount = rmsOrder.amount;
                items = rmsOrder.items;
            } else {
                // If NOT in Google Sheet
                if (isJanFeb2026) {
                    // Check if it already exists in Supabase
                    const existingOrder = existingOrdersMap.get(orderId);
                    if (existingOrder && existingOrder.items?.length > 0) {
                        // PRESERVE historical order items and totals
                        totalAmount = existingOrder.totalAmount;
                        items = existingOrder.items;
                        console.log(`🛡️ [albatrossService] Preserving Jan/Feb 2026 order ${orderId} from database.`);
                    } else {
                        // Fallback to Albatross API total
                        totalAmount = parseFloat(row.total) || 0;
                        items = [];
                    }
                } else {
                    // Outside January and February 2026 - Overwrite/Substitute with API values
                    totalAmount = parseFloat(row.total) || 0;
                    items = [];
                }
            }

            const orderObj = {
                orderId,
                rawId,
                orderDate: orderDateStr,
                totalAmount,
                items,
                channel: rmsOrder ? rmsOrder.channel : "VENTA NO PRESENCIALES",
                posUser,
                gestorName: gestorInfo?.gestor || null,
                gestorZone: gestorInfo?.zona || null
            };

            if (!processedCustomersMap[customerKey]) {
                processedCustomersMap[customerKey] = {
                    name: customerName,
                    email,
                    phone,
                    city,
                    identity,
                    orders: []
                };
            }

            processedCustomersMap[customerKey].orders.push(orderObj);
        });

        // Merge with existing database customers
        const finalCustomersToUpsert = [];

        // If doing Carga Completa, we first fetch all historical clients and merge everything.
        // Wait, if it is Incremental, we merge ONLY the processed customers with existing database,
        // and if it is Carga Completa, we clear/rebuild. But wait! The manual flow has:
        // Carga Completa = Clear Supabase first!
        // But wait! If we clear Supabase first during Carga Completa, we would LOSE January and February 2026 manual data!
        // So we must NEVER delete Enero/Febrero 2026 orders even in Carga Completa!
        // Therefore, we should merge the processed customers with existing customers, and keep Enero/Febrero 2026!
        // Let's implement a very smart merge that preserves Enero/Febrero 2026 in all cases.

        const newCustomerKeys = Object.keys(processedCustomersMap);

        // Map existing customers by id
        const mergedCustomersMap = {};
        existingCustomers.forEach(c => {
            mergedCustomersMap[c.customer_id] = {
                name: c.name,
                email: c.email,
                phone: c.phone,
                city: c.city,
                identity: c.identity,
                orders: c.orders || []
            };
        });

        newCustomerKeys.forEach(key => {
            const newCustomer = processedCustomersMap[key];
            const customerId = newCustomer.email
                ? newCustomer.email.replace(/[^a-zA-Z0-9]/g, '_')
                : newCustomer.phone
                    ? newCustomer.phone.replace(/[^a-zA-Z0-9]/g, '_')
                    : `customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            if (mergedCustomersMap[customerId]) {
                const existingCustomer = mergedCustomersMap[customerId];
                const ordersMap = new Map();

                // Load existing orders
                existingCustomer.orders.forEach(o => {
                    ordersMap.set(String(o.orderId), o);
                });

                // Merge new orders
                newCustomer.orders.forEach(o => {
                    const orderDate = new Date(o.orderDate);
                    const isJanFeb26 = !isNaN(orderDate.getTime()) &&
                        orderDate.getFullYear() === 2026 &&
                        (orderDate.getMonth() === 0 || orderDate.getMonth() === 1);

                    if (ordersMap.has(String(o.orderId))) {
                        // If it's Jan/Feb 26, keep existing one if it has items
                        if (isJanFeb26) {
                            const existing = ordersMap.get(String(o.orderId));
                            if (existing.items && existing.items.length > 0) {
                                return; // Don't overwrite
                            }
                        }
                    }
                    ordersMap.set(String(o.orderId), o);
                });

                mergedCustomersMap[customerId].orders = Array.from(ordersMap.values());
                // Update basic fields if they are richer
                if (newCustomer.name) mergedCustomersMap[customerId].name = newCustomer.name;
                if (newCustomer.email) mergedCustomersMap[customerId].email = newCustomer.email;
                if (newCustomer.phone) mergedCustomersMap[customerId].phone = newCustomer.phone;
                if (newCustomer.city) mergedCustomersMap[customerId].city = newCustomer.city;
                if (newCustomer.identity && newCustomer.identity !== 'No se encontró') mergedCustomersMap[customerId].identity = newCustomer.identity;

            } else {
                mergedCustomersMap[customerId] = {
                    name: newCustomer.name,
                    email: newCustomer.email,
                    phone: newCustomer.phone,
                    city: newCustomer.city,
                    identity: newCustomer.identity,
                    orders: newCustomer.orders
                };
            }
        });

        // Convert merged map to list for database write
        const customersToUpsertList = Object.entries(mergedCustomersMap).map(([id, customer]) => ({
            customer_id: id,
            name: customer.name || 'Sin nombre',
            email: customer.email || null,
            phone: customer.phone || null,
            city: customer.city || null,
            identity: customer.identity || null,
            orders: customer.orders || []
        }));

        // Step 7: Batch Upsert to Supabase
        onProgress({ step: 6, text: "Guardando datos en Supabase..." });
        console.log(`💾 [albatrossService] Upserting ${customersToUpsertList.length} customer records to Supabase...`);

        let totalSaved = 0;
        const BATCH_SIZE = 100;

        for (let i = 0; i < customersToUpsertList.length; i += BATCH_SIZE) {
            const chunk = customersToUpsertList.slice(i, i + BATCH_SIZE);

            const { error: upsertError } = await supabase
                .from('customers')
                .upsert(chunk, {
                    onConflict: 'customer_id',
                    ignoreDuplicates: false
                });

            if (upsertError) throw upsertError;

            totalSaved += chunk.length;
            console.log(`💾 [albatrossService] Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}. Saved ${totalSaved}/${customersToUpsertList.length} customers.`);
            
            if (i + BATCH_SIZE < customersToUpsertList.length) {
                await delay(100);
            }
        }

        onProgress({ step: 7, text: "¡Sincronización completada con éxito!" });
        console.log("🎉 [albatrossService] Sync finished successfully.");
        return {
            success: true,
            count: customersToUpsertList.length,
            timestamp: new Date()
        };
    } catch (err) {
        console.error("❌ [albatrossService] Run Automatic Sync failed:", err);
        throw err;
    }
};
