import {AfterViewInit, Component, ElementRef, HostListener, ChangeDetectionStrategy} from '@angular/core';
import {PanelLayoutService, MOBILE_NAV_HEIGHT, STATUS_BAR_HEIGHT} from '@src/Components/Planner/Panel/PanelLayoutService';
import {PlannerCanvasHintComponent} from '@src/Components/Planner/CanvasHint/PlannerCanvasHintComponent';
import {PlannerStatusBarComponent} from '@src/Components/Planner/StatusBar/PlannerStatusBarComponent';
import {PlannerZoomControlsComponent} from '@src/Components/Planner/ZoomControls/PlannerZoomControlsComponent';

const STATUS = STATUS_BAR_HEIGHT;
const MOBILE_BREAKPOINT = 768;

/**
 * The chart's floating overlays: the status bar, the canvas hint and the zoom controls. Panels live in the top bar
 * and its dock on both the PC and the phone; the phone's dock opens as a bottom sheet above its bottom bar.
 */
@Component({
	selector: 'planner-panel-container',
	templateUrl: './PlannerPanelContainerComponent.html',
	imports: [
		PlannerCanvasHintComponent,
		PlannerStatusBarComponent,
		PlannerZoomControlsComponent,
	],
	host: {style: 'position: absolute; inset: 0; pointer-events: none;'},
	changeDetection: ChangeDetectionStrategy.Eager,
})
export class PlannerPanelContainerComponent implements AfterViewInit
{

	private viewReady = false;

	public constructor(
		public readonly layout: PanelLayoutService,
		private readonly elementRef: ElementRef<HTMLElement>,
	)
	{
	}

	public ngAfterViewInit(): void
	{
		this.viewReady = true;
		this.measureAndUpdate();
	}

	@HostListener('window:resize')
	public onWindowResize(): void
	{
		this.measureAndUpdate();
	}

	private measureAndUpdate(): void
	{
		if (!this.viewReady) {
			return;
		}
		const el = this.elementRef.nativeElement;
		const mobile = el.clientWidth < MOBILE_BREAKPOINT;
		this.layout.setMobile(mobile);
		// Nothing is docked to a side any more, so the whole content box is available to floating windows and drag targets,
		// minus the strip the bottom bar or the status bar covers.
		const rect = el.getBoundingClientRect();
		this.layout.updateAvailableSpace(el.clientWidth, el.clientHeight - (mobile ? MOBILE_NAV_HEIGHT : STATUS), rect.left, rect.top);
	}

	public get statusBarStyle(): string
	{
		return `position:absolute;left:0;right:0;bottom:0;height:${STATUS}px;pointer-events:auto;z-index:8;`;
	}

	public get canvasHintStyle(): string
	{
		// Centres the hint in the part of the chart the top bar, the dock and the bottom bar leave visible.
		// On the phone the top bar is still at the top, so both layouts start below it.
		return `position:absolute;left:0;right:0;top:calc(var(--planner-top-bar, 54px) + ${this.layout.overlayTop()}px);bottom:${this.layout.bottomInset()}px;pointer-events:none;z-index:6;`;
	}

	public get zoomStyle(): string
	{
		// On the phone the controls sit just above the 56 px bottom bar; an open sheet covers them, as it covers the chart.
		const bottom = this.layout.isMobile() ? MOBILE_NAV_HEIGHT + 12 : STATUS + 12;
		return `position:absolute;left:12px;bottom:${bottom}px;pointer-events:auto;z-index:7;`;
	}

}
