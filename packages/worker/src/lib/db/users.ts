import { BaseDataLayer } from "./_base";
import type { DBError } from "./_error";
import type { Result } from "./_result";
import type { UserRow } from "./_types";

class UserDataLayer extends BaseDataLayer {
	create(params: {
		id: string;
		username: string;
		passwordHash: string;
	}): Promise<Result<void, DBError>> {
		const now = Math.floor(Date.now() / 1000);

		return this.run({
			promise: this.db
				.prepare(
					"INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
				)
				.bind(params.id, params.username, params.passwordHash, now)
				.run()
				.then(() => undefined),
			source: "dl.users.create",
			code: "CREATE_FAILED",
		});
	}

	getByUsername(username: string): Promise<Result<UserRow | null, DBError>> {
		return this.run({
			promise: this.db
				.prepare("SELECT * FROM users WHERE username = ?")
				.bind(username)
				.first<UserRow>(),
			source: "dl.users.getByUsername",
			code: "GET_FAILED",
		});
	}

	list(): Promise<Result<UserRow[], DBError>> {
		return this.run({
			promise: this.db
				.prepare(
					"SELECT id, username, created_at FROM users ORDER BY created_at ASC",
				)
				.all<UserRow>()
				.then((r) => r.results),
			source: "dl.users.list",
			code: "GET_FAILED",
		});
	}

	delete(id: string): Promise<Result<boolean, DBError>> {
		return this.run({
			promise: this.db
				.prepare("DELETE FROM users WHERE id = ?")
				.bind(id)
				.run()
				.then((result) => (result.meta?.changes ?? 0) > 0),
			source: "dl.users.delete",
			code: "DELETE_FAILED",
		});
	}

	getCount(): Promise<Result<number, DBError>> {
		return this.run({
			promise: this.db
				.prepare("SELECT COUNT(*) as count FROM users")
				.first<{ count: number }>()
				.then((row) => row?.count ?? 0),
			source: "dl.users.getCount",
			code: "GET_FAILED",
		});
	}
}

export { UserDataLayer };
