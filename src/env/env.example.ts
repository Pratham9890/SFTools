export const env = {
	production: true,
	webUrl: 'https://www.satisfactorytools.com',
	apiUrl: 'https://api.new.satisfactorytools.com',
	desktopAppPublic: false,
	// Co-op spaces (Supabase). Empty here: each user enters their own server in Settings.
	// A deployment may still set a default at build time. The publishable key is public by design.
	coop: {
		url: '',
		key: '',
		// Where invite links from the desktop app point.
		siteUrl: 'https://pratham9890.github.io/SFTools',
	},
	matomo: {
		url: null,
		siteId: null,
		platformDimensionId: null,
	},
};
