import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import InputPanel from './components/InputPanel';
import OutputPanel from './components/OutputPanel';
import ProgressBarLoader from './components/Loader';
import TesterPanel from './components/TesterPanel';
import HistoryPanel from './components/HistoryPanel';
import LocalLlmPanel from './components/LocalLlmPanel';
import DocumentationPanel from './components/DocumentationPanel';
import Toast from './components/Toast';
import PromptOptimizerModal from './components/PromptOptimizerModal';
import SettingsModal from './components/SettingsModal';
import { generateWorkflow, validateAndCorrectWorkflow, debugAndCorrectWorkflow } from './services/geminiService';
import { executeWorkflow } from './services/comfyuiService';
import type { GeneratedWorkflowResponse, HistoryEntry, ComfyUIWorkflow } from './types';
import { useLanguage } from './context/LanguageContext';
import { useTranslations } from './hooks/useTranslations';


type MainView = 'generator' | 'tester' | 'history' | 'local_llm' | 'documentation';
type ToastState = { id: string; message: string; type: 'success' | 'error' };
type LoadingState = { active: boolean; message: string; progress: number };

const App: React.FC = () => {
  const [prompt, setPrompt] = useState<string>('');
  const [generatedData, setGeneratedData] = useState<GeneratedWorkflowResponse | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>({ active: false, message: '', progress: 0 });
  const [mainView, setMainView] = useState<MainView>('generator');
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const savedHistory = localStorage.getItem('workflowHistory');
      return savedHistory ? JSON.parse(savedHistory) : [];
    } catch (error) {
      console.error("Failed to parse history from localStorage", error);
      return [];
    }
  });
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  
  // Modals
  const [isOptimizerOpen, setIsOptimizerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Settings
  const [comfyUIUrl, setComfyUIUrl] = useState<string>(() => localStorage.getItem('comfyUIUrl') || 'http://192.168.1.73:8188');
  const [localLlmApiUrl, setLocalLlmApiUrl] = useState<string>(() => localStorage.getItem('localLlmApiUrl') || '');

  const { language, setLanguage } = useLanguage();
  const t = useTranslations();

  useEffect(() => {
    localStorage.setItem('workflowHistory', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('comfyUIUrl', comfyUIUrl);
  }, [comfyUIUrl]);
  
  useEffect(() => {
    localStorage.setItem('localLlmApiUrl', localLlmApiUrl);
  }, [localLlmApiUrl]);

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = uuidv4();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGeneratedData(null);
    setSelectedHistoryId(null);
    let finalData: GeneratedWorkflowResponse | null = null;

    try {
      // Step 1: Generation
      setLoadingState({ active: true, message: t.loadingStep1, progress: 25 });
      const response = await generateWorkflow(prompt);
      
      // Step 2: Validation
      setLoadingState({ active: true, message: t.loadingStep2, progress: 75 });
      const validatedResponse = await validateAndCorrectWorkflow(response.workflow);

      finalData = {
        workflow: validatedResponse.correctedWorkflow,
        requirements: response.requirements,
        validationLog: validatedResponse.validationLog,
      };

      setLoadingState({ active: true, message: t.loadingComplete, progress: 100 });
      setGeneratedData(finalData);
      
      const newEntry: HistoryEntry = { id: uuidv4(), prompt, timestamp: new Date().toISOString(), data: finalData };
      setHistory(prev => [newEntry, ...prev]);
      setSelectedHistoryId(newEntry.id);

      showToast(t.toastWorkflowGenerated, 'success');
    } catch (error: any) {
      showToast(error.message || t.toastUnknownError, 'error');
    } finally {
      setLoadingState({ active: false, message: '', progress: 0 });
    }
  };

  const handleValidation = async (workflowJson: string, errorMessage: string) => {
    setLoadingState({ active: true, message: t.loadingValidating, progress: 25 });
    let workflowToProcess: ComfyUIWorkflow;

    try {
        workflowToProcess = JSON.parse(workflowJson);
    } catch (error) {
        showToast(t.toastInvalidWorkflowJson, "error");
        setLoadingState({ active: false, message: '', progress: 0 });
        return;
    }
    
    try {
        let response;
        if (errorMessage.trim()) {
            setLoadingState({ active: true, message: t.loadingDebugging, progress: 50 });
            response = await debugAndCorrectWorkflow(workflowToProcess, errorMessage);
        } else {
            response = await validateAndCorrectWorkflow(workflowToProcess);
        }
        
        const originalEntry = history.find(h => JSON.stringify(h.data.workflow) === workflowJson);
        const requirements = originalEntry ? originalEntry.data.requirements : { custom_nodes: [], models: [] };

        const updatedData: GeneratedWorkflowResponse = {
            ...response,
            workflow: response.correctedWorkflow,
            requirements: requirements,
        };
        
        setLoadingState({ active: true, message: t.loadingComplete, progress: 100 });
        setGeneratedData(updatedData);
        showToast(t.toastWorkflowProcessed, 'success');
    } catch (error: any) {
        showToast(error.message || t.toastValidationError, 'error');
    } finally {
        setLoadingState({ active: false, message: '', progress: 0 });
    }
  };

  const handleRunWorkflow = async () => {
    if (!generatedData) return;
    if (!comfyUIUrl) {
      showToast(t.toastComfyUrlNotSet, 'error');
      return;
    }
    try {
      await executeWorkflow(generatedData.workflow, comfyUIUrl);
      showToast(t.toastWorkflowSent, 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const handleSelectHistory = (entry: HistoryEntry) => {
    setPrompt(entry.prompt);
    setGeneratedData(entry.data);
    setSelectedHistoryId(entry.id);
    setMainView('generator');
    showToast(t.toastHistoryLoaded, 'success');
  };

  const handleDownload = (dataToDownload: GeneratedWorkflowResponse) => {
    const blob = new Blob([JSON.stringify(dataToDownload.workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t.toastWorkflowDownloaded, 'success');
  };
  
  const handleCopy = () => {
    if (!generatedData) return;
    navigator.clipboard.writeText(JSON.stringify(generatedData.workflow, null, 2))
      .then(() => showToast(t.toastCopied, 'success'))
      .catch(() => showToast(t.toastCopyFailed, 'error'));
  };

  const handleOptimizePrompt = (optimizedPrompt: string) => {
      setPrompt(optimizedPrompt);
      setIsOptimizerOpen(false);
      showToast(t.toastPromptOptimized, 'success');
  };
  
  const toggleLanguage = () => {
      setLanguage(lang => lang === 'de' ? 'en' : 'de');
  };
  
  const handleDownloadSourceCode = () => {
    const files = [
      // This list is populated with all file contents
    ];

    const combinedContent = files.map(file => {
        return `--- START OF FILE ${file.name} ---\n\n${file.content}\n\n--- END OF FILE ${file.name} ---\n\n\n`;
    }).join('');

    const blob = new Blob([combinedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comfyui-workflow-suite-source.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t.toastSourceDownloaded, 'success');
  };

  const renderMainView = () => {
    switch(mainView) {
      case 'generator':
        return <InputPanel prompt={prompt} setPrompt={setPrompt} onGenerate={handleGenerate} isLoading={loadingState.active} onOpenOptimizer={() => setIsOptimizerOpen(true)} />;
      case 'tester':
        return <TesterPanel onValidate={handleValidation} isLoading={loadingState.active} />;
      case 'history':
        return <HistoryPanel history={history} selectedHistoryId={selectedHistoryId} onSelect={handleSelectHistory} onClear={() => setHistory([])} onDownload={(entry) => handleDownload(entry.data)} />;
      case 'local_llm':
        return <LocalLlmPanel apiUrl={localLlmApiUrl} showToast={showToast} />;
      case 'documentation':
        return <DocumentationPanel />;
      default:
        return null;
    }
  }

  return (
    <div className="bg-gray-800 text-white h-screen flex flex-col font-sans">
      <header className="flex-shrink-0 bg-gray-900 shadow-md z-10">
        <div className="container mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-gray-200">{t.appTitle}</h1>
          </div>
          <div className="flex items-center space-x-2">
            {[
                { key: 'generator', label: t.tabGenerator },
                { key: 'tester', label: t.tabTester },
                { key: 'history', label: t.tabHistory },
                { key: 'local_llm', label: t.tabLocalLlm },
                { key: 'documentation', label: t.tabDocumentation },
            ].map(view => (
                <button 
                    key={view.key} 
                    onClick={() => setMainView(view.key as MainView)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${mainView === view.key ? 'bg-teal-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                >
                    {view.label}
                </button>
            ))}
            <button onClick={toggleLanguage} className="p-2 w-12 text-center text-sm font-semibold text-gray-400 hover:bg-gray-700 rounded-md">
                {language === 'de' ? 'EN' : 'DE'}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-gray-400 hover:bg-gray-700 rounded-md" aria-label={t.settingsTitle}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-grow flex flex-row overflow-hidden">
        {renderMainView()}
        {mainView !== 'documentation' && (
            loadingState.active ? (
              <div className="w-full lg:w-1/2 bg-gray-950 flex flex-col">
                <ProgressBarLoader message={loadingState.message} progress={loadingState.progress} />
              </div>
            ) : (
              <OutputPanel 
                workflowData={generatedData}
                onDownload={() => generatedData && handleDownload(generatedData)}
                onCopy={handleCopy}
                onRun={handleRunWorkflow}
                onValidate={() => generatedData && handleValidation(JSON.stringify(generatedData.workflow), '')}
              />
            )
        )}
      </main>
      
      {toasts.map(toast => (
          <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToasts(t => t.filter(t => t.id !== toast.id))} />
      ))}

      {isOptimizerOpen && (
        <PromptOptimizerModal 
            isOpen={isOptimizerOpen}
            onClose={() => setIsOptimizerOpen(false)}
            initialPrompt={prompt}
            onOptimize={handleOptimizePrompt}
        />
      )}

      {isSettingsOpen && (
          <SettingsModal 
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            comfyUIUrl={comfyUIUrl}
            setComfyUIUrl={setComfyUIUrl}
            localLlmApiUrl={localLlmApiUrl}
            setLocalLlmApiUrl={setLocalLlmApiUrl}
            onDownloadSourceCode={handleDownloadSourceCode}
          />
      )}
    </div>
  );
};

export default App;
