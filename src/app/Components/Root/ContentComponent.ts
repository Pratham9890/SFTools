import {Component, ChangeDetectionStrategy, computed} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faXmark} from '@fortawesome/free-solid-svg-icons';
import {SignInPromptDialogComponent} from '@src/Components/Auth/SignInPromptDialogComponent';
import {SupporterWelcomeDialogComponent} from '@src/Components/Supporters/SupporterWelcomeDialogComponent';
import {NavbarComponent} from '@src/Components/Root/NavbarComponent';
import {SettingsConflictDialogComponent} from '@src/Components/Settings/SettingsConflictDialogComponent';
import {AppFeatures} from '@src/Model/AppFeatures';
import {ServerStatusService} from '@src/Model/API/ServerStatusService';
import {HelpManager} from '@src/Model/Help/HelpManager';
import {NotificationService} from '@src/Model/NotificationService';
import {SiteChrome} from '@src/Model/SiteChrome';

/** The planner's own top bar takes the site bar's place; notices drop below it instead of below the navbar. */
const PLANNER_TOP_BAR = 54;

@Component({
	templateUrl: './ContentComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [
		FaIconComponent,
		RouterOutlet,
		NavbarComponent,
		SettingsConflictDialogComponent,
		SignInPromptDialogComponent,
		SupporterWelcomeDialogComponent,
	],
})
export class ContentComponent
{

	public readonly faXmark = faXmark;

	/** No "sign in to do X" prompt without accounts: this fork uses co-op spaces instead. */
	protected readonly features = AppFeatures;

	public readonly notificationTop = computed<string>(() =>
		this.siteChrome.fullScreen()
			? `${PLANNER_TOP_BAR + (this.serverStatus.retrying() ? 52 : 4)}px`
			: `calc(var(--navbar-height, 56px) + ${this.serverStatus.retrying() ? '52px' : '4px'})`);

	public constructor(
		public readonly notifications: NotificationService,
		public readonly serverStatus: ServerStatusService,
		public readonly siteChrome: SiteChrome,
		// Injected for its side effect: the help index loads once here, so search and the question-mark buttons can read it synchronously.
		help: HelpManager,
	)
	{
	}

}