import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { createSessionToken, SESSION_TTL, verifyPassword } from "../lib/auth";
import { DB } from "../lib/db";
import { SESSION_COOKIE_NAME } from "../middleware/session";

const auth = new Hono<{ Bindings: Env }>();

// --- Login page ---

type LoginPageProps = {
	error?: string;
};

const LoginPage = ({ error }: LoginPageProps) => {
	return html`<!doctype html>
		<html lang="en" class="dark">
			<head>
				<meta charset="utf-8" />
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1"
				/>
				<title>Login -- residue</title>
				<script src="https://cdn.tailwindcss.com"></script>
				<script>
					tailwind.config = {
						darkMode: "class",
						theme: {
							extend: {
								fontFamily: {
									mono: [
										"JetBrains Mono",
										"IBM Plex Mono",
										"ui-monospace",
										"SFMono-Regular",
										"monospace",
									],
								},
							},
						},
					};
				</script>
				<link
					rel="preconnect"
					href="https://fonts.googleapis.com"
				/>
				<link
					rel="preconnect"
					href="https://fonts.gstatic.com"
					crossorigin
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
					rel="stylesheet"
				/>
				<style>
					body {
						font-family: "JetBrains Mono", "IBM Plex Mono",
							ui-monospace, SFMono-Regular, monospace;
					}
				</style>
			</head>
			<body
				class="bg-zinc-950 text-zinc-100 min-h-screen antialiased flex items-center justify-center"
			>
				<div
					class="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-md p-6"
				>
					<h1 class="text-xl font-bold mb-6 text-zinc-100">
						residue
					</h1>
					${
						error
							? html`<div
								class="text-red-400 text-sm mb-4 bg-red-950/30 border border-red-900/50 rounded px-3 py-2"
							>
								${error}
							</div>`
							: ""
					}
					<form method="POST" action="/app/login">
						<div class="mb-4">
							<label
								for="username"
								class="block text-sm text-zinc-400 mb-1.5"
								>Username</label
							>
							<input
								type="text"
								id="username"
								name="username"
								required
								autocomplete="username"
								class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
							/>
						</div>
						<div class="mb-6">
							<label
								for="password"
								class="block text-sm text-zinc-400 mb-1.5"
								>Password</label
							>
							<input
								type="password"
								id="password"
								name="password"
								required
								autocomplete="current-password"
								class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
							/>
						</div>
						<button
							type="submit"
							class="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
						>
							Sign in
						</button>
					</form>
				</div>
			</body>
		</html>`;
};

auth.get("/login", (c) => {
	return c.html(LoginPage({}));
});

auth.post("/login", async (c) => {
	const body = await c.req.parseBody();
	const username =
		typeof body.username === "string" ? body.username.trim() : "";
	const password = typeof body.password === "string" ? body.password : "";

	if (!username || !password) {
		return c.html(
			LoginPage({ error: "Username and password are required." }),
			400,
		);
	}

	const db = new DB(c.env.DB);

	let authenticatedUsername: string | null = null;

	// Try admin env vars first
	if (username === c.env.ADMIN_USERNAME && password === c.env.ADMIN_PASSWORD) {
		authenticatedUsername = username;
	}

	// Fall back to DB users
	if (!authenticatedUsername) {
		const user = await db.getUserByUsername(username);
		if (user) {
			const isPasswordValid = await verifyPassword({
				password,
				storedHash: user.password_hash,
			});
			if (isPasswordValid) {
				authenticatedUsername = user.username;
			}
		}
	}

	if (!authenticatedUsername) {
		return c.html(LoginPage({ error: "Invalid username or password." }), 401);
	}

	const token = await createSessionToken({
		username: authenticatedUsername,
		secret: c.env.AUTH_TOKEN,
	});

	setCookie(c, SESSION_COOKIE_NAME, token, {
		path: "/",
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		maxAge: SESSION_TTL,
	});

	return c.redirect("/app");
});

// --- Logout ---

auth.post("/logout", (c) => {
	deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
	return c.redirect("/app/login");
});

export { auth };
