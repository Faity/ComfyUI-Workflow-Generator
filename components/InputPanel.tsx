import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { SparklesIcon, CpuChipIcon, TrashIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface InputPanelProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
  onOpenOptimizer: () => void;
  onOpenWizard: () => void;
  uploadedImage: File | null;
  setUploadedImage: (file: File | null) => void;
}

const examplePrompts = [
    "Ein einfacher Text-zu-Bild-Workflow mit SDXL.",
    "Erstelle ein Bild von einem Astronauten, der auf einem Pferd reitet, im Stil von Van Gogh.",
    "Ein Inpainting-Workflow, um ein Objekt aus einem Bild zu entfernen.",
    "Workflow für ein SD 1.5 Modell mit ControlNet für Canny Edges.",
];

const InputPanel: React.FC<InputPanelProps> = ({ prompt, setPrompt, onGenerate, isLoading, onOpenOptimizer, onOpenWizard, uploadedImage, setUploadedImage }) => {
  const t = useTranslations();
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (uploadedImage) {
        const previewUrl = URL.createObjectURL(uploadedImage);
        setImagePreview(previewUrl);
        return () => URL.revokeObjectURL(previewUrl);
    } else {
        setImagePreview(null);
    }
  }, [uploadedImage]);
  
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
        setUploadedImage(acceptedFiles[0]);
    }
  }, [setUploadedImage]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpeg', '.jpg', '.webp'] },
    multiple: false
  });
  
  return (
    <div className="w-full lg:w-1/2 glass-panel rounded-2xl p-6 flex flex-col space-y-4 transition-all duration-300 overflow-y-auto">
      <div className="flex-shrink-0 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-100">{t.describeWorkflow}</h2>
        <div className="flex items-center space-x-2">
            <button 
                onClick={onOpenOptimizer}
                disabled={isLoading}
                className="flex items-center px-4 py-2 text-sm bg-sky-500/80 backdrop-blur-sm border border-sky-400/50 text-white rounded-full hover:bg-sky-500 disabled:opacity-50 transition-all duration-300 transform hover:scale-105"
                title={t.promptAssistantTitle}
            >
                <SparklesIcon className="w-4 h-4 mr-2" />
                {t.promptAssistant}
            </button>
            <button 
                onClick={onOpenWizard}
                disabled={isLoading}
                className="flex items-center px-4 py-2 text-sm bg-indigo-500/80 backdrop-blur-sm border border-indigo-400/50 text-white rounded-full hover:bg-indigo-500 disabled:opacity-50 transition-all duration-300 transform hover:scale-105"
                title={t.workflowWizardTitle}
            >
                <CpuChipIcon className="w-4 h-4 mr-2" />
                {t.workflowWizard}
            </button>
        </div>
      </div>
      <p className="flex-shrink-0 text-sm text-gray-400">
        {t.describeWorkflowSubtext}
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t.promptPlaceholder}
        className="w-full flex-shrink-0 h-40 p-4 bg-black/20 rounded-xl resize-y focus:ring-2 focus:ring-teal-400 focus:bg-black/30 border border-transparent focus:border-teal-500/50 transition-all duration-300 text-gray-200 placeholder-gray-500"
        disabled={isLoading}
      />

      <div className="flex-shrink-0 space-y-2">
        <h3 className="text-sm font-semibold text-gray-400">{t.inputPanelImageUpload}</h3>
        <p className="text-xs text-gray-500 -mt-1">{t.inputPanelImageUploadSubtext}</p>
        {imagePreview ? (
            <div className="relative w-full aspect-video bg-black/30 rounded-lg overflow-hidden">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                <button 
                    onClick={() => setUploadedImage(null)} 
                    className="absolute top-2 right-2 p-1.5 bg-red-600/80 rounded-full hover:bg-red-500 transition-colors"
                    title="Remove Image"
                >
                    <TrashIcon className="w-4 h-4 text-white" />
                </button>
            </div>
        ) : (
            <div {...getRootProps()} className={`p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300 ${isDragActive ? 'border-teal-400 bg-teal-500/20' : 'border-gray-600/50 hover:border-gray-500 bg-black/20'}`}>
                <input {...getInputProps()} />
                <p className="text-gray-400 text-sm">{t.inputPanelDropzone}</p>
            </div>
        )}
      </div>
      
      <div className="flex-shrink-0 space-y-3">
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
        className={`w-full mt-auto flex-shrink-0 flex items-center justify-center px-6 py-4 bg-teal-500/90 text-white font-bold rounded-xl shadow-lg hover:bg-teal-500 disabled:bg-gray-600/50 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-300 ${!isLoading && prompt.trim() ? 'btn-glow' : ''}`}
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