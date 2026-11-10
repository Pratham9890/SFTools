import {Formulas} from '@src/Model/Planner/Formulas';
import {GroupingMode} from '@src/Model/Planner/GroupingMode';
import {MachineGroupNormalizer} from '@src/Model/Planner/MachineGroupNormalizer';
import {ShardFitChange, ShardFitResult} from '@src/Model/Planner/ShardFitChange';
import {MachineGroup} from '@src/Model/Planner/Solver/Response/MachineGroup';
import {Node} from '@src/Model/Planner/Solver/Response/Node';
import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';

interface FitCandidate
{

	readonly node: RecipeNode;
	groups: MachineGroup[];

}

interface FitStep
{

	readonly candidate: FitCandidate;
	readonly groupIndex: number;
	readonly groups: MachineGroup[];
	readonly shardsSaved: number;
	readonly machinesAdded: number;

}

/**
 * Lowers clocks one shard tier at a time, adding machines so each node keeps its output.
 * Built nodes, slooped groups and generators are never touched.
 */
export class ShardBudgetFitter
{

	private static readonly normalizer = new MachineGroupNormalizer();

	public static fit(
		nodes: readonly Node[],
		budget: number,
		used: number,
		defaultGroupingMode: GroupingMode = 'underclock-last',
	): ShardFitResult
	{
		const target = Math.max(0, Math.round(budget));
		const candidates: FitCandidate[] = nodes
			.filter((node): node is RecipeNode => node instanceof RecipeNode
				&& !node.done
				&& node.groups.some(group => ShardBudgetFitter.isCandidateGroup(group)))
			.map(node => ({node, groups: node.groups.map(group => ({...group}))}));

		let shards = Math.max(0, used);
		while (shards > target) {
			const step = ShardBudgetFitter.bestStep(candidates, shards - target, defaultGroupingMode);
			if (step === null) {
				return {changes: ShardBudgetFitter.changesFor(candidates), shardsAfter: shards, fits: false};
			}
			const groups = step.candidate.groups.slice();
			groups.splice(step.groupIndex, 1, ...step.groups);
			step.candidate.groups = ShardBudgetFitter.mergeGroups(groups);
			shards -= step.shardsSaved;
		}
		return {changes: ShardBudgetFitter.changesFor(candidates), shardsAfter: shards, fits: true};
	}

	private static isCandidateGroup(group: MachineGroup): boolean
	{
		return group.machines > 0 && group.clockSpeed > 100 && group.sloops === 0;
	}

	private static bestStep(candidates: readonly FitCandidate[], gap: number, defaultGroupingMode: GroupingMode): FitStep | null
	{
		let best: FitStep | null = null;
		for (const candidate of candidates) {
			const mode = candidate.node.groupingMode ?? defaultGroupingMode;
			candidate.groups.forEach((group, groupIndex) => {
				if (!ShardBudgetFitter.isCandidateGroup(group)) {
					return;
				}
				const step = ShardBudgetFitter.stepFor(candidate, groupIndex, group, gap, mode);
				if (step !== null && (best === null || ShardBudgetFitter.isBetter(step, best))) {
					best = step;
				}
			});
		}
		return best;
	}

	private static stepFor(
		candidate: FitCandidate,
		groupIndex: number,
		group: MachineGroup,
		gap: number,
		mode: GroupingMode,
	): FitStep | null
	{
		const shards = Formulas.powerShards(group.clockSpeed);
		const nextClock = 100 + (shards - 1) * Formulas.CLOCK_PER_SHARD;
		if (nextClock >= group.clockSpeed) {
			return null;
		}
		const capacity = group.machines * group.clockSpeed / 100;
		const oldShards = group.machines * shards;
		let groups = ShardBudgetFitter.normalizer.generateForTarget(capacity, nextClock, 0, mode);
		if (oldShards - ShardBudgetFitter.shardsOf(groups) > gap) {
			// Overshooting the whole group would waste shards; lower only the machines the gap needs.
			groups = ShardBudgetFitter.partialStep(group, nextClock, gap, mode) ?? groups;
		}
		const machinesAdded = ShardBudgetFitter.machinesOf(groups) - group.machines;
		const shardsSaved = oldShards - ShardBudgetFitter.shardsOf(groups);
		if (shardsSaved <= 0 || machinesAdded < 0) {
			return null;
		}
		return {candidate, groupIndex, groups, shardsSaved, machinesAdded};
	}

	/** Smallest machine count whose tier drop saves enough shards; null when the whole group cannot. */
	private static partialStep(group: MachineGroup, nextClock: number, gap: number, mode: GroupingMode): MachineGroup[] | null
	{
		const perMachine = Formulas.powerShards(group.clockSpeed);
		const first = Math.max(1, Math.ceil(gap / perMachine - 1e-9));
		for (let machines = first; machines < group.machines; machines++) {
			const groups = ShardBudgetFitter.splitGroup(group, machines, nextClock, mode);
			const saved = group.machines * perMachine - ShardBudgetFitter.shardsOf(groups);
			if (saved >= gap) {
				return groups;
			}
		}
		return null;
	}

	private static splitGroup(group: MachineGroup, machines: number, nextClock: number, mode: GroupingMode): MachineGroup[]
	{
		const staying = group.machines - machines;
		const loweredCapacity = machines * group.clockSpeed / 100;
		const lowered = ShardBudgetFitter.normalizer.generateForTarget(loweredCapacity, nextClock, 0, mode);
		return staying > 0
			? [{machines: staying, clockSpeed: group.clockSpeed, sloops: 0}, ...lowered]
			: lowered;
	}

	private static isBetter(step: FitStep, best: FitStep): boolean
	{
		const score = step.machinesAdded / step.shardsSaved;
		const bestScore = best.machinesAdded / best.shardsSaved;
		if (Math.abs(score - bestScore) > 1e-9) {
			return score < bestScore;
		}
		if (step.shardsSaved !== best.shardsSaved) {
			return step.shardsSaved > best.shardsSaved;
		}
		if (step.candidate.node.id !== best.candidate.node.id) {
			return step.candidate.node.id < best.candidate.node.id;
		}
		return step.groupIndex < best.groupIndex;
	}

	private static changesFor(candidates: readonly FitCandidate[]): ShardFitChange[]
	{
		return candidates
			.map(candidate => {
				const before = candidate.node.groups.map(group => ({...group}));
				const after = candidate.groups;
				return {
					nodeId: candidate.node.id,
					before,
					after: after.map(group => ({...group})),
					shardsSaved: ShardBudgetFitter.shardsOf(before) - ShardBudgetFitter.shardsOf(after),
					machinesAdded: ShardBudgetFitter.machinesOf(after) - ShardBudgetFitter.machinesOf(before),
				};
			})
			.filter(change => change.shardsSaved > 0 || change.machinesAdded !== 0);
	}

	private static mergeGroups(groups: readonly MachineGroup[]): MachineGroup[]
	{
		const merged = new Map<string, MachineGroup>();
		groups.forEach(group => {
			const key = `${group.clockSpeed}:${group.sloops}`;
			const existing = merged.get(key);
			merged.set(key, existing
				? {machines: existing.machines + group.machines, clockSpeed: group.clockSpeed, sloops: group.sloops}
				: {...group});
		});
		return [...merged.values()].sort((a, b) => b.clockSpeed - a.clockSpeed);
	}

	private static shardsOf(groups: readonly MachineGroup[]): number
	{
		return groups.reduce((sum, group) => sum + group.machines * Formulas.powerShards(group.clockSpeed), 0);
	}

	private static machinesOf(groups: readonly MachineGroup[]): number
	{
		return groups.reduce((sum, group) => sum + group.machines, 0);
	}

}
