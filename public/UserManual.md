# User Manual: AI ComfyUI Workflow Suite

Welcome to the AI ComfyUI Workflow Suite! This tool is designed to make creating, validating, and correcting ComfyUI workflows as easy as possible. Whether you're a beginner or an experienced ComfyUI user, this suite helps you quickly turn your ideas into functional workflows.

## Table of Contents
1.  [User Interface Overview](#user-interface-overview)
2.  [The "Generator" Tab](#the-generator-tab-creating-workflows)
3.  [The "Tester" Tab](#the-tester-tab-validating-and-fixing-workflows)
4.  [The "History" Tab](#the-history-tab-managing-past-work)
5.  [The "Local LLM" Tab](#the-local-llm-tab-managing-a-local-llm)
6.  [The Output Panel in Detail](#the-output-panel-in-detail)
7.  [Settings](#settings)
8.  [Tips for Best Results](#tips-for-best-results)
9.  [Quality & Technical Details](#quality--technical-details)

---

## User Interface Overview

The application is divided into a few main areas:

-   **Header:** Displays the application name. In the top right, you'll find a gear icon (`⚙️`) for **Settings** and a toggle to switch the language between English and German.
-   **Tab Bar:** Allows you to switch between the different functions: `Generator`, `Tester`, `History`, `Local LLM`, and `Documentation`.
-   **Main Window:** This is a two-part window. The left half changes based on the selected tab (the input area), while the right half is always the **Output Panel**, where results are displayed.

---

## The "Generator" Tab: Creating Workflows

This is the main area where you can create new workflows from a simple text description.

### 1. Describe Workflow
Enter a description of what your workflow should do in the large text box.

-   **Be detailed:** The more precise your description, the better the result. Instead of just "A picture of a cat," try "A photorealistic image of a cat in space wearing a helmet, using an SDXL model."
-   **Use examples:** Below the text box, you'll find some example prompts. Click on them to try them out.

### 2. Prompt Assistant
If you're unsure how to phrase your prompt, click the `Prompt Assistant` button. A chat window will open where an AI asks you targeted questions about style, composition, lighting, and more to refine your initial idea into a perfect, detailed prompt.

### 3. Workflow Wizard
For technically inclined users, the `Workflow Wizard` guides you through a series of technical questions (e.g., which model, which sampler) to construct a precise, technical prompt optimized for workflow generation.

### 4. Generate Workflow
Once you're satisfied with your description, click `Generate Workflow`. A progress bar will inform you about the individual steps: The AI analyzes your request, creates the workflow, and validates it. The result appears in the output panel.

---

## The "Tester" Tab: Validating and Fixing Workflows

Do you have an existing workflow that isn't working? You can get it fixed here.

-   **Workflow JSON:** Paste the complete JSON code of your ComfyUI workflow into this field.
-   **ComfyUI Error Message (Optional):** If ComfyUI produces a specific error message when running the workflow, paste it here. The AI will try to correct the workflow specifically to fix this error.
-   **Button:**
    -   If you only paste a workflow JSON, the button says `Validate & Correct`. The AI performs a general check.
    -   If you also provide an error message, the button changes to `Debug` for a targeted repair.

---

## The "History" Tab: Managing Past Work

Every workflow you create in the `Generator` tab is automatically saved here.

-   **List:** Shows all previous generations with their prompt and date.
-   **Select:** Click on an entry to display the result again in the output panel.
-   **Download (`📥`):** Download the workflow JSON of a specific entry directly.
-   **Clear History:** Permanently removes all entries. This action cannot be undone.

---

## The "Local LLM" Tab: Managing a Local LLM

This tab provides advanced features for interacting with a locally hosted Large Language Model (LLM). **Important:** These features require that you are running a compatible local LLM server and have correctly configured its address in the `Settings`.

### RAG / Knowledge Base
RAG (Retrieval-Augmented Generation) allows you to expand the LLM's knowledge with your own documents without retraining the model.

1.  **Select Files:** Drag and drop `.txt` or `.md` files into the upload area, or click to select files.
2.  **Upload:** Click `Upload Selected Files` to send the documents to your LLM's RAG service. The uploaded content will then be available to the model for queries.

### Fine-Tuning
Fine-tuning adjusts the behavior of the LLM by training it on a specific dataset.

1.  **Insert Training Data:** Paste your training data into the text field. The data must be in **JSONL format**, where each line is a JSON object. Example:
    `{"prompt": "Question 1", "completion": "Answer 1"}`
    `{"prompt": "Question 2", "completion": "Answer 2"}`
2.  **Start Training:** Click `Start Fine-Tuning` to send the training job to your local server. The progress will be displayed in the log window below.

---

## The Output Panel in Detail

This is where the results of your requests are displayed.

### Controls (top right)
-   **Validate & Correct (`🐛`):** Resubmits the current workflow to the AI for validation and correction. Useful if you've made manual changes or want a second opinion.
-   **Run (`▶️`):** Sends the workflow directly to your running ComfyUI instance for execution. **Important:** You must first configure the address of your ComfyUI API in the `Settings`!
-   **Load Workflow in ComfyUI (`📋`):** Copies the workflow to your clipboard and shows an instruction. You can then simply paste the workflow into ComfyUI using Ctrl+V.
-   **Copy JSON:** Copies the complete workflow JSON to your clipboard.
-   **Download:** Downloads the workflow as a `.json` file.

### Tabs
-   **Visualizer:** Shows a graphical representation of the nodes and their connections. This gives you a quick overview of the workflow's structure. You can click on individual nodes to view their details in a pop-up window.
-   **Workflow:** Shows the raw JSON code of the workflow.
-   **Requirements:** Lists all the models and custom nodes required for the workflow.
-   **Logs:** Displays validation or debugging information, if available.

### The "Requirements" Area
One of the most important sections! It lists everything you need for the workflow to function.
-   **Custom Nodes:** Shows which additional nodes you need to install. Includes a GitHub link and **directly copyable terminal commands** for easy installation.
-   **Models:** Lists all required models (e.g., Checkpoints, LoRAs, VAEs). Includes a download link and the **exact installation path** where you need to place the file in your `ComfyUI` directory.

---

## Settings

Click the gear icon (`⚙️`) in the top right to open the settings.

-   **ComfyUI API URL:** This is the most important setting for workflow execution. For the `Run` function to work, you must enter the address of your ComfyUI instance here. The default value is usually `http://127.0.0.1:8188`.
-   **Local LLM API URL:** Enter the base URL for your local LLM server here. This is required for the features in the "Local LLM" tab (RAG and Fine-Tuning).
-   **Download Source Code:** Downloads the entire source code of this web application as a single text file.

---

## Tips for Best Results

-   **Be specific:** Mention model types (SDXL, SD 1.5), techniques (Inpainting, ControlNet), and styles (photorealistic, anime) in your prompt.
-   **Provide context:** Explain the goal. Instead of "Two KSamplers," say "One KSampler for a base image and a second for a hi-res fix."
-   **Check components:** After generation, always check the "Requirements" section to ensure you have installed all necessary models and custom nodes.

---

## Quality & Technical Details

To ensure the highest reliability, every generated or corrected workflow undergoes a multi-stage internal validation process:

1.  **Structural Validation:** First, the basic structure of the JSON is checked. Every value must have the correct data type (e.g., a seed value must be a number, not text).
2.  **Graph Analysis:** The workflow is analyzed as a logical graph. The AI ensures all connections are consistent, all required inputs are connected, and no "orphan" nodes exist.
3.  **Semantic Validation:** This is an "expert check." The AI checks the settings in key nodes for plausibility. For example, a `CFG` value of `0` in a `KSampler`, which would ignore the prompt, is automatically corrected to a sensible default like `8.0`.
4.  **RFC Compliance & Schema Validation:** Every workflow is built to comply with the official ComfyUI RFCs and the latest Zod schema. This guarantees maximum structural correctness and compatibility.
