
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { SparklesIcon, CpuChipIcon, TrashIcon, UploadIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';
import type { ComfyUIWorkflow } from '../types';

interface InputPanelProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
  onOpenOptimizer: () => void;
  onOpenWizard: () => void;
  onWorkflowImport: (workflow: ComfyUIWorkflow) => void;
  uploadedImage: File | null;
  setUploadedImage: (file: File | null) => void;
}

const examplePrompts = [
    "Ein einfacher Text-zu-Bild-Workflow mit SDXL.",
    "Erstelle ein Bild von einem Astronauten, der auf einem Pferd reitet, im Stil von Van Gogh.",
    "Ein Inpainting-Workflow, um ein Objekt aus einem Bild zu entfernen.",
    "Workflow für ein SD 1.5 Modell mit ControlNet für Canny Edges.",
];

const InputPanel: React.FC<InputPanelProps> = ({ prompt, setPrompt, onGenerate, isLoading, onOpenOptimizer, onOpenWizard, onWorkflowImport, uploadedImage, setUploadedImage }) => {
  const t = useTranslations();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleJsonFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        // Basic validation to check if it looks like a workflow
        if (json.nodes && json.links) {
          onWorkflowImport(json as ComfyUIWorkflow);
        } else {
           // Even if strictly not valid, try importing, App.tsx might handle better or we assume user knows
           onWorkflowImport(json as ComfyUIWorkflow);
        }
      } catch (error) {
        console.error("Failed to parse JSON", error);
      }
    };
    reader.readAsText(file);
    // Reset value to allow re-uploading same file
    event.target.value = '';
  };
  
  return (
    <div className="w-full lg:w-1/2 glass-panel rounded-2xl p-6 flex flex-col space-y-4 transition-all duration-300 overflow-y-auto">
      <div className="flex-shrink-0 flex justify-between items-center flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-800">{t.describeWorkflow}</h2>
        <div className="flex items-center space-x-2">
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleJsonFileChange} 
                accept=".json" 
                className="hidden" 
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="flex items-center px-3 py-2 text-sm bg-slate-100 text-slate-600 border border-slate-200 rounded-full hover:bg-slate-200 disabled:opacity-50 transition-all duration-300 shadow-sm"
                title={t.inputPanelImportJsonTitle}
            >
                <UploadIcon className="w-4 h-4 mr-2" />
                {t.inputPanelImportJson}
            </button>
            <button 
                onClick={onOpenOptimizer}
                disabled={isLoading}
                className="flex items-center px-4 py-2 text-sm bg-sky-500 text-white rounded-full hover:bg-sky-600 disabled:opacity-50 transition-all duration-300 transform hover:scale-105 shadow-sm"
                title={t.promptAssistantTitle}
            >
                <SparklesIcon className="w-4 h-4 mr-2" />
                {t.promptAssistant}
            </button>
            <button 
                onClick={onOpenWizard}
                disabled={isLoading}
                className="flex items-center px-4 py-2 text-sm bg-indigo-500 text-white rounded-full hover:bg-indigo-600 disabled:opacity-50 transition-all duration-300 transform hover:scale-105 shadow-sm"
                title={t.workflowWizardTitle}
            >
                <CpuChipIcon className="w-4 h-4 mr-2" />
                {t.workflowWizard}
            </button>
        </div>
      </div>
      <p className="flex-shrink-0 text-sm text-slate-500">
        {t.describeWorkflowSubtext}
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t.promptPlaceholder}
        className="w-full flex-shrink-0 h-32 p-4 bg-white border border-slate-200 rounded-xl resize-y focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all duration-300 text-slate-700 placeholder-slate-400 shadow-sm"
        disabled={isLoading}
      />

      <div className="flex-shrink-0 space-y-2">
        <h3 className="text-sm font-semibold text-slate-500">{t.inputPanelImageUpload}</h3>
        <p className="text-xs text-slate-400 -mt-1">{t.inputPanelImageUploadSubtext}</p>
        {imagePreview ? (
            <div className="relative w-full aspect-video bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                <button 
                    onClick={() => setUploadedImage(null)} 
                    className="absolute top-2 right-2 p-1.5 bg-white rounded-full hover:bg-red-50 text-red-500 shadow-md transition-colors"
                    title="Remove Image"
                >
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
        ) : (
            <div {...getRootProps()} className={`p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300 ${isDragActive ? 'border-teal-400 bg-teal-50' : 'border-slate-300 hover:border-slate-400 bg-white'}`}>
                <input {...getInputProps()} />
                <p className="text-slate-500 text-sm">{t.inputPanelDropzone}</p>
            </div>
        )}
      </div>
      
      <div className="flex-shrink-0 space-y-3">
        <h3 className="text-sm font-semibold text-slate-500">{t.tryExample}</h3>
        <div className="flex flex-wrap gap-2">
          {examplePrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => setPrompt(p)}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 border border-slate-200 rounded-full hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onGenerate}
        disabled={isLoading || !prompt.trim()}
        className={`w-full mt-auto flex-shrink-0 flex items-center justify-center px-6 py-4 bg-teal-600 text-white font-bold rounded-xl shadow-md hover:bg-teal-500 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transform hover:scale-[1.02] transition-all duration-300 ${!isLoading && prompt.trim() ? 'btn-glow' : ''}`}
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
