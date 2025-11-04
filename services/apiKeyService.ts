/**
 * Simulates handling of a .env file for the API key using localStorage.
 * In a browser environment, we cannot directly access or create filesystem files like .env.
 * localStorage provides a persistent key-value store on the user's browser for this purpose.
 */

const API_KEY_STORAGE_KEY = 'gemini_api_key';

/**
 * Saves the Gemini API key to localStorage.
 * @param key The API key string.
 */
export const saveApiKey = (key: string): void => {
  try {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
  } catch (error) {
    console.error("Could not save API key to localStorage", error);
  }
};

/**
 * Loads the Gemini API key from localStorage.
 * @returns The API key string, or null if not found.
 */
export const loadApiKey = (): string | null => {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
  } catch (error) {
    console.error("Could not load API key from localStorage", error);
    return null;
  }
};

/**
 * Loads the API key from storage and sets it on the simulated process.env object.
 * This makes it available to other services like the geminiService.
 * @returns True if the key was found and initialized, false otherwise.
 */
export const initializeApiKey = (): boolean => {
    const apiKey = loadApiKey();
    if (apiKey) {
        // @ts-ignore
        if (!process.env) process.env = {};
        // @ts-ignore
        process.env.API_KEY = apiKey;
        return true;
    }
    return false;
}
