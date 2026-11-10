import {MachineDisplayMode} from '@src/Model/Settings/MachineDisplayMode';
import {NodeColors} from '@src/Model/Settings/NodeColors';

export interface GraphSettings
{

	readonly sloopGlow: boolean;

	readonly simplifyWhenZoomedOut: boolean;

	readonly showEdgeItemIcons: boolean;

	readonly showEdgeLabelBoxes: boolean;

	readonly addBendPointsByClick: boolean;

	/** "100/3" instead of "33.3334" for clock speeds that are really thirds, sixths and so on. */
	readonly showClockFractions: boolean;

	readonly showNodeItemIcons: boolean;

	readonly showNodeBuildingIcons: boolean;

	readonly showSubplanItemIcons: boolean;

	readonly showSloopCornerIcon: boolean;

	readonly machineDisplay: MachineDisplayMode;

	readonly nodeScale: number;

	readonly edgeScale: number;

	readonly nodeAccentColors: NodeColors;

	/** Node fill = accent colour × this (0-1). */
	readonly nodeFillAmount: number;

}
