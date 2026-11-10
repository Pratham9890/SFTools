import type {LineSplitStyle} from '@src/Model/Planner/LineSplit';

export type BeltLayoutMode = 'fewest' | 'even' | 'full';

/** 'custom' leaves multi-belt connections to Belt management instead of splitting them into lines. */
export type BeltLineStyle = LineSplitStyle | 'custom';

export interface BeltLayoutSettings
{
	readonly mode: BeltLayoutMode;
	/** 0 = use full capacity, 1 = as even as possible. Only for 'even'. */
	readonly evenness: number;
	/** true: one machine's output may be split across two belts. Only for 'even'. */
	readonly splitOutputs: boolean;
	/** Let the modes propose machine-count / clock changes ('full' may then raise production). Default false. */
	readonly allowPlanChanges: boolean;
	/** Draw each belt as its own line on the graph. Default false. */
	readonly beltView: boolean;
	/** How Belt view divides over-limit connections into lines. Default 'even'. */
	readonly lineStyle: BeltLineStyle;
}
