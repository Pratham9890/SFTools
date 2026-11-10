import {Component, ChangeDetectionStrategy} from '@angular/core';
import {InfoNoteComponent} from '@src/Components/Common/InfoNoteComponent';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {PlannerGraphService} from '@src/Components/Planner/PlannerGraphService';
import {Item} from '@src/Model/Data/Entities/Item';
import {VersionManager} from '@src/Model/Data/VersionManager';
import {ConveyorTiers} from '@src/Model/Map/ConveyorTiers';
import {BeltLayoutMode, BeltLayoutSettings} from '@src/Model/Planner/BeltLayoutSettings';
import {ConveyorCapacity} from '@src/Model/Planner/ConveyorCapacity';
import {ConveyorLimit} from '@src/Model/Planner/ConveyorLimit';
import {LineSplitter} from '@src/Model/Planner/LineSplitter';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {PlanSerializer} from '@src/Model/Planner/PlanSerializer';
import {RateFormatter} from '@src/Model/RateFormatter';

@Component({
	selector: 'calculator-logistics-tab',
	templateUrl: './CalculatorLogisticsTabComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [InfoNoteComponent],
})
export class CalculatorLogisticsTabComponent
{

	public readonly beltMarks: readonly number[] = ConveyorTiers.BELTS.map((_rate, index) => index + 1);
	public readonly pipeMarks: readonly number[] = ConveyorTiers.PIPES.map((_rate, index) => index + 1);
	public readonly beltLayoutModes: readonly {value: BeltLayoutMode; label: string; description: string}[] = [
		{value: 'fewest', label: 'Fewest belts', description: 'fill each belt as full as possible before starting the next'},
		{value: 'even', label: 'Even spread', description: 'spread the flow over the belts, with an adjustable target'},
		{value: 'full', label: 'Round up to full belts', description: 'regroup machines so every belt but the last runs full'},
	];

	private readonly lineSplitter = new LineSplitter();

	public constructor(
		private readonly planManager: PlanManager,
		private readonly plannerGraph: PlannerGraphService,
		private readonly versionManager: VersionManager,
		private readonly rateFormatter: RateFormatter,
		private readonly actions: PlannerActionsService,
		private readonly planSerializer: PlanSerializer,
	)
	{
	}

	public get limit(): ConveyorLimit | undefined
	{
		return this.planManager.activeSettings()?.conveyorLimit;
	}

	public get enabled(): boolean
	{
		return this.limit !== undefined;
	}

	public get beltMark(): number
	{
		return this.limit?.beltMark ?? ConveyorTiers.BELTS.length;
	}

	public get pipeMark(): number
	{
		return this.limit?.pipeMark ?? ConveyorTiers.PIPES.length;
	}

	public get beltLayout(): BeltLayoutSettings | undefined
	{
		return this.planManager.activeSettings()?.beltLayout;
	}

	public get beltManagementEnabled(): boolean
	{
		return this.beltLayout !== undefined;
	}

	public get beltLayoutMode(): BeltLayoutMode
	{
		return this.beltLayout?.mode ?? 'fewest';
	}

	public get beltEvenness(): number
	{
		return this.beltLayout?.evenness ?? 0.5;
	}

	public get beltSplitOutputs(): boolean
	{
		return this.beltLayout?.splitOutputs ?? true;
	}

	public get beltAllowPlanChanges(): boolean
	{
		return this.beltLayout?.allowPlanChanges ?? false;
	}

	public get beltView(): boolean
	{
		return this.beltLayout?.beltView ?? false;
	}

	public get overLimitCount(): number
	{
		const limit = this.limit;
		if (limit === undefined) {
			return 0;
		}
		return ConveyorCapacity.overLimitCount(this.plannerGraph.edges(), limit, className => this.itemFor(className));
	}

	public get overLimitText(): string
	{
		const count = this.overLimitCount;
		if (count === 0) {
			return 'All connections fit on one belt/pipe';
		}
		return `${count} ${count === 1 ? 'connection' : 'connections'} over the limit`;
	}

	public get lineSplitCount(): number
	{
		if (this.planManager.activePlanReadOnly()) {
			return 0;
		}
		const plan = this.planManager.activePlan();
		const limit = this.limit;
		const data = this.versionManager.activeVersionData();
		if (!plan?.graph || limit === undefined || data === null) {
			return 0;
		}
		try {
			return this.lineSplitter.eligibleEdges(this.planSerializer.reviveGraph(plan.graph), limit, data).length;
		} catch {
			// A graph that cannot be revived offers nothing to split.
			return 0;
		}
	}

	public splitIntoLines(): void
	{
		const count = this.lineSplitCount;
		if (count === 0 || !confirm(`Split ${count} connections into lines? Machines are regrouped per belt; you can undo it.`)) {
			return;
		}
		this.actions.requestLineSplitAll();
	}

	public beltLabel(mark: number): string
	{
		return `Mk.${mark} (${this.rateFormatter.amount(ConveyorTiers.belt(mark))}/min)`;
	}

	public pipeLabel(mark: number): string
	{
		return `Mk.${mark} (${this.rateFormatter.amount(ConveyorTiers.pipe(mark))} m³/min)`;
	}

	public setEnabled(enabled: boolean): void
	{
		const settings = this.planManager.activeSettings();
		if (!settings) return;
		this.planManager.updateActiveSettings({
			...settings,
			conveyorLimit: enabled ? {beltMark: ConveyorTiers.BELTS.length, pipeMark: ConveyorTiers.PIPES.length} : undefined,
			beltLayout: enabled ? settings.beltLayout : undefined,
		});
	}

	public setBeltMark(mark: number): void
	{
		const settings = this.planManager.activeSettings();
		const limit = this.limit;
		if (!settings || limit === undefined) return;
		this.planManager.updateActiveSettings({...settings, conveyorLimit: {...limit, beltMark: mark}});
	}

	public setPipeMark(mark: number): void
	{
		const settings = this.planManager.activeSettings();
		const limit = this.limit;
		if (!settings || limit === undefined) return;
		this.planManager.updateActiveSettings({...settings, conveyorLimit: {...limit, pipeMark: mark}});
	}

	public setBeltManagement(enabled: boolean): void
	{
		const settings = this.planManager.activeSettings();
		if (!settings) return;
		this.planManager.updateActiveSettings({
			...settings,
			beltLayout: enabled
				? {mode: 'fewest', evenness: 0.5, splitOutputs: true, allowPlanChanges: false, beltView: false}
				: undefined,
		});
	}

	public setBeltLayoutMode(mode: BeltLayoutMode): void
	{
		this.updateBeltLayout({mode});
	}

	public setEvenness(evenness: number): void
	{
		this.updateBeltLayout({evenness: Math.min(1, Math.max(0, evenness))});
	}

	public setSplitOutputs(splitOutputs: boolean): void
	{
		this.updateBeltLayout({splitOutputs});
	}

	public setAllowPlanChanges(allowPlanChanges: boolean): void
	{
		this.updateBeltLayout({allowPlanChanges});
	}

	public setBeltView(beltView: boolean): void
	{
		this.updateBeltLayout({beltView});
	}

	private updateBeltLayout(changes: Partial<BeltLayoutSettings>): void
	{
		const settings = this.planManager.activeSettings();
		const layout = settings?.beltLayout;
		if (!settings || !layout) return;
		this.planManager.updateActiveSettings({...settings, beltLayout: {...layout, ...changes}});
	}

	private itemFor(className: string): Item | null
	{
		return this.versionManager.activeVersionData()?.searchItemByClassName(className) ?? null;
	}

}
