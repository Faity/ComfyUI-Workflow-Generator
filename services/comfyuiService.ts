

import { v4 as uuidv4 } from 'uuid';
import type { ComfyUIWorkflow, ComfyUIImageUploadResponse, ComfyUIImage } from '../types';

interface ProgressStatus {
  message: string;
  progress: number;
}

const getNetworkError = (error: TypeError, apiUrl: string, context: string): Error => {
    let message;
    try {
        const url = new URL(apiUrl);
        if (window.location.protocol === 'https:' && url.protocol === 'http:') {
            message = `Mixed Content Error during ${context}: This application is secure (HTTPS), but your ComfyUI URL is not (HTTP). Browsers block these requests. Please check the Settings panel for a solution.`;
        } else {
            message = `Network Error during ${context} to ${apiUrl}. Please check: 1) The URL is correct. 2) The ComfyUI server is running. 3) CORS is enabled by starting ComfyUI with the '--enable-cors' flag.`;
        }
    } catch (e) {
        message = `Invalid URL provided for ${context}: ${apiUrl}.`;
    }
    return new Error(message);
};

/**
 * Helper function to convert a GUI workflow to API format.
 * Tries to use the server's /workflow/convert endpoint (if available via helper nodes),
 * otherwise falls back to using the workflow as-is (which works if the prompt format is close enough).
 */
const convertToApiFormat = async (workflow: ComfyUIWorkflow, apiUrl: string): Promise<any> => {
    try {
        // Try to convert using the server endpoint (common with some custom nodes/extensions)
        const convertEndpoint = new URL('/workflow/convert', apiUrl).toString();
        const convertResponse = await fetch(convertEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(workflow),
        });

        if (convertResponse.ok) {
            return await convertResponse.json();
        }
    } catch (e) {
        // Ignore network errors during conversion attempt and fall back
        console.warn("Could not reach /workflow/convert endpoint. Using raw workflow.", e);
    }
    
    // Fallback: Return original. ComfyUI API expects 'prompt' format, but sometimes 
    // the graph format works depending on the endpoint used or if it's already in prompt format.
    return workflow;
};


/**
 * Sends a workflow to a ComfyUI instance and listens for real-time progress via WebSocket.
 */
export const executeWorkflow = async (
  workflow: ComfyUIWorkflow,
  apiUrl: string,
  onProgress: (status: ProgressStatus) => void,
  onComplete: (images: ComfyUIImage[]) => void,
  onError: (error: Error) => void
): Promise<void> => {
    const clientId = uuidv4();
    let promptId: string;
    const generatedImages: ComfyUIImage[] = [];
    
    onProgress({ message: 'Konvertiere Workflow in API-Format...', progress: 5 });
    
    // --- SCHRITT 1: KONVERTIERUNG (GUI -> API) ---
    let apiWorkflow;
    try {
        apiWorkflow = await convertToApiFormat(workflow, apiUrl);
    } catch (e) {
        console.warn("Conversion failed locally, using original.", e);
        apiWorkflow = workflow;
    }

    // --- SCHRITT 2: AUSFÜHRUNG (API-Format senden) ---
    const payload = {
        prompt: apiWorkflow, 
        client_id: clientId,
    };

    try {
        const endpoint = new URL('/prompt', apiUrl).toString();
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            
            // Try to parse nicer error
            try {
                const errJson = JSON.parse(errorBody);
                if (errJson.error && errJson.node_errors) {
                     const nodeErrors = Object.entries(errJson.node_errors).map(([k, v]: any) => {
                        const errors = Array.isArray(v.errors) ? v.errors.map((e: any) => e.message).join(', ') : 'Unknown error';
                        return `Node ${k} (${v.class_type}): ${errors}`;
                     }).join('\n');
                     throw new Error(`ComfyUI Validation Error:\n${nodeErrors}`);
                }
            } catch (parseErr) {
                // Ignore parse error, throw original body
            }
            
            throw new Error(`ComfyUI API error (${response.status}):\n${errorBody}`);
        }
        
        const jsonResponse = await response.json();
        if (jsonResponse.error) {
            throw new Error(`ComfyUI prompt error: ${jsonResponse.error.type} - ${jsonResponse.message}`);
        }
        promptId = jsonResponse.prompt_id;
    } catch (error: any) {
        if (error instanceof TypeError) {
             onError(getNetworkError(error, apiUrl, 'execution'));
        } else {
             onError(error);
        }
        return;
    }
  
    // --- SCHRITT 3: FORTSCHRITT (WebSocket) ---
    try {
        const url = new URL(apiUrl);
        const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${url.host}/ws?clientId=${clientId}`;
        const ws = new WebSocket(wsUrl);
        
        // SAFE NODE MAPPING (Handling both Graph and API formats)
        let nodesById = new Map<string, string>();
        if (workflow && typeof workflow === 'object' && 'nodes' in workflow && Array.isArray((workflow as any).nodes)) {
             // Graph Format
             nodesById = new Map((workflow as any).nodes.map((node: any) => [String(node.id), node.title || node.type]));
        } else if (workflow && typeof workflow === 'object') {
             // API Format: { "id": { class_type: "..." } }
             try {
                Object.entries(workflow).forEach(([id, node]: [string, any]) => {
                    if (node && node.class_type) {
                        nodesById.set(id, node._meta?.title || node.class_type);
                    }
                });
             } catch (e) {
                 console.warn("Could not map nodes for progress display (API format)", e);
             }
        }

        ws.onmessage = (event) => {
            if (typeof event.data !== 'string') return;
            const data = JSON.parse(event.data);

            if (data.type === 'executing' && data.data.prompt_id === promptId) {
                if (data.data.node === null) {
                    if (ws.readyState === WebSocket.OPEN) ws.close();
                    onComplete(generatedImages);
                } else {
                    const nodeName = nodesById.get(String(data.data.node)) || `Node ${data.data.node}`;
                    onProgress({ message: `Executing: ${nodeName}...`, progress: 0 });
                }
            }

            if (data.type === 'progress' && data.data.prompt_id === promptId) {
                const { value, max } = data.data;
                const progress = (value / max) * 100;
                onProgress({ message: `Processing... (${value}/${max})`, progress });
            }
            
            if (data.type === 'executed' && data.data.prompt_id === promptId) {
                const output = data.data.output;
                // Safety check for output images array
                if (output && output.images && Array.isArray(output.images)) {
                    generatedImages.push(...output.images);
                }
            }
        };

        ws.onerror = (event) => {
            console.error('WebSocket error:', event);
            onError(new Error('WebSocket connection error.'));
            if(ws.readyState === WebSocket.OPEN) ws.close();
        };

    } catch (error: any) {
        onError(error);
    }
};

/**
 * Validates the workflow against the ComfyUI API without waiting for execution.
 * Returns success: true if accepted, or success: false with error details if rejected.
 */
export const validateWorkflowAgainstApi = async (
    workflow: ComfyUIWorkflow, 
    apiUrl: string
): Promise<{ success: boolean; error?: string }> => {
    
    // 1. Convert
    let apiWorkflow;
    try {
        apiWorkflow = await convertToApiFormat(workflow, apiUrl);
    } catch (e) {
        return { success: false, error: "Failed to prepare workflow format for validation." };
    }

    // 2. Send to /prompt to check for immediate validation errors (400 Bad Request)
    const payload = {
        prompt: apiWorkflow,
        client_id: uuidv4(), // Random ID, we don't intend to listen to WS here
    };

    try {
        const endpoint = new URL('/prompt', apiUrl).toString();
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            let errorMessage = `Server responded with ${response.status}`;

            try {
                const errJson = JSON.parse(errorBody);
                
                // Handle specific Node Errors (common in ComfyUI validation)
                if (errJson.node_errors && Object.keys(errJson.node_errors).length > 0) {
                    const details = Object.entries(errJson.node_errors).map(([nodeId, errorData]: any) => {
                         // Safe check for graph format vs api format title lookup
                         let nodeTitle = `Node ${nodeId}`;
                         if ('nodes' in workflow && Array.isArray((workflow as any).nodes)) {
                             const found = (workflow as any).nodes.find((n:any) => String(n.id) === String(nodeId));
                             if (found) nodeTitle = found.title || found.type || nodeTitle;
                         }

                         const classType = errorData.class_type;
                         const messages = Array.isArray(errorData.errors) 
                            ? errorData.errors.map((e: any) => e.message).join(', ')
                            : 'Unknown error';
                         return `Error in '${nodeTitle}' (${classType}): ${messages}`;
                    }).join('\n');
                    errorMessage = `ComfyUI Validation Failed:\n${details}`;
                } else if (errJson.error && errJson.error.message) {
                    errorMessage = `ComfyUI Error: ${errJson.error.message}`;
                } else {
                    errorMessage = `ComfyUI Error: ${errorBody}`;
                }
            } catch (e) {
                errorMessage = `ComfyUI Raw Error: ${errorBody}`;
            }

            return { success: false, error: errorMessage };
        }

        // If success (200 OK), ComfyUI accepted it and queued it. 
        // We consider this "Validated". 
        // NOTE: In a perfect world we would cancel the job immediately if we only wanted to test, 
        // but that requires tracking the prompt_id and calling /queue/cancel. 
        // For now, we accept that "Validating" effectively means "Dry Run" / "Ready to Run".
        return { success: true };

    } catch (error: any) {
        if (error instanceof TypeError) {
            return { success: false, error: getNetworkError(error, apiUrl, 'validation').message };
        }
        return { success: false, error: error.message || "Unknown error during server validation." };
    }
};

/**
 * Uploads an image file to the ComfyUI server.
 */
export const uploadImage = async (imageFile: File, apiUrl: string): Promise<ComfyUIImageUploadResponse> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('overwrite', 'true'); 

    let endpoint: string;
    try {
        endpoint = new URL('/upload/image', apiUrl).toString();
    } catch (e) {
        throw new Error(`Invalid ComfyUI URL provided: ${apiUrl}`);
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            let errorBody = 'Could not read error body.';
            try {
                errorBody = await response.text();
            } catch {}
            throw new Error(`ComfyUI image upload error (${response.status}):\n${errorBody}`);
        }
        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw getNetworkError(error, apiUrl, 'image upload');
        }
        throw error;
    }
};


export const testComfyUIConnection = async (apiUrl: string): Promise<{ success: boolean; message: string; data?: any; isCorsError?: boolean; isMixedContentError?: boolean; }> => {
    let endpoint: string;
    try {
        endpoint = new URL('/system_stats', apiUrl).toString();
    } catch (e) {
        return { success: false, message: `Invalid URL format: ${apiUrl}` };
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });

        if (response.ok || response.status === 405) {
            return { success: true, message: 'Connection to ComfyUI successful! The server is reachable and CORS is configured correctly.' };
        } else {
             return { 
                success: false, 
                message: `Connection failed. Server responded with HTTP status ${response.status} ${response.statusText}. Please check if the URL is correct and the server is running.` 
            };
        }

    } catch (error) {
        if (error instanceof TypeError) {
            let message;
            let isCorsError = false;
            let isMixedContentError = false;
            try {
                const url = new URL(apiUrl);
                 if (window.location.protocol === 'https:' && url.protocol === 'http:') {
                    message = `Mixed Content Error: The app is on HTTPS, but the ComfyUI URL is on HTTP. Browsers block these requests.`;
                    isMixedContentError = true;
                } else {
                    message = `Network Error. Could not connect to ${apiUrl}. Please ensure the server is running, the URL is correct, and CORS is enabled by starting ComfyUI with the '--enable-cors' flag.`;
                    isCorsError = true;
                }
            } catch(e) {
                message = `Invalid URL format: ${apiUrl}`;
            }
            return { 
                success: false, 
                isCorsError: isCorsError,
                isMixedContentError: isMixedContentError,
                message: message
            };
        }
         if (error instanceof SyntaxError) {
             return {
                success: false,
                message: 'Received an invalid response (not JSON). The URL might be pointing to a website instead of the ComfyUI API.'
            };
        }
        return { 
            success: false, 
            message: `An unexpected error occurred: ${(error as Error).message}`
        };
    }
};
