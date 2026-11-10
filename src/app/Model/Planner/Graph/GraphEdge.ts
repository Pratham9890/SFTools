import {GraphPoint} from '@src/Model/Planner/Graph/GraphPoint';

export interface GraphEdge
{
	readonly sourceId: string;
	readonly targetId: string;
	readonly itemClassName: string;
	/** Not readonly: GraphReconciler adjusts it after manual edits. */
	amount: number;
	vertices?: GraphPoint[];
	/** Set when the automatic layout created the vertices; a moved node drops them. */
	autoRouted?: boolean;
	labelDistance?: number;
}
