import {Component, ChangeDetectionStrategy} from '@angular/core';
import {InfoNoteComponent} from '@src/Components/Common/InfoNoteComponent';
import {PlannerGraphService} from '@src/Components/Planner/PlannerGraphService';
import {Item} from '@src/Model/Data/Entities/Item';
import {VersionManager} from '@src/Model/Data/VersionManager';
import {ConveyorTiers} from '@src/Model/Map/ConveyorTiers';
import {ConveyorCapacity} from '@src/Model/Planner/ConveyorCapacity';
import {ConveyorLimit} from '@src/Model/Planner/ConveyorLimit';
import {PlanManager} from '@src/Model/Planner/PlanManager';
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

	public constructor(
		private readonly planManager: PlanManager,
		private readonly plannerGraph: PlannerGraphService,
		private readonly versionManager: VersionManager,
		private readonly rateFormatter: RateFormatter,
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

	private itemFor(className: string): Item | null
	{
		return this.versionManager.activeVersionData()?.searchItemByClassName(className) ?? null;
	}

}
