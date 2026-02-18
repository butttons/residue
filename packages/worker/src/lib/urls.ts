const urls = {
	githubRepo: "https://github.com/butttons/residue",
	author: "https://butttons.dev",
	githubCommit: ({
		org,
		repo,
		sha,
	}: {
		org: string;
		repo: string;
		sha: string;
	}) => `https://github.com/${org}/${repo}/commit/${sha}`,
};

export { urls };
