import {ItemForm} from '@src/Model/API/Schema/Data/Parts/ItemForm';
import {Item} from '@src/Model/Data/Entities/Item';
import {ConveyorTiers} from '@src/Model/Map/ConveyorTiers';
import {ConveyorLimit} from '@src/Model/Planner/ConveyorLimit';
import {GraphEdge} from '@src/Model/Planner/Graph/GraphEdge';

export class ConveyorCapacity
{

	public static capacity(limit: ConveyorLimit, isFluid: boolean): number
	{
		return isFluid ? ConveyorTiers.pipe(limit.pipeMark) : ConveyorTiers.belt(limit.beltMark);
	}

	/** Typed targets such as 10.6667 leave the solver a few millionths over a tier's rate: not an extra line. */
	private static readonly ROUNDING = 1e-4;

	/** Amounts just over a tier's rate come from rounding, not an extra line. */
	public static countNeeded(amount: number, capacity: number): number
	{
		if (amount <= 0) {
			return 0;
		}
		return Math.max(1, Math.ceil(amount / capacity - ConveyorCapacity.ROUNDING));
	}

	public static label(limit: ConveyorLimit, isFluid: boolean, count: number): string
	{
		return isFluid ? `${count}× Mk.${limit.pipeMark} pipe` : `${count}× Mk.${limit.beltMark}`;
	}

	/** The same rule as RateFormatter: liquids and gases are fluids. */
	public static isFluid(item: Item | null): boolean
	{
		return item !== null && item.form !== ItemForm.Solid;
	}

	public static overLimitCount(edges: readonly GraphEdge[], limit: ConveyorLimit | undefined, itemFor: (itemClassName: string) => Item | null): number
	{
		if (limit === undefined) {
			return 0;
		}
		return edges.reduce((count, edge) => {
			const capacity = ConveyorCapacity.capacity(limit, ConveyorCapacity.isFluid(itemFor(edge.itemClassName)));
			return count + (ConveyorCapacity.countNeeded(edge.amount, capacity) > 1 ? 1 : 0);
		}, 0);
	}

}
