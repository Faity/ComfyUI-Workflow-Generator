import { v4 as uuidv4 } from 'uuid';
import type { ComfyUIWorkflow, ComfyUIImageUploadResponse } from '../types';

interface ProgressStatus {
  message: string;
  progress: number;
}

/**
 * Sends a workflow to a ComfyUI instance and listens for real-time progress via WebSocket.
 * @param workflow The ComfyUI workflow object.
 * @param apiUrl The base URL of the ComfyUI API (e.g., http://127.0.0.1:8188).
 * @param onProgress Callback function to report progress updates.
 * @param onComplete Callback function invoked when the workflow execution is finished.
 * @param onError Callback function to report any errors during the process.
 */
export const executeWorkflow = async (
  workflow: ComfyUIWorkflow,
  apiUrl: string,
  onProgress: (status: ProgressStatus) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): Promise<void> => {
    const clientId = uuidv4();
    const payload = {
        prompt: workflow,
        client_id: clientId,
    };
    
    let promptId: string;

    // 1. Send the prompt via HTTP POST to get a prompt_id
    try {
        const endpoint = new URL('/prompt', apiUrl).toString();
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`ComfyUI API error (${response.status}):\n${errorBody}`);
        }
        const jsonResponse = await response.json();
        if (jsonResponse.error) {
            throw new Error(`ComfyUI prompt error: ${jsonResponse.error.type} - ${jsonResponse.message}`);
        }
        promptId = jsonResponse.prompt_id;
    } catch (error: any) {
        onError(error);
        return;
    }
  
    // 2. Open a WebSocket connection to listen for progress
    try {
        const url = new URL(apiUrl);
        const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${url.host}/ws?clientId=${clientId}`;
        const ws = new WebSocket(wsUrl);

        let currentlyExecutingNode: string | null = null;
        const nodesById = new Map(workflow.nodes.map(node => [String(node.id), node.title || node.type]));

        ws.onmessage = (event) => {
            if (typeof event.data !== 'string') return;
            const data = JSON.parse(event.data);

            if (data.type === 'executing' && data.data.prompt_id === promptId) {
                if (data.data.node === null) {
                    // A null node ID in an 'executing' message signifies the end of the queue.
                    currentlyExecutingNode = null;
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.close();
                    }
                    onComplete();
                } else {
                    // A new node is starting execution.
                    currentlyExecutingNode = nodesById.get(data.data.node) || `Node ${data.data.node}`;
                    onProgress({ message: `Executing: ${currentlyExecutingNode}...`, progress: 0 });
                }
            }

            if (data.type === 'progress' && data.data.prompt_id === promptId) {
                const { value, max } = data.data;
                const progress = (value / max) * 100;
                const message = currentlyExecutingNode 
                    ? `Executing: ${currentlyExecutingNode} (${value}/${max})` 
                    : `Processing... (${value}/${max})`;
                onProgress({ message, progress });
            }
        };

        ws.onerror = (event) => {
            console.error('WebSocket error:', event);
            onError(new Error('WebSocket connection error. Could not get progress updates.'));
            if(ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
        };

    } catch (error: any) {
        onError(error);
    }
};

/**
 * Uploads an image file to the ComfyUI server.
 * @param imageFile The image file to upload.
 * @param apiUrl The base URL of the ComfyUI API.
 * @returns The JSON response from the server, containing the filename.
 */
export const uploadImage = async (imageFile: File, apiUrl: string): Promise<ComfyUIImageUploadResponse> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('overwrite', 'true'); // Prevent errors if a file with the same name exists

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
             throw new Error(`Failed to connect to ComfyUI at ${apiUrl} for image upload. Please check server status and CORS settings.`);
        }
        throw error;
    }
};


export const testComfyUIConnection = async (apiUrl: string): Promise<{ success: boolean; message: string; data?: any; isCorsError?: boolean; }> => {
    let endpoint: string;
    try {
        // We test against an endpoint we know exists, like system_stats
        endpoint = new URL('/system_stats', apiUrl).toString();
    } catch (e) {
        return { success: false, message: `Invalid URL format: ${apiUrl}` };
    }

    try {
        // We use a POST request with a JSON content type to force a CORS preflight request,
        // which is what happens during the actual executeWorkflow call. This gives a more accurate test.
        const response = await fetch(endpoint, { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });

        // A 405 (Method Not Allowed) response is a good sign here.
        // It means the CORS preflight succeeded and the server is reachable,
        // but it just doesn't accept POST on this specific endpoint. This confirms connectivity.
        if (response.ok || response.status === 405) {
             try {
                const data = await response.json();
                 return { success: true, message: 'Connection to ComfyUI successful!', data };
             } catch (e) {
                // This can happen on a 405 response where the body is not JSON, which is fine.
                 return { success: true, message: 'Connection to ComfyUI successful!' };
             }
        } else {
             return { 
                success: false, 
                message: `Connection failed. Server responded with HTTP status ${response.status} ${response.statusText}. Please check if the URL is correct and the server is running.` 
            };
        }

    } catch (error) {
        if (error instanceof TypeError) {
            // This is the most common error for CORS or network issues
            return { 
                success: false, 
                isCorsError: true,
                message: `Network error. Could not connect to ${apiUrl}. Please ensure the server is running, the URL is correct, and CORS is enabled (try starting ComfyUI with the '--enable-cors' flag). This test realistically simulates a 'Run' request and has failed.`
            };
        }
         if (error instanceof SyntaxError) {
             return {
                success: false,
                message: 'Received an invalid response (not JSON). The URL might be pointing to a website instead of the ComfyUI API.'
            };
        }
        // For other unexpected errors
        return { 
            success: false, 
            message: `An unexpected error occurred: ${(error as Error).message}`
        };
    }
};