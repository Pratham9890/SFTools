import {Graph} from '@src/Model/Planner/Graph/Graph';
import {ShardFitResult} from '@src/Model/Planner/ShardFitChange';

/** The revived graph the fit was computed on, kept so Apply rewrites exactly what the dialog listed. */
export interface ShardFitPreview
{

	readonly planId: string;
	readonly budget: number;
	readonly used: number;
	readonly graph: Graph;
	readonly result: ShardFitResult;

}
