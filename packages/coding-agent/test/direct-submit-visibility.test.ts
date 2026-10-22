// Direct-chat Enter acknowledgement: assert rendered own text, not event-loop responsiveness.
// Run: PI_OFFLINE=1 node --test packages/coding-agent/test/direct-submit-visibility.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Container } from "@earendil-works/pi-tui";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import { getMarkdownTheme, initTheme } from "../src/modes/interactive/theme/theme.ts";

process.env.PI_OFFLINE = "1";
initTheme("dark");

for (const outcome of ["accepted", "handled", "error", "cancelled", "handled-long"] as const) {
	test(`submitted text renders before preflight and cleans up after ${outcome}`, async () => {
		const preflight = Promise.withResolvers<void>();
		const entered = Promise.withResolvers<void>();
		const finished = Promise.withResolvers<void>();
		const chatContainer = new Container();
		const pendingMessagesContainer = new Container();
		let rendered = "";
		let inputCount = 0;
		const errors: string[] = [];
		const context = {
			init: async () => {},
			options: {},
			version: "test",
			chatContainer,
			pendingMessagesContainer,
			clearPendingSubmission: Reflect.get(InteractiveMode.prototype, "clearPendingSubmission"),
			isInitialized: true,
			footer: { invalidate: () => {} },
			programStatus: { handleEvent: () => {} },
			updatePendingMessagesDisplay: () => {},
			addMessageToChat: Reflect.get(InteractiveMode.prototype, "addMessageToChat"),
			getUserMessageText: Reflect.get(InteractiveMode.prototype, "getUserMessageText"),
			outputPad: 1,
			getMarkdownThemeWithSettings: getMarkdownTheme,
			getMarkdownTransformers: () => [],
			ui: {
				requestRender: () => {
					rendered = [...chatContainer.render(120), ...pendingMessagesContainer.render(120)].join("\n");
				},
			},
			session: {
				modelRuntime: { getError: () => undefined },
				prompt: async () => {
					entered.resolve();
					await preflight.promise;
					if (outcome === "error") throw new Error("fixture preflight failure");
					if (outcome === "accepted") {
						await Reflect.get(InteractiveMode.prototype, "handleEvent").call(context, {
							type: "message_start",
							message: { role: "user", content: "TRANSFORMED_PUBLIC_FIXTURE", timestamp: Date.now() },
						});
					}
				},
			},
			checkForPackageUpdates: async () => [],
			checkTmuxKeyboardSetup: async () => undefined,
			maybeWarnAboutAnthropicSubscriptionAuth: async () => {},
			showError: (message: string) => errors.push(message),
			getUserInput: async () => {
				if (inputCount++ === 0)
					return `ACK_PUBLIC_FIXTURE${outcome === "handled-long" ? " public-long-text".repeat(300) : ""}`;
				finished.resolve();
				return new Promise<string>(() => {});
			},
		};
		void InteractiveMode.prototype.run.call(context as unknown as InteractiveMode);
		await entered.promise;
		assert.match(rendered, /ACK_PUBLIC_FIXTURE/);
		assert.match(rendered, /Submitting/);
		assert.equal(pendingMessagesContainer.render(42).length, 2);
		assert.doesNotMatch(chatContainer.render(120).join("\n"), /ACK_PUBLIC_FIXTURE/);
		if (outcome === "cancelled") {
			context.clearPendingSubmission.call(context);
			context.clearPendingSubmission.call(context);
			assert.doesNotMatch(pendingMessagesContainer.render(120).join("\n"), /ACK_PUBLIC_FIXTURE|Submitting/);
		}
		preflight.resolve();
		await finished.promise;
		assert.doesNotMatch(
			[...chatContainer.render(120), ...pendingMessagesContainer.render(120)].join("\n"),
			/ACK_PUBLIC_FIXTURE|Submitting/,
		);
		if (outcome === "accepted") {
			const finalRender = chatContainer.render(120).join("\n");
			assert.equal(finalRender.match(/TRANSFORMED_PUBLIC_FIXTURE/g)?.length, 1);
		}
		assert.deepEqual(errors, outcome === "error" ? ["fixture preflight failure"] : []);
	});
}
