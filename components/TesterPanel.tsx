import React, { useState } from 'react';
import { WrenchIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface TesterPanelProps {
  onValidate: (workflowJson: string, errorMessage: string) => void;
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
    <div className="w-full lg:w-1/2 bg-gray-900 p-6 flex flex-col space-y-4" role="tabpanel">
      <div>
        <h2 className="text-xl font-bold text-gray-200">{t.testerTitle}</h2>
        <p className="text-sm text-gray-400 mt-1">
          {t.testerSubtext}
        </p>
      </div>

      <div>
        <label htmlFor="workflow-json-input" className="block text-sm font-medium text-gray-300 mb-1">{t.testerWorkflowJsonLabel}</label>
        <textarea
            id="workflow-json-input"
            value={workflowJson}
            onChange={(e) => {
                setWorkflowJson(e.target.value);
                if (jsonError) setJsonError(null);
            }}
            placeholder={t.testerWorkflowJsonPlaceholder}
            className={`w-full h-80 p-4 bg-gray-800 border rounded-lg resize-y focus:ring-2 focus:border-teal-500 transition-colors text-gray-200 ${jsonError ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:ring-teal-500'}`}
            disabled={isLoading}
            aria-label="Workflow JSON Input"
            aria-invalid={!!jsonError}
            aria-describedby={jsonError ? "json-error" : undefined}
        />
        {jsonError && <p id="json-error" className="mt-1 text-sm text-red-400">{jsonError}</p>}
      </div>
      
      <div>
        <label htmlFor="error-message-input" className="block text-sm font-medium text-gray-300 mb-1">{t.testerErrorLabel}</label>
        <textarea
            id="error-message-input"
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
            placeholder={t.testerErrorPlaceholder}
            className="w-full h-28 p-4 bg-gray-800 border border-gray-700 rounded-lg resize-y focus:ring-2 focus:ring-teal-500 transition-colors text-gray-200"
            disabled={isLoading}
            aria-label="ComfyUI Error Message Input"
        />
      </div>
      
      <button
        onClick={handleValidateClick}
        disabled={isLoading || !workflowJson.trim()}
        className="w-full flex items-center justify-center px-6 py-3 bg-sky-600 text-white font-semibold rounded-lg shadow-md hover:bg-sky-700 disabled:bg-gray-600 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-200"
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
