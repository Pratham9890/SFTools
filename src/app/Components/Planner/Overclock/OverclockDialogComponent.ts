import {ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, OnInit, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {HotkeyBlockDirective} from '@src/Components/Common/HotkeyBlockDirective';
import {ClockSpeedInputComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Overclocking/ClockSpeedInputComponent';
import {Formulas} from '@src/Model/Planner/Formulas';
import {ClockSpeedResolver} from '@src/Model/Planner/ClockSpeedResolver';
import {QuickOverclock} from '@src/Model/Planner/QuickOverclock';
import {MachineGroup} from '@src/Model/Planner/Solver/Response/MachineGroup';
import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';
import {RateFormatter} from '@src/Model/RateFormatter';

/** Runs part of a recipe node's machines at one clock speed and leaves the rest at the plan's default clock. */
@Component({
	selector: 'overclock-dialog',
	templateUrl: './OverclockDialogComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [FormsModule, HotkeyBlockDirective, ClockSpeedInputComponent],
	styles: [`
		.overclock-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 1060; display: flex; align-items: center; justify-content: center; }
		.overclock-dialog { width: min(440px, 92vw); max-height: 80vh; display: flex; flex-direction: column; }
	`],
})
export class OverclockDialogComponent implements OnInit
{

	@Input({required: true}) public node!: RecipeNode;

	@Output() public readonly applyNode = new EventEmitter<RecipeNode>();
	@Output() public readonly close = new EventEmitter<void>();

	public clockSpeed = 100;
	public machines = 1;
	public restClockSpeed = 100;

	private machinesEdited = false;

	public constructor(
		private readonly clocks: ClockSpeedResolver,
		public readonly rateFormatter: RateFormatter,
	)
	{
	}

	public ngOnInit(): void
	{
		this.restClockSpeed = this.clocks.forRecipe(this.node.recipe, this.node.machine);
		this.clockSpeed = QuickOverclock.clampedClock(this.node.machine, 100);
		this.machines = this.defaultMachines;
	}

	@HostListener('document:keydown.escape')
	public onEscape(): void
	{
		this.close.emit();
	}

	public get previewGroups(): MachineGroup[]
	{
		return QuickOverclock.groups(this.node, this.clockSpeed, this.machines, this.restClockSpeed, this.node.groupingMode);
	}

	public get defaultMachines(): number
	{
		return QuickOverclock
			.groups(this.node, this.clockSpeed, Number.MAX_SAFE_INTEGER, this.restClockSpeed, this.node.groupingMode)
			.reduce((sum, group) => sum + group.machines, 0);
	}

	public get previewMachines(): number
	{
		return this.previewGroups.reduce((sum, group) => sum + group.machines, 0);
	}

	public get originalMachines(): number
	{
		return this.node.groups.reduce((sum, group) => sum + group.machines, 0);
	}

	public get canApply(): boolean
	{
		return this.node.machine.canOverclock && !this.node.groups.some(group => group.sloops > 0) && this.previewGroups.length > 0;
	}

	public get previewText(): string
	{
		const groups = this.previewGroups;
		if (groups.length === 0) {
			return '';
		}
		const parts = groups.map(group =>
			`${this.rateFormatter.machineCount(group.machines)} × ${this.rateFormatter.clock(group.clockSpeed)}%`);
		return `${parts.join(' + ')} = ${this.rateFormatter.machineCount(this.previewMachines)} machines (was ${this.rateFormatter.machineCount(this.originalMachines)})`;
	}

	public get shards(): number
	{
		return this.previewGroups.reduce((sum, group) => sum + Formulas.powerShards(group.clockSpeed) * group.machines, 0);
	}

	public get powerBefore(): number
	{
		return this.node.powerDraw().average;
	}

	public get powerAfter(): number
	{
		const groups = this.previewGroups;
		if (groups.length === 0) {
			return 0;
		}
		return this.candidate(groups).powerDraw().average;
	}

	public onClockChange(value: number): void
	{
		this.clockSpeed = QuickOverclock.clampedClock(this.node.machine, value);
		if (!this.machinesEdited) {
			this.machines = this.defaultMachines;
		}
	}

	public onMachinesChange(): void
	{
		this.machinesEdited = true;
	}

	public onMachinesBlur(): void
	{
		if (!Number.isFinite(this.machines) || this.machines < 1) {
			this.machines = this.defaultMachines;
			this.machinesEdited = false;
		}
	}

	public allMachines(): void
	{
		this.machinesEdited = false;
		this.machines = this.defaultMachines;
	}

	public apply(): void
	{
		if (!this.canApply) {
			return;
		}
		const groups = this.previewGroups;
		const updated = this.candidate(groups);
		updated.x = this.node.x;
		updated.y = this.node.y;
		// Quick overclocking is a manual edit: the node stays user-owned through further solves.
		updated.locked = true;
		updated.done = this.node.done;
		updated.groupingMode = this.node.groupingMode;
		this.applyNode.emit(updated);
	}

	private candidate(groups: MachineGroup[]): RecipeNode
	{
		return new RecipeNode(this.node.id, this.node.target, groups, this.node.machine, this.node.recipe);
	}

}
