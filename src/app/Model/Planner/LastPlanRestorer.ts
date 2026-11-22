import {Injectable, OnDestroy} from '@angular/core';
import {toObservable} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router} from '@angular/router';
import {Subscription, combineLatest} from 'rxjs';
import {VersionManager} from '@src/Model/Data/VersionManager';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {PlannerLocationService} from '@src/Model/Planner/PlannerLocationService';

/**
 * Reopens the plan this device used last when the planner is entered without a plan or share in the URL.
 * Also keeps that memory current: the URL is often left bare by a reload, so recording only from the URL loses it.
 */
@Injectable()
export class LastPlanRestorer implements OnDestroy
{

	private readonly subscription = new Subscription();
	private started = false;

	/** Set once a plan is open, the URL named one, or the remembered plan turned out to be for another version. */
	private done = false;

	public constructor(
		private readonly planManager: PlanManager,
		private readonly plannerLocation: PlannerLocationService,
		private readonly versionManager: VersionManager,
		private readonly router: Router,
		private readonly route: ActivatedRoute,
	)
	{
	}

	public start(): void
	{
		if (this.started) {
			return;
		}
		this.started = true;

		this.subscription.add(
			toObservable(this.planManager.activePlanId).subscribe(id => {
				// A shared plan only exists while its share link is open, and a link to someone else's plan is not in the list.
				if (id === null || this.planManager.isSharedPlan(id) || this.planManager.findPlan(id) === null) {
					return;
				}
				const version = this.versionManager.activeVersion();
				if (version === null) {
					return;
				}
				this.plannerLocation.remember(this.versionManager.urlSlug(version), id);
			}),
		);

		const params = this.route.snapshot.paramMap;
		if (params.get('planId') !== null || params.get('shareId') !== null) {
			this.done = true;
			return;
		}

		// Plans arrive asynchronously (local storage, an account, or a co-op space), so keep looking as the lists grow.
		this.subscription.add(
			combineLatest([
				toObservable(this.planManager.activePlanId),
				toObservable(this.planManager.plans),
				toObservable(this.planManager.sharedPlans),
				toObservable(this.planManager.localPlans),
				toObservable(this.planManager.loadedForActiveVersion),
			]).subscribe(() => this.restore()),
		);
	}

	private restore(): void
	{
		if (this.done) {
			return;
		}
		// Never override a plan the user opened or created while the lists were still loading.
		if (this.planManager.activePlanId() !== null) {
			this.done = true;
			return;
		}
		if (!this.planManager.loadedForActiveVersion()) {
			return;
		}
		const location = this.plannerLocation.location();
		const version = this.versionManager.activeVersion();
		if (location === null || location.planId === null || version === null) {
			this.done = true;
			return;
		}
		const slug = this.versionManager.urlSlug(version);
		if (location.versionSlug !== slug) {
			this.done = true;
			return;
		}
		// A deleted plan stays gone: keep waiting is harmless, but there is nothing to reopen.
		const plan = this.planManager.findPlan(location.planId);
		if (plan === null) {
			return;
		}
		this.done = true;
		const planId = plan.id;
		// A shared plan only exists while its share link is open; there is no page of its own to reopen.
		if (this.planManager.isSharedPlan(planId)) {
			return;
		}
		// A device plan never enters the URL (the planner's own URL sync skips it), so it is selected directly.
		if (this.planManager.isLocalPlan(planId)) {
			this.planManager.setActivePlan(planId);
			return;
		}
		// The rest of the planner applies a plan named in the URL, so this is the same path a plan link takes.
		void this.router.navigate(
			['/', slug, 'planner', planId],
			{replaceUrl: true, queryParamsHandling: 'preserve'},
		);
	}

	public ngOnDestroy(): void
	{
		this.subscription.unsubscribe();
	}

}
