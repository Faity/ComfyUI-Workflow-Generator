import React, { useState } from 'react';
import type { ComfyUIWorkflow, ComfyUINode } from '../types';
import NodeDetailModal from './NodeDetailModal';

// Constants for styling and layout
const NODE_HEADER_HEIGHT = 30;
const SLOT_HEIGHT = 20;
const NODE_PADDING = 10;

const typeColorMapping: { [key: string]: string } = {
  'MODEL': 'stroke-red-500',
  'CONDITIONING': 'stroke-yellow-500',
  'LATENT': 'stroke-purple-500',
  'VAE': 'stroke-cyan-500',
  'IMAGE': 'stroke-green-500',
  'CLIP': 'stroke-blue-500',
  '*': 'stroke-gray-400',
};

const getNodeColor = (type: string) => {
    if (type.includes('Loader')) return 'bg-blue-800';
    if (type.includes('Sampler')) return 'bg-red-800';
    if (type.includes('Encode')) return 'bg-yellow-800';
    if (type.includes('Decode')) return 'bg-cyan-800';
    if (type.includes('Image')) return 'bg-green-800';
    return 'bg-gray-700';
};


const WorkflowNode: React.FC<{ node: ComfyUINode; onClick: () => void; }> = ({ node, onClick }) => {
  const nodeHeight = Math.max(
    (Array.isArray(node.inputs) ? node.inputs.length : 0) * SLOT_HEIGHT,
    (Array.isArray(node.outputs) ? node.outputs.length : 0) * SLOT_HEIGHT
  ) + NODE_HEADER_HEIGHT + NODE_PADDING * 2;
  
  // Use provided size if available, otherwise calculate
  const width = node.size ? node.size['0'] : 250;
  const height = node.size ? node.size['1'] : nodeHeight;

  return (
    <div
      id={`node-${node.id}`}
      className="absolute bg-gray-800 border border-gray-600 rounded-lg shadow-lg text-white text-xs cursor-pointer hover:border-teal-500 transition-colors"
      style={{
        left: `${node.pos[0]}px`,
        top: `${node.pos[1]}px`,
        width: `${width}px`,
        minHeight: `${height}px`,
      }}
      onClick={onClick}
    >
      <div className={`p-2 rounded-t-lg font-bold ${getNodeColor(node.type)}`}>
        {node.title || node.type}
      </div>
      <div className="relative p-2">
        {Array.isArray(node.inputs) && node.inputs.map((input, index) => (
          <div key={index} className="flex items-center" style={{ height: `${SLOT_HEIGHT}px` }}>
            <div className="w-2 h-2 rounded-full bg-gray-500 mr-2"></div>
            <span>{input.name}</span>
          </div>
        ))}
        {Array.isArray(node.outputs) && node.outputs.map((output, index) => (
          <div key={index} className="absolute flex items-center right-2" style={{ top: `${NODE_HEADER_HEIGHT + index * SLOT_HEIGHT}px`, height: `${SLOT_HEIGHT}px`}}>
             <span>{output.name}</span>
            <div className="w-2 h-2 rounded-full bg-gray-500 ml-2"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

const WorkflowVisualizer: React.FC<{ workflow: ComfyUIWorkflow }> = ({ workflow }) => {
  const [selectedNode, setSelectedNode] = useState<ComfyUINode | null>(null);

  if (!workflow || !workflow.nodes) {
    return null;
  }

  const nodesById = new Map(workflow.nodes.map(node => [node.id, node]));

  // Calculate bounding box to set SVG size
  let maxX = 0;
  let maxY = 0;
  workflow.nodes.forEach(node => {
      const width = node.size ? node.size['0'] : 250;
      const height = node.size ? node.size['1'] : 100;
      maxX = Math.max(maxX, node.pos[0] + width);
      maxY = Math.max(maxY, node.pos[1] + height);
  });
  
  const getSlotPosition = (node: ComfyUINode, slotIndex: number, isInput: boolean) => {
    const x = isInput ? node.pos[0] : node.pos[0] + (node.size ? node.size['0'] : 250);
    const y = node.pos[1] + NODE_HEADER_HEIGHT + (slotIndex * SLOT_HEIGHT) + (SLOT_HEIGHT / 2);
    return { x, y };
  };

  return (
    <div className="relative w-full h-full overflow-auto bg-gray-900 p-4">
        <div className="relative" style={{ width: `${maxX + 50}px`, height: `${maxY + 50}px`}}>
            <svg className="absolute top-0 left-0 w-full h-full" style={{ zIndex: 0 }}>
                {workflow.links.map(link => {
                    const fromNode = nodesById.get(link[1]);
                    const toNode = nodesById.get(link[3]);
                    
                    if (!fromNode || !toNode) return null;

                    const fromSlotIndex = link[2];
                    const toSlotIndex = link[4];
                    const linkType = link[5];

                    const startPos = getSlotPosition(fromNode, fromSlotIndex, false);
                    const endPos = getSlotPosition(toNode, toSlotIndex, true);
                    
                    const controlPointX1 = startPos.x + 80;
                    const controlPointY1 = startPos.y;
                    const controlPointX2 = endPos.x - 80;
                    const controlPointY2 = endPos.y;

                    const pathData = `M ${startPos.x} ${startPos.y} C ${controlPointX1} ${controlPointY1}, ${controlPointX2} ${controlPointY2}, ${endPos.x} ${endPos.y}`;
                    
                    const colorClass = typeColorMapping[linkType] || typeColorMapping['*'];

                    return (
                        <path
                            key={link[0]}
                            d={pathData}
                            className={`${colorClass} fill-none`}
                            strokeWidth="2"
                        />
                    );
                })}
            </svg>
            <div className="relative" style={{ zIndex: 1 }}>
                {workflow.nodes.map(node => (
                    <WorkflowNode 
                        key={node.id} 
                        node={node} 
                        onClick={() => setSelectedNode(node)} 
                    />
                ))}
            </div>
        </div>
        {selectedNode && (
            <NodeDetailModal 
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
            />
        )}
    </div>
  );
};

export default WorkflowVisualizer;
