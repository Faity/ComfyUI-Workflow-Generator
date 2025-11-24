# User Manual: AI ComfyUI Workflow Suite

Welcome to the AI ComfyUI Workflow Suite! This tool is your intelligent assistant for creating, validating, and optimizing ComfyUI workflows.

This documentation guides you through the application's features, from the first prompt to automated learning from success.

## Table of Contents

1.  [Step 1: Generating Workflows](#step-1-generating-workflows)
    *   [Prompting & Assistants](#prompting--assistants)
    *   [Format Selection: Graph vs. API](#format-selection-graph-vs-api)
    *   [Uploading Images](#uploading-images)
2.  [Step 2: Results & Execution](#step-2-results--execution)
    *   [The New Output Panel](#the-new-output-panel)
    *   [Running Workflows](#running-workflows)
3.  [Step 3: The Feedback Loop (Learning)](#step-3-the-feedback-loop-learning)
4.  [The "Tester" Tab: Repair & Validation](#the-tester-tab-repair--validation)
5.  [Advanced Features](#advanced-features)
    *   [Local LLM (RAG & Fine-Tuning)](#local-llm-rag--fine-tuning)
    *   [History](#history)
6.  [Settings & Configuration](#settings--configuration)
7.  [Troubleshooting](#troubleshooting)

---

## Step 1: Generating Workflows

The **Generator Tab** is your starting point. Here, you translate your ideas into technical ComfyUI structures.

### Prompting & Assistants
Enter your idea into the text field. The more precise, the better.
*   **Prompt Assistant (`✨`):** Starts a chat to refine your artistic vision (style, lighting, composition).
*   **Workflow Wizard (`🧠`):** Starts a technical dialogue to query specific parameters (model, sampler, scheduler).

### Format Selection: Graph vs. API
You can now choose the format in which the workflow should be created:

1.  **Graph (Visual):** The standard format for the ComfyUI GUI (`.json`). Contains position data for nodes and links. Choose this if you want to verify and edit the workflow manually in ComfyUI.
2.  **API (JSON):** A pure data format often used by developers. It contains no visual information (positions), only logic. It is often more robust and less prone to errors when generating complex structures.

### Uploading Images
For workflows like **Img2Img**, **Inpainting**, or **ControlNet**:
*   Drag an image into the upload area.
*   The AI automatically detects the image and builds a `LoadImage` node into the workflow that references exactly this file.

---

## Step 2: Results & Execution

After generation, the result appears in the right **Output Panel**. This has been optimized for better clarity.

### The New Output Panel
Instead of an often buggy visual preview, we focus on code and guidance:

*   **"JSON Code" Tab:** Shows the generated raw code. Here you can copy (`📋`) or download (`📥`) the code.
*   **"Guide & Setup" Tab:** A nicely formatted view of requirements.
    *   **Custom Nodes:** Lists missing extensions, including installation commands.
    *   **Models:** Lists required Checkpoints/LoRAs, including download links and target folders.
*   **"Logs" Tab:** Appears only if the AI found and automatically corrected errors during validation.

### Running Workflows
Use the **Play Button (`▶️`)** to send the workflow directly to your running ComfyUI instance.
*   **Prerequisite:** The ComfyUI URL must be configured in Settings.
*   **Live Status:** You see a progress bar showing in real-time which node is currently being processed in ComfyUI.

---

## Step 3: The Feedback Loop (Learning)

This is one of the suite's most powerful features.

**When does it appear?**
As soon as a workflow has run successfully (Status 200 from the server), a green **Feedback Bar** appears in the Output Panel.

**What can I do?**
*   **Auto-Save (Short-Term):** Saves the workflow and prompt to the local LLM's short-term memory. Helps with similar requests in the current session.
*   **Gold Standard (Long-Term):** Marks this workflow as a "perfect example". It is added to the permanent knowledge base (RAG) and serves as a template for future generations.

*Note: This feature requires a configured Local LLM with RAG server.*

---

## The "Tester" Tab: Repair & Validation

Do you have a workflow (either Graph or API format) that isn't working?

1.  **Import:** Paste the JSON or upload the file.
2.  **Error Description (Optional):** Paste the error message from the ComfyUI console.
3.  **Debug:** Click the button. The AI analyzes the structure and attempts to fix the error based on its knowledge of nodes and connections.

---

## Advanced Features

### Local LLM (RAG & Fine-Tuning)
Manage your own AI brain in the **Local LLM** tab.
*   **RAG (Knowledge Base):** Upload text files (`.txt`, `.md`) to expand the AI's knowledge (e.g., documentation for new custom nodes). You can also test the database directly with a question.
*   **Fine-Tuning:** Start training jobs on your local server to specialize the model.

### History
All generated workflows are saved locally. In the **History** tab, you can restore, view, or download old versions.

---

## Settings & Configuration

Click the gear icon (`⚙️`) in the top right.

*   **ComfyUI API URL:** Address of your ComfyUI instance (usually `http://127.0.0.1:8188`).
*   **Local LLM API URL:** Address of your Ollama/RAG server.
*   **Provider:** Choose between Google Gemini (Cloud) or a local LLM (Ollama) as the brain for the generator.
*   **Source Code:** Download the complete source code of this app.

---

## Troubleshooting

### Connection Issues ("Run" Button)
If the "Run" button doesn't work, it's often due to browser CORS blocking.

**Solution:** Start ComfyUI with the `--enable-cors` argument.
Example (Windows .bat file):
`.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --enable-cors`

### Mixed Content Error
If this app runs via HTTPS but ComfyUI runs via HTTP, the browser blocks the connection.
**Solution:** Allow "Insecure Content" in your browser's site settings (lock icon in the address bar).
