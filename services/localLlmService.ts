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
// Updated to handle mixed content (Thinking tags + JSON) and trailing text robustly
const extractContentFromText = (text: string): { json: any, thoughts?: string } => {
    let cleanText = text.trim();
    let thoughts: string | undefined;

    // 1. Extract Thoughts if present (<thinking>...</thinking>)
    // Using [\s\S]*? to match across newlines
    const thinkingMatch = cleanText.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch && thinkingMatch[1]) {
        thoughts = thinkingMatch[1].trim();
        // Remove thoughts from text to safely extract JSON later
        cleanText = cleanText.replace(thinkingMatch[0], '').trim();
    }

    // 2. Extract JSON
    let jsonContent = cleanText;
    
    // Attempt 1: Regex for code blocks (Most reliable if model follows instructions)
    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = cleanText.match(jsonBlockRegex);
    
    if (match && match[1]) {
        jsonContent = match[1].trim();
    } else {
        // Attempt 2: Robust Fallback with Balanced Brace Counting
        // This solves "Unexpected non-whitespace character after JSON" if the model adds text after the JSON.
        const firstBrace = cleanText.indexOf('{');
        if (firstBrace !== -1) {
            let balance = 0;
            let lastBrace = -1;
            let insideString = false;
            let escape = false;

            for (let i = firstBrace; i < cleanText.length; i++) {
                const char = cleanText[i];

                // Handle escapes inside strings (e.g. "{\"key\": ...}")
                if (escape) {
                    escape = false;
                    continue;
                }
                if (char === '\\') {
                    escape = true;
                    continue;
                }
                
                // Toggle string state
                if (char === '"') {
                    insideString = !insideString;
                    continue;
                }

                // Count braces only if not inside a string
                if (!insideString) {
                    if (char === '{') {
                        balance++;
                    } else if (char === '}') {
                        balance--;
                        if (balance === 0) {
                            lastBrace = i;
                            break; // Found the matching closing brace for the root object
                        }
                    }
                }
            }

            if (lastBrace !== -1) {
                jsonContent = cleanText.substring(firstBrace, lastBrace + 1);
            } else {
                // If counting failed (e.g. malformed JSON), fall back to simple substring
                // This might fail if trailing text exists, but it's a last resort.
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
        console.error("Attempted JSON content:", jsonContent);
        throw new Error(`Failed to parse JSON response: ${(e as Error).message}`);
    }
};

// Helper to check if workflow is in Graph format
function isGraphFormat(workflow: any): boolean {
    return typeof workflow === 'object' && workflow !== null && 'nodes' in workflow && 'links' in workflow;
}

// --- Main Local LLM Interaction Functions ---

async function callLocalLlmChat(apiUrl: string, model: string, messages: Array<{role: string, content: string}>): Promise<string> {
    const endpoint = new URL('/v1/chat/completions', apiUrl).toString();
    
    try {
        // We do NOT enforce response_format: { type: "json_object" } here anymore,
        // because we want the model to output free text (<thinking>) before the JSON.
        // Command-R handles this well via prompt instructions.
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
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error("Invalid response format from Local LLM.");
        }
        return data.choices[0].message.content;

    } catch (error) {
        if (error instanceof TypeError) {
             throw new Error(`Failed to connect to Local LLM at ${apiUrl}. Is it running?`);
        }
        throw error;
    }
}


export const generateWorkflowLocal = async (
    description: string, 
    localLlmApiUrl: string, 
    localLlmModel: string,
    inventory: SystemInventory | null, 
    imageName?: string,
    ragApiUrl?: string, 
    format: WorkflowFormat = 'graph',
    systemInstructionTemplate: string = SYSTEM_INSTRUCTION_TEMPLATE
): Promise<Omit<GeneratedWorkflowResponse, 'validationLog'>> => {
    if (!localLlmApiUrl) throw new Error("Ollama Generation URL is not configured.");
    if (!localLlmModel) throw new Error("Local LLM Model Name is not configured.");

    let ragContextBlock = '';
    const ragUrlToUse = ragApiUrl;
    
    if (ragUrlToUse) {
        try {
            const ragContext = await queryRag(description, ragUrlToUse, localLlmModel);
            if (ragContext && ragContext.trim()) {
                ragContextBlock = `
**RAG-KONTEXT:**
Die folgenden Informationen wurden aus einer lokalen Wissensdatenbank abgerufen, um zusätzlichen Kontext für die Anfrage des Benutzers bereitzustellen.
\`\`\`
${ragContext.trim()}
\`\`\`
`;
            }
        } catch (error) {
            console.warn("Could not query RAG endpoint for local generation, proceeding without.", error);
        }
    }

    let imageContextBlock = '';
    if (imageName) {
        imageContextBlock = `
**USER-PROVIDED IMAGE CONTEXT:**
The user has uploaded an image: \`${imageName}\`.
You MUST incorporate this image into the workflow by creating a "LoadImage" node. The "image" widget value MUST be "${imageName}".
`;
    }

    let inventoryBlock = 'No specific inventory provided. Use common, plausible model names.';
    if (inventory && Object.keys(inventory).length > 0) {
        inventoryBlock = `
\`\`\`json
${JSON.stringify(inventory, null, 2)}
\`\`\`
`;
    }

    const formatInstruction = format === 'api' ? API_FORMAT_INSTRUCTION : GRAPH_FORMAT_INSTRUCTION;

    // Use custom or default prompt
    const finalSystemInstruction = systemInstructionTemplate
        .replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock)
        .replace('{{IMAGE_CONTEXT_PLACEHOLDER}}', imageContextBlock)
        .replace('{{SYSTEM_INVENTORY_PLACEHOLDER}}', inventoryBlock)
        .replace('{{FORMAT_INSTRUCTION_PLACEHOLDER}}', formatInstruction);

    try {
        const content = await callLocalLlmChat(localLlmApiUrl, localLlmModel, [
            { role: "system", content: finalSystemInstruction },
            { role: "user", content: description }
        ]);

        const { json: parsedResponse, thoughts } = extractContentFromText(content);

        if (!parsedResponse.workflow || !parsedResponse.requirements) {
            throw new Error("Generated JSON is missing 'workflow' or 'requirements' top-level keys.");
        }

        // Inject thoughts back into response object so frontend can display them
        (parsedResponse as GeneratedWorkflowResponse).thoughts = thoughts;

        return parsedResponse as GeneratedWorkflowResponse;
    } catch (error: any) {
        console.error("Error in generateWorkflowLocal:", error);
        throw new Error(`Local LLM Generation Failed: ${error.message}`);
    }
};

export const validateAndCorrectWorkflowLocal = async (
    workflow: ComfyUIWorkflow | ComfyUIApiWorkflow, 
    localLlmApiUrl: string, 
    localLlmModel: string,
    ragApiUrl?: string
): Promise<ValidationResponse> => {
    if (!localLlmApiUrl) throw new Error("Ollama Generation URL is not configured.");
    if (!localLlmModel) throw new Error("Local LLM Model Name is not configured.");

    const isGraph = isGraphFormat(workflow);

    let ragContextBlock = '';
    const ragUrlToUse = ragApiUrl;
    
    if (ragUrlToUse) {
        try {
            const contextType = isGraph ? "Graph Format" : "API Format";
            const ragContext = await queryRag(`ComfyUI workflow validation rules (${contextType}) and node compatibility`, ragUrlToUse, localLlmModel);
            if (ragContext && ragContext.trim()) {
                ragContextBlock = `
**RAG-KNOWLEDGE BASE:**
Use the following retrieved knowledge to help validate the workflow:
\`\`\`
${ragContext.trim()}
\`\`\`
`;
            }
        } catch (error) {
            console.warn("Could not query RAG endpoint during validation (local).", error);
        }
    }

    // Select specific prompt based on format
    const basePrompt = isGraph ? SYSTEM_INSTRUCTION_VALIDATOR : SYSTEM_INSTRUCTION_API_VALIDATOR;
    const finalSystemInstruction = basePrompt.replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock);

    const workflowString = JSON.stringify(workflow, null, 2);
    
    try {
        const content = await callLocalLlmChat(localLlmApiUrl, localLlmModel, [
            { role: "system", content: finalSystemInstruction },
            { role: "user", content: `Please validate and correct this workflow (${isGraph ? 'Graph' : 'API'} format):\n\n${workflowString}` }
        ]);

        const { json: parsedResponse } = extractContentFromText(content);
        if (!parsedResponse.validationLog || !parsedResponse.correctedWorkflow) {
            throw new Error("Invalid response structure from Local Validator.");
        }
        return parsedResponse;
    } catch (error: any) {
        throw new Error(`Local LLM Validation Failed: ${error.message}`);
    }
};

export const debugAndCorrectWorkflowLocal = async (
    workflow: ComfyUIWorkflow | ComfyUIApiWorkflow, 
    errorMessage: string,
    localLlmApiUrl: string, 
    localLlmModel: string,
    ragApiUrl?: string
): Promise<DebugResponse> => {
    if (!localLlmApiUrl) throw new Error("Ollama Generation URL is not configured.");
    if (!localLlmModel) throw new Error("Local LLM Model Name is not configured.");

    const isGraph = isGraphFormat(workflow);

    let ragContextBlock = '';
    const ragUrlToUse = ragApiUrl;

    if (ragUrlToUse) {
        try {
            const ragContext = await queryRag(`ComfyUI error solution: ${errorMessage}`, ragUrlToUse, localLlmModel);
            if (ragContext && ragContext.trim()) {
                ragContextBlock = `
**RAG-KNOWLEDGE BASE (Relevant to Error):**
Use the following retrieved knowledge to help fix the error:
\`\`\`
${ragContext.trim()}
\`\`\`
`;
            }
        } catch (error) {
            console.warn("Could not query RAG endpoint during debugging (local).", error);
        }
    }

    // Select specific prompt based on format
    const basePrompt = isGraph ? SYSTEM_INSTRUCTION_DEBUGGER : SYSTEM_INSTRUCTION_API_DEBUGGER;
    const finalSystemInstruction = basePrompt.replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock);

    const requestPayload = JSON.stringify({ workflow, errorMessage }, null, 2);

    try {
        const content = await callLocalLlmChat(localLlmApiUrl, localLlmModel, [
            { role: "system", content: finalSystemInstruction },
            { role: "user", content: requestPayload }
        ]);

        const { json: parsedResponse } = extractContentFromText(content);
        if (!parsedResponse.correctionLog || !parsedResponse.correctedWorkflow) {
            throw new Error("Invalid response structure from Local Debugger.");
        }
        return parsedResponse;
    } catch (error: any) {
        throw new Error(`Local LLM Debugging Failed: ${error.message}`);
    }
};


// --- Existing Services (RAG, Ingest, etc.) ---

export const uploadRagDocument = async (file: File, apiUrl: string): Promise<{ message: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const endpoint = new URL('/v1/rag/upload', apiUrl).toString();

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(`Server error (${response.status}): ${errorData.detail}`);
        }
        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error(`Failed to connect to RAG server at ${apiUrl}.`);
        }
        throw error;
    }
};

export const queryRag = async (prompt: string, apiUrl: string, model?: string): Promise<string> => {
    try {
        const endpoint = new URL('/v1/rag/query', apiUrl).toString();
        const payload: any = { query: prompt };
        if (model) {
            payload.model = model;
        }
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(`Server error (${response.status}): ${errorData.detail}`);
        }
        const responseData = await response.json();
        return responseData.response || responseData.detail || '';
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error(`Failed to connect to RAG server at ${apiUrl}.`);
        }
        throw error;
    }
};

export const learnWorkflow = async (
    type: 'short' | 'promote', 
    prompt: string, 
    workflow: ComfyUIWorkflow | ComfyUIApiWorkflow, 
    apiUrl: string
): Promise<{ message: string }> => {
    // Construct the "Rich Description" format
    const richContent = `
--- SUCCESSFUL WORKFLOW EXECUTION ---
PROMPT: ${prompt}
WORKFLOW: ${JSON.stringify(workflow)}
`;

    // Map 'promote' to the correct endpoint path segment if necessary, or just use type directly if endpoints match.
    // Assuming endpoints are /v1/rag/learn/short and /v1/rag/learn/promote
    const endpoint = new URL(`/v1/rag/learn/${type}`, apiUrl).toString();
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: richContent,
                metadata: { source: "user-feedback", type: "workflow-success" }
            }),
        });

        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ detail: response.statusText }));
             throw new Error(`Learning API error (${response.status}): ${errorData.detail}`);
        }
        return await response.json();
    } catch (error) {
         if (error instanceof TypeError) {
            throw new Error(`Failed to connect to Learning API at ${apiUrl}.`);
        }
        throw error;
    }
};

export const startFineTuning = async (trainingData: string, apiUrl: string): Promise<{ job_id: string }> => {
    const endpoint = new URL('/v1/finetune', apiUrl).toString();
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/jsonl' },
            body: trainingData,
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(`Server error (${response.status}): ${errorData.detail}`);
        }
        return await response.json();
    } catch (error) {
         if (error instanceof TypeError) {
            throw new Error(`Failed to connect to Fine-tuning server at ${apiUrl}.`);
        }
        throw error;
    }
};

export const getServerInventory = async (apiUrl: string): Promise<SystemInventory> => {
    const endpoint = new URL('/v1/inventory', apiUrl).toString();
    try {
        const response = await fetch(endpoint, { method: 'GET' });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(`Server error (${response.status}): ${errorData.detail}`);
        }
        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error(`Failed to connect to Helper server at ${apiUrl}.`);
        }
        throw error;
    }
};

export const testLocalLlmConnection = async (apiUrl: string): Promise<{ success: boolean; message: string; }> => {
    let endpoint: string;
    try {
        endpoint = new URL('/health', apiUrl).toString();
    } catch (e) {
        return { success: false, message: `Invalid URL format: ${apiUrl}` };
    }
    try {
        const response = await fetch(endpoint);
        if (response.ok) {
             const data = await response.json().catch(() => ({}));
             return { success: true, message: data.message || 'Connection successful!' };
        }
        const errorText = await response.text();
        return { success: false, message: `Connection failed. Server responded with HTTP status ${response.status}: ${errorText}` };
    } catch (error) {
        if (error instanceof TypeError) {
            return { success: false, message: `Network error. Could not connect to ${apiUrl}.` };
        }
        return { success: false, message: `An unexpected error occurred: ${(error as Error).message}` };
    }
};

export const testRagConnection = async (apiUrl: string): Promise<{ success: boolean; message: string; }> => {
    try {
        await getServerInventory(apiUrl);
        return { success: true, message: 'Connection successful! Server is online.' };
    } catch (error: any) {
         let message = error.message || 'Connection failed';
         if (message.includes('Failed to fetch')) message += ' (Is the server running?)';
        return { success: false, message: message };
    }
};