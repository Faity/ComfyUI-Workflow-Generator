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
    const baseStyle = 'backdrop-blur-lg border shadow-lg rounded-xl';
    const successStyle = 'bg-white border-green-200 text-green-800 shadow-green-100';
    const errorStyle = 'bg-white border-red-200 text-red-800 shadow-red-100';
    const Icon = isSuccess ? CheckCircleIcon : ExclamationCircleIcon;

    return (
        <div className="fixed bottom-5 right-5 z-50">
            <div className={`flex items-center p-4 ${baseStyle} ${isSuccess ? successStyle : errorStyle}`}>
                <div className={`${isSuccess ? 'text-green-500' : 'text-red-500'}`}>
                    <Icon className="w-6 h-6 mr-3" />
                </div>
                <p className="text-sm font-medium">{message}</p>
                <button onClick={onClose} className="ml-4 text-xl font-semibold hover:opacity-75 opacity-50">&times;</button>
            </div>
        </div>
    );
};

export default Toast;