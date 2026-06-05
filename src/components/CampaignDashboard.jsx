import React, { useState, useEffect } from 'react';
import { 
    BarChart3, Users, CheckCircle2, Phone, AlertCircle, Clock, 
    Download, Search, Filter, MessageSquare, Loader2, Play, Pause, XCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { getCampaignStats, getAssignmentsByCampaign } from '../utils/campaignUtils';

const CampaignDashboard = ({ campaign, onStatusChange }) => {
    const [stats, setStats] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Filters and search
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [gestoraFilter, setGestoraFilter] = useState('all');

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

        const rows = assignments.map(a => {
            const statusMap = {
                pending: 'Pendiente',
                no_answer: 'No contestó',
                sale: 'Venta Concretada',
                not_interested: 'No interesado',
                callback: 'Llamar después',
                unreachable: 'Inalcanzable'
            };

            return {
                'Nombre Cliente': a.client_name,
                'Teléfono': a.client_phone || 'N/A',
                'Ciudad': a.client_city || 'Desconocida',
                'Segmento RFM': a.client_segment || 'N/A',
                'Gestora Asignada': a.gestora_name,
                'Estado Llamada': statusMap[a.status] || a.status,
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

    const getStatusStyle = (status) => {
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
    const completed = total - pending;
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
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">{campaign.description || 'Sin descripción'}</p>
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
                    { label: 'Pendientes', val: pending, color: 'text-slate-500', icon: Clock, bg: 'bg-slate-50 dark:bg-slate-900/20' },
                    { label: 'Ventas', val: sales, color: 'text-emerald-600 dark:text-emerald-400', icon: CheckCircle2, bg: 'bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-500/10' },
                    { label: 'Eficacia Venta', val: `${effectiveness}%`, color: 'text-blue-600 dark:text-blue-400', icon: BarChart3, bg: 'bg-blue-50/30 dark:bg-blue-900/10' },
                    { label: 'Llamar después', val: stats.callback || 0, color: 'text-blue-500', icon: Phone, bg: 'bg-slate-100 dark:bg-slate-900/20' },
                    { label: 'Intentos Totales', val: stats.total_attempts || 0, color: 'text-purple-600 dark:text-purple-400', icon: Phone, bg: 'bg-slate-100 dark:bg-slate-900/20' }
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
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${getStatusStyle(a.status)}`}>
                                            {getStatusText(a.status)}
                                        </span>
                                    </td>
                                    <td className="py-3 px-2 max-w-[200px] truncate" title={a.notes}>
                                        {a.notes ? (
                                            <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                                <MessageSquare size={12} className="flex-shrink-0 text-blue-500" />
                                                <span className="truncate">{a.notes.split('\n').pop()}</span>
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 italic">Ninguna</span>
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
        </div>
    );
};

export default CampaignDashboard;
