import {Component, ChangeDetectionStrategy} from '@angular/core';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faArrowRotateLeft, faArrowRotateRight, faExpand, faImage, faMinus, faPlus, faSitemap} from '@fortawesome/free-solid-svg-icons';
import {AppTooltipDirective} from '@src/Components/Common/AppTooltipDirective';
import {GraphExportDialogService} from '@src/Components/Planner/Export/GraphExportDialogService';
import {GraphHistoryService} from '@src/Components/Planner/GraphHistoryService';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {PlannerGraphService} from '@src/Components/Planner/PlannerGraphService';
import {PanelLayoutService} from '@src/Components/Planner/Panel/PanelLayoutService';
import {HotkeyService} from '@src/Model/Hotkeys/HotkeyService';
import {PlanManager} from '@src/Model/Planner/PlanManager';

@Component({
	selector: 'planner-zoom-controls',
	templateUrl: './PlannerZoomControlsComponent.html',
	imports: [FaIconComponent, AppTooltipDirective],
	changeDetection: ChangeDetectionStrategy.Eager,
	styles: [`
		:host {
			display: flex;
			flex-direction: column;
			background: #1b2834;
			border: 1px solid #34475a;
			overflow: hidden;
		}
		.zb {
			width: 30px;
			height: 28px;
			display: flex;
			align-items: center;
			justify-content: center;
			border: none;
			border-bottom: 1px solid #34475a;
			background: transparent;
			color: #9fb0c0;
			font-size: 15px;
			line-height: 1;
			cursor: pointer;
		}
		.zb:last-child { border-bottom: none; }
		.zb:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: #fff; }
		.zb:disabled { color: #4a5d71; cursor: default; }
		/* Rearrange sits after Fit, apart from the zoom pair it does not belong to. */
		.zb-separated { border-top: 1px solid #34475a; }
		.zb-rearrange {
			width: auto;
			gap: 5px;
			padding: 0 8px;
			font-size: 11px;
			font-weight: 600;
		}
	`],
})
export class PlannerZoomControlsComponent
{

	public readonly faPlus = faPlus;
	public readonly faMinus = faMinus;
	public readonly faExpand = faExpand;
	public readonly faArrowRotateLeft = faArrowRotateLeft;
	public readonly faArrowRotateRight = faArrowRotateRight;
	public readonly faImage = faImage;
	public readonly faSitemap = faSitemap;

	public constructor(
		private readonly plannerGraph: PlannerGraphService,
		private readonly actions: PlannerActionsService,
		private readonly planManager: PlanManager,
		public readonly layout: PanelLayoutService,
		public readonly history: GraphHistoryService,
		public readonly hotkeys: HotkeyService,
		private readonly exportDialog: GraphExportDialogService,
	) {
	}

	public undo(): void
	{
		this.actions.requestUndo();
	}

	public redo(): void
	{
		this.actions.requestRedo();
	}

	public zoomIn(): void
	{
		this.plannerGraph.zoomIn();
	}

	public zoomOut(): void
	{
		this.plannerGraph.zoomOut();
	}

	public zoomFit(): void
	{
		this.plannerGraph.zoomFit();
	}

	/** Same action as the old calculator header's Rearrange button. */
	public relayout(): void
	{
		this.actions.requestRelayout();
	}

	public get hasGraph(): boolean
	{
		return (this.planManager.activePlan()?.graph?.nodes.length ?? 0) > 0;
	}

	public exportImage(): void
	{
		this.exportDialog.open();
	}

}
