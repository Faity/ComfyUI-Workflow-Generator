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
      <div className="w-full lg:w-1/2 bg-gray-900 p-6 flex flex-col items-center justify-center text-center">
        <div className="text-gray-500">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
             <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <h3 className="text-xl font-bold text-gray-400">{t.noHistory}</h3>
          <p className="mt-2 max-w-sm">{t.noHistorySubtext}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full lg:w-1/2 bg-gray-900 p-6 flex flex-col" role="tabpanel">
      <div className="flex-shrink-0 flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-200">{t.historyTitle}</h2>
        <button
          onClick={onClear}
          className="flex items-center px-3 py-1 text-sm bg-red-800 text-red-200 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
          title={t.tooltipClearHistory}
        >
          <TrashIcon className="w-4 h-4 mr-2" />
          {t.clearHistory}
        </button>
      </div>
      <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-2">
        {history.map((entry) => (
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(entry)}
            onKeyPress={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(entry)}
            className={`p-3 rounded-lg cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-sky-500 ${
              selectedHistoryId === entry.id
                ? 'bg-sky-800/50 border-sky-600 border'
                : 'bg-gray-800 hover:bg-gray-700/70'
            }`}
          >
            <div className="flex justify-between items-start">
                <div className="flex-grow min-w-0">
                    <p className="text-sm font-semibold text-gray-200 truncate pr-4" title={entry.prompt}>{entry.prompt}</p>
                    <p className="text-xs text-gray-500 mt-1">
                    {new Date(entry.timestamp).toLocaleString(t.locale)}
                    </p>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent onSelect from firing
                        onDownload(entry);
                    }}
                    title={t.tooltipDownloadHistory}
                    className="flex-shrink-0 p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-full"
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
