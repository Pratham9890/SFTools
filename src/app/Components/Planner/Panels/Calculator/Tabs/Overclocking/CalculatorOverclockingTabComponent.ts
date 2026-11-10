import {Component, OnDestroy, ChangeDetectionStrategy, computed, signal} from '@angular/core';
import {toObservable} from '@angular/core/rxjs-interop';
import {Subscription} from 'rxjs';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faXmark} from '@fortawesome/free-solid-svg-icons';
import {InfoNoteComponent} from '@src/Components/Common/InfoNoteComponent';
import {ClockSpeedInputComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Overclocking/ClockSpeedInputComponent';
import {ItemPickerComponent} from '@src/Components/Common/ItemPickerComponent';
import {ItemPickerOption} from '@src/Components/Common/ItemPickerOption';
import {ShardBudgetDialogComponent} from '@src/Components/Planner/ShardBudget/ShardBudgetDialogComponent';
import {ShardFitPreview} from '@src/Components/Planner/ShardBudget/ShardFitPreview';
import {ShardFitService} from '@src/Components/Planner/ShardBudget/ShardFitService';
import {PlanBreakdownService} from '@src/Model/Planner/Breakdown/PlanBreakdownService';
import {Formulas} from '@src/Model/Planner/Formulas';
import {GeneratorClockSpeed} from '@src/Model/Planner/GeneratorClockSpeed';
import {MachineClockSpeed} from '@src/Model/Planner/MachineClockSpeed';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {RecipeClockSpeed} from '@src/Model/Planner/RecipeClockSpeed';
import {VersionManager} from '@src/Model/Data/VersionManager';

@Component({
	selector: 'calculator-overclocking-tab',
	templateUrl: './CalculatorOverclockingTabComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [ClockSpeedInputComponent, FaIconComponent, ItemPickerComponent, InfoNoteComponent, ShardBudgetDialogComponent],
	providers: [ShardFitService],
})
export class CalculatorOverclockingTabComponent implements OnDestroy
{

	public readonly faXmark = faXmark;

	public rows: RecipeClockSpeed[] = [];

	public machineRows: MachineClockSpeed[] = [];

	public generatorRows: GeneratorClockSpeed[] = [];

	public readonly fitPreview = signal<ShardFitPreview | null>(null);

	private loadedOwnerId: string | null = null;
	private readonly subscription = new Subscription();

	private readonly ownerId = computed(() =>
		this.planManager.activePlan()?.id ?? this.planManager.activeFolder()?.id ?? null);

	/** Same count as the status bar: the breakdown also carries subplan shards. */
	private readonly shardsUsedSignal = computed(() =>
		this.breakdown.buildCost(this.planManager.activePlan()).shards);

	public constructor(
		private readonly planManager: PlanManager,
		private readonly versionManager: VersionManager,
		private readonly breakdown: PlanBreakdownService,
		private readonly shardFit: ShardFitService,
	)
	{
		this.loadedOwnerId = this.ownerId();
		this.loadRows();

		this.subscription.add(
			toObservable(this.ownerId).subscribe(ownerId => {
				if (ownerId === this.loadedOwnerId) return;
				this.loadedOwnerId = ownerId;
				this.loadRows();
			}),
		);
	}

	private loadRows(): void
	{
		const overrides = this.planManager.activeSettings()?.recipeClockSpeeds ?? [];
		this.rows = overrides.length > 0
			? overrides.map(row => ({...row}))
			: [this.blankRow()];
		const machineOverrides = this.planManager.activeSettings()?.machineClockSpeeds ?? [];
		this.machineRows = machineOverrides.length > 0
			? machineOverrides.map(row => ({...row}))
			: [this.blankMachineRow()];
		const generatorOverrides = this.planManager.activeSettings()?.generatorClockSpeeds ?? [];
		this.generatorRows = generatorOverrides.length > 0
			? generatorOverrides.map(row => ({...row}))
			: [this.blankGeneratorRow()];
	}

	private blankRow(): RecipeClockSpeed
	{
		return {recipeClassName: '', clockSpeed: 100};
	}

	private blankMachineRow(): MachineClockSpeed
	{
		return {machineClassName: '', clockSpeed: 100};
	}

	private blankGeneratorRow(): GeneratorClockSpeed
	{
		return {generatorClassName: '', clockSpeed: 100};
	}

	public get defaultClockSpeed(): number
	{
		return this.planManager.activeSettings()?.defaultClockSpeed ?? 100;
	}

	public setDefaultClockSpeed(value: number): void
	{
		const settings = this.planManager.activeSettings();
		if (!settings || !isFinite(value)) return;
		const clock = Formulas.clampClock(value);
		this.planManager.updateActiveSettings({...settings, defaultClockSpeed: clock === 100 ? undefined : clock});
	}

	public get hasShardBudget(): boolean
	{
		return this.planManager.activeSettings()?.maxShards !== undefined;
	}

	public get shardBudget(): number
	{
		return this.planManager.activeSettings()?.maxShards ?? 0;
	}

	public get shardsUsed(): number
	{
		return this.shardsUsedSignal();
	}

	public get shardsOverBudget(): boolean
	{
		return this.hasShardBudget && this.shardsUsed > this.shardBudget;
	}

	public get canFitShards(): boolean
	{
		const plan = this.planManager.activePlan();
		return plan !== null && !this.planManager.activePlanReadOnly() && (plan.graph?.nodes.length ?? 0) > 0;
	}

	public setShardBudgetEnabled(enabled: boolean): void
	{
		const settings = this.planManager.activeSettings();
		if (!settings) return;
		this.planManager.updateActiveSettings({
			...settings,
			maxShards: enabled ? Math.max(0, Math.round(this.shardsUsed)) : undefined,
		});
	}

	public setShardBudget(value: number): void
	{
		const settings = this.planManager.activeSettings();
		if (!settings || !isFinite(value)) return;
		this.planManager.updateActiveSettings({...settings, maxShards: Math.max(0, Math.round(value))});
	}

	public openShardFit(): void
	{
		const preview = this.shardFit.preview();
		if (preview !== null) {
			this.fitPreview.set(preview);
		}
	}

	public closeShardFit(): void
	{
		this.fitPreview.set(null);
	}

	public get recipeOptions(): ItemPickerOption[]
	{
		const data = this.versionManager.activeVersionData();
		if (!data) return [];
		return data.getRecipesForMachines()
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(recipe => ({
				value: recipe.className,
				label: recipe.name,
				iconHash: recipe.products[0]?.item.icon ?? null,
			}));
	}

	public get machineOptions(): ItemPickerOption[]
	{
		const data = this.versionManager.activeVersionData();
		if (!data) return [];
		return data.getProductionMachines()
			.filter(machine => machine.canOverclock)
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(machine => ({
				value: machine.className,
				label: machine.name,
				iconHash: machine.icon,
			}));
	}

	public get generatorOptions(): ItemPickerOption[]
	{
		const data = this.versionManager.activeVersionData();
		if (!data) return [];
		return data.getPowerGenerators()
			.filter(generator => generator.canOverclock)
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(generator => ({
				value: generator.className,
				label: generator.name,
				iconHash: generator.icon,
			}));
	}

	public onGeneratorChange(row: GeneratorClockSpeed, value: string): void
	{
		row.generatorClassName = value;
		this.syncGenerators();
	}

	public onGeneratorClockChange(row: GeneratorClockSpeed, value: number): void
	{
		row.clockSpeed = value;
		this.syncGenerators();
	}

	public addGeneratorRow(): void
	{
		this.generatorRows.push(this.blankGeneratorRow());
	}

	public removeGeneratorRow(index: number): void
	{
		this.generatorRows.splice(index, 1);
		if (this.generatorRows.length === 0) {
			this.generatorRows.push(this.blankGeneratorRow());
		}
		this.syncGenerators();
	}

	public syncGenerators(): void
	{
		const settings = this.planManager.activeSettings();
		if (!settings) return;
		const overrides = this.generatorRows
			.filter(row => row.generatorClassName !== '')
			.map(row => ({...row}));
		this.planManager.updateActiveSettings({
			...settings,
			generatorClockSpeeds: overrides.length > 0 ? overrides : undefined,
		});
	}

	public onMachineChange(row: MachineClockSpeed, value: string): void
	{
		row.machineClassName = value;
		this.syncMachines();
	}

	public onMachineClockChange(row: MachineClockSpeed, value: number): void
	{
		row.clockSpeed = value;
		this.syncMachines();
	}

	public addMachineRow(): void
	{
		this.machineRows.push(this.blankMachineRow());
	}

	public removeMachineRow(index: number): void
	{
		this.machineRows.splice(index, 1);
		if (this.machineRows.length === 0) {
			this.machineRows.push(this.blankMachineRow());
		}
		this.syncMachines();
	}

	public syncMachines(): void
	{
		const settings = this.planManager.activeSettings();
		if (!settings) return;
		const overrides = this.machineRows
			.filter(row => row.machineClassName !== '')
			.map(row => ({...row}));
		this.planManager.updateActiveSettings({
			...settings,
			machineClockSpeeds: overrides.length > 0 ? overrides : undefined,
		});
	}

	public onRecipeChange(row: RecipeClockSpeed, value: string): void
	{
		row.recipeClassName = value;
		this.sync();
	}

	public onClockChange(row: RecipeClockSpeed, value: number): void
	{
		row.clockSpeed = value;
		this.sync();
	}

	public addRow(): void
	{
		this.rows.push(this.blankRow());
	}

	public removeRow(index: number): void
	{
		this.rows.splice(index, 1);
		// Always keep one blank row ready, so "Add recipe" stays optional.
		if (this.rows.length === 0) {
			this.rows.push(this.blankRow());
		}
		this.sync();
	}

	public sync(): void
	{
		const settings = this.planManager.activeSettings();
		if (!settings) return;
		const overrides = this.rows
			.filter(row => row.recipeClassName !== '')
			.map(row => ({...row}));
		this.planManager.updateActiveSettings({
			...settings,
			recipeClockSpeeds: overrides.length > 0 ? overrides : undefined,
		});
	}

	public ngOnDestroy(): void
	{
		this.subscription.unsubscribe();
	}

}
