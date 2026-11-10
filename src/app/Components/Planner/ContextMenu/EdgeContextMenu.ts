import {faCompress, faExpand, faMinus, faTrashCan} from '@fortawesome/free-solid-svg-icons';
import {ContextMenuItem} from '@src/Components/Planner/ContextMenu/ContextMenuItem';
import {EdgeAmountAction} from '@src/Components/Planner/ContextMenu/EdgeAmountAction';
import {PlannerContextMenu} from '@src/Components/Planner/ContextMenu/PlannerContextMenu';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {PlannerGraphService} from '@src/Components/Planner/PlannerGraphService';
import {GraphEdge} from '@src/Model/Planner/Graph/GraphEdge';

export class EdgeContextMenu extends PlannerContextMenu
{

	public constructor(
		private readonly edge: GraphEdge,
		private readonly title: string,
		private readonly minimise: EdgeAmountAction | null,
		private readonly maximise: EdgeAmountAction | null,
		private readonly actions: PlannerActionsService,
		private readonly plannerGraph: PlannerGraphService,
	)
	{
		super();
	}

	public override getTitle(): string
	{
		return this.title;
	}

	public getItems(): ContextMenuItem[]
	{
		return [
			this.amountItem('Minimise', faCompress, this.minimise),
			this.amountItem('Maximise', faExpand, this.maximise),
			{
				label: 'Straighten line',
				icon: faMinus,
				disabled: !this.hasBendPoints() || this.plannerGraph.readOnly,
				hint: this.hasBendPoints() ? undefined : 'This connection has no bend points',
				action: () => this.plannerGraph.straightenEdge(this.edge),
			},
			{
				label: 'Delete connection',
				icon: faTrashCan,
				action: () => this.actions.requestEdgeDelete(this.edge),
			},
		];
	}

	private amountItem(fallbackLabel: string, icon: ContextMenuItem['icon'], action: EdgeAmountAction | null): ContextMenuItem
	{
		return {
			label: action?.label ?? fallbackLabel,
			icon,
			disabled: action === null,
			action: () => {
				if (action) {
					this.actions.requestEdgeAmount({edge: this.edge, amount: action.amount});
				}
			},
		};
	}

	private hasBendPoints(): boolean
	{
		return (this.edge.vertices?.length ?? 0) > 0;
	}

}
