import React from 'react';
import type { HistoryEntry } from '../types';
import { DownloadIcon, TrashIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface HistoryPanelProps {
  history: HistoryEntry[];
  selectedHistoryId: string | null;
  onSelect: (entry: HistoryEntry) => void;
  onClear: () => void;
  onDownload: (entry: HistoryEntry) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, selectedHistoryId, onSelect, onClear, onDownload }) => {
  const t = useTranslations();

  if (history.length === 0) {
    return (
      <div className="w-full lg:w-1/2 glass-panel rounded-2xl p-8 flex flex-col items-center justify-center text-center">
        <div className="text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-20 h-20 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
             <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <h3 className="text-xl font-bold text-slate-600">{t.noHistory}</h3>
          <p className="mt-2 max-w-sm">{t.noHistorySubtext}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full lg:w-1/2 glass-panel rounded-2xl p-8 flex flex-col" role="tabpanel">
      <div className="flex-shrink-0 flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">{t.historyTitle}</h2>
        <button
          onClick={onClear}
          className="flex items-center px-4 py-2 text-sm bg-red-50 border border-red-100 text-red-500 rounded-full hover:bg-red-100 transition-colors shadow-sm"
          title={t.tooltipClearHistory}
        >
          <TrashIcon className="w-4 h-4 mr-2" />
          {t.clearHistory}
        </button>
      </div>
      <div className="flex-grow overflow-y-auto pr-2 -mr-4 space-y-3">
        {history.map((entry) => (
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(entry)}
            onKeyPress={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(entry)}
            className={`p-4 rounded-xl cursor-pointer transition-all duration-200 border focus:outline-none focus:ring-2 focus:ring-sky-400 ${
              selectedHistoryId === entry.id
                ? 'bg-sky-50 border-sky-200 shadow-inner'
                : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-md'
            }`}
          >
            <div className="flex justify-between items-start">
                <div className="flex-grow min-w-0">
                    <p className={`text-sm font-semibold truncate pr-4 ${selectedHistoryId === entry.id ? 'text-sky-900' : 'text-slate-700'}`} title={entry.prompt}>{entry.prompt}</p>
                    <p className="text-xs text-slate-500 mt-1">
                    {new Date(entry.timestamp).toLocaleString(t.locale)}
                    </p>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent onSelect from firing
                        onDownload(entry);
                    }}
                    title={t.tooltipDownloadHistory}
                    className="flex-shrink-0 p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                    aria-label="Download this workflow"
                >
                    <DownloadIcon className="w-4 h-4" />
                </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryPanel;