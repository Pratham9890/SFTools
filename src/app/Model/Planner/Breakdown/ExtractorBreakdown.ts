import {Data} from '@src/Model/Data/Data';
import {Building} from '@src/Model/Data/Entities/Building';
import {CountedNode} from '@src/Model/Planner/Breakdown/CountedNode';
import {ExtractorCapacity} from '@src/Model/Planner/ExtractorCapacity';
import {Formulas} from '@src/Model/Planner/Formulas';
import {PowerDraw} from '@src/Model/Planner/PowerDraw';
import {MachineGroup} from '@src/Model/Planner/Solver/Response/MachineGroup';
import {MineNode} from '@src/Model/Planner/Solver/Response/MineNode';

/** What the extractors of a plan's mine nodes add up to, merged per extractor building. */
export interface ExtractorBuildingRow
{

	readonly building: Building;

	readonly machines: number;

	readonly builtMachines: number;

	readonly shards: number;

	readonly power: PowerDraw;

	readonly groups: MachineGroup[];

	readonly nodeIds: string[];

}

export class ExtractorBreakdown
{

	/** One row per extractor building; each mine node's rows count `entry.count` times (subplan builds). */
	public static rows(nodes: CountedNode<MineNode>[], data: Data | null): ExtractorBuildingRow[]
	{
		if (!data) {
			return [];
		}

		const map = new Map<string, {building: Building; machines: number; builtMachines: number; shards: number; power: PowerDraw; groups: MachineGroup[]; nodeIds: Set<string>}>();
		nodes.forEach(entry => {
			(entry.node.extractors ?? []).forEach(extractor => {
				const building = data.searchBuildingByClassName(extractor.buildingClassName);
				if (!building || extractor.count <= 0) {
					return;
				}
				const machines = extractor.count * entry.count;
				const row = this.getOrCreate(map, building.className,
					() => ({building, machines: 0, builtMachines: 0, shards: 0, power: PowerDraw.ZERO, groups: [], nodeIds: new Set<string>()}));
				row.machines += machines;
				row.builtMachines += entry.done ? machines : 0;
				row.shards += Formulas.powerShards(extractor.clockSpeed) * machines;
				row.power = row.power.add(PowerDraw.fixed(ExtractorCapacity.power([extractor], data) * entry.count));
				row.groups.push({machines, clockSpeed: extractor.clockSpeed, sloops: 0});
				row.nodeIds.add(entry.node.id);
			});
		});

		return [...map.values()]
			.sort((a, b) => a.building.name.localeCompare(b.building.name))
			.map(row => ({...row, nodeIds: [...row.nodeIds]}));
	}

	private static getOrCreate<K, V>(map: Map<K, V>, key: K, factory: () => V): V
	{
		let value = map.get(key);
		if (value === undefined) {
			value = factory();
			map.set(key, value);
		}
		return value;
	}

}
