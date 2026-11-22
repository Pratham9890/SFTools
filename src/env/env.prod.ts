export const env = {
	production: true,
	webUrl: 'https://www.satisfactorytools.com',
	apiUrl: 'https://api.new.satisfactorytools.com',
	desktopAppPublic: false,
	// Analytics off in this fork: the original Matomo instance belongs to the upstream project.
	// Co-op spaces (Supabase). Empty here: each user enters their own server in Settings.
	// A deployment may still set a default at build time.
	coop: {
		url: '',
		key: '',
		// Where invite links from the desktop app point.
		siteUrl: 'https://pratham9890.github.io/SFTools',
	},
	matomo: {
		url: '',
		siteId: null as number | null,
		platformDimensionId: null as number | null,
	},
};
