import {FormsModule} from '@angular/forms';
import {ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, OnInit, Output} from '@angular/core';
import {HotkeyBlockDirective} from '@src/Components/Common/HotkeyBlockDirective';
import {Data} from '@src/Model/Data/Data';
import {Graph} from '@src/Model/Planner/Graph/Graph';
import {LineSplitLine, LineSplitMachinePart, LineSplitPlan, LineSplitResult, LineSplitStyle} from '@src/Model/Planner/LineSplit';
import {LineSplitter} from '@src/Model/Planner/LineSplitter';
import {RateFormatter} from '@src/Model/RateFormatter';

/** Shows how one connection is divided into one line per belt, and lets the user choose how machines are grouped. */
@Component({
	selector: 'line-split-dialog',
	templateUrl: './LineSplitDialogComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [FormsModule, HotkeyBlockDirective],
	styles: [`
		.line-split-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 1060; display: flex; align-items: center; justify-content: center; }
		.line-split-dialog { width: min(560px, 92vw); max-height: 80vh; display: flex; flex-direction: column; }
	`],
})
export class LineSplitDialogComponent implements OnInit
{

	@Input({required: true}) public graph!: Graph;
	@Input({required: true}) public edgeIndex!: number;
	@Input({required: true}) public capacity!: number;
	@Input({required: true}) public data!: Data;

	@Output() public readonly applyPlan = new EventEmitter<LineSplitPlan>();
	@Output() public readonly close = new EventEmitter<void>();

	public style: LineSplitStyle = 'full';

	private result: LineSplitResult | null = null;

	private readonly splitter = new LineSplitter();

	public constructor(public readonly rateFormatter: RateFormatter)
	{
	}

	public ngOnInit(): void
	{
		this.recalculate();
	}

	@HostListener('document:keydown.escape')
	public onEscape(): void
	{
		this.close.emit();
	}

	public get plan(): LineSplitPlan | null
	{
		const result = this.result;
		return this.isPlan(result) ? result : null;
	}

	public get blocked(): string | null
	{
		const result = this.result;
		return result !== null && 'blocked' in result ? result.blocked : null;
	}

	public get itemName(): string
	{
		const className = this.graph.edges[this.edgeIndex]?.itemClassName ?? '';
		return this.data.searchItemByClassName(className)?.name ?? className;
	}

	public selectStyle(style: LineSplitStyle): void
	{
		if (style === this.style) {
			return;
		}
		this.style = style;
		this.recalculate();
	}

	public rate(flow: number): string
	{
		const item = this.plan !== null ? this.data.searchItemByClassName(this.plan.itemClassName) ?? null : null;
		return this.rateFormatter.rate(flow, item);
	}

	public lineText(line: LineSplitLine): string
	{
		const sides: string[] = [];
		if (line.producer !== null) {
			sides.push(this.partText(line.producer));
		}
		if (line.consumer !== null) {
			sides.push(this.partText(line.consumer));
		}
		return sides.join(' → ');
	}

	public get totalsText(): string
	{
		const plan = this.plan;
		if (plan === null) {
			return '';
		}
		return plan.machines
			.map(total => `${total.name} ${this.rateFormatter.machineCount(total.before)} → ${this.rateFormatter.machineCount(total.after)}`)
			.join(' · ');
	}

	public get powerText(): string
	{
		const plan = this.plan;
		if (plan === null) {
			return '';
		}
		return `Power ${this.rateFormatter.power(plan.powerBefore)} → ${this.rateFormatter.power(plan.powerAfter)}`;
	}

	public apply(): void
	{
		const plan = this.plan;
		if (plan !== null) {
			this.applyPlan.emit(plan);
		}
	}

	private partText(part: LineSplitMachinePart): string
	{
		const machines = part.groups.reduce((sum, group) => sum + group.machines, 0);
		const clocks = part.groups
			.map(group => `${this.rateFormatter.machineCount(group.machines)} × ${this.rateFormatter.clock(group.clockSpeed)}%`)
			.join(' + ');
		return `${this.rateFormatter.machineCount(machines)}× ${part.machineName} (${clocks})`;
	}

	private recalculate(): void
	{
		this.result = this.splitter.plan(this.graph, this.edgeIndex, this.capacity, this.style, this.data);
	}

	private isPlan(result: LineSplitResult | null): result is LineSplitPlan
	{
		return result !== null && !('blocked' in result);
	}

}
