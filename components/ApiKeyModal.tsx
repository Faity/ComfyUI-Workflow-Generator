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
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="glass-panel rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-teal-500 border-2">
        <header className="p-6 bg-white">
          <h2 id="api-key-title" className="text-2xl font-bold text-slate-800">{t.apiKeyModalTitle}</h2>
        </header>

        <div className="p-6 space-y-4 bg-white">
          <p className="text-sm text-slate-600">{t.apiKeyModalSubtext}</p>
          <div>
            <label htmlFor="api-key-input" className="block text-sm font-medium text-slate-700 mb-2">{t.apiKeyModalInputLabel}</label>
            <input
              id="api-key-input"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full p-3 bg-slate-50 border border-slate-300 focus:border-teal-500 rounded-lg focus:ring-2 focus:ring-teal-200 transition-all"
              autoFocus
            />
          </div>
          <p className="text-xs text-slate-500">
            {t.apiKeyModalWhereToFind}{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-600 hover:underline"
            >
              Google AI Studio
            </a>.
          </p>
        </div>

        <footer className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-500 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow-md"
          >
            {t.apiKeyModalSaveButton}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ApiKeyModal;