type UpsertSessionParams = {
	id: string;
	agent: string;
	agentVersion: string;
	status: string;
	r2Key: string;
	dataPath?: string | null;
	firstMessage?: string | null;
	sessionName?: string | null;
	firstMessageAt?: number | null;
	lastMessageAt?: number | null;
};

type InsertCommitParams = {
	commitSha: string;
	repo: string;
	org: string;
	sessionId: string;
	message: string;
	author: string;
	committedAt: number;
	branch: string | null;
};

type SessionRow = {
	id: string;
	agent: string;
	agent_version: string | null;
	created_at: number;
	ended_at: number | null;
	r2_key: string;
	data_path: string | null;
	first_message: string | null;
	session_name: string | null;
	first_message_at: number | null;
	last_message_at: number | null;
};

type CommitRow = {
	commit_sha: string;
	repo: string;
	org: string;
	session_id: string;
	message: string | null;
	author: string | null;
	committed_at: number | null;
	created_at: number;
	branch: string | null;
};

type CommitFileRow = {
	commit_sha: string;
	file_path: string;
	change_type: string;
	lines_added: number;
	lines_deleted: number;
};

type OrgListItem = {
	org: string;
	repo_count: number;
	last_activity: number | null;
};

type RepoListItem = {
	repo: string;
	session_count: number;
	commit_count: number;
	last_activity: number | null;
};

type SessionCommitRow = {
	commit_sha: string;
	committed_at: number | null;
	org: string;
	repo: string;
	branch: string | null;
};

type CommitWithSessionRow = {
	commit_sha: string;
	message: string | null;
	author: string | null;
	committed_at: number | null;
	session_id: string;
	agent: string;
	branch: string | null;
};

type CommitShaDetailRow = {
	commit_sha: string;
	message: string | null;
	author: string | null;
	committed_at: number | null;
	session_id: string;
	agent: string;
	agent_version: string | null;
	session_created_at: number;
	session_ended_at: number | null;
	branch: string | null;
};

type UserRow = {
	id: string;
	username: string;
	password_hash: string;
	created_at: number;
};

type DailySessionCount = {
	date: string;
	count: number;
};

type DailyActivityCount = {
	date: string;
	sessionCount: number;
	commitCount: number;
};

type QuerySessionsFilter = {
	agent?: string;
	repo?: string;
	branch?: string;
	since?: number;
	until?: number;
	limit?: number;
	offset?: number;
};

type QuerySessionResult = {
	id: string;
	agent: string;
	agent_version: string | null;
	created_at: number;
	ended_at: number | null;
	data_path: string | null;
	first_message: string | null;
	session_name: string | null;
};

type QueryCommitsFilter = {
	repo?: string;
	branch?: string;
	author?: string;
	since?: number;
	until?: number;
	limit?: number;
	offset?: number;
};

type QueryCommitResult = {
	commit_sha: string;
	message: string | null;
	author: string | null;
	committed_at: number | null;
	branch: string | null;
	org: string;
	repo: string;
	session_id: string;
};

type SessionDetailResult = {
	session: QuerySessionResult;
	commits: {
		commit_sha: string;
		message: string | null;
		author: string | null;
		committed_at: number | null;
		branch: string | null;
		org: string;
		repo: string;
	}[];
};

type CommitDetailResult = {
	commit_sha: string;
	message: string | null;
	author: string | null;
	committed_at: number | null;
	branch: string | null;
	org: string;
	repo: string;
	sessions: QuerySessionResult[];
	files: CommitFileRow[];
};

type GlobalStats = {
	totalSessions: number;
	totalCommits: number;
	totalRepos: number;
	totalFilesChanged: number;
	totalLinesAdded: number;
	totalLinesDeleted: number;
};

type AgentBreakdown = {
	agent: string;
	sessionCount: number;
};

type RecentCommitRow = {
	commit_sha: string;
	message: string | null;
	author: string | null;
	committed_at: number | null;
	branch: string | null;
	org: string;
	repo: string;
	session_id: string;
	agent: string;
};

type ContributorRow = {
	author: string;
	commitCount: number;
	sessionCount: number;
	lastActive: number | null;
};

type ContributorScope =
	| { scope: "global" }
	| { scope: "org"; org: string }
	| { scope: "repo"; org: string; repo: string };

type TimeStats = {
	avgDurationMinutes: number;
	medianDurationMinutes: number;
	longestDurationMinutes: number;
	totalHours: number;
	totalSessions: number;
};

type HourDistribution = {
	hour: number;
	sessionCount: number;
};

type DayOfWeekDistribution = {
	dayOfWeek: number;
	sessionCount: number;
};

export type {
	UpsertSessionParams,
	InsertCommitParams,
	SessionRow,
	CommitRow,
	CommitFileRow,
	CommitWithSessionRow,
	CommitShaDetailRow,
	OrgListItem,
	RepoListItem,
	SessionCommitRow,
	DailySessionCount,
	DailyActivityCount,
	UserRow,
	QuerySessionsFilter,
	QuerySessionResult,
	QueryCommitsFilter,
	QueryCommitResult,
	SessionDetailResult,
	CommitDetailResult,
	GlobalStats,
	AgentBreakdown,
	RecentCommitRow,
	ContributorRow,
	ContributorScope,
	TimeStats,
	HourDistribution,
	DayOfWeekDistribution,
};
