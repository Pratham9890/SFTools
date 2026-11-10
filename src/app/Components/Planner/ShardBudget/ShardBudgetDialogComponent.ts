import {ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output} from '@angular/core';
import {HotkeyBlockDirective} from '@src/Components/Common/HotkeyBlockDirective';
import {InfoNoteComponent} from '@src/Components/Common/InfoNoteComponent';
import {ShardFitPreview} from '@src/Components/Planner/ShardBudget/ShardFitPreview';
import {ShardFitService} from '@src/Components/Planner/ShardBudget/ShardFitService';
import {MachineGroup} from '@src/Model/Planner/Solver/Response/MachineGroup';
import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';
import {RateFormatter} from '@src/Model/RateFormatter';

interface ShardFitRow
{

	readonly node: RecipeNode;
	readonly before: string;
	readonly after: string;
	readonly shardsSaved: number;
	readonly machinesAdded: number;

}

@Component({
	selector: 'shard-budget-dialog',
	templateUrl: './ShardBudgetDialogComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [HotkeyBlockDirective, InfoNoteComponent],
	styles: [`
		.shard-fit-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 1075; display: flex; align-items: center; justify-content: center; }
		.shard-fit-dialog { width: min(560px, 92vw); max-height: 82vh; display: flex; flex-direction: column; }
		.shard-fit-changes { overflow-y: auto; min-height: 0; }
	`],
})
export class ShardBudgetDialogComponent
{

	@Input({required: true}) public preview!: ShardFitPreview;

	@Output() public readonly close = new EventEmitter<void>();
	@Output() public readonly applied = new EventEmitter<void>();

	public constructor(
		private readonly fit: ShardFitService,
		public readonly rateFormatter: RateFormatter,
	)
	{
	}

	public get rows(): ShardFitRow[]
	{
		const rows: ShardFitRow[] = [];
		this.preview.result.changes.forEach(change => {
			const node = this.preview.graph.nodes.find(candidate => candidate.id === change.nodeId);
			if (!(node instanceof RecipeNode)) {
				return;
			}
			rows.push({
				node,
				before: this.groupsText(change.before),
				after: this.groupsText(change.after),
				shardsSaved: change.shardsSaved,
				machinesAdded: change.machinesAdded,
			});
		});
		return rows;
	}

	public get canApply(): boolean
	{
		return this.preview.result.fits && this.preview.result.changes.length > 0;
	}

	public groupsText(groups: readonly MachineGroup[]): string
	{
		return groups
			.map(group => `${this.rateFormatter.machineCount(group.machines)} × ${this.rateFormatter.clock(group.clockSpeed)}%`)
			.join(' + ');
	}

	public apply(): void
	{
		if (this.canApply && this.fit.apply(this.preview)) {
			this.applied.emit();
		}
	}

	@HostListener('document:keydown.escape')
	public onEscape(): void
	{
		this.close.emit();
	}

}
