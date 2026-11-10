export type BeltLayoutMode = 'fewest' | 'even' | 'full';

/** Kept for stored plans: only 'custom' still matters, and means Belt management instead of splitting into lines. */
export type BeltLineStyle = 'even' | 'full' | 'custom';

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
	/** Only 'custom' (Belt management, no line splitting) still matters; machine grouping comes from the plan settings. Default 'even'. */
	readonly lineStyle: BeltLineStyle;
}
