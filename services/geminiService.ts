
import { GoogleGenAI } from "@google/genai";
import type { GeneratedWorkflowResponse, ComfyUIWorkflow, ValidationResponse, DebugResponse, SystemInventory } from '../types';
import { queryRag } from './localLlmService';
import { SYSTEM_INSTRUCTION_TEMPLATE, SYSTEM_INSTRUCTION_VALIDATOR, SYSTEM_INSTRUCTION_DEBUGGER } from './prompts';

/**
 * Waits for a specified amount of time.
 * @param ms Time to wait in milliseconds.
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executes an API operation with automatic retry logic for transient errors (like 503 Service Unavailable).
 * Implements exponential backoff.
 * 
 * @param operation The async operation to retry.
 * @param retries Maximum number of retry attempts (default: 3).
 * @param backoff Initial delay in milliseconds (default: 1000).
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
            // Determine if the error is a transient server error (500, 502, 503, 504) or a network fetch error.
            // Google GenAI SDK errors might not always have a clean 'status' property, so we check message content too.
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
                // Add a little jitter to the backoff to prevent thundering herd
                const jitter = Math.random() * 500;
                const waitTime = backoff * Math.pow(2, i) + jitter;
                
                console.warn(`Gemini API Transient Error (${error.status || error.message}). Retrying in ${Math.round(waitTime)}ms... (Attempt ${i + 1}/${retries})`);
                await wait(waitTime);
                continue;
            }
            
            // If not retryable or max retries reached, re-throw
            throw error;
        }
    }
    throw new Error("Max retries exceeded");
}


export const generateWorkflow = async (description: string, ragApiUrl: string, inventory: SystemInventory | null, imageName?: string, localLlmModel?: string): Promise<Omit<GeneratedWorkflowResponse, 'validationLog'>> => {
  if (!process.env.API_KEY) {
    throw new Error("API key is missing. Please set the API_KEY environment variable.");
  }

  let ragContextBlock = '';
  // Explicitly check for ragApiUrl. We should not fall back to localLlmApiUrl for RAG queries inside the service.
  if (ragApiUrl) {
      try {
          const ragContext = await queryRag(description, ragApiUrl, localLlmModel);
          if (ragContext && ragContext.trim()) {
              ragContextBlock = `
**RAG-KONTEXT:**
Die folgenden Informationen wurden aus einer lokalen Wissensdatenbank abgerufen, um zusätzlichen Kontext für die Anfrage des Benutzers bereitzustellen. Verwenden Sie diese Informationen, um einen genaueren und relevanteren Workflow zu generieren.
\`\`\`
${ragContext.trim()}
\`\`\`
`;
          }
      } catch (error) {
          console.warn("Could not query RAG endpoint, proceeding without RAG context.", error);
          // Non-fatal, just log and continue.
      }
  }

  let imageContextBlock = '';
  if (imageName) {
      imageContextBlock = `
**USER-PROVIDED IMAGE CONTEXT:**
The user has uploaded an image that is now available on the ComfyUI server.
- Filename: \`${imageName}\`
You MUST incorporate this image into the workflow by creating a "LoadImage" node. The "image" widget value for this node MUST be set to exactly "${imageName}".
This "LoadImage" node should be the starting point for any image-to-image, inpainting, or ControlNet process described in the user's prompt.
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
    
  const finalSystemInstruction = SYSTEM_INSTRUCTION_TEMPLATE
    .replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock)
    .replace('{{IMAGE_CONTEXT_PLACEHOLDER}}', imageContextBlock)
    .replace('{{SYSTEM_INVENTORY_PLACEHOLDER}}', inventoryBlock);


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
    
    // Clean potential markdown fences.
    if (rawResponseText.startsWith('```json')) {
      rawResponseText = rawResponseText.substring(7, rawResponseText.length - 3).trim();
    }
    
    // The response should be a clean JSON string, ready to parse.
    const parsedResponse = JSON.parse(rawResponseText) as GeneratedWorkflowResponse & { error?: string };
    
    // Check for model-generated error message.
    if (parsedResponse.error) {
        throw new Error(`The model could not generate a workflow: ${parsedResponse.error}`);
    }

    // New, more robust validation.
    if (!parsedResponse.workflow || !parsedResponse.requirements) {
        console.error("Invalid response structure received from AI:", parsedResponse);
        throw new Error("Generated JSON is missing 'workflow' or 'requirements' top-level keys.");
    }

    const { workflow, requirements } = parsedResponse;

    if (!workflow.nodes || !workflow.links || typeof workflow.last_node_id === 'undefined') {
        console.error("Invalid workflow structure received from AI:", workflow);
        throw new Error("Generated JSON is not a valid ComfyUI workflow. It's missing essential properties like 'nodes', 'links', or 'last_node_id'.");
    }
    
    if (!requirements || !Array.isArray(requirements.custom_nodes) || !Array.isArray(requirements.models)) {
        console.error("Invalid requirements structure received from AI:", requirements);
        throw new Error("Generated JSON has an invalid 'requirements' structure.");
    }
    
    return parsedResponse;
  } catch (error) {
    console.error("Error in generateWorkflow:", error);
    if (error instanceof SyntaxError) {
      console.error("Malformed JSON received from AI:", rawResponseText);
      throw new Error("Failed to parse the AI's response as valid JSON. The model may have returned a malformed output.");
    }
    // If it's one of our custom errors or an error from the model, just re-throw it.
    if (error instanceof Error) {
        throw error;
    }
    // Fallback for other unexpected errors.
    throw new Error("An unknown error occurred while communicating with the AI.");
  }
};

export const validateAndCorrectWorkflow = async (workflow: ComfyUIWorkflow, ragApiUrl?: string, localLlmModel?: string): Promise<ValidationResponse> => {
    if (!process.env.API_KEY) {
        throw new Error("API key is missing. Please set the API_KEY environment variable.");
    }

    // 1. Fetch RAG Context if API URL is present
    let ragContextBlock = '';
    if (ragApiUrl) {
        try {
            // For validation, we ask RAG about common validation rules or known issues with nodes
            const ragContext = await queryRag("ComfyUI workflow validation rules and node compatibility common errors", ragApiUrl, localLlmModel);
            if (ragContext && ragContext.trim()) {
                ragContextBlock = `
**RAG-KNOWLEDGE BASE:**
Use the following retrieved knowledge to help validate the workflow and check for specific node requirements or known issues:
\`\`\`
${ragContext.trim()}
\`\`\`
`;
            }
        } catch (error) {
            console.warn("Could not query RAG endpoint during validation.", error);
        }
    }

    const finalSystemInstruction = SYSTEM_INSTRUCTION_VALIDATOR.replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const workflowString = JSON.stringify(workflow, null, 2);
    let rawResponseText = '';

    try {
        const response = await callWithRetry(async () => {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Please validate and correct the following ComfyUI workflow:\n\n${workflowString}`,
                config: {
                    systemInstruction: finalSystemInstruction,
                    responseMimeType: "application/json",
                }
            });
        });
        
        rawResponseText = response.text.trim();
        const parsedResponse = JSON.parse(rawResponseText) as ValidationResponse;

        if (!parsedResponse.validationLog || !parsedResponse.correctedWorkflow) {
             console.error("Invalid response structure received from Validator AI:", parsedResponse);
            throw new Error("Validator AI returned a malformed response. It's missing 'validationLog' or 'correctedWorkflow'.");
        }

        if (!Array.isArray(parsedResponse.validationLog)) {
             console.error("Invalid validationLog structure:", parsedResponse.validationLog);
            throw new Error("Validator AI returned an invalid 'validationLog' structure. It must be an array.");
        }

        if (!parsedResponse.correctedWorkflow.nodes) {
             console.error("Invalid correctedWorkflow structure:", parsedResponse.correctedWorkflow);
            throw new Error("Validator AI returned an invalid 'correctedWorkflow' object.");
        }

        return parsedResponse;

    } catch (error) {
        console.error("Error in validateAndCorrectWorkflow:", error);
        if (error instanceof SyntaxError) {
          console.error("Malformed JSON received from Validator AI:", rawResponseText);
          throw new Error("Failed to parse the Validator AI's response as valid JSON.");
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred while communicating with the Validator AI.");
    }
};

export const debugAndCorrectWorkflow = async (workflow: ComfyUIWorkflow, errorMessage: string, ragApiUrl?: string, localLlmModel?: string): Promise<DebugResponse> => {
    if (!process.env.API_KEY) {
        throw new Error("API key is missing. Please set the API_KEY environment variable.");
    }

    // 1. Fetch RAG Context using the Error Message
    let ragContextBlock = '';
    if (ragApiUrl) {
        try {
            // For debugging, the error message is the perfect query for the RAG
            const ragContext = await queryRag(`ComfyUI error solution: ${errorMessage}`, ragApiUrl, localLlmModel);
            if (ragContext && ragContext.trim()) {
                ragContextBlock = `
**RAG-KNOWLEDGE BASE (Relevant to Error):**
Use the following retrieved knowledge to identify the cause of the error and find a solution:
\`\`\`
${ragContext.trim()}
\`\`\`
`;
            }
        } catch (error) {
            console.warn("Could not query RAG endpoint during debugging.", error);
        }
    }

    const finalSystemInstruction = SYSTEM_INSTRUCTION_DEBUGGER.replace('{{RAG_CONTEXT_PLACEHOLDER}}', ragContextBlock);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const requestPayload = {
        workflow,
        errorMessage,
    };
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
             console.error("Invalid response structure received from Debugger AI:", parsedResponse);
            throw new Error("Debugger AI returned a malformed response. It's missing 'correctionLog' or 'correctedWorkflow'.");
        }
        
        return parsedResponse;

    } catch (error) {
        console.error("Error in debugAndCorrectWorkflow:", error);
        if (error instanceof SyntaxError) {
          console.error("Malformed JSON received from Debugger AI:", rawResponseText);
          throw new Error("Failed to parse the Debugger AI's response as valid JSON.");
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred while communicating with the Debugger AI.");
    }
};
