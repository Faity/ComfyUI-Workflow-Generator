import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { WrenchIcon, UploadIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface TesterPanelProps {
  onValidate: (workflowJson: string, errorMessage:string) => void;
  isLoading: boolean;
}

const TesterPanel: React.FC<TesterPanelProps> = ({ onValidate, isLoading }) => {
  const [workflowJson, setWorkflowJson] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations();

  const processFileContent = (content: string) => {
      setWorkflowJson(content);
      setJsonError(null); // Clear potential previous errors
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result;
        if (typeof content === 'string') {
          processFileContent(content);
        }
      };
      reader.readAsText(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/json': ['.json'] },
    multiple: false,
    disabled: isLoading
  });

  const handleJsonFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
          processFileContent(content);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset
  };

  const handleValidateClick = () => {
    setJsonError(null);
    if (!workflowJson.trim()) {
        setJsonError(t.testerErrorJsonEmpty);
        return;
    }
    try {
        JSON.parse(workflowJson);
        onValidate(workflowJson, errorMessage);
    } catch (e) {
        setJsonError(t.testerErrorJsonInvalid);
    }
  };

  return (
    <div className="w-full lg:w-1/2 glass-panel rounded-2xl p-8 flex flex-col space-y-6" role="tabpanel">
      <div className="flex justify-between items-start">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">{t.testerTitle}</h2>
            <p className="text-sm text-slate-500 mt-1">
            {t.testerSubtext}
            </p>
        </div>
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
            className="flex-shrink-0 ml-4 flex items-center px-3 py-2 text-sm bg-slate-100 text-slate-600 border border-slate-200 rounded-full hover:bg-slate-200 disabled:opacity-50 transition-all duration-300 shadow-sm"
            title={t.testerUploadLabel}
        >
            <UploadIcon className="w-4 h-4 mr-2" />
            {t.inputPanelImportJson}
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-600 mb-2">{t.testerUploadLabel}</label>
        <div {...getRootProps()} className={`p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300 mb-4 ${isDragActive ? 'border-teal-400 bg-teal-50' : 'border-slate-300 hover:border-slate-400 bg-white'} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center text-slate-500">
                <UploadIcon className="w-8 h-8 mb-2 text-slate-400" />
                <p className="text-sm">{t.testerDropzone}</p>
            </div>
        </div>

        <label htmlFor="workflow-json-input" className="block text-sm font-medium text-slate-600 mb-2">{t.testerWorkflowJsonLabel}</label>
        <textarea
            id="workflow-json-input"
            value={workflowJson}
            onChange={(e) => {
                setWorkflowJson(e.target.value);
                if (jsonError) setJsonError(null);
            }}
            placeholder={t.testerWorkflowJsonPlaceholder}
            className={`w-full h-60 p-4 bg-white border rounded-xl resize-y focus:ring-2 transition-all duration-300 text-slate-700 placeholder-slate-400 shadow-sm ${jsonError ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:border-transparent focus:ring-teal-400'}`}
            disabled={isLoading}
            aria-label="Workflow JSON Input"
            aria-invalid={!!jsonError}
            aria-describedby={jsonError ? "json-error" : undefined}
        />
        {jsonError && <p id="json-error" className="mt-2 text-sm text-red-500">{jsonError}</p>}
      </div>
      
      <div>
        <label htmlFor="error-message-input" className="block text-sm font-medium text-slate-600 mb-2">{t.testerErrorLabel}</label>
        <textarea
            id="error-message-input"
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
            placeholder={t.testerErrorPlaceholder}
            className="w-full h-28 p-4 bg-white border border-slate-200 rounded-xl resize-y focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all duration-300 text-slate-700 placeholder-slate-400 shadow-sm"
            disabled={isLoading}
            aria-label="ComfyUI Error Message Input"
        />
      </div>
      
      <button
        onClick={handleValidateClick}
        disabled={isLoading || !workflowJson.trim()}
        className="w-full flex items-center justify-center px-6 py-4 bg-sky-500 text-white font-bold rounded-xl shadow-md hover:bg-sky-600 disabled:bg-slate-300 disabled:cursor-not-allowed transform hover:scale-[1.02] transition-all duration-300"
      >
        {isLoading ? (
          <div className="w-6 h-6 border-2 border-dashed rounded-full animate-spin border-white"></div>
        ) : (
          <>
            <WrenchIcon className="w-5 h-5 mr-2" />
            {errorMessage.trim() ? t.testerButtonDebug : t.testerButtonValidate}
          </>
        )}
      </button>
    </div>
  );
};

export default TesterPanel;