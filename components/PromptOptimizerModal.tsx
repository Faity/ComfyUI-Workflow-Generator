import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat } from "@google/genai";
import { SparklesIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface PromptOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt: string;
  onOptimize: (optimizedPrompt: string) => void;
}

interface Message {
  sender: 'user' | 'model';
  text: string;
}

const SYSTEM_INSTRUCTION_OPTIMIZER = `You are a 'Prompt Optimizer' assistant for a text-to-image AI system. Your goal is to help a user refine their initial, simple idea into a detailed and effective prompt. The user will provide an initial prompt. You must ask them a series of clarifying questions to understand their vision better. Ask about:
1.  **Subject & Style:** What is the main subject? What artistic style should be used (e.g., photorealistic, oil painting, cartoon, fantasy, sci-fi)?
2.  **Details & Composition:** What specific details should be included? How should the scene be composed (e.g., close-up, wide shot)?
3.  **Lighting & Atmosphere:** What kind of lighting is there (e.g., soft morning light, dramatic neon, moody darkness)? What is the overall mood or atmosphere?
4.  **Color Palette:** Is there a specific color scheme?

After you have gathered enough information (usually after 2-3 questions), synthesize all the details into a single, comprehensive, and well-structured final prompt in German. Present this final prompt clearly inside a \`[PROMPT]\` block, like this:
Hier ist Ihr optimierter Prompt:
[PROMPT]
Ein fotorealistisches Bild einer majestätischen Siamkatze mit leuchtend blauen Augen, die auf einem samtigen roten Kissen sitzt. Das sanfte Morgenlicht fällt durch ein Fenster und wirft lange Schatten. Die Atmosphäre ist ruhig und friedlich.
[/PROMPT]

Your entire conversation must be in German. Start the conversation by asking your first question based on the user's initial prompt.`;


const PromptOptimizerModal: React.FC<PromptOptimizerModalProps> = ({ isOpen, onClose, initialPrompt, onOptimize }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const t = useTranslations();

  useEffect(() => {
    if (isOpen) {
      if (!process.env.API_KEY) {
        console.error("API key is missing.");
        setMessages([{ sender: 'model', text: t.optimizerErrorApiKey }]);
        return;
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const newChat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction: SYSTEM_INSTRUCTION_OPTIMIZER },
      });
      setChat(newChat);
      setMessages([]);
      setFinalPrompt(null);
      
      const firstMessage = initialPrompt.trim() || "Beschreibe ein Bild.";
      setMessages([{ sender: 'user', text: firstMessage }]);
      setIsLoading(true);

      newChat.sendMessage({ message: firstMessage }).then(response => {
        setMessages(prev => [...prev, { sender: 'model', text: response.text }]);
      }).catch(err => {
        console.error("Error starting chat:", err);
        setMessages(prev => [...prev, { sender: 'model', text: t.optimizerErrorGeneral }]);
      }).finally(() => {
        setIsLoading(false);
      });
    }
  }, [isOpen, initialPrompt, t.optimizerErrorApiKey, t.optimizerErrorGeneral]);
  
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);


  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading || !chat) return;

    const newUserMessage: Message = { sender: 'user', text: userInput };
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsLoading(true);

    try {
      const response = await chat.sendMessage({ message: newUserMessage.text });
      const responseText = response.text;
      
      const promptRegex = /\[PROMPT\]([\s\S]*?)\[\/PROMPT\]/;
      const match = responseText.match(promptRegex);
      if (match && match[1]) {
        setFinalPrompt(match[1].trim());
      }
      
      setMessages(prev => [...prev, { sender: 'model', text: responseText }]);
    } catch (err) {
      console.error("Error sending message:", err);
      setMessages(prev => [...prev, { sender: 'model', text: t.optimizerErrorCommunication }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-panel rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden bg-white">
        <header className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center text-slate-800">
            <SparklesIcon className="w-6 h-6 mr-3 text-sky-500" />
            {t.promptAssistant}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
        </header>
        
        <div ref={chatContainerRef} className="flex-grow p-4 overflow-y-auto space-y-4 bg-slate-50">
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-lg p-3 rounded-lg shadow-sm ${msg.sender === 'user' ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                {msg.text.split('\n').map((line, i) => <p key={i}>{line}</p>)}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
               <div className="max-w-lg p-3 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center space-x-2">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-0"></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-150"></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-300"></div>
               </div>
            </div>
          )}
        </div>
        
        <footer className="p-4 border-t border-slate-200 bg-white flex-shrink-0">
          {finalPrompt ? (
             <div className="text-center">
                <p className="text-sm text-green-600 mb-3">{t.optimizerPromptCreated}</p>
                <button
                    onClick={() => onOptimize(finalPrompt)}
                    className="w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-500 transition-colors shadow-md"
                >
                    {t.optimizerUsePrompt}
                </button>
             </div>
          ) : (
            <div className="flex space-x-2">
                <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder={t.optimizerPlaceholder}
                    className="flex-grow p-3 bg-slate-50 border border-slate-200 focus:border-teal-500 rounded-lg focus:ring-2 focus:ring-teal-200 transition-all duration-300 text-slate-800"
                    disabled={isLoading}
                />
                <button
                    onClick={handleSendMessage}
                    disabled={isLoading || !userInput.trim()}
                    className="px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-500 disabled:bg-slate-300 transition-colors shadow-md"
                >
                    {t.optimizerSend}
                </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
};

export default PromptOptimizerModal;