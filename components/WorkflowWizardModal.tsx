import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat } from "@google/genai";
import { CpuChipIcon } from './Icons';
import { useTranslations } from '../hooks/useTranslations';

interface WorkflowWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (technicalPrompt: string) => void;
}

interface Message {
  sender: 'user' | 'model';
  text: string;
}

const SYSTEM_INSTRUCTION_WIZARD = `You are a 'ComfyUI Workflow Wizard'. Your purpose is to guide a user through a series of technical questions to construct a precise, technical prompt for another AI that will generate the final ComfyUI workflow JSON. You must speak German.

Your process is as follows:
1.  Start by asking the user for the general type of workflow they want to create. Offer examples like 'Text-to-Image', 'Image-to-Image', 'Inpainting', 'ControlNet', 'AnimateDiff'.
2.  Based on their answer, ask specific follow-up questions.
    *   If 'Text-to-Image' -> Ask about the model (SD 1.5, SDXL). If SDXL, ask if they need a refiner.
    *   If 'ControlNet' -> Ask which ControlNet model they want (Canny, OpenPose, Depth, etc.) and what base model to use with it.
    *   If 'Inpainting' -> Ask for the base model and what kind of mask generation they need.
    *   Always ask about samplers (e.g., \`euler\`, \`dpmpp_2m_sde\`), schedulers, and image dimensions if relevant.
3.  Keep the conversation concise and focused on technical specifications. Avoid creative or stylistic questions.
4.  After gathering all necessary information (typically 3-4 questions), synthesize the answers into a single, clear, technical prompt.
5.  This final prompt MUST be enclosed in \`[WORKFLOW_PROMPT]\` and \`[/WORKFLOW_PROMPT]\` tags.

Example conversation:
User: "Ich brauche einen Text-zu-Bild Workflow."
You: "Verstanden. Welches Basis-Modell möchten Sie verwenden? SD 1.5 oder SDXL?"
User: "SDXL"
You: "Möchten Sie einen Refiner-Node für den SDXL-Workflow verwenden?"
User: "Ja"
You: "In Ordnung. Welchen Sampler und Scheduler bevorzugen Sie? (z.B. Sampler: euler, Scheduler: normal)"
User: "dpmpp_2m_sde karras"
You: "Perfekt. Hier ist der technische Prompt für den Generator:"
[WORKFLOW_PROMPT]
Erstelle einen SDXL Text-zu-Bild Workflow. Der Workflow soll einen Base-Loader und einen Refiner-Loader verwenden. Nutze einen KSampler für den Base-Pass und einen zweiten KSampler für den Refiner-Pass. Konfiguriere beide KSampler mit dem Sampler 'dpmpp_2m_sde' und dem Scheduler 'karras'. Das finale Bild soll gespeichert werden.
[/WORKFLOW_PROMPT]

Start the conversation now by asking the user what kind of workflow they want to create.`;


const WorkflowWizardModal: React.FC<WorkflowWizardModalProps> = ({ isOpen, onClose, onComplete }) => {
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
        config: { systemInstruction: SYSTEM_INSTRUCTION_WIZARD },
      });
      setChat(newChat);
      setMessages([]);
      setFinalPrompt(null);
      setIsLoading(true);

      newChat.sendMessage({ message: "Start" }).then(response => {
        setMessages(prev => [...prev, { sender: 'model', text: response.text }]);
      }).catch(err => {
        console.error("Error starting wizard chat:", err);
        setMessages(prev => [...prev, { sender: 'model', text: t.optimizerErrorGeneral }]);
      }).finally(() => {
        setIsLoading(false);
      });
    }
  }, [isOpen, t.optimizerErrorApiKey, t.optimizerErrorGeneral]);
  
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
      
      const promptRegex = /\[WORKFLOW_PROMPT\]([\s\S]*?)\[\/WORKFLOW_PROMPT\]/;
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
            <CpuChipIcon className="w-6 h-6 mr-3 text-indigo-500" />
            {t.workflowWizard}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
        </header>
        
        <div ref={chatContainerRef} className="flex-grow p-4 overflow-y-auto space-y-4 bg-slate-50">
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-lg p-3 rounded-lg shadow-sm ${msg.sender === 'user' ? 'bg-indigo-500 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
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
        
        <footer className="p-4 border-t border-slate-200 flex-shrink-0 bg-white">
          {finalPrompt ? (
             <div className="text-center">
                <p className="text-sm text-green-600 mb-3">{t.wizardPromptCreated}</p>
                <button
                    onClick={() => onComplete(finalPrompt)}
                    className="w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-500 transition-colors shadow-md"
                >
                    {t.wizardUsePrompt}
                </button>
             </div>
          ) : (
            <div className="flex space-x-2">
                <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder={t.wizardPlaceholder}
                    className="flex-grow p-3 bg-slate-50 border border-slate-200 focus:border-teal-500 rounded-lg focus:ring-2 focus:ring-teal-200 transition-all duration-300 text-slate-800"
                    disabled={isLoading}
                />
                <button
                    onClick={handleSendMessage}
                    disabled={isLoading || !userInput.trim()}
                    className="px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-500 disabled:bg-slate-300 transition-colors shadow-md"
                >
                    {t.wizardSend}
                </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
};

export default WorkflowWizardModal;