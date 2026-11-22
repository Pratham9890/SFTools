import {ChangeDetectionStrategy, Component, ElementRef, HostListener, effect, inject, untracked, viewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faXmark} from '@fortawesome/free-solid-svg-icons';
import {CoopServerSettingsComponent} from '@src/Components/Coop/CoopServerSettings/CoopServerSettingsComponent';
import {PlannerSettingsComponent} from '@src/Components/Planner/Panels/Settings/PlannerSettingsComponent';
import {SettingsSheetService} from '@src/Components/Planner/SettingsSheet/SettingsSheetService';
import {SettingsAccountComponent} from '@src/Components/Settings/SettingsAccountComponent';
import {SettingsDesktopComponent} from '@src/Components/Settings/SettingsDesktopComponent';
import {SettingsGraphComponent} from '@src/Components/Settings/SettingsGraphComponent';
import {SettingsHotkeysComponent} from '@src/Components/Settings/SettingsHotkeysComponent';
import {SettingsMapComponent} from '@src/Components/Settings/SettingsMapComponent';
import {SettingsNumbersComponent} from '@src/Components/Settings/SettingsNumbersComponent';
import {SettingsPlanDefaultsComponent} from '@src/Components/Settings/SettingsPlanDefaultsComponent';
import {SettingsPlannerComponent} from '@src/Components/Settings/SettingsPlannerComponent';
import {SettingsSupporterComponent} from '@src/Components/Settings/SettingsSupporterComponent';
import {GraphSettings} from '@src/Model/Settings/GraphSettings';
import {SettingsManager} from '@src/Model/Settings/SettingsManager';

/**
 * The one place settings live: a sheet from the right, under the top bar, opened by the gear.
 * Each section embeds the existing settings components unchanged, so nothing is lost or rewritten.
 */
@Component({
	selector: 'planner-settings-sheet',
	templateUrl: './PlannerSettingsSheetComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [
		FormsModule,
		FaIconComponent,
		PlannerSettingsComponent,
		SettingsGraphComponent,
		SettingsPlannerComponent,
		SettingsNumbersComponent,
		SettingsPlanDefaultsComponent,
		SettingsMapComponent,
		CoopServerSettingsComponent,
		SettingsHotkeysComponent,
		SettingsDesktopComponent,
		SettingsAccountComponent,
		SettingsSupporterComponent,
	],
	host: {
		role: 'region',
		'aria-label': 'Settings',
	},
	styles: [`
		:host {
			position: fixed;
			right: 0;
			top: var(--planner-top-bar, 54px);
			bottom: 0;
			width: 440px;
			display: flex;
			flex-direction: column;
			background: var(--surface);
			border-left: 1px solid var(--rule);
			box-shadow: -12px 0 32px rgba(0, 0, 0, 0.35);
			color: var(--ink);
			z-index: 35;
		}
		.pl-sheet-head {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 14px 18px 12px;
			border-bottom: 1px solid var(--rule);
			flex: none;
		}
		.pl-sheet-title {
			margin: 0;
			font-size: 17px;
			font-weight: 700;
			color: var(--ink);
		}
		.pl-sheet-close {
			margin-left: auto;
			width: 32px;
			height: 30px;
			display: grid;
			place-items: center;
			border: none;
			border-radius: 8px;
			background: transparent;
			color: var(--ink-2);
			font-size: 15px;
		}
		.pl-sheet-close:hover {
			background: var(--surface-2);
			color: var(--ink);
		}
		.pl-sheet-body {
			position: relative;
			overflow: auto;
			min-height: 0;
			padding: 14px 18px 24px;
			display: grid;
			gap: 18px;
			align-content: start;
			container-type: inline-size;
			overscroll-behavior: contain;
		}
		.pl-sheet-section {
			display: grid;
			gap: 10px;
			align-content: start;
		}
		// Subheadings inside a section: smaller than the section's own .pp-title, so the three groups read
		// as parts of Flow chart rather than as more sections.
		.pl-subtitle {
			font-size: 12px;
			font-weight: 700;
			letter-spacing: .06em;
			text-transform: uppercase;
			color: var(--dim);
			margin: 4px 0 0;
		}
		// The embedded settings components bring their own cards; in the sheet they sit flush and short.
		.pl-sheet-section collapsible-card {
			display: block;
		}
		.pl-sheet-section + .pl-sheet-section {
			border-top: 1px solid var(--rule);
			padding-top: 16px;
		}
		.pl-choice-row {
			display: inline-flex;
			gap: 6px;
			width: max-content;
			padding: 3px;
			background: var(--ground);
			border: 1px solid var(--rule-strong);
			border-radius: 10px;
		}
		.pl-choice {
			border: none;
			border-radius: 8px;
			padding: 6px 14px;
			background: transparent;
			color: var(--ink-2);
			font-weight: 600;
		}
		.pl-choice:hover {
			color: var(--ink);
		}
		.pl-choice.selected {
			background: var(--accent);
			color: var(--accent-ink);
		}
		.pl-title-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
		}
		@media (max-width: 767.98px) {
			:host {
				width: 100%;
				border-left: none;
				// The phone keeps a fixed 56 px bottom tab bar; the sheet's last control must not sit under it.
				bottom: var(--planner-bottom-bar, 56px);
			}
			.pl-sheet-body {
				padding: 12px 12px 20px;
			}
		}
	`],
})
export class PlannerSettingsSheetComponent
{

	public readonly faXmark = faXmark;

	public readonly sheet = inject(SettingsSheetService);

	private readonly settings = inject(SettingsManager);

	private readonly bodyRef = viewChild<ElementRef<HTMLElement>>('sheetBody');

	public constructor()
	{
		// Re-runs when the sheet is asked for a section again, even the one already shown.
		effect(() => {
			this.sheet.request();
			const section = this.sheet.section();
			untracked(() => this.scrollToSection(section));
		});
		effect(() => {
			const body = this.bodyRef()?.nativeElement;
			if (body !== undefined) {
				untracked(() => this.scrollToSection(this.sheet.section()));
			}
		});
	}

	public get graph(): GraphSettings
	{
		return this.settings.graph();
	}

	public setLook(look: GraphSettings['look']): void
	{
		this.settings.updateGraph({look});
	}

	public setLayoutMode(layoutMode: GraphSettings['layoutMode']): void
	{
		this.settings.updateGraph({layoutMode});
	}

	public setColourLinesByItem(colourLinesByItem: boolean): void
	{
		this.settings.updateGraph({colourLinesByItem});
	}

	@HostListener('document:keydown.escape')
	public onEscape(): void
	{
		this.sheet.close();
	}

	private scrollToSection(name: string | null): void
	{
		const body = this.bodyRef()?.nativeElement;
		if (body === undefined) {
			return;
		}
		if (name === null) {
			body.scrollTop = 0;
			return;
		}
		const target = body.querySelector<HTMLElement>(`[data-settings-section="${name}"]`);
		if (target !== null) {
			body.scrollTop = Math.max(0, target.offsetTop - 6);
		}
	}

}
