import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Phone, Check, X, Clock, MessageSquare, AlertTriangle, Search, 
    ArrowUpDown, Loader2, Award, PhoneOff, Calendar, AlertCircle
} from 'lucide-react';
import { getAssignmentsByGestora, updateAssignmentStatus } from '../utils/campaignUtils';

const GestoraCallView = ({ currentUser }) => {
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTab, setFilterTab] = useState('uncalled'); // 'uncalled', 'retries', 'completed', 'bad_numbers', 'all'
    const [sortBy, setSortBy] = useState('name'); // 'name', 'attempts', 'updated'
    
    // Notes modal/state
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [noteText, setNoteText] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);
    
    // Call statuses that are considered "pending" vs "completed"
    const PENDING_STATUSES = ['pending', 'no_answer', 'callback'];
    const COMPLETED_STATUSES = ['sale', 'not_interested', 'unreachable'];

    const loadAssignments = async () => {
        if (!currentUser?.uid) return;
        setLoading(true);
        setError('');
        try {
            const res = await getAssignmentsByGestora(currentUser.uid);
            if (res.success) {
                // Filter out assignments from non-active campaigns
                const activeCampaignAssignments = res.data.filter(a => 
                    a.campaigns && a.campaigns.status === 'active'
                );
                setAssignments(activeCampaignAssignments);
            } else {
                throw new Error(res.error || 'Error al cargar tus asignaciones.');
            }
        } catch (err) {
            console.error('Error loading gestora assignments:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAssignments();
    }, [currentUser?.uid]);

    // Handle Quick Status Updates
    const handleStatusUpdate = async (assignmentId, status, notes = '', incrementAttempts = false) => {
        try {
            // Optimistic update in UI
            setAssignments(prev => prev.map(a => {
                if (a.id === assignmentId) {
                    let newAttempts = a.attempts || 0;
                    if (incrementAttempts || ['no_answer', 'callback', 'unreachable'].includes(status)) {
                        newAttempts += 1;
                    }
                    return {
                        ...a,
                        status,
                        attempts: newAttempts,
                        last_updated: new Date().toISOString()
                    };
                }
                return a;
            }));

            // Send database request
            const res = await updateAssignmentStatus(assignmentId, { status, notes, incrementAttempts });
            if (!res.success) {
                alert(`Error al actualizar estado: ${res.error}`);
                // Reload on failure to sync
                loadAssignments();
            }
        } catch (err) {
            console.error('Failed status update:', err);
            loadAssignments();
        }
    };

    // Save Note Modal
    const handleOpenNoteModal = (assignmentId, currentNotes = '') => {
        setEditingNoteId(assignmentId);
        setNoteText('');
    };

    const handleSaveNote = async () => {
        if (!noteText.trim()) {
            setEditingNoteId(null);
            return;
        }

        setIsSavingNote(true);
        try {
            // Find current status to preserve it
            const assignment = assignments.find(a => a.id === editingNoteId);
            if (assignment) {
                // Append notes using utility function
                const res = await updateAssignmentStatus(editingNoteId, {
                    status: assignment.status,
                    notes: noteText.trim(),
                    incrementAttempts: false
                });

                if (res.success) {
                    // Update state notes
                    setAssignments(prev => prev.map(a => {
                        if (a.id === editingNoteId) {
                            return {
                                ...a,
                                notes: res.data.notes,
                                last_updated: res.data.last_updated
                            };
                        }
                        return a;
                    }));
                } else {
                    alert(`Error al guardar la nota: ${res.error}`);
                }
            }
        } catch (err) {
            console.error('Error saving note:', err);
        } finally {
            setIsSavingNote(false);
            setEditingNoteId(null);
            setNoteText('');
        }
    };

    // Filtered and sorted assignments list
    const filteredAssignments = assignments
        .filter(a => {
            // Tab filter
            if (filterTab === 'uncalled') {
                return a.status === 'pending';
            } else if (filterTab === 'retries') {
                return a.status === 'no_answer' || a.status === 'callback';
            } else if (filterTab === 'completed') {
                return a.status === 'sale' || a.status === 'not_interested';
            } else if (filterTab === 'bad_numbers') {
                return a.status === 'unreachable';
            }
            return true; // 'all'
        })
        .filter(a => {
            // Search filter
            const term = searchTerm.toLowerCase();
            return (
                (a.client_name || '').toLowerCase().includes(term) ||
                (a.client_phone || '').includes(term) ||
                (a.client_city || '').toLowerCase().includes(term) ||
                (a.campaigns?.name || '').toLowerCase().includes(term)
            );
        })
        .sort((a, b) => {
            // Sort logic
            if (sortBy === 'name') {
                return a.client_name.localeCompare(b.client_name);
            } else if (sortBy === 'attempts') {
                return (a.attempts || 0) - (b.attempts || 0);
            } else if (sortBy === 'updated') {
                return new Date(b.last_updated) - new Date(a.last_updated);
            }
            return 0;
        });

    // Counts for stats banner
    const stats = {
        total: assignments.length,
        pending: assignments.filter(a => PENDING_STATUSES.includes(a.status)).length,
        completed: assignments.filter(a => COMPLETED_STATUSES.includes(a.status)).length,
        sales: assignments.filter(a => a.status === 'sale').length
    };

    // Counts for tabs
    const counts = {
        total: assignments.length,
        uncalled: assignments.filter(a => a.status === 'pending').length,
        retries: assignments.filter(a => a.status === 'no_answer' || a.status === 'callback').length,
        completed: assignments.filter(a => a.status === 'sale' || a.status === 'not_interested').length,
        bad_numbers: assignments.filter(a => a.status === 'unreachable').length
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'pending':
                return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
            case 'sale':
                return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 font-bold';
            case 'no_answer':
                return 'bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400';
            case 'not_interested':
                return 'bg-rose-100 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400';
            case 'callback':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-950/20 dark:text-blue-400';
            case 'unreachable':
                return 'bg-violet-100 text-violet-800 dark:bg-violet-950/20 dark:text-violet-400';
            default:
                return 'bg-slate-100 text-slate-700';
        }
    };

    const getStatusText = (status) => {
        const map = {
            pending: 'Pendiente',
            no_answer: 'No contestó',
            sale: 'Venta Concretada',
            not_interested: 'No interesado',
            callback: 'Llamar después',
            unreachable: 'Inalcanzable'
        };
        return map[status] || status;
    };
    const getFormattedLatestOrderDate = (assignment) => {
        const orders = assignment.client_extra?.orders || [];
        if (orders.length === 0) return null;
        
        const selectedProducts = assignment.campaigns?.source_meta?.selectedProducts || [];
        const hasSelectedProducts = Array.isArray(selectedProducts) && selectedProducts.length > 0;
        
        let filteredOrders = orders;
        if (hasSelectedProducts) {
            const selectedSkus = new Set(selectedProducts.map(p => String(p.sku || '').toLowerCase().trim()));
            filteredOrders = orders.filter(order => 
                (order.items || []).some(item => 
                    item.sku && selectedSkus.has(String(item.sku).toLowerCase().trim())
                )
            );
            
            // Fallback to all orders if filtering by SKU yields no matches
            if (filteredOrders.length === 0) {
                filteredOrders = orders;
            }
        }
        
        let latestTime = null;
        filteredOrders.forEach(order => {
            if (order.orderDate) {
                const dateStr = String(order.orderDate).split(' ')[0];
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                    if (latestTime === null || date.getTime() > latestTime) {
                        latestTime = date.getTime();
                    }
                }
            }
        });

        if (latestTime === null) return null;
        return new Date(latestTime).toLocaleDateString('es-HN', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric', 
            timeZone: 'UTC' 
        });
    };

    const getDialUrl = (phone) => {
        if (!phone) return '';
        const cleanPhone = String(phone).replace(/\D/g, '');
        let localPhone = cleanPhone;
        if (cleanPhone.length > 8 && cleanPhone.startsWith('504')) {
            localPhone = cleanPhone.slice(-8);
        }
        return `tel:4${localPhone}`;
    };
    return (
        <div className="space-y-6">
            {/* Header / Stats Summary */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Phone className="text-blue-500" />
                        <span>Mis Llamadas Asignadas</span>
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Hola, <span className="font-semibold text-blue-600 dark:text-blue-400">{currentUser?.displayName || currentUser?.username}</span>. Aquí tienes tu lista de clientes activos para llamar.
                    </p>
                </div>
                
                <button
                    onClick={loadAssignments}
                    className="px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all flex items-center gap-1.5"
                >
                    <span>Sincronizar Lista</span>
                </button>
            </div>

            {/* Stats Cards Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Pendientes por Llamar', val: stats.pending, color: 'text-amber-600 dark:text-amber-400', icon: Clock, bg: 'bg-amber-500/5 dark:bg-amber-500/10' },
                    { label: 'Ventas Concretadas', val: stats.sales, color: 'text-emerald-600 dark:text-emerald-400', icon: Award, bg: 'bg-emerald-500/5 dark:bg-emerald-500/10' },
                    { label: 'Completadas', val: stats.completed, color: 'text-slate-800 dark:text-white', icon: Check, bg: 'bg-slate-100 dark:bg-slate-900/50' },
                    { label: 'Total Asignadas', val: stats.total, color: 'text-blue-600 dark:text-blue-400', icon: Phone, bg: 'bg-blue-500/5 dark:bg-blue-500/10' }
                ].map((s, idx) => (
                    <div key={idx} className={`p-4 rounded-xl flex items-center justify-between ${s.bg} border border-slate-100 dark:border-slate-800/40`}>
                        <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</span>
                            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.val}</p>
                        </div>
                        <s.icon className={`opacity-20 ${s.color}`} size={32} />
                    </div>
                ))}
            </div>

            {/* Filter and search bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-4">
                {/* Tabs */}
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950/40 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
                    {[
                        { id: 'uncalled', label: `Por Llamar (${counts.uncalled})` },
                        { id: 'retries', label: `Reintentos (${counts.retries})` },
                        { id: 'completed', label: `Completadas (${counts.completed})` },
                        { id: 'bad_numbers', label: `Números Malos (${counts.bad_numbers})` },
                        { id: 'all', label: `Todas (${counts.total})` }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setFilterTab(tab.id)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                filterTab === tab.id
                                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Search & Sort */}
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-initial">
                        <Search className="absolute left-3 top-2 text-slate-400" size={14} />
                        <input 
                            type="text" 
                            placeholder="Buscar por nombre, tel..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-56 text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white"
                        />
                    </div>

                    <button
                        onClick={() => {
                            if (sortBy === 'name') setSortBy('attempts');
                            else if (sortBy === 'attempts') setSortBy('updated');
                            else setSortBy('name');
                        }}
                        className="p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
                    >
                        <ArrowUpDown size={14} />
                        <span>Orden: {sortBy === 'name' ? 'Nombre A-Z' : sortBy === 'attempts' ? 'Intentos' : 'Último cambio'}</span>
                    </button>
                </div>
            </div>

            {/* Assignments List */}
            {loading ? (
                <div className="py-20 text-center space-y-3">
                    <Loader2 className="animate-spin text-blue-500 mx-auto" size={32} />
                    <p className="text-sm text-slate-500">Cargando tus llamadas asignadas...</p>
                </div>
            ) : error ? (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-sm rounded-xl flex items-start gap-3 border border-rose-100 dark:border-rose-900/30">
                    <AlertCircle size={20} className="flex-shrink-0" />
                    <span>{error}</span>
                </div>
            ) : filteredAssignments.length === 0 ? (
                <div className="text-center py-20 bg-white/40 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed">
                    <PhoneOff className="mx-auto text-slate-300 dark:text-slate-700 mb-4" size={48} />
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No hay llamadas</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        {filterTab === 'uncalled' ? '🎉 ¡Felicidades! Has completado todas tus llamadas de campañas activas.' : 'No tienes llamadas asignadas en esta pestaña.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredAssignments.map(a => (
                        <div
                            key={a.id}
                            className={`glassmorphism bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-200 flex flex-col justify-between min-h-[200px] relative overflow-hidden`}
                        >
                            {/* Campaign tag */}
                            <div className="absolute top-0 right-0 left-0 bg-slate-50 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800 px-4 py-1.5 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-400 truncate max-w-[70%]">
                                    CAMPAÑA: {a.campaigns?.name}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${getStatusStyle(a.status)}`}>
                                    {getStatusText(a.status)}
                                </span>
                            </div>

                            <div className="pt-6">
                                <div className="flex justify-between items-start mt-1">
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white text-base">
                                            {a.client_name}
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-col gap-0.5 uppercase">
                                            <span className="flex items-center gap-1.5">
                                                <span>{a.client_city || 'Ciudad Desconocida'}</span>
                                                <span>•</span>
                                                <span className="font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">
                                                    DNI: {a.client_extra?.identity || 'S/D'}
                                                </span>
                                            </span>
                                            {getFormattedLatestOrderDate(a) && (
                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium normal-case mt-0.5">
                                                    Últ. compra: {getFormattedLatestOrderDate(a)}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    
                                    <div className="text-right">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Intentos</span>
                                        <span className={`text-base font-bold ${a.attempts > 2 ? 'text-amber-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                            {a.attempts || 0}
                                        </span>
                                    </div>
                                </div>

                                {/* Phone Click-to-Call */}
                                {a.client_phone && (
                                    <a 
                                        href={getDialUrl(a.client_phone)}
                                        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-semibold transition-colors w-fit"
                                    >
                                        <Phone size={13} />
                                        <span>Llamar: <span className="font-bold">{a.client_phone}</span></span>
                                    </a>
                                )}

                                {/* Notes/Bitacora Section */}
                                <div className="mt-3 p-3 bg-slate-50/50 dark:bg-slate-950/10 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
                                    <div className="flex justify-between items-center text-slate-400 mb-1">
                                        <span className="font-semibold text-[10px] uppercase">Historial de Notas</span>
                                        <button 
                                            onClick={() => handleOpenNoteModal(a.id, a.notes)}
                                            className="text-[10px] text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-semibold"
                                        >
                                            + Agregar Nota
                                        </button>
                                    </div>
                                    {a.notes ? (
                                        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line max-h-[60px] overflow-y-auto pr-1 leading-relaxed text-[11px]">
                                            {a.notes}
                                        </p>
                                    ) : (
                                        <p className="text-slate-400 italic text-[10px]">No hay notas registradas para este cliente.</p>
                                    )}
                                </div>
                            </div>

                            {/* Call Outcome Actions */}
                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 grid grid-cols-5 gap-2">
                                <button
                                    onClick={() => handleStatusUpdate(a.id, 'no_answer', '', true)}
                                    className="p-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/10 dark:hover:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl text-center flex flex-col items-center justify-center gap-1 transition-colors"
                                    title="No contestó (Registra llamada e incrementa intentos)"
                                >
                                    <PhoneOff size={14} />
                                    <span className="text-[9px] font-semibold">No cont.</span>
                                </button>

                                <button
                                    onClick={() => handleStatusUpdate(a.id, 'callback', '', true)}
                                    className="p-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/10 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-center flex flex-col items-center justify-center gap-1 transition-colors"
                                    title="Llamar después (Incrementa intentos)"
                                >
                                    <Clock size={14} />
                                    <span className="text-[9px] font-semibold">Re-llamar</span>
                                </button>

                                <button
                                    onClick={() => handleStatusUpdate(a.id, 'unreachable', '', true)}
                                    className="p-2 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/10 dark:hover:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-xl text-center flex flex-col items-center justify-center gap-1 transition-colors"
                                    title="Teléfono inalcanzable/malo (Incrementa intentos)"
                                >
                                    <AlertTriangle size={14} />
                                    <span className="text-[9px] font-semibold">Malo</span>
                                </button>

                                <button
                                    onClick={() => handleStatusUpdate(a.id, 'not_interested', '')}
                                    className="p-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/10 dark:hover:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl text-center flex flex-col items-center justify-center gap-1 transition-colors font-semibold"
                                    title="No interesado (Cierra el caso)"
                                >
                                    <X size={14} />
                                    <span className="text-[9px] font-semibold">Rechazo</span>
                                </button>

                                <button
                                    onClick={() => handleStatusUpdate(a.id, 'sale', '')}
                                    className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-center flex flex-col items-center justify-center gap-1 transition-colors font-bold shadow-md shadow-emerald-500/10"
                                    title="¡Venta Concretada! (Cierra el caso)"
                                >
                                    <Check size={14} />
                                    <span className="text-[9px] font-bold">¡Venta!</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Note Entry Modal */}
            <AnimatePresence>
                {editingNoteId && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md overflow-hidden glassmorphism bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4"
                        >
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <MessageSquare size={16} className="text-blue-500" />
                                    <span>Agregar Nota de Bitácora</span>
                                </h3>
                                <button 
                                    onClick={() => setEditingNoteId(null)}
                                    className="text-slate-400 hover:text-slate-600"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Escribe los detalles de la llamada. Esta nota se agregará a la bitácora con la fecha actual.
                            </p>

                            <textarea
                                rows="3"
                                placeholder="Escribe observaciones clave del cliente para revisión de supervisores..."
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white placeholder:text-slate-400 resize-none"
                            />

                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setEditingNoteId(null)}
                                    disabled={isSavingNote}
                                    className="px-3.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveNote}
                                    disabled={isSavingNote || !noteText.trim()}
                                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-500/10 disabled:opacity-50"
                                >
                                    {isSavingNote ? (
                                        <>
                                            <Loader2 size={12} className="animate-spin" />
                                            <span>Guardando...</span>
                                        </>
                                    ) : (
                                        <span>Guardar Nota</span>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default GestoraCallView;
