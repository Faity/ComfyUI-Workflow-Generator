import React, { useEffect } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon } from './Icons';

interface ToastProps {
    message: string;
    type: 'success' | 'error';
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 5000); // Auto-dismiss after 5 seconds

        return () => clearTimeout(timer);
    }, [onClose]);

    const isSuccess = type === 'success';
    const baseStyle = 'bg-opacity-50 backdrop-blur-lg border';
    const successStyle = 'bg-green-500 border-green-400/50 shadow-lg shadow-green-500/20';
    const errorStyle = 'bg-red-500 border-red-400/50 shadow-lg shadow-red-500/20';
    const Icon = isSuccess ? CheckCircleIcon : ExclamationCircleIcon;

    return (
        <div className="fixed bottom-5 right-5 z-50">
            <div className={`flex items-center p-4 rounded-xl text-white ${baseStyle} ${isSuccess ? successStyle : errorStyle}`}>
                <Icon className="w-6 h-6 mr-3" />
                <p className="text-sm font-medium">{message}</p>
                <button onClick={onClose} className="ml-4 text-xl font-semibold hover:opacity-75">&times;</button>
            </div>
        </div>
    );
};

export default Toast;