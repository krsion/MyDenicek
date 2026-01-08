export type { ElementNode, JsonDoc, Node, Transformation, ValueNode } from './types';

export {
    addChildNode,
    addElementChildNode, addSiblingNodeAfter, addSiblingNodeBefore, addTransformation, addValueChildNode, deleteNode, firstChildsTag, generalizeSelection, getUUID, initialDocument, LowestCommonAncestor, parents, updateAttribute,
    updateTag, updateValue, wrapNode
} from './Document';

export { Recorder, type RecordedAction } from './Recorder';
export { replayScript } from './replay';
export { UndoManager, type UndoEntry } from './UndoManager';

