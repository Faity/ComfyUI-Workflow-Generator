export const uploadRagDocument = async (file: File, apiUrl: string): Promise<{ message: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const endpoint = new URL('/v1/rag/upload', apiUrl).toString();

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData,
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
