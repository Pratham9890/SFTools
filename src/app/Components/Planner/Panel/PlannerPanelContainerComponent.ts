import {AfterViewInit, Component, OnDestroy, ElementRef, HostListener, ViewChild, computed, signal, untracked, ChangeDetectionStrategy} from '@angular/core';
import {NgComponentOutlet} from '@angular/common';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faBars, faChevronLeft, faChevronRight, faShareNodes, faXmark} from '@fortawesome/free-solid-svg-icons';
import {MOBILE_NAV_HEIGHT, PanelLayoutService, STATUS_BAR_HEIGHT} from '@src/Components/Planner/Panel/PanelLayoutService';
import {ShareDialogService} from '@src/Components/Planner/Share/ShareDialogService';
import {AppFeatures} from '@src/Model/AppFeatures';
import {PanelDefinition} from '@src/Components/Planner/Panel/PanelDefinition';
import {PlannerCanvasHintComponent} from '@src/Components/Planner/CanvasHint/PlannerCanvasHintComponent';
import {PlannerStatusBarComponent} from '@src/Components/Planner/StatusBar/PlannerStatusBarComponent';
import {PlannerZoomControlsComponent} from '@src/Components/Planner/ZoomControls/PlannerZoomControlsComponent';

const STATUS = STATUS_BAR_HEIGHT;
const MOBILE_NAV = MOBILE_NAV_HEIGHT;
const MOBILE_HEAD = 44;
const MOBILE_BREAKPOINT = 768;

/**
 * The phone shell (bottom bar, drawer, sheet) and, on the desktop, only the chart's overlays: the status bar,
 * the canvas hint and the zoom controls. Panels on the desktop live in the top bar and its dock.
 */
@Component({
	selector: 'planner-panel-container',
	templateUrl: './PlannerPanelContainerComponent.html',
	imports: [
		FaIconComponent,
		NgComponentOutlet,
		PlannerCanvasHintComponent,
		PlannerStatusBarComponent,
		PlannerZoomControlsComponent,
	],
	host: {style: 'position: absolute; inset: 0; pointer-events: none;'},
	changeDetection: ChangeDetectionStrategy.Eager,
	styles: [`
		.mob-nav-wrap {
			position: absolute;
			left: 0; right: 0; bottom: 0;
			height: ${MOBILE_NAV}px;
			background: #1b2834;
			border-top: 1px solid #34475a;
			pointer-events: auto;
			z-index: 12;
		}
		.mob-nav {
			height: 100%;
			display: flex;
			align-items: stretch;
			overflow-x: auto;
			overflow-y: hidden;
			scrollbar-width: none;
		}
		.mob-nav::-webkit-scrollbar { display: none; }
		.mob-nav-fade {
			position: absolute;
			top: 0; bottom: 0;
			width: 36px;
			display: flex;
			align-items: center;
			color: #9fb0c0;
			font-size: 0.8rem;
			pointer-events: none;
		}
		.mob-nav-fade.left {
			left: 0;
			justify-content: flex-start;
			padding-left: 4px;
			background: linear-gradient(to right, #1b2834 35%, rgba(16,20,29,0));
		}
		.mob-nav-fade.right {
			right: 0;
			justify-content: flex-end;
			padding-right: 4px;
			background: linear-gradient(to left, #1b2834 35%, rgba(16,20,29,0));
		}
		.mob-tab {
			flex: none;
			min-width: 72px;
			padding: 0 10px;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 3px;
			border: none;
			background: transparent;
			color: #9fb0c0;
			font-size: 0.7rem;
			white-space: nowrap;
			cursor: pointer;
		}
		.mob-tab fa-icon { font-size: 1.05rem; }
		.mob-tab.active { color: #fff; box-shadow: inset 0 2px 0 rgba(var(--bs-primary-rgb), 0.7); }
		.mob-menu-btn {
			position: absolute;
			top: 10px; left: 10px;
			width: 36px; height: 36px;
			border: 1px solid #34475a;
			background: #1b2834;
			color: #d5dde6;
			font-size: 16px;
			cursor: pointer;
			pointer-events: auto;
			z-index: 11;
		}
		.mob-share-btn {
			position: absolute;
			top: 10px; right: 10px;
			width: 36px; height: 36px;
			border: 1px solid #34475a;
			background: #1b2834;
			color: #d5dde6;
			font-size: 16px;
			cursor: pointer;
			pointer-events: auto;
			z-index: 11;
		}
		.mob-zoom {
			position: absolute;
			left: 12px;
			bottom: ${MOBILE_NAV + 12}px;
			pointer-events: auto;
			z-index: 7;
		}
		.mob-head {
			position: absolute;
			left: 0; right: 0; top: 0;
			height: ${MOBILE_HEAD}px;
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 0 8px;
			background: #1b2834;
			border-bottom: 1px solid #34475a;
			color: #d5dde6;
			font-weight: 600;
			pointer-events: auto;
			z-index: 10;
		}
		.mob-head-btn {
			width: 32px; height: 32px;
			border: 1px solid #34475a;
			background: transparent;
			color: #d5dde6;
			cursor: pointer;
		}
		.mob-head-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.mob-view {
			position: absolute;
			left: 0; right: 0; top: ${MOBILE_HEAD}px; bottom: ${MOBILE_NAV}px;
			background: #213040;
			overflow-y: auto;
			overflow-x: hidden;
			container-type: inline-size;
			container-name: panel;
			pointer-events: auto;
			z-index: 9;
		}
		.mob-scrim {
			position: absolute;
			inset: 0;
			background: rgba(0,0,0,0.55);
			pointer-events: auto;
			z-index: 14;
		}
		.mob-drawer {
			position: absolute;
			left: 0; top: 0; bottom: 0;
			width: 78%;
			max-width: 320px;
			background: #213040;
			border-right: 1px solid #34475a;
			overflow-y: auto;
			overflow-x: hidden;
			container-type: inline-size;
			container-name: panel;
			pointer-events: auto;
			z-index: 15;
		}
	`],
})
export class PlannerPanelContainerComponent implements AfterViewInit, OnDestroy
{

	public readonly faBars = faBars;
	public readonly faShareNodes = faShareNodes;
	public readonly faXmark = faXmark;
	public readonly faChevronLeft = faChevronLeft;
	public readonly faChevronRight = faChevronRight;

	/** Share links are hidden in this fork: co-op spaces replace them. */
	protected readonly features = AppFeatures;

	private readonly navCanScrollLeftSignal = signal(false);
	public readonly navCanScrollLeft = this.navCanScrollLeftSignal.asReadonly();
	private readonly navCanScrollRightSignal = signal(false);
	public readonly navCanScrollRight = this.navCanScrollRightSignal.asReadonly();
	private navResizeObserver: ResizeObserver | null = null;

	/** The bottom bar exists only in the mobile layout - the observer follows it. */
	@ViewChild('mobNav')
	private set mobNav(element: ElementRef<HTMLElement> | undefined)
	{
		this.navResizeObserver?.disconnect();
		this.navResizeObserver = null;
		this.navElement = element?.nativeElement ?? null;
		if (this.navElement && typeof ResizeObserver !== 'undefined') {
			// Firefox has fired this while a computed was mid-evaluation, where the signal write throws NG0600.
			this.navResizeObserver = new ResizeObserver(() => untracked(() => this.updateNavScroll()));
			this.navResizeObserver.observe(this.navElement);
		}
		this.updateNavScroll();
	}

	private navElement: HTMLElement | null = null;

	private readonly isMobileSignal = signal(false);
	public readonly isMobile = this.isMobileSignal.asReadonly();

	private readonly drawerOpenSignal = signal(false);
	public readonly drawerOpen = this.drawerOpenSignal.asReadonly();

	public readonly mobilePanels = computed<PanelDefinition[]>(() =>
		this.layout.registered().filter(panel => panel.id !== 'plans'));

	private viewReady = false;

	public constructor(
		public readonly layout: PanelLayoutService,
		public readonly shareDialog: ShareDialogService,
		private readonly elementRef: ElementRef<HTMLElement>,
	)
	{
	}

	public ngAfterViewInit(): void
	{
		this.viewReady = true;
		this.measureAndUpdate();
	}

	public ngOnDestroy(): void
	{
		this.navResizeObserver?.disconnect();
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
		this.isMobileSignal.set(mobile);
		this.layout.setMobile(mobile);
		if (!mobile) {
			// The desktop has no side panels any more, so the whole content box is available to floating windows and drag targets.
			const rect = el.getBoundingClientRect();
			this.layout.updateAvailableSpace(el.clientWidth, el.clientHeight - STATUS, rect.left, rect.top);
		}
	}

	public openDrawer(): void
	{
		this.drawerOpenSignal.set(true);
	}

	public closeDrawer(): void
	{
		this.drawerOpenSignal.set(false);
	}

	public toggleMobilePanel(id: string): void
	{
		this.layout.setMobilePanel(this.layout.mobileActivePanel()?.id === id ? null : id);
	}

	public updateNavScroll(): void
	{
		const nav = this.navElement;
		if (!nav) {
			this.navCanScrollLeftSignal.set(false);
			this.navCanScrollRightSignal.set(false);
			return;
		}
		this.navCanScrollLeftSignal.set(nav.scrollLeft > 2);
		this.navCanScrollRightSignal.set(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
	}

	public onDrawerClick(event: MouseEvent): void
	{
		const target = event.target instanceof Element ? event.target : null;
		if (target?.closest('.tree-row[role="button"]') && !target.closest('button, input, .tree-menu')) {
			this.closeDrawer();
		}
	}

	public get statusBarStyle(): string
	{
		return `position:absolute;left:0;right:0;bottom:0;height:${STATUS}px;pointer-events:auto;z-index:8;`;
	}

	public get canvasHintStyle(): string
	{
		// Centres the hint in the part of the chart the top bar, the dock and the status bar leave visible.
		const top = this.isMobile() ? '0px' : `calc(var(--planner-top-bar, 54px) + ${this.layout.overlayTop()}px)`;
		return `position:absolute;left:0;right:0;top:${top};bottom:${STATUS}px;pointer-events:none;z-index:6;`;
	}

	public get zoomStyle(): string
	{
		return `position:absolute;left:12px;bottom:${STATUS + 12}px;pointer-events:auto;z-index:7;`;
	}

}
