import React, { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import ThemeToggle from './components/ThemeToggle';
import { useTheme } from './hooks/useTheme';
import { parseExcel, cleanAlbatrossData, processRMSData, joinDatasets } from './utils/dataProcessing';
import { saveCustomersToFirestore, loadCustomersFromFirestore, clearAllData } from './utils/firestoreUtils';
import { Cloud, CloudOff, RefreshCw, Trash2, Activity } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

function App() {
  const { theme, toggleTheme } = useTheme();
  const [data, setData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    lastSync: null,
    isLoading: false,
    error: null
  });

  // Auto-load from Firestore on mount
  useEffect(() => {
    loadFromCloud();
  }, []);

  const loadFromCloud = async () => {
    setSyncStatus(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const result = await loadCustomersFromFirestore();
      if (result.success && result.customers.length > 0) {
        // Transform customers back to the expected data format
        setData(result.customers);
        setSyncStatus({
          lastSync: result.timestamp,
          isLoading: false,
          error: null
        });
        console.log(`Loaded ${result.count} customers from cloud`);
      } else {
        setSyncStatus(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('Error loading from cloud:', error);
      setSyncStatus({
        lastSync: null,
        isLoading: false,
        error: error.message
      });
    }
  };

  const saveToCloud = async (processedData) => {
    try {
      const result = await saveCustomersToFirestore(processedData);
      if (result.success) {
        setSyncStatus({
          lastSync: result.timestamp,
          isLoading: false,
          error: null
        });
        console.log(`Saved ${result.count} customers to cloud`);
      }
    } catch (error) {
      console.error('Error saving to cloud:', error);
      setSyncStatus(prev => ({
        ...prev,
        error: error.message
      }));
    }
  };

  const handleClearCloud = async () => {
    if (!confirm('¿Estás seguro de que quieres eliminar TODOS los datos de la nube? Esta acción no se puede deshacer.')) {
      return;
    }

    setSyncStatus(prev => ({ ...prev, isLoading: true }));
    try {
      const result = await clearAllData();
      if (result.success) {
        setData(null);
        setSyncStatus({
          lastSync: null,
          isLoading: false,
          error: null
        });
        alert(`Eliminados ${result.deletedCount} registros correctamente.`);
      }
    } catch (error) {
      console.error('Error clearing cloud data:', error);
      setSyncStatus(prev => ({
        ...prev,
        isLoading: false,
        error: error.message
      }));
      alert('Error al eliminar datos: ' + error.message);
    }
  };

  const handleFilesUploaded = async (albatrossFile, rmsFile) => {
    setIsProcessing(true);
    try {
      console.log('Starting file processing...');

      // 1. Parse Files
      const rawAlbatross = await parseExcel(albatrossFile);
      const rawRMS = await parseExcel(rmsFile);
      console.log('Files parsed successfully');

      // 2. Clean Albatross
      const cleanedAlbatross = cleanAlbatrossData(rawAlbatross);
      console.log('Albatross data cleaned');

      // 3. Process RMS (Group by Order ID)
      const processedRMS = processRMSData(rawRMS);
      console.log('RMS data processed');

      // 4. Join Data
      const finalData = joinDatasets(cleanedAlbatross, processedRMS);
      console.log('Data joined successfully. Total records:', finalData.length);

      // Set data immediately (don't wait for cloud save)
      setData(finalData);

      // 5. Save to Firestore in background (non-blocking)
      saveToCloud(finalData).catch(error => {
        console.warn('Cloud save failed (non-critical):', error);
        // Don't block UI - just update sync status
        setSyncStatus(prev => ({
          ...prev,
          error: 'No se pudo guardar en la nube: ' + error.message
        }));
      });

    } catch (error) {
      console.error("Error processing files:", error);
      alert("Hubo un error al procesar los archivos. Revisa la consola para más detalles.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBack = () => {
    setData(null);
  };

  if (isProcessing || syncStatus.isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 relative overflow-hidden transition-colors duration-500">
        {/* Abstract Background */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-200/30 dark:bg-indigo-900/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-200/30 dark:bg-violet-900/20 rounded-full blur-3xl animate-pulse delay-700"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-20 h-20 border-4 border-indigo-100 dark:border-slate-800 border-t-indigo-600 dark:border-t-indigo-500 rounded-full animate-spin mb-6 shadow-xl"></div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            {isProcessing ? 'Procesando tus datos' : 'Sincronizando con la nube'}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm animate-pulse">
            Esto puede tomar unos segundos...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="antialiased text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 min-h-screen font-sans relative selection:bg-indigo-500 selection:text-white transition-colors duration-500">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[70rem] h-[70rem] bg-indigo-100/40 dark:bg-indigo-950/20 rounded-full blur-[100px] opacity-60 transition-colors duration-500"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60rem] h-[60rem] bg-violet-100/40 dark:bg-violet-950/20 rounded-full blur-[100px] opacity-60 transition-colors duration-500"></div>
      </div>

      {/* Glass Header / Sync Status */}
      <header className="fixed top-0 w-full z-40 px-6 py-4 pointer-events-none">
        <div className="max-w-[1920px] mx-auto flex justify-end">
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center gap-4 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/50 dark:border-slate-800 shadow-sm px-2 py-1.5 pr-4 rounded-full pointer-events-auto transition-colors duration-500"
          >
            {/* Theme Toggle */}
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

            <div className="flex items-center gap-2 px-3 border-l border-r border-slate-200/60 dark:border-slate-700/60">
              {syncStatus.lastSync ? (
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase">
                  <Cloud size={12} strokeWidth={3} />
                  <span>Sincronizado</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase">
                  <CloudOff size={12} strokeWidth={3} />
                  <span>Offline</span>
                </div>
              )}

              {syncStatus.lastSync && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  {syncStatus.lastSync.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={loadFromCloud}
                className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                title="Recargar desde la nube"
              >
                <RefreshCw size={14} />
              </button>

              {data && (
                <button
                  onClick={handleClearCloud}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-full transition-colors"
                  title="Eliminar datos"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 min-h-screen pt-20 pb-10 px-6">
        <AnimatePresence mode="wait">
          {!data ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="h-[80vh] flex items-center justify-center"
            >
              <FileUpload onFilesUploaded={handleFilesUploaded} />
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <Dashboard data={data} onBack={handleBack} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default App;
