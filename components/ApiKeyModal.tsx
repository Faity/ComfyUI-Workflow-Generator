import React, { useState } from 'react';
import { useTranslations } from '../hooks/useTranslations';

interface ApiKeyModalProps {
  isOpen: boolean;
  onSave: (apiKey: string) => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onSave }) => {
  const [apiKey, setApiKey] = useState('');
  const t = useTranslations();

  const handleSave = () => {
    if (apiKey.trim()) {
      onSave(apiKey.trim());
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-background-end/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="glass-panel rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-teal-500/50 border-2">
        <header className="p-6">
          <h2 id="api-key-title" className="text-2xl font-bold text-gray-100">{t.apiKeyModalTitle}</h2>
        </header>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-400">{t.apiKeyModalSubtext}</p>
          <div>
            <label htmlFor="api-key-input" className="block text-sm font-medium text-gray-300 mb-2">{t.apiKeyModalInputLabel}</label>
            <input
              id="api-key-input"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full p-3 bg-black/20 border border-transparent focus:border-teal-500/50 rounded-lg focus:ring-2 focus:ring-teal-400 transition-all"
              autoFocus
            />
          </div>
          <p className="text-xs text-gray-500">
            {t.apiKeyModalWhereToFind}{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:underline"
            >
              Google AI Studio
            </a>.
          </p>
        </div>

        <footer className="p-6 bg-black/10 flex justify-end">
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="px-6 py-3 bg-teal-500/90 text-white font-semibold rounded-lg hover:bg-teal-500 disabled:bg-gray-600/50 disabled:cursor-not-allowed transition-colors"
          >
            {t.apiKeyModalSaveButton}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ApiKeyModal;
