import React, { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, X, ArrowRight, Zap, RefreshCw, BarChart3, Database, Calendar, CloudLightning, ShieldAlert, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLatestOrderDate } from '../utils/supabaseUtils';

const FileUpload = ({ onFilesUploaded, onAutomaticSync, currentUser, onGoToDashboard }) => {
    const [albatrossFile, setAlbatrossFile] = useState(null);
    const [rmsFile, setRmsFile] = useState(null);
    const [uploadMethod, setUploadMethod] = useState('auto'); // 'auto' | 'manual'
    const [isIncremental, setIsIncremental] = useState(false);
    const [latestDate, setLatestDate] = useState(null);
    const [loadingDate, setLoadingDate] = useState(true);
    const [isOpeningDashboard, setIsOpeningDashboard] = useState(false);
    const [message, setMessage] = useState(null);
    
    // Auto-sync states
    const [datePreset, setDatePreset] = useState('month'); // 'month' | '30' | '90' | 'custom'
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [syncProgress, setSyncProgress] = useState(null); // { step: number, text: string }
    const [isSyncing, setIsSyncing] = useState(false);

    // Allow ANY admin to upload
    const isSuperAdmin = currentUser?.role === 'admin';

    // Helper: calculate dates based on preset
    const getPresetDates = (preset) => {
        const today = new Date();
        const end = today.toISOString().split('T')[0];
        let start = '';
        if (preset === 'month') {
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            start = firstDay.toISOString().split('T')[0];
        } else if (preset === '30') {
            const past = new Date();
            past.setDate(today.getDate() - 30);
            start = past.toISOString().split('T')[0];
        } else if (preset === '90') {
            const past = new Date();
            past.setDate(today.getDate() - 90);
            start = past.toISOString().split('T')[0];
        }
        return { start, end };
    };

    // Update start/end date when preset changes
    useEffect(() => {
        if (datePreset !== 'custom') {
            const { start, end } = getPresetDates(datePreset);
            setStartDate(start);
            setEndDate(end);
        }
    }, [datePreset]);

    // Load latest date on mount
    useEffect(() => {
        const fetchLatestDate = async () => {
            const date = await getLatestOrderDate();
            setLatestDate(date);
            setLoadingDate(false);
            
            if (date) {
                setIsIncremental(true);
            }
        };
        fetchLatestDate();
    }, []);

    const handleFileChange = (e, type) => {
        const file = e.target.files[0];
        if (file) {
            if (type === 'albatross') setAlbatrossFile(file);
            else setRmsFile(file);
        }
    };

    const handleProcessManual = () => {
        if (albatrossFile && rmsFile) {
            onFilesUploaded(albatrossFile, rmsFile, isIncremental);
        }
    };

    const handleProcessAuto = async () => {
        if (!startDate || !endDate) {
            setMessage({ type: 'warning', text: 'Por favor selecciona un rango de fechas válido.' });
            return;
        }

        setIsSyncing(true);
        setMessage(null);
        setSyncProgress({ step: 1, text: "Iniciando sesión en Albatross..." });

        try {
            const result = await onAutomaticSync({
                startDate,
                endDate,
                isIncremental,
                onProgress: (progress) => {
                    setSyncProgress(progress);
                }
            });

            if (result.success) {
                setMessage({
                    type: 'success',
                    text: `¡Sincronización exitosa! Se procesaron ${result.count} clientes.`
                });
                
                const date = await getLatestOrderDate();
                setLatestDate(date);
            }
        } catch (error) {
            console.error("Auto Sync Error:", error);
            setMessage({
                type: 'error',
                text: `Error en la sincronización: ${error.message || error}`
            });
        } finally {
            setIsSyncing(false);
            setSyncProgress(null);
        }
    };

    const handleGoToDashboard = async () => {
        if (!onGoToDashboard) return;

        setIsOpeningDashboard(true);
        setMessage(null);
        try {
            const result = await onGoToDashboard();
            if (!result?.hasData) {
                setMessage({
                    type: 'warning',
                    text: 'No hay datos cargados para mostrar en el dashboard.'
                });
            }
        } catch (error) {
            setMessage({
                type: 'error',
                text: 'No se pudo abrir el dashboard en este momento.'
            });
        } finally {
            setIsOpeningDashboard(false);
        }
    };

    if (!isSuperAdmin) {
        return (
            <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/50 dark:border-slate-800 rounded-3xl p-8 shadow-2xl max-w-md mx-auto text-center">
                <div className="flex flex-col items-center justify-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-100 dark:border-amber-500/20">
                        <ShieldAlert size={32} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                            Acceso Restringido
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
                            Solo los administradores autorizados tienen permisos para realizar la sincronización de las APIs de Punto Farma o cargar archivos Excel.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full max-w-4xl mx-auto px-4">
            {/* Background Glows */}
            <div className="absolute top-[-10%] left-[-10%] w-[350px] h-[350px] bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] bg-violet-500/10 dark:bg-violet-500/5 rounded-full blur-[80px] pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.08)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-6 md:p-10 border border-white/40 dark:border-slate-800/80 relative overflow-hidden transition-all duration-300"
            >
                {/* Decoration badge */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/5 to-violet-500/5 rounded-bl-[100%] pointer-events-none" />

                {/* Header Section */}
                <div className="relative z-10 text-center mb-6">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1, duration: 0.4 }}
                        className="inline-flex items-center gap-1.5 bg-indigo-500/5 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3.5 py-1 rounded-full text-xs font-bold mb-4 shadow-sm border border-indigo-500/10 dark:border-indigo-500/20"
                    >
                        <Sparkles size={12} className="text-indigo-500 animate-pulse" />
                        <span>Sincronización Automatizada</span>
                    </motion.div>

                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
                        Consolidación y <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-violet-600 dark:from-indigo-400 dark:to-violet-400">Carga de Datos</span>
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm max-w-lg mx-auto leading-relaxed">
                        Conecta las APIs del sistema y Google Sheets de forma integrada, o sube tus archivos localmente si lo prefieres.
                    </p>
                </div>

                {/* Main Action Shortcut */}
                <div className="mb-6 flex justify-center relative z-10">
                    <button
                        onClick={handleGoToDashboard}
                        disabled={isOpeningDashboard || isSyncing}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/50 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-sm hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        <BarChart3 size={14} />
                        {isOpeningDashboard ? 'Cargando...' : 'Ver Dashboard Actual'}
                    </button>
                </div>

                {/* Status Alerts */}
                <AnimatePresence mode="wait">
                    {message && (
                        <motion.div
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className={`mb-6 text-center text-xs font-semibold px-4 py-2.5 rounded-xl max-w-md mx-auto border ${
                                message.type === 'success' ? 'bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 
                                message.type === 'error' ? 'bg-rose-500/5 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' : 
                                'bg-amber-500/5 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                            }`}
                        >
                            {message.text}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Latest Date Reference */}
                {!loadingDate && latestDate && (
                    <div className="mb-6 text-center">
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            Última fecha registrada en nube: <span className="font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md font-mono">{latestDate.toLocaleDateString('es-HN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })} 11:59 p. m.</span>
                        </p>
                    </div>
                )}

                {/* Custom Tab Selector (Glassmorphic Slider) */}
                <div className="flex justify-center mb-8 relative z-10">
                    <div className="inline-flex bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/40 dark:border-slate-800/60 w-full max-w-[340px]">
                        {[
                            { id: 'auto', label: 'Sincronizar API', icon: CloudLightning },
                            { id: 'manual', label: 'Carga Manual', icon: FileSpreadsheet }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => !isSyncing && setUploadMethod(tab.id)}
                                disabled={isSyncing}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-xs relative transition-all duration-300 disabled:opacity-50 ${
                                    uploadMethod === tab.id
                                        ? 'text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800 shadow-sm border border-slate-200/30 dark:border-slate-700/30'
                                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
                                }`}
                            >
                                <tab.icon size={13} />
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Dynamic Viewport */}
                <div className="relative z-10">
                    <AnimatePresence mode="wait">
                        {isSyncing ? (
                            <motion.div
                                key="loader"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.02 }}
                                className="flex flex-col items-center justify-center py-8 text-center"
                            >
                                <div className="relative w-16 h-16 mb-6">
                                    <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-transparent border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
                                </div>
                                <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-4">
                                    Sincronizando información en la nube
                                </h3>
                                
                                {/* Step Indicators */}
                                <div className="w-full max-w-sm bg-slate-50/50 dark:bg-slate-950/40 p-5 rounded-2xl border border-slate-200/40 dark:border-slate-850 shadow-inner">
                                    <div className="space-y-3">
                                        {[
                                            { step: 1, label: "Sesión en Albatross API" },
                                            { step: 2, label: "Descarga de órdenes Albatross" },
                                            { step: 3, label: "Catálogo de datos de contacto" },
                                            { step: 4, label: "Descarga de RMS (Google Sheets)" },
                                            { step: 5, label: "Mezcla de datos y resguardo histórico" },
                                            { step: 6, label: "Escritura en base de datos" }
                                        ].map((item) => {
                                            const isDone = syncProgress?.step > item.step || (syncProgress?.step === 7);
                                            const isActive = syncProgress?.step === item.step;
                                            
                                            return (
                                                <div key={item.step} className="flex items-center gap-2.5 text-left">
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                                                        isDone ? 'bg-emerald-500 text-white shadow-sm' :
                                                        isActive ? 'bg-indigo-600 text-white animate-pulse' :
                                                        'bg-slate-200 dark:bg-slate-850 text-slate-400 dark:text-slate-600'
                                                    }`}>
                                                        {isDone ? '✓' : item.step}
                                                    </div>
                                                    <span className={`text-xs font-semibold tracking-wide transition-all truncate max-w-[280px] ${
                                                        isDone ? 'text-slate-400 dark:text-slate-600 line-through' :
                                                        isActive ? 'text-indigo-600 dark:text-indigo-400 font-extrabold' :
                                                        'text-slate-400 dark:text-slate-500'
                                                    }`}>
                                                        {isActive ? (syncProgress.text) : item.label}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </motion.div>
                        ) : uploadMethod === 'auto' ? (
                            <motion.div
                                key="auto-sync"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-6"
                            >
                                {/* Config Row */}
                                <div className="grid md:grid-cols-2 gap-6 bg-slate-50/40 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800/80 p-5 md:p-6 rounded-2xl">
                                    
                                    {/* Date Range Config */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar size={14} className="text-indigo-500" />
                                            <span>Rango de Fecha de Sincronización</span>
                                        </h3>
                                        
                                        {/* Presets Grid */}
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {[
                                                { id: 'month', label: 'Mes Actual' },
                                                { id: '30', label: 'Últimos 30 días' },
                                                { id: '90', label: 'Últimos 90 días' },
                                                { id: 'custom', label: 'Personalizado' }
                                            ].map(preset => (
                                                <button
                                                    key={preset.id}
                                                    onClick={() => setDatePreset(preset.id)}
                                                    className={`py-1.5 rounded-lg text-[10px] md:text-xs font-bold transition-all border ${
                                                        datePreset === preset.id
                                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                            : 'bg-white dark:bg-slate-800 border-slate-200/60 dark:border-slate-700 text-slate-600 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-750'
                                                    }`}
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Date inputs */}
                                        <div className="grid grid-cols-2 gap-2.5 pt-1">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase">Inicio</span>
                                                <input
                                                    type="date"
                                                    disabled={datePreset !== 'custom'}
                                                    value={startDate}
                                                    onChange={(e) => setStartDate(e.target.value)}
                                                    className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1.5 focus:ring-indigo-500/30 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase">Fin</span>
                                                <input
                                                    type="date"
                                                    disabled={datePreset !== 'custom'}
                                                    value={endDate}
                                                    onChange={(e) => setEndDate(e.target.value)}
                                                    className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1.5 focus:ring-indigo-500/30 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* DB Operations Mode */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Database size={14} className="text-indigo-500" />
                                            <span>Método de Sincronización</span>
                                        </h3>
                                        
                                        <div className="flex flex-col gap-2.5">
                                            {[
                                                { id: false, title: "Sincronización Completa", desc: "Mezcla la nueva descarga con el histórico completo de Supabase." },
                                                { id: true, title: "Sincronización Incremental", desc: "Añade y actualiza a partir de la fecha del último pedido registrado." }
                                            ].map((mode) => (
                                                <label 
                                                    key={mode.title}
                                                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                                                        isIncremental === mode.id
                                                            ? 'border-indigo-500/30 bg-indigo-500/5 dark:bg-indigo-500/5'
                                                            : 'border-slate-200/50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                                                    }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="syncMode"
                                                        checked={isIncremental === mode.id}
                                                        onChange={() => setIsIncremental(mode.id)}
                                                        className="mt-0.5 text-indigo-650 focus:ring-indigo-500"
                                                    />
                                                    <div>
                                                        <div className="font-bold text-xs text-slate-800 dark:text-slate-250">{mode.title}</div>
                                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">{mode.desc}</div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Trigger Action */}
                                <div className="flex justify-center pt-2">
                                    <motion.button
                                        whileHover={{ scale: 1.01, translateY: -1 }}
                                        whileTap={{ scale: 0.99 }}
                                        onClick={handleProcessAuto}
                                        className="group relative px-10 py-4 rounded-xl font-bold text-sm bg-slate-900 dark:bg-slate-800 text-white cursor-pointer hover:shadow-lg hover:shadow-indigo-500/10 transition-all flex items-center gap-2.5 overflow-hidden"
                                    >
                                        <CloudLightning size={16} className="text-indigo-400 animate-pulse" />
                                        <span className="relative z-10">Iniciar Sincronización Automática</span>
                                        <ArrowRight className="relative z-10 group-hover:translate-x-0.5 transition-transform" size={16} />
                                        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/5 to-transparent z-0" />
                                    </motion.button>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="manual-upload"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-6"
                            >
                                {/* File inputs card grid */}
                                <div className="grid md:grid-cols-2 gap-6">
                                    <UploadCard
                                        title="Archivo Albatross"
                                        description="Pedidos y canales (CSV/Excel)"
                                        file={albatrossFile}
                                        onChange={(e) => handleFileChange(e, 'albatross')}
                                        onClear={() => setAlbatrossFile(null)}
                                        idx={0}
                                    />
                                    <UploadCard
                                        title="Archivo RMS"
                                        description="Facturación y códigos (CSV/Excel)"
                                        file={rmsFile}
                                        onChange={(e) => handleFileChange(e, 'rms')}
                                        onClear={() => setRmsFile(null)}
                                        idx={1}
                                    />
                                </div>

                                {/* Manual parameters */}
                                <div className="flex justify-center">
                                    <label className="flex items-center gap-2 cursor-pointer bg-slate-50/60 dark:bg-slate-950/20 px-3.5 py-2 rounded-xl border border-slate-200/50 dark:border-slate-800 shadow-sm text-xs">
                                        <input
                                            type="checkbox"
                                            checked={isIncremental}
                                            onChange={() => setIsIncremental(!isIncremental)}
                                            className="rounded text-indigo-650 focus:ring-indigo-500"
                                        />
                                        <span className="font-bold text-slate-650 dark:text-slate-350">Aplicar Carga Incremental Manual</span>
                                    </label>
                                </div>

                                {/* Trigger Action */}
                                <div className="flex justify-center">
                                    <motion.button
                                        whileHover={{ scale: 1.01, translateY: -1 }}
                                        whileTap={{ scale: 0.99 }}
                                        onClick={handleProcessManual}
                                        disabled={!albatrossFile || !rmsFile}
                                        className={`
                                            group relative px-10 py-4 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2.5 overflow-hidden
                                            ${albatrossFile && rmsFile
                                                ? 'bg-slate-900 dark:bg-slate-800 text-white cursor-pointer hover:shadow-indigo-500/20'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'}
                                        `}
                                    >
                                        <span>Procesar Archivos Cargados</span>
                                        {albatrossFile && rmsFile && <ArrowRight className="relative z-10 group-hover:translate-x-0.5 transition-transform" size={16} />}
                                        {albatrossFile && rmsFile && (
                                            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/5 to-transparent z-0" />
                                        )}
                                    </motion.button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>

            <p className="text-center text-slate-400 dark:text-slate-500 text-[10px] mt-6 font-semibold uppercase tracking-wider">
                Sincronización Encriptada y Protegida en la Nube
            </p>
        </div>
    );
};

const UploadCard = ({ title, description, file, onChange, onClear, idx }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + (idx * 0.08), duration: 0.4 }}
            className={`
                relative h-48 rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center text-center group overflow-hidden
                ${file
                    ? 'border-emerald-400/55 dark:border-emerald-500/20 bg-emerald-500/5'
                    : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400/40 hover:bg-indigo-500/5 bg-white/40 dark:bg-slate-900/40'}
            `}
        >
            <AnimatePresence mode="wait">
                {file ? (
                    <motion.div
                        key="uploaded"
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="flex flex-col items-center relative z-10 px-6 w-full"
                    >
                        <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-3 text-emerald-600 dark:text-emerald-400 shadow-sm border border-emerald-500/10">
                            <CheckCircle size={24} />
                        </div>
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-0.5 truncate w-full px-2">{file.name}</h3>
                        <p className="text-emerald-550 dark:text-emerald-400 text-[9px] font-extrabold uppercase tracking-wider">Listo</p>

                        <button
                            onClick={onClear}
                            className="absolute top-[-30px] right-[-10px] p-1 text-slate-450 hover:text-rose-500 hover:bg-rose-500/10 rounded-full transition-all"
                            title="Eliminar"
                        >
                            <X size={16} />
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="prompt"
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="flex flex-col items-center w-full h-full justify-center relative z-10 p-6"
                    >
                        <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200/50 dark:border-slate-700/60 flex items-center justify-center mb-3 text-indigo-500 dark:text-indigo-400 group-hover:scale-105 group-hover:rotate-1 transition-all duration-300">
                            <FileSpreadsheet size={24} />
                        </div>
                        <h3 className="font-bold text-slate-800 dark:text-white text-sm mb-0.5 group-hover:text-indigo-650 dark:group-hover:text-indigo-350 transition-colors">{title}</h3>
                        <p className="text-slate-400 dark:text-slate-500 text-[11px] mb-4">{description}</p>
                        <label className="cursor-pointer relative z-20">
                            <span className="px-5 py-2 rounded-lg bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-350 font-bold text-xs shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-indigo-500/30 dark:hover:border-indigo-500/20 transition-all inline-block">
                                Seleccionar Archivo
                            </span>
                            <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={onChange} />
                        </label>
                    </motion.div>
                )}
            </AnimatePresence>
            {!file && (
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/0 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            )}
        </motion.div>
    );
};

export default FileUpload;
