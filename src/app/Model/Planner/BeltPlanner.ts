import {Data} from '@src/Model/Data/Data';
import {BeltLayout} from '@src/Model/Planner/BeltLayout';
import {BeltConsumerPart, BeltLayoutResult, BeltUnit} from '@src/Model/Planner/BeltLayoutResult';
import {BeltLayoutSettings} from '@src/Model/Planner/BeltLayoutSettings';
import {ConveyorCapacity} from '@src/Model/Planner/ConveyorCapacity';
import {ConveyorLimit} from '@src/Model/Planner/ConveyorLimit';
import {ExtractorCapacity} from '@src/Model/Planner/ExtractorCapacity';
import {ExtractorRow} from '@src/Model/Planner/ExtractorSetup';
import {Formulas} from '@src/Model/Planner/Formulas';
import {Graph} from '@src/Model/Planner/Graph/Graph';
import {GraphEdge} from '@src/Model/Planner/Graph/GraphEdge';
import {MineNode} from '@src/Model/Planner/Solver/Response/MineNode';
import {Node} from '@src/Model/Planner/Solver/Response/Node';
import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';

export interface EdgeBeltPlan
{

	readonly edge: GraphEdge;

	readonly capacity: number;

	readonly isFluid: boolean;

	readonly layout: BeltLayoutResult;

	/** One entry per belt, in belt order. */
	readonly consumers: BeltConsumerPart[][];

}

/** Keyed by the edge's index in the rendered graph. */
export type BeltGraphPlan = Map<number, EdgeBeltPlan>;

interface MachineClock
{

	readonly clockSpeed: number;

	readonly sloops: number;

}

interface UnitDescriptor
{

	/** Singular, without a trailing plural. */
	readonly label: string;

	/** Displayed machine number, counted per building kind for mines and globally for recipe machines. */
	readonly number: number;

}

interface DescribeEntry
{

	readonly number: number;

	readonly label: string;

	readonly partial: boolean;

}

interface DescribeSegment
{

	readonly numbers: number[];

	readonly partial: boolean;

}

interface DescribeGroup
{

	readonly label: string;

	entries: DescribeEntry[];

}

/** Runs the belt layout engine over every connection of a graph. Pure: no Angular, no services. */
export class BeltPlanner
{

	private static readonly EPSILON = 1e-9;
	private static readonly PURE_SATELLITES = ['impure', 'normal', 'pure'] as const;

	public static planGraph(graph: Graph, limit: ConveyorLimit, settings: BeltLayoutSettings, data: Data): BeltGraphPlan
	{
		const plan: BeltGraphPlan = new Map();
		const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
		const outgoingTotals = new Map<string, number>();
		for (const edge of graph.edges) {
			const key = BeltPlanner.flowKey(edge.sourceId, edge.itemClassName);
			outgoingTotals.set(key, (outgoingTotals.get(key) ?? 0) + edge.amount);
		}

		graph.edges.forEach((edge, index) => {
			if (!(edge.amount > 0)) {
				return;
			}
			const source = nodeById.get(edge.sourceId);
			const target = nodeById.get(edge.targetId);
			if (!source || !target) {
				return;
			}
			const item = data.searchItemByClassName(edge.itemClassName) ?? null;
			const isFluid = ConveyorCapacity.isFluid(item);
			const capacity = ConveyorCapacity.capacity(limit, isFluid);
			if (!(capacity > 0)) {
				return;
			}
			const outgoingTotal = outgoingTotals.get(BeltPlanner.flowKey(edge.sourceId, edge.itemClassName)) ?? edge.amount;
			const sourceUnits = BeltPlanner.sourceUnits(source, edge.itemClassName, edge.amount, outgoingTotal, capacity, data);
			// A proposal regroups the whole source node, so it only fits when this connection takes all of the node's item.
			const soleOutput = Math.abs(outgoingTotal - edge.amount) <= Math.max(1e-6, edge.amount * 1e-6);
			const layout = BeltLayout.plan(
				edge.amount,
				capacity,
				sourceUnits.units,
				settings,
				soleOutput ? sourceUnits.ratePerMachineAt100 ?? undefined : undefined,
				soleOutput ? sourceUnits.maxClock : undefined,
			);
			const consumerUnits = BeltPlanner.consumerUnits(target, edge.amount);
			plan.set(index, {
				edge,
				capacity,
				isFluid,
				layout,
				consumers: BeltLayout.assignConsumers(layout.belts, consumerUnits),
			});
		});
		return plan;
	}

	/**
	 * Compresses machine numbers into ranges, using the machines' short names: "smelters 1–16",
	 * "smelter 17 (part)", "Mk.2 miners 1–2 + pure well satellite 1". Empty parts are freely divisible flow and name the node itself.
	 * `totals` (each unit's rate across every belt) marks a straddling machine's part.
	 */
	public static describe(
		parts: readonly {unitId: string; rate?: number}[],
		node: Node,
		totals?: ReadonlyMap<string, number>,
		data?: Data | null,
	): string
	{
		// Nodes without machines (products, inputs, sinks...) take or give the flow as a whole: name the node.
		if (parts.length === 0) {
			return node.getDisplayName();
		}
		const groups = BeltPlanner.groupParts(parts, node, totals, data);
		const texts: string[] = [];
		for (const group of groups) {
			for (const segment of BeltPlanner.segments(group.entries)) {
				const count = segment.numbers.length;
				const base = count === 1 ? group.label : BeltPlanner.plural(group.label);
				const range = count === 1
					? `${segment.numbers[0]}`
					: `${segment.numbers[0]}–${segment.numbers[count - 1]}`;
				texts.push(`${base} ${range}${segment.partial ? ' (part)' : ''}`);
			}
		}
		return texts.length > 0 ? texts.join(' + ') : node.getDisplayName();
	}

	/** Compact machine numbers for a node's stat line: "1–6", "7", "8½" (the last machine straddles belts). */
	public static machineRanges(
		parts: readonly {unitId: string; rate?: number}[],
		node: Node,
		totals?: ReadonlyMap<string, number>,
		data?: Data | null,
	): string
	{
		if (parts.length === 0) {
			return '';
		}
		const groups = BeltPlanner.groupParts(parts, node, totals, data);
		const texts: string[] = [];
		for (const group of groups) {
			const ranges = BeltPlanner.segments(group.entries).map(segment => {
				const count = segment.numbers.length;
				const range = count === 1
					? `${segment.numbers[0]}`
					: `${segment.numbers[0]}–${segment.numbers[count - 1]}`;
				return segment.partial ? `${range}½` : range;
			});
			texts.push(ranges.join(', '));
		}
		return texts.join(' + ');
	}

	private static groupParts(
		parts: readonly {unitId: string; rate?: number}[],
		node: Node,
		totals?: ReadonlyMap<string, number>,
		data?: Data | null,
	): DescribeGroup[]
	{
		const descriptors = BeltPlanner.descriptorsFor(node, data ?? null);
		const groups: DescribeGroup[] = [];
		const groupByLabel = new Map<string, DescribeGroup>();
		for (const part of parts) {
			const unit = BeltPlanner.unitNumber(part.unitId);
			if (unit <= 0) {
				continue;
			}
			const descriptor = descriptors[unit - 1];
			const label = descriptor?.label ?? 'machine';
			let group = groupByLabel.get(label);
			if (!group) {
				group = {label, entries: []};
				groupByLabel.set(label, group);
				groups.push(group);
			}
			const total = totals?.get(part.unitId);
			const partial = part.rate !== undefined && total !== undefined
				&& part.rate < total - Math.max(BeltPlanner.EPSILON, Math.abs(total) * BeltPlanner.EPSILON);
			group.entries.push({number: descriptor?.number ?? unit, label, partial});
		}
		groups.forEach(group => group.entries.sort((left, right) => left.number - right.number));
		return groups;
	}

	private static sourceUnits(
		node: Node,
		itemClassName: string,
		edgeAmount: number,
		outgoingTotal: number,
		capacity: number,
		data: Data,
	): {units: BeltUnit[]; ratePerMachineAt100: number | null; maxClock: number | undefined}
	{
		if (node instanceof RecipeNode) {
			return BeltPlanner.recipeSourceUnits(node, itemClassName, edgeAmount, outgoingTotal);
		}
		if (node instanceof MineNode) {
			return {units: BeltPlanner.mineSourceUnits(node, edgeAmount, capacity, data), ratePerMachineAt100: null, maxClock: undefined};
		}
		return {units: [], ratePerMachineAt100: null, maxClock: undefined};
	}

	private static recipeSourceUnits(
		node: RecipeNode,
		itemClassName: string,
		edgeAmount: number,
		outgoingTotal: number,
	): {units: BeltUnit[]; ratePerMachineAt100: number | null; maxClock: number}
	{
		const output = BeltPlanner.amountFor(node.outputs, itemClassName);
		const machines = BeltPlanner.machines(node);
		const totalWeight = machines.reduce(
			(sum, machine) => sum + machine.clockSpeed * Formulas.sloopOutputMultiplier(node.machine, machine.sloops),
			0,
		);
		const edgeFactor = outgoingTotal > 0 ? edgeAmount / outgoingTotal : 0;
		const units: BeltUnit[] = [];
		machines.forEach((machine, index) => {
			const weight = machine.clockSpeed * Formulas.sloopOutputMultiplier(node.machine, machine.sloops);
			units.push({
				id: `${node.id}#${index + 1}`,
				rate: totalWeight > 0 ? output * weight / totalWeight * edgeFactor : 0,
			});
		});
		const hasSloops = machines.some(machine => machine.sloops > 0);
		const ratePerMachineAt100 = !hasSloops && totalWeight > 0 && output > 0
			? output / totalWeight * 100 * edgeFactor
			: null;
		return {
			units,
			ratePerMachineAt100,
			maxClock: node.machine.maxOverclock * 100 + 3 * Formulas.CLOCK_PER_SHARD,
		};
	}

	private static mineSourceUnits(node: MineNode, edgeAmount: number, capacity: number, data: Data): BeltUnit[]
	{
		const rows = node.extractors;
		if (rows === null || rows.length === 0) {
			return [];
		}
		const rates: number[] = [];
		for (const row of rows) {
			const building = data.searchBuildingByClassName(row.buildingClassName);
			if (!building) {
				continue;
			}
			if (ExtractorCapacity.isWellRow(row)) {
				const satellites = ExtractorCapacity.satellites(row);
				for (let well = 0; well < BeltPlanner.count(row.count); well++) {
					for (const purity of BeltPlanner.PURE_SATELLITES) {
						const satellitesOfPurity = Math.max(0, Math.round(satellites[purity]));
						for (let satellite = 0; satellite < satellitesOfPurity; satellite++) {
							rates.push(ExtractorCapacity.rowRate(
								BeltPlanner.wellSatelliteRow(row, purity),
								building,
								node.item,
								capacity,
								data,
							));
						}
					}
				}
				continue;
			}
			const rate = ExtractorCapacity.rowRate({...row, count: 1}, building, node.item, capacity, data);
			for (let extractor = 0; extractor < BeltPlanner.count(row.count); extractor++) {
				rates.push(rate);
			}
		}
		const total = rates.reduce((sum, rate) => sum + rate, 0);
		if (!(total > 0)) {
			return [];
		}
		const scale = edgeAmount / total;
		return rates.map((rate, index) => ({id: `${node.id}#${index + 1}`, rate: rate * scale}));
	}

	private static consumerUnits(node: Node, edgeAmount: number): BeltUnit[]
	{
		if (!(node instanceof RecipeNode)) {
			return [];
		}
		const machines = BeltPlanner.machines(node);
		const totalClock = machines.reduce((sum, machine) => sum + machine.clockSpeed, 0);
		if (!(totalClock > 0)) {
			return [];
		}
		return machines.map((machine, index) => ({
			id: `${node.id}#${index + 1}`,
			rate: edgeAmount * machine.clockSpeed / totalClock,
		}));
	}

	private static machines(node: RecipeNode): MachineClock[]
	{
		const machines: MachineClock[] = [];
		for (const group of node.groups) {
			const count = BeltPlanner.count(group.machines);
			for (let machine = 0; machine < count; machine++) {
				machines.push({clockSpeed: group.clockSpeed, sloops: group.sloops});
			}
		}
		return machines;
	}

	private static descriptorsFor(node: Node, data: Data | null): UnitDescriptor[]
	{
		if (node instanceof RecipeNode) {
			const label = BeltPlanner.buildingLabel(node.machine.name);
			const descriptors: UnitDescriptor[] = [];
			BeltPlanner.machines(node).forEach((_, index) => descriptors.push({label, number: index + 1}));
			return descriptors;
		}
		if (node instanceof MineNode) {
			return BeltPlanner.mineDescriptors(node, data);
		}
		return [];
	}

	private static mineDescriptors(node: MineNode, data: Data | null): UnitDescriptor[]
	{
		const descriptors: UnitDescriptor[] = [];
		const rows = node.extractors;
		if (rows === null) {
			return descriptors;
		}
		// Number each building kind from 1, so a belt reads "Mk.2 miners 1–2 + pure well satellite 1".
		const counters = new Map<string, number>();
		const add = (label: string): void => {
			const number = (counters.get(label) ?? 0) + 1;
			counters.set(label, number);
			descriptors.push({label, number});
		};
		for (const row of rows) {
			const building = data?.searchBuildingByClassName(row.buildingClassName) ?? null;
			if (ExtractorCapacity.isWellRow(row)) {
				const satellites = ExtractorCapacity.satellites(row);
				for (let well = 0; well < BeltPlanner.count(row.count); well++) {
					for (const purity of BeltPlanner.PURE_SATELLITES) {
						const satellitesOfPurity = Math.max(0, Math.round(satellites[purity]));
						for (let satellite = 0; satellite < satellitesOfPurity; satellite++) {
							add(`${purity} well satellite`);
						}
					}
				}
				continue;
			}
			const buildingLabel = building ? BeltPlanner.buildingLabel(building.name) : 'extractor';
			const hasPurity = building !== null && ExtractorCapacity.hasPurity(building, node.item);
			const label = hasPurity && row.purity !== 'normal' ? `${row.purity} ${buildingLabel}` : buildingLabel;
			for (let extractor = 0; extractor < BeltPlanner.count(row.count); extractor++) {
				add(label);
			}
		}
		return descriptors;
	}

	private static segments(entries: readonly DescribeEntry[]): DescribeSegment[]
	{
		const segments: DescribeSegment[] = [];
		for (const entry of entries) {
			const last = segments[segments.length - 1];
			if (last !== undefined
				&& last.partial === entry.partial
				&& last.numbers[last.numbers.length - 1] + 1 === entry.number) {
				last.numbers.push(entry.number);
			} else {
				segments.push({numbers: [entry.number], partial: entry.partial});
			}
		}
		return segments;
	}

	private static buildingLabel(name: string): string
	{
		const match = name.match(/^(.*?)\s+(Mk\.?\s*\d+.*)$/i);
		const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);
		return match ? `${match[2]} ${lower(match[1])}` : lower(name);
	}

	private static plural(label: string): string
	{
		if (/(s|x|z|ch|sh)$/i.test(label)) {
			return `${label}es`;
		}
		if (/[^aeiou]y$/i.test(label)) {
			return `${label.slice(0, -1)}ies`;
		}
		return `${label}s`;
	}

	private static wellSatelliteRow(row: ExtractorRow, purity: 'impure' | 'normal' | 'pure'): ExtractorRow
	{
		return {
			...row,
			count: 1,
			satellites: {
				impure: purity === 'impure' ? 1 : 0,
				normal: purity === 'normal' ? 1 : 0,
				pure: purity === 'pure' ? 1 : 0,
			},
		};
	}

	private static amountFor(ios: readonly {item: {className: string}; maxAmount: number}[], itemClassName: string): number
	{
		return ios.reduce((sum, io) => sum + (io.item.className === itemClassName ? io.maxAmount : 0), 0);
	}

	private static unitNumber(unitId: string): number
	{
		const separator = unitId.lastIndexOf('#');
		const number = separator < 0 ? NaN : Number.parseInt(unitId.slice(separator + 1), 10);
		return Number.isFinite(number) ? number : 0;
	}

	private static count(value: number): number
	{
		return Math.max(0, Math.round(value));
	}

	private static flowKey(nodeId: string, itemClassName: string): string
	{
		return `${nodeId}\n${itemClassName}`;
	}

}
