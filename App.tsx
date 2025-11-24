

import React, { useState, useEffect, useCallback } from 'react';
// FIX: Corrected import alias for uuid v4 to match usage.
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
// ApiKeyModal is no longer needed as we use .env
import { generateWorkflow, validateAndCorrectWorkflow, debugAndCorrectWorkflow } from './services/geminiService';
import { executeWorkflow, uploadImage, validateWorkflowAgainstApi } from './services/comfyuiService';
import { getServerInventory, generateWorkflowLocal, validateAndCorrectWorkflowLocal, debugAndCorrectWorkflowLocal } from './services/localLlmService';
import { initializeApiKey } from './services/apiKeyService';
import type { GeneratedWorkflowResponse, HistoryEntry, ComfyUIWorkflow, SystemInventory, LlmProvider, WorkflowFormat } from './types';
import { useLanguage } from './context/LanguageContext';
import { useTranslations } from './hooks/useTranslations';

const version = "1.3.5";

type MainView = 'generator' | 'tester' | 'history' | 'local_llm' | 'documentation';
type ToastState = { id: string; message: string; type: 'success' | 'error' };
type LoadingState = { active: boolean; message: string; progress: number };


const App: React.FC = () => {
  const [prompt, setPrompt] = useState<string>('');
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [generatedData, setGeneratedData] = useState<GeneratedWorkflowResponse | null>(null);
  const [workflowFormat, setWorkflowFormat] = useState<WorkflowFormat>('graph'); // Default to graph
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
  const [lastRunSuccess, setLastRunSuccess] = useState<boolean>(false); // Track execution success for feedback loop
  
  // Modals
  const [isOptimizerOpen, setIsOptimizerOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // State
  const [isApiKeySet, setIsApiKeySet] = useState(false);
  const [inventory, setInventory] = useState<SystemInventory | null>(null);

  // Settings
  const [comfyUIUrl, setComfyUIUrl] = useState<string>(() => localStorage.getItem('comfyUIUrl') || 'http://127.0.0.1:8188');
  const [localLlmApiUrl, setLocalLlmApiUrl] = useState<string>(() => localStorage.getItem('localLlmApiUrl') || 'http://127.0.0.1:11434');
  const [ragApiUrl, setRagApiUrl] = useState<string>(() => localStorage.getItem('ragApiUrl') || 'http://127.0.0.1:8000');
  const [llmProvider, setLlmProvider] = useState<LlmProvider>(() => (localStorage.getItem('llmProvider') as LlmProvider) || 'gemini');
  const [localLlmModel, setLocalLlmModel] = useState<string>(() => localStorage.getItem('localLlmModel') || 'llama3.1:latest');

  const { language, setLanguage } = useLanguage();
  const t = useTranslations();

  useEffect(() => {
    // Initialize key from .env file (VITE_API_KEY)
    const keyIsInitialized = initializeApiKey();
    if (keyIsInitialized) {
      setIsApiKeySet(true);
    } else {
      setIsApiKeySet(false);
      // Show error if key is missing from .env
      setTimeout(() => {
          showToast('System Configuration Error: VITE_API_KEY is missing from .env file.', 'error');
      }, 1000);
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
  
  useEffect(() => {
    localStorage.setItem('ragApiUrl', ragApiUrl);
  }, [ragApiUrl]);

  useEffect(() => {
    localStorage.setItem('llmProvider', llmProvider);
  }, [llmProvider]);

  useEffect(() => {
    localStorage.setItem('localLlmModel', localLlmModel);
  }, [localLlmModel]);
  
  // Inventory fetching should use the RAG/Helper URL primarily, as that's where the python script lives.
  const fetchInventory = useCallback(async (url: string) => {
      if (!url) return;
      try {
        const inv = await getServerInventory(url);
        setInventory(inv);
      } catch (error) {
        // Use warn instead of error to avoid cluttering console when RAG server is offline (which is common)
        console.warn("Could not fetch server inventory (RAG server might be offline).", error);
        setInventory(null);
      }
  }, []);

  // Refresh inventory when RAG URL changes
  useEffect(() => {
    if (ragApiUrl) {
      fetchInventory(ragApiUrl);
    } else {
      setInventory(null);
    }
  }, [ragApiUrl, fetchInventory]);
  
  // Also expose a manual refresh for the Settings modal
  const refreshInventory = () => {
      if (ragApiUrl) fetchInventory(ragApiUrl);
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = uuidv4();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const ensureApiKey = (): boolean => {
    // Only check for Gemini API key if we are using Gemini provider
    if (llmProvider === 'gemini' && !isApiKeySet) {
        showToast('System Configuration Error: VITE_API_KEY is missing from .env file.', 'error');
        return false;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!ensureApiKey() || !prompt.trim()) return;
    setGeneratedData(null);
    setSelectedHistoryId(null);
    setLastRunSuccess(false); // Reset feedback state
    let finalData: GeneratedWorkflowResponse | null = null;
    let uploadedImageName: string | undefined = undefined;

    if (uploadedImage) {
        if (!comfyUIUrl) {
            showToast(t.toastComfyUrlNotSet, 'error');
            return;
        }
        try {
            setLoadingState({ active: true, message: t.loadingUploadingImage, progress: 10 });
            const uploadResponse = await uploadImage(uploadedImage, comfyUIUrl);
            uploadedImageName = uploadResponse.name;
            showToast(t.toastImageUploadSuccess, 'success');
        } catch (error: any) {
            showToast(t.toastImageUploadFailed(error.message || 'Unknown error'), 'error');
            setLoadingState({ active: false, message: '', progress: 0 });
            return;
        }
    }

    try {
      // Step 1: Generation
      setLoadingState({ active: true, message: t.loadingStep1, progress: 25 });
      
      let response;
      if (llmProvider === 'local') {
          if (!localLlmApiUrl) {
              throw new Error("Ollama Generation URL is missing. Please check settings.");
          }
          // We pass format to local service
          response = await generateWorkflowLocal(prompt, localLlmApiUrl, localLlmModel, inventory, uploadedImageName, ragApiUrl, workflowFormat);
      } else {
          // We pass format to gemini service
          response = await generateWorkflow(prompt, ragApiUrl, inventory, uploadedImageName, localLlmModel, workflowFormat);
      }
      
      // Step 2: Validation
      setLoadingState({ active: true, message: t.loadingStep2, progress: 60 });
      let validatedResponse;
      
      if (llmProvider === 'local') {
            validatedResponse = await validateAndCorrectWorkflowLocal(response.workflow as ComfyUIWorkflow, localLlmApiUrl, localLlmModel, ragApiUrl);
      } else {
            validatedResponse = await validateAndCorrectWorkflow(response.workflow as ComfyUIWorkflow, ragApiUrl, localLlmModel);
      }
      
      finalData = {
        workflow: validatedResponse.correctedWorkflow,
        requirements: response.requirements,
        validationLog: validatedResponse.validationLog,
        correctionLog: [], // Initialize empty
      };


      // Step 3: Server-side Validation with Auto-Correction
      // Only possible if Graph Format (visual) because our "convert to API" logic expects Graph input.
      // If it's already API format, we can send it directly to check, but auto-correct logic might struggle if it expects Graph.
      
      if (comfyUIUrl) {
          setLoadingState({ active: true, message: t.loadingServerValidation, progress: 85 });
          try {
              // If format is API, validateWorkflowAgainstApi needs to handle it (it converts graph->api, so we need to bypass conversion)
              // Currently validateWorkflowAgainstApi expects Graph. 
              // TODO: Update validateWorkflowAgainstApi to handle raw API json.
              
              // For this implementation, we only do server validation for Graph format to be safe.
              if (workflowFormat === 'graph') {
                  const serverValidation = await validateWorkflowAgainstApi(finalData.workflow as ComfyUIWorkflow, comfyUIUrl);

                  if (!serverValidation.success && serverValidation.error) {
                       // It failed! Let's debug it automatically.
                       console.log("Server validation failed. Starting auto-correction...", serverValidation.error);
                       setLoadingState({ active: true, message: t.loadingAutoCorrecting, progress: 90 });
                       
                       let debugResponse;
                       if (llmProvider === 'local') {
                            debugResponse = await debugAndCorrectWorkflowLocal(finalData.workflow as ComfyUIWorkflow, serverValidation.error, localLlmApiUrl, localLlmModel, ragApiUrl);
                       } else {
                            debugResponse = await debugAndCorrectWorkflow(finalData.workflow as ComfyUIWorkflow, serverValidation.error, ragApiUrl, localLlmModel);
                       }
                       
                       finalData.workflow = debugResponse.correctedWorkflow;
                       finalData.correctionLog = debugResponse.correctionLog;
                       
                       showToast(t.toastAutoCorrected, 'success');
                  }
              }
          } catch (e) {
              console.warn("Server validation check failed (network error?), skipping auto-debug.", e);
          }
      }

      setLoadingState({ active: true, message: t.loadingComplete, progress: 100 });
      setGeneratedData(finalData);
      
      const newEntry: HistoryEntry = { id: uuidv4(), prompt, timestamp: new Date().toISOString(), data: finalData, format: workflowFormat };
      setHistory(prev => [newEntry, ...prev]);
      setSelectedHistoryId(newEntry.id);

      showToast(t.toastWorkflowGenerated, 'success');
    } catch (error: any) {
      showToast(error.message || t.toastUnknownError, 'error');
    } finally {
      setLoadingState({ active: false, message: '', progress: 0 });
    }
  };
  
  const handleWorkflowImport = (workflow: ComfyUIWorkflow) => {
      if (!workflow) {
          showToast(t.toastJsonImportFailed, 'error');
          return;
      }
      
      // Detect format
      let format: WorkflowFormat = 'graph';
      if (!workflow.nodes && !workflow.links && (workflow as any)[Object.keys(workflow)[0]]?.class_type) {
          format = 'api';
      }

      const importData: GeneratedWorkflowResponse = {
          workflow: workflow,
          requirements: { custom_nodes: [], models: [] }, // We don't know requirements for imported workflows
          validationLog: [],
          correctionLog: []
      };
      
      setWorkflowFormat(format);
      setGeneratedData(importData);
      setSelectedHistoryId(null);
      setLastRunSuccess(false);
      showToast(t.toastJsonImported, 'success');
  };

  const handleValidation = async (workflowJson: string, errorMessage: string) => {
    if (!ensureApiKey()) return;

    setLoadingState({ active: true, message: t.loadingValidating, progress: 25 });
    let workflowToProcess: any; // Can be Graph or API format

    try {
        workflowToProcess = JSON.parse(workflowJson);
    } catch (error) {
        showToast(t.toastInvalidWorkflowJson, "error");
        setLoadingState({ active: false, message: '', progress: 0 });
        return;
    }
    
    // Auto-detect format for validation context
    let detectedFormat: WorkflowFormat = 'graph';
    if (!workflowToProcess.nodes && !workflowToProcess.links && (workflowToProcess as any)[Object.keys(workflowToProcess)[0]]?.class_type) {
        detectedFormat = 'api';
    }
    
    // Update state to match what we are looking at
    setWorkflowFormat(detectedFormat);

    try {
        let response;
        
        if (llmProvider === 'local') {
            if (!localLlmApiUrl) throw new Error("Ollama API URL is missing.");
            
            if (errorMessage.trim()) {
                setLoadingState({ active: true, message: t.loadingDebugging, progress: 50 });
                response = await debugAndCorrectWorkflowLocal(workflowToProcess, errorMessage, localLlmApiUrl, localLlmModel, ragApiUrl);
            } else {
                response = await validateAndCorrectWorkflowLocal(workflowToProcess, localLlmApiUrl, localLlmModel, ragApiUrl);
            }
        } else {
            // For Gemini
            if (errorMessage.trim()) {
                setLoadingState({ active: true, message: t.loadingDebugging, progress: 50 });
                response = await debugAndCorrectWorkflow(workflowToProcess, errorMessage, ragApiUrl, localLlmModel);
            } else {
                response = await validateAndCorrectWorkflow(workflowToProcess, ragApiUrl, localLlmModel);
            }
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
    
    setLoadingState({ active: true, message: t.toastSendingWorkflow, progress: 0 });
    setLastRunSuccess(false);

    // executeWorkflow handles graph->api conversion if needed.
    // If it's already API format (workflowFormat === 'api'), convertToApiFormat in comfyuiService 
    // needs to handle it (it returns as-is if it looks like API format).
    
    await executeWorkflow(
      generatedData.workflow as ComfyUIWorkflow, // Casting for now, executeWorkflow handles loose types internally
      comfyUIUrl,
      (status) => { // onProgress
        setLoadingState({ active: true, message: status.message, progress: status.progress });
      },
      () => { // onComplete
        showToast(t.toastWorkflowExecutionComplete, 'success');
        setLastRunSuccess(true); // Trigger feedback loop UI
        setTimeout(() => {
            setLoadingState({ active: false, message: '', progress: 0 });
        }, 1500);
      },
      (error) => { // onError
        showToast(t.toastWorkflowExecutionFailed(error.message), 'error');
        setLoadingState({ active: false, message: '', progress: 0 });
      }
    );
  };

  const handleSelectHistory = (entry: HistoryEntry) => {
    setPrompt(entry.prompt);
    setGeneratedData(entry.data);
    setSelectedHistoryId(entry.id);
    // Restore format from history if present, else default to graph
    setWorkflowFormat(entry.format || 'graph');
    setMainView('generator');
    setUploadedImage(null);
    setLastRunSuccess(false); // Reset feedback on history load
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
        'index.html', 'index.tsx', 'metadata.json', 'App.tsx', 'types.ts', 'translations.ts', 'package.json',
        'context/LanguageContext.tsx',
        'hooks/useTranslations.ts',
        'services/comfyuiService.ts', 'services/geminiService.ts', 'services/localLlmService.ts', 'services/apiKeyService.ts', 'services/prompts.ts',
        'components/DocumentationPanel.tsx', 'components/HistoryPanel.tsx', 'components/Icons.tsx', 'components/InputPanel.tsx', 'components/Loader.tsx',
        'components/LocalLlmPanel.tsx', 'components/NodeDetailModal.tsx', 'components/OutputPanel.tsx', 'components/PromptOptimizerModal.tsx',
        'components/SettingsModal.tsx', 'components/TesterPanel.tsx', 'components/Toast.tsx', 'components/WorkflowVisualizer.tsx', 'components/WorkflowWizardModal.tsx',
        'components/ApiKeyModal.tsx',
        'public/Bedienungsanleitung.md', 'public/UserManual.md'
    ];

    const fileContents = await Promise.all(
        filePaths.map(async (path) => {
            try {
                const fetchPath = path.startsWith('public/') ? path.replace('public/', '') : path;
                const response = await fetch('/' + fetchPath);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const content = await response.text();
                return `--- START OF FILE ${path} ---\n\n${content}\n\n--- END OF FILE ${path} ---\n\n\n`;
            } catch (error) {
                console.error(`Failed to fetch ${path}:`, error);
                return `--- START OF FILE ${path} ---\n\n[Could not load file content]\n\n--- END OF FILE ${path} ---\n\n\n`;
            }
        })
    );
    
    const header = `// AI ComfyUI Workflow Suite - Source Code Dump\n// Version: ${version}\n// Downloaded on: ${new Date().toISOString()}\n\n\n`;
    const combinedContent = header + fileContents.join('');
    
    const blob = new Blob([combinedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comfyui-workflow-suite-source-v${version}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t.toastSourceDownloaded, 'success');
  };
  
  const renderMainView = () => {
    switch(mainView) {
      case 'generator':
        return <InputPanel 
            prompt={prompt} 
            setPrompt={setPrompt} 
            onGenerate={handleGenerate} 
            isLoading={loadingState.active} 
            onOpenOptimizer={() => { if(ensureApiKey()) setIsOptimizerOpen(true); }} 
            onOpenWizard={() => { if(ensureApiKey()) setIsWizardOpen(true); }} 
            onWorkflowImport={handleWorkflowImport}
            uploadedImage={uploadedImage} 
            setUploadedImage={setUploadedImage} 
            workflowFormat={workflowFormat}
            setWorkflowFormat={setWorkflowFormat}
        />;
      case 'tester':
        return <TesterPanel onValidate={handleValidation} isLoading={loadingState.active} />;
      case 'history':
        return <HistoryPanel history={history} selectedHistoryId={selectedHistoryId} onSelect={handleSelectHistory} onClear={() => setHistory([])} onDownload={(entry) => handleDownload(entry.data)} />;
      case 'local_llm':
        return <LocalLlmPanel apiUrl={ragApiUrl} showToast={showToast} selectedModel={localLlmModel} />;
      case 'documentation':
        return <DocumentationPanel />;
      default:
        return null;
    }
  }

  return (
    <>
      <div className="text-slate-800 h-screen flex flex-col font-sans p-4 gap-4">
        <header className="flex-shrink-0 glass-panel rounded-2xl shadow-sm z-10">
          <div className="container mx-auto px-6 py-3 flex justify-between items-center">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-slate-800">{t.appTitle}</h1>
              <span className="ml-2 text-xs text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded-full">v{version}</span>
              {llmProvider === 'local' && <span className="ml-2 text-xs bg-sky-100 text-sky-800 border border-sky-200 px-2 py-0.5 rounded-full">Local LLM</span>}
            </div>
            <div className="flex items-center space-x-1 bg-slate-100/80 p-1 rounded-full border border-slate-200">
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
                          mainView === tab.key ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'
                      }`}
                  >
                      {tab.label}
                  </button>
              ))}
            </div>
            <div className="flex items-center space-x-4">
                <button onClick={toggleLanguage} className="px-3 py-1.5 text-sm bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-colors font-medium border border-slate-200">
                    {language.toUpperCase()}
                </button>
                <button onClick={() => setIsSettingsOpen(true)} className="text-slate-400 hover:text-teal-500 transition-colors" title={t.settingsTitle}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </button>
            </div>
          </div>
        </header>

        <main className="flex-grow flex gap-4 overflow-hidden">
          {loadingState.active && !generatedData ? (
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
            isLoading={loadingState.active && !!generatedData}
            loadingState={loadingState}
            workflowFormat={workflowFormat}
            lastRunSuccess={lastRunSuccess}
            currentPrompt={prompt}
            ragApiUrl={ragApiUrl}
            showToast={showToast}
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
            ragApiUrl={ragApiUrl}
            setRagApiUrl={setRagApiUrl}
            onDownloadSourceCode={handleDownloadSourceCode}
            version={version}
            llmProvider={llmProvider}
            setLlmProvider={setLlmProvider}
            localLlmModel={localLlmModel}
            setLocalLlmModel={setLocalLlmModel}
            inventory={inventory}
            onRefreshInventory={refreshInventory}
        />
      </div>
    </>
  );
};

export default App;