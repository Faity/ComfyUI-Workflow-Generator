import type { SystemInventory } from '../types';
import type { RagProvider } from '../App';

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