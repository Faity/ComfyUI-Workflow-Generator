
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { DatabaseIcon, ChartBarIcon, TrashIcon } from './Icons';
import { uploadRagDocument, startFineTuning, queryRag } from '../services/localLlmService';
import { useTranslations } from '../hooks/useTranslations';

interface LocalLlmPanelProps {
  apiUrl: string; // This expects the RAG/Helper URL
  showToast: (message: string, type: 'success' | 'error') => void;
  selectedModel: string; // <--- NEU: Wir müssen wissen, welches Modell aktiv ist
}

type ActiveTab = 'rag' | 'finetune';

interface UploadedFile {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  message?: string;
}

const LocalLlmPanel: React.FC<LocalLlmPanelProps> = ({ apiUrl, showToast, selectedModel }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('rag');
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [trainingData, setTrainingData] = useState('');
    const [fineTuneLog, setFineTuneLog] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // RAG Query State
    const [queryInput, setQueryInput] = useState('');
    const [queryResponse, setQueryResponse] = useState('');
    const [isQuerying, setIsQuerying] = useState(false);

    const t = useTranslations();

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const newFiles: UploadedFile[] = acceptedFiles.map(file => ({ file, status: 'pending' }));
        setFiles(prev => [...prev, ...newFiles]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'text/plain': ['.txt'], 'text/markdown': ['.md'] }
    });

    const handleUpload = async () => {
        if (!apiUrl) {
            showToast("RAG Server URL is not configured in settings.", 'error');
            return;
        }
        
        setIsLoading(true);
        for (let i = 0; i < files.length; i++) {
            if (files[i].status === 'pending') {
                try {
                    setFiles(prev => prev.map((f, index) => index === i ? { ...f, status: 'uploading' } : f));
                    const response = await uploadRagDocument(files[i].file, apiUrl);
                    setFiles(prev => prev.map((f, index) => index === i ? { ...f, status: 'success', message: response.message || 'Successfully uploaded' } : f));
                    showToast(t.localLlmFileUploadSuccess(files[i].file.name), 'success');
                } catch (e: any) {
                    const errorMessage = e.message || 'Unknown error';
                    setFiles(prev => prev.map((f, index) => index === i ? { ...f, status: 'error', message: errorMessage } : f));
                    showToast(t.localLlmFileUploadError(files[i].file.name, errorMessage), 'error');
                }
            }
        }
        setIsLoading(false);
    };

    const handleRagQuery = async () => {
        if (!apiUrl) {
            showToast("RAG Server URL is not configured in settings.", 'error');
            return;
        }
        if (!queryInput.trim()) return;

        setIsQuerying(true);
        setQueryResponse('');
        try {
            // HIER IST DER FIX: Wir übergeben das selectedModel!
            // Signatur: queryRag(prompt, apiUrl, model)
            const result = await queryRag(queryInput, apiUrl, selectedModel);
            setQueryResponse(result);
        } catch (e: any) {
            showToast(e.message || 'Query failed', 'error');
        } finally {
            setIsQuerying(false);
        }
    };

    const handleStartFineTune = async () => {
        if (!apiUrl) {
             showToast("RAG Server URL is not configured in settings.", 'error');
            return;
        }
        if (!trainingData.trim()) {
            showToast(t.localLlmTrainingDataEmpty, 'error');
            return;
        }

        setIsLoading(true);
        setFineTuneLog([t.localLlmStartingJob]);
        try {
            const response = await startFineTuning(trainingData, apiUrl);
            setFineTuneLog(prev => [...prev, t.localLlmJobStarted(response.job_id), t.localLlmWaitingForLogs]);
            showToast(t.localLlmJobStartSuccess, 'success');
        } catch (e: any) {
            const errorMessage = e.message || 'Unknown error';
            setFineTuneLog(prev => [...prev, `${t.localLlmError}: ${errorMessage}`]);
            showToast(t.localLlmJobStartError(errorMessage), 'error');
        } finally {
            setIsLoading(false);
        }
    };
    
    const removeFile = (index: number) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    return (
        <div className="w-full lg:w-1/2 glass-panel rounded-2xl p-8 flex flex-col space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">{t.localLlmTitle}</h2>
                {/* Anzeige welches Modell gerade aktiv ist */}
                <span className="text-xs px-2 py-1 bg-teal-100 text-teal-800 rounded-md border border-teal-200">
                    Modell: {selectedModel || 'Standard'}
                </span>
            </div>

            <div className="flex space-x-1 bg-slate-100 p-1 rounded-full border border-slate-200">
                <button onClick={() => setActiveTab('rag')} className={`w-1/2 px-4 py-2 text-sm font-medium rounded-full flex items-center justify-center transition-colors ${activeTab === 'rag' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}>
                    <DatabaseIcon className="w-5 h-5 mr-2" /> {t.localLlmRagTab}
                </button>
                <button onClick={() => setActiveTab('finetune')} className={`w-1/2 px-4 py-2 text-sm font-medium rounded-full flex items-center justify-center transition-colors ${activeTab === 'finetune' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}>
                    <ChartBarIcon className="w-5 h-5 mr-2" /> {t.localLlmFineTuneTab}
                </button>
            </div>
            
            {activeTab === 'rag' && (
                <div className="flex flex-col space-y-6 flex-grow overflow-y-auto pr-1">
                    {/* RAG Upload Section */}
                    <div className="space-y-4">
                         <p className="text-sm text-slate-500">{t.localLlmRagSubtext}</p>
                        <div {...getRootProps()} className={`p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300 ${isDragActive ? 'border-teal-400 bg-teal-50' : 'border-slate-300 hover:border-slate-400 bg-white'}`}>
                            <input {...getInputProps()} />
                            <p className="text-slate-500 text-sm">{t.localLlmDropzone}</p>
                        </div>
                        {files.length > 0 && (
                             <div className="space-y-2 max-h-[150px] overflow-y-auto">
                                {files.map((uploadedFile, index) => (
                                    <div key={index} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
                                        <div className="truncate flex-1 mr-2">
                                            <p className="text-xs font-medium text-slate-800 truncate">{uploadedFile.file.name}</p>
                                            <p className={`text-[10px] ${uploadedFile.status === 'success' ? 'text-green-600' : uploadedFile.status === 'error' ? 'text-red-500' : 'text-slate-500'}`}>
                                            {uploadedFile.status === 'uploading' ? t.localLlmUploading : uploadedFile.message || uploadedFile.status}
                                            </p>
                                        </div>
                                        <button onClick={() => removeFile(index)} className="p-1 text-slate-400 hover:text-red-500"><TrashIcon className="w-3 h-3" /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button onClick={handleUpload} disabled={isLoading || files.length === 0} className="w-full px-6 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-500 disabled:bg-slate-300 shadow-md">
                            {isLoading ? t.localLlmUploading : `${t.localLlmUploadButton} (${files.filter(f => f.status === 'pending').length})`}
                        </button>
                    </div>

                    <hr className="border-slate-200" />

                    {/* RAG Query Section */}
                    <div className="space-y-3 pb-4">
                        <h3 className="text-md font-bold text-slate-700">{t.localLlmQueryTitle}</h3>
                         <div className="flex space-x-2">
                            <input
                                type="text"
                                value={queryInput}
                                onChange={(e) => setQueryInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleRagQuery()}
                                placeholder={t.localLlmQueryPlaceholder}
                                className="flex-grow p-2 text-sm bg-white border border-slate-300 focus:border-teal-500 rounded-lg focus:ring-2 focus:ring-teal-200 transition-all"
                                disabled={isQuerying}
                            />
                            <button
                                onClick={handleRagQuery}
                                disabled={isQuerying || !queryInput.trim()}
                                className="px-4 py-2 bg-sky-500 text-white text-sm font-semibold rounded-lg hover:bg-sky-600 disabled:bg-slate-300 transition-colors shadow-sm"
                            >
                                {isQuerying ? t.localLlmQuerying : t.localLlmQueryButton}
                            </button>
                        </div>
                        {queryResponse && (
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 whitespace-pre-wrap">
                                {queryResponse}
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {activeTab === 'finetune' && (
                 <div className="flex flex-col space-y-4 flex-grow">
                     <p className="text-sm text-slate-500">{t.localLlmFineTuneSubtext}</p>
                     <textarea
                        value={trainingData}
                        onChange={(e) => setTrainingData(e.target.value)}
                        placeholder='{"prompt": "...", "completion": "..."}\n{"prompt": "...", "completion": "..."}'
                        className="w-full h-48 p-4 bg-white border border-slate-200 focus:border-transparent rounded-lg resize-y focus:ring-2 focus:ring-teal-400 transition-colors text-slate-700 shadow-sm"
                        disabled={isLoading}
                    />
                    <div className="flex-grow bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-y-auto h-32">
                        <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono">
                            {fineTuneLog.map((line, i) => <div key={i}>{`[${new Date().toLocaleTimeString()}] ${line}`}</div>)}
                        </pre>
                    </div>
                     <button onClick={handleStartFineTune} disabled={isLoading || !trainingData.trim()} className="w-full mt-auto px-6 py-3 bg-sky-500 text-white font-semibold rounded-lg hover:bg-sky-600 disabled:bg-slate-300 shadow-md">
                        {isLoading ? t.localLlmStarting : t.localLlmStartFineTune}
                    </button>
                 </div>
            )}

        </div>
    );
};

export default LocalLlmPanel;
