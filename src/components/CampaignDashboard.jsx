import React, { useState, useEffect } from 'react';
import { 
    BarChart3, Users, CheckCircle2, Phone, AlertCircle, Clock, 
    Download, Search, Filter, MessageSquare, Loader2, Play, Pause, XCircle, X, PhoneOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { getCampaignStats, getAssignmentsByCampaign, updateCampaignScript } from '../utils/campaignUtils';

const CampaignDashboard = ({ campaign, onStatusChange, onScriptChange }) => {
    const [stats, setStats] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Filters and search
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [gestoraFilter, setGestoraFilter] = useState('all');
    
    // State for viewing full notes history modal
    const [viewingNotesAssignment, setViewingNotesAssignment] = useState(null);

    // Script editing state
    const [isEditingScript, setIsEditingScript] = useState(false);
    const [editedScript, setEditedScript] = useState('');
    const [isSavingScript, setIsSavingScript] = useState(false);

    const handleStartEditScript = () => {
        setEditedScript(campaign.description || '');
        setIsEditingScript(true);
    };

    const handleSaveScript = async () => {
        setIsSavingScript(true);
        try {
            const res = await updateCampaignScript(campaign.id, editedScript.trim());
            if (res.success) {
                if (onScriptChange) {
                    onScriptChange(editedScript.trim());
                }
                setIsEditingScript(false);
            } else {
                alert(`Error al guardar el script: ${res.error}`);
            }
        } catch (err) {
            console.error('Failed to save script:', err);
            alert('Error al guardar el script.');
        } finally {
            setIsSavingScript(false);
        }
    };

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const statsRes = await getCampaignStats(campaign.id);
            const assignRes = await getAssignmentsByCampaign(campaign.id);

            if (statsRes.success && assignRes.success) {
                setStats(statsRes.stats);
                setAssignments(assignRes.data);
            } else {
                throw new Error(statsRes.error || assignRes.error || 'Error al cargar datos del dashboard.');
            }
        } catch (err) {
            console.error('Error loading dashboard data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        
        // Auto-refresh stats every 30 seconds if campaign is active
        let interval;
        if (campaign.status === 'active') {
            interval = setInterval(() => {
                loadData();
            }, 30000);
        }
        return () => clearInterval(interval);
    }, [campaign.id, campaign.status]);

    // Export campaign assignments to Excel
    const handleExportExcel = () => {
        if (assignments.length === 0) return;

        const rows = assignments.filter(a => a.status !== 'do_not_contact').map(a => {
            const statusMap = {
                pending: 'Pendiente',
                no_answer: 'No contestó',
                sale: 'Venta Concretada',
                not_interested: 'No interesado',
                callback: 'Llamar después',
                unreachable: 'Inalcanzable',
                do_not_contact: 'No contactar'
            };

            const isClosed = (a.attempts || 0) >= 3 && ['no_answer', 'callback'].includes(a.status);
            const displayStatus = isClosed ? 'Cerrada' : (statusMap[a.status] || a.status);

            return {
                'Nombre Cliente': a.client_name,
                'Teléfono': a.client_phone || 'N/A',
                'Ciudad': a.client_city || 'Desconocida',
                'Segmento RFM': a.client_segment || 'N/A',
                'Gestora Asignada': a.gestora_name,
                'Estado Llamada': displayStatus,
                'Intentos': a.attempts || 0,
                'Notas/Bitácora': a.notes || 'Sin notas',
                'Última Actualización': a.last_updated ? new Date(a.last_updated).toLocaleString('es-ES') : ''
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados');

        // Adjust column widths
        const maxLens = {};
        rows.forEach(row => {
            Object.keys(row).forEach(key => {
                const val = String(row[key] || '');
                maxLens[key] = Math.max(maxLens[key] || 10, Math.min(val.length + 2, 50));
            });
        });
        worksheet['!cols'] = Object.keys(maxLens).map(key => ({ wch: maxLens[key] }));

        XLSX.writeFile(workbook, `Reporte_Campaña_${campaign.name.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
    };

    // Filter assignments based on search and filters
    const filteredAssignments = assignments.filter(a => {
        const matchesSearch = 
            (a.client_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (a.client_phone || '').includes(searchTerm) ||
            (a.gestora_name || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
        const matchesGestora = gestoraFilter === 'all' || a.gestora_uid === gestoraFilter;

        return matchesSearch && matchesStatus && matchesGestora;
    });

    const getStatusText = (status, attempts = 0) => {
        if (attempts >= 3 && ['no_answer', 'callback'].includes(status)) {
            return 'Cerrada';
        }
        const map = {
            pending: 'Pendiente',
            no_answer: 'No contestó',
            sale: 'Venta Concretada',
            not_interested: 'No interesado',
            callback: 'Llamar después',
            unreachable: 'Inalcanzable',
            do_not_contact: 'No contactar'
        };
        return map[status] || status;
    };

    const getStatusStyle = (status, attempts = 0) => {
        if (attempts >= 3 && ['no_answer', 'callback'].includes(status)) {
            return 'bg-slate-200 text-slate-800 dark:bg-slate-850 dark:text-slate-350 border border-slate-300 dark:border-slate-700';
        }
        switch (status) {
            case 'pending':
                return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
            case 'sale':
                return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-500/20';
            case 'no_answer':
                return 'bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400';
            case 'not_interested':
                return 'bg-rose-100 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400';
            case 'callback':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-950/20 dark:text-blue-400';
            case 'unreachable':
                return 'bg-violet-100 text-violet-800 dark:bg-violet-950/20 dark:text-violet-400';
            case 'do_not_contact':
                return 'bg-rose-100 text-rose-800 dark:bg-rose-950/25 dark:text-rose-300';
            default:
                return 'bg-slate-100 text-slate-700';
        }
    };

    if (loading && !stats) {
        return (
            <div className="py-20 text-center space-y-3 glassmorphism bg-white/40 dark:bg-slate-900/40 rounded-2xl">
                <Loader2 className="animate-spin text-blue-500 mx-auto" size={36} />
                <p className="text-sm text-slate-500">Cargando detalles de campaña...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-sm rounded-xl flex items-start gap-3 border border-rose-100 dark:border-rose-900/30">
                <AlertCircle size={20} className="flex-shrink-0" />
                <span>{error}</span>
            </div>
        );
    }

    const total = stats.total || 0;
    const pending = stats.pending || 0;
    const excluded = stats.do_not_contact || 0;
    const completed = total - pending - excluded;
    const sales = stats.sale || 0;
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const effectiveness = completed > 0 ? Math.round((sales / completed) * 100) : 0;

    return (
        <div className="space-y-6">
            {/* Header / Info Panel */}
            <div className="glassmorphism bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">{campaign.name}</h2>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                campaign.status === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400' :
                                campaign.status === 'paused' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400' :
                                'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                                {campaign.status === 'active' ? 'Activa' : campaign.status === 'paused' ? 'Pausada' : 'Cerrada'}
                            </span>
                        </div>
                        <div className="mt-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/60 p-3.5 rounded-xl text-xs max-w-2xl relative group/script">
                            <div className="flex justify-between items-center mb-1 gap-2">
                                <span className="font-bold text-slate-550 dark:text-slate-400 uppercase tracking-wider text-[9px]">Script de la Campaña:</span>
                                {!isEditingScript && (
                                    <button 
                                        onClick={handleStartEditScript}
                                        className="text-[10px] text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-semibold transition-colors flex items-center gap-1"
                                    >
                                        Editar Script
                                    </button>
                                )}
                            </div>
                            
                            {isEditingScript ? (
                                <div className="space-y-2 mt-1.5">
                                    <textarea
                                        rows="3"
                                        value={editedScript}
                                        onChange={(e) => setEditedScript(e.target.value)}
                                        placeholder="Escribe el script de llamada para esta campaña..."
                                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white placeholder:text-slate-500 resize-none"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => setIsEditingScript(false)}
                                            className="px-2.5 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                            disabled={isSavingScript}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleSaveScript}
                                            className="px-2.5 py-1 text-[10px] font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-1 transition-all disabled:opacity-50"
                                            disabled={isSavingScript}
                                        >
                                            {isSavingScript ? 'Guardando...' : 'Guardar'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-slate-700 dark:text-slate-350 italic whitespace-pre-wrap mt-0.5">
                                    {campaign.description ? `"${campaign.description}"` : 'Sin script de llamada configurado.'}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {campaign.status === 'active' && (
                            <button
                                onClick={() => onStatusChange('paused')}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                            >
                                <Pause size={14} />
                                <span>Pausar</span>
                            </button>
                        )}
                        {campaign.status === 'paused' && (
                            <button
                                onClick={() => onStatusChange('active')}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                            >
                                <Play size={14} />
                                <span>Reanudar</span>
                            </button>
                        )}
                        {campaign.status !== 'closed' && (
                            <button
                                onClick={() => onStatusChange('closed')}
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                            >
                                <XCircle size={14} />
                                <span>Cerrar</span>
                            </button>
                        )}
                        
                        <button
                            onClick={handleExportExcel}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-emerald-500/10"
                        >
                            <Download size={14} />
                            <span>Exportar Excel</span>
                        </button>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="mt-6 space-y-2">
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <span>Progreso de llamadas ({completed}/{total} clientes contactados)</span>
                        <span>{progressPercent}% completado</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-500" 
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {[
                    { label: 'Asignados', val: total, color: 'text-slate-800 dark:text-white', icon: Users, bg: 'bg-slate-100 dark:bg-slate-900/50' },
                    { label: 'Pendientes', val: pending, color: 'text-slate-500', icon: Clock, bg: 'bg-slate-100 dark:bg-slate-900/20' },
                    { label: 'Ventas', val: sales, color: 'text-emerald-600 dark:text-emerald-400', icon: CheckCircle2, bg: 'bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-500/10' },
                    { label: 'Eficacia Venta', val: `${effectiveness}%`, color: 'text-blue-600 dark:text-blue-400', icon: BarChart3, bg: 'bg-blue-50/30 dark:bg-blue-900/10' },
                    { label: 'Cerradas (3 Intentos)', val: stats.closed || 0, color: 'text-rose-600 dark:text-rose-400', icon: PhoneOff, bg: 'bg-slate-100 dark:bg-slate-900/20' },
                    { label: excluded > 0 ? 'No contactar' : 'Intentos Totales', val: excluded > 0 ? excluded : (stats.total_attempts || 0), color: excluded > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-purple-600 dark:text-purple-400', icon: excluded > 0 ? PhoneOff : Phone, bg: 'bg-slate-100 dark:bg-slate-900/20' }
                ].map((s, idx) => (
                    <div key={idx} className={`p-4 rounded-xl flex flex-col justify-between ${s.bg}`}>
                        <div className="flex items-center justify-between text-slate-400 mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider">{s.label}</span>
                            <s.icon size={14} />
                        </div>
                        <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Dashboard breakdown tabs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Gestoras Performance Table */}
                <div className="lg:col-span-1 glassmorphism bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-md flex flex-col h-[400px]">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3">Progreso por Gestora</h3>
                    
                    <div className="flex-1 overflow-y-auto pr-1">
                        <table className="w-full text-xs text-left">
                            <thead>
                                <tr className="text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 pb-2">
                                    <th className="py-2">Gestora</th>
                                    <th className="py-2 text-center">Asig.</th>
                                    <th className="py-2 text-center">Ventas</th>
                                    <th className="py-2 text-right">Avance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {(stats.gestoras || []).map(g => {
                                    const gCompleted = g.total - g.pending;
                                    const gPercent = g.total > 0 ? Math.round((gCompleted / g.total) * 100) : 0;
                                    return (
                                        <tr key={g.uid} className="text-slate-700 dark:text-slate-350">
                                            <td className="py-3 font-medium">{g.name}</td>
                                            <td className="py-3 text-center">{g.total}</td>
                                            <td className="py-3 text-center text-emerald-600 dark:text-emerald-400 font-semibold">{g.sale}</td>
                                            <td className="py-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span>{gPercent}%</span>
                                                    <div className="w-10 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500" style={{ width: `${gPercent}%` }} />
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Call Status Distribution */}
                <div className="lg:col-span-2 glassmorphism bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-md flex flex-col h-[400px]">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4">Desglose de Resultados de Llamadas</h3>
                    
                    <div className="flex-1 grid grid-cols-2 gap-4 items-center">
                        <div className="space-y-3">
                            {[
                                { label: 'Ventas Concretadas', val: stats.sale, color: 'bg-emerald-500' },
                                { label: 'Pendientes', val: stats.pending, color: 'bg-slate-300 dark:bg-slate-700' },
                                { label: 'No contestó', val: stats.no_answer, color: 'bg-amber-500' },
                                { label: 'No interesado', val: stats.not_interested, color: 'bg-rose-500' },
                                { label: 'Llamar después (Callback)', val: stats.callback, color: 'bg-blue-500' },
                                { label: 'Cerradas (3 Intentos)', val: stats.closed || 0, color: 'bg-slate-500' },
                                { label: 'Inalcanzable', val: stats.unreachable, color: 'bg-purple-500' }
                            ].map((item, idx) => {
                                const percent = total > 0 ? ((item.val || 0) / total * 100).toFixed(1) : 0;
                                return (
                                    <div key={idx} className="space-y-1">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                                <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                                                {item.label}
                                            </span>
                                            <span className="font-semibold text-slate-800 dark:text-white">{item.val || 0} ({percent}%)</span>
                                        </div>
                                        <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className={`h-full ${item.color}`} style={{ width: `${percent}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="hidden md:flex flex-col items-center justify-center p-6 border-l border-slate-200 dark:border-slate-800">
                            <div className="w-32 h-32 rounded-full border-[10px] border-slate-100 dark:border-slate-800 flex items-center justify-center flex-col relative overflow-hidden">
                                <span className="text-2xl font-bold text-slate-800 dark:text-white">{progressPercent}%</span>
                                <span className="text-[9px] text-slate-400 font-semibold uppercase">Avance</span>
                                <div 
                                    className="absolute inset-0 border-[10px] border-blue-500 pointer-events-none rounded-full" 
                                    style={{ 
                                        clipPath: `polygon(50% 50%, 50% 0%, ${progressPercent >= 25 ? '100% 0%' : '50% 0%'}, ${progressPercent >= 50 ? '100% 100%' : '50% 0%'}, ${progressPercent >= 75 ? '0% 100%' : '50% 0%'}, ${progressPercent >= 100 ? '0% 0%' : '50% 0%'}, 50% 50%)`
                                    }}
                                />
                            </div>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-4 text-center">
                                Tasa de eficacia sobre completados: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{effectiveness}%</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Assignments Detail Table */}
            <div className="glassmorphism bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">Listado de Llamadas Asignadas</h3>

                    {/* Filters bar */}
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        {/* Search */}
                        <div className="relative flex-1 md:flex-initial">
                            <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
                            <input 
                                type="text" 
                                placeholder="Buscar cliente o gestora..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white"
                            />
                        </div>

                        {/* Status Select */}
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-1.5 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white"
                        >
                            <option value="all">Todos los estados</option>
                            <option value="pending">Pendiente</option>
                            <option value="sale">Venta Concretada</option>
                            <option value="no_answer">No contestó</option>
                            <option value="not_interested">No interesado</option>
                            <option value="callback">Llamar después</option>
                            <option value="unreachable">Inalcanzable</option>
                            <option value="do_not_contact">No contactar</option>
                        </select>

                        {/* Gestora Select */}
                        <select
                            value={gestoraFilter}
                            onChange={(e) => setGestoraFilter(e.target.value)}
                            className="text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-1.5 outline-none focus:border-blue-500 transition-all text-slate-800 dark:text-white"
                        >
                            <option value="all">Todas las gestoras</option>
                            {stats.gestoras?.map(g => (
                                <option key={g.uid} value={g.uid}>{g.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead>
                            <tr className="text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                                <th className="py-3 px-2">Cliente</th>
                                <th className="py-3 px-2">Teléfono</th>
                                <th className="py-3 px-2">Ciudad</th>
                                <th className="py-3 px-2">Segmento</th>
                                <th className="py-3 px-2">Gestora</th>
                                <th className="py-3 px-2 text-center">Intentos</th>
                                <th className="py-3 px-2">Estado</th>
                                <th className="py-3 px-2 max-w-[200px]">Notas/Bitácora</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredAssignments.map((a) => (
                                <tr key={a.id} className="text-slate-700 dark:text-slate-300 hover:bg-slate-50/50 dark:hover:bg-slate-950/10">
                                    <td className="py-3 px-2 font-medium text-slate-800 dark:text-white">{a.client_name}</td>
                                    <td className="py-3 px-2 text-slate-500 dark:text-slate-400">{a.client_phone || 'Sin tel.'}</td>
                                    <td className="py-3 px-2 text-slate-500 dark:text-slate-400 uppercase">{a.client_city || 'N/A'}</td>
                                    <td className="py-3 px-2">
                                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                            {a.client_segment || 'N/A'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-2 text-slate-700 dark:text-slate-300 font-medium">{a.gestora_name}</td>
                                    <td className="py-3 px-2 text-center font-bold">{a.attempts || 0}</td>
                                    <td className="py-3 px-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${getStatusStyle(a.status, a.attempts)}`}>
                                            {getStatusText(a.status, a.attempts)}
                                        </span>
                                    </td>
                                    <td 
                                        className="py-3 px-2 max-w-[200px] truncate cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-800/40 transition-colors" 
                                        title="Haga clic para ver el historial completo de notas"
                                        onClick={() => setViewingNotesAssignment(a)}
                                    >
                                        {a.notes ? (
                                            <span className="flex items-center gap-1 text-slate-550 dark:text-slate-350 font-medium">
                                                <MessageSquare size={12} className="flex-shrink-0 text-blue-500" />
                                                <span className="truncate">{a.notes.split('\n').pop()}</span>
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 italic font-normal">Ninguna</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredAssignments.length === 0 && (
                                <tr>
                                    <td colSpan="8" className="py-8 text-center text-slate-500 italic">
                                        No se encontraron llamadas que coincidan con la búsqueda.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Notes History Modal */}
            <AnimatePresence>
                {viewingNotesAssignment && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md overflow-hidden glassmorphism bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4"
                        >
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800/60">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <MessageSquare size={16} className="text-blue-500" />
                                    <span>Historial de Notas</span>
                                </h3>
                                <button 
                                    onClick={() => setViewingNotesAssignment(null)}
                                    className="text-slate-400 hover:text-slate-655 transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="space-y-2.5">
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cliente</span>
                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{viewingNotesAssignment.client_name}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Teléfono</span>
                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{viewingNotesAssignment.client_phone || 'N/A'}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gestora</span>
                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{viewingNotesAssignment.gestora_name}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Intentos</span>
                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{viewingNotesAssignment.attempts || 0}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/40 max-h-60 overflow-y-auto">
                                {viewingNotesAssignment.notes ? (
                                    <div className="space-y-3">
                                        {viewingNotesAssignment.notes.split('\n').map((note, index) => {
                                            const match = note.match(/^\[(.*?)\]\s*(.*)$/);
                                            if (match) {
                                                return (
                                                    <div key={index} className="text-xs border-l-2 border-blue-500/50 pl-2.5 py-0.5">
                                                        <span className="text-[10px] font-semibold text-slate-400 block mb-0.5">{match[1]}</span>
                                                        <p className="text-slate-700 dark:text-slate-350 leading-relaxed whitespace-pre-wrap">{match[2]}</p>
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div key={index} className="text-xs border-l-2 border-slate-300 dark:border-slate-700 pl-2.5 py-0.5">
                                                    <p className="text-slate-700 dark:text-slate-350 leading-relaxed whitespace-pre-wrap">{note}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 italic text-center py-4">No hay notas registradas para este cliente.</p>
                                )}
                            </div>

                            <div className="flex justify-end pt-1">
                                <button 
                                    onClick={() => setViewingNotesAssignment(null)}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-md shadow-blue-500/10"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CampaignDashboard;
