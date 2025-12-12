
export interface ComfyUINode {
  id: number;
  type: string;
  pos: [number, number];
  size: { '0': number, '1': number };
  flags: object;
  order: number;
  mode: number;
  inputs?: Array<{ name: string; type: string; link: number | null }>;
  outputs?: Array<{ name: string; type: string; links: number[] | null; slot_index?: number }>;
  properties: { [key: string]: any };
  widgets_values?: any[];
  title?: string;
}

export type ComfyUILink = [number, number, number, number, number, string];

export interface ComfyUIWorkflow {
  last_node_id: number;
  last_link_id: number;
  nodes: ComfyUINode[];
  links: ComfyUILink[];
  groups: any[];
  config: object;
  extra: object;
  version: number;
}

export interface ComfyUIApiNode {
  class_type: string;
  inputs: { [key: string]: any };
  _meta?: { title?: string };
}

export interface ComfyUIApiWorkflow {
  [key: string]: ComfyUIApiNode;
}

export interface CustomNodeRequirement {
  name: string;
  url: string | null;
  install_instructions: string;
}

export interface ModelRequirement {
  name: string;
  url: string | null;
  model_type: string;
  install_path: string | null;
}

export interface WorkflowRequirements {
  custom_nodes: CustomNodeRequirement[];
  models: ModelRequirement[];
}

export interface ValidationLogEntry {
  check: string;
  status: 'passed' | 'corrected' | 'failed';
  details: string;
}

export interface DebugLogEntry {
  analysis: string;
  action: string;
  reasoning: string;
}

export interface GeneratedWorkflowResponse {
  workflow: ComfyUIWorkflow | ComfyUIApiWorkflow;
  requirements: WorkflowRequirements;
  validationLog?: ValidationLogEntry[];
  correctionLog?: DebugLogEntry[];
  thoughts?: string; // New field for Chain of Thought
}

export interface ValidationResponse {
    validationLog: ValidationLogEntry[];
    correctedWorkflow: ComfyUIWorkflow | ComfyUIApiWorkflow;
}

export interface DebugResponse {
    correctionLog: DebugLogEntry[];
    correctedWorkflow: ComfyUIWorkflow | ComfyUIApiWorkflow;
}

export interface HistoryEntry {
  id: string;
  prompt: string;
  timestamp: string;
  data: GeneratedWorkflowResponse;
  format?: WorkflowFormat;
  images?: ComfyUIImage[];
}

export interface SystemInventory {
  checkpoints?: string[];
  loras?: string[];
  vaes?: string[];
  controlnet?: string[];
  llm_models?: string[];
  [key: string]: string[] | undefined;
}

export interface ComfyUIImageUploadResponse {
  name: string;
  subfolder: string;
  type: 'input' | 'temp';
}

export interface ComfyUIImage {
  filename: string;
  subfolder: string;
  type: string;
}

export type LlmProvider = 'gemini' | 'local';
export type WorkflowFormat = 'graph' | 'api';
