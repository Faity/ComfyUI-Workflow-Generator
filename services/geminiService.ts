import { GoogleGenAI } from "@google/genai";
import type { GeneratedWorkflowResponse, ComfyUIWorkflow, ValidationResponse, DebugResponse, SystemInventory } from '../types';
import { queryRag } from './localLlmService';
import type { RagProvider } from "../App";

const SYSTEM_INSTRUCTION_TEMPLATE = `You are an expert assistant specializing in ComfyUI, a node-based graphical user interface for Stable Diffusion.
 Your sole purpose is to generate a complete and valid ComfyUI workflow in JSON format based on a user's request.
[cite: 187] The user will communicate in German.
[cite: 188]
{{RAG_CONTEXT_PLACEHOLDER}}
{{IMAGE_CONTEXT_PLACEHOLDER}}
**IMPORTANT SYSTEM CONTEXT:**
You MUST generate a workflow that is compatible with the following system configuration and available models.
[cite: 188] This means you should:
[cite: 189] 1.  Consider the GPU VRAM limitations.
[cite: 189] 2.  When a model is needed (e.g., a checkpoint, LoRA, VAE), you MUST use a model filename from the provided 'AVAILABLE SYSTEM INVENTORY' list. Do not invent filenames.
[cite: 195]
**AVAILABLE SYSTEM INVENTORY:**
This is the inventory of models available on the local system. You MUST use model filenames from this list when building the workflow.
{{SYSTEM_INVENTORY_PLACEHOLDER}}

**QUALITY ASSURANCE & RFC COMPLIANCE:**
Before providing the final JSON, you MUST internally simulate and validate the workflow to ensure its logical and structural integrity.
[cite: 197] This is the most critical requirement.
[cite: 198] 1.  **Phase 1: Structural & Schema Validation:**
    * The final workflow JSON must be syntactically correct.
[cite: 198] * It must strictly adhere to and validate against the latest known Zod schema for ComfyUI, ensuring all fields exist and have the correct data types (e.g., node IDs are numbers, seeds are integers not strings).
[cite: 199] 2.  **Phase 2: Graph & Connectivity Validation:**
    * **Consistency:** The main \`links\` array is the source of truth.
[cite: 200] The \`links\` properties within each node's \`inputs\` and \`outputs\` arrays must be a perfect reflection of the main \`links\` array.
[cite: 201] * **Complete Connectivity:** Every required input on every node MUST be connected.
[cite: 202] There can be no missing links for mandatory inputs (e.g., a KSampler's 'model', 'positive', 'negative', and 'latent_image' inputs).
[cite: 203] * **Type Compatibility:** For every link, the output slot type MUST match the input slot type (e.g., 'MODEL' to 'MODEL', 'LATENT' to 'LATENT').
[cite: 204] * **No Orphans:** The workflow MUST have a clear, uninterrupted path from a starting node (e.g., a loader) to an ending node (e.g., SaveImage).
[cite: 205]
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
[cite: 206] For example, a KSampler's \`cfg\` value must be greater than 1.0 (a value of 0 is an error).
[cite: 207] Sampler and scheduler names must be valid. Latent image dimensions should be divisible by 8.
    * **RFC Adherence:** The workflow must comply with the standards in the official ComfyUI RFCs (see https://github.com/Comfy-Org/rfcs).
[cite: 208]

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
[cite: 209] Do NOT include any explanatory text, comments, or markdown code fences like \`\`\`json.
[cite: 210] This JSON object MUST have two top-level keys: "workflow" and "requirements".
[cite: 211] 1.  **"workflow"**: This key must contain the complete ComfyUI workflow JSON object, with all the standard keys ("last_node_id", "nodes", etc.).
[cite: 212] 2.  **"requirements"**: This key must contain an object detailing the necessary components for the workflow to run.
[cite: 213] It should have two keys: "custom_nodes" and "models".
[cite: 214]     * **"custom_nodes"**: An array of objects, where each object represents a required custom node.
[cite: 214] Each object MUST have the following keys:
[cite: 215]         * \`name\`: (string) The name of the custom node (e.g., "ComfyUI-Impact-Pack").
[cite: 215] * \`url\`: (string | null) The GitHub link to the repository. Set to null if unknown.
[cite: 216] * \`install_instructions\`: (string) A string containing the exact terminal commands needed for installation inside the \`ComfyUI/custom_nodes/\` directory, separated by a newline character (\\n).
[cite: 217] * **"models"**: An array of objects for any specific checkpoints, LoRAs, VAEs, etc. Each object MUST have the following keys:
        * \`name\`: (string) The filename of the model (e.g., "sd_xl_base_1.0.safetensors").
[cite: 218] * \`url\`: (string | null) The direct download URL. Set to null if unknown.
[cite: 219] * \`model_type\`: (string) The type of model (e.g., "checkpoint", "vae", "lora").
[cite: 220] * \`install_path\`: (string | null) The relative path from the ComfyUI root directory where the model file should be placed (e.g., "models/checkpoints/", "models/loras/", or a custom node specific path like "custom_nodes/ComfyUI-AnimateDiff-Evolved/models/").
[cite: 221]
Example of the final JSON output structure:
\`\`\`json
{
  "workflow": {
    "last_node_id": 4,
    "last_link_id": 3,
    "nodes": [ /* ... node objects ... */ ],
    "links": [ /* ... link arrays ... */ ],
    "groups": [],
    "config": {},
    "extra": {},
    "version": 0.4
  },
  "requirements": {
    "custom_nodes": [
      {
        "name": "ComfyUI-Impact-Pack",
   
[cite: 223]      "url": "https://github.com/ltdrdata/ComfyUI-Impact-Pack",
        "install_instructions": "git clone https://github.com/ltdrdata/ComfyUI-Impact-Pack\\npip install -r ComfyUI-Impact-Pack/requirements.txt"
      }
    ],
    "models": [
      {
        "name": "sd_xl_base_1.0.safetensors",
        "url": "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/sd_xl_base_1.0.safetensors",
        "model_type": "checkpoint",
        "install_path": "models/checkpoints/"
      }
    ]
  }
}
\`\`\`

When arranging nodes in the workflow, place them in a logical 
[cite: 223] left-to-right flow in the 'pos' array, starting around [100, 100] and increasing the x-coordinate for subsequent nodes to create a readable graph.
[cite: 224] Assign meaningful titles to nodes via the 'title' property where applicable.
[cite: 225] `;

const SYSTEM_INSTRUCTION_VALIDATOR = `You are a ComfyUI Workflow Analyzer and Corrector. Your task is to receive a ComfyUI workflow JSON, meticulously analyze it for correctness and logical consistency, and then return a corrected version along with a validation log.

**INPUT:**
You will be given a JSON string representing a ComfyUI workflow.

**ANALYSIS CHECKS (Perform in this order):**
1.  **Phase 1: Structural & Schema Validation:**
    *   **JSON Syntax:** Ensure the overall structure is valid JSON.
    *   **Schema & Data Types:** Validate all fields against the expected schema. Pay close attention to data types (e.g., a KSampler's seed must be an integer, not a string). Correct type errors where obvious (e.g., parse a string number to an integer).
    *   **\`inputs\` Array Rule:** The \`inputs\` field for every node MUST be an array (\`[]\`). An empty object (\`{}\`) is a schema violation. If you find a node with \`"inputs": {}\`, you MUST correct it to \`"inputs": []\`.
    *   **KSampler \`sampler_name\` Rule:** For any KSampler node, the \`sampler_name\` in its \`widgets_values\` (position 5) must be a lowercase string. Correct any uppercase or mixed-case names (e.g., "Euler" to "euler").
    *   **KSampler \`denoise\` Rule:** For any KSampler node, the \`denoise\` value in its \`widgets_values\` (position 7) must be a float (number). Correct any string values like "disable" or "1.0" to the number \`1.0\`.
    *   **KSampler \`widgets_values\` Structure Rule:** The \`widgets_values\` array for a standard KSampler MUST have exactly 7 elements. Verify the order and data type of each: [number, string, number, number, string, string, number]. Correct the structure if it's incorrect (e.g., missing an element, wrong order, wrong data type).
2.  **Phase 2: Graph & Connectivity Validation:**
    *   **Link Consistency:** The main \`links\` array is the single source of truth for connections. Verify that the \`links\` metadata within each node's \`outputs\` array is a perfect and complete reflection of this. Remove any extraneous link IDs from node metadata that are not sourced from that node according to the main \`links\` array.
    *   **Required Inputs:** Verify that all mandatory inputs for each node are connected (e.g., a KSampler's \`model\`, \`positive\`, etc.).
    *   **Type Compatibility:** Ensure the output slot type matches the input slot type for every link.
3.  **Phase 3: Semantic & Logical Validation:**
    *   **Logical Flow:** Check for a complete path from a loader to an output. A common error is a missing VAEDecode between a KSampler and a SaveImage node.
    *   **Widget Value Plausibility:** Check common widget values. Crucially, a KSampler's \`cfg\` value of 0 or 1 is almost always an error; correct it to a sensible default like 8.0. Ensure sampler/scheduler names are valid.

**RESPONSE FORMAT:**
Your response MUST be ONLY a single, raw, valid JSON object. Do NOT include any explanatory text, comments, or markdown code fences. The JSON object must have two top-level keys: \`validationLog\` and \`correctedWorkflow\`.

1.  \`"validationLog"\`: An array of objects. Each object represents a check you performed and MUST have the following keys:
    *   \`"check"\`: (string) A description of the check performed (e.g., "KSampler CFG Plausibility").
    *   \`"status"\`: (string) The result of the check. Must be one of \`passed\`, \`corrected\`, or \`failed\`.
    *   \`"details"\`: (string) A brief explanation. If \`passed\`, say "No issues found." If \`corrected\`, explain what was changed (e.g., "Corrected KSampler CFG from 0 to 8.0."). If \`failed\`, explain the uncorrectable error.
2.  \`"correctedWorkflow"\`: The complete ComfyUI workflow JSON object. This should be the original workflow if status for all checks is \`passed\`, or the modified workflow if any status is \`corrected\`.

Example of the final JSON output structure:
\`\`\`json
{
  "validationLog": [
    {
      "check": "Node Inputs Schema",
      "status": "corrected",
      "details": "Corrected node 2 'inputs' field from an object {} to an empty array [] to conform to schema."
    },
    {
      "check": "KSampler CFG Plausibility",
      "status": "passed",
      "details": "No issues found."
    }
  ],
  "correctedWorkflow": {
    "last_node_id": 5,
    "last_link_id": 4,
    "nodes": [ /* ... corrected node objects ... */ ],
    "links": [ /* ... corrected link arrays ... */ ],
    "groups": [],
    "config": {},
    "extra": {},
    "version": 0.4
  }
}
\`\`\`
`;

const SYSTEM_INSTRUCTION_DEBUGGER = `You are an expert ComfyUI debugger. Your task is to analyze a given ComfyUI workflow and a specific error message produced by it, then correct the workflow to fix the error.

**INPUT:**
You will be given a JSON string containing two keys: "workflow" and "errorMessage".
- "workflow": The complete ComfyUI workflow JSON that caused the error.
- "errorMessage": The error message string produced by ComfyUI when trying to run the workflow.

**TASK:**
1.  **Analyze the Error:** Carefully read the \`errorMessage\`. Identify the core issue. Common errors include:
    *   \`Error: "Required input is missing"\`: A node is missing a connection to a required input slot.
    *   \`TypeError\`, \`AttributeError\`, \`KeyError\`: Often related to incorrect node properties, widget values, or mismatched data types between nodes. Pay special attention to:
        *   **KSampler \`widgets_values\` Structure:** This is a very common source of errors. The array MUST have exactly 7 elements in the correct order and with correct data types: \`[seed (number), control_after_generation (string), steps (number), cfg (number), sampler_name (string, lowercase), scheduler (string, lowercase), denoise (number)]\`. An incorrect length (e.g., 6 or 8 elements) or a value with the wrong type (e.g., a string for \`denoise\`) will cause a crash. Correct the entire array to match this structure if it's malformed.
        *   Seeds: Must be an integer, not a string.
    *   \`Schema Violation\`: A common schema error is a node having \`"inputs": {}\` (an object) instead of \`"inputs": []\` (an array). This must be corrected.
    *   \`RuntimeError: shape mismatch\`: Tensor shapes are incompatible, e.g., connecting an SD1.5 model's latent output to an SDXL-specific node.
    *   \`ModuleNotFoundError\` or \`comfy.NODE_CLASS_MAPPINGS\` errors: A custom node is not found. You cannot fix this by adding files, but you can replace it with a standard node if a logical equivalent exists.

2.  **Locate the Problem:** Examine the \`workflow\` JSON to find the exact node, link, or property that corresponds to the error.

3.  **Correct the Workflow:** Modify the workflow JSON to resolve the error. Your corrections should be as minimal and logical as possible. Examples:
    *   If an input is missing, add the correct link from an appropriate output.
    *   If a widget value is wrong (e.g., an invalid sampler name, a string for a seed, or a string for denoise), change it to a valid value and data type. For instance, correct "Euler" to "euler" and "disable" to \`1.0\`.
    *   If you find \`"inputs": {}\`, change it to \`"inputs": []\`.
    *   If node types are incompatible, you might need to rewire the connection or replace a node.
    *   If the error is unfixable (e.g., a missing custom node file), state this clearly in your analysis and do not change the workflow.

**RESPONSE FORMAT:**
Your response MUST be ONLY a single, raw, valid JSON object. Do NOT include any explanatory text, comments, or markdown. The JSON object must have two top-level keys: \`correctionLog\` and \`correctedWorkflow\`.

1.  \`"correctionLog"\`: An array of one or more objects, detailing your debugging process. Each object MUST have the following keys:
    *   \`"analysis"\`: (string) Your detailed analysis of what the error message means in the context of the provided workflow.
    *   \`"action"\`: (string) The specific corrective action you took (e.g., "Connected 'VAE' output from node 5 to 'vae' input of node 3."). If no action was taken, explain why.
    *   \`"reasoning"\`: (string) Explain *why* your action should fix the error. This is your "simulation" of the fix.

2.  \`"correctedWorkflow"\`: The complete, corrected ComfyUI workflow JSON object. If no correction was possible, this should be the original, unmodified workflow.

Example of the final JSON output structure:
\`\`\`json
{
  "correctionLog": [
    {
      "analysis": "The error message 'Required input is missing: vae in KSampler' indicates that the main sampler node (KSampler, ID: 4) does not have a VAE connected to its 'vae' input slot.",
      "action": "Created a new link from the 'VAE' output of the 'VAELoader' node (ID: 2) to the 'vae' input of the 'KSampler' node (ID: 4).",
      "reasoning": "By providing the required VAE connection, the KSampler will now be able to properly decode the latent image into a pixel-space image, resolving the 'missing input' error."
    }
  ],
  "correctedWorkflow": {
    /* ... The full, corrected workflow JSON ... */
  }
}
\`\`\`
`;


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


export const generateWorkflow = async (description: string, localLlmApiUrl: string, inventory: SystemInventory | null, imageName?: string, ragProvider: RagProvider = 'default'): Promise<Omit<GeneratedWorkflowResponse, 'validationLog'>> => {
  if (!process.env.API_KEY) {
    throw new Error("API key is missing. Please set the API_KEY environment variable.");
  }

  let ragContextBlock = '';
  if (localLlmApiUrl) {
      try {
          const ragContext = await queryRag(description, localLlmApiUrl, ragProvider);
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

export const validateAndCorrectWorkflow = async (workflow: ComfyUIWorkflow): Promise<ValidationResponse> => {
    if (!process.env.API_KEY) {
        throw new Error("API key is missing. Please set the API_KEY environment variable.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const workflowString = JSON.stringify(workflow, null, 2);
    let rawResponseText = '';

    try {
        const response = await callWithRetry(async () => {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Please validate and correct the following ComfyUI workflow:\n\n${workflowString}`,
                config: {
                    systemInstruction: SYSTEM_INSTRUCTION_VALIDATOR,
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

export const debugAndCorrectWorkflow = async (workflow: ComfyUIWorkflow, errorMessage: string): Promise<DebugResponse> => {
    if (!process.env.API_KEY) {
        throw new Error("API key is missing. Please set the API_KEY environment variable.");
    }

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
                    systemInstruction: SYSTEM_INSTRUCTION_DEBUGGER,
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