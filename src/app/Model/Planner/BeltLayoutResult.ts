/** One machine's contribution to a connection, in machine order. */
export interface BeltUnit
{

	readonly id: string;

	readonly rate: number;

}

export interface BeltPart
{

	readonly unitId: string;

	/** This unit's flow on this belt. */
	readonly rate: number;

}

export interface Belt
{

	/** 1-based, in flow order. */
	readonly index: number;

	readonly load: number;

	/** load / capacity, 0..1. */
	readonly fill: number;

	readonly parts: BeltPart[];

}

export interface BeltProposal
{

	readonly kind: 'regroup' | 'raise';

	/** Machine groups per belt. */
	readonly belts: {machines: number; clockSpeed: number}[][];

	/** The flow after the proposal: the same amount for regroup, the raised amount for raise. */
	readonly totalAfter: number;

	/** raise only: the extra flow the raised plan makes. */
	readonly surplus?: number;

	readonly machinesAfter: number;

}

export interface BeltLayoutResult
{

	readonly belts: Belt[];

	/** True when the proposal would change the plan. */
	readonly changed: boolean;

	readonly proposal: BeltProposal | null;

}
