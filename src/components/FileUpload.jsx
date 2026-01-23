import React, { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, X, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLatestOrderDate } from '../utils/firestoreUtils';

const FileUpload = ({ onFilesUploaded }) => {
    const [albatrossFile, setAlbatrossFile] = useState(null);
    const [rmsFile, setRmsFile] = useState(null);
    const [isIncremental, setIsIncremental] = useState(false);
    const [latestDate, setLatestDate] = useState(null);
    const [loadingDate, setLoadingDate] = useState(true);

    // Load latest date on mount
    useEffect(() => {
        const fetchLatestDate = async () => {
            const date = await getLatestOrderDate();
            setLatestDate(date);
            setLoadingDate(false);
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

    const handleProcess = () => {
        if (albatrossFile && rmsFile) {
            onFilesUploaded(albatrossFile, rmsFile, isIncremental);
        }
    };

    return (
        <div className="relative w-full max-w-5xl mx-auto px-6">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-indigo-500/10 dark:shadow-black/50 p-12 border border-white/50 dark:border-slate-800 relative overflow-hidden transition-colors duration-300"
            >
                {/* Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 rounded-bl-[100%] -mr-10 -mt-10 z-0 opacity-50" />

                <div className="relative z-10 text-center mb-12">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-4 py-1.5 rounded-full text-sm font-semibold mb-6 shadow-sm border border-indigo-100 dark:border-indigo-500/20"
                    >
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        v2.0 Dashboard Nuevo
                    </motion.div>

                    <h1 className="text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4">
                        Reporte de <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400">Frecuencia y Recurrencia</span>
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
                        Sube tus archivos de datos para generar visualizaciones avanzadas sobre el comportamiento de tus clientes.
                    </p>
                </div>

                {/* Upload Mode Selector */}
                <div className="mb-8 flex justify-center">
                    <div className="inline-flex items-center gap-4 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-3 border border-slate-200 dark:border-slate-700">
                        <button
                            onClick={() => setIsIncremental(false)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${!isIncremental
                                ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-lg'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                }`}
                        >
                            <RefreshCw size={18} />
                            Carga Completa
                        </button>
                        <button
                            onClick={() => setIsIncremental(true)}
                            disabled={!latestDate}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${isIncremental
                                ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-lg'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed'
                                }`}
                        >
                            <Zap size={18} />
                            Carga Incremental
                        </button>
                    </div>
                </div>

                {/* Latest Date Info */}
                {isIncremental && latestDate && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8 text-center"
                    >
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            <span className="font-semibold">Último registro:</span> <span className="font-bold text-indigo-600 dark:text-indigo-400">{latestDate.toLocaleDateString('es-HN', { year: 'numeric', month: 'long', day: 'numeric' })} a las {latestDate.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}</span>
                            <br />
                            <span className="text-xs mt-1 inline-block">Se subirán solo pedidos posteriores a esta fecha</span>
                        </p>
                    </motion.div>
                )}

                <div className="grid md:grid-cols-2 gap-8 mb-12">
                    {/* Albatross Upload */}
                    <UploadCard
                        title="Archivo Albatross"
                        description="Reporte de pedidos (CSV/Excel)"
                        file={albatrossFile}
                        onChange={(e) => handleFileChange(e, 'albatross')}
                        onClear={() => setAlbatrossFile(null)}
                        idx={0}
                    />

                    {/* RMS Upload */}
                    <UploadCard
                        title="Archivo RMS"
                        description="Detalle de facturación (CSV/Excel)"
                        file={rmsFile}
                        onChange={(e) => handleFileChange(e, 'rms')}
                        onClear={() => setRmsFile(null)}
                        idx={1}
                    />
                </div>

                <div className="flex justify-center">
                    <motion.button
                        whileHover={{ scale: 1.02, translateY: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleProcess}
                        disabled={!albatrossFile || !rmsFile}
                        className={`
                            group relative px-12 py-5 rounded-2xl font-bold text-lg shadow-xl shadow-indigo-500/20 transition-all flex items-center gap-3 overflow-hidden
                            ${albatrossFile && rmsFile
                                ? 'bg-slate-900 dark:bg-slate-800 text-white cursor-pointer hover:shadow-indigo-500/40'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'}
                        `}
                    >
                        <span className="relative z-10">{isIncremental ? 'Actualizar Datos' : 'Procesar Información'}</span>
                        {albatrossFile && rmsFile && <ArrowRight className="relative z-10 group-hover:translate-x-1 transition-transform" size={20} />}

                        {/* Button Shine Effect */}
                        {albatrossFile && rmsFile && (
                            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent z-0" />
                        )}
                    </motion.button>
                </div>
            </motion.div>

            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-center text-slate-400 dark:text-slate-500 text-xs mt-8 font-medium"
            >
                Seguro • Privado • Procesamiento Local
            </motion.p>
        </div>
    );
};

const UploadCard = ({ title, description, file, onChange, onClear, idx }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + (idx * 0.1), duration: 0.5 }}
            className={`
                relative h-64 rounded-3xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center text-center group overflow-hidden
                ${file
                    ? 'border-emerald-400/50 dark:border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-500/10'
                    : 'border-slate-200 dark:border-slate-700 hover:border-indigo-400/50 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 bg-white/50 dark:bg-slate-800/50'}
            `}
        >
            <AnimatePresence mode="wait">
                {file ? (
                    <motion.div
                        key="file-uploaded"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex flex-col items-center relative z-10 px-8 w-full"
                    >
                        <motion.div
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className="w-20 h-20 bg-emerald-100 dark:bg-emerald-500/20 rounded-[2rem] flex items-center justify-center mb-4 text-emerald-600 dark:text-emerald-400 shadow-sm"
                        >
                            <CheckCircle size={36} strokeWidth={2.5} />
                        </motion.div>
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg mb-1 truncate w-full p-2">{file.name}</h3>
                        <p className="text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wide bg-emerald-100/50 dark:bg-emerald-500/20 px-3 py-1 rounded-full">Listo para procesar</p>

                        <button
                            onClick={onClear}
                            className="absolute -top-12 -right-2 p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-full transition-all"
                            title="Eliminar archivo"
                        >
                            <X size={20} />
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="upload-prompt"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="flex flex-col items-center w-full h-full justify-center relative z-10 p-8"
                    >
                        <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center mb-5 text-indigo-500 dark:text-indigo-400 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                            <FileSpreadsheet size={36} strokeWidth={1.5} />
                        </div>
                        <h3 className="font-bold text-slate-800 dark:text-white text-xl mb-2 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">{title}</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 leading-snug">{description}</p>
                        <label className="cursor-pointer relative z-20">
                            <span className="px-8 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-indigo-200 dark:hover:border-indigo-500/50 transition-all inline-block">
                                Seleccionar Archivo
                            </span>
                            <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={onChange} />
                        </label>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Background Hover Effect */}
            {!file && (
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-50/0 via-indigo-50/0 to-indigo-50/50 dark:to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            )}
        </motion.div>
    );
};

export default FileUpload;
