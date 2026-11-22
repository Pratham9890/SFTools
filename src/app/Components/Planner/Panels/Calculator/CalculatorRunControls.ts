import {Signal, computed} from '@angular/core';
import {CalculationModeOption} from '@src/Components/Planner/Panels/Calculator/CalculationModeOption';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {CalculationMode} from '@src/Model/Planner/CalculationMode';
import {PlanManager} from '@src/Model/Planner/PlanManager';

/**
 * The Preview and Calculate controls, shared by the top bar and the old full calculator so the label, hint,
 * disabled state and the four modes cannot drift apart.
 */
export class CalculatorRunControls
{

	public readonly modeOptions: readonly CalculationModeOption[] = [
		{mode: 'automatic', label: 'Automatic', description: 'Recalculates after every change'},
		{mode: 'manual-fresh', label: 'Manual (replace)', description: 'Replaces the current chart'},
		{mode: 'manual-upgrade', label: 'Manual (merge)', description: 'Adds to the current chart. Matching blocks are combined.'},
		{mode: 'manual-append', label: 'Manual (add)', description: 'Adds the result next to the current chart. Nothing is combined.'},
	];

	/** Plans saved before calculation modes existed have no mode - treat them as automatic. */
	public readonly mode: Signal<CalculationMode>;

	public readonly modeLabel: Signal<string>;

	public readonly buttonLabel: Signal<string>;

	public readonly calculateHint: Signal<string>;

	public readonly graphDirty: Signal<boolean>;

	public readonly calculating: Signal<boolean>;

	/** Preview and the mode menu are dead while a solve runs. */
	public readonly busy: Signal<boolean>;

	/** Automatic mode with nothing to rebuild would solve nothing, so the button rests disabled. */
	public readonly calculateDisabled: Signal<boolean>;

	public constructor(
		private readonly planManager: PlanManager,
		public readonly actions: PlannerActionsService,
	)
	{
		this.mode = computed(() => this.planManager.activeSettings()?.calculationMode ?? 'automatic');
		this.graphDirty = this.planManager.activePlanGraphDirty;
		this.calculating = this.actions.isCalculating;
		this.busy = computed(() => this.calculating());
		this.modeLabel = computed(() =>
			this.modeOptions.find(option => option.mode === this.mode())?.label ?? 'Automatic');
		this.buttonLabel = computed(() => {
			switch (this.mode()) {
				case 'manual-fresh': return 'Calculate';
				case 'manual-upgrade': return 'Calculate (merge)';
				case 'manual-append': return 'Calculate (add)';
				default: return this.graphDirty() ? 'Back to automatic' : 'Automatic';
			}
		});
		this.calculateHint = computed(() => this.graphDirty()
			? 'Build the chart again. Only locked blocks keep your hand edits.'
			: this.modeOptions.find(option => option.mode === this.mode())?.description ?? '');
		this.calculateDisabled = computed(() =>
			this.calculating() || (this.mode() === 'automatic' && !this.graphDirty()));
	}

	public setMode(mode: CalculationMode): void
	{
		const settings = this.planManager.activeSettings();
		if (settings) {
			this.planManager.updateActiveSettings({...settings, calculationMode: mode});
		}
	}

	public calculate(): void
	{
		if (!this.planManager.activePlan()) {
			return;
		}
		// No confirmation: the note and tooltip explain the rebuild, and undo restores the graph.
		// The dirty flag is cleared by the solve completing, so a failed or cancelled solve stays paused.
		this.actions.requestCalculate();
	}

	public cancel(): void
	{
		this.actions.requestCancel();
	}

	public preview(): void
	{
		this.actions.requestCalculatePreview();
	}

}
