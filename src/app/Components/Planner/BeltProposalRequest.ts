import {BeltProposal} from '@src/Model/Planner/BeltLayoutResult';

/** One belt suggestion the user asked to apply. */
export interface BeltProposalRequest
{

	/** The edge's index in the rendered graph. */
	readonly edgeIndex: number;

	/** The edge's source, the node the proposal changes. */
	readonly nodeId: string;

	readonly proposal: BeltProposal;

}
