import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';

export type LineSplitStyle = 'full' | 'even';

/** What the graph rewrite needs, computed against one graph revision. */
export interface LineSplitPlan
{
	readonly style: LineSplitStyle;
	readonly sourceId: string;
	readonly targetId: string;
	readonly edgeIndex: number;
	readonly itemClassName: string;
	readonly amount: number;
	readonly flows: readonly number[];
	readonly sourceParts: readonly RecipeNode[] | null;
	readonly targetParts: readonly RecipeNode[] | null;
}

export interface LineSplitBlocked
{
	readonly blocked: string;
}

export type LineSplitResult = LineSplitPlan | LineSplitBlocked;
