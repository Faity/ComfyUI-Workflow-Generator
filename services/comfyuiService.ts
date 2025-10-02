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


export const testComfyUIConnection = async (apiUrl: string): Promise<{ success: boolean; message: string; data?: any }> => {
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
