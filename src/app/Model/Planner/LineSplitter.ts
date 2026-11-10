import {Data} from '@src/Model/Data/Data';
import {Graph} from '@src/Model/Planner/Graph/Graph';
import {GraphEdge} from '@src/Model/Planner/Graph/GraphEdge';
import {ConveyorCapacity} from '@src/Model/Planner/ConveyorCapacity';
import {ConveyorLimit} from '@src/Model/Planner/ConveyorLimit';
import {Formulas} from '@src/Model/Planner/Formulas';
import {GroupingMode} from '@src/Model/Planner/GroupingMode';
import {LineSplitPlan, LineSplitResult} from '@src/Model/Planner/LineSplit';
import {MachineGroupNormalizer} from '@src/Model/Planner/MachineGroupNormalizer';
import {Node} from '@src/Model/Planner/Solver/Response/Node';
import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';

/** A node being divided into lines: one part per line, each taking `shares[line]` of the node. */
interface Replacement
{
	readonly parts: readonly RecipeNode[];
	readonly shares: readonly number[];
}

/**
 * Divides production into lines, one belt each, so each line is a separate manifold (its own set of buildings):
 * - an over-limit connection splits both of its blocks into one part per belt;
 * - a block that makes more of an item than one belt carries, for several consumers, splits into belt-sized lines;
 * - a block that takes more of an item than one belt carries, from several belts, splits into one part per incoming belt.
 * Whatever else a split block is connected to is filled line by line, so belts stay full and each line feeds as few blocks as possible.
 */
export class LineSplitter
{

	private static readonly EPSILON = 1e-9;

	/** Pieces smaller than this (per minute) are float noise left over by the fill. */
	private static readonly NOISE = 1e-6;

	/** Wider than the widest standard recipe node (360) plus the default node spacing, so stacked parts cannot overlap. */
	private static readonly HORIZONTAL_STEP = 390;

	/** Taller than the tallest standard recipe node plus the default node spacing. */
	private static readonly VERTICAL_STEP = 130;

	private readonly normalizer = new MachineGroupNormalizer();

	public plan(graph: Graph, edgeIndex: number, capacity: number, mode: GroupingMode, data: Data): LineSplitResult
	{
		const edge = graph.edges[edgeIndex];
		if (!edge) {
			return {blocked: 'The connection no longer exists'};
		}
		if (!(capacity > 0)) {
			return {blocked: 'No belt capacity is set'};
		}
		if (ConveyorCapacity.countNeeded(edge.amount, capacity) < 2) {
			return {blocked: 'This connection fits on one belt'};
		}

		const source = graph.nodes.find(node => node.id === edge.sourceId) ?? null;
		const target = graph.nodes.find(node => node.id === edge.targetId) ?? null;
		if (source === null || target === null) {
			return {blocked: 'The connection no longer exists'};
		}
		if (source.locked || target.locked) {
			return {blocked: 'A locked block keeps its machines'};
		}
		const sourceNode = source instanceof RecipeNode ? source : null;
		const targetNode = target instanceof RecipeNode ? target : null;
		if (sourceNode === null && targetNode === null) {
			return {blocked: 'No production machines to split'};
		}
		if (sourceNode !== null && targetNode !== null && sourceNode.id === targetNode.id) {
			return {blocked: 'A node cannot be split into lines against itself'};
		}
		if ((sourceNode !== null && LineSplitter.slooped(sourceNode)) || (targetNode !== null && LineSplitter.slooped(targetNode))) {
			return {blocked: 'Slooped machines can\'t be split into lines'};
		}
		if (sourceNode !== null && graph.edges.some((candidate, index) =>
			index !== edgeIndex && candidate.sourceId === sourceNode.id && candidate.itemClassName === edge.itemClassName)) {
			return {blocked: 'The producer feeds several connections of this item'};
		}
		if (targetNode !== null && graph.edges.some((candidate, index) =>
			index !== edgeIndex && candidate.targetId === targetNode.id && candidate.itemClassName === edge.itemClassName)) {
			return {blocked: 'The consumer takes this item from several connections'};
		}

		const rate = sourceNode !== null
			? this.machineRate(sourceNode, edge.itemClassName, 'output')
			: this.machineRate(targetNode!, edge.itemClassName, 'input');
		const flows = LineSplitter.lineFlows(edge.amount, capacity, rate, mode);

		// Like NodeSplitter, stack perpendicular to the connection so each line stays a row of its own.
		const stackAlongX = LineSplitter.stackAlongX(source, target);
		const sourceParts = sourceNode !== null ? this.parts(sourceNode, flows, edge.amount, mode, stackAlongX) : null;
		const targetParts = targetNode !== null ? this.parts(targetNode, flows, edge.amount, mode, stackAlongX) : null;

		return {
			mode,
			sourceId: edge.sourceId,
			targetId: edge.targetId,
			edgeIndex,
			itemClassName: edge.itemClassName,
			amount: edge.amount,
			flows,
			sourceParts,
			targetParts,
		};
	}

	/** Splits until every belt is within the limit. The next step is recomputed each round because ids and indices change. */
	public splitAll(graph: Graph, limit: ConveyorLimit, mode: GroupingMode, data: Data): Graph
	{
		const rounds = Math.max(200, graph.edges.length * 8);
		let current = graph;
		for (let round = 0; round < rounds; round++) {
			const next = this.splitConnection(current, limit, mode, data)
				?? this.splitProducer(current, limit, mode, data)
				?? this.splitConsumer(current, limit, mode, data);
			if (next === null) {
				break;
			}
			current = next;
		}
		return current;
	}

	public apply(graph: Graph, plan: LineSplitPlan): Graph
	{
		const edgeIndex = this.splitEdgeIndex(graph, plan);
		if (edgeIndex < 0) {
			return graph;
		}

		const shares = plan.flows.map(flow => flow / plan.amount);
		const replacements = new Map<string, Replacement>();
		if (plan.sourceParts !== null) {
			replacements.set(plan.sourceId, {parts: plan.sourceParts, shares});
		}
		if (plan.targetParts !== null) {
			replacements.set(plan.targetId, {parts: plan.targetParts, shares});
		}

		const edge = graph.edges[edgeIndex];
		const fixed = new Map<number, GraphEdge[]>([[edgeIndex, plan.flows.map((flow, line) => ({
			sourceId: plan.sourceParts !== null ? plan.sourceParts[line].id : edge.sourceId,
			targetId: plan.targetParts !== null ? plan.targetParts[line].id : edge.targetId,
			itemClassName: edge.itemClassName,
			amount: flow,
		}))]]);
		return this.rewrite(graph, replacements, fixed);
	}

	/** Eligibility does not depend on the mode, so the whole-machine one is used to keep the flow split cheap. */
	public eligibleEdges(graph: Graph, limit: ConveyorLimit, data: Data): number[]
	{
		const indices: number[] = [];
		graph.edges.forEach((edge, index) => {
			if (!('blocked' in this.plan(graph, index, LineSplitter.capacityFor(edge, limit, data), 'underclock-last', data))) {
				indices.push(index);
			}
		});
		return indices;
	}

	private splitConnection(graph: Graph, limit: ConveyorLimit, mode: GroupingMode, data: Data): Graph | null
	{
		const eligible = this.eligibleEdges(graph, limit, data);
		if (eligible.length === 0) {
			return null;
		}
		const edge = graph.edges[eligible[0]];
		const plan = this.plan(graph, eligible[0], LineSplitter.capacityFor(edge, limit, data), mode, data);
		return 'blocked' in plan ? null : this.apply(graph, plan);
	}

	/** A block making more of an item than one belt carries, for consumers the connection split could not take apart: divide it into belt-sized lines. */
	private splitProducer(graph: Graph, limit: ConveyorLimit, mode: GroupingMode, data: Data): Graph | null
	{
		for (const node of graph.nodes) {
			if (!this.splittable(graph, node)) {
				continue;
			}
			for (const [item, indices] of LineSplitter.groupEdges(graph, node.id, 'output')) {
				const capacity = LineSplitter.capacityFor(graph.edges[indices[0]], limit, data);
				const total = indices.reduce((sum, index) => sum + graph.edges[index].amount, 0);
				if (!(capacity > 0) || ConveyorCapacity.countNeeded(total, capacity) < 2) {
					continue;
				}
				const flows = LineSplitter.lineFlows(total, capacity, this.machineRate(node, item, 'output'), mode);
				const other = graph.nodes.find(candidate => candidate.id === graph.edges[indices[0]].targetId) ?? node;
				const parts = this.parts(node, flows, total, mode, LineSplitter.stackAlongX(node, other));
				// The item's own connections are filled like any other, so whole belts go to one consumer at a time.
				return this.rewrite(graph, new Map([[node.id, {parts, shares: flows.map(flow => flow / total)}]]), new Map());
			}
		}
		return null;
	}

	/** A block taking more of an item than one belt carries, from several belts: one part per incoming belt, so each belt feeds its own manifold. */
	private splitConsumer(graph: Graph, limit: ConveyorLimit, mode: GroupingMode, data: Data): Graph | null
	{
		for (const node of graph.nodes) {
			if (!this.splittable(graph, node)) {
				continue;
			}
			for (const [item, indices] of LineSplitter.groupEdges(graph, node.id, 'input')) {
				if (indices.length < 2) {
					continue;
				}
				const capacity = LineSplitter.capacityFor(graph.edges[indices[0]], limit, data);
				const total = indices.reduce((sum, index) => sum + graph.edges[index].amount, 0);
				if (!(capacity > 0) || ConveyorCapacity.countNeeded(total, capacity) < 2) {
					continue;
				}

				// Incoming connections are packed onto as few belts as possible, so small pieces share a line instead of each getting its own buildings.
				// Bins are whole belts: a belt feeding 4.5 machines' worth stays one line, its last machine underclocked.
				const lines = LineSplitter.pack(indices.map(index => ({index, amount: graph.edges[index].amount})), capacity);
				if (lines.length < 2) {
					continue;
				}
				const flows = lines.map(line => line.reduce((sum, piece) => sum + piece.amount, 0));
				const fixed = new Map<number, GraphEdge[]>();
				const other = graph.nodes.find(candidate => candidate.id === graph.edges[indices[0]].sourceId) ?? node;
				const parts = this.parts(node, flows, total, mode, LineSplitter.stackAlongX(other, node));
				lines.forEach((line, lineIndex) => line.forEach(({index, amount}) => {
					const edge = graph.edges[index];
					const pieces = fixed.get(index) ?? [];
					pieces.push({sourceId: edge.sourceId, targetId: parts[lineIndex].id, itemClassName: edge.itemClassName, amount});
					fixed.set(index, pieces);
				}));
				return this.rewrite(graph, new Map([[node.id, {parts, shares: flows.map(flow => flow / total)}]]), fixed);
			}
		}
		return null;
	}

	private splittable(graph: Graph, node: Node): node is RecipeNode
	{
		return node instanceof RecipeNode
			&& !node.locked
			&& !LineSplitter.slooped(node)
			&& !graph.edges.some(edge => edge.sourceId === node.id && edge.targetId === node.id);
	}

	/**
	 * Replaces nodes by their parts. `fixed` holds connections already divided; a connection between two replaced nodes
	 * pairs their lines; every other connection of a replaced node is filled line by line, per item and side.
	 */
	private rewrite(graph: Graph, replacements: ReadonlyMap<string, Replacement>, fixed: ReadonlyMap<number, GraphEdge[]>): Graph
	{
		const nodes: Node[] = [];
		graph.nodes.forEach(node => {
			const replacement = replacements.get(node.id);
			if (replacement !== undefined) {
				nodes.push(...replacement.parts);
			} else {
				nodes.push(node);
			}
		});

		const pieces = new Map<number, GraphEdge[]>(fixed);
		const groups = new Map<string, {replacement: Replacement; side: 'input' | 'output'; indices: number[]}>();
		graph.edges.forEach((edge, index) => {
			if (fixed.has(index)) {
				return;
			}
			const source = replacements.get(edge.sourceId);
			const target = replacements.get(edge.targetId);
			if (source !== undefined && target !== undefined) {
				pieces.set(index, source.shares.map((share, line) => ({
					sourceId: source.parts[line].id,
					targetId: target.parts[Math.min(line, target.parts.length - 1)].id,
					itemClassName: edge.itemClassName,
					amount: edge.amount * share,
				})));
				return;
			}
			const replaced = source ?? target;
			if (replaced === undefined) {
				return;
			}
			const side = source !== undefined ? 'output' : 'input';
			const key = `${source !== undefined ? edge.sourceId : edge.targetId}|${side}|${edge.itemClassName}`;
			const group = groups.get(key) ?? {replacement: replaced, side, indices: []};
			group.indices.push(index);
			groups.set(key, group);
		});

		const merged = new Set<number>();
		groups.forEach(({replacement, side, indices}) => {
			// Largest consumer first, so it takes whole belts and only the last line is shared.
			const order = [...indices].sort((a, b) => graph.edges[b].amount - graph.edges[a].amount);
			const first = Math.min(...indices);
			const list: GraphEdge[] = [];
			LineSplitter.fill(replacement.shares, order.map(index => graph.edges[index].amount)).forEach(({line, demand, amount}) => {
				const edge = graph.edges[order[demand]];
				const partId = replacement.parts[line].id;
				list.push({
					sourceId: side === 'output' ? partId : edge.sourceId,
					targetId: side === 'input' ? partId : edge.targetId,
					itemClassName: edge.itemClassName,
					amount,
				});
			});
			indices.forEach(index => merged.add(index));
			pieces.set(first, list);
		});

		const edges: GraphEdge[] = [];
		graph.edges.forEach((edge, index) => {
			const list = pieces.get(index);
			if (list !== undefined) {
				edges.push(...list);
			} else if (!merged.has(index)) {
				edges.push(edge);
			}
		});
		return {nodes, edges};
	}

	/** Uses the lines up in order (north-west corner fill), so each line feeds as few connections as possible. */
	private static fill(shares: readonly number[], demands: readonly number[]): {line: number; demand: number; amount: number}[]
	{
		const total = demands.reduce((sum, demand) => sum + demand, 0);
		const shareTotal = shares.reduce((sum, share) => sum + share, 0);
		if (!(total > 0) || !(shareTotal > 0)) {
			return [];
		}
		const supply = shares.map(share => share / shareTotal * total);
		const result: {line: number; demand: number; amount: number}[] = [];
		let line = 0;
		let left = supply[0];
		demands.forEach((demand, index) => {
			let need = demand;
			while (need > LineSplitter.NOISE && line < supply.length) {
				const take = Math.min(need, left);
				if (take > LineSplitter.NOISE) {
					result.push({line, demand: index, amount: take});
				}
				need -= take;
				left -= take;
				if (left <= LineSplitter.NOISE) {
					line++;
					left = supply[line] ?? 0;
				}
			}
			// Float drift past the last line stays on the last piece of this demand.
			const last = result[result.length - 1];
			if (need > LineSplitter.NOISE && last !== undefined && last.demand === index) {
				last.amount += need;
			}
		});
		return result;
	}

	/** Connection indices of a node on one side, per item. */
	private static groupEdges(graph: Graph, nodeId: string, side: 'input' | 'output'): Map<string, number[]>
	{
		const groups = new Map<string, number[]>();
		graph.edges.forEach((edge, index) => {
			if ((side === 'output' ? edge.sourceId : edge.targetId) !== nodeId) {
				return;
			}
			const list = groups.get(edge.itemClassName) ?? [];
			list.push(index);
			groups.set(edge.itemClassName, list);
		});
		return groups;
	}

	private static capacityFor(edge: GraphEdge, limit: ConveyorLimit, data: Data): number
	{
		const item = data.searchItemByClassName(edge.itemClassName) ?? null;
		return ConveyorCapacity.capacity(limit, ConveyorCapacity.isFluid(item));
	}

	private static slooped(node: RecipeNode): boolean
	{
		return node.groups.some(group => group.sloops > 0);
	}

	private static stackAlongX(source: Node, target: Node): boolean
	{
		return Math.abs(target.y - source.y) > Math.abs(target.x - source.x);
	}

	private static lineFlows(amount: number, capacity: number, machineRate: number, mode: GroupingMode): number[]
	{
		return mode === 'clock-equally'
			? LineSplitter.evenFlows(amount, capacity)
			: LineSplitter.fullFlows(amount, capacity, machineRate);
	}

	/** First-fit decreasing: connections stay whole where they fit, ones over a line are cut into full lines first. */
	private static pack(items: readonly {index: number; amount: number}[], perLine: number): {index: number; amount: number}[][]
	{
		const pieces: {index: number; amount: number}[] = [];
		items.forEach(({index, amount}) => {
			let left = amount;
			while (left > perLine * (1 + 1e-6) + LineSplitter.NOISE) {
				pieces.push({index, amount: perLine});
				left -= perLine;
			}
			if (left > LineSplitter.NOISE) {
				pieces.push({index, amount: left});
			}
		});
		pieces.sort((a, b) => b.amount - a.amount);

		const lines: {index: number; amount: number}[][] = [];
		const loads: number[] = [];
		pieces.forEach(piece => {
			const fit = loads.findIndex(load => load + piece.amount <= perLine * (1 + 1e-6) + LineSplitter.NOISE);
			if (fit < 0) {
				lines.push([piece]);
				loads.push(piece.amount);
			} else {
				lines[fit].push(piece);
				loads[fit] += piece.amount;
			}
		});
		return lines;
	}

	private static evenFlows(amount: number, capacity: number): number[]
	{
		const count = ConveyorCapacity.countNeeded(amount, capacity);
		const flow = amount / count;
		const flows = Array.from({length: count - 1}, () => flow);
		flows.push(amount - flow * (count - 1));
		return flows;
	}

	/** Whole machines per line: perLine is a whole multiple of the per-machine rate that still fits on a belt. */
	private static fullFlows(amount: number, capacity: number, machineRate: number): number[]
	{
		// Without a usable machine rate the belt becomes the unit, which still splits the connection sensibly.
		const rate = machineRate > LineSplitter.EPSILON ? machineRate : capacity;
		const wholeMachines = Math.floor(capacity / rate + LineSplitter.EPSILON);
		const perLine = wholeMachines >= 1 ? wholeMachines * rate : capacity;
		const count = ConveyorCapacity.countNeeded(amount, perLine);
		const flows = Array.from({length: count - 1}, () => perLine);
		flows.push(amount - perLine * (count - 1));
		return flows;
	}

	private machineRate(node: RecipeNode, itemClassName: string, side: 'input' | 'output'): number
	{
		const referenceCycles = Formulas.referenceCycles(node.recipe, node.machine);
		const amounts = side === 'output' ? node.recipe.products : node.recipe.ingredients;
		const matching = amounts.find(amount => amount.item?.className === itemClassName);
		if (matching) {
			return matching.amount * referenceCycles;
		}
		const io = side === 'output' ? node.outputs : node.inputs;
		const total = io
			.filter(entry => entry.item.className === itemClassName)
			.reduce((sum, entry) => sum + entry.maxAmount, 0);
		return node.target > 0 ? total / node.target : 0;
	}

	private parts(node: RecipeNode, flows: readonly number[], amount: number, mode: GroupingMode, stackAlongX: boolean): RecipeNode[]
	{
		const clockSpeed = this.clockSpeed(node);
		const sloops = node.groups[0]?.sloops ?? 0;
		const step = stackAlongX ? LineSplitter.HORIZONTAL_STEP : LineSplitter.VERTICAL_STEP;

		return flows.map((flow, index) => {
			const target = node.target * flow / amount;
			const groups = this.normalizer.generateForTarget(target, clockSpeed, sloops, mode);
			const part = new RecipeNode(index === 0 ? node.id : crypto.randomUUID(), target, groups, node.machine, node.recipe);
			const offset = step * (index - (flows.length - 1) / 2);
			part.x = node.x + (stackAlongX ? offset : 0);
			part.y = node.y + (stackAlongX ? 0 : offset);
			part.done = node.done;
			part.groupingMode = mode;
			return part;
		});
	}

	private clockSpeed(node: RecipeNode): number
	{
		const first = node.groups[0];
		if (!first) {
			return 100;
		}
		return node.groups.every(group => group.clockSpeed === first.clockSpeed) ? first.clockSpeed : 100;
	}

	private splitEdgeIndex(graph: Graph, plan: LineSplitPlan): number
	{
		const candidate = graph.edges[plan.edgeIndex];
		if (candidate
			&& candidate.sourceId === plan.sourceId
			&& candidate.targetId === plan.targetId
			&& candidate.itemClassName === plan.itemClassName) {
			return plan.edgeIndex;
		}
		return graph.edges.findIndex(edge =>
			edge.sourceId === plan.sourceId
			&& edge.targetId === plan.targetId
			&& edge.itemClassName === plan.itemClassName);
	}

}
