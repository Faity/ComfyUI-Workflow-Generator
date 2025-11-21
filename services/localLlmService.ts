import type { SystemInventory, GeneratedWorkflowResponse, ComfyUIWorkflow, ValidationResponse, DebugResponse } from '../types';
import type { RagProvider } from '../App';

// --- System Instructions (Mirrored from geminiService.ts to ensure consistency without circular dependencies) ---
const SYSTEM_INSTRUCTION_TEMPLATE = `You are an expert assistant specializing in ComfyUI, a node-based graphical user interface for Stable Diffusion.
 Your sole purpose is to generate a complete and valid ComfyUI workflow in JSON format based on a user's request.
 The user will communicate in German.
 
{{RAG_CONTEXT_PLACEHOLDER}}
{{IMAGE_CONTEXT_PLACEHOLDER}}
**IMPORTANT SYSTEM CONTEXT:**
You MUST generate a workflow that is compatible with the following system configuration and available models.
 This means you should:
 1.  Consider the GPU VRAM limitations.
 2.  When a model is needed (e.g., a checkpoint, LoRA, VAE), you MUST use a model filename from the provided 'AVAILABLE SYSTEM INVENTORY' list. Do not invent filenames.
 
**AVAILABLE SYSTEM INVENTORY:**
This is the inventory of models available on the local system. You MUST use model filenames from this list when building the workflow.
{{SYSTEM_INVENTORY_PLACEHOLDER}}

**QUALITY ASSURANCE & RFC COMPLIANCE:**
Before providing the final JSON, you MUST internally simulate and validate the workflow to ensure its logical and structural integrity.
 This is the most critical requirement.
 1.  **Phase 1: Structural & Schema Validation:**
    * The final workflow JSON must be syntactically correct.
 * It must strictly adhere to and validate against the latest known Zod schema for ComfyUI, ensuring all fields exist and have the correct data types (e.g., node IDs are numbers, seeds are integers not strings).
 2.  **Phase 2: Graph & Connectivity Validation:**
    * **Consistency:** The main \`links\` array is the source of truth.
 The \`links\` properties within each node's \`inputs\` and \`outputs\` arrays must be a perfect reflection of the main \`links\` array.
 * **Complete Connectivity:** Every required input on every node MUST be connected.
 There can be no missing links for mandatory inputs (e.g., a KSampler's 'model', 'positive', 'negative', and 'latent_image' inputs).
 * **Type Compatibility:** For every link, the output slot type MUST match the input slot type (e.g., 'MODEL' to 'MODEL', 'LATENT' to 'LATENT').
 * **No Orphans:** The workflow MUST have a clear, uninterrupted path from a starting node (e.g., a loader) to an ending node (e.g., SaveImage).
 
    **Definition des Link-Formats (WICHTIG):**
    Jede Verbindung zwischen Nodes MUSS im globalen \`links\`-Array definiert werden. Jedes Element im \`links\`-Array ist selbst ein Array (ein Tupel) mit exakt 6 Elementen:

    \`[link_id, source_node_id, source_slot_index, target_node_id, target_slot_index, "SLOT_TYPE"]\`

    * \`link_id\`: (Nummer) Eindeutige ID für diesen Link (muss global eindeutig sein).
    * \`source_node_id\`: (Nummer) Die \`id\` des Nodes, von dem der Link *ausgeht*.
    * \`source_slot_index\`: (Nummer) Der Index des *Ausgabe*-Slots am Quell-Node (beginnend bei 0).
    * \`target_node_id\`: (Nummer) Die \`id\` des Nodes, an dem der Link *ankommt*.
    * \`target_slot_index\`: (Nummer) Der Index des *Eingabe*-Slots am Ziel-Node (beginnend bei 0).
    * \`"SLOT_TYPE"\`: (String) Der Datentyp der Verbindung (z.B. "MODEL", "LATENT", "VAE", "IMAGE", "CONDITIONING").

    **Du MUSST** dieses Format strikt einhalten und sicherstellen, dass alle obligatorischen Inputs durch einen Eintrag in diesem \`links\`-Array verbunden sind. Der \`last_link_id\`-Wert im Workflow-Stamm muss der höchsten verwendeten \`link_id\` entsprechen.

3.  **Phase 3: Semantic & Logical Validation:**
    * **Plausibility:** Check key widget values.
 For example, a KSampler's \`cfg\` value must be greater than 1.0 (a value of 0 is an error).
 Sampler and scheduler names must be valid. Latent image dimensions should be divisible by 8.
    * **RFC Adherence:** The workflow must comply with the standards in the official ComfyUI RFCs.

**WICHTIGE SCHEMA-REGELN FÜR ALLE COMFYUI-WORKFLOWS:**

Du musst bei JEDEM ComfyUI-Workflow, den du im JSON-Format erstellst, die folgenden, strikten Regeln befolgen:

REGEL 1 (Struktur): Das inputs-Feld eines jeden Knotens muss IMMER ein Array ([]) sein, niemals ein Objekt ({}).
KORREKT: "inputs": []
FALSCH: "inputs": {}

REGEL 2 (KSampler Sampler-Namen): Im widgets_values-Array eines KSampler-Knotens muss der Wert für sampler_name (Position 5) IMMER kleingeschrieben sein.
KORREKT: "euler", "dpmpp_2m", "euler_ancestral"
FALSCH: "Euler", "DPM++ 2M", "Euler Ancestral"

REGEL 3 (KSampler Denoise-Wert): Im widgets_values-Array eines KSampler-Knotens muss der Wert für denoise (Position 7) IMMER eine Fließkommazahl (ein Float) sein, typischerweise 1.0.
KORREKT: 1.0 (als Zahl, ohne Anführungszeichen)
FALSCH: "disable", "1.0", "default" (als String, mit Anführungszeichen)

REGEL 4 (KSampler widgets_values-Struktur): Das widgets_values-Array für einen Standard-KSampler muss exakt 7 Elemente in dieser Reihenfolge und mit diesen Datentypen enthalten:
1. seed: (Zahl, z.B. 12345)
2. control_after_generation: (String, z.B. "randomize")
3. steps: (Zahl, z.B. 20)
4. cfg: (Zahl, z.B. 8.0)
5. sampler_name: (String, kleingeschrieben, z.B. "euler")
6. scheduler: (String, kleingeschrieben, z.B. "normal")
7. denoise: (Zahl, z.B. 1.0)
Ein Array mit 6 oder 8 Elementen ist falsch. Die Reihenfolge muss exakt eingehalten werden.

REGEL 5 (Dateipfad für SaveImage): Im widgets_values-Array eines SaveImage-Knotens (oder eines ähnlichen Bildspeicher-Knotens) ist der erste Wert (Position 0) der Dateiname-Präfix. Dieser Wert MUSS NUR der Präfix sein (z.B. "ComfyUI_"). Er darf unter KEINEN Umständen einen Ordnerpfad enthalten (KEINE "/" oder "\"). ComfyUI speichert die Datei automatisch in seinem Standard-Ausgabeverzeichnis.
KORREKT: "ComfyUI_"
FALSCH: "output/ComfyUI_", "/temp/images/", "C:\\\\Bilder\\\\"

Halte dich bei JEDER Generierung strikt an diese Regeln.

**RESPONSE FORMAT:**
Your response MUST be ONLY a single, raw, valid JSON object that can be directly parsed.
 Do NOT include any explanatory text, comments, or markdown code fences like \`\`\`json.
 This JSON object MUST have two top-level keys: "workflow" and "requirements".
 1.  **"workflow"**: This key must contain the complete ComfyUI workflow JSON object, with all the standard keys ("last_node_id", "nodes", etc.).
 2.  **"requirements"**: This key must contain an object detailing the necessary components for the workflow to run.
 It should have two keys: "custom_nodes" and "models".
     * **"custom_nodes"**: An array of objects, where each object represents a required custom node.
 Each object MUST have the following keys:
         * \`name\`: (string) The name of the custom node (e.g., "ComfyUI-Impact-Pack").
 * \`url\`: (string | null) The GitHub link to the repository. Set to null if unknown.
 * \`install_instructions\`: (string) A string containing the exact terminal commands needed for installation inside the \`ComfyUI/custom_nodes/\` directory, separated by a newline character (\\n).
 * **"models"**: An array of objects for any specific checkpoints, LoRAs, VAEs, etc. Each object MUST have the following keys:
        * \`name\`: (string) The filename of the model (e.g., "sd_xl_base_1.0.safetensors").
 * \`url\`: (string | null) The direct download URL. Set to null if unknown.
 * \`model_type\`: (string) The type of model (e.g., "checkpoint", "vae", "lora").
 * \`install_path\`: (string | null) The relative path from the ComfyUI root directory where the model file should be placed (e.g., "models/checkpoints/", "models/loras/", or a custom node specific path like "custom_nodes/ComfyUI-AnimateDiff-Evolved/models/").
 
Example of the final JSON output structure:
\`\`\`json
{
  "workflow": { ... },
  "requirements": { ... }
}
\`\`\`
`;

const SYSTEM_INSTRUCTION_VALIDATOR = `You are a ComfyUI Workflow Analyzer and Corrector. Your task is to receive a ComfyUI workflow JSON, meticulously analyze it for correctness and logical consistency, and then return a corrected version along with a validation log.

**INPUT:**
You will be given a JSON string representing a ComfyUI workflow.

**ANALYSIS CHECKS (Perform in this order):**
1.  **Phase 1: Structural & Schema Validation:**
    *   **JSON Syntax:** Ensure the overall structure is valid JSON.
    *   **Schema & Data Types:** Validate all fields against the expected schema. Pay close attention to data types.
    *   **\`inputs\` Array Rule:** The \`inputs\` field for every node MUST be an array (\`[]\`). An empty object (\`{}\`) is a schema violation. Correct it to \`[]\`.
    *   **KSampler Rules:** Ensure sampler names are lowercase and denoise is a float (1.0).
    *   **KSampler \`widgets_values\` Structure Rule:** The \`widgets_values\` array for a standard KSampler MUST have exactly 7 elements. Verify the order and data type of each: [number, string, number, number, string, string, number]. Correct the structure if it's incorrect.
2.  **Phase 2: Graph & Connectivity Validation:**
    *   **Link Consistency:** The main \`links\` array is the single source of truth.
    *   **Required Inputs:** Verify that all mandatory inputs for each node are connected.
    *   **Type Compatibility:** Ensure the output slot type matches the input slot type for every link.
3.  **Phase 3: Semantic & Logical Validation:**
    *   **Logical Flow:** Check for a complete path from a loader to an output.
    *   **Widget Value Plausibility:** Check common widget values (e.g. CFG > 1).

**RESPONSE FORMAT:**
Your response MUST be ONLY a single, raw, valid JSON object. Do NOT include any explanatory text. The JSON object must have two top-level keys: \`validationLog\` and \`correctedWorkflow\`.
`;

const SYSTEM_INSTRUCTION_DEBUGGER = `You are an expert ComfyUI debugger. Your task is to analyze a given ComfyUI workflow and a specific error message produced by it, then correct the workflow to fix the error.

**INPUT:**
You will be given a JSON string containing two keys: "workflow" and "errorMessage".

**TASK:**
1.  **Analyze the Error:** Identify the core issue (missing inputs, type mismatch, schema violations, etc.).
2.  **Locate the Problem:** Examine the \`workflow\` JSON.
3.  **Correct the Workflow:** Modify the workflow JSON to resolve the error.

**RESPONSE FORMAT:**
Your response MUST be ONLY a single, raw, valid JSON object. Do NOT include any explanatory text. The JSON object must have two top-level keys: \`correctionLog\` and \`correctedWorkflow\`.
`;

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
    localLlmApiUrl: string, 
    localLlmModel: string,
    inventory: SystemInventory | null, 
    imageName?: string, 
    ragProvider: RagProvider = 'default'
): Promise<Omit<GeneratedWorkflowResponse, 'validationLog'>> => {
    if (!localLlmApiUrl) throw new Error("Local LLM API URL is not configured.");
    if (!localLlmModel) throw new Error("Local LLM Model Name is not configured.");

    // 1. RAG Context Retrieval (same logic as geminiService)
    let ragContextBlock = '';
    try {
        const ragContext = await queryRag(description, localLlmApiUrl, ragProvider);
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

    // 5. Call Local LLM
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
    localLlmApiUrl: string,
    localLlmModel: string
): Promise<ValidationResponse> => {
    if (!localLlmApiUrl) throw new Error("Local LLM API URL is not configured.");
    if (!localLlmModel) throw new Error("Local LLM Model Name is not configured.");

    const workflowString = JSON.stringify(workflow, null, 2);
    
    try {
        const content = await callLocalLlmChat(localLlmApiUrl, localLlmModel, [
            { role: "system", content: SYSTEM_INSTRUCTION_VALIDATOR },
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
    localLlmApiUrl: string,
    localLlmModel: string
): Promise<DebugResponse> => {
    if (!localLlmApiUrl) throw new Error("Local LLM API URL is not configured.");
    if (!localLlmModel) throw new Error("Local LLM Model Name is not configured.");

    const requestPayload = JSON.stringify({ workflow, errorMessage }, null, 2);

    try {
        const content = await callLocalLlmChat(localLlmApiUrl, localLlmModel, [
            { role: "system", content: SYSTEM_INSTRUCTION_DEBUGGER },
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

export const uploadRagDocument = async (file: File, apiUrl: string, provider: RagProvider): Promise<{ message: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const endpoint = new URL(provider === 'privateGPT' ? '/v1/ingest' : '/v1/rag/upload', apiUrl).toString();

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(`Server error (${response.status}): ${errorData.detail}`);
        }

        const responseData = await response.json();

        if (provider === 'privateGPT') {
            const count = Array.isArray(responseData.data) ? responseData.data.length : 0;
            return { message: `Successfully ingested ${count} document(s).` };
        }

        return responseData;

    } catch (error) {
        if (error instanceof TypeError) { // Network error
            throw new Error(`Failed to connect to local LLM at ${apiUrl}.`);
        }
        throw error;
    }
};

export const queryRag = async (prompt: string, apiUrl: string, provider: RagProvider): Promise<string> => {
    try {
        if (provider === 'privateGPT') {
            const endpoint = new URL('/v1/chat/completions', apiUrl).toString();
            const payload = {
                model: "local-model",
                messages: [{ role: "user", content: prompt }],
                use_context: true,
                include_sources: false,
            };
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
            return responseData.choices?.[0]?.message?.content || '';

        } else { // Default provider
            const endpoint = new URL('/v1/rag/query', apiUrl).toString();
            const payload = { query: prompt };
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
        }
    } catch (error) {
        if (error instanceof TypeError) { // Network error
            throw new Error(`Failed to connect to local LLM at ${apiUrl}.`);
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
            throw new Error(`Failed to connect to local LLM at ${apiUrl}.`);
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
            throw new Error(`Failed to connect to local LLM at ${apiUrl}.`);
        }
        throw error;
    }
};

export const testLocalLlmConnection = async (apiUrl: string): Promise<{ success: boolean; message: string; }> => {
    let endpoint: string;
    try {
        // A common health check endpoint, adjust if your local server uses a different one (e.g., /docs, /healthz)
        endpoint = new URL('/health', apiUrl).toString();
    } catch (e) {
        return { success: false, message: `Invalid URL format: ${apiUrl}` };
    }

    try {
        const response = await fetch(endpoint);
        
        if (response.ok) {
             const data = await response.json().catch(() => ({}));
             return { success: true, message: data.message || 'Connection to Local LLM server successful!' };
        }
        
        const errorText = await response.text();
        return { success: false, message: `Connection failed. Server responded with HTTP status ${response.status}: ${errorText}` };

    } catch (error) {
        if (error instanceof TypeError) {
            return { 
                success: false, 
                message: `Network error. Could not connect to ${apiUrl}. Please check if the server is running, the URL is correct, and CORS is enabled.`
            };
        }
        return { 
            success: false, 
            message: `An unexpected error occurred: ${(error as Error).message}`
        };
    }
};
