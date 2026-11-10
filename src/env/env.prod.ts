export const env = {
	production: true,
	webUrl: 'https://www.satisfactorytools.com',
	apiUrl: 'https://api.new.satisfactorytools.com',
	desktopAppPublic: false,
	// Analytics off in this fork: the original Matomo instance belongs to the upstream project.
	// Co-op spaces (Supabase). The publishable key is public by design: the database functions check each space's invite secret.
	coop: {
		url: 'https://rkhxvrqqvtczjuragoqq.supabase.co',
		key: 'sb_publishable_G6URYGxNd_kIS7yiOLEaaA_JLXmnjrC',
		// Where invite links from the desktop app point.
		siteUrl: 'https://pratham9890.github.io/SFTools',
	},
	matomo: {
		url: '',
		siteId: null as number | null,
		platformDimensionId: null as number | null,
	},
};
