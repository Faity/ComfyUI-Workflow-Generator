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
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-100 font-semibold">$1</strong>')
            .replace(/`(.*?)`/g, '<code class="bg-gray-700 text-yellow-300 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');
    }

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '---') {
            closeList();
            html += '<hr class="my-6 border-gray-600" />';
            continue;
        }
        if (line.startsWith('# ')) {
            closeList();
            html += `<h1 class="text-3xl font-bold mt-8 mb-4 text-teal-400 pb-2 border-b border-gray-700">${processInline(line.substring(2))}</h1>`;
            continue;
        }
        if (line.startsWith('## ')) {
            closeList();
            html += `<h2 class="text-2xl font-bold mt-6 mb-3 text-sky-400">${processInline(line.substring(3))}</h2>`;
            continue;
        }
        if (line.match(/^\d+\.\s/)) {
            if (inList !== 'ol') {
                closeList();
                html += '<ol class="list-decimal list-inside space-y-2 mb-4 pl-4 text-gray-300">';
                inList = 'ol';
            }
            html += `<li>${processInline(line.replace(/^\d+\.\s/, ''))}</li>`;
            continue;
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
            if (inList !== 'ul') {
                closeList();
                html += '<ul class="list-disc list-inside space-y-2 mb-4 pl-4 text-gray-300">';
                inList = 'ul';
            }
            html += `<li>${processInline(line.substring(2))}</li>`;
            continue;
        }
        
        closeList(); 
        if (trimmedLine) {
            html += `<p class="text-gray-300 mb-4 leading-relaxed">${processInline(line)}</p>`;
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
            <div className="text-center text-red-400">
                <h3 className="text-xl font-bold">{t.docErrorTitle}</h3>
                <p className="mt-2 bg-red-900/50 p-4 rounded-md">{error}</p>
            </div>
        </div>
      );
    }

    return <div className="max-w-4xl mx-auto" dangerouslySetInnerHTML={{ __html: parseMarkdown(markdown) }} />;
  };

  return (
    <div className="w-full bg-gray-900 p-6 lg:p-10 flex flex-col" role="tabpanel">
        <div className="overflow-y-auto h-full pr-4 -mr-4">
            {renderContent()}
        </div>
    </div>
  );
};

export default DocumentationPanel;
