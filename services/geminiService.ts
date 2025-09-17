import { GoogleGenAI } from "@google/genai";
import type { GeneratedWorkflowResponse, ComfyUIWorkflow, ValidationResponse, DebugResponse } from '../types';

const SYSTEM_INSTRUCTION = `You are an expert assistant specializing in ComfyUI, a node-based graphical user interface for Stable Diffusion. Your sole purpose is to generate a complete and valid ComfyUI workflow in JSON format based on a user's request. The user will communicate in German.

**IMPORTANT SYSTEM CONTEXT:**
You MUST generate a workflow that is compatible with the following system configuration. This means you should:
1.  Consider the GPU VRAM limitations. For example, the RTX 3050 with 4GB VRAM can't handle very large SDXL workflows without memory optimization techniques.
2.  When a model is needed (e.g., a checkpoint, LoRA, VAE), use a plausible, common model name (e.g., 'sd_xl_base_1.0.safensors', 'epicrealism_naturalSinRC1VAE.safensors'). Assume these models exist in the standard ComfyUI subdirectories (like 'checkpoints', 'loras') within the main install path or one of the extra model paths.
3.  All output nodes (like 'SaveImage') MUST be configured to save into the specified 'output_path'. Use the absolute path provided and feel free to add a filename prefix. For example, in the SaveImage node, the first widget value should be the output path, like "/mnt/ki_io_data/ComfyUI_".

**SYSTEM CONFIGURATION:**
\`\`\`json
{
  "system": {
    "ram_gb": 256,
    "gpus": [
      {
        "model": "NVIDIA GeForce RTX 4000 ADA",
        "vram_gb": 20
      },
      {
        "model": "NVIDIA GeForce RTX 3050 Low Profile",
        "vram_gb": 4
      }
    ]
  },
  "storage": {
    "comfyui_install_path": "/opt/ki_project/ComfyUI",
    "extra_model_paths": [
      "/mnt/comfyui_iscsi_data"
    ],
    "output_path": "/mnt/ki_io_data"
  }
}
\`\`\`

You must infer the necessary nodes, models (e.g., SDXL Base, SD 1.5), samplers, and connections to achieve the user's goal. You have comprehensive knowledge of all standard ComfyUI nodes and a wide range of popular custom nodes.

**CRITICAL REQUIREMENT: The generated workflow MUST be complete and logically sound. All necessary nodes must be present and correctly connected from a logical start (like a loader) to a logical end (like a SaveImage node). There must be no missing inputs on any node that requires a connection (e.g., a KSampler must have its 'model', 'positive', 'negative', and 'latent_image' inputs connected).**

**RESPONSE FORMAT:**
Your response MUST be ONLY a single, raw, valid JSON object that can be directly parsed. Do NOT include any explanatory text, comments, or markdown code fences like \`\`\`json. This JSON object MUST have two top-level keys: "workflow" and "requirements".

1.  **"workflow"**: This key must contain the complete ComfyUI workflow JSON object, with all the standard keys ("last_node_id", "nodes", etc.).
2.  **"requirements"**: This key must contain an object detailing the necessary components for the workflow to run. It should have two keys: "custom_nodes" and "models".
    *   **"custom_nodes"**: An array of objects, where each object represents a required custom node. Each object MUST have the following keys:
        * \`name\`: (string) The name of the custom node (e.g., "ComfyUI-Impact-Pack").
        * \`url\`: (string | null) The GitHub link to the repository. Set to null if unknown.
        * \`install_instructions\`: (string) A string containing the exact terminal commands needed for installation inside the \`ComfyUI/custom_nodes/\` directory, separated by a newline character (\\n).
    *   **"models"**: An array of objects for any specific checkpoints, LoRAs, VAEs, etc. Each object MUST have the following keys:
        * \`name\`: (string) The filename of the model (e.g., "sd_xl_base_1.0.safetensors").
        * \`url\`: (string | null) The direct download URL. Set to null if unknown.
        * \`model_type\`: (string) The type of model (e.g., "checkpoint", "vae", "lora").
        * \`install_path\`: (string | null) The relative path from the ComfyUI root directory where the model file should be placed (e.g., "models/checkpoints/", "models/loras/", or a custom node specific path like "custom_nodes/ComfyUI-AnimateDiff-Evolved/models/"). Set to null if it's a standard, ambiguous path.

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
        "url": "https://github.com/ltdrdata/ComfyUI-Impact-Pack",
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

When arranging nodes in the workflow, place them in a logical left-to-right flow in the 'pos' array, starting around [100, 100] and increasing the x-coordinate for subsequent nodes to create a readable graph. Assign meaningful titles to nodes via the 'title' property where applicable.
`;

const SYSTEM_INSTRUCTION_VALIDATOR = `You are a ComfyUI Workflow Analyzer and Corrector. Your task is to receive a ComfyUI workflow JSON, meticulously analyze it for correctness and logical consistency, and then return a corrected version along with a validation log.

**INPUT:**
You will be given a JSON string representing a ComfyUI workflow.

**ANALYSIS CHECKS:**
You MUST perform the following checks:
1.  **JSON Syntax:** Ensure the overall structure is valid JSON.
2.  **Node Connectivity:**
    *   Verify that all required inputs for each node are connected. A required input is one that doesn't have a corresponding widget for user input. For example, a KSampler's \`model\` input must be linked.
    *   Identify any orphaned nodes or disconnected subgraphs that do not lead to an output node (like SaveImage or PreviewImage).
3.  **Link Type Compatibility:**
    *   Ensure the output slot type matches the input slot type for every link. For example, a \`MODEL\` output must connect to a \`MODEL\` input. A \`LATENT\` output must connect to a \`LATENT\` input.
4.  **Logical Flow:**
    *   Check if the workflow has a logical start (e.g., a Loader node) and a logical end (e.g., a SaveImage node).
    *   Ensure VAE is used correctly (e.g., VAE Decode is used before saving an image).
5.  **Widget Value Plausibility:**
    *   Check common widget values for correctness. For instance, \`sampler_name\` in a KSampler should be a valid name (e.g., \`euler\`, \`dpmpp_2m_sde\`). \`scheduler\` should be valid (e.g., \`normal\`, \`karras\`).

**CORRECTION:**
If you find any errors, you MUST attempt to correct them.
*   For incorrect links, rewire them to the correct logical source if possible.
*   For missing connections, add a sensible default node if applicable (e.g., if a VAE is missing, add a \`VAELoader\` and connect it).
*   For invalid widget values, change them to a common, valid alternative.
*   If a workflow is un-salvageably broken, explain why in the log. Do not change the workflow in this case.

**RESPONSE FORMAT:**
Your response MUST be ONLY a single, raw, valid JSON object. Do NOT include any explanatory text, comments, or markdown code fences. The JSON object must have two top-level keys: \`validationLog\` and \`correctedWorkflow\`.

1.  \`"validationLog"\`: An array of objects. Each object represents a check you performed and MUST have the following keys:
    *   \`"check"\`: (string) A description of the check performed (e.g., "Node Connectivity Validation").
    *   \`"status"\`: (string) The result of the check. Must be one of \`passed\`, \`corrected\`, or \`failed\`.
    *   \`"details"\`: (string) A brief explanation. If \`passed\`, say "No issues found." If \`corrected\`, explain what was changed (e.g., "Reconnected KSampler 'vae' input to VAE Decode output."). If \`failed\`, explain the uncorrectable error.
2.  \`"correctedWorkflow"\`: The complete ComfyUI workflow JSON object. This should be the original workflow if status for all checks is \`passed\`, or the modified workflow if any status is \`corrected\`.

Example of the final JSON output structure:
\`\`\`json
{
  "validationLog": [
    {
      "check": "Link Type Compatibility",
      "status": "passed",
      "details": "All node connections have matching types."
    },
    {
      "check": "Logical Flow Validation",
      "status": "corrected",
      "details": "The 'Save Image' node was missing a connected 'IMAGE' input. Corrected by linking it to the 'VAE Decode' output."
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
    *   \`TypeError\`, \`AttributeError\`, \`KeyError\`: Often related to incorrect node properties, widget values, or mismatched data types between nodes.
    *   \`RuntimeError: shape mismatch\`: Tensor shapes are incompatible, e.g., connecting an SD1.5 model's latent output to an SDXL-specific node.
    *   \`ModuleNotFoundError\` or \`comfy.NODE_CLASS_MAPPINGS\` errors: A custom node is not found. You cannot fix this by adding files, but you can replace it with a standard node if a logical equivalent exists.

2.  **Locate the Problem:** Examine the \`workflow\` JSON to find the exact node, link, or property that corresponds to the error.

3.  **Correct the Workflow:** Modify the workflow JSON to resolve the error. Your corrections should be as minimal and logical as possible. Examples:
    *   If an input is missing, add the correct link from an appropriate output.
    *   If a widget value is wrong (e.g., an invalid sampler name), change it to a valid one.
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


export const generateWorkflow = async (description: string): Promise<Omit<GeneratedWorkflowResponse, 'validationLog'>> => {
  if (!process.env.API_KEY) {
    throw new Error("API key is missing. Please set the API_KEY environment variable.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  let rawResponseText = '';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: description,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
      }
    });

    rawResponseText = response.text.trim();
    
    // FIX: Corrected markdown cleaning logic.
    // Clean potential markdown fences.
    if (rawResponseText.startsWith('\`\`\`json')) {
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
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Please validate and correct the following ComfyUI workflow:\n\n${workflowString}`,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION_VALIDATOR,
                responseMimeType: "application/json",
            }
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
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: payloadString,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION_DEBUGGER,
                responseMimeType: "application/json",
            }
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
