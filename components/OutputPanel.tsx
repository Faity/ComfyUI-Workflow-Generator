

import React, { useState, useEffect } from 'react';
import WorkflowVisualizer from './WorkflowVisualizer';
import type { GeneratedWorkflowResponse, ValidationLogEntry, DebugLogEntry, ComfyUIWorkflow, WorkflowFormat } from '../types';
import { DownloadIcon, ClipboardIcon, PlayIcon, BugAntIcon, Square2StackIcon, SparklesIcon, DatabaseIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';
import ProgressBarLoader from './Loader';
import { learnWorkflow } from '../services/localLlmService';

interface OutputPanelProps {
  workflowData: GeneratedWorkflowResponse | null;
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
  showToast?: (message: string, type: 'success' | 'error') => void;
}

type Tab = 'visualizer' | 'workflow' | 'requirements' | 'logs';

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
            // Using the actual prompt and workflow for RAG learning
            await learnWorkflow(type, prompt, workflow, apiUrl);
            setSaved(true);
            onToast(t.toastLearnSuccess, 'success');
        } catch (e: any) {
            onToast(t.toastLearnError + ': ' + e.message, 'error');
        } finally {
            setSaving(null);
        }
    };

    if (saved) return null; // Hide after saving

    return (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-teal-100 p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in">
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

const OutputPanel: React.FC<OutputPanelProps> = ({ 
    workflowData, 
    onDownload, 
    onCopy, 
    onRun, 
    onValidate, 
    onLoad, 
    isLoading = false, 
    loadingState = {message: '', progress: 0}, 
    workflowFormat = 'graph',
    lastRunSuccess = false,
    currentPrompt = '',
    ragApiUrl = '',
    showToast = () => {}
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('visualizer');
  const t = useTranslations();

  useEffect(() => {
    if (workflowData) {
      if (workflowFormat === 'api') {
          setActiveTab('workflow');
          return;
      }

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
  }, [workflowData, workflowFormat]);

  if (!workflowData) {
    return (
      <div className="w-full lg:w-1/2 glass-panel rounded-2xl flex flex-col items-center justify-center text-center p-6">
        <div className="text-slate-500">
           <div className="relative w-24 h-24 mx-auto mb-4">
              <div className="absolute inset-0 bg-teal-100 rounded-full animate-ping"></div>
              <svg xmlns="http://www.w3.org/2000/svg" className="relative w-24 h-24 text-teal-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M12 14.5v-5.714c0-.597-.237-1.17-.659-1.591L7 3.104M12 14.5c0 0-3.032 3.032-3.75 3.75M12 14.5c0 0 3.032 3.032 3.75 3.75" />
              </svg>
           </div>
          <h3 className="text-2xl font-bold text-slate-700">{t.waitingForGeneration}</h3>
          <p className="mt-2 max-w-sm text-slate-500">{t.waitingForGenerationSubtext}</p>
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
        <div key={index} className={`p-4 border-l-4 rounded-r-lg ${colorClass}`}>
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
      { key: 'visualizer', label: t.outputVisualizer },
      { key: 'workflow', label: t.outputWorkflow },
      { key: 'requirements', label: t.outputRequirements },
  ];

  if (hasLogs) {
      tabConfig.push({ key: 'logs', label: t.outputLogs });
  }

  return (
    <div className="relative w-full lg:w-1/2 glass-panel rounded-2xl flex flex-col overflow-hidden">
      
      {/* Feedback Bar for Successful Runs */}
      {lastRunSuccess && ragApiUrl && (
          <FeedbackBar 
            prompt={currentPrompt || ''} 
            workflow={workflow} 
            apiUrl={ragApiUrl}
            onToast={showToast}
          />
      )}

      <div className="flex-shrink-0 p-3 flex justify-between items-center border-b border-slate-200">
        <div className="flex space-x-1 bg-slate-100 p-1 rounded-full border border-slate-200">
          {tabConfig.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              // Disable Visualizer tab if API format is used
              disabled={tab.key === 'visualizer' && workflowFormat === 'api'}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-300 ${
                activeTab === tab.key ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:bg-white/50 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center space-x-2">
            <button onClick={onValidate} title={t.tooltipValidate} disabled={isLoading} className="p-2.5 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors disabled:opacity-50 border border-slate-200"><BugAntIcon className="w-5 h-5" /></button>
            <button onClick={onRun} title={t.tooltipRun} disabled={isLoading} className="p-2.5 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors disabled:opacity-50 border border-slate-200"><PlayIcon className="w-5 h-5" /></button>
            <button onClick={onLoad} title={t.tooltipLoad} disabled={isLoading} className="p-2.5 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors disabled:opacity-50 border border-slate-200"><Square2StackIcon className="w-5 h-5" /></button>
            <button onClick={onCopy} title={t.tooltipCopy} disabled={isLoading} className="p-2.5 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors disabled:opacity-50 border border-slate-200"><ClipboardIcon className="w-5 h-5" /></button>
            <button onClick={onDownload} title={t.tooltipDownload} disabled={isLoading} className="p-2.5 bg-teal-600 text-white rounded-full hover:bg-teal-500 transition-colors disabled:opacity-50 shadow-md"><DownloadIcon className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex-grow overflow-auto bg-white/50">
        {activeTab === 'visualizer' && (
            workflowFormat === 'graph' ? (
                <WorkflowVisualizer workflow={workflow as ComfyUIWorkflow} />
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mb-4 text-slate-300">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                    <h3 className="text-lg font-medium">{t.visualizerNotAvailable}</h3>
                    <p className="text-sm mt-2">{t.visualizerNotAvailableSubtext}</p>
                </div>
            )
        )}
        {activeTab === 'workflow' && (
          <pre className="text-xs p-4 text-slate-700 bg-slate-50 h-full font-mono">
            <code>{JSON.stringify(workflow, null, 2)}</code>
          </pre>
        )}
        {activeTab === 'requirements' && (
          <div className="p-6 space-y-6">
             <h3 className="text-lg font-bold text-slate-800">{t.customNodes}</h3>
             {requirements.custom_nodes.length > 0 ? requirements.custom_nodes.map((node, i) => (
                <div key={i} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <p className="font-semibold text-slate-800">{node.name}</p>
                    {node.url && <a href={node.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline">{node.url}</a>}
                    <pre className="text-xs mt-2 p-3 bg-slate-50 border border-slate-100 text-slate-600 rounded-lg whitespace-pre-wrap font-mono"><code>{node.install_instructions}</code></pre>
                </div>
             )) : <p className="text-sm text-slate-500">{t.noCustomNodes}</p>}
             <h3 className="text-lg font-bold text-slate-800">{t.models}</h3>
              {requirements.models.length > 0 ? requirements.models.map((model, i) => (
                <div key={i} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <p className="font-semibold text-slate-800">{model.name} <span className="text-xs text-slate-400">({model.model_type})</span></p>
                    {model.url && <a href={model.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline">{t.downloadLink}</a>}
                    {model.install_path && <p className="text-xs text-slate-500 mt-1">{t.installTo} <code className="bg-slate-100 px-1 rounded border border-slate-200">{model.install_path}</code></p>}
                </div>
              )) : <p className="text-sm text-slate-500">{t.noModels}</p>}
          </div>
        )}
        {activeTab === 'logs' && hasLogs && (
            <div className="p-6 space-y-4">
                {validationLog && validationLog.map(renderLogEntry)}
                {correctionLog && correctionLog.map(renderLogEntry)}
            </div>
        )}
      </div>
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
          <ProgressBarLoader message={loadingState.message} progress={loadingState.progress} />
        </div>
      )}
    </div>
  );
};

export default OutputPanel;