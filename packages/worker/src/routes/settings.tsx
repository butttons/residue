import { Hono } from "hono";
import type { FC } from "hono/jsx";
import { Layout } from "../components/Layout";
import { hashPassword } from "../lib/auth";
import { DB } from "../lib/db";
import { formatTimestamp } from "../lib/time";

type BreadcrumbItem = { label: string; href?: string };

const Breadcrumb: FC<{ items: BreadcrumbItem[] }> = ({ items }) => (
	<nav class="flex items-center gap-1.5 text-sm text-zinc-400 mb-6">
		{items.map((item, i) => (
			<span class="flex items-center gap-1.5">
				{i > 0 && <span class="text-zinc-600">/</span>}
				{i === 0 && item.href ? (
					<a
						href={item.href}
						class="hover:text-zinc-200 transition-colors flex items-center"
						title="Home"
					>
						<i class="ph ph-house text-base" />
					</a>
				) : item.href ? (
					<a href={item.href} class="hover:text-zinc-200 transition-colors">
						{item.label}
					</a>
				) : (
					<span class="text-zinc-200">{item.label}</span>
				)}
			</span>
		))}
	</nav>
);

type FlashProps = {
	success?: string;
	error?: string;
};

const FlashMessages: FC<FlashProps> = ({ success, error }) => (
	<>
		{success && (
			<div class="text-emerald-400 text-sm mb-4 bg-emerald-950/30 border border-emerald-900/50 rounded px-3 py-2">
				{success}
			</div>
		)}
		{error && (
			<div class="text-red-400 text-sm mb-4 bg-red-950/30 border border-red-900/50 rounded px-3 py-2">
				{error}
			</div>
		)}
	</>
);

const settings = new Hono<{ Bindings: Env; Variables: { username: string } }>();

// Settings index
settings.get("/settings", async (c) => {
	const username = c.get("username");
	const db = new DB(c.env.DB);
	const isPublic = await db.getIsPublic();

	const success = c.req.query("success");
	const error = c.req.query("error");

	return c.html(
		<Layout title="Settings -- residue" username={username}>
			<Breadcrumb
				items={[
					{ label: "residue", href: "/app" },
					{ label: "Settings" },
				]}
			/>

			<FlashMessages success={success} error={error} />

			{/* Visibility */}
			<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 mb-4">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-sm font-medium text-zinc-100 mb-1">
							Public visibility
						</h2>
						<p class="text-xs text-zinc-400">
							{isPublic
								? "Anyone can view conversations without signing in. Settings and user management still require authentication."
								: "Only authenticated users can view conversations. Enable to allow public access."}
						</p>
					</div>
					<form method="POST" action="/app/settings/visibility">
						<input
							type="hidden"
							name="is_public"
							value={isPublic ? "false" : "true"}
						/>
						<button
							type="submit"
							class={`text-sm font-medium py-1.5 px-3 rounded transition-colors ${
								isPublic
									? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
									: "bg-blue-600 hover:bg-blue-500 text-white"
							}`}
						>
							{isPublic ? "Make private" : "Make public"}
						</button>
					</form>
				</div>
			</div>

			{/* Navigation to other settings */}
			<a
				href="/app/settings/users"
				class="block bg-zinc-900 border border-zinc-800 rounded-md p-4 hover:border-zinc-700 transition-colors"
			>
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-sm font-medium text-zinc-100">Users</h2>
						<p class="text-xs text-zinc-400 mt-0.5">
							Manage user accounts and access
						</p>
					</div>
					<i class="ph ph-caret-right text-zinc-500" />
				</div>
			</a>
		</Layout>,
	);
});

// Toggle visibility
settings.post("/settings/visibility", async (c) => {
	const body = await c.req.parseBody();
	const isPublic = body.is_public === "true";

	const db = new DB(c.env.DB);
	await db.setSetting({ key: "is_public", value: isPublic ? "true" : "false" });

	const message = isPublic
		? "Instance is now publicly visible."
		: "Instance is now private.";

	return c.redirect(
		`/app/settings?success=${encodeURIComponent(message)}`,
	);
});

// List users + create form
settings.get("/settings/users", async (c) => {
	const username = c.get("username");
	const db = new DB(c.env.DB);
	const users = await db.listUsers();

	const success = c.req.query("success");
	const error = c.req.query("error");

	return c.html(
		<Layout title="Users -- Settings -- residue" username={username}>
			<Breadcrumb
				items={[
					{ label: "residue", href: "/app" },
					{ label: "Settings" },
					{ label: "Users" },
				]}
			/>

			<FlashMessages success={success} error={error} />

			{/* Create user form */}
			<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 mb-6">
				<h2 class="text-sm font-medium text-zinc-100 mb-4">Create user</h2>
				<form
					method="POST"
					action="/app/settings/users"
					class="flex flex-col sm:flex-row gap-3"
				>
					<div class="flex-1">
						<input
							type="text"
							name="username"
							placeholder="Username"
							required
							autocomplete="off"
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
						/>
					</div>
					<div class="flex-1">
						<input
							type="password"
							name="password"
							placeholder="Password"
							required
							autocomplete="new-password"
							class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
						/>
					</div>
					<button
						type="submit"
						class="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 px-4 rounded transition-colors whitespace-nowrap"
					>
						Create user
					</button>
				</form>
			</div>

			{/* User list */}
			<div class="bg-zinc-900 border border-zinc-800 rounded-md">
				<div class="px-4 py-3 border-b border-zinc-800">
					<h2 class="text-sm font-medium text-zinc-100">
						{users.length} {users.length === 1 ? "user" : "users"}
					</h2>
				</div>
				{users.length === 0 ? (
					<p class="text-zinc-400 text-sm px-4 py-6">No users yet.</p>
				) : (
					<div class="divide-y divide-zinc-800">
						{users.map((user) => {
							const isSelf = user.username === username;
							return (
								<div class="flex items-center justify-between px-4 py-3">
									<div>
										<span class="text-zinc-100 text-sm">{user.username}</span>
										{isSelf && (
											<span class="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 ml-2">
												you
											</span>
										)}
										<span class="text-zinc-500 text-xs block mt-0.5">
											Created {formatTimestamp(user.created_at)}
										</span>
									</div>
									{!isSelf && (
										<form
											method="POST"
											action={`/app/settings/users/${user.id}/delete`}
											onsubmit="return confirm('Are you sure you want to delete this user?')"
										>
											<button
												type="submit"
												class="text-xs text-red-400 hover:text-red-300 transition-colors"
											>
												Delete
											</button>
										</form>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</Layout>,
	);
});

// Create user
settings.post("/settings/users", async (c) => {
	const body = await c.req.parseBody();
	const newUsername =
		typeof body.username === "string" ? body.username.trim() : "";
	const password = typeof body.password === "string" ? body.password : "";

	if (!newUsername || !password) {
		return c.redirect(
			"/app/settings/users?error=" +
				encodeURIComponent("Username and password are required."),
		);
	}

	const db = new DB(c.env.DB);

	const existing = await db.getUserByUsername(newUsername);
	if (existing) {
		return c.redirect(
			"/app/settings/users?error=" +
				encodeURIComponent("Username already exists."),
		);
	}

	const passwordHash = await hashPassword({ password });
	const id = crypto.randomUUID();
	await db.createUser({ id, username: newUsername, passwordHash });

	return c.redirect(
		"/app/settings/users?success=" +
			encodeURIComponent(`User "${newUsername}" created.`),
	);
});

// Delete user
settings.post("/settings/users/:id/delete", async (c) => {
	const id = c.req.param("id");
	const currentUsername = c.get("username");
	const db = new DB(c.env.DB);

	// Find the target user to check for self-deletion
	const users = await db.listUsers();
	const targetUser = users.find((u) => u.id === id);

	if (!targetUser) {
		return c.redirect(
			"/app/settings/users?error=" + encodeURIComponent("User not found."),
		);
	}

	if (targetUser.username === currentUsername) {
		return c.redirect(
			"/app/settings/users?error=" +
				encodeURIComponent("Cannot delete your own account."),
		);
	}

	await db.deleteUser(id);

	return c.redirect(
		"/app/settings/users?success=" +
			encodeURIComponent(`User "${targetUser.username}" deleted.`),
	);
});

export { settings };
