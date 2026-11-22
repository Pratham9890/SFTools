import {Injectable, Signal, WritableSignal, computed, signal} from '@angular/core';
import {env} from '@env/env';
import {AppStorage} from '@src/Model/Storage/AppStorage';

const STORAGE_KEY = 'sftools.coopServer';

interface CoopServer
{
	readonly url: string;
	readonly key: string;
}

/** Where the co-op feature talks to: a Supabase project the user hosts. Falls back to the build-time default. */
@Injectable({providedIn: 'root'})
export class CoopServerConfig
{

	private readonly serverSignal: WritableSignal<CoopServer>;

	public readonly url: Signal<string>;
	public readonly key: Signal<string>;
	public readonly configured: Signal<boolean>;

	public constructor(private readonly storage: AppStorage)
	{
		this.serverSignal = signal(this.load());
		this.url = computed(() => this.serverSignal().url);
		this.key = computed(() => this.serverSignal().key);
		this.configured = computed(() => this.url() !== '' && this.key() !== '');
	}

	/** Resolves to an error message to show, or null when saved. */
	public save(url: string, key: string): string | null
	{
		const address = CoopServerConfig.normalize(url);
		const publicKey = key.trim();
		const error = CoopServerConfig.validate(address, publicKey);
		if (error !== null) {
			return error;
		}
		this.serverSignal.set({url: address, key: publicKey});
		try {
			this.storage.setItem(STORAGE_KEY, JSON.stringify({url: address, key: publicKey}));
		} catch {
			// Blocked site data: the server stays usable for this page load but is not kept.
		}
		return null;
	}

	public clear(): void
	{
		this.serverSignal.set(CoopServerConfig.fallback());
		try {
			this.storage.removeItem(STORAGE_KEY);
		} catch {
			// Blocked site data: there is nothing saved to remove either.
		}
	}

	private load(): CoopServer
	{
		const fallback = CoopServerConfig.fallback();
		try {
			const raw = this.storage.getItem(STORAGE_KEY);
			if (raw === null) {
				return fallback;
			}
			const stored = JSON.parse(raw) as Partial<CoopServer>;
			const url = CoopServerConfig.normalize(stored.url ?? '');
			const key = (stored.key ?? '').trim();
			return CoopServerConfig.validate(url, key) === null ? {url, key} : fallback;
		} catch {
			// Unreadable or blocked storage: the build-time default still works.
			return fallback;
		}
	}

	private static fallback(): CoopServer
	{
		return {url: CoopServerConfig.normalize(env.coop?.url ?? ''), key: (env.coop?.key ?? '').trim()};
	}

	private static normalize(url: string): string
	{
		return url.trim().replace(/\/+$/, '');
	}

	private static validate(url: string, key: string): string | null
	{
		if (url === '') {
			return 'Enter the server address.';
		}
		try {
			const parsed = new URL(url);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				return 'The server address must start with http:// or https://.';
			}
		} catch {
			return 'That is not a valid server address.';
		}
		if (key === '') {
			return 'Enter the public key.';
		}
		return null;
	}

}
