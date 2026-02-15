import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import type { Message } from "../types";

type ContinuationLink = {
	sha: string;
	url: string;
};

type ConversationProps = {
	messages: Message[];
	continuesFrom?: ContinuationLink;
	continuesIn?: ContinuationLink;
};

const roleColor = (role: string): string => {
	switch (role) {
		case "human":
			return "text-emerald-400";
		case "assistant":
			return "text-violet-400";
		case "tool":
			return "text-amber-400";
		default:
			return "text-zinc-400";
	}
};

const escapeHtml = (str: string): string =>
	str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

type ContentPart = { type: "text" | "code"; text: string; lang?: string };

const parseContent = (content: string): ContentPart[] => {
	const parts: ContentPart[] = [];
	const regex = /```(\w*)\n?([\s\S]*?)```/g;
	let lastIndex = 0;
	let match;

	while ((match = regex.exec(content)) !== null) {
		if (match.index > lastIndex) {
			parts.push({ type: "text", text: content.slice(lastIndex, match.index) });
		}
		parts.push({
			type: "code",
			text: match[2],
			lang: match[1] || undefined,
		});
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < content.length) {
		parts.push({ type: "text", text: content.slice(lastIndex) });
	}

	if (parts.length === 0 && content) {
		parts.push({ type: "text", text: content });
	}

	return parts;
};

const ContentRenderer: FC<{ content: string }> = ({ content }) => {
	if (!content) return <span />;

	const parts = parseContent(content);

	return (
		<div>
			{parts.map((part) =>
				part.type === "code" ? (
					<pre class="bg-zinc-950 border border-zinc-800 rounded-md p-3 overflow-x-auto my-2 text-sm">
						<code>{part.text}</code>
					</pre>
				) : (
					<span class="whitespace-pre-wrap break-words">{part.text}</span>
				),
			)}
		</div>
	);
};

const Conversation: FC<ConversationProps> = ({
	messages,
	continuesFrom,
	continuesIn,
}) => {
	return (
		<div class="flex flex-col gap-2">
			{continuesFrom && (
				<a
					href={continuesFrom.url}
					class="text-zinc-400 text-sm flex items-center gap-1 hover:text-zinc-200 transition-colors"
				>
					<i class="ph ph-arrow-up text-xs" />
					Continues from{" "}
					<span class="text-blue-500 font-mono">
						{continuesFrom.sha.slice(0, 7)}
					</span>
				</a>
			)}

			{messages.map((msg) => (
				<div class="rounded-md bg-zinc-900 border border-zinc-800 p-3">
					<div class="flex items-center gap-2 mb-2">
						<span
							class={`text-xs font-semibold uppercase tracking-wide ${roleColor(msg.role)}`}
						>
							{msg.role}
						</span>
						{msg.model && (
							<span class="text-xs text-zinc-500">{msg.model}</span>
						)}
					</div>

					{msg.thinking && msg.thinking.length > 0 && (
						<div class="mb-2 flex flex-col gap-1">
							{msg.thinking.map((tb) => (
								<details class="border border-zinc-800 rounded-md overflow-hidden">
									<summary class="cursor-pointer px-2 py-1.5 text-sm text-zinc-500 hover:text-zinc-400 flex items-center gap-1.5">
										<i class="ph ph-caret-right text-xs transition-transform" />
										<i class="ph ph-brain text-xs" />
										<span class="italic">thinking</span>
									</summary>
									<div class="p-3 text-xs bg-zinc-950 border-t border-zinc-800">
										<pre class="text-zinc-500 overflow-x-auto whitespace-pre-wrap break-all max-h-96 overflow-y-auto">{tb.content}</pre>
									</div>
								</details>
							))}
						</div>
					)}

					<div class="text-sm text-zinc-200">
						<ContentRenderer content={msg.content} />
					</div>

					{msg.tool_calls && msg.tool_calls.length > 0 && (
						<div class="mt-2 flex flex-col gap-1">
							{msg.tool_calls.map((tc) => (
								<details class="border border-zinc-800 rounded-md overflow-hidden">
									<summary class="cursor-pointer px-2 py-1.5 text-sm text-zinc-400 hover:text-zinc-300 flex items-center gap-1.5">
										<i class="ph ph-caret-right text-xs transition-transform" />
										<span class="font-mono">{tc.name}</span>
									</summary>
									<div class="p-3 text-xs bg-zinc-950 border-t border-zinc-800">
										{tc.input && (
											<div class="mb-3">
												<div class="text-zinc-500 font-semibold mb-1 uppercase tracking-wide">
													Input
												</div>
												<pre class="text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all">
													{tc.input}
												</pre>
											</div>
										)}
										{tc.output && (
											<div>
												<div class="text-zinc-500 font-semibold mb-1 uppercase tracking-wide">
													Output
												</div>
												<pre class="text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
													{tc.output}
												</pre>
											</div>
										)}
									</div>
								</details>
							))}
						</div>
					)}
				</div>
			))}

			{continuesIn && (
				<a
					href={continuesIn.url}
					class="text-zinc-400 text-sm flex items-center gap-1 hover:text-zinc-200 transition-colors"
				>
					<i class="ph ph-arrow-down text-xs" />
					Continues in{" "}
					<span class="text-blue-500 font-mono">
						{continuesIn.sha.slice(0, 7)}
					</span>
				</a>
			)}
		</div>
	);
};

export { Conversation, ContentRenderer, parseContent, roleColor, escapeHtml };
export type { ConversationProps, ContinuationLink };
