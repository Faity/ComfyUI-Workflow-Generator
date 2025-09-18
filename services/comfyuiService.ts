import { v4 as uuidv4 } from 'uuid';
import type { ComfyUIWorkflow } from '../types';

/**
 * Sends a workflow to a ComfyUI instance for execution.
 * @param workflow The ComfyUI workflow object.
 * @param apiUrl The base URL of the ComfyUI API (e.g., http://127.0.0.1:8188).
 * @returns The response from the ComfyUI server, typically containing a prompt_id.
 */
export const executeWorkflow = async (workflow: ComfyUIWorkflow, apiUrl: string): Promise<any> => {
    const clientId = uuidv4();

    const payload = {
        prompt: workflow,
        client_id: clientId,
    };
    
    let endpoint: string;
    try {
        // The endpoint is typically /prompt
        endpoint = new URL('/prompt', apiUrl).toString();
    } catch (e) {
        throw new Error(`Invalid ComfyUI URL provided: ${apiUrl}`);
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            let errorBody = 'Could not read error body.';
            try {
                // ComfyUI might return a JSON error object which is more informative
                const errorJson = await response.json();
                errorBody = JSON.stringify(errorJson, null, 2);
            } catch {
                // If not JSON, it might be plain text or HTML
                errorBody = await response.text();
            }
            throw new Error(`ComfyUI API error (${response.status}):\n${errorBody}`);
        }

        // Handle cases where the response is successful but not valid JSON
        // (e.g., if the URL points to a regular website)
        try {
            return await response.json();
        } catch (e) {
            console.error("Failed to parse ComfyUI response as JSON", e);
            throw new Error("Received an invalid response from the ComfyUI server. Please check if the URL is correct and points to the ComfyUI API, not a website.");
        }

    } catch (error) {
        if (error instanceof TypeError) { // This often indicates a network error
            throw new Error(`Failed to connect to ComfyUI at ${apiUrl}. Please ensure the server is running, the URL is correct, and there are no CORS issues (try starting ComfyUI with '--enable-cors').`);
        }
        // Re-throw other errors (like the ones we created for non-ok responses)
        throw error;
    }
};
