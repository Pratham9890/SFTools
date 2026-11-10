/** One block the previewed calculation would add, change or remove. */
export interface CalculateChangeRow
{

	readonly kind: 'changed' | 'added' | 'removed';
	/** The existing node for changed/removed rows, the solver's node for added ones. */
	readonly nodeId: string;
	readonly title: string;
	readonly detail: string | null;
	readonly lockable: boolean;

}
