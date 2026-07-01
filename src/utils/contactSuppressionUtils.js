import { supabase } from '../config/supabase';

const STORE_TABLE = 'dashboard_store';
const KEY_PREFIX = 'contact_suppression_';
const OPEN_ASSIGNMENT_STATUSES = ['pending', 'no_answer', 'callback'];

export const normalizePhone = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length > 8 && digits.startsWith('504')) return digits.slice(-8);
    return digits;
};

const normalizeSku = (sku) => String(sku || '').trim().toUpperCase();
const getStoreKey = (phone, sku = '') => {
    const skuKey = normalizeSku(sku).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    return `${KEY_PREFIX}${normalizePhone(phone)}${skuKey ? `_${skuKey}` : ''}`;
};

const actorSnapshot = (actor = {}) => ({
    uid: actor.uid || actor.id || '',
    name: actor.displayName || actor.username || actor.email || 'Usuario',
    role: actor.role || ''
});

export const getContactSuppressions = async ({ includeInactive = false } = {}) => {
    const { data, error } = await supabase
        .from(STORE_TABLE)
        .select('key, data, updated_at')
        .gte('key', KEY_PREFIX)
        .lt('key', `${KEY_PREFIX}\uffff`)
        .order('updated_at', { ascending: false });

    if (error) throw error;

    const records = (data || []).map(row => ({
        ...row.data,
        storeKey: row.key,
        updatedAt: row.updated_at || row.data?.updatedAt
    }));

    return includeInactive ? records : records.filter(record => record.active !== false);
};

export const buildSuppressionIndex = (suppressions = []) => {
    const index = new Map();
    suppressions.filter(record => record.active !== false).forEach(record => {
        const phone = normalizePhone(record.normalizedPhone || record.phone);
        if (!phone) return;
        if (!index.has(phone)) index.set(phone, { global: false, skus: new Set() });
        const entry = index.get(phone);
        const sku = normalizeSku(record.sku);
        if (sku) entry.skus.add(sku);
        else entry.global = true;
    });
    return index;
};

export const isContactSuppressed = (customer, suppressions = [], targetSkus = []) => {
    const normalized = normalizePhone(customer?.phone || customer?.client_phone);
    if (!normalized) return false;
    const index = suppressions instanceof Map ? suppressions : buildSuppressionIndex(suppressions);
    const entry = index.get(normalized);
    if (!entry) return false;
    if (entry.global) return true;
    const normalizedTargets = targetSkus.map(normalizeSku).filter(Boolean);
    return normalizedTargets.some(sku => entry.skus.has(sku));
};

export const filterContactableCustomers = (customers = [], suppressions = [], targetSkus = []) => {
    const suppressionIndex = suppressions instanceof Map ? suppressions : buildSuppressionIndex(suppressions);
    return customers.filter(customer => !isContactSuppressed(customer, suppressionIndex, targetSkus));
};

export const decorateWithSuppressionStatus = (records = [], suppressions = []) => {
    const suppressionIndex = suppressions instanceof Map ? suppressions : buildSuppressionIndex(suppressions);
    return records.map(record => {
        const entry = suppressionIndex.get(normalizePhone(record.phone || record.client_phone));
        return {
            ...record,
            isContactSuppressed: entry?.global === true,
            contactSuppressedSkus: entry ? Array.from(entry.skus) : []
        };
    });
};

const closeOpenAssignments = async (normalizedPhone, sku) => {
    const { data, error } = await supabase
        .from('campaign_assignments')
        .select('id, client_phone, status, campaigns:campaign_id(source_meta)')
        .in('status', OPEN_ASSIGNMENT_STATUSES);

    if (error) throw error;

    const ids = (data || [])
        .filter(assignment => {
            if (normalizePhone(assignment.client_phone) !== normalizedPhone) return false;
            const campaignSkus = (assignment.campaigns?.source_meta?.selectedProducts || []).map(product => normalizeSku(product.sku));
            return campaignSkus.includes(normalizeSku(sku));
        })
        .map(assignment => assignment.id);

    for (let index = 0; index < ids.length; index += 100) {
        const chunk = ids.slice(index, index + 100);
        const { error: updateError } = await supabase
            .from('campaign_assignments')
            .update({
                status: 'do_not_contact',
                last_updated: new Date().toISOString()
            })
            .in('id', chunk);
        if (updateError) throw updateError;
    }

    return ids.length;
};

export const suppressContact = async ({ phone, customerName = '', sku, productName = '', actor }) => {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length < 8) throw new Error('Ingresa un número de teléfono válido.');
    const normalizedSku = normalizeSku(sku);
    if (!normalizedSku) throw new Error('Selecciona el SKU que no deseas contactar.');

    const key = getStoreKey(normalizedPhone, normalizedSku);
    const now = new Date().toISOString();
    const user = actorSnapshot(actor);
    const { data: existingRows, error: readError } = await supabase
        .from(STORE_TABLE)
        .select('data')
        .eq('key', key)
        .limit(1);
    if (readError) throw readError;

    const existing = existingRows?.[0]?.data || {};
    const history = Array.isArray(existing.history) ? existing.history : [];
    const record = {
        ...existing,
        normalizedPhone,
        phone: String(phone).trim(),
        customerName: customerName.trim() || existing.customerName || 'Sin nombre',
        sku: normalizedSku,
        productName: productName.trim(),
        reason: 'Exclusión por SKU',
        notes: '',
        active: true,
        createdAt: existing.createdAt || now,
        createdBy: existing.createdBy || user,
        updatedAt: now,
        updatedBy: user,
        reactivatedAt: null,
        reactivatedBy: null,
        history: [...history, { action: 'suppressed', at: now, by: user, sku: normalizedSku }]
    };

    const { error } = await supabase
        .from(STORE_TABLE)
        .upsert({ key, data: record, updated_at: now }, { onConflict: 'key' });
    if (error) throw error;

    const cancelledAssignments = await closeOpenAssignments(normalizedPhone, normalizedSku);
    return { record, cancelledAssignments };
};

export const reactivateContact = async (suppression, actor) => {
    if (actor?.role !== 'admin') throw new Error('Solo un administrador puede reactivar clientes.');

    const normalizedPhone = normalizePhone(suppression.normalizedPhone || suppression.phone);
    const key = suppression.storeKey || getStoreKey(normalizedPhone, suppression.sku);
    const now = new Date().toISOString();
    const user = actorSnapshot(actor);
    const history = Array.isArray(suppression.history) ? suppression.history : [];
    const record = {
        ...suppression,
        normalizedPhone,
        active: false,
        updatedAt: now,
        updatedBy: user,
        reactivatedAt: now,
        reactivatedBy: user,
        history: [...history, { action: 'reactivated', at: now, by: user }]
    };
    delete record.storeKey;

    const { error } = await supabase
        .from(STORE_TABLE)
        .upsert({ key, data: record, updated_at: now }, { onConflict: 'key' });
    if (error) throw error;
    return record;
};
