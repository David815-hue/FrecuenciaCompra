import { supabase } from '../config/supabase';

/**
 * Creates a new campaign in Supabase.
 * 
 * @param {object} campaignData - { name, description, sourceType, sourceMeta, totalClients, createdBy }
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export const createCampaign = async ({ name, description, sourceType, sourceMeta = {}, totalClients = 0, createdBy }) => {
    try {
        const { data, error } = await supabase
            .from('campaigns')
            .insert({
                name,
                description,
                source_type: sourceType,
                source_meta: sourceMeta,
                total_clients: totalClients,
                created_by: createdBy,
                status: 'active',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('❌ createCampaign: Error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Gets all campaigns from Supabase, ordered by creation date descending.
 * 
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export const getCampaigns = async () => {
    try {
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('❌ getCampaigns: Error:', error);
        return { success: false, error: error.message, data: [] };
    }
};

/**
 * Gets a campaign by ID.
 * 
 * @param {string} campaignId
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export const getCampaignById = async (campaignId) => {
    try {
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', campaignId)
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('❌ getCampaignById: Error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Updates a campaign's status (active, paused, closed).
 * If status is 'closed', sets closed_at.
 * 
 * @param {string} campaignId
 * @param {string} status - 'active' | 'paused' | 'closed'
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export const updateCampaignStatus = async (campaignId, status) => {
    try {
        const updateFields = { status };
        if (status === 'closed') {
            updateFields.closed_at = new Date().toISOString();
        } else {
            updateFields.closed_at = null;
        }

        const { data, error } = await supabase
            .from('campaigns')
            .update(updateFields)
            .eq('id', campaignId)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('❌ updateCampaignStatus: Error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Updates the campaign's script/description.
 * 
 * @param {string} campaignId
 * @param {string} script
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export const updateCampaignScript = async (campaignId, script) => {
    try {
        const { data, error } = await supabase
            .from('campaigns')
            .update({ description: script })
            .eq('id', campaignId)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('❌ updateCampaignScript: Error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Distributes clients randomly and equitably among gestoras, and inserts them in batches.
 * 
 * @param {string} campaignId
 * @param {Array} clients - Array of customer/client objects
 * @param {Array} gestoras - Array of gestora user objects
 * @returns {Promise<{success: boolean, count?: number, error?: string}>}
 */
export const assignClients = async (campaignId, clients, gestoras) => {
    try {
        if (!clients || clients.length === 0) {
            throw new Error('No hay clientes para asignar');
        }
        if (!gestoras || gestoras.length === 0) {
            throw new Error('No hay gestoras seleccionadas');
        }

        console.log(`Distributing ${clients.length} clients among ${gestoras.length} gestoras...`);

        // 1. Shuffle clients (Fisher-Yates)
        const shuffledClients = [...clients];
        for (let i = shuffledClients.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledClients[i], shuffledClients[j]] = [shuffledClients[j], shuffledClients[i]];
        }

        // 2. Prepare assignment records (Round-Robin distribution)
        const assignmentsData = shuffledClients.map((client, idx) => {
            const gestora = gestoras[idx % gestoras.length];
            
            // Handle different potential customer/client shapes
            const name = client.name || client.customerName || 'Sin nombre';
            const phone = client.phone || '';
            const city = client.city || '';
            const segment = client.segment || client.rfmSegment || '';
            
            // Build RFM metadata
            const rfm = {
                recency: client.recency !== undefined ? client.recency : (client.rfm?.recency || null),
                frequency: client.frequency !== undefined ? client.frequency : (client.rfm?.frequency || null),
                monetary: client.monetary !== undefined ? client.monetary : (client.rfm?.monetary || null)
            };

            // Capture extra attributes (like products, dates, etc.)
            const extra = { ...client };
            delete extra.name;
            delete extra.customerName;
            delete extra.phone;
            delete extra.city;
            delete extra.segment;
            delete extra.rfmSegment;
            delete extra.rfm;

            return {
                campaign_id: campaignId,
                client_name: name,
                client_phone: phone,
                client_city: city,
                client_segment: segment,
                client_rfm: rfm,
                client_extra: extra,
                gestora_uid: gestora.id || gestora.uid, // Support both formats
                gestora_name: gestora.displayName || gestora.username || 'Gestora sin nombre',
                status: 'pending',
                attempts: 0,
                notes: '',
                created_at: new Date().toISOString(),
                last_updated: new Date().toISOString()
            };
        });

        // 3. Batch insert into campaign_assignments
        const BATCH_SIZE = 100;
        let insertedCount = 0;

        for (let i = 0; i < assignmentsData.length; i += BATCH_SIZE) {
            const chunk = assignmentsData.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('campaign_assignments')
                .insert(chunk);

            if (error) {
                console.error(`Error inserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
                throw error;
            }
            insertedCount += chunk.length;
        }

        // 4. Update total_clients count on campaign
        await supabase
            .from('campaigns')
            .update({ total_clients: insertedCount })
            .eq('id', campaignId);

        console.log(`🎉 Successfully assigned ${insertedCount} clients to ${gestoras.length} gestoras.`);
        return { success: true, count: insertedCount };
    } catch (error) {
        console.error('❌ assignClients: Error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Gets all assignments for a specific gestora, including campaign details.
 * 
 * @param {string} gestoraUid
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export const getAssignmentsByGestora = async (gestoraUid) => {
    try {
        const { data, error } = await supabase
            .from('campaign_assignments')
            .select(`
                *,
                campaigns:campaign_id (
                    name,
                    description,
                    status,
                    source_meta
                )
            `)
            .eq('gestora_uid', gestoraUid)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Filter assignments where campaign status is not closed/paused if we only want active ones,
        // or just return all and let frontend decide. Returning all here.
        return { success: true, data };
    } catch (error) {
        console.error('❌ getAssignmentsByGestora: Error:', error);
        return { success: false, error: error.message, data: [] };
    }
};

/**
 * Gets all assignments for a campaign.
 * 
 * @param {string} campaignId
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export const getAssignmentsByCampaign = async (campaignId) => {
    try {
        const { data, error } = await supabase
            .from('campaign_assignments')
            .select('*')
            .eq('campaign_id', campaignId)
            .order('client_name', { ascending: true });

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('❌ getAssignmentsByCampaign: Error:', error);
        return { success: false, error: error.message, data: [] };
    }
};

/**
 * Updates an assignment's status and notes. Increments attempts by 1 if requested or if status is 'no_answer'/'callback'/'unreachable'.
 * 
 * @param {string} assignmentId
 * @param {object} updateData - { status, notes, incrementAttempts }
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export const updateAssignmentStatus = async (assignmentId, { status, notes = '', incrementAttempts = false }) => {
    try {
        // First get the current assignment to know the attempts
        const { data: current, error: fetchError } = await supabase
            .from('campaign_assignments')
            .select('attempts, notes')
            .eq('id', assignmentId)
            .single();

        if (fetchError) throw fetchError;

        let newAttempts = current.attempts || 0;
        if (incrementAttempts || ['no_answer', 'callback'].includes(status)) {
            newAttempts += 1;
        }

        // Combine notes: append new notes to old notes with a timestamp if they are different
        let updatedNotes = current.notes || '';
        if (notes && notes.trim() !== '') {
            const timestamp = new Date().toLocaleDateString('es-ES', { 
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
            });
            const formattedNote = `[${timestamp}] ${notes.trim()}`;
            updatedNotes = updatedNotes 
                ? `${updatedNotes}\n${formattedNote}` 
                : formattedNote;
        }

        const { data, error } = await supabase
            .from('campaign_assignments')
            .update({
                status,
                notes: updatedNotes,
                attempts: newAttempts,
                last_updated: new Date().toISOString()
            })
            .eq('id', assignmentId)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('❌ updateAssignmentStatus: Error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Gets aggregated statistics for a specific campaign, categorized by status and by gestora.
 * 
 * @param {string} campaignId
 * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
 */
export const getCampaignStats = async (campaignId) => {
    try {
        const { data, error } = await supabase
            .from('campaign_assignments')
            .select('gestora_uid, gestora_name, status, attempts')
            .eq('campaign_id', campaignId);

        if (error) throw error;

        // Initialize counters
        const stats = {
            total: data.length,
            pending: 0,
            no_answer: 0,
            sale: 0,
            not_interested: 0,
            callback: 0,
            unreachable: 0,
            closed: 0,
            total_attempts: 0,
            byGestora: {}
        };

        data.forEach(item => {
            const isClosed = (item.attempts || 0) >= 3 && ['no_answer', 'callback'].includes(item.status);

            // Global status count
            if (isClosed) {
                stats.closed++;
            } else {
                if (stats[item.status] !== undefined) {
                    stats[item.status]++;
                }
            }
            stats.total_attempts += item.attempts || 0;

            // Per gestora count
            const gUid = item.gestora_uid;
            if (!stats.byGestora[gUid]) {
                stats.byGestora[gUid] = {
                    uid: gUid,
                    name: item.gestora_name,
                    total: 0,
                    pending: 0,
                    no_answer: 0,
                    sale: 0,
                    not_interested: 0,
                    callback: 0,
                    unreachable: 0,
                    closed: 0,
                    attempts: 0
                };
            }

            const gStats = stats.byGestora[gUid];
            gStats.total++;
            gStats.attempts += item.attempts || 0;
            if (isClosed) {
                gStats.closed++;
            } else {
                if (gStats[item.status] !== undefined) {
                    gStats[item.status]++;
                }
            }
        });

        // Convert byGestora map to an array for easy rendering
        stats.gestoras = Object.values(stats.byGestora);

        return { success: true, stats };
    } catch (error) {
        console.error('❌ getCampaignStats: Error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Deletes a campaign and all its associated assignments from the database.
 * 
 * @param {string} campaignId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const deleteCampaign = async (campaignId) => {
    try {
        // Delete assignments first
        const { error: assignmentsError } = await supabase
            .from('campaign_assignments')
            .delete()
            .eq('campaign_id', campaignId);
            
        if (assignmentsError) throw assignmentsError;

        // Delete campaign
        const { error: campaignError } = await supabase
            .from('campaigns')
            .delete()
            .eq('id', campaignId);

        if (campaignError) throw campaignError;

        return { success: true };
    } catch (error) {
        console.error('❌ deleteCampaign: Error:', error);
        return { success: false, error: error.message };
    }
};

