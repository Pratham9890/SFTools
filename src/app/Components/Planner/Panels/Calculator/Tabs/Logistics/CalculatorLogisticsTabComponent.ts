import {Component, ChangeDetectionStrategy} from '@angular/core';
import {InfoNoteComponent} from '@src/Components/Common/InfoNoteComponent';
import {PlannerGraphService} from '@src/Components/Planner/PlannerGraphService';
import {Item} from '@src/Model/Data/Entities/Item';
import {VersionManager} from '@src/Model/Data/VersionManager';
import {ConveyorTiers} from '@src/Model/Map/ConveyorTiers';
import {BeltLayoutMode, BeltLayoutSettings, BeltLineStyle} from '@src/Model/Planner/BeltLayoutSettings';
import {BeltLayoutSettingsNormalizer} from '@src/Model/Planner/BeltLayoutSettingsNormalizer';
import {ConveyorCapacity} from '@src/Model/Planner/ConveyorCapacity';
import {ConveyorLimit} from '@src/Model/Planner/ConveyorLimit';
import {GroupingMode} from '@src/Model/Planner/GroupingMode';
import {GroupingModeResolver} from '@src/Model/Planner/GroupingModeResolver';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {RateFormatter} from '@src/Model/RateFormatter';

/** Drawing this many blocks takes tens of seconds, so the tab warns above it. */
const LARGE_BELT_VIEW_BLOCKS = 600;

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
	/** Matches the option labels of Settings → Machine groups → Default machine grouping for new nodes. */
	public readonly groupingModeLabels: Readonly<Record<GroupingMode, string>> = {
		'underclock-last': 'Underclock the last machine',
		'clock-equally': 'Same clock for all',
		'no-clocking': 'Whole machines only',
	};

	public constructor(
		private readonly planManager: PlanManager,
		private readonly plannerGraph: PlannerGraphService,
		private readonly versionManager: VersionManager,
		private readonly rateFormatter: RateFormatter,
		private readonly groupingModes: GroupingModeResolver,
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
		const layout = this.planManager.activeSettings()?.beltLayout;
		return layout === undefined ? undefined : BeltLayoutSettingsNormalizer.normalize(layout);
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

	public get lineStyle(): BeltLineStyle
	{
		return this.beltLayout?.lineStyle ?? 'even';
	}

	public get custom(): boolean
	{
		return this.lineStyle === 'custom';
	}

	public get blockCount(): number
	{
		return this.planManager.activePlan()?.graph?.nodes.length ?? 0;
	}

	public get largeBeltView(): boolean
	{
		return this.blockCount > LARGE_BELT_VIEW_BLOCKS;
	}

	public get blockCountText(): string
	{
		const count = this.blockCount;
		return `This plan has ${this.rateFormatter.amount(count)} ${count === 1 ? 'block' : 'blocks'}.`;
	}

	public readonly groupingModeOptions: readonly GroupingMode[] = ['underclock-last', 'clock-equally', 'no-clocking'];

	public get groupingMode(): GroupingMode
	{
		return this.groupingModes.resolve(this.planManager.activeSettings());
	}

	/** Writes the plan's defaultGroupingMode, the same value Settings → Machine groups edits. */
	public setGroupingMode(mode: GroupingMode): void
	{
		const settings = this.planManager.activeSettings();
		if (!settings || !this.groupingModeOptions.includes(mode)) return;
		this.planManager.updateActiveSettings({...settings, defaultGroupingMode: mode});
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
		const settings = this.planManager.activeSettings();
		if (!settings) return;
		if (!beltView) {
			this.planManager.updateActiveSettings({...settings, beltLayout: undefined});
			return;
		}
		const layout = settings.beltLayout;
		this.planManager.updateActiveSettings({
			...settings,
			beltLayout: layout === undefined
				? {mode: 'fewest', evenness: 0.5, splitOutputs: true, allowPlanChanges: false, beltView: true, lineStyle: 'even'}
				: {...BeltLayoutSettingsNormalizer.normalize(layout), beltView: true},
		});
	}

	public setCustom(custom: boolean): void
	{
		this.updateBeltLayout({lineStyle: custom ? 'custom' : 'even'});
	}

	private updateBeltLayout(changes: Partial<BeltLayoutSettings>): void
	{
		const settings = this.planManager.activeSettings();
		const layout = settings?.beltLayout;
		if (!settings || !layout) return;
		const normalized = BeltLayoutSettingsNormalizer.normalize(layout);
		this.planManager.updateActiveSettings({...settings, beltLayout: {...normalized, beltView: true, ...changes}});
	}

	private itemFor(className: string): Item | null
	{
		return this.versionManager.activeVersionData()?.searchItemByClassName(className) ?? null;
	}

}
