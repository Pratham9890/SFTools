import {Data} from '@src/Model/Data/Data';
import {Building} from '@src/Model/Data/Entities/Building';
import {CountedNode} from '@src/Model/Planner/Breakdown/CountedNode';
import {ExtractorCapacity} from '@src/Model/Planner/ExtractorCapacity';
import {WELL_EXTRACTOR_CLASS} from '@src/Model/Planner/ExtractorSetup';
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
				if (ExtractorCapacity.isWellRow(extractor)) {
					// The well's pressurizer draws the power and takes the shards.
					this.addRow(map, building, machines, entry.done, entry.node.id, {
						shards: Formulas.powerShards(extractor.clockSpeed) * machines,
						power: PowerDraw.fixed(ExtractorCapacity.power([extractor], data) * entry.count),
						clockSpeed: extractor.clockSpeed,
					});
					// Its satellite extractors are separate buildings: build cost only, no power and no shards.
					const satellite = data.searchBuildingByClassName(WELL_EXTRACTOR_CLASS);
					const satellites = ExtractorCapacity.satelliteCount(extractor) * machines;
					if (satellite && satellites > 0) {
						this.addRow(map, satellite, satellites, entry.done, entry.node.id, {
							shards: 0,
							power: PowerDraw.ZERO,
							// Satellites run at 100%; only the pressurizer's clock scales their output.
							clockSpeed: 100,
						});
					}
					return;
				}
				this.addRow(map, building, machines, entry.done, entry.node.id, {
					shards: Formulas.powerShards(extractor.clockSpeed) * machines,
					power: PowerDraw.fixed(ExtractorCapacity.power([extractor], data) * entry.count),
					clockSpeed: extractor.clockSpeed,
				});
			});
		});

		return [...map.values()]
			.sort((a, b) => a.building.name.localeCompare(b.building.name))
			.map(row => ({...row, nodeIds: [...row.nodeIds]}));
	}

	private static addRow(
		map: Map<string, {building: Building; machines: number; builtMachines: number; shards: number; power: PowerDraw; groups: MachineGroup[]; nodeIds: Set<string>}>,
		building: Building,
		machines: number,
		done: boolean,
		nodeId: string,
		values: {shards: number; power: PowerDraw; clockSpeed: number},
	): void
	{
		const row = this.getOrCreate(map, building.className,
			() => ({building, machines: 0, builtMachines: 0, shards: 0, power: PowerDraw.ZERO, groups: [], nodeIds: new Set<string>()}));
		row.machines += machines;
		row.builtMachines += done ? machines : 0;
		row.shards += values.shards;
		row.power = row.power.add(values.power);
		row.groups.push({machines, clockSpeed: values.clockSpeed, sloops: 0});
		row.nodeIds.add(nodeId);
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
