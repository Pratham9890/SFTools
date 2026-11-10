import {BeltLayoutSettings} from '@src/Model/Planner/BeltLayoutSettings';
import {Belt, BeltConsumerPart, BeltLayoutResult, BeltPart, BeltProposal, BeltUnit} from '@src/Model/Planner/BeltLayoutResult';
import {ConveyorCapacity} from '@src/Model/Planner/ConveyorCapacity';

interface BeltBin
{
	load: number;
	parts: BeltPart[];
}

/** Pure belt layout: splits one connection's flow across belts or pipes. */
export class BeltLayout
{

	private static readonly EPSILON = 1e-6;
	private static readonly CLOCK_SCALE = 10000;

	/**
	 * @param amount The connection's flow per minute.
	 * @param capacity One belt's or pipe's capacity per minute.
	 * @param units Each machine's contribution, in machine order. Empty means the flow is freely divisible.
	 * @param ratePerMachineAt100 Optional; with maxClock it lets the modes propose machine groups.
	 * @param maxClock Optional; the highest clock a proposed machine may run at.
	 */
	public static plan(
		amount: number,
		capacity: number,
		units: readonly BeltUnit[],
		settings: BeltLayoutSettings,
		ratePerMachineAt100?: number,
		maxClock?: number,
	): BeltLayoutResult
	{
		if (!(amount > 0) || !(capacity > 0)) {
			return {belts: [], changed: false, proposal: null};
		}
		const count = ConveyorCapacity.countNeeded(amount, capacity);
		const normalized = BeltLayout.normalize(units, amount);
		const rate = ratePerMachineAt100 !== undefined && ratePerMachineAt100 > 0 ? ratePerMachineAt100 : null;
		const clockLimit = maxClock !== undefined && maxClock > 0 ? maxClock : null;

		if (settings.mode === 'full' && settings.allowPlanChanges) {
			const totalAfter = count * capacity;
			const surplus = totalAfter - amount;
			const proposal = rate !== null && clockLimit !== null
				? BeltLayout.raiseProposal(count, capacity, totalAfter, surplus, rate, clockLimit)
				: null;
			if (surplus > BeltLayout.tolerance(totalAfter)) {
				return {belts: BeltLayout.fullBelts(count, capacity), changed: proposal !== null, proposal};
			}
			const belts = BeltLayout.fewestBelts(amount, capacity, count, normalized);
			return {
				belts,
				changed: proposal !== null && rate !== null && BeltLayout.changesLayout(belts, proposal, rate),
				proposal,
			};
		}

		const belts = settings.mode === 'even'
			? BeltLayout.evenBelts(amount, capacity, count, normalized, settings)
			: BeltLayout.fewestBelts(amount, capacity, count, normalized);
		const proposeRegroup = settings.mode === 'full' || settings.allowPlanChanges;
		const proposal = proposeRegroup && rate !== null && clockLimit !== null
			? BeltLayout.regroupProposal(count, amount, capacity, rate, clockLimit)
			: null;
		return {
			belts,
			changed: proposal !== null && rate !== null && BeltLayout.changesLayout(belts, proposal, rate),
			proposal,
		};
	}

	/**
	 * Pours consumer machines onto belts in order: each draws its rate from the current belt, then continues on the next.
	 * A machine larger than the remaining belt room therefore has a part on each belt it straddles.
	 */
	public static assignConsumers(belts: readonly Belt[], consumers: readonly BeltUnit[]): BeltConsumerPart[][]
	{
		const parts: BeltConsumerPart[][] = belts.map(() => []);
		let beltIndex = 0;
		let beltRemaining = belts.length > 0 ? belts[0].load : 0;
		for (const consumer of consumers) {
			let remaining = consumer.rate;
			while (remaining > BeltLayout.EPSILON && beltIndex < belts.length) {
				while (beltRemaining <= BeltLayout.EPSILON && beltIndex < belts.length) {
					beltIndex++;
					beltRemaining = beltIndex < belts.length ? belts[beltIndex].load : 0;
				}
				if (beltIndex >= belts.length) {
					break;
				}
				const take = Math.min(remaining, beltRemaining);
				if (!(take > 0)) {
					break;
				}
				const beltParts = parts[beltIndex];
				const last = beltParts[beltParts.length - 1];
				if (last !== undefined && last.unitId === consumer.id) {
					beltParts[beltParts.length - 1] = {unitId: consumer.id, rate: last.rate + take};
				} else {
					beltParts.push({unitId: consumer.id, rate: take});
				}
				beltRemaining -= take;
				remaining -= take;
			}
		}
		return parts;
	}

	private static normalize(units: readonly BeltUnit[], amount: number): BeltUnit[]
	{
		const total = units.reduce((sum, unit) => sum + (unit.rate > 0 ? unit.rate : 0), 0);
		if (!(total > 0)) {
			return [];
		}
		const scale = amount / total;
		return units.map(unit => ({id: unit.id, rate: Math.max(0, unit.rate) * scale}));
	}

	private static fewestBelts(amount: number, capacity: number, count: number, units: readonly BeltUnit[]): Belt[]
	{
		if (units.length === 0) {
			return BeltLayout.splitBelts(amount, capacity, count, [], capacity);
		}
		const bins: BeltBin[] = [];
		let current: BeltBin = {load: 0, parts: []};
		for (const unit of units) {
			let remaining = unit.rate;
			if (remaining <= BeltLayout.EPSILON) {
				continue;
			}
			while (remaining > BeltLayout.EPSILON) {
				let room = capacity - current.load;
				if (room <= BeltLayout.EPSILON) {
					bins.push(current);
					current = {load: 0, parts: []};
					room = capacity;
				}
				const take = Math.min(remaining, room);
				current.load += take;
				BeltLayout.addPart(current.parts, unit.id, take);
				remaining -= take;
				if (remaining > BeltLayout.EPSILON) {
					bins.push(current);
					current = {load: 0, parts: []};
				}
			}
		}
		if (current.load > BeltLayout.EPSILON || current.parts.length > 0) {
			bins.push(current);
		}
		return BeltLayout.toBelts(bins, capacity);
	}

	private static evenBelts(amount: number, capacity: number, count: number, units: readonly BeltUnit[], settings: BeltLayoutSettings): Belt[]
	{
		const evenness = Number.isFinite(settings.evenness) ? Math.min(1, Math.max(0, settings.evenness)) : 0;
		const target = capacity - evenness * (capacity - amount / count);
		if (units.length === 0 || settings.splitOutputs) {
			return BeltLayout.splitBelts(amount, capacity, count, units, target);
		}
		return BeltLayout.wholeBelts(capacity, count, units);
	}

	/** Fills each but the last belt up to the target, splitting units at the boundary. */
	private static splitBelts(amount: number, capacity: number, count: number, units: readonly BeltUnit[], target: number): Belt[]
	{
		const bins: BeltBin[] = [];
		let remaining = amount;
		let unitIndex = 0;
		let unitRemaining = units.length > 0 ? units[0].rate : 0;
		for (let index = 0; index < count; index++) {
			const last = index === count - 1;
			const limit = last ? Math.min(capacity, remaining) : Math.min(capacity, target);
			const bin: BeltBin = {load: 0, parts: []};
			while (bin.load < limit - BeltLayout.EPSILON && remaining > BeltLayout.EPSILON) {
				while (unitIndex < units.length && unitRemaining <= BeltLayout.EPSILON) {
					unitIndex++;
					unitRemaining = unitIndex < units.length ? units[unitIndex].rate : 0;
				}
				if (unitIndex >= units.length) {
					const take = Math.min(limit - bin.load, remaining);
					bin.load += take;
					remaining -= take;
					continue;
				}
				const unit = units[unitIndex];
				const take = Math.min(limit - bin.load, unitRemaining, remaining);
				if (!(take > 0)) {
					break;
				}
				bin.load += take;
				remaining -= take;
				unitRemaining -= take;
				BeltLayout.addPart(bin.parts, unit.id, take);
			}
			if (last && remaining > 0) {
				bin.load += remaining;
				remaining = 0;
			}
			if (bin.load > BeltLayout.EPSILON) {
				bins.push(bin);
			}
		}
		return BeltLayout.toBelts(bins, capacity);
	}

	/** No unit is split: largest units first onto the least loaded belt they fit on. */
	private static wholeBelts(capacity: number, count: number, units: readonly BeltUnit[]): Belt[]
	{
		const bins: BeltBin[] = [];
		for (let index = 0; index < count; index++) {
			bins.push({load: 0, parts: []});
		}
		const order = units
			.map((unit, index) => ({unit, index}))
			.sort((left, right) => right.unit.rate - left.unit.rate || left.index - right.index);
		for (const entry of order) {
			const unit = entry.unit;
			if (unit.rate <= BeltLayout.EPSILON) {
				continue;
			}
			if (unit.rate > capacity + BeltLayout.tolerance(capacity)) {
				BeltLayout.placeSplit(bins, unit, capacity);
				continue;
			}
			let best = -1;
			for (let index = 0; index < bins.length; index++) {
				const fits = bins[index].load + unit.rate <= capacity + BeltLayout.tolerance(capacity);
				if (fits && (best < 0 || bins[index].load < bins[best].load)) {
					best = index;
				}
			}
			if (best < 0) {
				bins.push({load: 0, parts: []});
				best = bins.length - 1;
			}
			bins[best].load += unit.rate;
			BeltLayout.addPart(bins[best].parts, unit.id, unit.rate);
		}
		const unitOrder = new Map<string, number>();
		units.forEach((unit, index) =>
		{
			if (!unitOrder.has(unit.id)) {
				unitOrder.set(unit.id, index);
			}
		});
		bins.forEach(bin => bin.parts.sort((left, right) => (unitOrder.get(left.unitId) ?? 0) - (unitOrder.get(right.unitId) ?? 0)));
		return BeltLayout.toBelts(bins, capacity);
	}

	/** Only a unit larger than one belt is split in whole-unit mode. */
	private static placeSplit(bins: BeltBin[], unit: BeltUnit, capacity: number): void
	{
		let remaining = unit.rate;
		while (remaining > BeltLayout.EPSILON) {
			let best = -1;
			for (let index = 0; index < bins.length; index++) {
				const room = capacity - bins[index].load;
				if (room > BeltLayout.EPSILON && (best < 0 || bins[index].load < bins[best].load)) {
					best = index;
				}
			}
			if (best < 0) {
				bins.push({load: 0, parts: []});
				best = bins.length - 1;
			}
			const take = Math.min(remaining, capacity - bins[best].load);
			bins[best].load += take;
			BeltLayout.addPart(bins[best].parts, unit.id, take);
			remaining -= take;
		}
	}

	private static fullBelts(count: number, capacity: number): Belt[]
	{
		const belts: Belt[] = [];
		for (let index = 0; index < count; index++) {
			belts.push({index: index + 1, load: capacity, fill: 1, parts: []});
		}
		return belts;
	}

	private static regroupProposal(count: number, amount: number, capacity: number, rate: number, maxClock: number): BeltProposal | null
	{
		const belts: {machines: number; clockSpeed: number}[][] = [];
		let machinesAfter = 0;
		for (let index = 0; index < count; index++) {
			const flow = index < count - 1 ? capacity : amount - capacity * (count - 1);
			const groups = BeltLayout.machineGroups(flow, rate, maxClock);
			if (groups === null) {
				return null;
			}
			belts.push(groups);
			machinesAfter += BeltLayout.countMachines(groups);
		}
		return {kind: 'regroup', belts, totalAfter: amount, machinesAfter};
	}

	private static raiseProposal(count: number, capacity: number, totalAfter: number, surplus: number, rate: number, maxClock: number): BeltProposal | null
	{
		const belts: {machines: number; clockSpeed: number}[][] = [];
		let machinesAfter = 0;
		for (let index = 0; index < count; index++) {
			const groups = BeltLayout.machineGroups(capacity, rate, maxClock);
			if (groups === null) {
				return null;
			}
			belts.push(groups);
			machinesAfter += BeltLayout.countMachines(groups);
		}
		return {kind: 'raise', belts, totalAfter, surplus, machinesAfter};
	}

	private static machineGroups(flow: number, rate: number, maxClock: number): {machines: number; clockSpeed: number}[] | null
	{
		if (!(flow > 0) || !(rate > 0) || !(maxClock > 0)) {
			return null;
		}
		const clockTotal = flow / rate * 100;
		let machines = Math.max(1, Math.ceil(flow / rate - BeltLayout.EPSILON));
		machines = Math.max(machines, Math.ceil(clockTotal / maxClock - BeltLayout.EPSILON));
		const tolerance = BeltLayout.tolerance(clockTotal);
		if (clockTotal < machines || clockTotal > machines * maxClock + tolerance) {
			return null;
		}
		if (machines === 1) {
			return [{machines: 1, clockSpeed: BeltLayout.roundClock(clockTotal)}];
		}
		const base = Math.min(100, maxClock);
		const last = clockTotal - (machines - 1) * base;
		if (last >= 1 && last <= maxClock + tolerance) {
			if (Math.abs(last - base) <= tolerance) {
				return [{machines, clockSpeed: BeltLayout.roundClock(base)}];
			}
			return [
				{machines: machines - 1, clockSpeed: BeltLayout.roundClock(base)},
				{machines: 1, clockSpeed: BeltLayout.roundClock(last)},
			];
		}
		const even = clockTotal / machines;
		if (even < 1 || even > maxClock) {
			return null;
		}
		return [{machines, clockSpeed: BeltLayout.roundClock(even)}];
	}

	private static countMachines(groups: readonly {machines: number}[]): number
	{
		return groups.reduce((sum, group) => sum + group.machines, 0);
	}

	private static changesLayout(belts: readonly Belt[], proposal: BeltProposal, rate: number): boolean
	{
		if (belts.length !== proposal.belts.length) {
			return true;
		}
		for (let index = 0; index < belts.length; index++) {
			const proposed: number[] = [];
			for (const group of proposal.belts[index]) {
				for (let machine = 0; machine < group.machines; machine++) {
					proposed.push(rate * group.clockSpeed / 100);
				}
			}
			const parts = belts[index].parts;
			if (parts.length !== proposed.length) {
				return true;
			}
			const used = proposed.map(() => false);
			for (const part of parts) {
				const match = proposed.findIndex((value, candidate) => !used[candidate] && BeltLayout.nearlyEqual(value, part.rate));
				if (match < 0) {
					return true;
				}
				used[match] = true;
			}
		}
		return false;
	}

	private static addPart(parts: BeltPart[], unitId: string, rate: number): void
	{
		const last = parts[parts.length - 1];
		if (last !== undefined && last.unitId === unitId) {
			parts[parts.length - 1] = {unitId, rate: last.rate + rate};
		} else {
			parts.push({unitId, rate});
		}
	}

	private static toBelts(bins: readonly BeltBin[], capacity: number): Belt[]
	{
		const belts: Belt[] = [];
		for (const bin of bins) {
			if (bin.load <= BeltLayout.EPSILON && bin.parts.length === 0) {
				continue;
			}
			const fill = BeltLayout.isFull(bin.load, capacity) ? 1 : Math.min(1, Math.max(0, bin.load / capacity));
			belts.push({index: belts.length + 1, load: bin.load, fill, parts: bin.parts});
		}
		return belts;
	}

	private static isFull(load: number, capacity: number): boolean
	{
		return Math.abs(load - capacity) <= BeltLayout.tolerance(capacity);
	}

	private static nearlyEqual(left: number, right: number): boolean
	{
		return Math.abs(left - right) <= BeltLayout.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
	}

	private static tolerance(value: number): number
	{
		return BeltLayout.EPSILON * Math.max(1, Math.abs(value));
	}

	private static roundClock(value: number): number
	{
		return Math.round(value * BeltLayout.CLOCK_SCALE) / BeltLayout.CLOCK_SCALE;
	}

}
