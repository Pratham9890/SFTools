import {faDownload, faFileExport} from '@fortawesome/free-solid-svg-icons';
import {ContextMenuItem} from '@src/Components/Planner/ContextMenu/ContextMenuItem';
import {PlannerContextMenu} from '@src/Components/Planner/ContextMenu/PlannerContextMenu';
import {PlanTreeMenuHost} from '@src/Components/Planner/Panels/Plans/PlanTreeMenuHost';

export class LocalItemContextMenu extends PlannerContextMenu
{

	public constructor(
		private readonly id: string,
		private readonly kind: 'plan' | 'folder',
		private readonly name: string,
		/** The space's name in co-op; null outside one, where the item moves to the account instead. */
		private readonly spaceName: string | null,
		private readonly host: PlanTreeMenuHost,
	)
	{
		super();
	}

	public override getTitle(): string
	{
		return this.name;
	}

	public getItems(): ContextMenuItem[]
	{
		return [
			{
				label: this.spaceName === null ? 'Add to my plans' : `Move to ${this.spaceName}`,
				icon: faDownload,
				action: () => this.host.addLocalToMyPlans(this.id, this.kind),
			},
			{
				label: 'Export to a file…',
				icon: faFileExport,
				action: () => this.host.exportLocalItem(this.id, this.kind),
			},
		];
	}

}
