import { BaseDataLayer } from "./_base";
import type { DBError } from "./_error";
import type { Result } from "./_result";

class SettingsDataLayer extends BaseDataLayer {
	get(key: string): Promise<Result<string | null, DBError>> {
		return this.run({
			promise: this.db
				.prepare("SELECT value FROM settings WHERE key = ?")
				.bind(key)
				.first<{ value: string }>()
				.then((row) => row?.value ?? null),
			source: "dl.settings.get",
			code: "GET_FAILED",
		});
	}

	set({
		key,
		value,
	}: {
		key: string;
		value: string;
	}): Promise<Result<void, DBError>> {
		return this.run({
			promise: this.db
				.prepare(
					"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
				)
				.bind(key, value)
				.run()
				.then(() => undefined),
			source: "dl.settings.set",
			code: "UPDATE_FAILED",
		});
	}

	getIsPublic(): Promise<Result<boolean, DBError>> {
		return this.run({
			promise: this.db
				.prepare("SELECT value FROM settings WHERE key = ?")
				.bind("is_public")
				.first<{ value: string }>()
				.then((row) => row?.value === "true"),
			source: "dl.settings.getIsPublic",
			code: "GET_FAILED",
		});
	}
}

export { SettingsDataLayer };
