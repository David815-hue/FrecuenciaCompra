import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
    PhoneCall, Plus, Play, Pause, XCircle, BarChart3, Clock, 
    Calendar, Users, CheckCircle2, ChevronRight, Loader2, AlertCircle, ArrowLeft,
    Trash2
} from 'lucide-react';
import { getCampaigns, updateCampaignStatus, getCampaignStats, deleteCampaign } from '../utils/campaignUtils';
import CampaignWizard from './CampaignWizard';
import CampaignDashboard from './CampaignDashboard';

const CampaignManager = ({ customersData = [], currentUser, preloadedClients = null, onClearPreloadedClients }) => {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showWizard, setShowWizard] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [campaignStats, setCampaignStats] = useState({});
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'paused', 'closed'

    // Load campaigns on mount and when changed
    const loadCampaigns = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await getCampaigns();
            if (res.success) {
                setCampaigns(res.data);
                
                // Fetch stats for all campaigns to display progress
                const statsMap = {};
                for (const camp of res.data) {
                    const statsRes = await getCampaignStats(camp.id);
                    if (statsRes.success) {
                        statsMap[camp.id] = statsRes.stats;
                    }
                }
                setCampaignStats(statsMap);
            } else {
                throw new Error(res.error || 'No se pudieron cargar las campañas.');
            }
        } catch (err) {
            console.error('Error in CampaignManager load:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCampaigns();
    }, []);

    // Automatically trigger wizard when preloadedClients changes
    useEffect(() => {
        if (preloadedClients && preloadedClients.length > 0) {
            setShowWizard(true);
        }
    }, [preloadedClients]);

    // Change campaign status
    const handleStatusChange = async (campaignId, newStatus, e) => {
        e.stopPropagation(); // Avoid opening details
        if (newStatus === 'closed' && !window.confirm('¿Estás seguro de que deseas cerrar esta campaña? Esto marcará la campaña como finalizada.')) {
            return;
        }

        try {
            const res = await updateCampaignStatus(campaignId, newStatus);
            if (res.success) {
                // Reload campaigns
                await loadCampaigns();
            } else {
                alert(`Error al actualizar estado: ${res.error}`);
            }
        } catch (err) {
            console.error('Failed to update status:', err);
        }
    };

    // Delete campaign handler
    const handleDeleteCampaignClick = async (campaignId, e) => {
        e.stopPropagation(); // Avoid opening details
        if (!window.confirm('¿Estás completamente seguro de que deseas eliminar esta campaña? Esta acción es irreversible y borrará todos los datos de asignación y llamadas asociadas.')) {
            return;
        }

        try {
            const res = await deleteCampaign(campaignId);
            if (res.success) {
                await loadCampaigns();
            } else {
                alert(`Error al eliminar campaña: ${res.error}`);
            }
        } catch (err) {
            console.error('Failed to delete campaign:', err);
        }
    };

    // Filtered campaigns list
    const filteredCampaigns = campaigns.filter(c => {
        if (filterStatus === 'all') return true;
        return c.status === filterStatus;
    });

    const getStatusBadge = (status) => {
        switch (status) {
            case 'active':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Activa
                    </span>
                );
            case 'paused':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Pausada
                    </span>
                );
            case 'closed':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        Cerrada
                    </span>
                );
            default:
                return null;
        }
    };

    // Master-detail view switch: If a campaign is selected, render the dashboard
    if (selectedCampaign) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => {
                        setSelectedCampaign(null);
                        loadCampaigns(); // Reload list to update progress
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white glassmorphism bg-white/20 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-lg transition-all"
                >
                    <ArrowLeft size={14} />
                    <span>Volver a Campañas</span>
                </button>

                <CampaignDashboard 
                    campaign={selectedCampaign} 
                    onStatusChange={async (status) => {
                        const res = await updateCampaignStatus(selectedCampaign.id, status);
                        if (res.success) {
                            setSelectedCampaign({ ...selectedCampaign, status });
                        }
                    }}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <PhoneCall className="text-blue-500" />
                        <span>Gestión de Campañas de Llamadas</span>
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Crea, distribuye y monitorea campañas de llamadas para reactivación de clientes.
                    </p>
                </div>
                
                <button
                    onClick={() => setShowWizard(true)}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg shadow-blue-500/10"
                >
                    <Plus size={18} />
                    <span>Nueva Campaña</span>
                </button>
            </div>

            {/* Filters bar */}
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-4">
                {[
                    { id: 'all', label: 'Todas' },
                    { id: 'active', label: 'Activas' },
                    { id: 'paused', label: 'Pausadas' },
                    { id: 'closed', label: 'Cerradas' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setFilterStatus(tab.id)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            filterStatus === tab.id
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/30'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Campaigns Grid */}
            {loading ? (
                <div className="py-20 text-center space-y-3">
                    <Loader2 className="animate-spin text-blue-500 mx-auto" size={36} />
                    <p className="text-sm text-slate-500">Cargando campañas y métricas...</p>
                </div>
            ) : error ? (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-sm rounded-xl flex items-start gap-3 border border-rose-100 dark:border-rose-900/30">
                    <AlertCircle size={20} className="flex-shrink-0" />
                    <span>{error}</span>
                </div>
            ) : filteredCampaigns.length === 0 ? (
                <div className="text-center py-20 bg-white/40 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed">
                    <PhoneCall className="mx-auto text-slate-300 dark:text-slate-700 mb-4" size={48} />
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No hay campañas</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                        Aún no se han creado campañas con el estado seleccionado. Crea una campaña para empezar a repartir clientes.
                    </p>
                    <button
                        onClick={() => setShowWizard(true)}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Crear Campaña
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredCampaigns.map(camp => {
                        const stats = campaignStats[camp.id] || { total: 0, pending: 0, sale: 0 };
                        const total = stats.total || camp.total_clients || 0;
                        const pending = stats.pending !== undefined ? stats.pending : total;
                        const completed = total - pending;
                        const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
                        const sales = stats.sale || 0;

                        return (
                            <div
                                key={camp.id}
                                onClick={() => setSelectedCampaign(camp)}
                                className="group cursor-pointer glassmorphism bg-white/60 dark:bg-slate-900/60 hover:bg-white/90 dark:hover:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col justify-between h-[230px]"
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                                            {camp.name}
                                        </h3>
                                        {getStatusBadge(camp.status)}
                                    </div>
                                    
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2 min-h-[32px]">
                                        {camp.description || 'Sin descripción disponible.'}
                                    </p>

                                    {/* Campaign details */}
                                    <div className="grid grid-cols-2 gap-3 mt-4 text-[11px] text-slate-500 dark:text-slate-400">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar size={13} className="text-slate-400" />
                                            <span>{new Date(camp.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Users size={13} className="text-slate-400" />
                                            <span>{total} Clientes</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Progress bar and actions */}
                                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                                    <div className="flex items-center justify-between text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                                        <div className="flex items-center gap-1.5">
                                            <Clock size={12} className="text-blue-500" />
                                            <span>Progreso: {progressPercent}%</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                            <CheckCircle2 size={12} />
                                            <span>{sales} Ventas</span>
                                        </div>
                                    </div>
                                    
                                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-500" 
                                            style={{ width: `${progressPercent}%` }}
                                        />
                                    </div>

                                    {/* Quick Actions (only visible on hover/focus) */}
                                    <div className="flex items-center justify-between mt-3 pt-2">
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                            Por: {camp.created_by}
                                        </span>
                                        
                                        <div className="flex items-center gap-1">
                                            {camp.status === 'active' && (
                                                <button
                                                    onClick={(e) => handleStatusChange(camp.id, 'paused', e)}
                                                    className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 rounded-md transition-colors"
                                                    title="Pausar Campaña"
                                                >
                                                    <Pause size={14} />
                                                </button>
                                            )}
                                            {camp.status === 'paused' && (
                                                <button
                                                    onClick={(e) => handleStatusChange(camp.id, 'active', e)}
                                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-md transition-colors"
                                                    title="Reanudar Campaña"
                                                >
                                                    <Play size={14} />
                                                </button>
                                            )}
                                            {camp.status !== 'closed' && (
                                                <button
                                                    onClick={(e) => handleStatusChange(camp.id, 'closed', e)}
                                                    className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-md transition-colors"
                                                    title="Finalizar Campaña"
                                                >
                                                    <XCircle size={14} />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => handleDeleteCampaignClick(camp.id, e)}
                                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-md transition-colors"
                                                title="Eliminar Campaña"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                            <div className="p-1 text-slate-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors ml-1">
                                                <ChevronRight size={16} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Campaign Creator Wizard Modal */}
            <CampaignWizard
                isOpen={showWizard}
                onClose={() => {
                    setShowWizard(false);
                    if (onClearPreloadedClients) onClearPreloadedClients();
                }}
                customersData={customersData}
                currentUser={currentUser}
                onCampaignCreated={() => {
                    loadCampaigns();
                    if (onClearPreloadedClients) onClearPreloadedClients();
                }}
                initialSelectedClients={preloadedClients}
            />
        </div>
    );
};

export default CampaignManager;
