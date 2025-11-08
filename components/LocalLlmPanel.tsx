import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { DatabaseIcon, ChartBarIcon, TrashIcon } from './Icons';
import { uploadRagDocument, startFineTuning } from '../services/localLlmService';
import { useTranslations } from '../hooks/useTranslations';
import type { RagProvider } from '../App';

interface LocalLlmPanelProps {
  apiUrl: string;
  showToast: (message: string, type: 'success' | 'error') => void;
  ragProvider: RagProvider;
}

type ActiveTab = 'rag' | 'finetune';

interface UploadedFile {
    file: File;
    status: 'pending' | 'uploading' | 'success' | 'error';
    message?: string;
}

const LocalLlmPanel: React.FC<LocalLlmPanelProps> = ({ apiUrl, showToast, ragProvider }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('rag');
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [trainingData, setTrainingData] = useState('');
    const [fineTuneLog, setFineTuneLog] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
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
            showToast(t.localLlmApiUrlNotSet, 'error');
            return;
        }
        
        setIsLoading(true);
        for (let i = 0; i < files.length; i++) {
            if (files[i].status === 'pending') {
                try {
                    setFiles(prev => prev.map((f, index) => index === i ? { ...f, status: 'uploading' } : f));
                    const response = await uploadRagDocument(files[i].file, apiUrl, ragProvider);
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

    const handleStartFineTune = async () => {
        if (!apiUrl) {
            showToast(t.localLlmApiUrlNotSet, 'error');
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
            <h2 className="text-2xl font-bold text-gray-100">{t.localLlmTitle}</h2>
            <div className="flex space-x-1 bg-black/20 p-1 rounded-full">
                <button onClick={() => setActiveTab('rag')} className={`w-1/2 px-4 py-2 text-sm font-medium rounded-full flex items-center justify-center transition-colors ${activeTab === 'rag' ? 'bg-sky-500/80 text-white' : 'text-gray-300 hover:bg-white/10'}`}>
                    <DatabaseIcon className="w-5 h-5 mr-2" /> {t.localLlmRagTab}
                </button>
                <button onClick={() => setActiveTab('finetune')} className={`w-1/2 px-4 py-2 text-sm font-medium rounded-full flex items-center justify-center transition-colors ${activeTab === 'finetune' ? 'bg-sky-500/80 text-white' : 'text-gray-300 hover:bg-white/10'}`}>
                    <ChartBarIcon className="w-5 h-5 mr-2" /> {t.localLlmFineTuneTab}
                </button>
            </div>
            
            {activeTab === 'rag' && (
                <div className="flex flex-col space-y-4 flex-grow">
                    <p className="text-sm text-gray-400">{t.localLlmRagSubtext}</p>
                    <div {...getRootProps()} className={`p-8 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300 ${isDragActive ? 'border-teal-400 bg-teal-500/20' : 'border-gray-600/50 hover:border-gray-500 bg-black/20'}`}>
                        <input {...getInputProps()} />
                        <p className="text-gray-400">{t.localLlmDropzone}</p>
                    </div>
                    <div className="flex-grow overflow-y-auto space-y-2 pr-2 -mr-2 min-h-[100px]">
                        {files.map((uploadedFile, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                                <div className="truncate">
                                    <p className="text-sm font-medium text-gray-200 truncate">{uploadedFile.file.name}</p>
                                    <p className={`text-xs ${uploadedFile.status === 'success' ? 'text-green-400' : uploadedFile.status === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
                                       {uploadedFile.status === 'uploading' ? t.localLlmUploading : uploadedFile.message || uploadedFile.status}
                                    </p>
                                </div>
                                <button onClick={() => removeFile(index)} className="p-1 text-gray-400 hover:text-white"><TrashIcon className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                    <button onClick={handleUpload} disabled={isLoading || files.length === 0} className="w-full mt-auto px-6 py-3 bg-teal-500/90 text-white font-semibold rounded-lg hover:bg-teal-500 disabled:bg-gray-600/50">
                        {isLoading ? t.localLlmUploading : `${t.localLlmUploadButton} (${files.filter(f => f.status === 'pending').length})`}
                    </button>
                </div>
            )}
            
            {activeTab === 'finetune' && (
                 <div className="flex flex-col space-y-4 flex-grow">
                     <p className="text-sm text-gray-400">{t.localLlmFineTuneSubtext}</p>
                     <textarea
                        value={trainingData}
                        onChange={(e) => setTrainingData(e.target.value)}
                        placeholder='{"prompt": "...", "completion": "..."}\n{"prompt": "...", "completion": "..."}'
                        className="w-full h-48 p-4 bg-black/20 border-transparent focus:border-teal-500/50 rounded-lg resize-y focus:ring-2 focus:ring-teal-400 transition-colors"
                        disabled={isLoading}
                    />
                    <div className="flex-grow bg-black/30 rounded-lg p-3 overflow-y-auto h-32">
                        <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono">
                            {fineTuneLog.map((line, i) => <div key={i}>{`[${new Date().toLocaleTimeString()}] ${line}`}</div>)}
                        </pre>
                    </div>
                     <button onClick={handleStartFineTune} disabled={isLoading || !trainingData.trim()} className="w-full mt-auto px-6 py-3 bg-sky-500/90 text-white font-semibold rounded-lg hover:bg-sky-500 disabled:bg-gray-600/50">
                        {isLoading ? t.localLlmStarting : t.localLlmStartFineTune}
                    </button>
                 </div>
            )}

        </div>
    );
};

export default LocalLlmPanel;