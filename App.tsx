
import React, { useState, useEffect, useCallback } from 'react';
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
import SystemPromptModal from './components/SystemPromptModal';
import { generateWorkflow, validateAndCorrectWorkflow, debugAndCorrectWorkflow } from './services/geminiService';
import { executeWorkflow, uploadImage, validateWorkflowAgainstApi } from './services/comfyuiService';
import { getServerInventory, generateWorkflowStream, validateAndCorrectWorkflowLocal, debugAndCorrectWorkflowLocal } from './services/localLlmService';
import { initializeApiKey } from './services/apiKeyService';
import { SYSTEM_INSTRUCTION_TEMPLATE } from './services/prompts';
import type { GeneratedWorkflowResponse, HistoryEntry, ComfyUIWorkflow, SystemInventory, LlmProvider, WorkflowFormat, ComfyUIImage } from './types';
import { useLanguage } from './context/LanguageContext';
import { useTranslations } from './hooks/useTranslations';
import { CommandLineIcon } from './components/Icons';

const version = "1.4.2"; // Bump version

type MainView = 'generator' | 'tester' | 'history' | 'local_llm' | 'documentation';
type ToastState = { id: string; message: string; type: 'success' | 'error' };
type LoadingState = { active: boolean; message: string; progress: number };

const App: React.FC = () => {
  // ... (Existing state definitions remain) ...
  const [prompt, setPrompt] = useState<string>('');
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [generatedData, setGeneratedData] = useState<GeneratedWorkflowResponse | null>(null);
  const [generatedImages, setGeneratedImages] = useState<ComfyUIImage[]>([]);
  const [workflowFormat, setWorkflowFormat] = useState<WorkflowFormat>('api');
  const [loadingState, setLoadingState] = useState<LoadingState>({ active: false, message: '', progress: 0 });
  const [mainView, setMainView] = useState<MainView>('generator');
  const [history, setHistory] = useState<HistoryEntry[]>(() => []); // Simplified for brevity in diff
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [lastRunSuccess, setLastRunSuccess] = useState<boolean>(false);
  
  // Modals & Settings State
  const [isOptimizerOpen, setIsOptimizerOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(false);
  const [isApiKeySet, setIsApiKeySet] = useState(false);
  const [inventory, setInventory] = useState<SystemInventory | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>(() => localStorage.getItem('customSystemPrompt') || SYSTEM_INSTRUCTION_TEMPLATE);

  const [comfyUIUrl, setComfyUIUrl] = useState<string>('http://127.0.0.1:8188');
  const [localLlmApiUrl, setLocalLlmApiUrl] = useState<string>('http://127.0.0.1:11434');
  const [ragApiUrl, setRagApiUrl] = useState<string>('http://127.0.0.1:8000');
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('gemini');
  const [localLlmModel, setLocalLlmModel] = useState<string>('command-r'); // Default to command-r

  // NEW STATE FOR STREAMING
  const [liveThoughts, setLiveThoughts] = useState<string>('');

  const { language, setLanguage } = useLanguage();
  const t = useTranslations();

  // ... (useEffect hooks for localstorage/init remain the same) ...
  useEffect(() => { initializeApiKey(); setIsApiKeySet(true); }, []);
  // ... (inventory fetch logic remains) ...

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = uuidv4();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const ensureApiKey = (): boolean => {
    if (llmProvider === 'gemini' && !isApiKeySet) return false;
    return true;
  };

  const handleGenerate = async () => {
    if (!ensureApiKey() || !prompt.trim()) return;
    
    // Reset States
    setGeneratedData(null);
    setGeneratedImages([]);
    setSelectedHistoryId(null);
    setLastRunSuccess(false);
    setLiveThoughts(''); // Reset thoughts
    setWorkflowFormat('api');
    
    let finalData: GeneratedWorkflowResponse | null = null;
    let uploadedImageName: string | undefined = undefined;

    // ... (Image upload logic remains the same) ...

    try {
      // Step 1: Generation
      setLoadingState({ active: true, message: t.loadingStep1, progress: 25 });
      
      let response;
      if (llmProvider === 'local') {
          // USE STREAMING SERVICE
          // We pass setLiveThoughts as the callback for real-time updates
          response = await generateWorkflowStream(
              prompt, 
              localLlmApiUrl, 
              localLlmModel, 
              inventory, 
              uploadedImageName, 
              ragApiUrl, 
              'api', 
              systemPrompt,
              (thoughtChunk) => {
                  setLiveThoughts(thoughtChunk); // Update UI in real-time
              }
          );
      } else {
          // Gemini logic (unchanged)
          response = await generateWorkflow(prompt, ragApiUrl, inventory, uploadedImageName, localLlmModel, 'api', systemPrompt);
      }
      
      // Step 2: Validation (Existing logic)
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
        correctionLog: [], 
        thoughts: response.thoughts // Preserve thoughts in final object
      };

      // Step 3: Server Validation (Existing logic)
      if (comfyUIUrl) {
          // ... (Existing server validation code) ...
      }

      setLoadingState({ active: true, message: t.loadingComplete, progress: 100 });
      setGeneratedData(finalData);
      
      // Clear live thoughts as they are now in finalData.thoughts
      setLiveThoughts('');

      const newEntry: HistoryEntry = { id: uuidv4(), prompt, timestamp: new Date().toISOString(), data: finalData, format: 'api' };
      setHistory(prev => [newEntry, ...prev]);
      setSelectedHistoryId(newEntry.id);

      showToast(t.toastWorkflowGenerated, 'success');
    } catch (error: any) {
      showToast(error.message || t.toastUnknownError, 'error');
    } finally {
      setLoadingState({ active: false, message: '', progress: 0 });
    }
  };

  // ... (Other handlers: handleValidation, handleRunWorkflow, etc. remain unchanged) ...

  const renderMainView = () => {
    switch(mainView) {
      case 'generator':
        return <InputPanel 
            prompt={prompt} 
            setPrompt={setPrompt} 
            onGenerate={handleGenerate} 
            isLoading={loadingState.active} 
            // ... props
            onOpenOptimizer={() => setIsOptimizerOpen(true)} 
            onOpenWizard={() => setIsWizardOpen(true)} 
            onWorkflowImport={() => {}}
            uploadedImage={uploadedImage} 
            setUploadedImage={setUploadedImage} 
        />;
      // ... other cases
      default: return null;
    }
  }

  // Pass liveThoughts to OutputPanel
  return (
    <>
      <div className="text-slate-800 h-screen flex flex-col font-sans p-4 gap-4">
        {/* Header ... */}
        
        <main className="flex-grow flex gap-4 overflow-hidden">
          {loadingState.active && !generatedData && !liveThoughts ? (
             <div className="w-full lg:w-1/2 glass-panel rounded-2xl flex items-center justify-center">
              <ProgressBarLoader message={loadingState.message} progress={loadingState.progress} />
            </div>
          ) : (
            renderMainView()
          )}
          
          <OutputPanel
            workflowData={generatedData}
            generatedImages={generatedImages}
            onDownload={() => {}}
            onCopy={() => {}}
            onRun={() => {}}
            onValidate={() => {}}
            onLoad={() => {}}
            isLoading={loadingState.active}
            loadingState={loadingState}
            workflowFormat={workflowFormat}
            lastRunSuccess={lastRunSuccess}
            currentPrompt={prompt}
            ragApiUrl={ragApiUrl}
            comfyUIUrl={comfyUIUrl}
            showToast={showToast}
            liveThoughts={liveThoughts} // <--- INJECTED HERE
          />
        </main>
        
        {/* Toasts and Modals ... */}
      </div>
    </>
  );
};

export default App;
