import {Component, ChangeDetectionStrategy, Signal, computed, signal} from '@angular/core';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faChevronDown, faChevronRight} from '@fortawesome/free-solid-svg-icons';
import {GameIconComponent} from '@src/Components/Common/GameIconComponent';
import {BuiltMarkComponent} from '@src/Components/Planner/Panels/BuiltMark/BuiltMarkComponent';
import {GoToNodeButtonComponent} from '@src/Components/Planner/Panels/GoToNode/GoToNodeButtonComponent';
import {Item} from '@src/Model/Data/Entities/Item';
import {ItemRow} from '@src/Model/Planner/Breakdown/ItemRow';
import {PlanBreakdownService} from '@src/Model/Planner/Breakdown/PlanBreakdownService';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {RateFormatter} from '@src/Model/RateFormatter';
import {PlanResultHintComponent} from '@src/Components/Planner/Panels/ResultHint/PlanResultHintComponent';
import {TextMatcher} from '@src/Model/Search/TextMatcher';

@Component({
	selector: 'planner-items',
	changeDetection: ChangeDetectionStrategy.Eager,
	templateUrl: './PlannerItemsComponent.html',
	imports: [FaIconComponent, GameIconComponent, PlanResultHintComponent, GoToNodeButtonComponent, BuiltMarkComponent],
	styles: [`
		.items-search { flex: 0 1 320px; }
		.items-grid { gap: 8px; align-items: start; }
		.item-block {
			display: grid;
			gap: 2px;
			padding: 6px 8px;
			background: var(--surface-2);
			border: 1px solid var(--rule);
			border-radius: 10px;
			min-width: 0;
		}
		.item-block.open { border-color: var(--rule-strong); }
		.item-head {
			display: flex;
			align-items: center;
			gap: 6px;
			cursor: pointer;
			min-width: 0;
		}
		.item-head:hover { color: var(--accent); }
		.item-name {
			font-weight: 600;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			min-width: 0;
		}
		.item-figures {
			display: flex;
			flex-wrap: wrap;
			align-items: baseline;
			gap: 4px 10px;
			padding-left: 26px;
		}
		.item-flows {
			display: grid;
			gap: 2px;
			padding: 4px 0 2px 26px;
			border-top: 1px solid var(--rule);
			margin-top: 4px;
		}
		.flow-row {
			display: grid;
			grid-template-columns: 34px minmax(0, 1fr) auto auto auto;
			align-items: center;
			gap: 6px;
			min-height: 28px;
		}
		.flow-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.flow-amount { text-align: right; white-space: nowrap; }
	`],
})
export class PlannerItemsComponent
{

	public readonly faChevronDown = faChevronDown;
	public readonly faChevronRight = faChevronRight;

	private readonly searchTermSignal = signal('');
	public readonly searchTerm = this.searchTermSignal.asReadonly();

	private readonly expandedKeysSignal = signal<ReadonlySet<string>>(new Set());

	public readonly isFolderView = computed(() => this.planManager.activeFolder() !== null);

	private readonly allRows: Signal<ItemRow[]> = computed(() => {
		const folder = this.planManager.activeFolder();
		return folder
			? this.breakdownService.itemsForFolder(folder.id)
			: this.breakdownService.items(this.planManager.activePlan());
	});

	public readonly rows: Signal<ItemRow[]> = computed(() =>
		this.filterRows(this.allRows(), this.searchTerm().trim().toLowerCase()));

	public readonly hasRows = computed(() => this.allRows().length > 0);

	public constructor(
		private readonly planManager: PlanManager,
		private readonly breakdownService: PlanBreakdownService,
		public readonly rateFormatter: RateFormatter,
		private readonly matcher: TextMatcher,
	)
	{
	}

	public setSearchTerm(value: string): void
	{
		this.searchTermSignal.set(value);
	}

	public isExpanded(row: ItemRow): boolean
	{
		return this.searchTerm().trim() !== '' || this.expandedKeysSignal().has(row.item.className);
	}

	/** Rendered after a <wbr>, so the spacing must match RateFormatter.rate(). */
	public unitText(item: Item): string
	{
		const unit = this.rateFormatter.unit(item);
		return unit.startsWith('/') ? unit : ' ' + unit;
	}

	public toggle(row: ItemRow): void
	{
		const keys = new Set(this.expandedKeysSignal());
		keys.has(row.item.className) ? keys.delete(row.item.className) : keys.add(row.item.className);
		this.expandedKeysSignal.set(keys);
	}

	private filterRows(rows: ItemRow[], term: string): ItemRow[]
	{
		if (term === '') {
			return rows;
		}
		const matching: ItemRow[] = [];
		rows.forEach(row => {
			if (this.matcher.matches(term, row.item.name)) {
				matching.push(row);
				return;
			}
			const sources = this.matcher.filter(row.sources, term, flow => flow.name);
			const targets = this.matcher.filter(row.targets, term, flow => flow.name);
			if (sources.length > 0 || targets.length > 0) {
				matching.push({...row, sources, targets});
			}
		});
		return matching;
	}

}
