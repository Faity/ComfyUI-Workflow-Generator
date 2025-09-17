import React, { useState } from 'react';
import { WrenchIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface TesterPanelProps {
  onValidate: (workflowJson: string, errorMessage:string) => void;
  isLoading: boolean;
}

const TesterPanel: React.FC<TesterPanelProps> = ({ onValidate, isLoading }) => {
  const [workflowJson, setWorkflowJson] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const t = useTranslations();

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
      <div>
        <h2 className="text-2xl font-bold text-gray-100">{t.testerTitle}</h2>
        <p className="text-sm text-gray-400 mt-1">
          {t.testerSubtext}
        </p>
      </div>

      <div>
        <label htmlFor="workflow-json-input" className="block text-sm font-medium text-gray-300 mb-2">{t.testerWorkflowJsonLabel}</label>
        <textarea
            id="workflow-json-input"
            value={workflowJson}
            onChange={(e) => {
                setWorkflowJson(e.target.value);
                if (jsonError) setJsonError(null);
            }}
            placeholder={t.testerWorkflowJsonPlaceholder}
            className={`w-full h-80 p-4 bg-black/20 rounded-xl resize-y focus:ring-2 border transition-all duration-300 text-gray-200 placeholder-gray-500 ${jsonError ? 'border-red-500/50 focus:ring-red-500' : 'border-transparent focus:border-teal-500/50 focus:ring-teal-400'}`}
            disabled={isLoading}
            aria-label="Workflow JSON Input"
            aria-invalid={!!jsonError}
            aria-describedby={jsonError ? "json-error" : undefined}
        />
        {jsonError && <p id="json-error" className="mt-2 text-sm text-red-400">{jsonError}</p>}
      </div>
      
      <div>
        <label htmlFor="error-message-input" className="block text-sm font-medium text-gray-300 mb-2">{t.testerErrorLabel}</label>
        <textarea
            id="error-message-input"
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
            placeholder={t.testerErrorPlaceholder}
            className="w-full h-28 p-4 bg-black/20 rounded-xl resize-y focus:ring-2 focus:ring-teal-400 border border-transparent focus:border-teal-500/50 transition-all duration-300 text-gray-200 placeholder-gray-500"
            disabled={isLoading}
            aria-label="ComfyUI Error Message Input"
        />
      </div>
      
      <button
        onClick={handleValidateClick}
        disabled={isLoading || !workflowJson.trim()}
        className="w-full flex items-center justify-center px-6 py-4 bg-sky-500/90 text-white font-bold rounded-xl shadow-lg hover:bg-sky-500 disabled:bg-gray-600/50 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-300"
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