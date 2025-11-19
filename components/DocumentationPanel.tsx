import React, { useState, useEffect } from 'react';
import Loader from './Loader';
import { useLanguage } from '../context/LanguageContext';
import { useTranslations } from '../hooks/useTranslations';

const parseMarkdown = (text: string) => {
    const lines = text.split('\n');
    let html = '';
    let inList: 'ul' | 'ol' | null = null;

    const closeList = () => {
        if (inList) {
            html += `</${inList}>`;
            inList = null;
        }
    };

    const processInline = (line: string) => {
        return line
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800 font-bold">$1</strong>')
            .replace(/`(.*?)`/g, '<code class="bg-slate-100 text-indigo-600 px-1.5 py-0.5 rounded text-sm font-mono border border-slate-200">$1</code>');
    }

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '---') {
            closeList();
            html += '<hr class="my-8 border-slate-200" />';
            continue;
        }
        if (line.startsWith('# ')) {
            closeList();
            html += `<h1 class="text-4xl font-bold mt-8 mb-6 text-teal-600 pb-2 border-b border-slate-200">${processInline(line.substring(2))}</h1>`;
            continue;
        }
        if (line.startsWith('## ')) {
            closeList();
            html += `<h2 class="text-2xl font-bold mt-8 mb-4 text-slate-700">${processInline(line.substring(3))}</h2>`;
            continue;
        }
        if (line.match(/^\d+\.\s/)) {
            if (inList !== 'ol') {
                closeList();
                html += '<ol class="list-decimal list-inside space-y-3 mb-4 pl-4 text-slate-600">';
                inList = 'ol';
            }
            html += `<li>${processInline(line.replace(/^\d+\.\s/, ''))}</li>`;
            continue;
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
            if (inList !== 'ul') {
                closeList();
                html += '<ul class="list-disc list-inside space-y-3 mb-4 pl-4 text-slate-600">';
                inList = 'ul';
            }
            html += `<li>${processInline(line.substring(2))}</li>`;
            continue;
        }
        
        closeList(); 
        if (trimmedLine) {
            html += `<p class="text-slate-600 mb-4 leading-relaxed">${processInline(line)}</p>`;
        }
    }
    
    closeList();
    return html;
};


const DocumentationPanel: React.FC = () => {
  const { language } = useLanguage();
  const t = useTranslations();
  const [markdown, setMarkdown] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const docFile = language === 'de' ? '/Bedienungsanleitung.md' : '/UserManual.md';
        const response = await fetch(docFile);
        if (!response.ok) {
          throw new Error(t.docErrorContent(response.status));
        }
        const text = await response.text();
        setMarkdown(text);
      } catch (e) {
        if (e instanceof Error) setError(e.message);
        else setError(t.docErrorUnknown);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDocs();
  }, [language, t]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
            <Loader message={t.docLoading} />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full">
            <div className="text-center text-red-500 glass-panel p-8 rounded-2xl">
                <h3 className="text-xl font-bold">{t.docErrorTitle}</h3>
                <p className="mt-2 bg-red-50 border border-red-200 p-4 rounded-md text-red-700">{error}</p>
            </div>
        </div>
      );
    }

    return <div className="max-w-4xl mx-auto" dangerouslySetInnerHTML={{ __html: parseMarkdown(markdown) }} />;
  };

  return (
    <div className="w-full glass-panel rounded-2xl p-8 lg:p-10 flex flex-col" role="tabpanel">
        <div className="overflow-y-auto h-full pr-4 -mr-4">
            {renderContent()}
        </div>
    </div>
  );
};

export default DocumentationPanel;