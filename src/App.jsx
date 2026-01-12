import React, { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import { parseExcel, cleanAlbatrossData, processRMSData, joinDatasets } from './utils/dataProcessing';
import { saveCustomersToFirestore, loadCustomersFromFirestore, clearAllData } from './utils/firestoreUtils';
import { Cloud, CloudOff, RefreshCw, Trash2 } from 'lucide-react';

function App() {
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium">
          {isProcessing ? 'Procesando datos...' : 'Cargando desde la nube...'}
        </p>
      </div>
    );
  }

  return (
    <div className="antialiased text-slate-900 bg-slate-50 min-h-screen font-sans">
      {/* Sync Status Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {syncStatus.lastSync ? (
            <>
              <Cloud size={14} className="text-emerald-500" />
              <span className="text-slate-600">
                Última sincronización: {syncStatus.lastSync.toLocaleTimeString('es-HN')}
              </span>
            </>
          ) : (
            <>
              <CloudOff size={14} className="text-slate-400" />
              <span className="text-slate-400">Sin datos en la nube</span>
            </>
          )}
          {syncStatus.error && (
            <span className="text-rose-500 ml-2">Error: {syncStatus.error}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadFromCloud}
            className="flex items-center gap-1 px-3 py-1 text-slate-600 hover:text-primary hover:bg-slate-50 rounded transition-colors"
            title="Recargar desde la nube"
          >
            <RefreshCw size={14} />
            <span>Recargar</span>
          </button>
          {data && (
            <button
              onClick={handleClearCloud}
              className="flex items-center gap-1 px-3 py-1 text-rose-600 hover:bg-rose-50 rounded transition-colors"
              title="Eliminar todos los datos de la nube"
            >
              <Trash2 size={14} />
              <span>Limpiar nube</span>
            </button>
          )}
        </div>
      </div>

      {!data ? (
        <FileUpload onFilesUploaded={handleFilesUploaded} />
      ) : (
        <Dashboard data={data} onBack={handleBack} />
      )}
    </div>
  );
}

export default App;
