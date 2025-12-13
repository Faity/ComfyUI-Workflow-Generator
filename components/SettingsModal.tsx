
import React, { useState, useEffect } from 'react';
import { useTranslations } from '../hooks/useTranslations';
import { DownloadIcon, CheckCircleIcon, ExclamationCircleIcon } from './Icons';
import { testComfyUIConnection } from '../services/comfyuiService';
import { testLocalLlmConnection, testRagConnection } from '../services/localLlmService';
import type { LlmProvider, SystemInventory } from '../types';


interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  comfyUIUrl: string;
  setComfyUIUrl: (url: string) => void;
  localLlmApiUrl: string;
  setLocalLlmApiUrl: (url: string) => void;
  ragApiUrl: string;
  setRagApiUrl: (url: string) => void;
  onDownloadSourceCode: () => void;
  version: string;
  llmProvider: LlmProvider;
  setLlmProvider: (provider: LlmProvider) => void;
  localLlmModel: string;
  setLocalLlmModel: (model: string) => void;
  inventory: SystemInventory | null;
  onRefreshInventory: () => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, 
    comfyUIUrl, setComfyUIUrl, 
    localLlmApiUrl, setLocalLlmApiUrl, 
    ragApiUrl, setRagApiUrl,
    onDownloadSourceCode, version,
    llmProvider, setLlmProvider,
    localLlmModel, setLocalLlmModel,
    inventory,
    onRefreshInventory
}) => {
  const t = useTranslations();
  const [comfyTestStatus, setComfyTestStatus] = useState<TestStatus>('idle');
  const [comfyTestMessage, setComfyTestMessage] = useState<string>('');
  const [isCorsError, setIsCorsError] = useState<boolean>(false);
  const [isMixedContentError, setIsMixedContentError] = useState<boolean>(false);
  
  const [llmTestStatus, setLlmTestStatus] = useState<TestStatus>('idle');
  const [llmTestMessage, setLlmTestMessage] = useState<string>('');
  
  const [ragTestStatus, setRagTestStatus] = useState<TestStatus>('idle');
  const [ragTestMessage, setRagTestMessage] = useState<string>('');


  useEffect(() => {
    setComfyTestStatus('idle');
    setIsCorsError(false);
    setIsMixedContentError(false);
  }, [comfyUIUrl]);

  useEffect(() => {
    setLlmTestStatus('idle');
  }, [localLlmApiUrl]);

  useEffect(() => {
    setRagTestStatus('idle');
  }, [ragApiUrl]);


  if (!isOpen) return null;

  const handleTestComfyUI = async () => {
    setComfyTestStatus('testing');
    setIsCorsError(false);
    setIsMixedContentError(false);
    const result = await testComfyUIConnection(comfyUIUrl);
    setComfyTestMessage(result.message);
    setComfyTestStatus(result.success ? 'success' : 'error');
    if (result.isCorsError) {
        setIsCorsError(true);
    }
    if (result.isMixedContentError) {
        setIsMixedContentError(true);
    }
  };

  const handleTestLocalLlm = async () => {
    setLlmTestStatus('testing');
    // For Generation URL (Ollama), we do a simple fetch to root or check /api/tags if possible.
    // Re-using simple logic:
    try {
        const response = await fetch(localLlmApiUrl);
        if (response.ok) {
            setLlmTestStatus('success');
            setLlmTestMessage('Ollama is reachable!');
        } else {
            setLlmTestStatus('error');
            setLlmTestMessage(`Status: ${response.status}`);
        }
    } catch (e: any) {
         setLlmTestStatus('error');
         setLlmTestMessage('Connection failed.');
    }
  }

  const handleTestRag = async () => {
    setRagTestStatus('testing');
    // We use the specialized test function for RAG which checks /v1/inventory
    const result = await testRagConnection(ragApiUrl);
    setRagTestMessage(result.message);
    setRagTestStatus(result.success ? 'success' : 'error');
    
    if (result.success) {
        onRefreshInventory();
    }
  }

  const handleSave = () => {
    onClose();
  };
  
  const renderTestStatus = (status: TestStatus, message: string) => {
    switch(status) {
        case 'testing':
            return <div className="w-4 h-4 border-2 border-dashed rounded-full animate-spin border-slate-400"></div>;
        case 'success':
            return <CheckCircleIcon className="w-5 h-5 text-green-500" title={message} />;
        case 'error':
            return <ExclamationCircleIcon className="w-5 h-5 text-red-500" title={message} />;
        case 'idle':
        default:
            return null;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        className="glass-panel rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
          <h2 id="settings-title" className="text-lg font-bold text-slate-800">{t.settingsTitle}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
            aria-label={t.settingsClose}
          >
            &times;
          </button>
        </header>

        <div className="p-6 space-y-6 overflow-y-auto">
            <div>
                <label htmlFor="comfy-url-input" className="block text-sm font-medium text-slate-600 mb-2">{t.settingsComfyUrl}</label>
                <div className="flex items-center space-x-2">
                    <input
                        id="comfy-url-input"
                        type="text"
                        value={comfyUIUrl}
                        onChange={(e) => setComfyUIUrl(e.target.value)}
                        placeholder="http://127.0.0.1:8188"
                        className="w-full p-2 bg-white border border-slate-300 focus:border-teal-500 rounded-lg focus:ring-2 focus:ring-teal-200 transition-all"
                    />
                    <div className="w-5 h-5 flex-shrink-0">{renderTestStatus(comfyTestStatus, comfyTestMessage)}</div>
                    <button onClick={handleTestComfyUI} disabled={comfyTestStatus === 'testing'} className="px-4 py-2 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 transition-colors whitespace-nowrap shadow-sm">
                        {t.settingsTestConnection}
                    </button>
                </div>
                {isMixedContentError && (
                    <div className="mt-3 p-4 bg-orange-50 border border-orange-200 rounded-lg text-orange-800 text-sm">
                        <p className="font-bold mb-2">{t.settingsMixedContentDetected}</p>
                        <p className="text-xs mb-2">
                            {t.settingsMixedContentExplanation}
                        </p>
                        <p className="mt-2 text-xs" dangerouslySetInnerHTML={{ __html: t.settingsMixedContentSolutionHtml }} />
                    </div>
                )}
                {isCorsError && !isMixedContentError && (
                    <div className="mt-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
                        <p className="font-bold mb-2">{t.settingsCorsDetected}</p>
                        <p className="text-xs">
                            {t.settingsCorsExplanation}
                        </p>
                        <p className="mt-2 text-xs" dangerouslySetInnerHTML={{ __html: t.settingsCorsSolutionHtml }} />
                    </div>
                )}
                {comfyTestStatus === 'error' && !isCorsError && !isMixedContentError && <p className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-md">{comfyTestMessage}</p>}
                {comfyTestStatus === 'success' && <p className="mt-2 text-xs text-green-600">{comfyTestMessage}</p>}
                <p className="mt-2 text-xs text-slate-500">
                    {t.settingsComfyUrlHelp}
                </p>
            </div>
            
            <div className="border-t border-slate-200 pt-6">
                 <h3 className="text-md font-semibold text-slate-800 mb-4">AI & Local LLM Configuration</h3>
                 
                 <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-600 mb-2">{t.settingsLlmProvider}</label>
                    <div className="flex space-x-1 bg-slate-100 p-1 rounded-full border border-slate-200">
                        <button 
                            onClick={() => setLlmProvider('gemini')}
                            className={`w-1/2 rounded-full py-1.5 text-sm transition-colors ${llmProvider === 'gemini' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}
                        >
                            {t.settingsLlmProviderGemini}
                        </button>
                        <button 
                            onClick={() => setLlmProvider('local')}
                            className={`w-1/2 rounded-full py-1.5 text-sm transition-colors ${llmProvider === 'local' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}
                        >
                            {t.settingsLlmProviderLocal}
                        </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{t.settingsLlmProviderHelp}</p>
                </div>

                <div className="mb-4">
                    <label htmlFor="rag-url-input" className="block text-sm font-medium text-slate-600 mb-2">{t.settingsBackendUrl}</label>
                     <div className="flex items-center space-x-2">
                        <input
                            id="rag-url-input"
                            type="text"
                            value={ragApiUrl}
                            onChange={(e) => setRagApiUrl(e.target.value)}
                            placeholder="http://127.0.0.1:8000"
                            className="w-full p-2 bg-white border border-slate-300 focus:border-teal-500 rounded-lg focus:ring-2 focus:ring-teal-200 transition-all"
                        />
                        <div className="w-5 h-5 flex-shrink-0">{renderTestStatus(ragTestStatus, ragTestMessage)}</div>
                        <button onClick={handleTestRag} disabled={ragTestStatus === 'testing'} className="px-4 py-2 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 transition-colors whitespace-nowrap shadow-sm">
                            {t.settingsTestConnection}
                        </button>
                    </div>
                    {ragTestStatus === 'error' && <p className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-md">{ragTestMessage}</p>}
                    {ragTestStatus === 'success' && <p className="mt-2 text-xs text-green-600">{ragTestMessage}</p>}
                    <p className="mt-2 text-xs text-slate-500">
                        {t.settingsBackendUrlHelp}
                    </p>
                </div>

                <div className="mb-4">
                    <label htmlFor="local-llm-url-input" className="block text-sm font-medium text-slate-600 mb-2">{t.settingsLocalLlmUrl}</label>
                     <div className="flex items-center space-x-2">
                        <input
                            id="local-llm-url-input"
                            type="text"
                            value={localLlmApiUrl}
                            onChange={(e) => setLocalLlmApiUrl(e.target.value)}
                            placeholder="http://127.0.0.1:11434"
                            className="w-full p-2 bg-white border border-slate-300 focus:border-teal-500 rounded-lg focus:ring-2 focus:ring-teal-200 transition-all"
                        />
                        <div className="w-5 h-5 flex-shrink-0">{renderTestStatus(llmTestStatus, llmTestMessage)}</div>
                        <button onClick={handleTestLocalLlm} disabled={llmTestStatus === 'testing'} className="px-4 py-2 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 transition-colors whitespace-nowrap shadow-sm">
                            {t.settingsTestConnection}
                        </button>
                    </div>
                    {llmTestStatus === 'error' && <p className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-md">{llmTestMessage}</p>}
                    {llmTestStatus === 'success' && <p className="mt-2 text-xs text-green-600">{llmTestMessage}</p>}
                    <p className="mt-2 text-xs text-slate-500">
                        {t.settingsLocalLlmUrlHelp}
                    </p>
                </div>

                <div className="mb-4 animate-fade-in">
                    <label htmlFor="local-model-select" className="block text-sm font-medium text-slate-600 mb-2">{t.settingsLocalLlmModel}</label>
                    {inventory?.llm_models && inventory.llm_models.length > 0 ? (
                        <select
                            id="local-model-select"
                            value={localLlmModel}
                            onChange={(e) => setLocalLlmModel(e.target.value)}
                            className="w-full p-2 bg-white border border-slate-300 focus:border-teal-500 rounded-lg focus:ring-2 focus:ring-teal-200 transition-all"
                        >
                            {inventory.llm_models.map((model) => (
                                <option key={model} value={model}>{model}</option>
                            ))}
                            {!inventory.llm_models.includes(localLlmModel) && localLlmModel && (
                                <option key={localLlmModel} value={localLlmModel}>{localLlmModel} (Custom/Missing)</option>
                            )}
                        </select>
                    ) : (
                        <input
                            id="local-model-input"
                            type="text"
                            value={localLlmModel}
                            onChange={(e) => setLocalLlmModel(e.target.value)}
                            placeholder="llama3.1:latest"
                            className="w-full p-2 bg-white border border-slate-300 focus:border-teal-500 rounded-lg focus:ring-2 focus:ring-teal-200 transition-all"
                        />
                    )}
                     <p className="mt-2 text-xs text-slate-500">
                        {t.settingsLocalLlmModelHelp}
                    </p>
                </div>
            </div>

             <div className="border-t border-slate-200 pt-6">
                 <div>
                     <h3 className="text-md font-semibold text-slate-800 mb-1">{t.settingsDownloadSource}</h3>
                     <p className="mt-1 text-xs text-slate-500 mb-3">
                        {t.settingsDownloadSourceHelp}
                     </p>
                     <button
                        onClick={onDownloadSourceCode}
                        className="w-full flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-50 focus:ring-teal-500 border border-slate-300"
                    >
                        <DownloadIcon className="w-5 h-5 mr-2" />
                        {t.settingsDownloadSource}
                    </button>
                </div>
            </div>
        </div>

        <footer className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center flex-shrink-0">
            <span className="text-xs text-slate-500">{t.appVersion} {version}</span>
            <button
                onClick={handleSave}
                className="px-5 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-500 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-50 focus:ring-teal-500 shadow-md"
            >
                {t.settingsSave}
            </button>
        </footer>
      </div>
    </div>
  );
};

export default SettingsModal;
