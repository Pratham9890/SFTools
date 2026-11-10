/** Upstream features this fork hides: it uses co-op spaces instead of accounts and share links. Turning one back on restores that UI. */
export const AppFeatures = {
	accounts: false,
	shareLinks: false,
} as const;
