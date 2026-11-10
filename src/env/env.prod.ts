export const env = {
	production: true,
	webUrl: 'https://www.satisfactorytools.com',
	apiUrl: 'https://api.new.satisfactorytools.com',
	desktopAppPublic: false,
	// Analytics off in this fork: the original Matomo instance belongs to the upstream project.
	matomo: {
		url: '',
		siteId: null as number | null,
		platformDimensionId: null as number | null,
	},
};
