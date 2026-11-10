import {ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faLock} from '@fortawesome/free-solid-svg-icons';
import {HotkeyBlockDirective} from '@src/Components/Common/HotkeyBlockDirective';
import {CalculateChangeRow} from '@src/Components/Planner/CalculatePreview/CalculateChangeRow';
import {Graph} from '@src/Model/Planner/Graph/Graph';
import {GraphComposer} from '@src/Model/Planner/Graph/GraphComposer';
import {RateFormatter} from '@src/Model/RateFormatter';
import {ItemAmountNode} from '@src/Model/Planner/Solver/Response/ItemAmountNode';
import {MachineGroup} from '@src/Model/Planner/Solver/Response/MachineGroup';
import {Node} from '@src/Model/Planner/Solver/Response/Node';
import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';

/** The graph a previewed calculation would produce. Null while the solve runs. */
export interface CalculatePreviewState
{
	readonly existing: Graph;
	readonly graph: Graph | null;
}

/** Lists what Calculate would change, so blocks edited by hand can be locked first. */
@Component({
	selector: 'calculate-preview-dialog',
	templateUrl: './CalculatePreviewDialogComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [FormsModule, FaIconComponent, HotkeyBlockDirective],
	styles: [`
		.calculate-preview-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 1060; display: flex; align-items: center; justify-content: center; }
		.calculate-preview-dialog { width: min(520px, 92vw); max-height: 80vh; display: flex; flex-direction: column; }
	`],
})
export class CalculatePreviewDialogComponent
{

	@Input({required: true}) public existing!: Graph;
	@Input() public graph: Graph | null = null;
	@Input() public busy = false;

	@Output() public readonly lock = new EventEmitter<string>();
	@Output() public readonly calculate = new EventEmitter<void>();
	@Output() public readonly close = new EventEmitter<void>();

	public readonly faLock = faLock;

	public constructor(
		private readonly graphComposer: GraphComposer,
		private readonly rateFormatter: RateFormatter,
	)
	{
	}

	@HostListener('document:keydown.escape')
	public onEscape(): void
	{
		this.close.emit();
	}

	public get rows(): CalculateChangeRow[]
	{
		if (this.graph === null) {
			return [];
		}

		const incomingByKey = new Map<string, Node[]>();
		this.graph.nodes.forEach(node => {
			const key = this.graphComposer.identityKey(node);
			const nodes = incomingByKey.get(key);
			if (nodes === undefined) {
				incomingByKey.set(key, [node]);
			} else {
				nodes.push(node);
			}
		});

		const nextByKey = new Map<string, number>();
		const matched = new Set<Node>();
		const rows: CalculateChangeRow[] = [];
		this.existing.nodes.forEach(existing => {
			const key = this.graphComposer.identityKey(existing);
			const index = nextByKey.get(key) ?? 0;
			nextByKey.set(key, index + 1);
			const incoming = incomingByKey.get(key)?.[index];
			if (incoming !== undefined) {
				matched.add(incoming);
			}
			// Locked blocks are handed to the solver unchanged, so they are never a row.
			if (existing.locked) {
				return;
			}
			if (incoming === undefined) {
				rows.push({
					kind: 'removed',
					nodeId: existing.id,
					title: `Removed: ${this.describe(existing)}`,
					detail: null,
					lockable: existing.canToggleLock(),
				});
				return;
			}
			if (this.sameBlock(existing, incoming)) {
				return;
			}
			rows.push({
				kind: 'changed',
				nodeId: existing.id,
				title: this.changedTitle(existing, incoming),
				detail: this.changedDetail(existing, incoming),
				lockable: existing.canToggleLock(),
			});
		});

		this.graph.nodes.forEach(incoming => {
			if (!matched.has(incoming)) {
				rows.push({
					kind: 'added',
					nodeId: incoming.id,
					title: `New: ${this.describe(incoming)}`,
					detail: null,
					lockable: false,
				});
			}
		});

		return rows;
	}

	public onCalculate(): void
	{
		if (!this.busy && this.graph !== null) {
			this.calculate.emit();
		}
	}

	private sameBlock(before: Node, after: Node): boolean
	{
		if (before instanceof RecipeNode && after instanceof RecipeNode) {
			return this.sameNumber(before.amount, after.amount) && this.sameGroups(before.groups, after.groups);
		}
		return this.sameNumber(before.amount, after.amount);
	}

	private sameGroups(before: MachineGroup[], after: MachineGroup[]): boolean
	{
		return before.length === after.length && before.every((group, index) =>
			this.sameNumber(group.machines, after[index].machines)
			&& this.sameNumber(group.clockSpeed, after[index].clockSpeed)
			&& group.sloops === after[index].sloops);
	}

	/** Solver output carries float noise in the sixth significant digit. */
	private sameNumber(before: number, after: number): boolean
	{
		return Math.abs(before - after) <= 1e-6 * Math.max(1, Math.abs(before), Math.abs(after));
	}

	private changedTitle(before: Node, after: Node): string
	{
		if (before instanceof RecipeNode && after instanceof RecipeNode) {
			return `${before.recipe.name} · ${this.machineText(before)} → ${this.machineText(after)}`;
		}
		if (before instanceof ItemAmountNode && after instanceof ItemAmountNode) {
			return `${before.getDisplayName()} · ${this.rateFormatter.rate(before.amount, before.item)} → ${this.rateFormatter.rate(after.amount, after.item)}`;
		}
		return `${this.describe(before)} → ${this.describe(after)}`;
	}

	private changedDetail(before: Node, after: Node): string | null
	{
		if (!(before instanceof RecipeNode) || !(after instanceof RecipeNode) || this.sameGroups(before.groups, after.groups)) {
			return null;
		}
		return `${this.groupsText(before)} → ${this.groupsText(after)}`;
	}

	private describe(node: Node): string
	{
		if (node instanceof RecipeNode) {
			return `${node.recipe.name} · ${this.machineText(node)}`;
		}
		if (node instanceof ItemAmountNode) {
			return `${node.getDisplayName()} · ${this.rateFormatter.rate(node.amount, node.item)}`;
		}
		return `${node.getDisplayName()} · ${this.rateFormatter.machineCount(node.amount)}×`;
	}

	private machineText(node: RecipeNode): string
	{
		return `${this.rateFormatter.machineCount(node.amount)}× ${node.machine.name}`;
	}

	private groupsText(node: RecipeNode): string
	{
		if (node.groups.length === 0) {
			return 'no machines';
		}
		return node.groups.map(group => {
			const sloops = group.sloops > 0 ? ` (${this.rateFormatter.machineCount(group.sloops)} sloops)` : '';
			return `${this.rateFormatter.machineCount(group.machines)} × ${this.rateFormatter.clock(group.clockSpeed)}%${sloops}`;
		}).join(' + ');
	}

}
