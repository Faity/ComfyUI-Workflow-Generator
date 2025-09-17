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
    <div className="w-full lg:w-1/2 bg-gray-900 p-6 flex flex-col space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-200">{t.describeWorkflow}</h2>
        <button 
            onClick={onOpenOptimizer}
            disabled={isLoading}
            className="flex items-center px-3 py-1 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:opacity-50 transition-colors"
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
        className="w-full h-64 p-4 bg-gray-800 border border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors text-gray-200"
        disabled={isLoading}
      />
      
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-400">{t.tryExample}</h3>
        <div className="flex flex-wrap gap-2">
          {examplePrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => setPrompt(p)}
              disabled={isLoading}
              className="px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded-full hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onGenerate}
        disabled={isLoading || !prompt.trim()}
        className="w-full flex items-center justify-center px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-200"
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
