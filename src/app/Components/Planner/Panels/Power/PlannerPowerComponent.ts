import {Component, ChangeDetectionStrategy, Signal, computed, signal} from '@angular/core';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faChevronDown, faChevronRight} from '@fortawesome/free-solid-svg-icons';
import {GameIconComponent} from '@src/Components/Common/GameIconComponent';
import {BuiltMarkComponent} from '@src/Components/Planner/Panels/BuiltMark/BuiltMarkComponent';
import {GoToNodeButtonComponent} from '@src/Components/Planner/Panels/GoToNode/GoToNodeButtonComponent';
import {PowerDrawComponent} from '@src/Components/Common/PowerDrawComponent';
import {PlanBreakdownService} from '@src/Model/Planner/Breakdown/PlanBreakdownService';
import {PowerBreakdown} from '@src/Model/Planner/Breakdown/PowerBreakdown';
import {PowerRow} from '@src/Model/Planner/Breakdown/PowerRow';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {PowerDraw} from '@src/Model/Planner/PowerDraw';
import {RateFormatter} from '@src/Model/RateFormatter';
import {PlanResultHintComponent} from '@src/Components/Planner/Panels/ResultHint/PlanResultHintComponent';
import {TextMatcher} from '@src/Model/Search/TextMatcher';

@Component({
	selector: 'planner-power',
	changeDetection: ChangeDetectionStrategy.Eager,
	templateUrl: './PlannerPowerComponent.html',
	imports: [FaIconComponent, GameIconComponent, PlanResultHintComponent, PowerDrawComponent, GoToNodeButtonComponent, BuiltMarkComponent],
	styles: [`
		.power-search { flex: 0 1 320px; }
		.power-grid { gap: 6px; align-items: start; }
		.power-block {
			display: grid;
			gap: 2px;
			padding: 6px 8px;
			background: var(--surface-2);
			border: 1px solid var(--rule);
			border-radius: 10px;
			min-width: 0;
		}
		.power-block.open { border-color: var(--rule-strong); }
		.power-head {
			display: flex;
			align-items: center;
			gap: 6px;
			min-width: 0;
		}
		.power-name {
			font-weight: 600;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			min-width: 0;
		}
		.power-figures {
			display: flex;
			flex-wrap: wrap;
			gap: 4px 16px;
			padding-left: 26px;
		}
		.power-figures .figure { white-space: nowrap; display: inline-flex; align-items: baseline; gap: 6px; }
		.power-entries {
			display: grid;
			gap: 4px;
			padding: 4px 0 2px 26px;
			border-top: 1px solid var(--rule);
			margin-top: 4px;
		}
		.power-entry {
			display: grid;
			gap: 2px;
			padding: 3px 6px;
			border-radius: 6px;
		}
		.power-entry:hover { background: var(--ground); }
		.power-entry-head {
			display: flex;
			align-items: center;
			gap: 6px;
			min-width: 0;
		}
		.power-entry-figures {
			display: flex;
			justify-content: space-between;
			gap: 8px;
			padding-left: 4px;
		}
		.flow-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	`],
})
export class PlannerPowerComponent
{

	public readonly faChevronDown = faChevronDown;
	public readonly faChevronRight = faChevronRight;

	private readonly searchTermSignal = signal('');
	public readonly searchTerm = this.searchTermSignal.asReadonly();

	private readonly expandedKeysSignal = signal<ReadonlySet<string>>(new Set());

	public readonly isFolderView = computed(() => this.planManager.activeFolder() !== null);

	public readonly breakdown: Signal<PowerBreakdown> = computed(() => {
		const folder = this.planManager.activeFolder();
		return folder
			? this.breakdownService.powerForFolder(folder.id)
			: this.breakdownService.power(this.planManager.activePlan());
	});

	public readonly rows: Signal<PowerRow[]> = computed(() =>
		this.filterRows(this.breakdown().rows, this.searchTerm().trim().toLowerCase()));

	public readonly hasRows = computed(() => this.breakdown().rows.length > 0);

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

	public isExpanded(row: PowerRow): boolean
	{
		return row.entries.length > 0
			&& (this.searchTerm().trim() !== '' || this.expandedKeysSignal().has(row.key));
	}

	public toggle(row: PowerRow): void
	{
		if (row.entries.length === 0) {
			return;
		}
		const keys = new Set(this.expandedKeysSignal());
		keys.has(row.key) ? keys.delete(row.key) : keys.add(row.key);
		this.expandedKeysSignal.set(keys);
	}

	/** A negative average is net production; float noise reads as zero. */
	public isProduction(power: PowerDraw): boolean
	{
		return power.average < 0 && !this.rateFormatter.isZero(power.average);
	}

	public netIsSurplus(): boolean
	{
		return this.isProduction(this.breakdown().net.negate());
	}

	private filterRows(rows: PowerRow[], term: string): PowerRow[]
	{
		if (term === '') {
			return rows;
		}
		const matching: PowerRow[] = [];
		rows.forEach(row => {
			if (this.matcher.matches(term, row.name)) {
				matching.push(row);
				return;
			}
			const entries = this.matcher.filter(row.entries, term, entry => entry.name);
			if (entries.length > 0) {
				matching.push({...row, entries});
			}
		});
		return matching;
	}

}
