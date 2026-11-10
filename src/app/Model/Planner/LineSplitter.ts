import {Data} from '@src/Model/Data/Data';
import {Graph} from '@src/Model/Planner/Graph/Graph';
import {GraphEdge} from '@src/Model/Planner/Graph/GraphEdge';
import {ConveyorCapacity} from '@src/Model/Planner/ConveyorCapacity';
import {ConveyorLimit} from '@src/Model/Planner/ConveyorLimit';
import {Formulas} from '@src/Model/Planner/Formulas';
import {GroupingMode} from '@src/Model/Planner/GroupingMode';
import {LineSplitPlan, LineSplitResult, LineSplitStyle} from '@src/Model/Planner/LineSplit';
import {MachineGroupNormalizer} from '@src/Model/Planner/MachineGroupNormalizer';
import {Node} from '@src/Model/Planner/Solver/Response/Node';
import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';

/** Divides one connection and both of its production nodes into one node per belt, so each line is a separate manifold. */
export class LineSplitter
{

	private static readonly EPSILON = 1e-9;

	/** Wider than the widest standard recipe node (360) plus the default node spacing, so stacked parts cannot overlap. */
	private static readonly HORIZONTAL_STEP = 390;

	/** Taller than the tallest standard recipe node plus the default node spacing. */
	private static readonly VERTICAL_STEP = 130;

	private readonly normalizer = new MachineGroupNormalizer();

	public plan(graph: Graph, edgeIndex: number, capacity: number, style: LineSplitStyle, data: Data): LineSplitResult
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
		if ((sourceNode?.groups.some(group => group.sloops > 0) ?? false)
			|| (targetNode?.groups.some(group => group.sloops > 0) ?? false)) {
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

		const rateNode = sourceNode ?? targetNode!;
		const rate = sourceNode !== null
			? this.machineRate(sourceNode, edge.itemClassName, 'output')
			: this.machineRate(rateNode, edge.itemClassName, 'input');
		const flows = style === 'even'
			? LineSplitter.evenFlows(edge.amount, capacity)
			: LineSplitter.fullFlows(edge.amount, capacity, rate);

		// Like NodeSplitter, stack perpendicular to the connection so each line stays a row of its own.
		const stackAlongX = Math.abs(target.y - source.y) > Math.abs(target.x - source.x);
		const sourceParts = sourceNode !== null ? this.parts(sourceNode, flows, edge.amount, style, stackAlongX) : null;
		const targetParts = targetNode !== null ? this.parts(targetNode, flows, edge.amount, style, stackAlongX) : null;

		return {
			style,
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

	/** Divides every over-limit connection into one line per belt. Eligibility is recomputed each round because ids and indices change. */
	public splitAll(graph: Graph, limit: ConveyorLimit, style: LineSplitStyle, data: Data): Graph
	{
		const rounds = graph.edges.length * 4;
		let current = graph;
		for (let round = 0; round < rounds; round++) {
			const eligible = this.eligibleEdges(current, limit, data);
			if (eligible.length === 0) {
				break;
			}
			const edge = current.edges[eligible[0]];
			const item = data.searchItemByClassName(edge.itemClassName) ?? null;
			const capacity = ConveyorCapacity.capacity(limit, ConveyorCapacity.isFluid(item));
			const plan = this.plan(current, eligible[0], capacity, style, data);
			if ('blocked' in plan) {
				break;
			}
			current = this.apply(current, plan);
		}
		return current;
	}

	public apply(graph: Graph, plan: LineSplitPlan): Graph
	{
		const edgeIndex = this.splitEdgeIndex(graph, plan);
		if (edgeIndex < 0) {
			return graph;
		}

		const replacements = new Map<string, readonly RecipeNode[]>();
		if (plan.sourceParts !== null) {
			replacements.set(plan.sourceId, plan.sourceParts);
		}
		if (plan.targetParts !== null) {
			replacements.set(plan.targetId, plan.targetParts);
		}

		const nodes: Node[] = [];
		graph.nodes.forEach(node => {
			const parts = replacements.get(node.id);
			if (parts !== undefined) {
				nodes.push(...parts);
			} else {
				nodes.push(node);
			}
		});
		const shares = plan.flows.map(flow => flow / plan.amount);
		const edges: GraphEdge[] = [];
		graph.edges.forEach((edge, index) => {
			if (index === edgeIndex) {
				plan.flows.forEach((flow, line) => edges.push({
					sourceId: plan.sourceParts !== null ? plan.sourceParts[line].id : edge.sourceId,
					targetId: plan.targetParts !== null ? plan.targetParts[line].id : edge.targetId,
					itemClassName: edge.itemClassName,
					amount: flow,
				}));
				return;
			}

			const sourceParts = replacements.get(edge.sourceId);
			const targetParts = replacements.get(edge.targetId);
			if (sourceParts === undefined && targetParts === undefined) {
				edges.push(edge);
				return;
			}
			plan.flows.forEach((_flow, line) => edges.push({
				sourceId: sourceParts !== undefined ? sourceParts[line].id : edge.sourceId,
				targetId: targetParts !== undefined ? targetParts[line].id : edge.targetId,
				itemClassName: edge.itemClassName,
				amount: edge.amount * shares[line],
			}));
		});

		return {nodes, edges};
	}

	public eligibleEdges(graph: Graph, limit: ConveyorLimit, data: Data): number[]
	{
		const indices: number[] = [];
		graph.edges.forEach((edge, index) => {
			const item = data.searchItemByClassName(edge.itemClassName) ?? null;
			const capacity = ConveyorCapacity.capacity(limit, ConveyorCapacity.isFluid(item));
			if (!('blocked' in this.plan(graph, index, capacity, 'full', data))) {
				indices.push(index);
			}
		});
		return indices;
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

	private parts(node: RecipeNode, flows: readonly number[], amount: number, style: LineSplitStyle, stackAlongX: boolean): RecipeNode[]
	{
		const mode: GroupingMode = style === 'full' ? 'underclock-last' : 'clock-equally';
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
