import React, { useState, useEffect, useRef } from 'react';
import WorkflowVisualizer from './WorkflowVisualizer';
import type { GeneratedWorkflowResponse, ValidationLogEntry, DebugLogEntry, ExecutionLogEntry } from '../types';
import { DownloadIcon, ClipboardIcon, PlayIcon, BugAntIcon, Square2StackIcon, CheckCircleIcon, ExclamationCircleIcon, SparklesIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';
import ProgressBarLoader from './Loader';

interface OutputPanelProps {
  workflowData: GeneratedWorkflowResponse | null;
  executionLogs?: ExecutionLogEntry[];
  onDownload: () => void;
  onCopy: () => void;
  onRun: () => void;
  onValidate: () => void;
  onLoad: () => void;
  isLoading?: boolean;
  loadingState?: { message: string, progress: number };
}

type Tab = 'visualizer' | 'workflow' | 'requirements' | 'logs' | 'execution';

const OutputPanel: React.FC<OutputPanelProps> = ({ workflowData, executionLogs = [], onDownload, onCopy, onRun, onValidate, onLoad, isLoading = false, loadingState = {message: '', progress: 0} }) => {
  const [activeTab, setActiveTab] = useState<Tab>('visualizer');
  const logsEndRef = useRef<HTMLDivElement>(null);
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

  // Automatically switch to execution tab when logs start appearing
  useEffect(() => {
      if (executionLogs.length > 0) {
          setActiveTab('execution');
      }
  }, [executionLogs.length]);

  // Auto-scroll execution logs
  useEffect(() => {
      if (activeTab === 'execution' && logsEndRef.current) {
          logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [executionLogs, activeTab]);

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
  
  if (executionLogs.length > 0) {
      tabConfig.push({ key: 'execution', label: t.outputExecution });
  }

  return (
    <div className="relative w-full lg:w-1/2 glass-panel rounded-2xl flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-3 flex justify-between items-center border-b border-slate-200">
        <div className="flex space-x-1 bg-slate-100 p-1 rounded-full border border-slate-200 overflow-x-auto no-scrollbar max-w-[60%]">
          {tabConfig.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-300 whitespace-nowrap ${
                activeTab === tab.key ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'
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
        {activeTab === 'visualizer' && <WorkflowVisualizer workflow={workflow} />}
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
        {activeTab === 'execution' && (
             <div className="p-0 h-full bg-slate-900 text-slate-200 font-mono text-sm overflow-y-auto">
                 <div className="p-4 space-y-3">
                     {executionLogs.map((log, index) => (
                         <div key={index} className="flex items-start space-x-3 border-b border-slate-800 pb-3 last:border-0">
                             <span className="text-slate-500 text-xs whitespace-nowrap pt-0.5">{new Date(log.timestamp).toLocaleTimeString()}</span>
                             <div className="flex-grow">
                                 <div className="flex items-center">
                                     {log.level === 'success' && <CheckCircleIcon className="w-4 h-4 text-green-500 mr-2" />}
                                     {log.level === 'error' && <ExclamationCircleIcon className="w-4 h-4 text-red-500 mr-2" />}
                                     {log.level === 'warning' && <ExclamationCircleIcon className="w-4 h-4 text-yellow-500 mr-2" />}
                                     {log.level === 'ai' && <SparklesIcon className="w-4 h-4 text-sky-400 mr-2" />}
                                     {log.level === 'info' && <span className="w-4 h-4 mr-2 block text-slate-500">&gt;</span>}
                                     
                                     <span className={`font-semibold ${
                                         log.level === 'error' ? 'text-red-400' : 
                                         log.level === 'success' ? 'text-green-400' : 
                                         log.level === 'ai' ? 'text-sky-400' : 
                                         log.level === 'warning' ? 'text-yellow-400' :
                                         'text-slate-200'
                                     }`}>{log.message}</span>
                                 </div>
                                 {log.details && (
                                     <div className="mt-1 ml-6 p-2 bg-black/30 rounded border-l-2 border-slate-600 text-slate-400 text-xs whitespace-pre-wrap">
                                         {log.details}
                                     </div>
                                 )}
                             </div>
                         </div>
                     ))}
                     <div ref={logsEndRef} />
                 </div>
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