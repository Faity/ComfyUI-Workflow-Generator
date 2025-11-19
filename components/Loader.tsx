import React from 'react';

interface LoaderProps {
    message?: string;
    progress?: number;
}

const ProgressBarLoader: React.FC<LoaderProps> = ({ message, progress = 0 }) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-4">
    <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-teal-500 mb-6"></div>
    <div className="w-full max-w-md bg-slate-200 rounded-full h-2.5">
        <div 
            className="bg-gradient-to-r from-sky-500 to-teal-500 h-2.5 rounded-full transition-all duration-500 ease-out shadow-sm" 
            style={{ width: `${progress}%` }}
        ></div>
    </div>
    <p className="mt-4 text-lg text-slate-700 font-medium">{message || 'Processing...'}</p>
    <p className="text-sm text-slate-500">This may take a moment.</p>
  </div>
);

export default ProgressBarLoader;