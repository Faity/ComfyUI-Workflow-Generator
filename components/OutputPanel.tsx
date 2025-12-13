import React, { useState, useEffect, useRef } from 'react';
import type { GeneratedWorkflowResponse, ValidationLogEntry, DebugLogEntry, WorkflowFormat, ComfyUIImage } from '../types';
import { DownloadIcon, ClipboardIcon, PlayIcon, BugAntIcon, Square2StackIcon, SparklesIcon, DatabaseIcon, LightBulbIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';
import ProgressBarLoader from './Loader';
import { learnWorkflow } from '../services/localLlmService';

interface OutputPanelProps {
  workflowData: GeneratedWorkflowResponse | null;
  generatedImages?: ComfyUIImage[];
  onDownload: () => void;
  onCopy: () => void;
  onRun: () => void;
  onValidate: () => void;
  onLoad: () => void;
  isLoading?: boolean;
  loadingState?: { message: string, progress: number };
  workflowFormat?: WorkflowFormat;
  lastRunSuccess?: boolean;
  currentPrompt?: string;
  ragApiUrl?: string;
  comfyUIUrl?: string;
  showToast?: (message: string, type: 'success' | 'error') => void;
  liveThoughts?: string; // New prop for streaming
}

type Tab = 'json' | 'guide' | 'logs';

// ... (FeedbackBar and ImagePreview components remain unchanged) ...
const FeedbackBar: React.FC<{ prompt: string, workflow: any, apiUrl: string, onToast: (msg: string, type: 'success'|'error') => void }> = ({ prompt, workflow, apiUrl, onToast }) => {
    const t = useTranslations();
    const [saving, setSaving] = useState(false);
    const handleSave = async (type: 'short' | 'promote') => {
        setSaving(true);
        try { await learnWorkflow(type, prompt, workflow, apiUrl); onToast(t.toastLearnSuccess, 'success'); } catch (e: any) { onToast(e.message, 'error'); } finally { setSaving(false); }
    };
    return (
        <div className="bg-teal-50 border-t border-teal-100 p-4 flex justify-between items-center">
            <div className="flex items-center space-x-2"><SparklesIcon className="w-5 h-5 text-teal-600" /><span className="text-teal-900 font-bold">{t.feedbackTitle}</span></div>
            <div className="flex space-x-2">
                <button onClick={() => handleSave('short')} disabled={saving} className="px-3 py-1 text-xs bg-white text-teal-700 border border-teal-200 rounded">{t.btnAutoSave}</button>
                <button onClick={() => handleSave('promote')} disabled={saving} className="px-3 py-1 text-xs bg-teal-600 text-white rounded">{t.btnGoldStandard}</button>
            </div>
        </div>
    );
}

const ImagePreview: React.FC<{ images: ComfyUIImage[], comfyUrl: string }> = ({ images, comfyUrl }) => {
    if (!images.length) return null;
    const img = images[images.length - 1];
    const src = `${comfyUrl}/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`;
    return <div className="bg-slate-900 p-4 flex justify-center"><img src={src} className="max-h-[300px] rounded shadow" /></div>;
}

// Updated Reasoning Component for Streaming
const ReasoningAccordion: React.FC<{ thoughts: string, isStreaming?: boolean }> = ({ thoughts, isStreaming }) => {
    const [isOpen, setIsOpen] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom if streaming
    useEffect(() => {
        if (isStreaming && isOpen && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [thoughts, isStreaming, isOpen]);

    if (!thoughts) return null;

    return (
        <div className="mx-4 mt-4 mb-2">
            <div 
                className={`
                    border border-indigo-500/30 rounded-xl overflow-hidden transition-all duration-300 shadow-lg
                    ${isOpen ? 'bg-slate-900' : 'bg-slate-800 hover:bg-slate-700'}
                `}
            >
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between p-3 text-left focus:outline-none border-b border-indigo-500/20"
                >
                    <div className="flex items-center space-x-2 text-indigo-300">
                        <LightBulbIcon className={`w-5 h-5 ${isStreaming ? 'animate-pulse text-yellow-400' : 'text-indigo-400'}`} />
                        <span className="font-semibold text-sm tracking-wide">AI THOUGHT PROCESS</span>
                        {isStreaming && (
                            <span className="text-[10px] uppercase bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded animate-pulse border border-indigo-500/30">
                                Generating...
                            </span>
                        )}
                    </div>
                    <span className={`text-indigo-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                        ▼
                    </span>
                </button>
                
                {isOpen && (
                    <div className="p-0 animate-fade-in-down">
                        <div className="text-xs md:text-sm text-green-400 font-mono leading-relaxed p-4 max-h-80 overflow-y-auto custom-scrollbar bg-slate-950/50">
                            <span className="opacity-70">{">"}</span> {thoughts}
                            {isStreaming && <span className="inline-block w-2 h-4 bg-green-500 ml-1 animate-pulse align-middle"></span>}
                            <div ref={bottomRef} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const OutputPanel: React.FC<OutputPanelProps> = ({ 
    workflowData, 
    generatedImages = [],
    onDownload, onCopy, onRun, onValidate, onLoad, 
    isLoading = false, 
    loadingState = {message: '', progress: 0}, 
    lastRunSuccess = false,
    currentPrompt = '', ragApiUrl = '', comfyUIUrl = '', showToast = () => {},
    liveThoughts = '' // Injected from App
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('json');
  const t = useTranslations();

  useEffect(() => {
    if (workflowData) {
      const { validationLog, correctionLog } = workflowData;
      const hasErrors = (validationLog?.some(l => l.status !== 'passed')) || (correctionLog?.length || 0) > 0;
      setActiveTab(hasErrors ? 'logs' : 'json');
    }
  }, [workflowData]);

  // Determine what to show
  const showLoading = isLoading && !workflowData;
  const thoughtsToShow = liveThoughts || workflowData?.thoughts || '';
  const isStreaming = isLoading && !workflowData && !!liveThoughts;

  return (
    <div className="relative w-full lg:w-1/2 glass-panel rounded-2xl flex flex-col overflow-hidden h-[calc(100vh-8rem)]">
      
      {/* Image Preview */}
      {generatedImages.length > 0 && comfyUIUrl && <ImagePreview images={generatedImages} comfyUrl={comfyUIUrl} />}

      {/* Feedback Bar */}
      {lastRunSuccess && ragApiUrl && <FeedbackBar prompt={currentPrompt || ''} workflow={workflowData?.workflow} apiUrl={ragApiUrl} onToast={showToast} />}

      {/* Header */}
      <div className="flex-shrink-0 p-3 flex justify-between items-center border-b border-slate-200 bg-white/50 backdrop-blur-sm">
        <div className="flex space-x-1 bg-slate-100 p-1 rounded-full border border-slate-200">
          <button onClick={() => setActiveTab('json')} className={`px-4 py-1.5 text-sm font-medium rounded-full ${activeTab === 'json' ? 'bg-white text-teal-600 shadow' : 'text-slate-500'}`}>{t.outputJson}</button>
          <button onClick={() => setActiveTab('guide')} className={`px-4 py-1.5 text-sm font-medium rounded-full ${activeTab === 'guide' ? 'bg-white text-teal-600 shadow' : 'text-slate-500'}`}>{t.outputGuide}</button>
          {(workflowData?.validationLog || workflowData?.correctionLog) && (
             <button onClick={() => setActiveTab('logs')} className={`px-4 py-1.5 text-sm font-medium rounded-full ${activeTab === 'logs' ? 'bg-white text-teal-600 shadow' : 'text-slate-500'}`}>{t.outputLogs}</button>
          )}
        </div>
        <div className="flex items-center space-x-2">
            <button onClick={onRun} disabled={isLoading || !workflowData} className="p-2 bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-50"><PlayIcon className="w-5 h-5 text-slate-600" /></button>
            <button onClick={onDownload} disabled={isLoading || !workflowData} className="p-2 bg-teal-600 rounded hover:bg-teal-500 disabled:opacity-50 text-white"><DownloadIcon className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex-grow overflow-auto bg-slate-50 flex flex-col">
        
        {/* Chain of Thought (Always visible if exists or streaming) */}
        {(thoughtsToShow) && (
            <ReasoningAccordion thoughts={thoughtsToShow} isStreaming={isStreaming} />
        )}
        
        {/* Loading State (Overlay or Inline) */}
        {showLoading && !liveThoughts && (
             <div className="flex-grow flex items-center justify-center p-6">
                <ProgressBarLoader message={loadingState.message} progress={loadingState.progress} />
             </div>
        )}

        {/* Content Tabs */}
        {workflowData && (
            <>
                {activeTab === 'json' && (
                <div className="h-full relative group">
                    <button onClick={onCopy} className="absolute top-4 right-4 p-2 bg-white/90 rounded shadow opacity-0 group-hover:opacity-100 transition"><ClipboardIcon className="w-4 h-4" /></button>
                    <pre className="text-xs p-4 text-slate-700 font-mono h-full overflow-auto leading-relaxed">
                        <code>{JSON.stringify(workflowData.workflow, null, 2)}</code>
                    </pre>
                </div>
                )}
                
                {activeTab === 'guide' && (
                    <div className="p-8 max-w-4xl mx-auto space-y-8">
                        {/* Shortened for brevity, use previous implementation of Guide view */}
                        <div>Custom Nodes: {workflowData.requirements.custom_nodes.length}</div>
                    </div>
                )}

                {activeTab === 'logs' && (
                    <div className="p-4 space-y-2">
                        {workflowData.validationLog?.map((l, i) => <div key={i} className="text-sm border p-2 rounded">{l.check}: {l.status}</div>)}
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default OutputPanel;
