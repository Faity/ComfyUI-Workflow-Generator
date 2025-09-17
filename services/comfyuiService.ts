import type { ComfyUIWorkflow } from '../types';

/**
 * Sends a workflow to a ComfyUI instance for execution.
 * @param workflow The ComfyUI workflow object.
 * @param apiUrl The base URL of the ComfyUI API (e.g., http://127.0.0.1:8188).
 * @returns The response from the ComfyUI server, typically containing a prompt_id.
 */
export const executeWorkflow = async (workflow: ComfyUIWorkflow, apiUrl: string): Promise<any> => {
    const clientId = crypto.randomUUID();

    const payload = {
        prompt: workflow,
        client_id: clientId,
    };
    
    // The endpoint is typically /prompt
    const endpoint = new URL('/prompt', apiUrl).toString();

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ComfyUI API error (${response.status}): ${errorText || response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) { // Network error
            throw new Error(`Failed to connect to ComfyUI at ${apiUrl}. Make sure the server is running and the URL is correct.`);
        }
        // Re-throw other errors (like the one we created for non-ok responses)
        throw error;
    }
};
