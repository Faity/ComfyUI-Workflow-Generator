/**
 * Handles API key initialization from environment variables (.env file).
 * In a Vite setup, we read from import.meta.env.VITE_API_KEY.
 * We then map this to process.env.API_KEY for compatibility with the Google GenAI SDK.
 */

/**
 * Saves the Gemini API key.
 * DEPRECATED: In .env mode, we do not save keys to localStorage. 
 * This function is kept as a no-op for compatibility.
 * @param key The API key string.
 */
export const saveApiKey = (key: string): void => {
  console.warn("Attempted to save API Key to localStorage, but the app is configured to use .env files.");
};

/**
 * Loads the Gemini API key.
 * Checks the Vite environment variables.
 * @returns The API key string, or null if not found.
 */
export const loadApiKey = (): string | null => {
  // Vite exposes env variables prefixed with VITE_ via import.meta.env
  // Cast to any to avoid TS error "Property 'env' does not exist on type 'ImportMeta'"
  const envKey = (import.meta as any).env?.VITE_API_KEY;
  
  if (envKey && typeof envKey === 'string' && envKey.trim() !== '') {
    return envKey;
  }
  
  return null;
};

/**
 * Loads the API key from the environment and sets it on the simulated process.env object.
 * This makes it available to other services like the geminiService.
 * @returns True if the key was found and initialized, false otherwise.
 */
export const initializeApiKey = (): boolean => {
    const apiKey = loadApiKey();
    
    if (apiKey) {
        // Polyfill process for the Google SDK if it doesn't exist
        // @ts-ignore
        if (typeof window !== 'undefined' && !window.process) {
            // @ts-ignore
            window.process = { env: {} };
        }
        
        // @ts-ignore
        if (!process.env) process.env = {};
        
        // @ts-ignore
        process.env.API_KEY = apiKey;
        return true;
    }
    
    console.warn("VITE_API_KEY not found in environment variables.");
    return false;
}