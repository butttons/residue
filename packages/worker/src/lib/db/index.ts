import { CommitDataLayer } from "./commits";
import { OrgDataLayer } from "./orgs";
import { SessionDataLayer } from "./sessions";
import { SettingsDataLayer } from "./settings";
import { StatsDataLayer } from "./stats";
import { UserDataLayer } from "./users";

const createDL = ({ db }: { db: D1Database }) => {
	const sessions = new SessionDataLayer({ db });
	const commits = new CommitDataLayer({ db });
	const orgs = new OrgDataLayer({ db });
	const stats = new StatsDataLayer({ db });
	const users = new UserDataLayer({ db });
	const settings = new SettingsDataLayer({ db });

	return { sessions, commits, orgs, stats, users, settings };
};

type DataLayer = ReturnType<typeof createDL>;

export { createDL };
export type { DataLayer };

export type { ErrorCode } from "./_error";
export { DBError, isDBError } from "./_error";
export type { Err, Ok, Result } from "./_result";
// Re-export result/error utilities
export { err, fromPromise, ok } from "./_result";
// Re-export types
export type {
	AgentBreakdown,
	CommitDetailResult,
	CommitFileRow,
	CommitRow,
	CommitShaDetailRow,
	CommitWithSessionRow,
	ContributorRow,
	ContributorScope,
	DailyActivityCount,
	DailySessionCount,
	GlobalStats,
	InsertCommitParams,
	OrgListItem,
	QueryCommitResult,
	QueryCommitsFilter,
	QuerySessionResult,
	QuerySessionsFilter,
	RecentCommitRow,
	RepoListItem,
	SessionCommitRow,
	SessionDetailResult,
	SessionRow,
	UpsertSessionParams,
	UserRow,
} from "./_types";
