import React from 'react';
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
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 id="settings-title" className="text-lg font-bold text-gray-200">{t.settingsTitle}</h2>
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
                <label htmlFor="comfy-url-input" className="block text-sm font-medium text-gray-300 mb-1">{t.settingsComfyUrl}</label>
                <input
                    id="comfy-url-input"
                    type="text"
                    value={comfyUIUrl}
                    onChange={(e) => setComfyUIUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8188"
                    className="w-full p-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 transition-colors"
                />
                <p className="mt-2 text-xs text-gray-500">
                    {t.settingsComfyUrlHelp}
                </p>
            </div>
             <div>
                <label htmlFor="local-llm-url-input" className="block text-sm font-medium text-gray-300 mb-1">{t.settingsLocalLlmUrl}</label>
                <input
                    id="local-llm-url-input"
                    type="text"
                    value={localLlmApiUrl}
                    onChange={(e) => setLocalLlmApiUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8000"
                    className="w-full p-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 transition-colors"
                />
                <p className="mt-2 text-xs text-gray-500">
                    {t.settingsLocalLlmUrlHelp}
                </p>
            </div>
             <div className="border-t border-gray-700 pt-6">
                 <h3 className="text-md font-semibold text-gray-300 mb-1">{t.settingsDownloadSource}</h3>
                 <p className="mt-1 text-xs text-gray-500 mb-3">
                    {t.settingsDownloadSourceHelp}
                 </p>
                 <button
                    onClick={onDownloadSourceCode}
                    className="w-full flex items-center justify-center px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-teal-500"
                >
                    <DownloadIcon className="w-5 h-5 mr-2" />
                    {t.settingsDownloadSource}
                </button>
            </div>
        </div>

        <footer className="p-4 border-t border-gray-700 bg-gray-800/50 rounded-b-xl flex justify-end">
            <button
                onClick={handleSave}
                className="px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-teal-500"
            >
                {t.settingsSave}
            </button>
        </footer>
      </div>
    </div>
  );
};

export default SettingsModal;
