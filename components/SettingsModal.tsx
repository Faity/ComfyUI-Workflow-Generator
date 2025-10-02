import React, { useState, useEffect } from 'react';
import { useTranslations } from '../hooks/useTranslations';
import { DownloadIcon, CheckCircleIcon, ExclamationCircleIcon } from './Icons';
import { testComfyUIConnection } from '../services/comfyuiService';
import { testLocalLlmConnection } from '../services/localLlmService';


interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  comfyUIUrl: string;
  setComfyUIUrl: (url: string) => void;
  localLlmApiUrl: string;
  setLocalLlmApiUrl: (url: string) => void;
  onDownloadSourceCode: () => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, comfyUIUrl, setComfyUIUrl, localLlmApiUrl, setLocalLlmApiUrl, onDownloadSourceCode }) => {
  const t = useTranslations();
  const [comfyTestStatus, setComfyTestStatus] = useState<TestStatus>('idle');
  const [comfyTestMessage, setComfyTestMessage] = useState<string>('');
  const [llmTestStatus, setLlmTestStatus] = useState<TestStatus>('idle');
  const [llmTestMessage, setLlmTestMessage] = useState<string>('');


  useEffect(() => {
    setComfyTestStatus('idle');
  }, [comfyUIUrl]);

  useEffect(() => {
    setLlmTestStatus('idle');
  }, [localLlmApiUrl]);


  if (!isOpen) return null;

  const handleTestComfyUI = async () => {
    setComfyTestStatus('testing');
    const result = await testComfyUIConnection(comfyUIUrl);
    setComfyTestMessage(result.message);
    setComfyTestStatus(result.success ? 'success' : 'error');
  };

  const handleTestLocalLlm = async () => {
    setLlmTestStatus('testing');
    const result = await testLocalLlmConnection(localLlmApiUrl);
    setLlmTestMessage(result.message);
    setLlmTestStatus(result.success ? 'success' : 'error');
  }

  const handleSave = () => {
    onClose();
  };
  
  const renderTestStatus = (status: TestStatus, message: string) => {
    switch(status) {
        case 'testing':
            return <div className="w-4 h-4 border-2 border-dashed rounded-full animate-spin border-gray-400"></div>;
        case 'success':
            return <CheckCircleIcon className="w-5 h-5 text-green-400" title={message} />;
        case 'error':
            return <ExclamationCircleIcon className="w-5 h-5 text-red-400" title={message} />;
        case 'idle':
        default:
            return null;
    }
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
                <div className="flex items-center space-x-2">
                    <input
                        id="comfy-url-input"
                        type="text"
                        value={comfyUIUrl}
                        onChange={(e) => setComfyUIUrl(e.target.value)}
                        placeholder="http://127.0.0.1:8188"
                        className="w-full p-2 bg-black/20 border border-transparent focus:border-teal-500/50 rounded-lg focus:ring-2 focus:ring-teal-400 transition-all"
                    />
                    <div className="w-5 h-5 flex-shrink-0">{renderTestStatus(comfyTestStatus, comfyTestMessage)}</div>
                    <button onClick={handleTestComfyUI} disabled={comfyTestStatus === 'testing'} className="px-4 py-2 text-sm bg-sky-500/80 text-white rounded-lg hover:bg-sky-500 disabled:opacity-50 transition-colors whitespace-nowrap">
                        {t.settingsTestConnection}
                    </button>
                </div>
                {comfyTestStatus === 'error' && <p className="mt-2 text-xs text-red-300 bg-red-900/30 p-2 rounded-md">{comfyTestMessage}</p>}
                {comfyTestStatus === 'success' && <p className="mt-2 text-xs text-green-300">{comfyTestMessage}</p>}
                <p className="mt-2 text-xs text-gray-400">
                    {t.settingsComfyUrlHelp}
                </p>
            </div>
             <div>
                <label htmlFor="local-llm-url-input" className="block text-sm font-medium text-gray-300 mb-2">{t.settingsLocalLlmUrl}</label>
                 <div className="flex items-center space-x-2">
                    <input
                        id="local-llm-url-input"
                        type="text"
                        value={localLlmApiUrl}
                        onChange={(e) => setLocalLlmApiUrl(e.target.value)}
                        placeholder="http://127.0.0.1:8000"
                        className="w-full p-2 bg-black/20 border border-transparent focus:border-teal-500/50 rounded-lg focus:ring-2 focus:ring-teal-400 transition-all"
                    />
                    <div className="w-5 h-5 flex-shrink-0">{renderTestStatus(llmTestStatus, llmTestMessage)}</div>
                    <button onClick={handleTestLocalLlm} disabled={llmTestStatus === 'testing'} className="px-4 py-2 text-sm bg-sky-500/80 text-white rounded-lg hover:bg-sky-500 disabled:opacity-50 transition-colors whitespace-nowrap">
                        {t.settingsTestConnection}
                    </button>
                </div>
                {llmTestStatus === 'error' && <p className="mt-2 text-xs text-red-300 bg-red-900/30 p-2 rounded-md">{llmTestMessage}</p>}
                {llmTestStatus === 'success' && <p className="mt-2 text-xs text-green-300">{llmTestMessage}</p>}
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

export default SettingsModal;