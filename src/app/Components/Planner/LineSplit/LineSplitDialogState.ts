import {Data} from '@src/Model/Data/Data';
import {Graph} from '@src/Model/Planner/Graph/Graph';

/** The graph snapshot a line-split dialog was opened against. */
export interface LineSplitDialogState
{
	readonly graph: Graph;
	readonly edgeIndex: number;
	readonly capacity: number;
	readonly data: Data;
}
