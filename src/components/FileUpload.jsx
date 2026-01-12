import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FileUpload = ({ onFilesUploaded }) => {
    const [albatrossFile, setAlbatrossFile] = useState(null);
    const [rmsFile, setRmsFile] = useState(null);

    const handleFileChange = (e, type) => {
        const file = e.target.files[0];
        if (file) {
            if (type === 'albatross') setAlbatrossFile(file);
            else setRmsFile(file);
        }
    };

    const handleProcess = () => {
        if (albatrossFile && rmsFile) {
            onFilesUploaded(albatrossFile, rmsFile);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-4xl w-full bg-white rounded-3xl shadow-xl p-12 border border-slate-100"
            >
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-indigo-600 bg-clip-text text-transparent mb-4">
                        Análisis de Frecuencia de Compra
                    </h1>
                    <p className="text-slate-500 text-lg">
                        Sube los archivos de Albatross y RMS para comenzar el análisis.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 mb-10">
                    {/* Albatross Upload */}
                    <UploadCard
                        title="Archivo Albatross"
                        description="Reporte de pedidos (CSV/Excel)"
                        file={albatrossFile}
                        onChange={(e) => handleFileChange(e, 'albatross')}
                        onClear={() => setAlbatrossFile(null)}
                    />

                    {/* RMS Upload */}
                    <UploadCard
                        title="Archivo RMS"
                        description="Detalle de facturación (CSV/Excel)"
                        file={rmsFile}
                        onChange={(e) => handleFileChange(e, 'rms')}
                        onClear={() => setRmsFile(null)}
                    />
                </div>

                <div className="flex justify-center">
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleProcess}
                        disabled={!albatrossFile || !rmsFile}
                        className={`
              px-10 py-4 rounded-full font-bold text-lg shadow-lg transition-all
              ${albatrossFile && rmsFile
                                ? 'bg-gradient-to-r from-primary to-indigo-600 text-white cursor-pointer shadow-indigo-200'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
            `}
                    >
                        Procesar Datos
                    </motion.button>
                </div>
            </motion.div>
        </div>
    );
};

const UploadCard = ({ title, description, file, onChange, onClear }) => {
    return (
        <div className={`
      relative rounded-2xl border-2 border-dashed transition-all p-8 flex flex-col items-center text-center group
      ${file ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200 hover:border-primary hover:bg-slate-50'}
    `}>
            <AnimatePresence>
                {file ? (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="flex flex-col items-center"
                    >
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4 text-emerald-600">
                            <CheckCircle size={32} />
                        </div>
                        <h3 className="font-semibold text-slate-800 text-lg mb-1 truncate max-w-[250px]">{file.name}</h3>
                        <p className="text-emerald-600 text-sm font-medium">Archivo cargado correctamente</p>
                        <button
                            onClick={onClear}
                            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-500 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </motion.div>
                ) : (
                    <div className="flex flex-col items-center w-full h-full justify-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400 group-hover:text-primary group-hover:bg-indigo-50 transition-colors">
                            <FileSpreadsheet size={32} />
                        </div>
                        <h3 className="font-semibold text-slate-800 text-lg mb-2">{title}</h3>
                        <p className="text-slate-500 text-sm mb-6">{description}</p>
                        <label className="cursor-pointer">
                            <span className="px-6 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-medium shadow-sm hover:shadow-md hover:border-primary/30 transition-all">
                                Seleccionar Archivo
                            </span>
                            <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={onChange} />
                        </label>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default FileUpload;
