import React, { useEffect } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon } from './Icons';

interface ToastProps {
    message: string;
    type: 'success' | 'error';
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
    useEffect(() => {
        // Only auto-dismiss success messages. Keep errors visible until manually closed.
        if (type === 'success') {
            const timer = setTimeout(() => {
                onClose();
            }, 5000); // Auto-dismiss after 5 seconds for success

            return () => clearTimeout(timer);
        }
    }, [onClose, type]);

    const isSuccess = type === 'success';
    const baseStyle = 'backdrop-blur-lg border shadow-lg rounded-xl';
    const successStyle = 'bg-white border-green-200 text-green-800 shadow-green-100';
    const errorStyle = 'bg-white border-red-200 text-red-800 shadow-red-100';
    const Icon = isSuccess ? CheckCircleIcon : ExclamationCircleIcon;

    return (
        <div className="fixed bottom-5 right-5 z-50 max-w-md w-full">
            <div className={`flex items-start p-4 ${baseStyle} ${isSuccess ? successStyle : errorStyle}`}>
                <div className={`flex-shrink-0 ${isSuccess ? 'text-green-500' : 'text-red-500'}`}>
                    <Icon className="w-6 h-6 mt-0.5 mr-3" />
                </div>
                <div className="flex-grow mr-2">
                     <p className="text-sm font-medium break-words">{message}</p>
                </div>
                <button onClick={onClose} className="flex-shrink-0 ml-2 text-xl font-semibold hover:opacity-75 opacity-50 leading-none">&times;</button>
            </div>
        </div>
    );
};

export default Toast;