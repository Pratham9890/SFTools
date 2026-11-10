import {MachineGroup} from '@src/Model/Planner/Solver/Response/MachineGroup';
import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';

export type LineSplitStyle = 'full' | 'even';

export interface LineSplitMachinePart
{
	readonly machineName: string;
	readonly groups: readonly MachineGroup[];
}

export interface LineSplitLine
{
	readonly flow: number;
	readonly producer: LineSplitMachinePart | null;
	readonly consumer: LineSplitMachinePart | null;
}

export interface LineSplitMachineTotal
{
	readonly name: string;
	readonly before: number;
	readonly after: number;
}

/** Everything the graph rewrite and the dialog need, computed against one graph revision. */
export interface LineSplitPlan
{
	readonly style: LineSplitStyle;
	readonly sourceId: string;
	readonly targetId: string;
	readonly edgeIndex: number;
	readonly itemClassName: string;
	readonly itemName: string;
	readonly amount: number;
	readonly flows: readonly number[];
	readonly sourceParts: readonly RecipeNode[] | null;
	readonly targetParts: readonly RecipeNode[] | null;
	readonly lines: readonly LineSplitLine[];
	readonly machines: readonly LineSplitMachineTotal[];
	readonly powerBefore: number;
	readonly powerAfter: number;
}

export interface LineSplitBlocked
{
	readonly blocked: string;
}

export type LineSplitResult = LineSplitPlan | LineSplitBlocked;
