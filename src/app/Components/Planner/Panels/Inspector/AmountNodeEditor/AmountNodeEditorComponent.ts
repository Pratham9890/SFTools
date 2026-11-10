import {Component, ChangeDetectionStrategy, Input, OnChanges, OnDestroy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faLock, faLockOpen, faXmark} from '@fortawesome/free-solid-svg-icons';
import {AppTooltipDirective} from '@src/Components/Common/AppTooltipDirective';
import {GameIconComponent} from '@src/Components/Common/GameIconComponent';
import {InfoNoteComponent} from '@src/Components/Common/InfoNoteComponent';
import {GoToNodeButtonComponent} from '@src/Components/Planner/Panels/GoToNode/GoToNodeButtonComponent';
import {ClockSpeedInputComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Overclocking/ClockSpeedInputComponent';
import {Subject, Subscription} from 'rxjs';
import {debounceTime} from 'rxjs/operators';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {Building} from '@src/Model/Data/Entities/Building';
import {Item} from '@src/Model/Data/Entities/Item';
import {VersionManager} from '@src/Model/Data/VersionManager';
import {MapPurity} from '@src/Model/Map/MapPurity';
import {ConveyorCapacity} from '@src/Model/Planner/ConveyorCapacity';
import {ExtractorCapacity} from '@src/Model/Planner/ExtractorCapacity';
import {DEFAULT_SATELLITES, ExtractorRow, WELL_PRESSURIZER_CLASS} from '@src/Model/Planner/ExtractorSetup';
import {Formulas} from '@src/Model/Planner/Formulas';
import {NodeResizer} from '@src/Model/Planner/NodeResizer';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {GeneratorNode} from '@src/Model/Planner/Solver/Response/GeneratorNode';
import {ItemAmountNode} from '@src/Model/Planner/Solver/Response/ItemAmountNode';
import {MineNode} from '@src/Model/Planner/Solver/Response/MineNode';
import {Node} from '@src/Model/Planner/Solver/Response/Node';
import {RateFormatter} from '@src/Model/RateFormatter';

const APPLY_DEBOUNCE_MS = 400;

interface ExtractorDraft
{
	count: number;
	purity: MapPurity;
	buildingClassName: string;
	clockSpeed: number;
	satellites: {impure: number; normal: number; pure: number};
}

const TYPE_LABELS: Record<string, string> = {
	input: 'Input',
	product: 'Product',
	mine: 'Mine',
	byproduct: 'Byproduct',
	sink: 'Sink',
	generator: 'Generator',
};

@Component({
	selector: 'amount-node-editor',
	templateUrl: './AmountNodeEditorComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [FormsModule, FaIconComponent, AppTooltipDirective, GameIconComponent, InfoNoteComponent, ClockSpeedInputComponent, GoToNodeButtonComponent],
	styles: [`
		.extractors-table {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}
		.extractor-row {
			display: flex;
			flex-wrap: wrap;
			align-items: flex-end;
			gap: 0.4rem 0.5rem;
			padding-bottom: 0.5rem;
			border-bottom: 1px solid var(--bs-table-border-color);
		}
		.extractor-row:last-child {
			padding-bottom: 0;
			border-bottom: 0;
		}
		.extractor-field {
			display: flex;
			flex-direction: column;
			gap: 0.1rem;
			min-width: 0;
		}
		.extractor-label {
			color: #9fb0c0;
			font-size: 0.72rem;
			line-height: 1.1;
			white-space: nowrap;
		}
		.field-count { flex: 1 1 4.5rem; min-width: 4.5rem; }
		.field-purity { flex: 1 1 6.5rem; min-width: 6.5rem; }
		.field-satellites { flex: 1 1 10rem; min-width: 10rem; }
		.field-extractor { flex: 1 1 9.5rem; min-width: 9.5rem; }
		.field-clock { flex: 1 1 15.5rem; min-width: 15.5rem; }
		.field-rate { flex: 0 1 auto; }
		/* Under 300px the clock input stacks its value over its presets, so it needs only a small width. */
		@container panel (max-width: 300px) {
			.field-clock { flex: 1 1 7rem; min-width: 7rem; }
		}
		.field-actions {
			flex: 0 0 auto;
			margin-left: auto;
		}
		.satellite-grid {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.25rem;
		}
		.satellite-cell {
			display: flex;
			flex-direction: column;
			gap: 0.1rem;
			min-width: 0;
			color: #9fb0c0;
			font-size: 0.68rem;
			line-height: 1.1;
		}
		.satellite-cell > span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.btn-add { flex: 1 1 8rem; }
		.btn-remove { flex: 0 1 auto; }
	`],
})
export class AmountNodeEditorComponent implements OnChanges, OnDestroy
{

	public readonly faLock = faLock;
	public readonly faLockOpen = faLockOpen;
	public readonly faXmark = faXmark;
	public readonly purityOptions: ReadonlyArray<MapPurity> = ['impure', 'normal', 'pure'];

	@Input({required: true}) public node!: Node;

	public amount = 0;

	public clockSpeed = 100;

	public extractorRows: ExtractorDraft[] = [];

	public extractorOptions: Building[] = [];

	private extractorsPending = false;

	private draftClockBase = 100;

	/** A pending apply must flush against the node the user edited, even after the selection moved on. */
	private loadedNode: Node | null = null;

	private readonly applySubject = new Subject<void>();
	private readonly applySubscription: Subscription;
	private applyPending = false;

	public constructor(
		private readonly actions: PlannerActionsService,
		private readonly resizer: NodeResizer,
		private readonly versionManager: VersionManager,
		private readonly planManager: PlanManager,
		public readonly rateFormatter: RateFormatter,
	)
	{
		this.applySubscription = this.applySubject
			.pipe(debounceTime(APPLY_DEBOUNCE_MS))
			.subscribe(() => this.applyDraft());
	}

	public ngOnChanges(): void
	{
		if (this.loadedNode?.id === this.node.id) {
			this.loadedNode = this.node;
			// An applied update coming back: reflect what stuck (the reconciler may clamp elastic nodes) unless the user kept typing.
			if (!this.applyPending) {
				this.amount = this.node.amount;
				this.clockSpeed = this.draftClockBase = this.generator?.clockSpeed ?? 100;
			}
			if (!this.extractorsPending) {
				this.loadExtractorDraft(this.node);
			}
			return;
		}
		this.flushPendingApply();
		this.loadedNode = this.node;
		this.amount = this.node.amount;
		this.clockSpeed = this.draftClockBase = this.generator?.clockSpeed ?? 100;
		this.loadExtractorOptions(this.node);
		this.loadExtractorDraft(this.node);
	}

	public ngOnDestroy(): void
	{
		this.flushPendingApply();
		this.applySubscription.unsubscribe();
	}

	public get typeLabel(): string
	{
		return TYPE_LABELS[this.node.type] ?? this.node.type;
	}

	public get item(): Item | null
	{
		return this.node instanceof ItemAmountNode ? this.node.item : null;
	}

	public get generator(): GeneratorNode | null
	{
		return this.node instanceof GeneratorNode ? this.node : null;
	}

	public get mine(): MineNode | null
	{
		return this.node instanceof MineNode ? this.node : null;
	}

	public get iconHash(): string | null
	{
		return this.item?.icon ?? this.generator?.generator.icon ?? null;
	}

	public get lockTooltip(): string
	{
		return this.node.locked
			? 'Locked. Click to unlock.'
			: 'Not locked. Click to lock.';
	}

	public get amountLabel(): string
	{
		return this.generator ? 'Machines' : 'Rate';
	}

	public get unit(): string | null
	{
		const item = this.item;
		return item ? this.rateFormatter.unit(item) : null;
	}

	public get extractorCapacity(): number
	{
		const data = this.versionManager.activeVersionData();
		const item = this.item;
		if (!data || !item) {
			return 0;
		}
		return ExtractorCapacity.capacity(this.extractorRows, data, item, this.extractorBeltCap);
	}

	public get extractorNeeded(): number
	{
		return this.mine?.amount ?? 0;
	}

	/** Null when the setup covers the node; otherwise the missing rate. */
	public get extractorShortfall(): number | null
	{
		const capacity = this.extractorCapacity;
		const needed = this.extractorNeeded;
		const tolerance = Math.max(Math.abs(capacity), Math.abs(needed), 1) * 1e-6;
		return capacity < needed - tolerance ? needed - capacity : null;
	}

	public get extractorSummary(): string
	{
		const data = this.versionManager.activeVersionData();
		const count = ExtractorCapacity.buildings(this.extractorRows);
		const power = data ? ExtractorCapacity.power(this.extractorRows, data) : 0;
		const shards = ExtractorCapacity.shards(this.extractorRows);
		const parts = [
			`${this.rateFormatter.amount(count)} extractor${count === 1 ? '' : 's'}`,
			this.rateFormatter.power(power),
		];
		if (shards > 0) {
			parts.push(`${this.rateFormatter.amount(shards)} power shard${shards === 1 ? '' : 's'}`);
		}
		return parts.join(' · ');
	}

	public rowRate(row: ExtractorDraft): number
	{
		const data = this.versionManager.activeVersionData();
		const item = this.item;
		const building = data?.searchBuildingByClassName(row.buildingClassName);
		return building && item && data ? ExtractorCapacity.rowRate(row, building, item, this.extractorBeltCap, data) : 0;
	}

	public rowHasPurity(row: ExtractorDraft): boolean
	{
		const data = this.versionManager.activeVersionData();
		const item = this.item;
		const building = data?.searchBuildingByClassName(row.buildingClassName);
		return building !== undefined && item !== null && ExtractorCapacity.hasPurity(building, item);
	}

	/** A well row's purity is per satellite node, so it gets three satellite counts instead of one purity. */
	public isWellRow(row: ExtractorDraft): boolean
	{
		return row.buildingClassName === WELL_PRESSURIZER_CLASS;
	}

	/** The pressurizer's full name is too long for the closed select at a narrow panel width. */
	public buildingLabel(building: Building): string
	{
		return building.className === WELL_PRESSURIZER_CLASS ? 'Well pressurizer' : building.name;
	}

	public buildingTitle(row: ExtractorDraft): string
	{
		const data = this.versionManager.activeVersionData();
		return data?.searchBuildingByClassName(row.buildingClassName)?.name ?? '';
	}

	public purityLabel(purity: MapPurity): string
	{
		return purity.charAt(0).toUpperCase() + purity.slice(1);
	}

	/** The fastest extractor the data offers for this item, so a fresh row starts on a sensible machine. */
	public addExtractorRow(): void
	{
		if (this.extractorOptions.length === 0) {
			return;
		}
		const building = this.extractorOptions.reduce((best, candidate) =>
			ExtractorCapacity.baseRate(candidate) > ExtractorCapacity.baseRate(best) ? candidate : best);
		this.extractorRows = [...this.extractorRows, {
			count: 1,
			purity: 'normal',
			buildingClassName: building.className,
			clockSpeed: this.defaultExtractorClock,
			satellites: {...DEFAULT_SATELLITES},
		}];
		this.onExtractorsChange();
	}

	public removeExtractorRow(index: number): void
	{
		this.extractorRows = this.extractorRows.filter((_, rowIndex) => rowIndex !== index);
		this.onExtractorsChange();
	}

	public onRowClockChange(row: ExtractorDraft, clockSpeed: number): void
	{
		row.clockSpeed = clockSpeed;
		this.onExtractorsChange();
	}

	public onExtractorsChange(): void
	{
		this.extractorsPending = true;
		this.applySubject.next();
	}

	public removeSetup(): void
	{
		this.extractorRows = [];
		this.onExtractorsChange();
	}

	private get extractorBeltCap(): number | null
	{
		const limit = this.planManager.activeSettings()?.conveyorLimit;
		return limit === undefined ? null : ConveyorCapacity.capacity(limit, ConveyorCapacity.isFluid(this.item));
	}

	private get defaultExtractorClock(): number
	{
		return Formulas.clampClock(this.planManager.activeSettings()?.defaultClockSpeed ?? 100);
	}

	private loadExtractorOptions(node: Node): void
	{
		const data = this.versionManager.activeVersionData();
		const item = node instanceof ItemAmountNode ? node.item : null;
		this.extractorOptions = data && item ? ExtractorCapacity.extractorsFor(data, item.className) : [];
	}

	private loadExtractorDraft(node: Node): void
	{
		this.extractorsPending = false;
		this.extractorRows = node instanceof MineNode && node.extractors !== null
			? node.extractors.map(row => ({
				count: row.count,
				purity: row.purity,
				buildingClassName: row.buildingClassName,
				clockSpeed: row.clockSpeed,
				satellites: row.satellites
					? {impure: row.satellites.impure, normal: row.satellites.normal, pure: row.satellites.pure}
					: {...DEFAULT_SATELLITES},
			}))
			: [];
	}

	public get draftPower(): number | null
	{
		const generator = this.generator;
		return generator
			? Formulas.generatorPowerProduction(generator.generator, this.amount || 0, this.draftClock)
			: null;
	}

	public get draftShards(): number
	{
		return Math.ceil((this.amount || 0) - 1e-9) * Formulas.powerShards(this.draftClock);
	}

	public get canClock(): boolean
	{
		return this.generator?.generator.canOverclock ?? false;
	}

	/** Restating the count at the new clock keeps the power, so the graph's flows stay as they were. */
	public onClockChange(): void
	{
		const clock = this.draftClock;
		if (clock !== this.draftClockBase && this.draftClockBase > 0) {
			this.amount = Math.round((this.amount || 0) * this.draftClockBase / clock * 1e6) / 1e6;
		}
		this.draftClockBase = clock;
		this.applyPending = true;
		this.applySubject.next();
	}

	private get draftClock(): number
	{
		return Formulas.clampClock(this.clockSpeed || 100);
	}

	public toggleLock(): void
	{
		this.actions.requestNodeLock({nodeIds: [this.node.id], locked: !this.node.locked});
	}

	public onAmountChange(): void
	{
		this.applyPending = true;
		this.applySubject.next();
	}

	private flushPendingApply(): void
	{
		if (this.applyPending || this.extractorsPending) {
			this.applyDraft();
		}
	}

	private applyDraft(): void
	{
		const node = this.loadedNode;
		const applyAmount = this.applyPending;
		const applyExtractors = this.extractorsPending;
		if (!node || (!applyAmount && !applyExtractors)) {
			return;
		}
		this.applyPending = false;
		this.extractorsPending = false;

		const amount = this.amount || 0;
		if (node instanceof MineNode) {
			const resized = applyAmount && amount > 0 && Math.abs(amount - node.amount) > 1e-9;
			if (!resized && !applyExtractors) {
				return;
			}
			const extractors = applyExtractors ? this.extractorDraftRows() : node.extractors;
			// Setups are a manual edit too, but they must keep the lock state the amount edit would change.
			this.actions.requestNodeUpdate(this.withExtractors(node, extractors, resized ? amount : node.amount, resized || node.locked));
			return;
		}
		if (!applyAmount || amount <= 0) {
			return;
		}
		if (node instanceof GeneratorNode) {
			const clock = this.draftClock;
			if (Math.abs(amount - node.amount) <= 1e-9 && clock === node.clockSpeed) {
				return;
			}
			const replacement = this.resizer.withGenerator(node, amount, clock);
			if (replacement) {
				this.actions.requestNodeUpdate(replacement);
			}
			return;
		}
		if (Math.abs(amount - node.amount) <= 1e-9) {
			return;
		}
		const updated = this.resizer.withSize(node, amount);
		if (updated) {
			this.actions.requestNodeUpdate(updated);
		}
	}

	private extractorDraftRows(): ExtractorRow[] | null
	{
		if (this.extractorRows.length === 0) {
			return null;
		}
		return this.extractorRows.map(row => ({
			count: Math.max(1, Math.round(row.count || 1)),
			purity: row.purity,
			buildingClassName: row.buildingClassName,
			clockSpeed: Formulas.clampClock(row.clockSpeed || 100),
			...(this.isWellRow(row)
				? {
					satellites: {
						impure: Math.max(0, Math.round(row.satellites.impure || 0)),
						normal: Math.max(0, Math.round(row.satellites.normal || 0)),
						pure: Math.max(0, Math.round(row.satellites.pure || 0)),
					},
				}
				: {}),
		}));
	}

	private withExtractors(node: MineNode, extractors: ExtractorRow[] | null, amount: number, locked: boolean): MineNode
	{
		const replacement = new MineNode(node.id, amount, node.item);
		replacement.x = node.x;
		replacement.y = node.y;
		replacement.locked = locked;
		replacement.done = node.done;
		replacement.extractors = extractors;
		return replacement;
	}

}
