import React from 'react';
import { SparklesIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface InputPanelProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
  onOpenOptimizer: () => void;
}

const examplePrompts = [
    "Ein einfacher Text-zu-Bild-Workflow mit SDXL.",
    "Erstelle ein Bild von einem Astronauten, der auf einem Pferd reitet, im Stil von Van Gogh.",
    "Ein Inpainting-Workflow, um ein Objekt aus einem Bild zu entfernen.",
    "Workflow für ein SD 1.5 Modell mit ControlNet für Canny Edges.",
];

const InputPanel: React.FC<InputPanelProps> = ({ prompt, setPrompt, onGenerate, isLoading, onOpenOptimizer }) => {
  const t = useTranslations();
  
  return (
    <div className="w-full lg:w-1/2 glass-panel rounded-2xl p-8 flex flex-col space-y-6 transition-all duration-300">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-100">{t.describeWorkflow}</h2>
        <button 
            onClick={onOpenOptimizer}
            disabled={isLoading}
            className="flex items-center px-4 py-2 text-sm bg-sky-500/80 backdrop-blur-sm border border-sky-400/50 text-white rounded-full hover:bg-sky-500 disabled:opacity-50 transition-all duration-300 transform hover:scale-105"
            title={t.promptAssistantTitle}
        >
            <SparklesIcon className="w-4 h-4 mr-2" />
            {t.promptAssistant}
        </button>
      </div>
      <p className="text-sm text-gray-400">
        {t.describeWorkflowSubtext}
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t.promptPlaceholder}
        className="w-full h-64 p-4 bg-black/20 rounded-xl resize-none focus:ring-2 focus:ring-teal-400 focus:bg-black/30 border border-transparent focus:border-teal-500/50 transition-all duration-300 text-gray-200 placeholder-gray-500"
        disabled={isLoading}
      />
      
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400">{t.tryExample}</h3>
        <div className="flex flex-wrap gap-2">
          {examplePrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => setPrompt(p)}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs bg-white/10 text-gray-300 rounded-full hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onGenerate}
        disabled={isLoading || !prompt.trim()}
        className={`w-full flex items-center justify-center px-6 py-4 bg-teal-500/90 text-white font-bold rounded-xl shadow-lg hover:bg-teal-500 disabled:bg-gray-600/50 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-300 ${!isLoading && prompt.trim() ? 'btn-glow' : ''}`}
      >
        {isLoading ? (
          <div className="w-6 h-6 border-2 border-dashed rounded-full animate-spin border-white"></div>
        ) : (
          <>
            <SparklesIcon className="w-5 h-5 mr-2" />
            {t.generateWorkflow}
          </>
        )}
      </button>
    </div>
  );
};

export default InputPanel;