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
  workflow: ComfyUIWorkflow;
  requirements: WorkflowRequirements;
  validationLog?: ValidationLogEntry[];
  correctionLog?: DebugLogEntry[];
}

export interface ValidationResponse {
    validationLog: ValidationLogEntry[];
    correctedWorkflow: ComfyUIWorkflow;
}

export interface DebugResponse {
    correctionLog: DebugLogEntry[];
    correctedWorkflow: ComfyUIWorkflow;
}

export interface HistoryEntry {
  id: string;
  prompt: string;
  timestamp: string;
  data: GeneratedWorkflowResponse;
}

export interface SystemInventory {
  checkpoints?: string[];
  loras?: string[];
  vaes?: string[];
  controlnet?: string[];
  [key: string]: string[] | undefined;
}
