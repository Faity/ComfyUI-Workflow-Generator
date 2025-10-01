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
  const [isWizardOpen, setIsWizardOpen] = useState(false);
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
  
  const handleDownloadSourceCode = () => {
    const files = [
      { name: 'App.tsx', content: `import React, { useState, useEffect } from 'react';
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
  const [isWizardOpen, setIsWizardOpen] = useState(false);
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
    a.download = \`workflow_\${Date.now()}.json\`;
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
  
  const handleDownloadSourceCode = () => {
    const files = [
      // This list is populated with all file contents
    ];

    const combinedContent = files.map(file => {
        return \`--- START OF FILE \${file.name} ---\\n\\n\${file.content}\\n\\n--- END OF FILE \${file.name} ---\\n\\n\\n\`;
    }).join('');

    const blob = new Blob([combinedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = \`comfyui-workflow-suite-source.txt\`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t.toastSourceDownloaded, 'success');
  };

  const renderMainView = () => {
    switch(mainView) {
      case 'generator':
        return <InputPanel prompt={prompt} setPrompt={setPrompt} onGenerate={handleGenerate} isLoading={loadingState.active} onOpenOptimizer={() => setIsOptimizerOpen(true)} onOpenWizard={() => setIsWizardOpen(true)} />;
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
    <div className="text-white h-screen flex flex-col font-sans p-4 gap-4">
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
            ].map(view => (
                <button 
                    key={view.key} 
                    onClick={() => setMainView(view.key as MainView)}
                    className={\`px-4 py-1.5 text-sm rounded-full transition-all duration-300 \${mainView === view.key ? 'bg-teal-500/80 text-white shadow-md' : 'text-gray-400 hover:bg-white/10'}\`}
                >
                    {view.label}
                </button>
            ))}
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={toggleLanguage} className="p-2 w-12 text-center text-sm font-semibold text-gray-400 hover:bg-white/10 rounded-full transition-colors">
                {language === 'de' ? 'EN' : 'DE'}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" aria-label={t.settingsTitle}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-grow flex flex-row overflow-hidden gap-4">
        {renderMainView()}
        {mainView !== 'documentation' && (
            loadingState.active ? (
              <div className="w-full lg:w-1/2 glass-panel rounded-2xl flex flex-col">
                <ProgressBarLoader message={loadingState.message} progress={loadingState.progress} />
              </div>
            ) : (
              <OutputPanel 
                workflowData={generatedData}
                onDownload={() => generatedData && handleDownload(generatedData)}
                onCopy={handleCopy}
                onRun={handleRunWorkflow}
                onValidate={() => generatedData && handleValidation(JSON.stringify(generatedData.workflow), '')}
                onLoad={handleLoadWorkflow}
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

      {isWizardOpen && (
        <WorkflowWizardModal
            isOpen={isWizardOpen}
            onClose={() => setIsWizardOpen(false)}
            onComplete={handleWizardComplete}
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

export default App;` },
      { name: 'components/DocumentationPanel.tsx', content: `import React, { useState, useEffect } from 'react';
import Loader from './Loader';
import { useLanguage } from '../context/LanguageContext';
import { useTranslations } from '../hooks/useTranslations';

const parseMarkdown = (text: string) => {
    const lines = text.split('\\n');
    let html = '';
    let inList: 'ul' | 'ol' | null = null;

    const closeList = () => {
        if (inList) {
            html += \`</\${inList}>\`;
            inList = null;
        }
    };

    const processInline = (line: string) => {
        return line
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\\*\\*(.*?)\\*\\*/g, '<strong class="text-gray-100 font-semibold">$1</strong>')
            .replace(/\`(.*?)\`/g, '<code class="bg-black/30 text-yellow-300 px-1.5 py-0.5 rounded text-sm font-mono border border-white/10">$1</code>');
    }

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '---') {
            closeList();
            html += '<hr class="my-8 border-white/10" />';
            continue;
        }
        if (line.startsWith('# ')) {
            closeList();
            html += \`<h1 class="text-4xl font-bold mt-8 mb-6 text-teal-400 pb-2 border-b border-white/10">\${processInline(line.substring(2))}</h1>\`;
            continue;
        }
        if (line.startsWith('## ')) {
            closeList();
            html += \`<h2 class="text-3xl font-bold mt-8 mb-4 text-sky-400">\${processInline(line.substring(3))}</h2>\`;
            continue;
        }
        if (line.match(/^\\d+\\.\\s/)) {
            if (inList !== 'ol') {
                closeList();
                html += '<ol class="list-decimal list-inside space-y-3 mb-4 pl-4 text-gray-300">';
                inList = 'ol';
            }
            html += \`<li>\${processInline(line.replace(/^\\d+\\.\\s/, ''))}</li>\`;
            continue;
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
            if (inList !== 'ul') {
                closeList();
                html += '<ul class="list-disc list-inside space-y-3 mb-4 pl-4 text-gray-300">';
                inList = 'ul';
            }
            html += \`<li>\${processInline(line.substring(2))}</li>\`;
            continue;
        }
        
        closeList(); 
        if (trimmedLine) {
            html += \`<p class="text-gray-300 mb-4 leading-relaxed">\${processInline(line)}</p>\`;
        }
    }
    
    closeList();
    return html;
};


const DocumentationPanel: React.FC = () => {
  const { language } = useLanguage();
  const t = useTranslations();
  const [markdown, setMarkdown] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const docFile = language === 'de' ? '/Bedienungsanleitung.md' : '/UserManual.md';
        const response = await fetch(docFile);
        if (!response.ok) {
          throw new Error(t.docErrorContent(response.status));
        }
        const text = await response.text();
        setMarkdown(text);
      } catch (e) {
        if (e instanceof Error) setError(e.message);
        else setError(t.docErrorUnknown);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDocs();
  }, [language, t]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
            <Loader message={t.docLoading} />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full">
            <div className="text-center text-red-400 glass-panel p-8 rounded-2xl">
                <h3 className="text-xl font-bold">{t.docErrorTitle}</h3>
                <p className="mt-2 bg-red-900/50 p-4 rounded-md">{error}</p>
            </div>
        </div>
      );
    }

    return <div className="max-w-4xl mx-auto" dangerouslySetInnerHTML={{ __html: parseMarkdown(markdown) }} />;
  };

  return (
    <div className="w-full glass-panel rounded-2xl p-8 lg:p-10 flex flex-col" role="tabpanel">
        <div className="overflow-y-auto h-full pr-4 -mr-4">
            {renderContent()}
        </div>
    </div>
  );
};

export default DocumentationPanel;` },
      { name: 'components/HistoryPanel.tsx', content: `import React from 'react';
import type { HistoryEntry } from '../types';
import { DownloadIcon, TrashIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface HistoryPanelProps {
  history: HistoryEntry[];
  selectedHistoryId: string | null;
  onSelect: (entry: HistoryEntry) => void;
  onClear: () => void;
  onDownload: (entry: HistoryEntry) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, selectedHistoryId, onSelect, onClear, onDownload }) => {
  const t = useTranslations();

  if (history.length === 0) {
    return (
      <div className="w-full lg:w-1/2 glass-panel rounded-2xl p-8 flex flex-col items-center justify-center text-center">
        <div className="text-gray-500">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-20 h-20 mx-auto mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
             <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <h3 className="text-xl font-bold text-gray-400">{t.noHistory}</h3>
          <p className="mt-2 max-w-sm">{t.noHistorySubtext}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full lg:w-1/2 glass-panel rounded-2xl p-8 flex flex-col" role="tabpanel">
      <div className="flex-shrink-0 flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-100">{t.historyTitle}</h2>
        <button
          onClick={onClear}
          className="flex items-center px-4 py-2 text-sm bg-red-500/20 border border-red-500/30 text-red-300 rounded-full hover:bg-red-500/40 transition-colors"
          title={t.tooltipClearHistory}
        >
          <TrashIcon className="w-4 h-4 mr-2" />
          {t.clearHistory}
        </button>
      </div>
      <div className="flex-grow overflow-y-auto pr-2 -mr-4 space-y-3">
        {history.map((entry) => (
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(entry)}
            onKeyPress={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(entry)}
            className={\`p-4 rounded-xl cursor-pointer transition-all duration-200 border focus:outline-none focus:ring-2 focus:ring-sky-400/80 \${
              selectedHistoryId === entry.id
                ? 'bg-sky-500/30 border-sky-500/50'
                : 'bg-black/20 border-transparent hover:bg-white/10'
            }\`}
          >
            <div className="flex justify-between items-start">
                <div className="flex-grow min-w-0">
                    <p className="text-sm font-semibold text-gray-100 truncate pr-4" title={entry.prompt}>{entry.prompt}</p>
                    <p className="text-xs text-gray-400 mt-1">
                    {new Date(entry.timestamp).toLocaleString(t.locale)}
                    </p>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent onSelect from firing
                        onDownload(entry);
                    }}
                    title={t.tooltipDownloadHistory}
                    className="flex-shrink-0 p-2 text-gray-400 hover:text-white hover:bg-white/20 rounded-full transition-colors"
                    aria-label="Download this workflow"
                >
                    <DownloadIcon className="w-4 h-4" />
                </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryPanel;` },
      { name: 'components/Icons.tsx', content: `import React from 'react';

export const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.562L16.25 22.5l-.648-1.938a2.25 2.25 0 01-1.423-1.423L12 18.75l1.938-.648a2.25 2.25 0 011.423-1.423L17.25 15l.648 1.938a2.25 2.25 0 011.423 1.423L21 18.75l-1.938.648a2.25 2.25 0 01-1.423 1.423z" />
  </svg>
);

export const WrenchIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.472-2.472a3.375 3.375 0 00-4.773-4.773L6.75 11.42m5.877 5.877l-5.877-5.877m0 0a3.375 3.375 0 01-4.774-4.774l2.473 2.473" />
  </svg>
);

export const DownloadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

export const TrashIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.124-2.037-2.124H8.037C6.91 2.75 6 3.694 6 4.874v.916m7.5 0h-7.5" />
    </svg>
);

export const DatabaseIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
);

export const ChartBarIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
);

export const CheckCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const ExclamationCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
       <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
);

export const ClipboardIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a2.25 2.25 0 01-2.25 2.25h-1.5a2.25 2.25 0 01-2.25-2.25v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
);

export const PlayIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
);

export const Square2StackIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375v-3.375a2.25 2.25 0 00-2.25-2.25h-1.5a2.25 2.25 0 00-2.25 2.25v3.375m7.5 10.375a2.25 2.25 0 002.25-2.25v-3.375a2.25 2.25 0 00-2.25-2.25h-1.5a2.25 2.25 0 00-2.25 2.25v3.375" />
  </svg>
);

export const BugAntIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 15l-1.72-1.72a3.75 3.75 0 00-5.304-5.304L4 10.5m9 4.5l-1.5-1.5m0 0l-1.5 1.5m-1.5-1.5l1.5-1.5m1.5 1.5l-1.5-1.5m1.5-1.5l1.5 1.5m0-1.5l-1.5 1.5m0-1.5l-1.5-1.5m3 3l-1.5-1.5m1.5 1.5l-1.5 1.5m1.5-1.5l1.5-1.5m1.5 1.5l-1.5-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.75a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const CpuChipIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9m5.25 11.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l-2.25 2.25M15 12l2.25 2.25M12 9l2.25-2.25M12 15l-2.25 2.25" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 12.75c0 .414.336.75.75.75h3c.414 0 .75-.336.75-.75v-1.5c0-.414-.336-.75-.75-.75h-3c-.414 0-.75.336-.75.75v1.5z" />
  </svg>
);` },
      { name: 'components/InputPanel.tsx', content: `import React from 'react';
import { SparklesIcon, CpuChipIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface InputPanelProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
  onOpenOptimizer: () => void;
  onOpenWizard: () => void;
}

const examplePrompts = [
    "Ein einfacher Text-zu-Bild-Workflow mit SDXL.",
    "Erstelle ein Bild von einem Astronauten, der auf einem Pferd reitet, im Stil von Van Gogh.",
    "Ein Inpainting-Workflow, um ein Objekt aus einem Bild zu entfernen.",
    "Workflow für ein SD 1.5 Modell mit ControlNet für Canny Edges.",
];

const InputPanel: React.FC<InputPanelProps> = ({ prompt, setPrompt, onGenerate, isLoading, onOpenOptimizer, onOpenWizard }) => {
  const t = useTranslations();
  
  return (
    <div className="w-full lg:w-1/2 glass-panel rounded-2xl p-8 flex flex-col space-y-6 transition-all duration-300">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-100">{t.describeWorkflow}</h2>
        <div className="flex items-center space-x-2">
            <button 
                onClick={onOpenOptimizer}
                disabled={isLoading}
                className="flex items-center px-4 py-2 text-sm bg-sky-500/80 backdrop-blur-sm border border-sky-400/50 text-white rounded-full hover:bg-sky-500 disabled:opacity-50 transition-all duration-300 transform hover:scale-105"
                title={t.promptAssistantTitle}
            >
                <SparklesIcon className="w-4 h-4 mr-2" />
                {t.promptAssistant}
            </button>
            <button 
                onClick={onOpenWizard}
                disabled={isLoading}
                className="flex items-center px-4 py-2 text-sm bg-indigo-500/80 backdrop-blur-sm border border-indigo-400/50 text-white rounded-full hover:bg-indigo-500 disabled:opacity-50 transition-all duration-300 transform hover:scale-105"
                title={t.workflowWizardTitle}
            >
                <CpuChipIcon className="w-4 h-4 mr-2" />
                {t.workflowWizard}
            </button>
        </div>
      </div>
      <p className="text-sm text-gray-400">
        {t.describeWorkflowSubtext}
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t.promptPlaceholder}
        className="w-full h-64 p-4 bg-black/20 rounded-xl resize-none focus:ring-2 focus:ring-teal-400 focus:bg-black/30 border border-transparent focus:border-teal-500/50 transition-all duration-300 text-gray-200 placeholder-gray-500"
        disabled={isLoading}
      />
      
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400">{t.tryExample}</h3>
        <div className="flex flex-wrap gap-2">
          {examplePrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => setPrompt(p)}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs bg-white/10 text-gray-300 rounded-full hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onGenerate}
        disabled={isLoading || !prompt.trim()}
        className={\`w-full flex items-center justify-center px-6 py-4 bg-teal-500/90 text-white font-bold rounded-xl shadow-lg hover:bg-teal-500 disabled:bg-gray-600/50 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-300 \${!isLoading && prompt.trim() ? 'btn-glow' : ''}\`}
      >
        {isLoading ? (
          <div className="w-6 h-6 border-2 border-dashed rounded-full animate-spin border-white"></div>
        ) : (
          <>
            <SparklesIcon className="w-5 h-5 mr-2" />
            {t.generateWorkflow}
          </>
        )}
      </button>
    </div>
  );
};

export default InputPanel;` },
      { name: 'components/Loader.tsx', content: `import React from 'react';

interface LoaderProps {
    message?: string;
    progress?: number;
}

const ProgressBarLoader: React.FC<LoaderProps> = ({ message, progress = 0 }) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-4">
    <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-teal-400/80 mb-6"></div>
    <div className="w-full max-w-md bg-white/10 rounded-full h-2.5">
        <div 
            className="bg-gradient-to-r from-sky-400 to-teal-400 h-2.5 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_theme(colors.teal.400)]" 
            style={{ width: \`\${progress}%\` }}
        ></div>
    </div>
    <p className="mt-4 text-lg text-gray-200">{message || 'Processing...'}</p>
    <p className="text-sm text-gray-500">This may take a moment.</p>
  </div>
);

export default ProgressBarLoader;` },
      { name: 'components/LocalLlmPanel.tsx', content: `import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { DatabaseIcon, ChartBarIcon, TrashIcon } from './Icons';
import { uploadRagDocument, startFineTuning } from '../services/localLlmService';
import { useTranslations } from '../hooks/useTranslations';

interface LocalLlmPanelProps {
  apiUrl: string;
  showToast: (message: string, type: 'success' | 'error') => void;
}

type ActiveTab = 'rag' | 'finetune';

interface UploadedFile {
    file: File;
    status: 'pending' | 'uploading' | 'success' | 'error';
    message?: string;
}

const LocalLlmPanel: React.FC<LocalLlmPanelProps> = ({ apiUrl, showToast }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('rag');
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [trainingData, setTrainingData] = useState('');
    const [fineTuneLog, setFineTuneLog] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const t = useTranslations();

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const newFiles: UploadedFile[] = acceptedFiles.map(file => ({ file, status: 'pending' }));
        setFiles(prev => [...prev, ...newFiles]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'text/plain': ['.txt'], 'text/markdown': ['.md'] }
    });

    const handleUpload = async () => {
        if (!apiUrl) {
            showToast(t.localLlmApiUrlNotSet, 'error');
            return;
        }
        
        setIsLoading(true);
        for (let i = 0; i < files.length; i++) {
            if (files[i].status === 'pending') {
                try {
                    setFiles(prev => prev.map((f, index) => index === i ? { ...f, status: 'uploading' } : f));
                    const response = await uploadRagDocument(files[i].file, apiUrl);
                    setFiles(prev => prev.map((f, index) => index === i ? { ...f, status: 'success', message: response.message || 'Successfully uploaded' } : f));
                    showToast(t.localLlmFileUploadSuccess(files[i].file.name), 'success');
                } catch (e: any) {
                    const errorMessage = e.message || 'Unknown error';
                    setFiles(prev => prev.map((f, index) => index === i ? { ...f, status: 'error', message: errorMessage } : f));
                    showToast(t.localLlmFileUploadError(files[i].file.name, errorMessage), 'error');
                }
            }
        }
        setIsLoading(false);
    };

    const handleStartFineTune = async () => {
        if (!apiUrl) {
            showToast(t.localLlmApiUrlNotSet, 'error');
            return;
        }
        if (!trainingData.trim()) {
            showToast(t.localLlmTrainingDataEmpty, 'error');
            return;
        }

        setIsLoading(true);
        setFineTuneLog([t.localLlmStartingJob]);
        try {
            const response = await startFineTuning(trainingData, apiUrl);
            setFineTuneLog(prev => [...prev, t.localLlmJobStarted(response.job_id), t.localLlmWaitingForLogs]);
            showToast(t.localLlmJobStartSuccess, 'success');
        } catch (e: any) {
            const errorMessage = e.message || 'Unknown error';
            setFineTuneLog(prev => [...prev, \`\${t.localLlmError}: \${errorMessage}\`]);
            showToast(t.localLlmJobStartError(errorMessage), 'error');
        } finally {
            setIsLoading(false);
        }
    };
    
    const removeFile = (index: number) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    return (
        <div className="w-full lg:w-1/2 glass-panel rounded-2xl p-8 flex flex-col space-y-6">
            <h2 className="text-2xl font-bold text-gray-100">{t.localLlmTitle}</h2>
            <div className="flex space-x-1 bg-black/20 p-1 rounded-full">
                <button onClick={() => setActiveTab('rag')} className={\`w-1/2 px-4 py-2 text-sm font-medium rounded-full flex items-center justify-center transition-colors \${activeTab === 'rag' ? 'bg-sky-500/80 text-white' : 'text-gray-300 hover:bg-white/10'}\`}>
                    <DatabaseIcon className="w-5 h-5 mr-2" /> {t.localLlmRagTab}
                </button>
                <button onClick={() => setActiveTab('finetune')} className={\`w-1/2 px-4 py-2 text-sm font-medium rounded-full flex items-center justify-center transition-colors \${activeTab === 'finetune' ? 'bg-sky-500/80 text-white' : 'text-gray-300 hover:bg-white/10'}\`}>
                    <ChartBarIcon className="w-5 h-5 mr-2" /> {t.localLlmFineTuneTab}
                </button>
            </div>
            
            {activeTab === 'rag' && (
                <div className="flex flex-col space-y-4 flex-grow">
                    <p className="text-sm text-gray-400">{t.localLlmRagSubtext}</p>
                    <div {...getRootProps()} className={\`p-8 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300 \${isDragActive ? 'border-teal-400 bg-teal-500/20' : 'border-gray-600/50 hover:border-gray-500 bg-black/20'}\`}>
                        <input {...getInputProps()} />
                        <p className="text-gray-400">{t.localLlmDropzone}</p>
                    </div>
                    <div className="flex-grow overflow-y-auto space-y-2 pr-2 -mr-2 min-h-[100px]">
                        {files.map((uploadedFile, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                                <div className="truncate">
                                    <p className="text-sm font-medium text-gray-200 truncate">{uploadedFile.file.name}</p>
                                    <p className={\`text-xs \${uploadedFile.status === 'success' ? 'text-green-400' : uploadedFile.status === 'error' ? 'text-red-400' : 'text-gray-500'}\`}>
                                       {uploadedFile.status === 'uploading' ? t.localLlmUploading : uploadedFile.message || uploadedFile.status}
                                    </p>
                                </div>
                                <button onClick={() => removeFile(index)} className="p-1 text-gray-400 hover:text-white"><TrashIcon className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                    <button onClick={handleUpload} disabled={isLoading || files.length === 0} className="w-full mt-auto px-6 py-3 bg-teal-500/90 text-white font-semibold rounded-lg hover:bg-teal-500 disabled:bg-gray-600/50">
                        {isLoading ? t.localLlmUploading : \`\${t.localLlmUploadButton} (\${files.filter(f => f.status === 'pending').length})\`}
                    </button>
                </div>
            )}
            
            {activeTab === 'finetune' && (
                 <div className="flex flex-col space-y-4 flex-grow">
                     <p className="text-sm text-gray-400">{t.localLlmFineTuneSubtext}</p>
                     <textarea
                        value={trainingData}
                        onChange={(e) => setTrainingData(e.target.value)}
                        placeholder='{"prompt": "...", "completion": "..."}\\n{"prompt": "...", "completion": "..."}'
                        className="w-full h-48 p-4 bg-black/20 border-transparent focus:border-teal-500/50 rounded-lg resize-y focus:ring-2 focus:ring-teal-400 transition-colors"
                        disabled={isLoading}
                    />
                    <div className="flex-grow bg-black/30 rounded-lg p-3 overflow-y-auto h-32">
                        <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono">
                            {fineTuneLog.map((line, i) => <div key={i}>{\`[\${new Date().toLocaleTimeString()}] \${line}\`}</div>)}
                        </pre>
                    </div>
                     <button onClick={handleStartFineTune} disabled={isLoading || !trainingData.trim()} className="w-full mt-auto px-6 py-3 bg-sky-500/90 text-white font-semibold rounded-lg hover:bg-sky-500 disabled:bg-gray-600/50">
                        {isLoading ? t.localLlmStarting : t.localLlmStartFineTune}
                    </button>
                 </div>
            )}

        </div>
    );
};

export default LocalLlmPanel;` },
      { name: 'components/NodeDetailModal.tsx', content: `import React from 'react';
import type { ComfyUINode } from '../types';

interface NodeDetailModalProps {
  node: ComfyUINode;
  onClose: () => void;
}

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="py-3 px-4 grid grid-cols-3 gap-4 border-b border-white/10 last:border-b-0">
        <dt className="text-sm font-medium text-gray-400">{label}</dt>
        <dd className="text-sm text-gray-200 col-span-2">{children}</dd>
    </div>
);

const NodeDetailModal: React.FC<NodeDetailModalProps> = ({ node, onClose }) => {
    
    const renderValue = (value: any) => {
        if (typeof value === 'object' && value !== null) {
            return <pre className="text-xs bg-black/30 p-2 rounded-md whitespace-pre-wrap"><code>{JSON.stringify(value, null, 2)}</code></pre>;
        }
        if (typeof value === 'boolean') {
            return value ? <span className="text-green-400 font-bold">true</span> : <span className="text-red-400 font-bold">false</span>
        }
        return String(value);
    }

    return (
    <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="node-details-title"
    >
        <div 
            className="glass-panel rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
        >
            <header className="flex items-center justify-between p-4 border-b border-[var(--glass-border)] flex-shrink-0">
                <div>
                    <h2 id="node-details-title" className="text-lg font-bold text-teal-400">{node.title || node.type}</h2>
                    {node.title && node.title !== node.type && <p className="text-xs text-gray-400">{node.type}</p>}
                </div>
                <button 
                    onClick={onClose} 
                    className="text-gray-400 hover:text-white text-2xl font-bold"
                    aria-label="Close node details"
                >
                    &times;
                </button>
            </header>

            <div className="flex-grow p-4 overflow-y-auto">
                <dl className="bg-black/20 rounded-lg overflow-hidden border border-white/10">
                    <DetailRow label="Node ID">{node.id}</DetailRow>
                    
                    {node.widgets_values && node.widgets_values.length > 0 && (
                        <DetailRow label="Widget Values">
                            <ul className="space-y-2">
                                {node.widgets_values.map((val, index) => (
                                    <li key={index} className="text-sm flex items-baseline">
                                        <span className="font-mono bg-black/20 px-1.5 py-0.5 rounded mr-2 text-gray-300 text-xs">{index}:</span>
                                        <div className="flex-1">{renderValue(val)}</div>
                                    </li>
                                ))}
                            </ul>
                        </DetailRow>
                    )}

                    {node.properties && Object.keys(node.properties).length > 0 && (
                        <DetailRow label="Properties">
                            <dl className="space-y-1">
                            {Object.entries(node.properties).map(([key, value]) => (
                                <div key={key} className="grid grid-cols-2">
                                    <dt className="text-xs text-gray-500 truncate">{key}</dt>
                                    <dd>{renderValue(value)}</dd>
                                </div>
                            ))}
                            </dl>
                        </DetailRow>
                    )}

                    {Array.isArray(node.inputs) && node.inputs.length > 0 && (
                        <DetailRow label="Inputs">
                            <ul className="space-y-1 text-sm">
                                {node.inputs.map((input, index) => (
                                    <li key={index}>
                                       <span className="font-medium text-gray-200">{input.name}</span>
                                       <span className="text-gray-500 ml-2">({input.type})</span>
                                       {input.link !== null && <span className="text-xs text-sky-400 ml-2">[Connected]</span>}
                                    </li>
                                ))}
                            </ul>
                        </DetailRow>
                    )}

                     {Array.isArray(node.outputs) && node.outputs.length > 0 && (
                        <DetailRow label="Outputs">
                            <ul className="space-y-1 text-sm">
                                {node.outputs.map((output, index) => (
                                    <li key={index}>
                                       <span className="font-medium text-gray-200">{output.name}</span>
                                       <span className="text-gray-500 ml-2">({output.type})</span>
                                       {output.links && output.links.length > 0 && <span className="text-xs text-sky-400 ml-2">[{output.links.length} Connection(s)]</span>}
                                    </li>
                                ))}
                            </ul>
                        </DetailRow>
                    )}

                </dl>
            </div>
            
            <footer className="p-3 border-t border-[var(--glass-border)] flex-shrink-0 bg-black/10">
                <button 
                    onClick={onClose}
                    className="w-full px-4 py-2 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-teal-500"
                >
                    Close
                </button>
            </footer>
        </div>
    </div>
  );
};

export default NodeDetailModal;` },
      { name: 'components/OutputPanel.tsx', content: `import React, { useState, useEffect } from 'react';
import WorkflowVisualizer from './WorkflowVisualizer';
import type { GeneratedWorkflowResponse, ValidationLogEntry, DebugLogEntry } from '../types';
import { DownloadIcon, ClipboardIcon, PlayIcon, BugAntIcon, Square2StackIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface OutputPanelProps {
  workflowData: GeneratedWorkflowResponse | null;
  onDownload: () => void;
  onCopy: () => void;
  onRun: () => void;
  onValidate: () => void;
  onLoad: () => void;
}

type Tab = 'visualizer' | 'workflow' | 'requirements' | 'logs';

const OutputPanel: React.FC<OutputPanelProps> = ({ workflowData, onDownload, onCopy, onRun, onValidate, onLoad }) => {
  const [activeTab, setActiveTab] = useState<Tab>('visualizer');
  const t = useTranslations();

  useEffect(() => {
    if (workflowData) {
      const { validationLog, correctionLog } = workflowData;
      const hasCorrectionsOrErrors = (validationLog && validationLog.some(l => l.status === 'corrected' || l.status === 'failed')) || (correctionLog && correctionLog.length > 0);
      
      if (hasCorrectionsOrErrors) {
        setActiveTab('logs');
      } else {
        setActiveTab('visualizer');
      }
    } else {
        setActiveTab('visualizer');
    }
  }, [workflowData]);

  if (!workflowData) {
    return (
      <div className="w-full lg:w-1/2 glass-panel rounded-2xl flex flex-col items-center justify-center text-center p-6">
        <div className="text-gray-500">
           <div className="relative w-24 h-24 mx-auto mb-4">
              <div className="absolute inset-0 bg-teal-500/20 rounded-full animate-ping"></div>
              <svg xmlns="http://www.w3.org/2000/svg" className="relative w-24 h-24 text-teal-400/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M12 14.5v-5.714c0-.597-.237-1.17-.659-1.591L7 3.104M12 14.5c0 0-3.032 3.032-3.75 3.75M12 14.5c0 0 3.032 3.032 3.75 3.75" />
              </svg>
           </div>
          <h3 className="text-2xl font-bold text-gray-400">{t.waitingForGeneration}</h3>
          <p className="mt-2 max-w-sm text-gray-500">{t.waitingForGenerationSubtext}</p>
        </div>
      </div>
    );
  }

  const { workflow, requirements, validationLog, correctionLog } = workflowData;
  const hasLogs = (validationLog && validationLog.length > 0) || (correctionLog && correctionLog.length > 0);

  const renderLogEntry = (log: ValidationLogEntry | DebugLogEntry, index: number) => {
    const isValidationLog = 'check' in log;
    const status = isValidationLog ? log.status : 'corrected';
    
    const colorClass = {
        passed: 'border-green-500/50',
        corrected: 'border-sky-500/50',
        failed: 'border-red-500/50',
    }[status];

    const textColorClass = {
        passed: 'text-green-400',
        corrected: 'text-sky-400',
        failed: 'text-red-400',
    }[status];
    
    return (
        <div key={index} className={\`p-4 bg-black/20 border-l-4 \${colorClass} rounded-r-lg\`}>
            {isValidationLog ? (
                <>
                    <p className="font-semibold text-gray-200">{log.check}: <span className={\`font-bold uppercase text-sm \${textColorClass}\`}>{log.status}</span></p>
                    <p className="text-sm text-gray-400 mt-1">{log.details}</p>
                </>
            ) : (
                <>
                    <p className="font-semibold text-gray-200">{t.correctionAnalysis}</p>
                    <p className="text-sm text-gray-400 mt-2"><strong className="text-gray-300">{t.analysis}</strong> {log.analysis}</p>
                    <p className="text-sm text-gray-400 mt-1"><strong className="text-gray-300">{t.action}</strong> {log.action}</p>
                    <p className="text-sm text-gray-400 mt-1"><strong className="text-gray-300">{t.reasoning}</strong> {log.reasoning}</p>
                </>
            )}
        </div>
    );
  };

  const tabConfig: {key: Tab, label: string}[] = [
      { key: 'visualizer', label: t.outputVisualizer },
      { key: 'workflow', label: t.outputWorkflow },
      { key: 'requirements', label: t.outputRequirements },
  ];

  if (hasLogs) {
      tabConfig.push({ key: 'logs', label: t.outputLogs });
  }

  return (
    <div className="w-full lg:w-1/2 glass-panel rounded-2xl flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-3 flex justify-between items-center border-b border-[var(--glass-border)]">
        <div className="flex space-x-1 bg-black/20 p-1 rounded-full">
          {tabConfig.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={\`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-300 \${
                activeTab === tab.key ? 'bg-sky-500/80 text-white shadow-sm' : 'text-gray-300 hover:bg-white/10'
              }\`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center space-x-2">
            <button onClick={onValidate} title={t.tooltipValidate} className="p-2.5 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><BugAntIcon className="w-5 h-5" /></button>
            <button onClick={onRun} title={t.tooltipRun} className="p-2.5 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><PlayIcon className="w-5 h-5" /></button>
            <button onClick={onLoad} title={t.tooltipLoad} className="p-2.5 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><Square2StackIcon className="w-5 h-5" /></button>
            <button onClick={onCopy} title={t.tooltipCopy} className="p-2.5 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><ClipboardIcon className="w-5 h-5" /></button>
            <button onClick={onDownload} title={t.tooltipDownload} className="p-2.5 bg-teal-500/90 rounded-full hover:bg-teal-500 transition-colors"><DownloadIcon className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex-grow overflow-auto">
        {activeTab === 'visualizer' && <WorkflowVisualizer workflow={workflow} />}
        {activeTab === 'workflow' && (
          <pre className="text-xs p-4 text-gray-300 bg-black/10 h-full">
            <code>{JSON.stringify(workflow, null, 2)}</code>
          </pre>
        )}
        {activeTab === 'requirements' && (
          <div className="p-6 space-y-6">
             <h3 className="text-lg font-bold text-gray-200">{t.customNodes}</h3>
             {requirements.custom_nodes.length > 0 ? requirements.custom_nodes.map((node, i) => (
                <div key={i} className="p-4 bg-black/20 rounded-xl">
                    <p className="font-semibold text-gray-100">{node.name}</p>
                    {node.url && <a href={node.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline">{node.url}</a>}
                    <pre className="text-xs mt-2 p-3 bg-black/30 rounded-lg whitespace-pre-wrap font-mono"><code>{node.install_instructions}</code></pre>
                </div>
             )) : <p className="text-sm text-gray-500">{t.noCustomNodes}</p>}
             <h3 className="text-lg font-bold text-gray-200">{t.models}</h3>
              {requirements.models.length > 0 ? requirements.models.map((model, i) => (
                <div key={i} className="p-4 bg-black/20 rounded-xl">
                    <p className="font-semibold text-gray-100">{model.name} <span className="text-xs text-gray-400">({model.model_type})</span></p>
                    {model.url && <a href={model.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline">{t.downloadLink}</a>}
                    {model.install_path && <p className="text-xs text-gray-500 mt-1">{t.installTo} <code className="bg-black/20 px-1 rounded">{model.install_path}</code></p>}
                </div>
              )) : <p className="text-sm text-gray-500">{t.noModels}</p>}
          </div>
        )}
        {activeTab === 'logs' && hasLogs && (
            <div className="p-6 space-y-4">
                {validationLog && validationLog.map(renderLogEntry)}
                {correctionLog && correctionLog.map(renderLogEntry)}
            </div>
        )}
      </div>
    </div>
  );
};

export default OutputPanel;` },
      { name: 'components/PromptOptimizerModal.tsx', content: `import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat } from "@google/genai";
import { SparklesIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface PromptOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt: string;
  onOptimize: (optimizedPrompt: string) => void;
}

interface Message {
  sender: 'user' | 'model';
  text: string;
}

const SYSTEM_INSTRUCTION_OPTIMIZER = \`You are a 'Prompt Optimizer' assistant for a text-to-image AI system. Your goal is to help a user refine their initial, simple idea into a detailed and effective prompt. The user will provide an initial prompt. You must ask them a series of clarifying questions to understand their vision better. Ask about:
1.  **Subject & Style:** What is the main subject? What artistic style should be used (e.g., photorealistic, oil painting, cartoon, fantasy, sci-fi)?
2.  **Details & Composition:** What specific details should be included? How should the scene be composed (e.g., close-up, wide shot)?
3.  **Lighting & Atmosphere:** What kind of lighting is there (e.g., soft morning light, dramatic neon, moody darkness)? What is the overall mood or atmosphere?
4.  **Color Palette:** Is there a specific color scheme?

After you have gathered enough information (usually after 2-3 questions), synthesize all the details into a single, comprehensive, and well-structured final prompt in German. Present this final prompt clearly inside a \\\`[PROMPT]\\\` block, like this:
Hier ist Ihr optimierter Prompt:
[PROMPT]
Ein fotorealistisches Bild einer majestätischen Siamkatze mit leuchtend blauen Augen, die auf einem samtigen roten Kissen sitzt. Das sanfte Morgenlicht fällt durch ein Fenster und wirft lange Schatten. Die Atmosphäre ist ruhig und friedlich.
[/PROMPT]

Your entire conversation must be in German. Start the conversation by asking your first question based on the user's initial prompt.\`;


const PromptOptimizerModal: React.FC<PromptOptimizerModalProps> = ({ isOpen, onClose, initialPrompt, onOptimize }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const t = useTranslations();

  useEffect(() => {
    if (isOpen) {
      if (!process.env.API_KEY) {
        console.error("API key is missing.");
        setMessages([{ sender: 'model', text: t.optimizerErrorApiKey }]);
        return;
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const newChat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction: SYSTEM_INSTRUCTION_OPTIMIZER },
      });
      setChat(newChat);
      setMessages([]);
      setFinalPrompt(null);
      
      const firstMessage = initialPrompt.trim() || "Beschreibe ein Bild.";
      setMessages([{ sender: 'user', text: firstMessage }]);
      setIsLoading(true);

      newChat.sendMessage({ message: firstMessage }).then(response => {
        setMessages(prev => [...prev, { sender: 'model', text: response.text }]);
      }).catch(err => {
        console.error("Error starting chat:", err);
        setMessages(prev => [...prev, { sender: 'model', text: t.optimizerErrorGeneral }]);
      }).finally(() => {
        setIsLoading(false);
      });
    }
  }, [isOpen, initialPrompt, t.optimizerErrorApiKey, t.optimizerErrorGeneral]);
  
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);


  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading || !chat) return;

    const newUserMessage: Message = { sender: 'user', text: userInput };
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsLoading(true);

    try {
      const response = await chat.sendMessage({ message: newUserMessage.text });
      const responseText = response.text;
      
      const promptRegex = /\\\[PROMPT\\\]([\\s\\S]*?)\\\\[\\/PROMPT\\\]/;
      const match = responseText.match(promptRegex);
      if (match && match[1]) {
        setFinalPrompt(match[1].trim());
      }
      
      setMessages(prev => [...prev, { sender: 'model', text: responseText }]);
    } catch (err) {
      console.error("Error sending message:", err);
      setMessages(prev => [...prev, { sender: 'model', text: t.optimizerErrorCommunication }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-panel rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between p-4 border-b border-[var(--glass-border)] flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center text-gray-100">
            <SparklesIcon className="w-6 h-6 mr-3 text-sky-400" />
            {t.promptAssistant}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </header>
        
        <div ref={chatContainerRef} className="flex-grow p-4 overflow-y-auto space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={\`flex \${msg.sender === 'user' ? 'justify-end' : 'justify-start'}\`}>
              <div className={\`max-w-lg p-3 rounded-lg \${msg.sender === 'user' ? 'bg-sky-500/80 text-white' : 'bg-black/20 text-gray-200'}\`}>
                {msg.text.split('\\n').map((line, i) => <p key={i}>{line}</p>)}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
               <div className="max-w-lg p-3 rounded-lg bg-black/20 text-gray-200 flex items-center space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-0"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-150"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-300"></div>
               </div>
            </div>
          )}
        </div>
        
        <footer className="p-4 border-t border-[var(--glass-border)] flex-shrink-0">
          {finalPrompt ? (
             <div className="text-center">
                <p className="text-sm text-green-400 mb-3">{t.optimizerPromptCreated}</p>
                <button
                    onClick={() => onOptimize(finalPrompt)}
                    className="w-full px-6 py-3 bg-green-600/90 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors"
                >
                    {t.optimizerUsePrompt}
                </button>
             </div>
          ) : (
            <div className="flex space-x-2">
                <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder={t.optimizerPlaceholder}
                    className="flex-grow p-3 bg-black/20 border border-transparent focus:border-teal-500/50 rounded-lg focus:ring-2 focus:ring-teal-400 transition-all duration-300"
                    disabled={isLoading}
                />
                <button
                    onClick={handleSendMessage}
                    disabled={isLoading || !userInput.trim()}
                    className="px-6 py-3 bg-teal-500/90 text-white font-semibold rounded-lg hover:bg-teal-500 disabled:bg-gray-600/50 transition-colors"
                >
                    {t.optimizerSend}
                </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
};

export default PromptOptimizerModal;` },
      { name: 'components/SettingsModal.tsx', content: `import React from 'react';
import { useTranslations } from '../hooks/useTranslations';
import { DownloadIcon } from './Icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  comfyUIUrl: string;
  setComfyUIUrl: (url: string) => void;
  localLlmApiUrl: string;
  setLocalLlmApiUrl: (url: string) => void;
  onDownloadSourceCode: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, comfyUIUrl, setComfyUIUrl, localLlmApiUrl, setLocalLlmApiUrl, onDownloadSourceCode }) => {
  const t = useTranslations();
  if (!isOpen) return null;

  const handleSave = () => {
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        className="glass-panel rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-[var(--glass-border)]">
          <h2 id="settings-title" className="text-lg font-bold text-gray-100">{t.settingsTitle}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl font-bold"
            aria-label={t.settingsClose}
          >
            &times;
          </button>
        </header>

        <div className="p-6 space-y-6">
            <div>
                <label htmlFor="comfy-url-input" className="block text-sm font-medium text-gray-300 mb-2">{t.settingsComfyUrl}</label>
                <input
                    id="comfy-url-input"
                    type="text"
                    value={comfyUIUrl}
                    onChange={(e) => setComfyUIUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8188"
                    className="w-full p-2 bg-black/20 border border-transparent focus:border-teal-500/50 rounded-lg focus:ring-2 focus:ring-teal-400 transition-all"
                />
                <p className="mt-2 text-xs text-gray-400">
                    {t.settingsComfyUrlHelp}
                </p>
            </div>
             <div>
                <label htmlFor="local-llm-url-input" className="block text-sm font-medium text-gray-300 mb-2">{t.settingsLocalLlmUrl}</label>
                <input
                    id="local-llm-url-input"
                    type="text"
                    value={localLlmApiUrl}
                    onChange={(e) => setLocalLlmApiUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8000"
                    className="w-full p-2 bg-black/20 border border-transparent focus:border-teal-500/50 rounded-lg focus:ring-2 focus:ring-teal-400 transition-all"
                />
                <p className="mt-2 text-xs text-gray-400">
                    {t.settingsLocalLlmUrlHelp}
                </p>
            </div>
             <div className="border-t border-[var(--glass-border)] pt-6">
                 <h3 className="text-md font-semibold text-gray-200 mb-1">{t.settingsDownloadSource}</h3>
                 <p className="mt-1 text-xs text-gray-400 mb-3">
                    {t.settingsDownloadSourceHelp}
                 </p>
                 <button
                    onClick={onDownloadSourceCode}
                    className="w-full flex items-center justify-center px-4 py-2 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-teal-500"
                >
                    <DownloadIcon className="w-5 h-5 mr-2" />
                    {t.settingsDownloadSource}
                </button>
            </div>
        </div>

        <footer className="p-4 border-t border-[var(--glass-border)] bg-black/10 flex justify-end">
            <button
                onClick={handleSave}
                className="px-5 py-2 bg-teal-500/90 text-white font-semibold rounded-lg hover:bg-teal-500 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-teal-500"
            >
                {t.settingsSave}
            </button>
        </footer>
      </div>
    </div>
  );
};

export default SettingsModal;` },
      { name: 'components/TesterPanel.tsx', content: `import React, { useState } from 'react';
import { WrenchIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface TesterPanelProps {
  onValidate: (workflowJson: string, errorMessage:string) => void;
  isLoading: boolean;
}

const TesterPanel: React.FC<TesterPanelProps> = ({ onValidate, isLoading }) => {
  const [workflowJson, setWorkflowJson] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const t = useTranslations();

  const handleValidateClick = () => {
    setJsonError(null);
    if (!workflowJson.trim()) {
        setJsonError(t.testerErrorJsonEmpty);
        return;
    }
    try {
        JSON.parse(workflowJson);
        onValidate(workflowJson, errorMessage);
    } catch (e) {
        setJsonError(t.testerErrorJsonInvalid);
    }
  };

  return (
    <div className="w-full lg:w-1/2 glass-panel rounded-2xl p-8 flex flex-col space-y-6" role="tabpanel">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">{t.testerTitle}</h2>
        <p className="text-sm text-gray-400 mt-1">
          {t.testerSubtext}
        </p>
      </div>

      <div>
        <label htmlFor="workflow-json-input" className="block text-sm font-medium text-gray-300 mb-2">{t.testerWorkflowJsonLabel}</label>
        <textarea
            id="workflow-json-input"
            value={workflowJson}
            onChange={(e) => {
                setWorkflowJson(e.target.value);
                if (jsonError) setJsonError(null);
            }}
            placeholder={t.testerWorkflowJsonPlaceholder}
            className={\`w-full h-80 p-4 bg-black/20 rounded-xl resize-y focus:ring-2 border transition-all duration-300 text-gray-200 placeholder-gray-500 \${jsonError ? 'border-red-500/50 focus:ring-red-500' : 'border-transparent focus:border-teal-500/50 focus:ring-teal-400'}\`}
            disabled={isLoading}
            aria-label="Workflow JSON Input"
            aria-invalid={!!jsonError}
            aria-describedby={jsonError ? "json-error" : undefined}
        />
        {jsonError && <p id="json-error" className="mt-2 text-sm text-red-400">{jsonError}</p>}
      </div>
      
      <div>
        <label htmlFor="error-message-input" className="block text-sm font-medium text-gray-300 mb-2">{t.testerErrorLabel}</label>
        <textarea
            id="error-message-input"
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
            placeholder={t.testerErrorPlaceholder}
            className="w-full h-28 p-4 bg-black/20 rounded-xl resize-y focus:ring-2 focus:ring-teal-400 border border-transparent focus:border-teal-500/50 transition-all duration-300 text-gray-200 placeholder-gray-500"
            disabled={isLoading}
            aria-label="ComfyUI Error Message Input"
        />
      </div>
      
      <button
        onClick={handleValidateClick}
        disabled={isLoading || !workflowJson.trim()}
        className="w-full flex items-center justify-center px-6 py-4 bg-sky-500/90 text-white font-bold rounded-xl shadow-lg hover:bg-sky-500 disabled:bg-gray-600/50 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-300"
      >
        {isLoading ? (
          <div className="w-6 h-6 border-2 border-dashed rounded-full animate-spin border-white"></div>
        ) : (
          <>
            <WrenchIcon className="w-5 h-5 mr-2" />
            {errorMessage.trim() ? t.testerButtonDebug : t.testerButtonValidate}
          </>
        )}
      </button>
    </div>
  );
};

export default TesterPanel;` },
      { name: 'components/Toast.tsx', content: `import React, { useEffect } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon } from './Icons';

interface ToastProps {
    message: string;
    type: 'success' | 'error';
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 5000); // Auto-dismiss after 5 seconds

        return () => clearTimeout(timer);
    }, [onClose]);

    const isSuccess = type === 'success';
    const baseStyle = 'bg-opacity-50 backdrop-blur-lg border';
    const successStyle = 'bg-green-500 border-green-400/50 shadow-lg shadow-green-500/20';
    const errorStyle = 'bg-red-500 border-red-400/50 shadow-lg shadow-red-500/20';
    const Icon = isSuccess ? CheckCircleIcon : ExclamationCircleIcon;

    return (
        <div className="fixed bottom-5 right-5 z-50">
            <div className={\`flex items-center p-4 rounded-xl text-white \${baseStyle} \${isSuccess ? successStyle : errorStyle}\`}>
                <Icon className="w-6 h-6 mr-3" />
                <p className="text-sm font-medium">{message}</p>
                <button onClick={onClose} className="ml-4 text-xl font-semibold hover:opacity-75">&times;</button>
            </div>
        </div>
    );
};

export default Toast;` },
      { name: 'components/WorkflowVisualizer.tsx', content: `import React, { useState } from 'react';
import type { ComfyUIWorkflow, ComfyUINode } from '../types';
import NodeDetailModal from './NodeDetailModal';

// Constants for styling and layout
const NODE_HEADER_HEIGHT = 30;
const SLOT_HEIGHT = 20;
const NODE_PADDING = 10;

const typeColorMapping: { [key: string]: string } = {
  'MODEL': 'stroke-red-500',
  'CONDITIONING': 'stroke-yellow-500',
  'LATENT': 'stroke-purple-500',
  'VAE': 'stroke-cyan-500',
  'IMAGE': 'stroke-green-500',
  'CLIP': 'stroke-blue-500',
  '*': 'stroke-gray-400',
};

const getNodeColor = (type: string) => {
    if (type.includes('Loader')) return 'bg-blue-500/50';
    if (type.includes('Sampler')) return 'bg-red-500/50';
    if (type.includes('Encode')) return 'bg-yellow-500/50';
    if (type.includes('Decode')) return 'bg-cyan-500/50';
    if (type.includes('Image')) return 'bg-green-500/50';
    return 'bg-gray-500/50';
};


const WorkflowNode: React.FC<{ node: ComfyUINode; onClick: () => void; }> = ({ node, onClick }) => {
  const nodeHeight = Math.max(
    (Array.isArray(node.inputs) ? node.inputs.length : 0) * SLOT_HEIGHT,
    (Array.isArray(node.outputs) ? node.outputs.length : 0) * SLOT_HEIGHT
  ) + NODE_HEADER_HEIGHT + NODE_PADDING * 2;
  
  // Use provided size if available, otherwise calculate
  const width = node.size ? node.size['0'] : 250;
  const height = node.size ? node.size['1'] : nodeHeight;

  return (
    <div
      id={\`node-\${node.id}\`}
      className="absolute glass-panel rounded-lg shadow-lg text-white text-xs cursor-pointer hover:border-teal-400/80 transition-colors"
      style={{
        left: \`\${node.pos[0]}px\`,
        top: \`\${node.pos[1]}px\`,
        width: \`\${width}px\`,
        minHeight: \`\${height}px\`,
      }}
      onClick={onClick}
    >
      <div className={\`p-2 rounded-t-lg font-bold \${getNodeColor(node.type)}\`}>
        {node.title || node.type}
      </div>
      <div className="relative p-2">
        {Array.isArray(node.inputs) && node.inputs.map((input, index) => (
          <div key={index} className="flex items-center" style={{ height: \`\${SLOT_HEIGHT}px\` }}>
            <div className="w-2 h-2 rounded-full bg-gray-400 mr-2"></div>
            <span>{input.name}</span>
          </div>
        ))}
        {Array.isArray(node.outputs) && node.outputs.map((output, index) => (
          <div key={index} className="absolute flex items-center right-2" style={{ top: \`\${NODE_HEADER_HEIGHT + index * SLOT_HEIGHT}px\`, height: \`\${SLOT_HEIGHT}px\`}}>
             <span>{output.name}</span>
            <div className="w-2 h-2 rounded-full bg-gray-400 ml-2"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

const WorkflowVisualizer: React.FC<{ workflow: ComfyUIWorkflow }> = ({ workflow }) => {
  const [selectedNode, setSelectedNode] = useState<ComfyUINode | null>(null);

  if (!workflow || !workflow.nodes) {
    return null;
  }

  const nodesById = new Map(workflow.nodes.map(node => [node.id, node]));

  // Calculate bounding box to set SVG size
  let maxX = 0;
  let maxY = 0;
  workflow.nodes.forEach(node => {
      const width = node.size ? node.size['0'] : 250;
      const height = node.size ? node.size['1'] : 100;
      maxX = Math.max(maxX, node.pos[0] + width);
      maxY = Math.max(maxY, node.pos[1] + height);
  });
  
  const getSlotPosition = (node: ComfyUINode, slotIndex: number, isInput: boolean) => {
    const x = isInput ? node.pos[0] : node.pos[0] + (node.size ? node.size['0'] : 250);
    const y = node.pos[1] + NODE_HEADER_HEIGHT + (slotIndex * SLOT_HEIGHT) + (SLOT_HEIGHT / 2);
    return { x, y };
  };

  return (
    <div className="relative w-full h-full overflow-auto p-4">
        <div className="relative" style={{ width: \`\${maxX + 50}px\`, height: \`\${maxY + 50}px\`}}>
            <svg className="absolute top-0 left-0 w-full h-full" style={{ zIndex: 0 }}>
                <defs>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {workflow.links.map(link => {
                    const fromNode = nodesById.get(link[1]);
                    const toNode = nodesById.get(link[3]);
                    
                    if (!fromNode || !toNode) return null;

                    const fromSlotIndex = link[2];
                    const toSlotIndex = link[4];
                    const linkType = link[5];

                    // FIX: Explicitly cast fromNode and toNode to ComfyUINode to resolve a type inference issue where they were being treated as 'unknown'.
                    const startPos = getSlotPosition(fromNode as ComfyUINode, fromSlotIndex, false);
                    const endPos = getSlotPosition(toNode as ComfyUINode, toSlotIndex, true);
                    
                    const controlPointX1 = startPos.x + 80;
                    const controlPointY1 = startPos.y;
                    const controlPointX2 = endPos.x - 80;
                    const controlPointY2 = endPos.y;

                    const pathData = \`M \${startPos.x} \${startPos.y} C \${controlPointX1} \${controlPointY1}, \${controlPointX2} \${controlPointY2}, \${endPos.x} \${endPos.y}\`;
                    
                    const colorClass = typeColorMapping[linkType] || typeColorMapping['*'];

                    return (
                        <path
                            key={link[0]}
                            d={pathData}
                            className={\`\${colorClass} fill-none\`}
                            strokeWidth="2"
                            style={{ filter: 'url(#glow)' }}
                        />
                    );
                })}
            </svg>
            <div className="relative" style={{ zIndex: 1 }}>
                {workflow.nodes.map(node => (
                    <WorkflowNode 
                        key={node.id} 
                        node={node} 
                        onClick={() => setSelectedNode(node)} 
                    />
                ))}
            </div>
        </div>
        {selectedNode && (
            <NodeDetailModal 
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
            />
        )}
    </div>
  );
};

export default WorkflowVisualizer;` },
      { name: 'components/WorkflowWizardModal.tsx', content: `import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat } from "@google/genai";
import { CpuChipIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface WorkflowWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (technicalPrompt: string) => void;
}

interface Message {
  sender: 'user' | 'model';
  text: string;
}

const SYSTEM_INSTRUCTION_WIZARD = \`You are a 'ComfyUI Workflow Wizard'. Your purpose is to guide a user through a series of technical questions to construct a precise, technical prompt for another AI that will generate the final ComfyUI workflow JSON. You must speak German.

Your process is as follows:
1.  Start by asking the user for the general type of workflow they want to create. Offer examples like 'Text-to-Image', 'Image-to-Image', 'Inpainting', 'ControlNet', 'AnimateDiff'.
2.  Based on their answer, ask specific follow-up questions.
    *   If 'Text-to-Image' -> Ask about the model (SD 1.5, SDXL). If SDXL, ask if they need a refiner.
    *   If 'ControlNet' -> Ask which ControlNet model they want (Canny, OpenPose, Depth, etc.) and what base model to use with it.
    *   If 'Inpainting' -> Ask for the base model and what kind of mask generation they need.
    *   Always ask about samplers (e.g., \\\`euler\\\`, \\\`dpmpp_2m_sde\\\`), schedulers, and image dimensions if relevant.
3.  Keep the conversation concise and focused on technical specifications. Avoid creative or stylistic questions.
4.  After gathering all necessary information (typically 3-4 questions), synthesize the answers into a single, clear, technical prompt.
5.  This final prompt MUST be enclosed in \\\`[WORKFLOW_PROMPT]\\\` and \\\`[/WORKFLOW_PROMPT]\\\` tags.

Example conversation:
User: "Ich brauche einen Text-zu-Bild Workflow."
You: "Verstanden. Welches Basis-Modell möchten Sie verwenden? SD 1.5 oder SDXL?"
User: "SDXL"
You: "Möchten Sie einen Refiner-Node für den SDXL-Workflow verwenden?"
User: "Ja"
You: "In Ordnung. Welchen Sampler und Scheduler bevorzugen Sie? (z.B. Sampler: euler, Scheduler: normal)"
User: "dpmpp_2m_sde karras"
You: "Perfekt. Hier ist der technische Prompt für den Generator:"
[WORKFLOW_PROMPT]
Erstelle einen SDXL Text-zu-Bild Workflow. Der Workflow soll einen Base-Loader und einen Refiner-Loader verwenden. Nutze einen KSampler für den Base-Pass und einen zweiten KSampler für den Refiner-Pass. Konfiguriere beide KSampler mit dem Sampler 'dpmpp_2m_sde' und dem Scheduler 'karras'. Das finale Bild soll gespeichert werden.
[/WORKFLOW_PROMPT]

Start the conversation now by asking the user what kind of workflow they want to create.\`;


const WorkflowWizardModal: React.FC<WorkflowWizardModalProps> = ({ isOpen, onClose, onComplete }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const t = useTranslations();

  useEffect(() => {
    if (isOpen) {
      if (!process.env.API_KEY) {
        console.error("API key is missing.");
        setMessages([{ sender: 'model', text: t.optimizerErrorApiKey }]);
        return;
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const newChat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction: SYSTEM_INSTRUCTION_WIZARD },
      });
      setChat(newChat);
      setMessages([]);
      setFinalPrompt(null);
      setIsLoading(true);

      newChat.sendMessage({ message: "Start" }).then(response => {
        setMessages(prev => [...prev, { sender: 'model', text: response.text }]);
      }).catch(err => {
        console.error("Error starting wizard chat:", err);
        setMessages(prev => [...prev, { sender: 'model', text: t.optimizerErrorGeneral }]);
      }).finally(() => {
        setIsLoading(false);
      });
    }
  }, [isOpen, t.optimizerErrorApiKey, t.optimizerErrorGeneral]);
  
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);


  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading || !chat) return;

    const newUserMessage: Message = { sender: 'user', text: userInput };
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsLoading(true);

    try {
      const response = await chat.sendMessage({ message: newUserMessage.text });
      const responseText = response.text;
      
      const promptRegex = /\\\[WORKFLOW_PROMPT\\\]([\\s\\S]*?)\\\\[\\/WORKFLOW_PROMPT\\\]/;
      const match = responseText.match(promptRegex);
      if (match && match[1]) {
        setFinalPrompt(match[1].trim());
      }
      
      setMessages(prev => [...prev, { sender: 'model', text: responseText }]);
    } catch (err) {
      console.error("Error sending message:", err);
      setMessages(prev => [...prev, { sender: 'model', text: t.optimizerErrorCommunication }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-panel rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between p-4 border-b border-[var(--glass-border)] flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center text-gray-100">
            <CpuChipIcon className="w-6 h-6 mr-3 text-indigo-400" />
            {t.workflowWizard}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </header>
        
        <div ref={chatContainerRef} className="flex-grow p-4 overflow-y-auto space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={\`flex \${msg.sender === 'user' ? 'justify-end' : 'justify-start'}\`}>
              <div className={\`max-w-lg p-3 rounded-lg \${msg.sender === 'user' ? 'bg-indigo-500/80 text-white' : 'bg-black/20 text-gray-200'}\`}>
                {msg.text.split('\\n').map((line, i) => <p key={i}>{line}</p>)}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
               <div className="max-w-lg p-3 rounded-lg bg-black/20 text-gray-200 flex items-center space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-0"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-150"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-300"></div>
               </div>
            </div>
          )}
        </div>
        
        <footer className="p-4 border-t border-[var(--glass-border)] flex-shrink-0">
          {finalPrompt ? (
             <div className="text-center">
                <p className="text-sm text-green-400 mb-3">{t.wizardPromptCreated}</p>
                <button
                    onClick={() => onComplete(finalPrompt)}
                    className="w-full px-6 py-3 bg-green-600/90 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors"
                >
                    {t.wizardUsePrompt}
                </button>
             </div>
          ) : (
            <div className="flex space-x-2">
                <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder={t.wizardPlaceholder}
                    className="flex-grow p-3 bg-black/20 border border-transparent focus:border-teal-500/50 rounded-lg focus:ring-2 focus:ring-teal-400 transition-all duration-300"
                    disabled={isLoading}
                />
                <button
                    onClick={handleSendMessage}
                    disabled={isLoading || !userInput.trim()}
                    className="px-6 py-3 bg-teal-500/90 text-white font-semibold rounded-lg hover:bg-teal-500 disabled:bg-gray-600/50 transition-colors"
                >
                    {t.wizardSend}
                </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
};

export default WorkflowWizardModal;` },
      { name: 'context/LanguageContext.tsx', content: `import React, { createContext, useState, useEffect, useContext } from 'react';

export type Language = 'en' | 'de';

interface LanguageContextType {
  language: Language;
  setLanguage: React.Dispatch<React.SetStateAction<Language>>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const savedLang = localStorage.getItem('language');
      if (savedLang === 'en' || savedLang === 'de') {
        return savedLang;
      }
    } catch (e) {
      console.error("Could not read language from localStorage", e);
    }
    return 'de';
  });

  useEffect(() => {
    try {
      localStorage.setItem('language', language);
      document.documentElement.lang = language;
    } catch (e) {
      console.error("Could not save language to localStorage", e);
    }
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};` },
      { name: 'hooks/useTranslations.ts', content: `import { useLanguage } from '../context/LanguageContext';
import { translations } from '../translations';

export const useTranslations = () => {
  const { language } = useLanguage();
  return translations[language];
};` },
      { name: 'index.html', content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI ComfyUI Workflow Assistant</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      
      :root {
        --background-start: #1a0b36;
        --background-end: #0f2c3d;
        --glass-bg: rgba(28, 36, 56, 0.6);
        --glass-border: rgba(255, 255, 255, 0.1);
        --accent-glow: 0 0 15px rgba(20, 220, 190, 0.6);
        --text-primary: #e5e7eb;
        --text-secondary: #9ca3af;
      }

      body {
        font-family: 'Inter', sans-serif;
        background-color: var(--background-start);
        background-image: linear-gradient(135deg, var(--background-start) 0%, var(--background-end) 100%);
        background-attachment: fixed;
        color: var(--text-primary);
      }
      
      .glass-panel {
        background-color: var(--glass-bg);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid var(--glass-border);
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      }

      .btn-glow {
        box-shadow: var(--accent-glow);
      }
      
      /* Custom scrollbar for a modern look */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      ::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 10px;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 10px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
      }

    </style>
  <script type="importmap">
{
  "imports": {
    "@google/genai": "https://aistudiocdn.com/@google/genai@^1.16.0",
    "react-dom/": "https://aistudiocdn.com/react-dom@^19.1.1/",
    "react/": "https://aistudiocdn.com/react@^19.1.1/",
    "react": "https://aistudiocdn.com/react@^19.1.1",
    "uuid": "https://aistudiocdn.com/uuid@^11.1.0",
    "react-dropzone": "https://aistudiocdn.com/react-dropzone@^14.3.8"
  }
}
</script>
</head>
  <body class="text-gray-200">
    <div id="root"></div>
    <script type="module" src="/index.tsx"></script>
  </body>
</html>` },
      { name: 'index.tsx', content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './context/LanguageContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);` },
      { name: 'metadata.json', content: `{
  "name": "AI ComfyUI Workflow Suite",
  "description": "An AI-powered application that generates ComfyUI workflows from natural language descriptions. Describe your desired image generation process, and the AI will construct a complete, downloadable JSON workflow file.",
  "requestFramePermissions": []
}` },
      { name: 'public/Bedienungsanleitung.md', content: `# Bedienungsanleitung: AI ComfyUI Workflow Suite

Herzlich willkommen zur AI ComfyUI Workflow Suite! Dieses Tool wurde entwickelt, um Ihnen die Erstellung, Validierung und Korrektur von ComfyUI-Workflows so einfach wie möglich zu machen. Egal, ob Sie ein Anfänger oder ein erfahrener ComfyUI-Nutzer sind, diese Suite hilft Ihnen, Ihre Ideen schnell in funktionierende Workflows umzusetzen.

## Inhaltsverzeichnis
1.  [Übersicht der Benutzeroberfläche](#übersicht-der-benutzeroberfläche)
2.  [Der "Generator"-Tab](#der-generator-tab-workflows-erstellen)
3.  [Der "Tester"-Tab](#der-tester-tab-workflows-prüfen-und-reparieren)
4.  [Der "Verlauf"-Tab](#der-verlauf-tab-frühere-arbeiten-verwalten)
5.  [Der "Lokales LLM"-Tab](#der-lokales-llm-tab-lokales-llm-verwalten)
6.  [Das Ausgabefenster im Detail](#das-ausgabefenster-im-detail)
7.  [Einstellungen](#einstellungen)
8.  [Tipps für beste Ergebnisse](#tipps-für-beste-ergebnisse)

---

## Übersicht der Benutzeroberfläche

Die Anwendung ist in einige Hauptbereiche unterteilt:

-   **Header:** Zeigt den Namen der Anwendung an. Oben rechts finden Sie ein Zahnrad-Symbol (\`⚙️\`) für die **Einstellungen** und einen Schalter, um die Sprache zwischen Deutsch und Englisch zu wechseln.
-   **Tab-Leiste:** Hier können Sie zwischen den verschiedenen Funktionen wechseln: \`Generator\`, \`Tester\`, \`Verlauf\`, \`Lokales LLM\` und \`Dokumentation\`.
-   **Hauptfenster:** Dieses ist zweigeteilt. Die linke Hälfte ändert sich je nach gewähltem Tab (Eingabebereich), während die rechte Hälfte immer das **Ausgabefenster** ist, in dem die Ergebnisse angezeigt werden.

---

## Der "Generator"-Tab: Workflows erstellen

Dies ist der Hauptbereich, in dem Sie neue Workflows aus einer einfachen Textbeschreibung erstellen lassen.

### 1. Workflow beschreiben
Geben Sie in das große Textfeld eine Beschreibung dessen ein, was Ihr Workflow tun soll.

-   **Seien Sie detailliert:** Je genauer Ihre Beschreibung, desto besser wird das Ergebnis. Anstatt nur "Ein Bild von einer Katze" zu schreiben, versuchen Sie es mit "Ein fotorealistisches Bild einer Katze im Weltraum mit einem SDXL-Modell, das einen Helm trägt".
-   **Beispiele nutzen:** Unter dem Textfeld finden Sie einige Beispiel-Prompts. Klicken Sie darauf, um sie auszuprobieren.

### 2. Prompt-Assistent
Wenn Sie sich nicht sicher sind, wie Sie Ihren Prompt formulieren sollen, klicken Sie auf den \`Prompt-Assistent\`-Button. Es öffnet sich ein Chatfenster, in dem eine KI Ihnen gezielte Fragen zu Stil, Komposition, Beleuchtung und mehr stellt, um Ihren ursprünglichen Gedanken zu einem perfekten, detaillierten Prompt zu verfeinern.

### 3. Workflow-Assistent
Für technisch versierte Benutzer gibt es den \`Workflow-Assistent\`. Dieser Assistent führt Sie durch eine Reihe technischer Fragen (z.B. welches Modell, welcher Sampler), um einen präzisen, technischen Prompt zu erstellen, der für die Workflow-Generierung optimiert ist.

### 4. Workflow generieren
Wenn Sie mit Ihrer Beschreibung zufrieden sind, klicken Sie auf \`Workflow generieren\`. Eine Fortschrittsanzeige informiert Sie über die einzelnen Schritte: Die KI analysiert Ihre Anfrage, erstellt den Workflow und validiert ihn. Das Ergebnis erscheint im Ausgabefenster.

---

## Der "Tester"-Tab: Workflows prüfen und reparieren

Haben Sie einen bestehenden Workflow, der nicht funktioniert? Hier können Sie ihn reparieren lassen.

-   **Workflow JSON:** Fügen Sie den kompletten JSON-Code Ihres ComfyUI-Workflows in dieses Feld ein.
-   **ComfyUI Fehlermeldung (Optional):** Wenn ComfyUI beim Ausführen des Workflows eine spezifische Fehlermeldung ausgibt, fügen Sie diese hier ein. Die KI wird versuchen, den Workflow gezielt zu korrigieren, um diesen Fehler zu beheben.
-   **Button:**
    -   Wenn Sie nur ein Workflow-JSON einfügen, heißt der Button \`Validieren & korrigieren\`. Die KI führt eine allgemeine Prüfung durch.
    -   Wenn Sie auch eine Fehlermeldung angeben, ändert sich der Button zu \`Fehler beheben\` für eine gezielte Reparatur.

---

## Der "Verlauf"-Tab: Frühere Arbeiten verwalten

Jeder Workflow, den Sie im \`Generator\`-Tab erstellen, wird automatisch hier gespeichert.

-   **Liste:** Zeigt alle bisherigen Generationen mit Prompt und Datum.
-   **Auswählen:** Klicken Sie auf einen Eintrag, um das Ergebnis erneut im Ausgabefenster anzuzeigen.
-   **Herunterladen (\`📥\`):** Laden Sie das Workflow-JSON eines bestimmten Eintrags direkt herunter.
-   **Verlauf löschen:** Entfernt alle Einträge dauerhaft. Diese Aktion kann nicht rückgängig gemacht werden.

---

## Der "Lokales LLM"-Tab: Lokales LLM verwalten

Dieser Tab bietet fortgeschrittene Funktionen zur Interaktion mit einem lokal betriebenen Large Language Model (LLM). **Wichtig:** Diese Funktionen setzen voraus, dass Sie einen kompatiblen lokalen LLM-Server betreiben und dessen Adresse in den \`Einstellungen\` korrekt konfiguriert haben.

### RAG / Wissensdatenbank
RAG (Retrieval-Augmented Generation) ermöglicht es Ihnen, das Wissen des LLMs mit Ihren eigenen Dokumenten zu erweitern, ohne das Modell neu trainieren zu müssen.

1.  **Dateien auswählen:** Ziehen Sie \`.txt\`- oder \`.md\`-Dateien in den Upload-Bereich oder klicken Sie darauf, um Dateien auszuwählen.
2.  **Hochladen:** Klicken Sie auf \`Ausgewählte Dateien hochladen\`, um die Dokumente an den RAG-Service Ihres LLMs zu senden. Die hochgeladenen Inhalte stehen dem Modell dann für Anfragen zur Verfügung.

### Fine-Tuning
Fine-Tuning passt das Verhalten des LLMs an, indem es auf einem spezifischen Datensatz trainiert wird.

1.  **Trainingsdaten einfügen:** Fügen Sie Ihre Trainingsdaten in das Textfeld ein. Die Daten müssen im **JSONL-Format** vorliegen, wobei jede Zeile ein JSON-Objekt ist. Beispiel:
    \`{"prompt": "Frage 1", "completion": "Antwort 1"}\`
    \`{"prompt": "Frage 2", "completion": "Antwort 2"}\`
2.  **Training starten:** Klicken Sie auf \`Fine-Tuning starten\`, um den Trainingsjob an Ihren lokalen Server zu senden. Der Fortschritt wird im Protokollfenster darunter angezeigt.

---

## Das Ausgabefenster im Detail

Hier werden die Ergebnisse Ihrer Anfragen angezeigt.

### Steuerelemente (oben rechts)
-   **Validieren & Korrigieren (\`🐛\`):** Sendet den aktuellen Workflow erneut zur Validierung und Korrektur an die KI. Nützlich, wenn Sie manuelle Änderungen vorgenommen haben oder eine zweite Meinung wünschen.
-   **Run (\`▶️\`):** Sendet den Workflow direkt an Ihre laufende ComfyUI-Instanz zur Ausführung. **Wichtig:** Sie müssen zuerst die Adresse Ihrer ComfyUI-API in den \`Einstellungen\` konfigurieren!
-   **Workflow in ComfyUI laden (\`📋\`):** Kopiert den Workflow in die Zwischenablage und zeigt eine Anleitung an. Sie können den Workflow dann einfach in ComfyUI mit Strg+V einfügen.
-   **Copy JSON:** Kopiert den vollständigen Workflow-JSON in Ihre Zwischenablage.
-   **Download:** Lädt den Workflow als \`.json\`-Datei herunter.

### Tabs
-   **Visualisierung:** Zeigt eine grafische Darstellung der Nodes und ihrer Verbindungen. Dies gibt Ihnen einen schnellen Überblick über die Struktur des Workflows. Sie können auf einzelne Nodes klicken, um deren Details in einem Popup-Fenster anzuzeigen.
-   **Workflow:** Zeigt den rohen JSON-Code des Workflows.
-   **Anforderungen:** Listet alle für den Workflow benötigten Modelle und Custom Nodes auf.
-   **Protokolle:** Zeigt Validierungs- oder Debugging-Informationen an, falls vorhanden.

### Der Bereich "Anforderungen"
Einer der wichtigsten Abschnitte! Er listet alles auf, was Sie benötigen, damit der Workflow funktioniert.
-   **Custom Nodes:** Zeigt an, welche zusätzlichen Nodes Sie installieren müssen. Enthält einen GitHub-Link und **direkt kopierbare Terminal-Befehle** für eine einfache Installation.
-   **Modelle:** Listet alle benötigten Modelle auf (z.B. Checkpoints, LoRAs, VAEs). Enthält einen Download-Link und den **exakten Installationspfad**, in den Sie die Datei in Ihrem \`ComfyUI\`-Verzeichnis ablegen müssen.

---

## Einstellungen

Klicken Sie auf das Zahnrad-Symbol (\`⚙️\`) oben rechts, um die Einstellungen zu öffnen.

-   **ComfyUI API URL:** Dies ist die wichtigste Einstellung für die Workflow-Ausführung. Damit die \`Run\`-Funktion funktioniert, müssen Sie hier die Adresse Ihrer ComfyUI-Instanz eingeben. Der Standardwert ist normalerweise \`http://127.0.0.1:8188\`.
-   **Lokale LLM API URL:** Geben Sie hier die Basis-URL für Ihren lokalen LLM-Server ein. Diese wird für die Funktionen im "Lokales LLM"-Tab (RAG und Fine-Tuning) benötigt.
-   **Quellcode herunterladen:** Lädt den gesamten Quellcode dieser Webanwendung als einzelne Textdatei herunter.

---

## Tipps für beste Ergebnisse

-   **Spezifisch sein:** Geben Sie Modelltypen (SDXL, SD 1.5), Techniken (Inpainting, ControlNet) und Stile (fotorealistisch, Anime) in Ihrem Prompt an.
-   **Kontext geben:** Erklären Sie das Ziel. Anstatt "Zwei KSampler", sagen Sie "Einen KSampler für ein Basis-Bild und einen zweiten für ein Hi-Res-Fix".
-   **Komponenten prüfen:** Überprüfen Sie nach der Generierung immer den Abschnitt "Anforderungen", um sicherzustellen, dass Sie alle erforderlichen Modelle und Custom Nodes installiert haben.` },
      { name: 'public/UserManual.md', content: `# User Manual: AI ComfyUI Workflow Suite

Welcome to the AI ComfyUI Workflow Suite! This tool is designed to make creating, validating, and correcting ComfyUI workflows as easy as possible. Whether you're a beginner or an experienced ComfyUI user, this suite helps you quickly turn your ideas into functional workflows.

## Table of Contents
1.  [User Interface Overview](#user-interface-overview)
2.  [The "Generator" Tab](#the-generator-tab-creating-workflows)
3.  [The "Tester" Tab](#the-tester-tab-validating-and-fixing-workflows)
4.  [The "History" Tab](#the-history-tab-managing-past-work)
5.  [The "Local LLM" Tab](#the-local-llm-tab-managing-a-local-llm)
6.  [The Output Panel in Detail](#the-output-panel-in-detail)
7.  [Settings](#settings)
8.  [Tips for Best Results](#tips-for-best-results)

---

## User Interface Overview

The application is divided into a few main areas:

-   **Header:** Displays the application name. In the top right, you'll find a gear icon (\`⚙️\`) for **Settings** and a toggle to switch the language between English and German.
-   **Tab Bar:** Allows you to switch between the different functions: \`Generator\`, \`Tester\`, \`History\`, \`Local LLM\`, and \`Documentation\`.
-   **Main Window:** This is a two-part window. The left half changes based on the selected tab (the input area), while the right half is always the **Output Panel**, where results are displayed.

---

## The "Generator" Tab: Creating Workflows

This is the main area where you can create new workflows from a simple text description.

### 1. Describe Workflow
Enter a description of what your workflow should do in the large text box.

-   **Be detailed:** The more precise your description, the better the result. Instead of just "A picture of a cat," try "A photorealistic image of a cat in space wearing a helmet, using an SDXL model."
-   **Use examples:** Below the text box, you'll find some example prompts. Click on them to try them out.

### 2. Prompt Assistant
If you're unsure how to phrase your prompt, click the \`Prompt Assistant\` button. A chat window will open where an AI asks you targeted questions about style, composition, lighting, and more to refine your initial idea into a perfect, detailed prompt.

### 3. Workflow Wizard
For technically inclined users, the \`Workflow Wizard\` guides you through a series of technical questions (e.g., which model, which sampler) to construct a precise, technical prompt optimized for workflow generation.

### 4. Generate Workflow
Once you're satisfied with your description, click \`Generate Workflow\`. A progress bar will inform you about the individual steps: The AI analyzes your request, creates the workflow, and validates it. The result appears in the output panel.

---

## The "Tester" Tab: Validating and Fixing Workflows

Do you have an existing workflow that isn't working? You can get it fixed here.

-   **Workflow JSON:** Paste the complete JSON code of your ComfyUI workflow into this field.
-   **ComfyUI Error Message (Optional):** If ComfyUI produces a specific error message when running the workflow, paste it here. The AI will try to correct the workflow specifically to fix this error.
-   **Button:**
    -   If you only paste a workflow JSON, the button says \`Validate & Correct\`. The AI performs a general check.
    -   If you also provide an error message, the button changes to \`Debug\` for a targeted repair.

---

## The "History" Tab: Managing Past Work

Every workflow you create in the \`Generator\` tab is automatically saved here.

-   **List:** Shows all previous generations with their prompt and date.
-   **Select:** Click on an entry to display the result again in the output panel.
-   **Download (\`📥\`):** Download the workflow JSON of a specific entry directly.
-   **Clear History:** Permanently removes all entries. This action cannot be undone.

---

## The "Local LLM" Tab: Managing a Local LLM

This tab provides advanced features for interacting with a locally hosted Large Language Model (LLM). **Important:** These features require that you are running a compatible local LLM server and have correctly configured its address in the \`Settings\`.

### RAG / Knowledge Base
RAG (Retrieval-Augmented Generation) allows you to expand the LLM's knowledge with your own documents without retraining the model.

1.  **Select Files:** Drag and drop \`.txt\` or \`.md\` files into the upload area, or click to select files.
2.  **Upload:** Click \`Upload Selected Files\` to send the documents to your LLM's RAG service. The uploaded content will then be available to the model for queries.

### Fine-Tuning
Fine-tuning adjusts the behavior of the LLM by training it on a specific dataset.

1.  **Insert Training Data:** Paste your training data into the text field. The data must be in **JSONL format**, where each line is a JSON object. Example:
    \`{"prompt": "Question 1", "completion": "Answer 1"}\`
    \`{"prompt": "Question 2", "completion": "Answer 2"}\`
2.  **Start Training:** Click \`Start Fine-Tuning\` to send the training job to your local server. The progress will be displayed in the log window below.

---

## The Output Panel in Detail

This is where the results of your requests are displayed.

### Controls (top right)
-   **Validate & Correct (\`🐛\`):** Resubmits the current workflow to the AI for validation and correction. Useful if you've made manual changes or want a second opinion.
-   **Run (\`▶️\`):** Sends the workflow directly to your running ComfyUI instance for execution. **Important:** You must first configure the address of your ComfyUI API in the \`Settings\`!
-   **Load Workflow in ComfyUI (\`📋\`):** Copies the workflow to your clipboard and shows an instruction. You can then simply paste the workflow into ComfyUI using Ctrl+V.
-   **Copy JSON:** Copies the complete workflow JSON to your clipboard.
-   **Download:** Downloads the workflow as a \`.json\` file.

### Tabs
-   **Visualizer:** Shows a graphical representation of the nodes and their connections. This gives you a quick overview of the workflow's structure. You can click on individual nodes to view their details in a pop-up window.
-   **Workflow:** Shows the raw JSON code of the workflow.
-   **Requirements:** Lists all the models and custom nodes required for the workflow.
-   **Logs:** Displays validation or debugging information, if available.

### The "Requirements" Area
One of the most important sections! It lists everything you need for the workflow to function.
-   **Custom Nodes:** Shows which additional nodes you need to install. Includes a GitHub link and **directly copyable terminal commands** for easy installation.
-   **Models:** Lists all required models (e.g., Checkpoints, LoRAs, VAEs). Includes a download link and the **exact installation path** where you need to place the file in your \`ComfyUI\` directory.

---

## Settings

Click the gear icon (\`⚙️\`) in the top right to open the settings.

-   **ComfyUI API URL:** This is the most important setting for workflow execution. For the \`Run\` function to work, you must enter the address of your ComfyUI instance here. The default value is usually \`http://127.0.0.1:8188\`.
-   **Local LLM API URL:** Enter the base URL for your local LLM server here. This is required for the features in the "Local LLM" tab (RAG and Fine-Tuning).
-   **Download Source Code:** Downloads the entire source code of this web application as a single text file.

---

## Tips for Best Results

-   **Be specific:** Mention model types (SDXL, SD 1.5), techniques (Inpainting, ControlNet), and styles (photorealistic, anime) in your prompt.
-   **Provide context:** Explain the goal. Instead of "Two KSamplers," say "One KSampler for a base image and a second for a hi-res fix."
-   **Check components:** After generation, always check the "Requirements" section to ensure you have installed all necessary models and custom nodes.` },
      { name: 'services/comfyuiService.ts', content: `import { v4 as uuidv4 } from 'uuid';
import type { ComfyUIWorkflow } from '../types';

/**
 * Sends a workflow to a ComfyUI instance for execution.
 * @param workflow The ComfyUI workflow object.
 * @param apiUrl The base URL of the ComfyUI API (e.g., http://127.0.0.1:8188).
 * @returns The response from the ComfyUI server, typically containing a prompt_id.
 */
export const executeWorkflow = async (workflow: ComfyUIWorkflow, apiUrl: string): Promise<any> => {
    const clientId = uuidv4();

    const payload = {
        prompt: workflow,
        client_id: clientId,
    };
    
    let endpoint: string;
    try {
        // The endpoint is typically /prompt
        endpoint = new URL('/prompt', apiUrl).toString();
    } catch (e) {
        throw new Error(\`Invalid ComfyUI URL provided: \${apiUrl}\`);
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            let errorBody = 'Could not read error body.';
            try {
                // ComfyUI might return a JSON error object which is more informative
                const errorJson = await response.json();
                errorBody = JSON.stringify(errorJson, null, 2);
            } catch {
                // If not JSON, it might be plain text or HTML
                errorBody = await response.text();
            }
            throw new Error(\`ComfyUI API error (\${response.status}):\\n\${errorBody}\`);
        }

        // Handle cases where the response is successful but not valid JSON
        // (e.g., if the URL points to a regular website)
        try {
            return await response.json();
        } catch (e) {
            console.error("Failed to parse ComfyUI response as JSON", e);
            throw new Error("Received an invalid response from the ComfyUI server. Please check if the URL is correct and points to the ComfyUI API, not a website.");
        }

    } catch (error) {
        if (error instanceof TypeError) { // This often indicates a network error
            throw new Error(\`Failed to connect to ComfyUI at \${apiUrl}. Please ensure the server is running, the URL is correct, and there are no CORS issues (try starting ComfyUI with '--enable-cors').\`);
        }
        // Re-throw other errors (like the ones we created for non-ok responses)
        throw error;
    }
};` },
      { name: 'services/geminiService.ts', content: `import { GoogleGenAI } from "@google/genai";
import type { GeneratedWorkflowResponse, ComfyUIWorkflow, ValidationResponse, DebugResponse } from '../types';

const SYSTEM_INSTRUCTION = \`You are an expert assistant specializing in ComfyUI, a node-based graphical user interface for Stable Diffusion. Your sole purpose is to generate a complete and valid ComfyUI workflow in JSON format based on a user's request. The user will communicate in German.

**IMPORTANT SYSTEM CONTEXT:**
You MUST generate a workflow that is compatible with the following system configuration. This means you should:
1.  Consider the GPU VRAM limitations. For example, the RTX 3050 with 4GB VRAM can't handle very large SDXL workflows without memory optimization techniques.
2.  When a model is needed (e.g., a checkpoint, LoRA, VAE), use a plausible, common model name (e.g., 'sd_xl_base_1.0.safensors', 'epicrealism_naturalSinRC1VAE.safensors'). Assume these models exist in the standard ComfyUI subdirectories (like 'checkpoints', 'loras') within the main install path or one of the extra model paths.
3.  All output nodes (like 'SaveImage') MUST be configured to save into the specified 'output_path'. Use the absolute path provided and feel free to add a filename prefix. For example, in the SaveImage node, the first widget value should be the output path, like "/mnt/ki_io_data/ComfyUI_".

**SYSTEM CONFIGURATION:**
\\\`\\\`\\\`json
{
  "system": {
    "ram_gb": 256,
    "gpus": [
      {
        "model": "NVIDIA GeForce RTX 4000 ADA",
        "vram_gb": 20
      },
      {
        "model": "NVIDIA GeForce RTX 3050 Low Profile",
        "vram_gb": 4
      }
    ]
  },
  "storage": {
    "comfyui_install_path": "/opt/ki_project/ComfyUI",
    "extra_model_paths": [
      "/mnt/comfyui_iscsi_data"
    ],
    "output_path": "/mnt/ki_io_data"
  }
}
\\\`\\\`\\\`

You must infer the necessary nodes, models (e.g., SDXL Base, SD 1.5), samplers, and connections to achieve the user's goal. You have comprehensive knowledge of all standard ComfyUI nodes and a wide range of popular custom nodes.

**CRITICAL REQUIREMENT: The generated workflow MUST be complete and logically sound. All necessary nodes must be present and correctly connected from a logical start (like a loader) to a logical end (like a SaveImage node). There must be no missing inputs on any node that requires a connection (e.g., a KSampler must have its 'model', 'positive', 'negative', and 'latent_image' inputs connected).**

**RESPONSE FORMAT:**
Your response MUST be ONLY a single, raw, valid JSON object that can be directly parsed. Do NOT include any explanatory text, comments, or markdown code fences like \\\`\\\`\\\`json. This JSON object MUST have two top-level keys: "workflow" and "requirements".

1.  **"workflow"**: This key must contain the complete ComfyUI workflow JSON object, with all the standard keys ("last_node_id", "nodes", etc.).
2.  **"requirements"**: This key must contain an object detailing the necessary components for the workflow to run. It should have two keys: "custom_nodes" and "models".
    *   **"custom_nodes"**: An array of objects, where each object represents a required custom node. Each object MUST have the following keys:
        * \\\`name\\\`: (string) The name of the custom node (e.g., "ComfyUI-Impact-Pack").
        * \\\`url\\\`: (string | null) The GitHub link to the repository. Set to null if unknown.
        * \\\`install_instructions\\\`: (string) A string containing the exact terminal commands needed for installation inside the \\\`ComfyUI/custom_nodes/\\\` directory, separated by a newline character (\\\\n).
    *   **"models"**: An array of objects for any specific checkpoints, LoRAs, VAEs, etc. Each object MUST have the following keys:
        * \\\`name\\\`: (string) The filename of the model (e.g., "sd_xl_base_1.0.safetensors").
        * \\\`url\\\`: (string | null) The direct download URL. Set to null if unknown.
        * \\\`model_type\\\`: (string) The type of model (e.g., "checkpoint", "vae", "lora").
        * \\\`install_path\\\`: (string | null) The relative path from the ComfyUI root directory where the model file should be placed (e.g., "models/checkpoints/", "models/loras/", or a custom node specific path like "custom_nodes/ComfyUI-AnimateDiff-Evolved/models/"). Set to null if it's a standard, ambiguous path.

Example of the final JSON output structure:
\\\`\\\`\\\`json
{
  "workflow": {
    "last_node_id": 4,
    "last_link_id": 3,
    "nodes": [ /* ... node objects ... */ ],
    "links": [ /* ... link arrays ... */ ],
    "groups": [],
    "config": {},
    "extra": {},
    "version": 0.4
  },
  "requirements": {
    "custom_nodes": [
      {
        "name": "ComfyUI-Impact-Pack",
        "url": "https://github.com/ltdrdata/ComfyUI-Impact-Pack",
        "install_instructions": "git clone https://github.com/ltdrdata/ComfyUI-Impact-Pack\\\\npip install -r ComfyUI-Impact-Pack/requirements.txt"
      }
    ],
    "models": [
      {
        "name": "sd_xl_base_1.0.safetensors",
        "url": "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/sd_xl_base_1.0.safetensors",
        "model_type": "checkpoint",
        "install_path": "models/checkpoints/"
      }
    ]
  }
}
\\\`\\\`\\\`

When arranging nodes in the workflow, place them in a logical left-to-right flow in the 'pos' array, starting around [100, 100] and increasing the x-coordinate for subsequent nodes to create a readable graph. Assign meaningful titles to nodes via the 'title' property where applicable.
\`;

const SYSTEM_INSTRUCTION_VALIDATOR = \`You are a ComfyUI Workflow Analyzer and Corrector. Your task is to receive a ComfyUI workflow JSON, meticulously analyze it for correctness and logical consistency, and then return a corrected version along with a validation log.

**INPUT:**
You will be given a JSON string representing a ComfyUI workflow.

**ANALYSIS CHECKS:**
You MUST perform the following checks:
1.  **JSON Syntax:** Ensure the overall structure is valid JSON.
2.  **Node Connectivity:**
    *   Verify that all required inputs for each node are connected. A required input is one that doesn't have a corresponding widget for user input. For example, a KSampler's \\\`model\\\` input must be linked.
    *   Identify any orphaned nodes or disconnected subgraphs that do not lead to an output node (like SaveImage or PreviewImage).
3.  **Link Type Compatibility:**
    *   Ensure the output slot type matches the input slot type for every link. For example, a \\\`MODEL\\\` output must connect to a \\\`MODEL\\\` input. A \\\`LATENT\\\` output must connect to a \\\`LATENT\\\` input.
4.  **Logical Flow:**
    *   Check if the workflow has a logical start (e.g., a Loader node) and a logical end (e.g., a SaveImage node).
    *   Ensure VAE is used correctly (e.g., VAE Decode is used before saving an image).
5.  **Widget Value Plausibility:**
    *   Check common widget values for correctness. For instance, \\\`sampler_name\\\` in a KSampler should be a valid name (e.g., \\\`euler\\\`, \\\`dpmpp_2m_sde\\\`). \\\`scheduler\\\` should be valid (e.g., \\\`normal\\\`, \\\`karras\\\`).

**CORRECTION:**
If you find any errors, you MUST attempt to correct them.
*   For incorrect links, rewire them to the correct logical source if possible.
*   For missing connections, add a sensible default node if applicable (e.g., if a VAE is missing, add a \\\`VAELoader\\\` and connect it).
*   For invalid widget values, change them to a common, valid alternative.
*   If a workflow is un-salvageably broken, explain why in the log. Do not change the workflow in this case.

**RESPONSE FORMAT:**
Your response MUST be ONLY a single, raw, valid JSON object. Do NOT include any explanatory text, comments, or markdown code fences. The JSON object must have two top-level keys: \\\`validationLog\\\` and \\\`correctedWorkflow\\\`.

1.  \\\`"validationLog"\\\`: An array of objects. Each object represents a check you performed and MUST have the following keys:
    *   \\\`"check"\\\`: (string) A description of the check performed (e.g., "Node Connectivity Validation").
    *   \\\`"status"\\\`: (string) The result of the check. Must be one of \\\`passed\\\`, \\\`corrected\\\`, or \\\`failed\\\`.
    *   \\\`"details"\\\`: (string) A brief explanation. If \\\`passed\\\`, say "No issues found." If \\\`corrected\\\`, explain what was changed (e.g., "Reconnected KSampler 'vae' input to VAE Decode output."). If \\\`failed\\\`, explain the uncorrectable error.
2.  \\\`"correctedWorkflow"\\\`: The complete ComfyUI workflow JSON object. This should be the original workflow if status for all checks is \\\`passed\\\`, or the modified workflow if any status is \\\`corrected\\\`.

Example of the final JSON output structure:
\\\`\\\`\\\`json
{
  "validationLog": [
    {
      "check": "Link Type Compatibility",
      "status": "passed",
      "details": "All node connections have matching types."
    },
    {
      "check": "Logical Flow Validation",
      "status": "corrected",
      "details": "The 'Save Image' node was missing a connected 'IMAGE' input. Corrected by linking it to the 'VAE Decode' output."
    }
  ],
  "correctedWorkflow": {
    "last_node_id": 5,
    "last_link_id": 4,
    "nodes": [ /* ... corrected node objects ... */ ],
    "links": [ /* ... corrected link arrays ... */ ],
    "groups": [],
    "config": {},
    "extra": {},
    "version": 0.4
  }
}
\\\`\\\`\\\`
\`;

const SYSTEM_INSTRUCTION_DEBUGGER = \`You are an expert ComfyUI debugger. Your task is to analyze a given ComfyUI workflow and a specific error message produced by it, then correct the workflow to fix the error.

**INPUT:**
You will be given a JSON string containing two keys: "workflow" and "errorMessage".
- "workflow": The complete ComfyUI workflow JSON that caused the error.
- "errorMessage": The error message string produced by ComfyUI when trying to run the workflow.

**TASK:**
1.  **Analyze the Error:** Carefully read the \\\`errorMessage\\\`. Identify the core issue. Common errors include:
    *   \\\`Error: "Required input is missing"\\\`: A node is missing a connection to a required input slot.
    *   \\\`TypeError\\\`, \\\`AttributeError\\\`, \\\`KeyError\\\`: Often related to incorrect node properties, widget values, or mismatched data types between nodes.
    *   \\\`RuntimeError: shape mismatch\\\`: Tensor shapes are incompatible, e.g., connecting an SD1.5 model's latent output to an SDXL-specific node.
    *   \\\`ModuleNotFoundError\\\` or \\\`comfy.NODE_CLASS_MAPPINGS\\\` errors: A custom node is not found. You cannot fix this by adding files, but you can replace it with a standard node if a logical equivalent exists.

2.  **Locate the Problem:** Examine the \\\`workflow\\\` JSON to find the exact node, link, or property that corresponds to the error.

3.  **Correct the Workflow:** Modify the workflow JSON to resolve the error. Your corrections should be as minimal and logical as possible. Examples:
    *   If an input is missing, add the correct link from an appropriate output.
    *   If a widget value is wrong (e.g., an invalid sampler name), change it to a valid one.
    *   If node types are incompatible, you might need to rewire the connection or replace a node.
    *   If the error is unfixable (e.g., a missing custom node file), state this clearly in your analysis and do not change the workflow.

**RESPONSE FORMAT:**
Your response MUST be ONLY a single, raw, valid JSON object. Do NOT include any explanatory text, comments, or markdown. The JSON object must have two top-level keys: \\\`correctionLog\\\` and \\\`correctedWorkflow\\\`.

1.  \\\`"correctionLog"\\\`: An array of one or more objects, detailing your debugging process. Each object MUST have the following keys:
    *   \\\`"analysis"\\\`: (string) Your detailed analysis of what the error message means in the context of the provided workflow.
    *   \\\`"action"\\\`: (string) The specific corrective action you took (e.g., "Connected 'VAE' output from node 5 to 'vae' input of node 3."). If no action was taken, explain why.
    *   \\\`"reasoning"\\\`: (string) Explain *why* your action should fix the error. This is your "simulation" of the fix.

2.  \\\`"correctedWorkflow"\\\`: The complete, corrected ComfyUI workflow JSON object. If no correction was possible, this should be the original, unmodified workflow.

Example of the final JSON output structure:
\\\`\\\`\\\`json
{
  "correctionLog": [
    {
      "analysis": "The error message 'Required input is missing: vae in KSampler' indicates that the main sampler node (KSampler, ID: 4) does not have a VAE connected to its 'vae' input slot.",
      "action": "Created a new link from the 'VAE' output of the 'VAELoader' node (ID: 2) to the 'vae' input of the 'KSampler' node (ID: 4).",
      "reasoning": "By providing the required VAE connection, the KSampler will now be able to properly decode the latent image into a pixel-space image, resolving the 'missing input' error."
    }
  ],
  "correctedWorkflow": {
    /* ... The full, corrected workflow JSON ... */
  }
}
\\\`\\\`\\\`
\`;


export const generateWorkflow = async (description: string): Promise<Omit<GeneratedWorkflowResponse, 'validationLog'>> => {
  if (!process.env.API_KEY) {
    throw new Error("API key is missing. Please set the API_KEY environment variable.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  let rawResponseText = '';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: description,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
      }
    });

    rawResponseText = response.text.trim();
    
    // FIX: Corrected markdown cleaning logic.
    // Clean potential markdown fences.
    if (rawResponseText.startsWith('\\\`\\\`\\\`json')) {
      rawResponseText = rawResponseText.substring(7, rawResponseText.length - 3).trim();
    }
    
    // The response should be a clean JSON string, ready to parse.
    const parsedResponse = JSON.parse(rawResponseText) as GeneratedWorkflowResponse & { error?: string };
    
    // Check for model-generated error message.
    if (parsedResponse.error) {
        throw new Error(\`The model could not generate a workflow: \${parsedResponse.error}\`);
    }

    // New, more robust validation.
    if (!parsedResponse.workflow || !parsedResponse.requirements) {
        console.error("Invalid response structure received from AI:", parsedResponse);
        throw new Error("Generated JSON is missing 'workflow' or 'requirements' top-level keys.");
    }

    const { workflow, requirements } = parsedResponse;

    if (!workflow.nodes || !workflow.links || typeof workflow.last_node_id === 'undefined') {
        console.error("Invalid workflow structure received from AI:", workflow);
        throw new Error("Generated JSON is not a valid ComfyUI workflow. It's missing essential properties like 'nodes', 'links', or 'last_node_id'.");
    }
    
    if (!requirements || !Array.isArray(requirements.custom_nodes) || !Array.isArray(requirements.models)) {
        console.error("Invalid requirements structure received from AI:", requirements);
        throw new Error("Generated JSON has an invalid 'requirements' structure.");
    }
    
    return parsedResponse;
  } catch (error) {
    console.error("Error in generateWorkflow:", error);
    if (error instanceof SyntaxError) {
      console.error("Malformed JSON received from AI:", rawResponseText);
      throw new Error("Failed to parse the AI's response as valid JSON. The model may have returned a malformed output.");
    }
    // If it's one of our custom errors or an error from the model, just re-throw it.
    if (error instanceof Error) {
        throw error;
    }
    // Fallback for other unexpected errors.
    throw new Error("An unknown error occurred while communicating with the AI.");
  }
};

export const validateAndCorrectWorkflow = async (workflow: ComfyUIWorkflow): Promise<ValidationResponse> => {
    if (!process.env.API_KEY) {
        throw new Error("API key is missing. Please set the API_KEY environment variable.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const workflowString = JSON.stringify(workflow, null, 2);
    let rawResponseText = '';

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: \`Please validate and correct the following ComfyUI workflow:\\n\\n\${workflowString}\`,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION_VALIDATOR,
                responseMimeType: "application/json",
            }
        });
        
        rawResponseText = response.text.trim();
        const parsedResponse = JSON.parse(rawResponseText) as ValidationResponse;

        if (!parsedResponse.validationLog || !parsedResponse.correctedWorkflow) {
             console.error("Invalid response structure received from Validator AI:", parsedResponse);
            throw new Error("Validator AI returned a malformed response. It's missing 'validationLog' or 'correctedWorkflow'.");
        }

        if (!Array.isArray(parsedResponse.validationLog)) {
             console.error("Invalid validationLog structure:", parsedResponse.validationLog);
            throw new Error("Validator AI returned an invalid 'validationLog' structure. It must be an array.");
        }

        if (!parsedResponse.correctedWorkflow.nodes) {
             console.error("Invalid correctedWorkflow structure:", parsedResponse.correctedWorkflow);
            throw new Error("Validator AI returned an invalid 'correctedWorkflow' object.");
        }

        return parsedResponse;

    } catch (error) {
        console.error("Error in validateAndCorrectWorkflow:", error);
        if (error instanceof SyntaxError) {
          console.error("Malformed JSON received from Validator AI:", rawResponseText);
          throw new Error("Failed to parse the Validator AI's response as valid JSON.");
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred while communicating with the Validator AI.");
    }
};

export const debugAndCorrectWorkflow = async (workflow: ComfyUIWorkflow, errorMessage: string): Promise<DebugResponse> => {
    if (!process.env.API_KEY) {
        throw new Error("API key is missing. Please set the API_KEY environment variable.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const requestPayload = {
        workflow,
        errorMessage,
    };
    const payloadString = JSON.stringify(requestPayload, null, 2);
    let rawResponseText = '';

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: payloadString,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION_DEBUGGER,
                responseMimeType: "application/json",
            }
        });
        
        rawResponseText = response.text.trim();
        const parsedResponse = JSON.parse(rawResponseText) as DebugResponse;

        if (!parsedResponse.correctionLog || !parsedResponse.correctedWorkflow) {
             console.error("Invalid response structure received from Debugger AI:", parsedResponse);
            throw new Error("Debugger AI returned a malformed response. It's missing 'correctionLog' or 'correctedWorkflow'.");
        }
        
        return parsedResponse;

    } catch (error) {
        console.error("Error in debugAndCorrectWorkflow:", error);
        if (error instanceof SyntaxError) {
          console.error("Malformed JSON received from Debugger AI:", rawResponseText);
          throw new Error("Failed to parse the Debugger AI's response as valid JSON.");
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred while communicating with the Debugger AI.");
    }
};` },
      { name: 'services/localLlmService.ts', content: `export const uploadRagDocument = async (file: File, apiUrl: string): Promise<{ message: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const endpoint = new URL('/v1/rag/upload', apiUrl).toString();

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(\`Server error (\${response.status}): \${errorData.detail}\`);
        }

        return await response.json();

    } catch (error) {
        if (error instanceof TypeError) { // Network error
            throw new Error(\`Failed to connect to local LLM at \${apiUrl}.\`);
        }
        throw error;
    }
};

export const startFineTuning = async (trainingData: string, apiUrl: string): Promise<{ job_id: string }> => {
    const endpoint = new URL('/v1/finetune', apiUrl).toString();

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/jsonl', // Assuming the server expects jsonl as content type
            },
            body: trainingData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(\`Server error (\${response.status}): \${errorData.detail}\`);
        }
        
        return await response.json();
    } catch (error) {
         if (error instanceof TypeError) { // Network error
            throw new Error(\`Failed to connect to local LLM at \${apiUrl}.\`);
        }
        throw error;
    }
};` },
      { name: 'translations.ts', content: `export const translations = {
  en: {
    locale: 'en-US',
    // App.tsx
    appTitle: 'ComfyUI Workflow Generator',
    tabGenerator: 'Generator',
    tabTester: 'Tester',
    tabHistory: 'History',
    tabLocalLlm: 'Local LLM',
    tabDocumentation: 'Documentation',
    loadingStep1: 'Step 1/2: Generating workflow...',
    loadingStep2: 'Step 2/2: Validating workflow...',
    loadingComplete: 'Process complete!',
    loadingValidating: 'Validating workflow...',
    loadingDebugging: 'Debugging workflow...',
    toastWorkflowGenerated: 'Workflow generated and validated successfully!',
    toastUnknownError: 'An unknown error occurred.',
    toastInvalidWorkflowJson: 'Invalid workflow JSON provided.',
    toastWorkflowProcessed: 'Workflow processed successfully!',
    toastValidationError: 'An unknown error occurred during validation.',
    toastComfyUrlNotSet: 'ComfyUI API URL not set. Please configure it in settings.',
    toastWorkflowSent: 'Workflow sent to ComfyUI successfully!',
    toastHistoryLoaded: 'Loaded workflow from history.',
    toastWorkflowDownloaded: 'Workflow downloaded.',
    toastCopied: 'Workflow JSON copied to clipboard!',
    toastWorkflowPasted: 'Workflow copied! Go to your ComfyUI tab and press Ctrl+V to load it.',
    toastCopyFailed: 'Failed to copy workflow.',
    toastPromptOptimized: 'Prompt updated by Assistant!',
    toastWizardPromptGenerated: 'Prompt generated by Wizard!',
    toastSourceDownloaded: 'Source code downloaded successfully!',

    // InputPanel.tsx
    describeWorkflow: 'Describe Your Workflow',
    promptAssistant: 'Prompt Assistant',
    promptAssistantTitle: 'Start the AI assistant to improve your prompt',
    workflowWizard: 'Workflow Wizard',
    workflowWizardTitle: 'Start the wizard to build a technical prompt',
    describeWorkflowSubtext: 'Specify what you want to achieve. The more detailed your description, the better the generated workflow will be.',
    promptPlaceholder: 'e.g., Create a photorealistic image of a cat in space using an SDXL model...',
    tryExample: 'Or try an example:',
    generateWorkflow: 'Generate Workflow',

    // OutputPanel.tsx
    waitingForGeneration: 'Waiting for Generation',
    waitingForGenerationSubtext: 'Your generated ComfyUI workflow will appear here.',
    outputVisualizer: 'Visualizer',
    outputWorkflow: 'Workflow',
    outputRequirements: 'Requirements',
    outputLogs: 'Logs',
    tooltipValidate: 'Validate & Correct Workflow',
    tooltipRun: 'Run Workflow in ComfyUI',
    tooltipLoad: 'Load Workflow in ComfyUI (Copy & Paste)',
    tooltipCopy: 'Copy Workflow JSON',
    tooltipDownload: 'Download Workflow JSON',
    customNodes: 'Custom Nodes',
    noCustomNodes: 'No custom nodes required.',
    models: 'Models',
    noModels: 'No specific models required.',
    downloadLink: 'Download Link',
    installTo: 'Install to:',
    correctionAnalysis: 'Correction Analysis',
    analysis: 'Analysis:',
    action: 'Action:',
    reasoning: 'Reasoning:',

    // TesterPanel.tsx
    testerTitle: 'Validate & Correct Workflow',
    testerSubtext: 'Paste your workflow to check it. Optionally, provide an error message for a targeted fix.',
    testerWorkflowJsonLabel: 'Workflow JSON',
    testerWorkflowJsonPlaceholder: 'Paste your workflow JSON here...',
    testerErrorJsonEmpty: 'Workflow text field cannot be empty.',
    testerErrorJsonInvalid: 'Invalid Workflow JSON. Please check the syntax.',
    testerErrorLabel: 'ComfyUI Error Message (Optional)',
    testerErrorPlaceholder: 'Paste the error message from ComfyUI here...',
    testerButtonDebug: 'Debug',
    testerButtonValidate: 'Validate & Correct',

    // HistoryPanel.tsx
    noHistory: 'No History',
    noHistorySubtext: 'Generated workflows will appear here.',
    historyTitle: 'History',
    clearHistory: 'Clear History',
    tooltipClearHistory: 'Clear entire history',
    tooltipDownloadHistory: 'Download this workflow',

    // LocalLlmPanel.tsx
    localLlmTitle: 'Local LLM Management',
    localLlmRagTab: 'RAG / Knowledge Base',
    localLlmFineTuneTab: 'Fine-Tuning',
    localLlmRagSubtext: 'Upload .txt or .md files to populate your local LLM\\'s knowledge base for Retrieval-Augmented Generation (RAG).',
    localLlmDropzone: 'Drag and drop files here, or click to select files.',
    localLlmUploading: 'Uploading...',
    localLlmUploadButton: 'Upload Selected Files',
    localLlmFineTuneSubtext: 'Add your training data (expected in JSONL format) to start a fine-tuning job on your local server.',
    localLlmStartingJob: 'Starting fine-tuning job...',
    localLlmJobStarted: (id: string) => \`Job started with ID: \${id}\`,
    localLlmWaitingForLogs: 'Waiting for server logs... (This feature is a demo)',
    localLlmError: 'Error',
    localLlmStarting: 'Starting...',
    localLlmStartFineTune: 'Start Fine-Tuning',
    localLlmApiUrlNotSet: 'Local LLM API URL is not configured in settings.',
    localLlmFileUploadSuccess: (name: string) => \`File '\${name}' uploaded successfully.\`,
    localLlmFileUploadError: (name: string, error: string) => \`Error uploading '\${name}': \${error}\`,
    localLlmTrainingDataEmpty: 'Training data cannot be empty.',
    localLlmJobStartSuccess: 'Fine-tuning job started successfully.',
    localLlmJobStartError: (error: string) => \`Error starting fine-tuning: \${error}\`,

    // PromptOptimizerModal.tsx
    optimizerErrorApiKey: 'Error: API key not configured.',
    optimizerErrorGeneral: 'Sorry, an error occurred.',
    optimizerErrorCommunication: 'Sorry, an error occurred while communicating.',
    optimizerPromptCreated: 'An optimized prompt has been created!',
    optimizerUsePrompt: 'Use Prompt and Close',
    optimizerPlaceholder: 'Your answer...',
    optimizerSend: 'Send',

    // WorkflowWizardModal.tsx
    wizardUsePrompt: 'Use Prompt and Close',
    wizardPromptCreated: 'A technical prompt has been created!',
    wizardPlaceholder: 'Your answer...',
    wizardSend: 'Send',

    // SettingsModal.tsx
    settingsTitle: 'Settings',
    settingsClose: 'Close settings',
    settingsComfyUrl: 'ComfyUI API URL',
    settingsComfyUrlHelp: 'Enter the base URL for your running ComfyUI instance. This is used for the "Run" functionality.',
    settingsLocalLlmUrl: 'Local LLM API URL',
    settingsLocalLlmUrlHelp: 'Enter the base URL for your local LLM server. This is used for RAG and Fine-tuning.',
    settingsSave: 'Save & Close',
    settingsDownloadSource: 'Download Source Code',
    settingsDownloadSourceHelp: 'Download all source files for this application bundled into a single .txt file.',

    // DocumentationPanel.tsx
    docLoading: 'Loading documentation...',
    docErrorTitle: 'Error',
    docErrorContent: (status: number) => \`Could not load documentation (HTTP status \${status}).\`,
    docErrorUnknown: 'An unknown error occurred.',
  },
  de: {
    locale: 'de-DE',
    // App.tsx
    appTitle: 'ComfyUI Workflow Generator',
    tabGenerator: 'Generator',
    tabTester: 'Tester',
    tabHistory: 'Verlauf',
    tabLocalLlm: 'Lokales LLM',
    tabDocumentation: 'Dokumentation',
    loadingStep1: 'Schritt 1/2: Generiere Workflow...',
    loadingStep2: 'Schritt 2/2: Validiere Workflow...',
    loadingComplete: 'Prozess abgeschlossen!',
    loadingValidating: 'Validiere Workflow...',
    loadingDebugging: 'Debuge Workflow...',
    toastWorkflowGenerated: 'Workflow erfolgreich generiert und validiert!',
    toastUnknownError: 'Ein unbekannter Fehler ist aufgetreten.',
    toastInvalidWorkflowJson: 'Ungültiges Workflow-JSON bereitgestellt.',
    toastWorkflowProcessed: 'Workflow erfolgreich verarbeitet!',
    toastValidationError: 'Während der Validierung ist ein unbekannter Fehler aufgetreten.',
    toastComfyUrlNotSet: 'ComfyUI API URL nicht in den Einstellungen festgelegt. Bitte konfigurieren.',
    toastWorkflowSent: 'Workflow erfolgreich an ComfyUI gesendet!',
    toastHistoryLoaded: 'Workflow aus dem Verlauf geladen.',
    toastWorkflowDownloaded: 'Workflow heruntergeladen.',
    toastCopied: 'Workflow-JSON in die Zwischenablage kopiert!',
    toastWorkflowPasted: 'Workflow kopiert! Gehen Sie zu Ihrem ComfyUI-Tab und drücken Sie Strg+V, um ihn zu laden.',
    toastCopyFailed: 'Kopieren des Workflows fehlgeschlagen.',
    toastPromptOptimized: 'Prompt vom Assistenten aktualisiert!',
    toastWizardPromptGenerated: 'Prompt vom Assistenten erstellt!',
    toastSourceDownloaded: 'Quellcode erfolgreich heruntergeladen!',
    
    // InputPanel.tsx
    describeWorkflow: 'Beschreiben Sie Ihren Workflow',
    promptAssistant: 'Prompt-Assistent',
    promptAssistantTitle: 'Starten Sie den KI-Assistenten, um Ihren Prompt zu verbessern',
    workflowWizard: 'Workflow-Assistent',
    workflowWizardTitle: 'Starten Sie den Assistenten, um einen technischen Prompt zu erstellen',
    describeWorkflowSubtext: 'Geben Sie an, was Sie erreichen möchten. Je detaillierter Ihre Beschreibung, desto besser wird der generierte Workflow sein.',
    promptPlaceholder: 'z.B. Erstelle ein fotorealistisches Bild einer Katze im Weltraum mit einem SDXL-Modell...',
    tryExample: 'Oder probieren Sie ein Beispiel:',
    generateWorkflow: 'Workflow generieren',

    // OutputPanel.tsx
    waitingForGeneration: 'Warte auf Generierung',
    waitingForGenerationSubtext: 'Ihr generierter ComfyUI-Workflow wird hier erscheinen.',
    outputVisualizer: 'Visualisierung',
    outputWorkflow: 'Workflow',
    outputRequirements: 'Anforderungen',
    outputLogs: 'Protokolle',
    tooltipValidate: 'Workflow validieren & korrigieren',
    tooltipRun: 'Workflow in ComfyUI ausführen',
    tooltipLoad: 'Workflow in ComfyUI laden (Kopieren & Einfügen)',
    tooltipCopy: 'Workflow-JSON kopieren',
    tooltipDownload: 'Workflow-JSON herunterladen',
    customNodes: 'Benutzerdefinierte Nodes',
    noCustomNodes: 'Keine benutzerdefinierten Nodes erforderlich.',
    models: 'Modelle',
    noModels: 'Keine spezifischen Modelle erforderlich.',
    downloadLink: 'Download-Link',
    installTo: 'Installieren nach:',
    correctionAnalysis: 'Korrekturanalyse',
    analysis: 'Analyse:',
    action: 'Aktion:',
    reasoning: 'Begründung:',

    // TesterPanel.tsx
    testerTitle: 'Workflow validieren & korrigieren',
    testerSubtext: 'Fügen Sie Ihren Workflow ein, um ihn zu überprüfen. Geben Sie optional eine Fehlermeldung an, um eine gezielte Korrektur zu erhalten.',
    testerWorkflowJsonLabel: 'Workflow JSON',
    testerWorkflowJsonPlaceholder: 'Fügen Sie hier Ihr Workflow-JSON ein...',
    testerErrorJsonEmpty: 'Workflow-Textfeld darf nicht leer sein.',
    testerErrorJsonInvalid: 'Ungültiges Workflow-JSON. Bitte überprüfen Sie die Syntax.',
    testerErrorLabel: 'ComfyUI Fehlermeldung (Optional)',
    testerErrorPlaceholder: 'Fügen Sie hier die von ComfyUI ausgegebene Fehlermeldung ein...',
    testerButtonDebug: 'Fehler beheben',
    testerButtonValidate: 'Validieren & korrigieren',

    // HistoryPanel.tsx
    noHistory: 'Kein Verlauf',
    noHistorySubtext: 'Generierte Workflows werden hier angezeigt.',
    historyTitle: 'Verlauf',
    clearHistory: 'Verlauf löschen',
    tooltipClearHistory: 'Gesamten Verlauf löschen',
    tooltipDownloadHistory: 'Diesen Workflow herunterladen',

    // LocalLlmPanel.tsx
    localLlmTitle: 'Lokales LLM Management',
    localLlmRagTab: 'RAG / Wissensdatenbank',
    localLlmFineTuneTab: 'Fine-Tuning',
    localLlmRagSubtext: 'Laden Sie .txt oder .md Dateien hoch, um die Wissensdatenbank Ihres lokalen LLMs für Retrieval-Augmented Generation (RAG) zu füllen.',
    localLlmDropzone: 'Dateien hierher ziehen oder klicken, um sie auszuwählen.',
    localLlmUploading: 'Lädt hoch...',
    localLlmUploadButton: 'Ausgewählte Dateien hochladen',
    localLlmFineTuneSubtext: 'Fügen Sie Ihre Trainingsdaten (im JSONL-Format erwartet) ein, um einen Fine-Tuning-Job auf Ihrem lokalen Server zu starten.',
    localLlmStartingJob: 'Starte Fine-Tuning-Job...',
    localLlmJobStarted: (id: string) => \`Job gestartet mit ID: \${id}\`,
    localLlmWaitingForLogs: 'Warte auf Server-Logs... (Diese Funktion ist eine Demo)',
    localLlmError: 'Fehler',
    localLlmStarting: 'Starte...',
    localLlmStartFineTune: 'Fine-Tuning starten',
    localLlmApiUrlNotSet: 'Lokale LLM API URL ist nicht in den Einstellungen konfiguriert.',
    localLlmFileUploadSuccess: (name: string) => \`Datei '\${name}' erfolgreich hochgeladen.\`,
    localLlmFileUploadError: (name: string, error: string) => \`Fehler beim Hochladen von '\${name}': \${error}\`,
    localLlmTrainingDataEmpty: 'Trainingsdaten dürfen nicht leer sein.',
    localLlmJobStartSuccess: 'Fine-Tuning-Job erfolgreich gestartet.',
    localLlmJobStartError: (error: string) => \`Fehler beim Starten des Fine-Tuning: \${error}\`,

    // PromptOptimizerModal.tsx
    optimizerErrorApiKey: 'Fehler: API-Schlüssel nicht konfiguriert.',
    optimizerErrorGeneral: 'Entschuldigung, es ist ein Fehler aufgetreten.',
    optimizerErrorCommunication: 'Entschuldigung, bei der Kommunikation ist ein Fehler aufgetreten.',
    optimizerPromptCreated: 'Ein optimierter Prompt wurde erstellt!',
    optimizerUsePrompt: 'Prompt übernehmen und schließen',
    optimizerPlaceholder: 'Ihre Antwort...',
    optimizerSend: 'Senden',

    // WorkflowWizardModal.tsx
    wizardUsePrompt: 'Prompt übernehmen und schließen',
    wizardPromptCreated: 'Ein technischer Prompt wurde erstellt!',
    wizardPlaceholder: 'Ihre Antwort...',
    wizardSend: 'Senden',
    
    // SettingsModal.tsx
    settingsTitle: 'Einstellungen',
    settingsClose: 'Einstellungen schließen',
    settingsComfyUrl: 'ComfyUI API URL',
    settingsComfyUrlHelp: 'Geben Sie die Basis-URL für Ihre laufende ComfyUI-Instanz ein. Dies wird für die "Run"-Funktionalität verwendet.',
    settingsLocalLlmUrl: 'Lokale LLM API URL',
    settingsLocalLlmUrlHelp: 'Geben Sie die Basis-URL für Ihren lokalen LLM-Server ein. Dies wird für RAG und Fine-Tuning verwendet.',
    settingsSave: 'Speichern & Schließen',
    settingsDownloadSource: 'Quellcode herunterladen',
    settingsDownloadSourceHelp: 'Laden Sie alle Quelldateien dieser Anwendung gebündelt in einer einzigen .txt-Datei herunter.',

    // DocumentationPanel.tsx
    docLoading: 'Dokumentation wird geladen...',
    docErrorTitle: 'Fehler',
    docErrorContent: (status: number) => \`Dokumentation konnte nicht geladen werden (HTTP-Status \${status}).\`,
    docErrorUnknown: 'Ein unbekannter Fehler ist aufgetreten.',
  }
};` },
      { name: 'types.ts', content: `export interface ComfyUINode {
  id: number;
  type: string;
  pos: [number, number];
  size: { '0': number, '1': number };
  flags: object;
  order: number;
  mode: number;
  inputs?: Array<{ name: string; type: string; link: number | null }>;
  outputs?: Array<{ name: string; type: string; links: number[] | null; slot_index?: number }>;
  properties: { [key: string]: any };
  widgets_values?: any[];
  title?: string;
}

export type ComfyUILink = [number, number, number, number, number, string];

export interface ComfyUIWorkflow {
  last_node_id: number;
  last_link_id: number;
  nodes: ComfyUINode[];
  links: ComfyUILink[];
  groups: any[];
  config: object;
  extra: object;
  version: number;
}

export interface CustomNodeRequirement {
  name: string;
  url: string | null;
  install_instructions: string;
}

export interface ModelRequirement {
  name: string;
  url: string | null;
  model_type: string;
  install_path: string | null;
}

export interface WorkflowRequirements {
  custom_nodes: CustomNodeRequirement[];
  models: ModelRequirement[];
}

export interface ValidationLogEntry {
  check: string;
  status: 'passed' | 'corrected' | 'failed';
  details: string;
}

export interface DebugLogEntry {
  analysis: string;
  action: string;
  reasoning: string;
}

export interface GeneratedWorkflowResponse {
  workflow: ComfyUIWorkflow;
  requirements: WorkflowRequirements;
  validationLog?: ValidationLogEntry[];
  correctionLog?: DebugLogEntry[];
}

export interface ValidationResponse {
    validationLog: ValidationLogEntry[];
    correctedWorkflow: ComfyUIWorkflow;
}

export interface DebugResponse {
    correctionLog: DebugLogEntry[];
    correctedWorkflow: ComfyUIWorkflow;
}

export interface HistoryEntry {
  id: string;
  prompt: string;
  timestamp: string;
  data: GeneratedWorkflowResponse;
}` },
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
        return <InputPanel prompt={prompt} setPrompt={setPrompt} onGenerate={handleGenerate} isLoading={loadingState.active} onOpenOptimizer={() => setIsOptimizerOpen(true)} onOpenWizard={() => setIsWizardOpen(true)} />;
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
    <div className="text-white h-screen flex flex-col font-sans p-4 gap-4">
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
            ].map(view => (
                <button 
                    key={view.key} 
                    onClick={() => setMainView(view.key as MainView)}
                    className={`px-4 py-1.5 text-sm rounded-full transition-all duration-300 ${mainView === view.key ? 'bg-teal-500/80 text-white shadow-md' : 'text-gray-400 hover:bg-white/10'}`}
                >
                    {view.label}
                </button>
            ))}
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={toggleLanguage} className="p-2 w-12 text-center text-sm font-semibold text-gray-400 hover:bg-white/10 rounded-full transition-colors">
                {language === 'de' ? 'EN' : 'DE'}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" aria-label={t.settingsTitle}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-grow flex flex-row overflow-hidden gap-4">
        {renderMainView()}
        {mainView !== 'documentation' && (
            loadingState.active ? (
              <div className="w-full lg:w-1/2 glass-panel rounded-2xl flex flex-col">
                <ProgressBarLoader message={loadingState.message} progress={loadingState.progress} />
              </div>
            ) : (
              <OutputPanel 
                workflowData={generatedData}
                onDownload={() => generatedData && handleDownload(generatedData)}
                onCopy={handleCopy}
                onRun={handleRunWorkflow}
                onValidate={() => generatedData && handleValidation(JSON.stringify(generatedData.workflow), '')}
                onLoad={handleLoadWorkflow}
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

      {isWizardOpen && (
        <WorkflowWizardModal
            isOpen={isWizardOpen}
            onClose={() => setIsWizardOpen(false)}
            onComplete={handleWizardComplete}
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