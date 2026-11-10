import {MachineGroup} from '@src/Model/Planner/Solver/Response/MachineGroup';

/** One recipe node the fit rewrote from `before` to `after`; both keep its output. */
export interface ShardFitChange
{

	readonly nodeId: string;

	readonly before: MachineGroup[];

	readonly after: MachineGroup[];

	readonly shardsSaved: number;

	readonly machinesAdded: number;

}

export interface ShardFitResult
{

	readonly changes: ShardFitChange[];

	/** The plan's shard count after every change; below the budget when `fits`. */
	readonly shardsAfter: number;

	readonly fits: boolean;

}
