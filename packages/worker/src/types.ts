import type { DataLayer } from "./lib/db";

type AppEnv = {
	Bindings: Env;
	Variables: {
		DL: DataLayer;
		username: string;
	};
};

export type { AppEnv };
