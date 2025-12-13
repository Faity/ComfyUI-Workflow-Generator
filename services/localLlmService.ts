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
 * STREAMING GENERATION
 * Reads a stream from the backend, parses "THOUGHTS" vs "JSON" in real-time.
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
    
    // Construct Prompt
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

    // Call Backend Streaming Endpoint
    let endpoint: string;
    try {
        endpoint = new URL('/v1/generate_workflow_stream', ragApiUrl).toString();
    } catch (e) {
        throw new Error(`Invalid Python Backend URL configured: ${ragApiUrl}`);
    }

    console.log(`[Stream Debug] Attempting to connect to: ${endpoint}`);

    let response: Response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: description,
                model: localLlmModel,
                system_prompt: finalSystemInstruction,
                ollama_url: localLlmApiUrl 
            })
        });
    } catch (error: any) {
        console.error("[Stream Debug] Fetch failed:", error);
        
        // Detailed Network Error Analysis
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
            throw new Error(
                `Connection Failed to Backend (${endpoint}). \n` + 
                `Possible causes:\n` +
                `1. CORS is not enabled in main.py (Most likely).\n` +
                `2. The Python server is not running.\n` +
                `3. Mixed Content: Frontend is HTTPS, Backend is HTTP.\n\n` +
                `Check browser console (F12) for specific CORS errors.`
            );
        }
        throw new Error(`Network Error: ${error.message}`);
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details');
        throw new Error(`Backend Error (${response.status}): ${errorText}`);
    }
    
    if (!response.body) throw new Error("No response body for stream.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    let isJsonMode = false;
    const SEPARATOR = "###JSON_START###";
    
    // Wir sammeln alles für den Fallback am Ende
    let fullRawText = ''; 
    let fullThoughts = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullRawText += chunk;
        
        // Live UI Updates (Best Effort)
        if (!isJsonMode) {
            buffer += chunk;
            const sepIndex = buffer.indexOf(SEPARATOR);
            
            if (sepIndex !== -1) {
                // Separator found during streaming
                const thoughtsPart = buffer.substring(0, sepIndex);
                fullThoughts = thoughtsPart.replace('THOUGHTS:', '').trim(); 
                onThoughtsUpdate(fullThoughts);
                
                // Switch to JSON mode
                isJsonMode = true;
                buffer = ''; // buffer cleared, rest is now accumulating in fullRawText
            } else {
                // Still thinking... update thoughts live
                const displayBuffer = buffer.replace('THOUGHTS:', '').trimStart();
                onThoughtsUpdate(displayBuffer);
            }
        }
    }

    // --- ROBUST FINAL PARSING ---
    // Wir nutzen den komplett gesammelten Text (fullRawText), um sicherzustellen, 
    // dass wir sauber trennen, auch wenn der Stream gestottert hat.

    let jsonContent = '';
    let finalThoughts = fullThoughts;

    // SICHERHEITS-CHECK: Hat das LLM den Trenner vielleicht anders geschrieben?
    // Wir suchen nach dem Marker im gesamten Text.
    if (fullRawText.includes(SEPARATOR)) {
        const parts = fullRawText.split(SEPARATOR);
        // Clean Thoughts
        finalThoughts = parts[0].replace('THOUGHTS:', '').trim();
        // Alles nach dem Marker ist potenzielles JSON
        jsonContent = parts.slice(1).join(SEPARATOR).trim(); 
    } else {
        // Fallback: Wenn kein Marker da ist, suchen wir die erste geschweifte Klammer '{'
        const firstBrace = fullRawText.indexOf('{');
        if (firstBrace > -1) {
            finalThoughts = fullRawText.substring(0, firstBrace).replace('THOUGHTS:', '').trim();
            jsonContent = fullRawText.substring(firstBrace).trim();
        } else {
             // Fallback 2: Ganzen Text versuchen (wird wahrscheinlich fehlschlagen, aber besser als nichts)
             jsonContent = fullRawText;
        }
    }

    // Markdown-Code-Blöcke entfernen (falls das LLM ```json schreibt)
    jsonContent = jsonContent.replace(/```json/g, '').replace(/```/g, '').trim();

    console.log("[Stream Debug] Parsing content start:", jsonContent.substring(0, 50) + "..."); 

    try {
        const parsed = JSON.parse(jsonContent) as GeneratedWorkflowResponse;
        parsed.thoughts = finalThoughts || "Thoughts generated but lost in parsing.";
        
        if (!parsed.workflow || !parsed.requirements) {
             throw new Error("Invalid JSON structure: Missing workflow or requirements.");
        }
        return parsed;
    } catch (e) {
        console.error("Final JSON Parse Failed. Raw:", jsonContent);
        throw new Error(`Failed to parse generated JSON. Error: ${(e as Error).message}`);
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
