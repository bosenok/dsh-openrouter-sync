// Host half of the dsh-openrouter-sync plugin.
//
// Keeps the `openrouter` provider's model list inside the active DSH profile in
// sync with OpenRouter's *currently* free models. Free slugs rotate: OpenRouter
// retires ":free" variants and adds new ones, so a hand-written list goes stale.
//
// This runs in the host process (not through an agent bash tool), therefore it is
// not subject to the agent file sandbox and needs no approval to write the
// profile patch. DSH's HMR watches that patch, so the rewrite is recomposed while
// the app is running.
//
// Zero dependencies by design: node builtins only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const name = "openrouter-sync";
const SYNC_MS = 6 * 60 * 60 * 1000;
const MODELS_URL = "https://openrouter.ai/api/v1/models";
const MIN_CONTEXT = 64000;
const ROUTE_API = "openai-completions";

/** Wait for the credential service: its store loads in an async service init. */
const inject = ["credentials"];

const harnessHome = () => process.env.DSH_HOME ?? path.join(os.homedir(), ".dsh");
const profileName = () => process.env.DSH_PROFILE ?? "desktop";
const patchPath = () => path.join(harnessHome(), "profiles", profileName(), "cordis.patch.yml");

/** Resolve the OpenRouter key: credential service, then env, then the store file. */
async function resolveKey(ctx) {
	try {
		const credentials = ctx.get("credentials");
		if (credentials !== undefined && typeof credentials.resolve === "function") {
			const resolved = await credentials.resolve("OPENROUTER_API_KEY");
			if (typeof resolved?.value === "string" && resolved.value.length > 0) return resolved.value;
		}
	} catch {
		/* fall through to the file/env fallbacks */
	}
	if (typeof process.env.OPENROUTER_API_KEY === "string" && process.env.OPENROUTER_API_KEY.length > 0) {
		return process.env.OPENROUTER_API_KEY;
	}
	try {
		const text = fs.readFileSync(path.join(harnessHome(), ".credentials.yaml"), "utf8");
		const match = /^\s*OPENROUTER_API_KEY:\s*(\S+)\s*$/m.exec(text);
		if (match !== null) return match[1].replace(/^['"]|['"]$/g, "");
	} catch {
		/* no store file */
	}
	return "";
}

/** Status snapshot, so a human can see when the list was refreshed last. */
function writeStatus(status) {
	try {
		const dir = path.join(harnessHome(), "cache");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "openrouter-sync.json"),
			`${JSON.stringify({ at: new Date().toISOString(), profile: profileName(), ...status }, null, 2)}\n`,
		);
	} catch {
		/* a status file is best-effort */
	}
}

const isZero = (price) => {
	const value = Number(price);
	return Number.isFinite(value) && value === 0;
};

/** Free models that can drive tools, biggest context first. */
async function fetchFreeModels(key) {
	const response = await fetch(MODELS_URL, {
		headers: { authorization: `Bearer ${key}`, accept: "application/json" },
		signal: AbortSignal.timeout(45000),
	});
	if (!response.ok) throw new Error(`models request failed: HTTP ${response.status}`);
	const payload = await response.json();

	const picked = [];
	for (const model of payload?.data ?? []) {
		const pricing = model?.pricing ?? {};
		if (!isZero(pricing.prompt) || !isZero(pricing.completion)) continue;
		if (!(model?.supported_parameters ?? []).includes("tools")) continue;
		const context = Number(model?.context_length ?? 0);
		if (context > 0 && context < MIN_CONTEXT) continue;
		const modalities = model?.architecture?.input_modalities ?? ["text"];
		const inputs = modalities.filter((m) => m === "text" || m === "image");
		if (!inputs.includes("text")) inputs.unshift("text");
		picked.push({
			id: String(model.id),
			name: String(model.name ?? model.id).replace(/"/g, "'"),
			context: context > 0 ? context : 200000,
			maxTokens: Number(model?.top_provider?.max_completion_tokens ?? 32768),
			inputs,
			reasoning: Boolean(model?.reasoning),
		});
	}
	picked.sort((a, b) => (b.context - a.context) || a.id.localeCompare(b.id));
	return picked;
}

/** Render one provider list entry. `"off"` is quoted on purpose: YAML 1.1
 * parsers (PyYAML) read a bare `off` key as boolean false, which breaks any
 * later round-trip of the file. */
function renderEntry(model, indent) {
	const lines = [
		`${indent}- id: "${model.id}"`,
		`${indent}  name: "${model.name}"`,
		`${indent}  contextWindow: ${model.context}`,
		`${indent}  maxTokens: ${model.maxTokens}`,
		`${indent}  input:`,
		...model.inputs.map((modality) => `${indent}    - ${modality}`),
	];
	if (model.reasoning) {
		lines.push(
			`${indent}  reasoningEfforts:`,
			`${indent}    "off":`,
			`${indent}    low: low`,
			`${indent}    medium: medium`,
			`${indent}    high: high`,
		);
	} else {
		lines.push(`${indent}  reasoningEfforts: false`);
	}
	return lines;
}

/** Rewrite only the `models:` list of the `openrouter:` provider block. */
function rewrite(text, models) {
	const lines = text.split("\n");
	const start = lines.findIndex((line) => /^\s{6}openrouter:\s*$/.test(line));
	if (start === -1) return null;

	let end = lines.length;
	for (let i = start + 1; i < lines.length; i += 1) {
		const line = lines[i];
		if (line.trim() !== "" && !/^\s{8}/.test(line) && !line.trimStart().startsWith("#")) {
			end = i;
			break;
		}
	}
	let block = lines.slice(start, end);

	// Route-level api is required for ids the installed pi-ai catalog does not describe.
	if (!block.some((line) => /^\s{8}api:\s*\S+\s*$/.test(line))) {
		block = [block[0], `        api: ${ROUTE_API}`, ...block.slice(1)];
	}

	const modelsAt = block.findIndex((line) => /^\s{8}models:\s*$/.test(line));
	if (modelsAt === -1) return null;

	let modelsEnd = block.length;
	for (let i = modelsAt + 1; i < block.length; i += 1) {
		const line = block[i];
		if (line.trim() !== "" && !/^\s{10}/.test(line)) {
			modelsEnd = i;
			break;
		}
	}

	const oldIds = block
		.slice(modelsAt + 1, modelsEnd)
		.map((line) => /^\s{10}- id:\s*"?([^"\n]+?)"?\s*$/.exec(line)?.[1])
		.filter((id) => id !== undefined);

	const nextBlock = [
		...block.slice(0, modelsAt + 1),
		...models.flatMap((model) => renderEntry(model, " ".repeat(10))),
		...block.slice(modelsEnd),
	];
	const nextLines = [...lines.slice(0, start), ...nextBlock, ...lines.slice(end)];
	const newIds = models.map((model) => model.id);
	return {
		text: nextLines.join("\n"),
		added: newIds.filter((id) => !oldIds.includes(id)),
		removed: oldIds.filter((id) => !newIds.includes(id)),
	};
}

async function sync(ctx) {
	const key = await resolveKey(ctx);
	if (key.length === 0) {
		writeStatus({ ok: false, error: "no OPENROUTER_API_KEY" });
		console.error(`[${name}] no OPENROUTER_API_KEY (credential service, env, or ~/.dsh/.credentials.yaml)`);
		return;
	}
	const models = await fetchFreeModels(key);
	if (models.length === 0) {
		writeStatus({ ok: false, error: "no free tool-capable models reported" });
		console.error(`[${name}] OpenRouter reported no free tool-capable models; leaving the config untouched`);
		return;
	}
	const file = patchPath();
	let before;
	try {
		before = fs.readFileSync(file, "utf8");
	} catch (error) {
		writeStatus({ ok: false, error: `cannot read ${file}` });
		console.error(`[${name}] cannot read ${file}: ${String(error?.message ?? error)}`);
		return;
	}
	const result = rewrite(before, models);
	if (result === null) {
		writeStatus({ ok: false, error: "no openrouter models list in the profile patch" });
		console.error(`[${name}] ${file} has no \`openrouter:\` provider with a \`models:\` list; nothing to do`);
		return;
	}
	if (result.text === before) {
		writeStatus({ ok: true, models: models.map((model) => model.id), changed: false, file });
		console.log(`[${name}] ${models.length} free models, already current`);
		return;
	}
	const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
	fs.copyFileSync(file, `${file}.bak-${stamp}`);
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, result.text);
	fs.renameSync(tmp, file);
	writeStatus({ ok: true, models: models.map((model) => model.id), changed: true, added: result.added, removed: result.removed, file });
	console.log(
		`[${name}] ${models.length} free models written to ${file} (+${result.added.length} -${result.removed.length})`,
	);
}

function apply(ctx) {
	ctx.effect(() => {
		let running = false;
		const tick = async () => {
			if (running) return;
			running = true;
			try {
				await sync(ctx);
			} catch (error) {
				console.error(`[${name}] refresh failed: ${String(error?.message ?? error)}`);
			} finally {
				running = false;
			}
		};
		void tick();
		const timer = setInterval(() => void tick(), SYNC_MS);
		return () => clearInterval(timer);
	}, "openrouter-sync: free model list poll");
}

export { apply, inject, name, rewrite, fetchFreeModels };
