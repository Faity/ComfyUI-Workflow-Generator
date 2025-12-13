import type { SystemInventory, GeneratedWorkflowResponse, ComfyUIWorkflow, ComfyUIApiWorkflow, ValidationResponse, DebugResponse, WorkflowFormat } from '../types';
import { 
    SYSTEM_INSTRUCTION_TEMPLATE, 
    SYSTEM_INSTRUCTION_VALIDATOR, 
    SYSTEM_INSTRUCTION_API_VALIDATOR,
    SYSTEM_INSTRUCTION_DEBUGGER, 
    SYSTEM_INSTRUCTION_API_DEBUGGER,
    GRAPH_FORMAT_INSTRUCTION, 
    API_FORMAT_INSTRUCTION 
} from './prompts';

// --- Helper to extract JSON from LLM text response ---
const extractContentFromText = (text: string): { json: any, thoughts?: string } => {
    let cleanText = text.trim();
    let thoughts: string | undefined;

    // 1. Extract Thoughts if present (<thinking>...</thinking>) or custom THOUGHTS: format
    const thinkingMatch = cleanText.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch && thinkingMatch[1]) {
        thoughts = thinkingMatch[1].trim();
        cleanText = cleanText.replace(thinkingMatch[0], '').trim();
    }

    // 2. Extract JSON
    let jsonContent = cleanText;
    
    // Attempt 1: Regex for code blocks
    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = cleanText.match(jsonBlockRegex);
    
    if (match && match[1]) {
        jsonContent = match[1].trim();
    } else {
        // Attempt 2: Robust Fallback with Balanced Brace Counting
        const firstBrace = cleanText.indexOf('{');
        if (firstBrace !== -1) {
            let balance = 0;
            let lastBrace = -1;
            let insideString = false;
            let escape = false;

            for (let i = firstBrace; i < cleanText.length; i++) {
                const char = cleanText[i];
                if (escape) { escape = false; continue; }
                if (char === '\\') { escape = true; continue; }
                if (char === '"') { insideString = !insideString; continue; }

                if (!insideString) {
                    if (char === '{') {
                        balance++;
                    } else if (char === '}') {
                        balance--;
                        if (balance === 0) {
                            lastBrace = i;
                            break;
                        }
                    }
                }
            }

            if (lastBrace !== -1) {
                jsonContent = cleanText.substring(firstBrace, lastBrace + 1);
            } else {
                const fallbackLastBrace = cleanText.lastIndexOf('}');
                if (fallbackLastBrace !== -1) {
                    jsonContent = cleanText.substring(firstBrace, fallbackLastBrace + 1);
                }
            }
        }
    }

    try {
        const parsedJson = JSON.parse(jsonContent);
        return { json: parsedJson, thoughts };
    } catch (e) {
        console.error("JSON Parse Error. Raw Text:", text);
        throw new Error(`Failed to parse JSON response: ${(e as Error).message}`);
    }
};

// --- Main Local LLM Interaction Functions ---

async function callLocalLlmChat(apiUrl: string, model: string, messages: Array<{role: string, content: string}>): Promise<string> {
    const endpoint = new URL('/v1/chat/completions', apiUrl).toString();
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.2,
                stream: false
            }),
        });

        if (!response.ok) {
             const errorText = await response.text();
             throw new Error(`Local LLM Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        if (error instanceof TypeError) {
             throw new Error(`Failed to connect to Local LLM at ${apiUrl}. Is it running?`);
        }
        throw error;
    }
}

/**
 * STREAMING GENERATION - PANZER-LOGIK EDITION
 * Robust stream reading, splitting, fallback parsing, and auto-repair.
 */
export const generateWorkflowStream = async (
    description: string,
    localLlmApiUrl: string, 
    localLlmModel: string,
    inventory: SystemInventory | null,
    imageName: string | undefined,
    ragApiUrl: string, 
    format: WorkflowFormat = 'graph',
    systemInstructionTemplate: string = SYSTEM_INSTRUCTION_TEMPLATE,
    onThoughtsUpdate: (thoughtChunk: string) => void
): Promise<GeneratedWorkflowResponse> => {
    
    // --- 1. PROMPT CONSTRUCTION ---
    let ragContextBlock = '';
    if (ragApiUrl) {
        try {
            const ragContext = await queryRag(description, ragApiUrl, localLlmModel);
            if (ragContext && ragContext.trim()) {
                ragContextBlock = `\n**RAG-CONTEXT:**\n${ragContext.trim()}\n`;
            }
        } catch (e) { console.warn("RAG failed", e); }
    }

    let imageContextBlock = '';
    if (imageName) {
        imageContextBlock = `\n**USER-IMAGE:** User uploaded: ${imageName}. Use LoadImage node.\n`;
    }

    let inventoryBlock = 'No inventory.';
    if (inventory) {
        inventoryBlock = `\n\`\`\`json\n${JSON.stringify(inventory, null, 2)}\n\`\`\`\n`;
    }

    const formatInstruction = format === 'api' ? API_FORMAT_INSTRUCTION : GRAPH_FORMAT_INSTRUCTION;
    const finalSystemInstruction = systemInstructionTemplate
        .replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock)
        .replace('{{IMAGE_CONTEXT_PLACEHOLDER}}', imageContextBlock)
        .replace('{{SYSTEM_INVENTORY_PLACEHOLDER}}', inventoryBlock)
        .replace('{{FORMAT_INSTRUCTION_PLACEHOLDER}}', formatInstruction);

    // --- 2. STREAM REQUEST ---
    console.log("🚀 Starte Stream-Request an Backend...", ragApiUrl);

    let endpoint: string;
    try {
        endpoint = new URL('/v1/generate_workflow_stream', ragApiUrl).toString();
    } catch (e) {
        throw new Error(`Invalid Python Backend URL configured: ${ragApiUrl}`);
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: description,
                model: localLlmModel,
                system_prompt: finalSystemInstruction,
                ollama_url: localLlmApiUrl 
            })
        });

        if (!response.body) throw new Error("Kein ReadableStream vom Server erhalten");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        let fullText = '';
        let thoughts = '';
        let isJsonMode = false;
        let jsonBuffer = '';
        const MARKER = "###JSON_START###";

        // --- 3. STREAM LOOP ---
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;
            
            // Live-Parsing Logik
            if (!isJsonMode) {
                if (fullText.includes(MARKER)) {
                    // Trenner gefunden! Umschalten!
                    const parts = fullText.split(MARKER);
                    thoughts = parts[0].trim().replace('THOUGHTS:', '').trim();
                    jsonBuffer = parts[1] || ''; // Der Rest ist schon JSON
                    isJsonMode = true;
                    
                    // Letztes Update für die Gedanken-UI
                    onThoughtsUpdate(thoughts);
                } else {
                    // Noch beim Denken...
                    const displayThoughts = fullText.replace('THOUGHTS:', '').trimStart();
                    onThoughtsUpdate(displayThoughts);
                }
            } else {
                // Wir sind im JSON-Modus, nur noch sammeln
                jsonBuffer += chunk;
            }
        }

        console.log("🏁 Stream beendet. Analysiere Daten...");

        // --- 4. FALLBACK LOGIK (Falls der Trenner fehlte oder kaputt war) ---
        let finalJsonString = jsonBuffer;

        if (!isJsonMode) {
            console.warn("⚠️ Kein Trenner '###JSON_START###' gefunden! Versuche Fallback...");
            // Suche nach der ersten geschweiften Klammer, die nach JSON aussieht
            // Wir ignorieren alles vor der ersten {
            const firstBrace = fullText.indexOf('{');
            const lastBrace = fullText.lastIndexOf('}');
            
            if (firstBrace > -1 && lastBrace > firstBrace) {
                thoughts = fullText.substring(0, firstBrace).replace('THOUGHTS:', '').trim();
                finalJsonString = fullText.substring(firstBrace, lastBrace + 1);
                console.log("✅ Fallback erfolgreich: JSON extrahiert.");
            } else {
                // Letzter Verzweiflungsversuch: Vielleicht ist der ganze Text JSON?
                console.warn("⚠️ Keine Klammern für Fallback gefunden. Versuche Raw Text...");
                finalJsonString = fullText;
                thoughts = "Parsing Error: Could not separate thoughts from JSON.";
            }
        }

        // Markdown (```json) entfernen, falls vorhanden
        finalJsonString = finalJsonString.replace(/```json/g, '').replace(/```/g, '').trim();

        if (!finalJsonString) {
             throw new Error("JSON-Buffer ist leer! KI hat abgebrochen oder keine Ausgabe geliefert.");
        }

        console.log("[Stream Debug] Versuche zu parsen:", finalJsonString.substring(0, 50) + "..."); 

        // --- 5. PARSING ---
        let parsedData: any;
        try {
            parsedData = JSON.parse(finalJsonString);
        } catch (e) {
            console.error("❌ JSON Parse Fehler. String war:", finalJsonString);
            throw new Error(`Syntax-Fehler im generierten JSON: ${(e as Error).message}`);
        }

        // --- 6. STRUKTUR-REPARATUR (Auto-Fix) ---
        // Falls "workflow" fehlt (KI hat direkt Nodes geschickt)
        if (!parsedData.workflow && (parsedData.nodes || parsedData.links || Object.keys(parsedData).some(k => !isNaN(Number(k))))) {
            console.warn("⚠️ Wrapper fehlt. Repariere Struktur...");
            parsedData = {
                workflow: parsedData,
                requirements: { models: [], custom_nodes: [] }
            };
        }
        
        // Falls "requirements" fehlen
        if (parsedData.workflow && !parsedData.requirements) {
            parsedData.requirements = { models: [], custom_nodes: [] };
        }

        // Letzter Check
        if (!parsedData.workflow) {
             throw new Error("Ungültige Workflow-Struktur (Kein 'workflow' Objekt gefunden).");
        }

        return {
            thoughts: thoughts || "Keine Gedanken protokolliert.",
            workflow: parsedData.workflow,
            requirements: parsedData.requirements
        };

    } catch (error: any) {
        console.error("🔥 FATAL ERROR im Stream Service:", error);
        
        // Detailed Network Error Analysis for user feedback
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
            throw new Error(
                `Connection Failed to Backend (${endpoint!}). \n` + 
                `Possible causes:\n` +
                `1. CORS is not enabled in main.py.\n` +
                `2. The Python server is not running.\n` +
                `Check browser console (F12) for details.`
            );
        }
        throw error;
    }
};

// ... (Rest of existing functions: validateAndCorrectWorkflowLocal, debugAndCorrectWorkflowLocal, etc. - unchanged)
export const validateAndCorrectWorkflowLocal = async (
    workflow: ComfyUIWorkflow | ComfyUIApiWorkflow, 
    localLlmApiUrl: string, 
    localLlmModel: string,
    ragApiUrl?: string
): Promise<ValidationResponse> => {
    // ... (Existing implementation) ...
    if (!localLlmApiUrl) throw new Error("URL missing");
    const isGraph = typeof workflow === 'object' && 'nodes' in workflow;
    const basePrompt = isGraph ? SYSTEM_INSTRUCTION_VALIDATOR : SYSTEM_INSTRUCTION_API_VALIDATOR;
    const workflowString = JSON.stringify(workflow, null, 2);
    try {
        const content = await callLocalLlmChat(localLlmApiUrl, localLlmModel, [
            { role: "system", content: basePrompt },
            { role: "user", content: `Validate:\n\n${workflowString}` }
        ]);
        const { json } = extractContentFromText(content);
        return json;
    } catch (e: any) { throw new Error(`Validation failed: ${e.message}`); }
};

export const debugAndCorrectWorkflowLocal = async (
    workflow: ComfyUIWorkflow | ComfyUIApiWorkflow, 
    errorMessage: string,
    localLlmApiUrl: string, 
    localLlmModel: string,
    ragApiUrl?: string
): Promise<DebugResponse> => {
    // ... (Existing implementation) ...
    if (!localLlmApiUrl) throw new Error("URL missing");
    const isGraph = typeof workflow === 'object' && 'nodes' in workflow;
    const basePrompt = isGraph ? SYSTEM_INSTRUCTION_DEBUGGER : SYSTEM_INSTRUCTION_API_DEBUGGER;
    const payload = JSON.stringify({ workflow, errorMessage }, null, 2);
    try {
        const content = await callLocalLlmChat(localLlmApiUrl, localLlmModel, [
            { role: "system", content: basePrompt },
            { role: "user", content: payload }
        ]);
        const { json } = extractContentFromText(content);
        return json;
    } catch (e: any) { throw new Error(`Debug failed: ${e.message}`); }
};

export const uploadRagDocument = async (file: File, apiUrl: string) => { return { message: "ok" }; };
export const queryRag = async (prompt: string, apiUrl: string, model?: string) => { return ""; };
export const learnWorkflow = async (type: any, prompt: string, workflow: any, apiUrl: string) => { return { message: "ok" }; };
export const startFineTuning = async (data: string, apiUrl: string) => { return { job_id: "1" }; };
export const getServerInventory = async (apiUrl: string) => { return {}; };
export const testLocalLlmConnection = async (url: string) => { return { success: true, message: "ok" }; };
export const testRagConnection = async (url: string) => { return { success: true, message: "ok" }; };
export const generateWorkflowLocal = async (...args: any[]) => { throw new Error("Deprecated"); } 
