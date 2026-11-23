import {AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, computed, untracked} from '@angular/core';
import {NgComponentOutlet} from '@angular/common';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faSliders, faXmark} from '@fortawesome/free-solid-svg-icons';
import {HelpButtonComponent} from '@src/Components/Help/HelpButtonComponent';
import {PlannerDockService} from '@src/Components/Planner/Dock/PlannerDockService';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {InfoNoteComponent} from '@src/Components/Common/InfoNoteComponent';
import {PlanManager} from '@src/Model/Planner/PlanManager';

/**
 * The one drop-down panel under the planner's top bar, plus the solve-error strip that shows above it.
 * It lies over the chart, so opening or closing it never moves or rescales the flow chart; only the
 * zoom and fit padding follow it, through the measured height.
 */
@Component({
	selector: 'planner-dock',
	templateUrl: './PlannerDockComponent.html',
	imports: [NgComponentOutlet, FaIconComponent, HelpButtonComponent, InfoNoteComponent],
	changeDetection: ChangeDetectionStrategy.Eager,
	styles: [`
		:host {
			position: absolute;
			left: 0; right: 0; top: var(--planner-top-bar, 54px);
			display: block;
			pointer-events: none;
			z-index: 30;
		}
		.pl-banner {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 7px 18px;
			font-size: 0.875rem;
			line-height: 1.4;
			pointer-events: auto;
		}
		.pl-banner.problem {
			background: #2c2617;
			color: #e9dcb8;
			border-bottom: 1px solid var(--rule-strong);
			border-left: 3px solid var(--warn);
		}
		.pl-banner.error {
			background: #5a1f26;
			color: #fff;
			border-bottom: 1px solid var(--rule-strong);
		}
		.pl-banner-text {
			flex-grow: 1;
			min-width: 0;
		}
		.pl-banner-close {
			flex-shrink: 0;
			background: transparent;
			border: none;
			color: inherit;
			opacity: 0.75;
			font-size: 0.95rem;
			line-height: 1;
		}
		.pl-banner-close:hover { opacity: 1; }
		.pl-dock {
			display: flex;
			flex-direction: column;
			max-height: 44vh;
			background: var(--surface);
			border-bottom: 1px solid var(--rule-strong);
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
			pointer-events: auto;
		}
		.pl-dock:has(> .pl-fill) {
			max-height: 70vh;
		}
		.pl-dock-head {
			display: flex;
			align-items: center;
			gap: 14px;
			padding: 12px 18px 10px;
			flex: none;
		}
		.pl-title {
			margin: 0;
			font-size: 17px;
			font-weight: 700;
			color: var(--ink);
			white-space: nowrap;
		}
		.pl-help {
			margin: 0;
			color: var(--dim);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			min-width: 0;
		}
		.pl-head-end {
			margin-left: auto;
			display: flex;
			align-items: center;
			gap: 10px;
			flex: none;
		}
		.pl-plan-settings {
			display: flex;
			align-items: center;
			gap: 6px;
			height: 30px;
			padding: 0 11px;
			border: 1px solid var(--rule-strong);
			border-radius: 8px;
			background: transparent;
			color: var(--ink-2);
			font-weight: 600;
			white-space: nowrap;
		}
		.pl-plan-settings:hover {
			background: var(--surface-2);
			color: var(--ink);
		}
		.pl-close {
			width: 32px;
			height: 30px;
			display: grid;
			place-items: center;
			border: 0;
			background: none;
			border-radius: var(--ctl-radius, 6px);
			color: var(--ink-2);
			font-size: 15px;
		}
		.pl-close:hover {
			background: var(--surface-2);
			color: var(--ink);
		}
		.pl-body {
			overflow: auto;
			padding: 2px 18px 18px;
			min-height: 0;
			container-type: inline-size;
			container-name: panel;
		}
		/* The map needs a definite height for its own layout and must not add a second scrollbar. */
		.pl-body.pl-fill {
			height: calc(70vh - 62px);
			min-height: 260px;
			overflow: hidden;
			padding-bottom: 2px;
		}
		.pl-fixed {
			margin-bottom: 6px;
		}
		/* The fieldset is only there for the fixed-folder guard; it must not draw a box of its own. */
		.pl-fieldset {
			border: 0;
			padding: 0;
			margin: 0;
			min-width: 0;
		}
		/* Passes the body's height on, or the map inside gets none and stays blank. */
		.pl-fill > .pl-fieldset {
			height: 100%;
		}
		.pl-fieldset:disabled {
			opacity: 0.6;
		}
		/* The phone opens the same dock as a sheet above its bottom bar: full width, at most 66% of the height,
		   rounded at the top, and scrolling on its own. Its measured height is what zoom, fit and focus keep clear of. */
		@media (max-width: 767.98px) {
			:host {
				top: auto;
				bottom: var(--planner-bottom-bar, 56px);
			}
			.pl-drop {
				display: flex;
				flex-direction: column;
				max-height: 66vh;
			}
			.pl-banner {
				flex: none;
				padding: 6px 12px;
			}
			.pl-dock {
				flex: 0 1 auto;
				min-height: 0;
				max-height: none;
				border-top: 1px solid var(--rule-strong);
				border-bottom: none;
				border-radius: 14px 14px 0 0;
				box-shadow: 0 -10px 28px rgba(0, 0, 0, 0.45);
			}
			.pl-dock-head {
				padding: 10px 12px 8px;
				gap: 8px;
			}
			.pl-title {
				font-size: 15px;
			}
			.pl-help {
				font-size: 12px;
			}
			.pl-body {
				padding: 2px 12px 12px;
				overscroll-behavior: contain;
			}
			/* The map needs a definite height for its own layout; the sheet caps it at 66vh. */
			.pl-body.pl-fill {
				height: calc(66vh - 56px);
				min-height: 200px;
				overflow: hidden;
			}
		}
	`],
})
export class PlannerDockComponent implements AfterViewInit, OnDestroy
{

	public readonly faXmark = faXmark;
	public readonly faSliders = faSliders;

	public readonly isPlans = computed(() => this.dock.openId() === 'plans');

	public readonly fill = computed(() => this.dock.openId() === 'map');

	@ViewChild('drop') private dropRef?: ElementRef<HTMLElement>;

	private observer: ResizeObserver | null = null;

	public constructor(
		public readonly dock: PlannerDockService,
		public readonly actions: PlannerActionsService,
		private readonly planManager: PlanManager,
	)
	{
	}

	public ngAfterViewInit(): void
	{
		const drop = this.dropRef?.nativeElement;
		if (drop !== undefined && typeof ResizeObserver !== 'undefined') {
			// Firefox has fired this while a computed was mid-evaluation, where the signal write throws NG0600.
			this.observer = new ResizeObserver(() => untracked(() => this.reportHeight()));
			this.observer.observe(drop);
		}
		this.reportHeight();
	}

	public ngOnDestroy(): void
	{
		this.observer?.disconnect();
		this.dock.setHeight(0);
	}

	/** Reports the strip plus dock height so zoom, fit and focus keep clear of what is covered. */
	public reportHeight(): void
	{
		const drop = this.dropRef?.nativeElement;
		if (drop === undefined) {
			return;
		}
		this.dock.setHeight(drop.getBoundingClientRect().height);
	}

	public openPlanSettings(): void
	{
		this.dock.open('plan-settings');
	}

	/** Same as the old calculator's "Open folder" button in its fixed-settings note. */
	public openFolder(): void
	{
		const folder = this.dock.folderFixed();
		if (folder !== null) {
			this.planManager.setActiveFolder(folder.id);
		}
	}

}
