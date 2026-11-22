import {Node} from '@src/Model/Planner/Solver/Response/Node';
import {GraphEdge} from '@src/Model/Planner/Graph/GraphEdge';

export interface Graph
{
	readonly nodes: Node[];
	readonly edges: GraphEdge[];
	/** 2 = positions, vertices and ports come from FlowLayout. Older plans carry ELK routes and are re-laid out when opened. */
	layoutVersion?: number;
	/** Heights the layout gave each block, keyed by node id: taller blocks have room for their input ports. */
	layoutHeights?: Record<string, number>;
}
