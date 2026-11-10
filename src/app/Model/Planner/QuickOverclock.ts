import {Building} from '@src/Model/Data/Entities/Building';
import {Formulas} from '@src/Model/Planner/Formulas';
import {GroupingMode} from '@src/Model/Planner/GroupingMode';
import {MachineGroupNormalizer} from '@src/Model/Planner/MachineGroupNormalizer';
import {MachineGroup} from '@src/Model/Planner/Solver/Response/MachineGroup';
import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';

/** Splits a recipe node into machines at one overclocked speed plus the rest at the plan's default clock. */
export class QuickOverclock
{

	private static readonly normalizer = new MachineGroupNormalizer();
	private static readonly SHARD_SLOTS = 3;

	public static groups(
		node: RecipeNode,
		clockSpeed: number,
		overclockedMachines: number,
		restClockSpeed: number,
		mode: GroupingMode,
	): MachineGroup[]
	{
		const capacity = node.capacity();
		const needed = capacity > 0 ? capacity * node.utilization() : node.target;
		if (!(needed > 0)) {
			return [];
		}

		const clock = QuickOverclock.clampedClock(node.machine, clockSpeed);
		const rest = QuickOverclock.clampedClock(node.machine, restClockSpeed);
		const perMachine = clock / 100;
		// Beyond this many machines at `clock` the output is covered already, so the last one is the one that gets underclocked.
		const useful = Math.max(1, Math.ceil(needed / perMachine - 1e-9));
		const requested = Number.isFinite(overclockedMachines) ? Math.floor(overclockedMachines) : useful;
		const count = Math.min(Math.max(requested, 1), useful);

		if (count >= useful) {
			return QuickOverclock.normalizer.generateForTarget(needed, clock, 0, mode);
		}

		const groups = QuickOverclock.normalizer.generateForTarget(count * perMachine, clock, 0, mode);
		const remainder = needed - count * perMachine;
		if (remainder > 1e-9) {
			groups.push(...QuickOverclock.normalizer.generateForTarget(remainder, rest, 0, mode));
		}
		return groups;
	}

	public static clampedClock(machine: Building, clockSpeed: number): number
	{
		const clock = Formulas.clampClock(Number.isFinite(clockSpeed) ? clockSpeed : 100);
		// Game data keeps the range as fractions without shards, like the codex reads it: 0.01-1 is 1%-250% with 3 shards.
		const min = machine.minOverclock * 100;
		const max = machine.maxOverclock * 100 + QuickOverclock.SHARD_SLOTS * Formulas.CLOCK_PER_SHARD;
		return Math.min(max, Math.max(min, clock));
	}

}
