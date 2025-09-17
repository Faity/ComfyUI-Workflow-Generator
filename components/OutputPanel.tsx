import React, { useState, useEffect } from 'react';
import WorkflowVisualizer from './WorkflowVisualizer';
import type { GeneratedWorkflowResponse, ValidationLogEntry, DebugLogEntry } from '../types';
import { DownloadIcon, ClipboardIcon, PlayIcon, BugAntIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface OutputPanelProps {
  workflowData: GeneratedWorkflowResponse | null;
  onDownload: () => void;
  onCopy: () => void;
  onRun: () => void;
  onValidate: () => void;
}

type Tab = 'visualizer' | 'workflow' | 'requirements' | 'logs';

const OutputPanel: React.FC<OutputPanelProps> = ({ workflowData, onDownload, onCopy, onRun, onValidate }) => {
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
      <div className="w-full lg:w-1/2 bg-gray-950 flex flex-col items-center justify-center text-center p-6">
        <div className="text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-20 h-20 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M12 14.5v-5.714c0-.597-.237-1.17-.659-1.591L7 3.104M12 14.5c0 0-3.032 3.032-3.75 3.75M12 14.5c0 0 3.032 3.032 3.75 3.75" />
          </svg>
          <h3 className="text-2xl font-bold text-gray-500">{t.waitingForGeneration}</h3>
          <p className="mt-2 max-w-sm text-gray-600">{t.waitingForGenerationSubtext}</p>
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
        passed: 'border-green-600',
        corrected: 'border-sky-600',
        failed: 'border-red-600',
    }[status];

    const textColorClass = {
        passed: 'text-green-400',
        corrected: 'text-sky-400',
        failed: 'text-red-400',
    }[status];
    
    return (
        <div key={index} className={`p-3 bg-gray-800/50 border-l-4 ${colorClass} rounded`}>
            {isValidationLog ? (
                <>
                    <p className="font-semibold text-gray-200">{log.check}: <span className={`font-bold uppercase text-sm ${textColorClass}`}>{log.status}</span></p>
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
    <div className="w-full lg:w-1/2 bg-gray-950 flex flex-col">
      <div className="flex-shrink-0 p-4 flex justify-between items-center border-b border-gray-800">
        <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg">
          {tabConfig.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.key ? 'bg-sky-600 text-white' : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center space-x-2">
            <button onClick={onValidate} title={t.tooltipValidate} className="p-2 bg-gray-700 rounded-md hover:bg-gray-600"><BugAntIcon className="w-5 h-5" /></button>
            <button onClick={onRun} title={t.tooltipRun} className="p-2 bg-gray-700 rounded-md hover:bg-gray-600"><PlayIcon className="w-5 h-5" /></button>
            <button onClick={onCopy} title={t.tooltipCopy} className="p-2 bg-gray-700 rounded-md hover:bg-gray-600"><ClipboardIcon className="w-5 h-5" /></button>
            <button onClick={onDownload} title={t.tooltipDownload} className="p-2 bg-teal-600 rounded-md hover:bg-teal-500"><DownloadIcon className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex-grow overflow-auto">
        {activeTab === 'visualizer' && <WorkflowVisualizer workflow={workflow} />}
        {activeTab === 'workflow' && (
          <pre className="text-xs p-4 text-gray-300 bg-gray-900 h-full">
            <code>{JSON.stringify(workflow, null, 2)}</code>
          </pre>
        )}
        {activeTab === 'requirements' && (
          <div className="p-4 space-y-4">
             <h3 className="text-lg font-bold">{t.customNodes}</h3>
             {requirements.custom_nodes.length > 0 ? requirements.custom_nodes.map((node, i) => (
                <div key={i} className="p-3 bg-gray-800 rounded-lg">
                    <p className="font-semibold">{node.name}</p>
                    {node.url && <a href={node.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline">{node.url}</a>}
                    <pre className="text-xs mt-2 p-2 bg-black/50 rounded whitespace-pre-wrap font-mono"><code>{node.install_instructions}</code></pre>
                </div>
             )) : <p className="text-sm text-gray-500">{t.noCustomNodes}</p>}
             <h3 className="text-lg font-bold">{t.models}</h3>
              {requirements.models.length > 0 ? requirements.models.map((model, i) => (
                <div key={i} className="p-3 bg-gray-800 rounded-lg">
                    <p className="font-semibold">{model.name} <span className="text-xs text-gray-400">({model.model_type})</span></p>
                    {model.url && <a href={model.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline">{t.downloadLink}</a>}
                    {model.install_path && <p className="text-xs text-gray-500 mt-1">{t.installTo} {model.install_path}</p>}
                </div>
              )) : <p className="text-sm text-gray-500">{t.noModels}</p>}
          </div>
        )}
        {activeTab === 'logs' && hasLogs && (
            <div className="p-4 space-y-3">
                {validationLog && validationLog.map(renderLogEntry)}
                {correctionLog && correctionLog.map(renderLogEntry)}
            </div>
        )}
      </div>
    </div>
  );
};

export default OutputPanel;
