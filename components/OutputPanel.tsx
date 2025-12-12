import React, { useState, useEffect } from 'react';
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
}

type Tab = 'json' | 'guide' | 'logs';

const FeedbackBar: React.FC<{ 
    prompt: string, 
    workflow: any, 
    apiUrl: string, 
    onToast: (msg: string, type: 'success'|'error') => void 
}> = ({ prompt, workflow, apiUrl, onToast }) => {
    const t = useTranslations();
    const [saving, setSaving] = useState<'short' | 'gold' | null>(null);
    const [saved, setSaved] = useState(false);

    const handleSave = async (type: 'short' | 'promote') => {
        if (!apiUrl) return;
        setSaving(type === 'short' ? 'short' : 'gold');
        try {
            await learnWorkflow(type, prompt, workflow, apiUrl);
            setSaved(true);
            onToast(t.toastLearnSuccess, 'success');
        } catch (e: any) {
            onToast(t.toastLearnError + ': ' + e.message, 'error');
        } finally {
            setSaving(null);
        }
    };

    if (saved) return null;

    return (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-t border-teal-100 p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in">
            <div className="flex items-start space-x-3">
                 <div className="bg-teal-100 p-2 rounded-full text-teal-600">
                    <SparklesIcon className="w-5 h-5" />
                 </div>
                 <div>
                     <h4 className="font-bold text-teal-900">{t.feedbackTitle}</h4>
                     <p className="text-sm text-teal-700">{t.feedbackSubtext}</p>
                 </div>
            </div>
            <div className="flex space-x-2 flex-shrink-0">
                <button 
                    onClick={() => handleSave('short')}
                    disabled={!!saving}
                    className="px-3 py-1.5 text-xs font-semibold bg-white text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors shadow-sm flex items-center"
                >
                    {saving === 'short' ? t.learningSaving : t.btnAutoSave}
                </button>
                <button 
                    onClick={() => handleSave('promote')}
                    disabled={!!saving}
                    className="px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white border border-teal-600 rounded-lg hover:bg-teal-700 transition-colors shadow-sm flex items-center"
                >
                     {saving === 'gold' ? t.learningSaving : (
                         <>
                            <DatabaseIcon className="w-3 h-3 mr-1" />
                            {t.btnGoldStandard}
                         </>
                     )}
                </button>
            </div>
        </div>
    );
}

const ImagePreview: React.FC<{ images: ComfyUIImage[], comfyUrl: string }> = ({ images, comfyUrl }) => {
    const t = useTranslations();
    
    // Get last image as main preview
    const mainImage = images[images.length - 1];
    
    const getImageUrl = (img: ComfyUIImage) => {
        const params = new URLSearchParams({
            filename: img.filename,
            subfolder: img.subfolder,
            type: img.type
        });
        return `${comfyUrl}/view?${params.toString()}`;
    };

    const downloadImage = async (img: ComfyUIImage) => {
        const url = getImageUrl(img);
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = img.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch (e) {
            console.error("Download failed", e);
        }
    };

    return (
        <div className="bg-slate-900 flex flex-col items-center justify-center p-4 min-h-[300px] relative group overflow-hidden">
            <div className="w-full h-full flex items-center justify-center">
                 <img 
                    src={getImageUrl(mainImage)} 
                    alt="Generiertes Bild" 
                    className="max-h-[500px] max-w-full object-contain rounded shadow-2xl"
                 />
            </div>
            <div className="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={() => downloadImage(mainImage)}
                    className="p-2 bg-black/60 text-white rounded-full hover:bg-black/80 backdrop-blur-sm transition-colors"
                    title={t.downloadImage}
                >
                    <DownloadIcon className="w-5 h-5" />
                </button>
            </div>
            {images.length > 1 && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-2 px-4 overflow-x-auto">
                    {images.map((img, idx) => (
                        <div key={idx} className={`w-12 h-12 border-2 rounded overflow-hidden cursor-pointer ${img === mainImage ? 'border-teal-500' : 'border-white/30'}`}>
                            <img src={getImageUrl(img)} className="w-full h-full object-cover" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const ReasoningAccordion: React.FC<{ thoughts: string }> = ({ thoughts }) => {
    const [isOpen, setIsOpen] = useState(true);

    if (!thoughts) return null;

    return (
        <div className="mx-4 mt-4 mb-2">
            <div 
                className={`
                    border border-indigo-200 rounded-xl overflow-hidden transition-all duration-300
                    ${isOpen ? 'bg-indigo-50/50' : 'bg-white hover:bg-indigo-50/30'}
                `}
            >
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between p-3 text-left focus:outline-none"
                >
                    <div className="flex items-center space-x-2 text-indigo-800">
                        <LightBulbIcon className="w-5 h-5 text-indigo-500" />
                        <span className="font-semibold text-sm">AI Reasoning</span>
                        <span className="text-xs text-indigo-400 bg-indigo-100 px-2 py-0.5 rounded-full border border-indigo-200">
                            Chain of Thought
                        </span>
                    </div>
                    <span className={`text-indigo-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                        ▼
                    </span>
                </button>
                
                {isOpen && (
                    <div className="px-4 pb-4 animate-fade-in-down">
                        <div className="text-sm text-slate-700 leading-relaxed font-mono bg-white/50 p-3 rounded-lg border border-indigo-100 shadow-inner whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar">
                            {thoughts}
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
    onDownload, 
    onCopy, 
    onRun, 
    onValidate, 
    onLoad, 
    isLoading = false, 
    loadingState = {message: '', progress: 0}, 
    lastRunSuccess = false,
    currentPrompt = '',
    ragApiUrl = '',
    comfyUIUrl = '',
    showToast = () => {}
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('json');
  const t = useTranslations();

  useEffect(() => {
    if (workflowData) {
      const { validationLog, correctionLog } = workflowData;
      const hasCorrectionsOrErrors = (validationLog && validationLog.some(l => l.status === 'corrected' || l.status === 'failed')) || (correctionLog && correctionLog.length > 0);
      
      // If there are errors, show logs, otherwise default to JSON view
      if (hasCorrectionsOrErrors) {
        setActiveTab('logs');
      } else {
        setActiveTab('json');
      }
    } else {
        setActiveTab('json');
    }
  }, [workflowData]);

  if (!workflowData) {
    return (
      <div className="w-full lg:w-1/2 glass-panel rounded-2xl flex flex-col items-center justify-center text-center p-6 min-h-[500px]">
        <div className="text-slate-500">
           <div className="relative w-24 h-24 mx-auto mb-4">
              <div className="absolute inset-0 bg-teal-100 rounded-full animate-ping opacity-20"></div>
              <svg xmlns="http://www.w3.org/2000/svg" className="relative w-24 h-24 text-teal-500/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
              </svg>
           </div>
          <h3 className="text-2xl font-bold text-slate-700">{t.waitingForGeneration}</h3>
          <p className="mt-2 max-w-sm text-slate-500 mx-auto">{t.waitingForGenerationSubtext}</p>
        </div>
      </div>
    );
  }

  const { workflow, requirements, validationLog, correctionLog, thoughts } = workflowData;
  const hasLogs = (validationLog && validationLog.length > 0) || (correctionLog && correctionLog.length > 0);
  const hasImages = generatedImages && generatedImages.length > 0;

  const renderLogEntry = (log: ValidationLogEntry | DebugLogEntry, index: number) => {
    const isValidationLog = 'check' in log;
    const status = isValidationLog ? log.status : 'corrected';
    
    const colorClass = {
        passed: 'border-green-500 bg-green-50',
        corrected: 'border-sky-500 bg-sky-50',
        failed: 'border-red-500 bg-red-50',
    }[status];

    const textColorClass = {
        passed: 'text-green-600',
        corrected: 'text-sky-600',
        failed: 'text-red-600',
    }[status];
    
    return (
        <div key={index} className={`p-4 border-l-4 rounded-r-lg ${colorClass} mb-3`}>
            {isValidationLog ? (
                <>
                    <p className="font-semibold text-slate-800">{log.check}: <span className={`font-bold uppercase text-sm ${textColorClass}`}>{log.status}</span></p>
                    <p className="text-sm text-slate-600 mt-1">{log.details}</p>
                </>
            ) : (
                <>
                    <p className="font-semibold text-slate-800">{t.correctionAnalysis}</p>
                    <p className="text-sm text-slate-600 mt-2"><strong className="text-slate-700">{t.analysis}</strong> {log.analysis}</p>
                    <p className="text-sm text-slate-600 mt-1"><strong className="text-slate-700">{t.action}</strong> {log.action}</p>
                    <p className="text-sm text-slate-600 mt-1"><strong className="text-slate-700">{t.reasoning}</strong> {log.reasoning}</p>
                </>
            )}
        </div>
    );
  };

  const tabConfig: {key: Tab, label: string}[] = [
      { key: 'json', label: t.outputJson },
      { key: 'guide', label: t.outputGuide },
  ];

  if (hasLogs) {
      tabConfig.push({ key: 'logs', label: t.outputLogs });
  }

  return (
    <div className="relative w-full lg:w-1/2 glass-panel rounded-2xl flex flex-col overflow-hidden h-[calc(100vh-8rem)]">
      
      {/* Image Preview Area - Always visible if images exist */}
      {hasImages && comfyUIUrl && (
          <ImagePreview images={generatedImages} comfyUrl={comfyUIUrl} />
      )}

      {/* Feedback Bar for Successful Runs */}
      {lastRunSuccess && ragApiUrl && (
          <FeedbackBar 
            prompt={currentPrompt || ''} 
            workflow={workflow} 
            apiUrl={ragApiUrl}
            onToast={showToast}
          />
      )}

      {/* Header Toolbar */}
      <div className="flex-shrink-0 p-3 flex justify-between items-center border-b border-slate-200 bg-white/50 backdrop-blur-sm">
        <div className="flex space-x-1 bg-slate-100 p-1 rounded-full border border-slate-200">
          {tabConfig.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-300 ${
                activeTab === tab.key ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center space-x-2">
            <button onClick={onValidate} title={t.tooltipValidate} disabled={isLoading} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 border border-slate-200"><BugAntIcon className="w-5 h-5" /></button>
            <button onClick={onRun} title={t.tooltipRun} disabled={isLoading} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 border border-slate-200"><PlayIcon className="w-5 h-5" /></button>
            <button onClick={onLoad} title={t.tooltipLoad} disabled={isLoading} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 border border-slate-200"><Square2StackIcon className="w-5 h-5" /></button>
            <button onClick={onCopy} title={t.tooltipCopy} disabled={isLoading} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 border border-slate-200"><ClipboardIcon className="w-5 h-5" /></button>
            <button onClick={onDownload} title={t.tooltipDownload} disabled={isLoading} className="p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors disabled:opacity-50 shadow-md"><DownloadIcon className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex-grow overflow-auto bg-slate-50">
        
        {/* Chain of Thought Visualization */}
        {thoughts && (
            <ReasoningAccordion thoughts={thoughts} />
        )}
        
        {/* JSON Code View */}
        {activeTab === 'json' && (
          <div className="h-full relative group">
             <button 
                onClick={onCopy} 
                className="absolute top-4 right-4 p-2 bg-white/90 border border-slate-200 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-teal-600"
                title={t.tooltipCopy}
             >
                <ClipboardIcon className="w-4 h-4" />
             </button>
             <pre className="text-xs p-4 text-slate-700 font-mono h-full overflow-auto leading-relaxed selection:bg-teal-100">
                <code>{JSON.stringify(workflow, null, 2)}</code>
             </pre>
          </div>
        )}

        {/* Guide / Requirements View */}
        {activeTab === 'guide' && (
          <div className="p-8 max-w-4xl mx-auto space-y-8">
             <div>
                <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <span className="bg-teal-100 text-teal-700 p-1.5 rounded-md mr-3 text-sm">Step 1</span>
                    {t.customNodes}
                </h3>
                {requirements.custom_nodes.length > 0 ? (
                    <div className="grid gap-4">
                        {requirements.custom_nodes.map((node, i) => (
                            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                    <p className="font-bold text-slate-800">{node.name}</p>
                                    {node.url && <a href={node.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-sky-600 hover:text-sky-700 bg-sky-50 px-2 py-1 rounded-md border border-sky-100">GitHub</a>}
                                </div>
                                <div className="bg-slate-900 rounded-lg p-3 mt-3 group relative">
                                    <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all">{node.install_instructions}</pre>
                                    <button 
                                        onClick={() => navigator.clipboard.writeText(node.install_instructions)}
                                        className="absolute top-2 right-2 p-1.5 bg-white/10 text-white rounded hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Copy Command"
                                    >
                                        <ClipboardIcon className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 text-slate-500 text-sm italic">
                        {t.noCustomNodes}
                    </div>
                )}
             </div>

             <div>
                <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <span className="bg-indigo-100 text-indigo-700 p-1.5 rounded-md mr-3 text-sm">Step 2</span>
                    {t.models}
                </h3>
                {requirements.models.length > 0 ? (
                    <div className="grid gap-4">
                        {requirements.models.map((model, i) => (
                            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="font-bold text-slate-800 text-lg">{model.name}</p>
                                        <span className="inline-block mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                            {model.model_type}
                                        </span>
                                    </div>
                                    {model.url && (
                                        <a href={model.url} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm font-medium text-teal-600 hover:text-teal-700 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-100 transition-colors">
                                            <DownloadIcon className="w-4 h-4 mr-2" />
                                            {t.downloadLink}
                                        </a>
                                    )}
                                </div>
                                
                                {model.install_path && (
                                    <div className="mt-4 flex items-center text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        <span className="mr-2 flex-shrink-0 text-slate-400">{t.installTo}</span>
                                        <code className="font-mono text-slate-800 break-all">{model.install_path}</code>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 text-slate-500 text-sm italic">
                        {t.noModels}
                    </div>
                )}
             </div>
          </div>
        )}

        {/* Logs View */}
        {activeTab === 'logs' && hasLogs && (
            <div className="p-8 max-w-4xl mx-auto">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Validation & Debug Logs</h3>
                <div className="space-y-4">
                    {validationLog && validationLog.map(renderLogEntry)}
                    {correctionLog && correctionLog.map(renderLogEntry)}
                </div>
            </div>
        )}

      </div>
      
      {isLoading && (
        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-10 transition-opacity duration-300">
          <ProgressBarLoader message={loadingState.message} progress={loadingState.progress} />
        </div>
      )}
    </div>
  );
};

export default OutputPanel;
