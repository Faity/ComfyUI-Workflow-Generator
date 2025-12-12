import React, { useState, useRef, useEffect } from 'react';
import { useTranslations } from '../hooks/useTranslations';
import { DownloadIcon, UploadIcon, CommandLineIcon, TrashIcon } from './Icons';
import { SYSTEM_INSTRUCTION_TEMPLATE } from '../services/prompts';

interface SystemPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrompt: string;
  onSave: (newPrompt: string) => void;
  onReset: () => void;
}

const SystemPromptModal: React.FC<SystemPromptModalProps> = ({ isOpen, onClose, currentPrompt, onSave, onReset }) => {
  const [promptText, setPromptText] = useState(currentPrompt);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations();

  useEffect(() => {
    setPromptText(currentPrompt);
  }, [currentPrompt, isOpen]);

  const handleExport = () => {
    const data = JSON.stringify({ systemPrompt: promptText });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comfyui_system_prompt_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.systemPrompt) {
            setPromptText(json.systemPrompt);
        }
      } catch (error) {
        console.error("Failed to import system prompt", error);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };
  
  const handleReset = () => {
      setPromptText(SYSTEM_INSTRUCTION_TEMPLATE);
      onReset();
  };

  const handleSave = () => {
      onSave(promptText);
      onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="glass-panel rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden bg-white">
        <header className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0 bg-slate-50">
          <h2 className="text-xl font-bold flex items-center text-slate-800" title={t.systemPromptTitleTooltip}>
            <CommandLineIcon className="w-6 h-6 mr-3 text-indigo-600" />
            {t.systemPromptTitle}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">&times;</button>
        </header>
        
        <div className="p-4 bg-sky-50 border-b border-sky-100 text-sm text-sky-800 flex-shrink-0">
             {t.systemPromptHelp}
        </div>

        <div className="flex-grow p-4 bg-white overflow-hidden flex flex-col">
            <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                className="w-full h-full p-4 font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 resize-none outline-none leading-relaxed"
                spellCheck={false}
            />
        </div>

        <footer className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap gap-3 justify-between items-center flex-shrink-0">
            <div className="flex space-x-2">
                 <button
                    onClick={handleReset}
                    className="flex items-center px-4 py-2 text-sm bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors shadow-sm"
                    title="Reset to factory default"
                 >
                    <TrashIcon className="w-4 h-4 mr-2" />
                    {t.systemPromptReset}
                </button>
            </div>
            
            <div className="flex space-x-2">
                 <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImport} 
                    accept=".json" 
                    className="hidden" 
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center px-4 py-2 text-sm bg-white text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors shadow-sm"
                >
                    <UploadIcon className="w-4 h-4 mr-2" />
                    {t.systemPromptImport}
                </button>
                 <button
                    onClick={handleExport}
                    className="flex items-center px-4 py-2 text-sm bg-white text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors shadow-sm"
                >
                    <DownloadIcon className="w-4 h-4 mr-2" />
                    {t.systemPromptExport}
                </button>
                <button
                    onClick={handleSave}
                    className="flex items-center px-6 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-500 transition-colors shadow-md ml-2"
                >
                    {t.systemPromptSave}
                </button>
            </div>
        </footer>
      </div>
    </div>
  );
};

export default SystemPromptModal;