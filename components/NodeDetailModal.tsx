import React from 'react';
import type { ComfyUINode } from '../types';

interface NodeDetailModalProps {
  node: ComfyUINode;
  onClose: () => void;
}

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="py-2 px-3 grid grid-cols-3 gap-4 border-b border-gray-700/50 last:border-b-0">
        <dt className="text-sm font-medium text-gray-400">{label}</dt>
        <dd className="text-sm text-gray-200 col-span-2">{children}</dd>
    </div>
);

const NodeDetailModal: React.FC<NodeDetailModalProps> = ({ node, onClose }) => {
    
    const renderValue = (value: any) => {
        if (typeof value === 'object' && value !== null) {
            return <pre className="text-xs bg-gray-900 p-2 rounded-md whitespace-pre-wrap"><code>{JSON.stringify(value, null, 2)}</code></pre>;
        }
        if (typeof value === 'boolean') {
            return value ? <span className="text-green-400 font-bold">true</span> : <span className="text-red-400 font-bold">false</span>
        }
        return String(value);
    }

    return (
    <div 
        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="node-details-title"
    >
        <div 
            className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
        >
            <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                <div>
                    <h2 id="node-details-title" className="text-lg font-bold text-teal-400">{node.title || node.type}</h2>
                    {node.title && node.title !== node.type && <p className="text-xs text-gray-500">{node.type}</p>}
                </div>
                <button 
                    onClick={onClose} 
                    className="text-gray-400 hover:text-white text-2xl font-bold"
                    aria-label="Close node details"
                >
                    &times;
                </button>
            </header>

            <div className="flex-grow p-4 overflow-y-auto">
                <dl className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                    <DetailRow label="Node ID">{node.id}</DetailRow>
                    
                    {node.widgets_values && node.widgets_values.length > 0 && (
                        <DetailRow label="Widget Values">
                            <ul className="space-y-2">
                                {node.widgets_values.map((val, index) => (
                                    <li key={index} className="text-sm flex items-baseline">
                                        <span className="font-mono bg-gray-700 px-1.5 py-0.5 rounded mr-2 text-gray-300 text-xs">{index}:</span>
                                        <div className="flex-1">{renderValue(val)}</div>
                                    </li>
                                ))}
                            </ul>
                        </DetailRow>
                    )}

                    {node.properties && Object.keys(node.properties).length > 0 && (
                        <DetailRow label="Properties">
                            <dl className="space-y-1">
                            {Object.entries(node.properties).map(([key, value]) => (
                                <div key={key} className="grid grid-cols-2">
                                    <dt className="text-xs text-gray-500 truncate">{key}</dt>
                                    <dd>{renderValue(value)}</dd>
                                </div>
                            ))}
                            </dl>
                        </DetailRow>
                    )}

                    {Array.isArray(node.inputs) && node.inputs.length > 0 && (
                        <DetailRow label="Inputs">
                            <ul className="space-y-1 text-sm">
                                {node.inputs.map((input, index) => (
                                    <li key={index}>
                                       <span className="font-medium text-gray-200">{input.name}</span>
                                       <span className="text-gray-500 ml-2">({input.type})</span>
                                       {input.link !== null && <span className="text-xs text-sky-400 ml-2">[Connected]</span>}
                                    </li>
                                ))}
                            </ul>
                        </DetailRow>
                    )}

                     {Array.isArray(node.outputs) && node.outputs.length > 0 && (
                        <DetailRow label="Outputs">
                            <ul className="space-y-1 text-sm">
                                {node.outputs.map((output, index) => (
                                    <li key={index}>
                                       <span className="font-medium text-gray-200">{output.name}</span>
                                       <span className="text-gray-500 ml-2">({output.type})</span>
                                       {output.links && output.links.length > 0 && <span className="text-xs text-sky-400 ml-2">[{output.links.length} Connection(s)]</span>}
                                    </li>
                                ))}
                            </ul>
                        </DetailRow>
                    )}

                </dl>
            </div>
            
            <footer className="p-3 border-t border-gray-700 flex-shrink-0 bg-gray-800/50 rounded-b-xl">
                <button 
                    onClick={onClose}
                    className="w-full px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-teal-500"
                >
                    Close
                </button>
            </footer>
        </div>
    </div>
  );
};

export default NodeDetailModal;
