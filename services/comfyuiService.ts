import { v4 as uuidv4 } from 'uuid';
import type { ComfyUIWorkflow, ComfyUIImageUploadResponse } from '../types';

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
    let promptId: string;
    let apiWorkflow = workflow; // Standard: Wir versuchen das Original

    // --- SCHRITT 1: KONVERTIERUNG (GUI -> API) ---
    try {
        onProgress({ message: 'Konvertiere Workflow in API-Format...', progress: 5 });
        
        // Wir senden den GUI-Workflow an den Helfer-Endpunkt auf dem Server
        const convertEndpoint = new URL('/workflow/convert', apiUrl).toString();
        
        const convertResponse = await fetch(convertEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(workflow),
        });

        if (convertResponse.ok) {
            // Erfolg! Wir haben das korrekte API-Format erhalten
            apiWorkflow = await convertResponse.json();
            console.log("Workflow erfolgreich konvertiert.");
        } else {
            console.warn("Konvertierung fehlgeschlagen (Server hat kein /workflow/convert?). Versuche Original.");
        }
    } catch (e) {
        console.warn("Konnte Konvertierungs-Endpunkt nicht erreichen.", e);
    }

    // --- SCHRITT 2: AUSFÜHRUNG (API-Format senden) ---
    const payload = {
        prompt: apiWorkflow, // Hier senden wir jetzt das konvertierte Format!
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
  
    // --- SCHRITT 3: FORTSCHRITT (WebSocket) ---
    try {
        const url = new URL(apiUrl);
        const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${url.host}/ws?clientId=${clientId}`;
        const ws = new WebSocket(wsUrl);
        
        // Mapping für schöne Namen in der Anzeige
        const nodesById = new Map(workflow.nodes.map(node => [String(node.id), node.title || node.type]));

        ws.onmessage = (event) => {
            if (typeof event.data !== 'string') return;
            const data = JSON.parse(event.data);

            if (data.type === 'executing' && data.data.prompt_id === promptId) {
                if (data.data.node === null) {
                    // Fertig!
                    if (ws.readyState === WebSocket.OPEN) ws.close();
                    onComplete();
                } else {
                    // Neuer Node startet
                    const nodeName = nodesById.get(String(data.data.node)) || `Node ${data.data.node}`;
                    onProgress({ message: `Executing: ${nodeName}...`, progress: 0 });
                }
            }

            if (data.type === 'progress' && data.data.prompt_id === promptId) {
                const { value, max } = data.data;
                const progress = (value / max) * 100;
                onProgress({ message: `Processing... (${value}/${max})`, progress });
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
            throw getNetworkError(error, apiUrl, 'image upload');
        }
        throw error;
    }
};


export const testComfyUIConnection = async (apiUrl: string): Promise<{ success: boolean; message: string; data?: any; isCorsError?: boolean; isMixedContentError?: boolean; }> => {
    let endpoint: string;
    try {
        // To accurately test the CORS preflight, we POST to a known GET-only endpoint.
        // A successful connection will be blocked by CORS if not configured, or will
        // return a 405 "Method Not Allowed" error if CORS is configured correctly.
        // This is a reliable way to test the actual browser-server communication.
        endpoint = new URL('/system_stats', apiUrl).toString();
    } catch (e) {
        return { success: false, message: `Invalid URL format: ${apiUrl}` };
    }

    try {
        // Sending a POST request forces the browser to make a CORS preflight (OPTIONS) request.
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });

        // A 405 "Method Not Allowed" is a SUCCESS for this test.
        // It means the CORS preflight passed, the server was reached, and it correctly
        // responded that the endpoint doesn't support POST. The connection is valid.
        if (response.ok || response.status === 405) {
            return { success: true, message: 'Connection to ComfyUI successful! The server is reachable and CORS is configured correctly.' };
        } else {
             // Any other error status indicates a problem beyond the expected 405.
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