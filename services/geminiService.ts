import { GoogleGenAI } from "@google/genai";
import type { GeneratedWorkflowResponse, ComfyUIWorkflow, ComfyUIApiWorkflow, ValidationResponse, DebugResponse, SystemInventory, WorkflowFormat } from '../types';
import { queryRag } from './localLlmService';
import { 
    SYSTEM_INSTRUCTION_TEMPLATE, 
    SYSTEM_INSTRUCTION_VALIDATOR, 
    SYSTEM_INSTRUCTION_API_VALIDATOR,
    SYSTEM_INSTRUCTION_DEBUGGER, 
    SYSTEM_INSTRUCTION_API_DEBUGGER,
    GRAPH_FORMAT_INSTRUCTION, 
    API_FORMAT_INSTRUCTION 
} from './prompts';

/**
 * Waits for a specified amount of time.
 * @param ms Time to wait in milliseconds.
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executes an API operation with automatic retry logic for transient errors.
 */
async function callWithRetry<T>(
    operation: () => Promise<T>, 
    retries: number = 3, 
    backoff: number = 1000
): Promise<T> {
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            const isRetryable = 
                error.status === 503 || 
                error.status === 502 || 
                error.status === 504 || 
                error.status === 500 ||
                (error.message && (
                    error.message.includes('fetch failed') || 
                    error.message.includes('overloaded') ||
                    error.message.includes('Service Unavailable') ||
                    error.message.includes('Internal Server Error')
                ));

            if (isRetryable && i < retries - 1) {
                const jitter = Math.random() * 500;
                const waitTime = backoff * Math.pow(2, i) + jitter;
                console.warn(`Gemini API Transient Error (${error.status || error.message}). Retrying in ${Math.round(waitTime)}ms... (Attempt ${i + 1}/${retries})`);
                await wait(waitTime);
                continue;
            }
            throw error;
        }
    }
    throw new Error("Max retries exceeded");
}

// Helper to check if workflow is in Graph format
function isGraphFormat(workflow: any): boolean {
    return typeof workflow === 'object' && workflow !== null && 'nodes' in workflow && 'links' in workflow;
}

export const generateWorkflow = async (
    description: string, 
    ragApiUrl: string, 
    inventory: SystemInventory | null, 
    imageName?: string, 
    localLlmModel?: string, 
    format: WorkflowFormat = 'graph',
    systemInstructionTemplate: string = SYSTEM_INSTRUCTION_TEMPLATE
): Promise<Omit<GeneratedWorkflowResponse, 'validationLog'>> => {
  if (!process.env.API_KEY) {
    throw new Error("API key is missing. Please set the API_KEY environment variable.");
  }

  let ragContextBlock = '';
  if (ragApiUrl) {
      try {
          const ragContext = await queryRag(description, ragApiUrl, localLlmModel);
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
          console.warn("Could not query RAG endpoint, proceeding without RAG context.", error);
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
    
  // Use the provided template (custom or default) and inject placeholders
  const finalSystemInstruction = systemInstructionTemplate
    .replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock)
    .replace('{{IMAGE_CONTEXT_PLACEHOLDER}}', imageContextBlock)
    .replace('{{SYSTEM_INVENTORY_PLACEHOLDER}}', inventoryBlock)
    .replace('{{FORMAT_INSTRUCTION_PLACEHOLDER}}', formatInstruction);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  let rawResponseText = '';
  try {
    const response = await callWithRetry(async () => {
        return await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: description,
            config: {
                systemInstruction: finalSystemInstruction,
                responseMimeType: "application/json",
            }
        });
    });

    rawResponseText = response.text.trim();
    if (rawResponseText.startsWith('```json')) {
      rawResponseText = rawResponseText.substring(7, rawResponseText.length - 3).trim();
    }
    
    const parsedResponse = JSON.parse(rawResponseText) as GeneratedWorkflowResponse & { error?: string };
    
    if (parsedResponse.error) {
        throw new Error(`The model could not generate a workflow: ${parsedResponse.error}`);
    }

    if (!parsedResponse.workflow || !parsedResponse.requirements) {
        throw new Error("Generated JSON is missing 'workflow' or 'requirements' top-level keys.");
    }

    if (format === 'graph') {
        const wf = parsedResponse.workflow as ComfyUIWorkflow;
        if (!wf.nodes || !wf.links) {
            throw new Error("Generated JSON is not a valid ComfyUI workflow (Graph format).");
        }
    }
    
    return parsedResponse;
  } catch (error) {
    console.error("Error in generateWorkflow:", error);
    if (error instanceof SyntaxError) {
      console.error("Malformed JSON:", rawResponseText);
      throw new Error("Failed to parse the AI's response as valid JSON.");
    }
    if (error instanceof Error) throw error;
    throw new Error("An unknown error occurred.");
  }
};

export const validateAndCorrectWorkflow = async (workflow: ComfyUIWorkflow | ComfyUIApiWorkflow, ragApiUrl?: string, localLlmModel?: string): Promise<ValidationResponse> => {
    if (!process.env.API_KEY) {
        throw new Error("API key is missing.");
    }

    const isGraph = isGraphFormat(workflow);
    
    // 1. Fetch RAG Context
    let ragContextBlock = '';
    if (ragApiUrl) {
        try {
            const contextType = isGraph ? "Graph Format" : "API Format";
            const ragContext = await queryRag(`ComfyUI workflow validation rules (${contextType}) and node compatibility`, ragApiUrl, localLlmModel);
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
            console.warn("Could not query RAG endpoint during validation.", error);
        }
    }

    // Select specific prompt based on format
    const basePrompt = isGraph ? SYSTEM_INSTRUCTION_VALIDATOR : SYSTEM_INSTRUCTION_API_VALIDATOR;
    const finalSystemInstruction = basePrompt.replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const workflowString = JSON.stringify(workflow, null, 2);
    let rawResponseText = '';

    try {
        const response = await callWithRetry(async () => {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Please validate and correct the following ComfyUI workflow (${isGraph ? 'Graph' : 'API'} format):\n\n${workflowString}`,
                config: {
                    systemInstruction: finalSystemInstruction,
                    responseMimeType: "application/json",
                }
            });
        });
        
        rawResponseText = response.text.trim();
        const parsedResponse = JSON.parse(rawResponseText) as ValidationResponse;

        if (!parsedResponse.validationLog || !parsedResponse.correctedWorkflow) {
            throw new Error("Validator AI returned a malformed response.");
        }

        return parsedResponse;

    } catch (error) {
        console.error("Error in validateAndCorrectWorkflow:", error);
        if (error instanceof SyntaxError) {
          throw new Error("Failed to parse the Validator AI's response as valid JSON.");
        }
        if (error instanceof Error) throw error;
        throw new Error("An unknown error occurred.");
    }
};

export const debugAndCorrectWorkflow = async (workflow: ComfyUIWorkflow | ComfyUIApiWorkflow, errorMessage: string, ragApiUrl?: string, localLlmModel?: string): Promise<DebugResponse> => {
    if (!process.env.API_KEY) {
        throw new Error("API key is missing.");
    }

    const isGraph = isGraphFormat(workflow);

    // 1. Fetch RAG Context
    let ragContextBlock = '';
    if (ragApiUrl) {
        try {
            const ragContext = await queryRag(`ComfyUI error solution: ${errorMessage}`, ragApiUrl, localLlmModel);
            if (ragContext && ragContext.trim()) {
                ragContextBlock = `
**RAG-KNOWLEDGE BASE:**
Use the following retrieved knowledge to help fix the error:
\`\`\`
${ragContext.trim()}
\`\`\`
`;
            }
        } catch (error) {
            console.warn("Could not query RAG endpoint during debugging.", error);
        }
    }

    // Select specific prompt based on format
    const basePrompt = isGraph ? SYSTEM_INSTRUCTION_DEBUGGER : SYSTEM_INSTRUCTION_API_DEBUGGER;
    const finalSystemInstruction = basePrompt.replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const requestPayload = { workflow, errorMessage };
    const payloadString = JSON.stringify(requestPayload, null, 2);
    let rawResponseText = '';

    try {
        const response = await callWithRetry(async () => {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: payloadString,
                config: {
                    systemInstruction: finalSystemInstruction,
                    responseMimeType: "application/json",
                }
            });
        });
        
        rawResponseText = response.text.trim();
        const parsedResponse = JSON.parse(rawResponseText) as DebugResponse;

        if (!parsedResponse.correctionLog || !parsedResponse.correctedWorkflow) {
            throw new Error("Debugger AI returned a malformed response.");
        }
        
        return parsedResponse;

    } catch (error) {
        console.error("Error in debugAndCorrectWorkflow:", error);
        if (error instanceof SyntaxError) {
          throw new Error("Failed to parse the Debugger AI's response as valid JSON.");
        }
        if (error instanceof Error) throw error;
        throw new Error("An unknown error occurred.");
    }
};
