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
import WorkflowWizardModal from './components/WorkflowWizardModal';
import SettingsModal from './components/SettingsModal';
import ApiKeyModal from './components/ApiKeyModal';
import { generateWorkflow, validateAndCorrectWorkflow, debugAndCorrectWorkflow } from './services/geminiService';
import { executeWorkflow } from './services/comfyuiService';
import { initializeApiKey, saveApiKey } from './services/apiKeyService';
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
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  // State
  const [isApiKeySet, setIsApiKeySet] = useState(false);

  // Settings
  const [comfyUIUrl, setComfyUIUrl] = useState<string>(() => localStorage.getItem('comfyUIUrl') || 'http://192.168.1.73:8188');
  const [localLlmApiUrl, setLocalLlmApiUrl] = useState<string>(() => localStorage.getItem('localLlmApiUrl') || '');

  const { language, setLanguage } = useLanguage();
  const t = useTranslations();

  useEffect(() => {
    const keyIsInitialized = initializeApiKey();
    if (keyIsInitialized) {
      setIsApiKeySet(true);
    } else {
      setIsApiKeyModalOpen(true);
    }
  }, []);

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

  const handleSaveApiKey = (apiKey: string) => {
    try {
      saveApiKey(apiKey);
      const keyIsInitialized = initializeApiKey();
      if (keyIsInitialized) {
        setIsApiKeySet(true);
        setIsApiKeyModalOpen(false);
        showToast(t.apiKeySetSuccess, 'success');
      } else {
        throw new Error("Key was saved but could not be initialized.");
      }
    } catch (error) {
      console.error(error);
      showToast(t.apiKeySetError, 'error');
    }
  };

  const ensureApiKey = (): boolean => {
    if (!isApiKeySet) {
        setIsApiKeyModalOpen(true);
        return false;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!ensureApiKey() || !prompt.trim()) return;
    setGeneratedData(null);
    setSelectedHistoryId(null);
    let finalData: GeneratedWorkflowResponse | null = null;

    try {
      // Step 1: Generation
      setLoadingState({ active: true, message: t.loadingStep1, progress: 25 });
      const response = await generateWorkflow(prompt, localLlmApiUrl);
      
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
    if (!ensureApiKey()) return;
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

  const handleLoadWorkflow = () => {
    if (!generatedData) return;
    navigator.clipboard.writeText(JSON.stringify(generatedData.workflow, null, 2))
      .then(() => showToast(t.toastWorkflowPasted, 'success'))
      .catch(() => showToast(t.toastCopyFailed, 'error'));
  };

  const handleOptimizePrompt = (optimizedPrompt: string) => {
      setPrompt(optimizedPrompt);
      setIsOptimizerOpen(false);
      showToast(t.toastPromptOptimized, 'success');
  };

  const handleWizardComplete = (technicalPrompt: string) => {
    setPrompt(technicalPrompt);
    setIsWizardOpen(false);
    showToast(t.toastWizardPromptGenerated, 'success');
  };
  
  const toggleLanguage = () => {
      setLanguage(lang => lang === 'de' ? 'en' : 'de');
  };
  
  const handleDownloadSourceCode = async () => {
    const filePaths = [
        'index.html', 'index.tsx', 'metadata.json', 'App.tsx', 'types.ts', 'translations.ts',
        'context/LanguageContext.tsx',
        'hooks/useTranslations.ts',
        'services/comfyuiService.ts', 'services/geminiService.ts', 'services/localLlmService.ts', 'services/apiKeyService.ts',
        'components/ApiKeyModal.tsx', 'components/DocumentationPanel.tsx', 'components/HistoryPanel.tsx', 'components/Icons.tsx', 'components/InputPanel.tsx', 'components/Loader.tsx',
        'components/LocalLlmPanel.tsx', 'components/NodeDetailModal.tsx', 'components/OutputPanel.tsx', 'components/PromptOptimizerModal.tsx',
        'components/SettingsModal.tsx', 'components/TesterPanel.tsx', 'components/Toast.tsx', 'components/WorkflowVisualizer.tsx', 'components/WorkflowWizardModal.tsx',
        'public/Bedienungsanleitung.md', 'public/UserManual.md'
    ];

    let combinedContent = '';

    for (const path of filePaths) {
        try {
            const response = await fetch('/' + path);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const content = await response.text();
            combinedContent += `--- START OF FILE ${path} ---\n\n${content}\n\n--- END OF FILE ${path} ---\n\n\n`;
        } catch (error) {
            console.error(`Failed to fetch ${path}:`, error);
            combinedContent += `--- START OF FILE ${path} ---\n\n[Could not load file content]\n\n--- END OF FILE ${path} ---\n\n\n`;
        }
    }
    
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
        return <InputPanel prompt={prompt} setPrompt={setPrompt} onGenerate={handleGenerate} isLoading={loadingState.active} onOpenOptimizer={() => { if(ensureApiKey()) setIsOptimizerOpen(true); }} onOpenWizard={() => { if(ensureApiKey()) setIsWizardOpen(true); }} />;
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
    <>
      <ApiKeyModal isOpen={isApiKeyModalOpen} onSave={handleSaveApiKey} />
      <div className={`text-white h-screen flex flex-col font-sans p-4 gap-4 ${isApiKeyModalOpen ? 'filter blur-sm pointer-events-none' : ''}`}>
        <header className="flex-shrink-0 glass-panel rounded-2xl shadow-lg z-10">
          <div className="container mx-auto px-6 py-3 flex justify-between items-center">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-100">{t.appTitle}</h1>
            </div>
            <div className="flex items-center space-x-2 bg-black/20 p-1 rounded-full">
              {[
                  { key: 'generator', label: t.tabGenerator },
                  { key: 'tester', label: t.tabTester },
                  { key: 'history', label: t.tabHistory },
                  { key: 'local_llm', label: t.tabLocalLlm },
                  { key: 'documentation', label: t.tabDocumentation },
              ].map(tab => (
                  <button
                      key={tab.key}
                      onClick={() => setMainView(tab.key as MainView)}
                      className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-300 ${
                          mainView === tab.key ? 'bg-sky-500/80 text-white shadow-sm' : 'text-gray-300 hover:bg-white/10'
                      }`}
                  >
                      {tab.label}
                  </button>
              ))}
            </div>
            <div className="flex items-center space-x-4">
                <button onClick={toggleLanguage} className="px-3 py-1.5 text-sm bg-white/10 text-gray-300 rounded-full hover:bg-white/20 transition-colors">
                    {language.toUpperCase()}
                </button>
                <button onClick={() => setIsSettingsOpen(true)} className="text-gray-400 hover:text-white transition-colors" title={t.settingsTitle}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </button>
            </div>
          </div>
        </header>

        <main className="flex-grow flex gap-4 overflow-hidden">
          {loadingState.active ? (
            <div className="w-full lg:w-1/2 glass-panel rounded-2xl flex items-center justify-center">
              <ProgressBarLoader message={loadingState.message} progress={loadingState.progress} />
            </div>
          ) : (
            renderMainView()
          )}
          
          <OutputPanel
            workflowData={generatedData}
            onDownload={() => generatedData && handleDownload(generatedData)}
            onCopy={handleCopy}
            onRun={handleRunWorkflow}
            onValidate={() => generatedData && handleValidation(JSON.stringify(generatedData.workflow), '')}
            onLoad={handleLoadWorkflow}
          />
        </main>
        
        {toasts.map(toast => (
            <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToasts(ts => ts.filter(t => t.id !== toast.id))} />
        ))}
        
        <PromptOptimizerModal isOpen={isOptimizerOpen} onClose={() => setIsOptimizerOpen(false)} initialPrompt={prompt} onOptimize={handleOptimizePrompt} />
        <WorkflowWizardModal isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} onComplete={handleWizardComplete} />
        <SettingsModal 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)}
            comfyUIUrl={comfyUIUrl}
            setComfyUIUrl={setComfyUIUrl}
            localLlmApiUrl={localLlmApiUrl}
            setLocalLlmApiUrl={setLocalLlmApiUrl}
            onDownloadSourceCode={handleDownloadSourceCode}
        />
      </div>
    </>
  );
};

export default App;
