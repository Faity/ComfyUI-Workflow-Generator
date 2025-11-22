
import type { SystemInventory, GeneratedWorkflowResponse, ComfyUIWorkflow, ValidationResponse, DebugResponse } from '../types';
import { SYSTEM_INSTRUCTION_TEMPLATE, SYSTEM_INSTRUCTION_VALIDATOR, SYSTEM_INSTRUCTION_DEBUGGER } from './prompts';

// --- Helper to extract JSON from LLM text response ---
const extractJsonFromText = (text: string): any => {
    let cleanText = text.trim();
    // Attempt to find JSON code block
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
    const match = cleanText.match(jsonBlockRegex);
    if (match && match[1]) {
        cleanText = match[1].trim();
    } else {
        // If no code block, try to find the first '{' and last '}'
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        }
    }
    return JSON.parse(cleanText);
};


// --- Main Local LLM Interaction Functions ---

/**
 * Generic function to call an OpenAI-compatible Chat Completion API (e.g., Ollama).
 */
async function callLocalLlmChat(apiUrl: string, model: string, messages: Array<{role: string, content: string}>): Promise<string> {
    const endpoint = new URL('/v1/chat/completions', apiUrl).toString();
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.2, // Low temp for code generation
                stream: false,
                response_format: { type: "json_object" } // Hint for JSON output if supported
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
    localLlmApiUrl: string, // Generation URL (Ollama)
    localLlmModel: string,
    inventory: SystemInventory | null, 
    imageName?: string,
    ragApiUrl?: string // RAG/Helper URL
): Promise<Omit<GeneratedWorkflowResponse, 'validationLog'>> => {
    if (!localLlmApiUrl) throw new Error("Ollama Generation URL is not configured.");
    if (!localLlmModel) throw new Error("Local LLM Model Name is not configured.");

    // 1. RAG Context Retrieval (Using ragApiUrl if available)
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

    // 2. Image Context
    let imageContextBlock = '';
    if (imageName) {
        imageContextBlock = `
**USER-PROVIDED IMAGE CONTEXT:**
The user has uploaded an image: \`${imageName}\`.
You MUST incorporate this image into the workflow by creating a "LoadImage" node. The "image" widget value MUST be "${imageName}".
`;
    }

    // 3. Inventory Context
    let inventoryBlock = 'No specific inventory provided. Use common, plausible model names.';
    if (inventory && Object.keys(inventory).length > 0) {
        inventoryBlock = `
\`\`\`json
${JSON.stringify(inventory, null, 2)}
\`\`\`
`;
    }

    // 4. Construct System Instruction
    const finalSystemInstruction = SYSTEM_INSTRUCTION_TEMPLATE
        .replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock)
        .replace('{{IMAGE_CONTEXT_PLACEHOLDER}}', imageContextBlock)
        .replace('{{SYSTEM_INVENTORY_PLACEHOLDER}}', inventoryBlock);

    // 5. Call Local LLM (Using Generation URL)
    try {
        const content = await callLocalLlmChat(localLlmApiUrl, localLlmModel, [
            { role: "system", content: finalSystemInstruction },
            { role: "user", content: description }
        ]);

        // 6. Parse JSON
        const parsedResponse = extractJsonFromText(content) as GeneratedWorkflowResponse;

        // 7. Validate Structure
        if (!parsedResponse.workflow || !parsedResponse.requirements) {
            throw new Error("Generated JSON is missing 'workflow' or 'requirements' top-level keys.");
        }

        return parsedResponse;
    } catch (error: any) {
        console.error("Error in generateWorkflowLocal:", error);
        throw new Error(`Local LLM Generation Failed: ${error.message}`);
    }
};

export const validateAndCorrectWorkflowLocal = async (
    workflow: ComfyUIWorkflow, 
    localLlmApiUrl: string, // Generation URL (Ollama)
    localLlmModel: string,
    ragApiUrl?: string // RAG/Helper URL
): Promise<ValidationResponse> => {
    if (!localLlmApiUrl) throw new Error("Ollama Generation URL is not configured.");
    if (!localLlmModel) throw new Error("Local LLM Model Name is not configured.");

    // 1. Retrieve RAG Context for Validation
    let ragContextBlock = '';
    const ragUrlToUse = ragApiUrl;
    
    if (ragUrlToUse) {
        try {
            const ragContext = await queryRag("ComfyUI workflow validation rules and node compatibility common errors", ragUrlToUse, localLlmModel);
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

    const finalSystemInstruction = SYSTEM_INSTRUCTION_VALIDATOR.replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock);

    const workflowString = JSON.stringify(workflow, null, 2);
    
    try {
        const content = await callLocalLlmChat(localLlmApiUrl, localLlmModel, [
            { role: "system", content: finalSystemInstruction },
            { role: "user", content: `Please validate and correct this workflow:\n\n${workflowString}` }
        ]);

        const parsedResponse = extractJsonFromText(content) as ValidationResponse;
        if (!parsedResponse.validationLog || !parsedResponse.correctedWorkflow) {
            throw new Error("Invalid response structure from Local Validator.");
        }
        return parsedResponse;
    } catch (error: any) {
        throw new Error(`Local LLM Validation Failed: ${error.message}`);
    }
};

export const debugAndCorrectWorkflowLocal = async (
    workflow: ComfyUIWorkflow, 
    errorMessage: string,
    localLlmApiUrl: string, // Generation URL (Ollama)
    localLlmModel: string,
    ragApiUrl?: string // RAG/Helper URL
): Promise<DebugResponse> => {
    if (!localLlmApiUrl) throw new Error("Ollama Generation URL is not configured.");
    if (!localLlmModel) throw new Error("Local LLM Model Name is not configured.");

    // 1. Retrieve RAG Context based on Error Message
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

    const finalSystemInstruction = SYSTEM_INSTRUCTION_DEBUGGER.replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock);

    const requestPayload = JSON.stringify({ workflow, errorMessage }, null, 2);

    try {
        const content = await callLocalLlmChat(localLlmApiUrl, localLlmModel, [
            { role: "system", content: finalSystemInstruction },
            { role: "user", content: requestPayload }
        ]);

        const parsedResponse = extractJsonFromText(content) as DebugResponse;
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

    // Uses standard Custom RAG API endpoint
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
        if (error instanceof TypeError) { // Network error
            throw new Error(`Failed to connect to RAG server at ${apiUrl}.`);
        }
        throw error;
    }
};

export const queryRag = async (prompt: string, apiUrl: string, model?: string): Promise<string> => {
    try {
        // Uses standard Custom RAG API endpoint
        const endpoint = new URL('/v1/rag/query', apiUrl).toString();
        const payload: any = { query: prompt };
        
        // Include model in payload if provided (the backend uses this to pick which model generates the embedding or answer)
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
        // Expects { "response": "..." }
        return responseData.response || responseData.detail || '';
        
    } catch (error) {
        if (error instanceof TypeError) { // Network error
            throw new Error(`Failed to connect to RAG server at ${apiUrl}.`);
        }
        throw error;
    }
};

export const startFineTuning = async (trainingData: string, apiUrl: string): Promise<{ job_id: string }> => {
    const endpoint = new URL('/v1/finetune', apiUrl).toString();

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/jsonl', // Assuming the server expects jsonl as content type
            },
            body: trainingData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(`Server error (${response.status}): ${errorData.detail}`);
        }
        
        return await response.json();
    } catch (error) {
         if (error instanceof TypeError) { // Network error
            throw new Error(`Failed to connect to Fine-tuning server at ${apiUrl}.`);
        }
        throw error;
    }
};

export const getServerInventory = async (apiUrl: string): Promise<SystemInventory> => {
    const endpoint = new URL('/v1/inventory', apiUrl).toString();

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(`Server error (${response.status}): ${errorData.detail}`);
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) { // Network error
            throw new Error(`Failed to connect to Helper server at ${apiUrl}.`);
        }
        throw error;
    }
};

export const testLocalLlmConnection = async (apiUrl: string): Promise<{ success: boolean; message: string; }> => {
    let endpoint: string;
    try {
        // A common health check endpoint. Note: Raw Ollama uses root '/', but many APIs use /health.
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
            return { 
                success: false, 
                message: `Network error. Could not connect to ${apiUrl}. Please check if the server is running and CORS is enabled.`
            };
        }
        return { 
            success: false, 
            message: `An unexpected error occurred: ${(error as Error).message}`
        };
    }
};

export const testRagConnection = async (apiUrl: string): Promise<{ success: boolean; message: string; }> => {
    try {
        // We use the inventory endpoint as a health check because we know it exists on the RAG server
        await getServerInventory(apiUrl);
        return { success: true, message: 'Connection successful! Server is online.' };
    } catch (error: any) {
         let message = error.message || 'Connection failed';
         if (message.includes('Failed to fetch')) {
             message += ' (Is the server running?)';
         }
        return { success: false, message: message };
    }
};
