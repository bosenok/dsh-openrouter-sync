# Free models in DSH — what actually works

> **Historical document (2026-10-16).** The `models:` list of the `openrouter` provider is
> maintained by the `dsh-openrouter-sync` plugin itself: every 6 hours it reads
> `https://openrouter.ai/api/v1/models`, keeps the free models that support tool calls and
> rewrites the list in the profile (HMR recomposes the configuration live). The external
> python script and the launchd agent described below are no longer used and have been removed;
> the sections about them are kept as history. Example configurations live in [`examples/`](../examples/).

Checked on 2026-10-16 on this machine: the DSH desktop app (`~/.dsh/profiles/desktop`) and the
pi-ai from the shipped bundle `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`.

## Verdict

| Option | Status | Why |
|---|---|---|
| **OpenRouter free** (`:free`) | ✅ verified end to end with DSH | The key is already there: `~/.dsh/.credentials.yaml` → `refs.OPENROUTER_API_KEY` |
| Other vendors' free tiers | ❌ not usable from DSH | Their free tiers are bound server-side to the vendor's own coding client, so a request from another client is rejected |
| Local models | ✅ possible | Any OpenAI-compatible local server can be wired as a custom route |

In short: the free and legitimate option is OpenRouter `:free` (or local models). The free tiers
of other vendors cannot be reached from DSH.

## Evidence

**1. Free OpenRouter models work (cost 0)**

```bash
curl -sS https://openrouter.ai/api/v1/chat/completions -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{"model":"nvidia/nemotron-3-super-120b-a12b:free", ...}'
# → HTTP 200, "cost": 0
```

**2. An end-to-end DSH run on a free model (the file [`openrouter-free.overlay.yml`](../examples/openrouter-free.overlay.yml))**

```bash
DSH_HOME=$PWD/.dsh-test OPENROUTER_API_KEY=... \
  dsh --profile headless --patch ./openrouter-free.overlay.yml "Reply with exactly the word: PONG"
# → PONG

... "Use the bash tool to run exactly: echo free-model-tools-ok — then reply with just the tool output."
# → free-model-tools-ok      (the bash tool call through DSH worked)
```

The free models that were live at the time of the check: `nvidia/nemotron-3-super-120b-a12b:free`,
`nvidia/nemotron-3.5-lightning:free`, `cohere/north-mini-code:free`, `poolside/laguna-s-2.1:free`.

## Keeping the free-model list up to date

**Status: it works, in two ways.**

| Way | How often | Restart | External daemons |
|---|---|---|---|
| **The `dsh-openrouter-sync` plugin** (the primary one, installed) | at app start + every 6 h | not needed (HMR) | none |
| The `openrouter-free-sync.py` script (removed — the plugin syncs by itself) | manually or via launchd | not needed (HMR) while the app runs | launchd — optional |

Both rewrite the same thing: the `models:` list of the `openrouter` provider in
`~/.dsh/profiles/desktop/cordis.patch.yml`.

### Why no restart is needed

DSH mounts HMR (`@deepseek-ai/dsh-hmr`) at start under the launcher, and it "registers the profile
manifest and **both user patch watches**… **Profile and home patch changes also trigger
recomposition**". An edit of `cordis.patch.yml` recomposes the configuration of the running app
(the file settles in about 2 s). If the app was closed, the edit applies at the next start.

Verified on the live app: an `openrouter` route that was not in the config at start worked without
a restart (a subagent answered `ROUTE-LIVE-OK`), and a temporary probe plugin ran 2 seconds after
the patch was edited.

### The `dsh-openrouter-sync` plugin (installed)

Sources: [`plugin/`](plugin). In the profile: `~/.dsh/profiles/desktop/local/dsh-openrouter-sync/`,
a symlink in `node_modules/`, the entry `- insert: {id: openrouter-sync, name: dsh-openrouter-sync}`
in the patch and the dependency `file:./local/dsh-openrouter-sync` in `package.json`.

Why a plugin and not a reminder in a session: the agent's bash runs in the file sandbox
(`workspace-write`), but the write target is `~/.dsh` — and when the reminder fires without
anyone answering the approval request it fails (fail closed). The plugin runs in the host process,
outside the sandbox, and needs neither an approval nor launchd.

At load time and then every 6 hours it:

1. does `GET https://openrouter.ai/api/v1/models` (the key comes through the DSH credential service);
2. keeps the models whose `pricing.prompt == 0` **and** `pricing.completion == 0` **and** that
   support `tools`;
3. rewrites **only** the `models:` list of the `openrouter` provider (the rest of the file stays
   byte for byte, comments intact) and guarantees the route-level `api: openai-completions` —
   without it DSH rejects the ids that are missing from the pi-ai catalog;
4. writes a status to `~/.dsh/cache/openrouter-sync.json` and a `cordis.patch.yml.bak-<time>`
   backup when something changes. It is idempotent: if the list is current, the file is not touched.

### The `openrouter-free-sync.py` script (removed — the plugin syncs by itself) (the CLI equivalent)

```bash
python3 openrouter-free-sync.py            # dry run: print the list, write nothing
python3 openrouter-free-sync.py --apply    # write it into the profile (backup next to it)
python3 openrouter-free-sync.py --apply --min-context 200000   # drop the small ones
```

1. `GET https://openrouter.ai/api/v1/models`;
2. keeps the models whose `pricing.prompt == 0` **and** `pricing.completion == 0` **and** that
   support `tools` (otherwise the agent cannot call tools);
3. rewrites **only** the `models:` list of the `openrouter` provider, leaving the rest of the file
   byte for byte (the comments survive), and additionally guarantees the route-level
   `api: openai-completions` — without it DSH rejects the ids that are missing from the pi-ai
   catalog;
4. prints the added/removed ids and makes a `cordis.patch.yml.bak-<time>` backup.

### Optionally: launchd instead of the plugin

`com.dsh.openrouter-free-sync.plist` (removed) — a launchd agent; before installing it, replace
`REPLACE_WITH_SCRIPT_PATH` with the absolute path to the script:

```bash
cp com.dsh.openrouter-free-sync.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dsh.openrouter-free-sync.plist
launchctl kickstart -p gui/$(id -u)/com.dsh.openrouter-free-sync   # run it now
launchctl bootout gui/$(id -u)/com.dsh-openrouter-free-sync        # turn it off
```

The script is idempotent: if the list did not change, the file is not rewritten.

### What was verified

| Check | Result |
|---|---|
| The script's dry run | 15 free models with tools (out of 465 in the OpenRouter catalog) |
| `--apply` | the list in the profile was updated, the comments and the rest of the file intact |
| The plugin's logic vs the script | a byte-for-byte identical result (`changed: false` on a file written by the script) |
| Idempotency | a second pass does not change the file (the script reports `no change`) |
| Mounting the plugin in an isolated DSH | it wrote 15 models instead of the stale 2, `+14 -1`, a backup was created |
| **The plugin in the live app** | `~/.dsh/cache/openrouter-sync.json` from `2026-10-16T13:14:31Z`: 15 models, `changed:false` — it ran 2 s after the patch was edited, without a restart |
| **Editing the patch on the fly** | a subagent answered `ROUTE-LIVE-OK` through the `openrouter` route, which did not exist when the app started |
| The profile composition after all the edits | `--dump-config` exit 0, 15 models in the route, the plugin entry in place |
| A live run on a model that is **not** in the pi-ai catalog (`thinkingmachines/inkling:free`) | `synced-unknown-ok` — the bash call through DSH worked |
| The script under the system `/usr/bin/python3` 3.9 | works (the plist uses exactly that one — the path does not break on a Homebrew update) |

### Gotchas

- **Editing the plugin's code is not picked up on the fly.** HMR in the base profile runs with
  `root: []`, so the plugin modules are not watched: a new version of `lib/index.js` works after
  an app restart. A change of the *data* (the model list) applies immediately.
- **The `off` key in `reasoningEfforts` has to be quoted.** A bare `off:` in YAML 1.1 (PyYAML) is
  read as the boolean `false`, and any round trip turns it into `false:`, after which the DSH
  validator fails: `expected false | {…} but got {"false":null,…}`. Both the script and the plugin
  write `"off":`.
- **Free models sometimes hang.** In one test `cohere/north-mini-code:free` did not return a single
  chunk for about 10 minutes. The normal-mode `retryPolicy` repeats `TIMEOUT`/`RATE_LIMIT` up to 5
  times, but it does **not** switch the model — switching is only possible at the OpenRouter level
  itself (`openrouter/free` or a preset with a fallback chain).
- **The metadata from the live API overrides the catalog** for the models that are in the catalog
  (context/modalities/reasoning come from the OpenRouter response). That is deliberate: the list
  then lives independently of the app version.
- **The list reflects "free right now"**, not "free forever": if OpenRouter closes a free variant,
  the model silently disappears from the list at the next run (within 6 hours for the plugin, at the
  next run for the script).

## Connecting OpenRouter free in the desktop profile

> **Status: already applied (option B, and the list is kept in sync by the script).** The
> `openrouter` route lives in `~/.dsh/profiles/desktop/cordis.patch.yml` inside the existing
> `llm-pi-ai` block, and the model list is synchronised by the section above. Backup of the
> original: [`backup/`](backup). No restart is needed — HMR recomposes the config on the fly; if
> the app was closed, the edit applies at the next start. The GUI option below works as well.

### Option A — through the GUI (applies immediately, without a restart)

Settings → **Models** → *Add model provider* → pick **OpenRouter** from the catalog (or *custom
provider* with Provider ID `openrouter`, Base URL `https://openrouter.ai/api/v1`, API protocol
`openai-completions`) → paste the API key (the same one lives in `~/.dsh/.credentials.yaml` →
`refs.OPENROUTER_API_KEY`) → *Fetch available models* → tick the `:free` ones you want → save →
pick the model in the chat selector.

### Option B — by editing the profile (applies after the app restarts)

In `~/.dsh/profiles/desktop/cordis.patch.yml`, inside the **existing** `- id: llm-pi-ai` block, in
`providers:` (next to `zai:`, `openai-codex:`, `anthropic:`), add:

```yaml
      openrouter:
        displayName: OpenRouter (free models)
        apiKeyEnv: OPENROUTER_API_KEY
        models:
          - id: "nvidia/nemotron-3-super-120b-a12b:free"
          - id: "nvidia/nemotron-3.5-lightning:free"
          - id: "cohere/north-mini-code:free"
          - id: "poolside/laguna-s-2.1:free"
```

⚠️ Do not add a **second** `- id: llm-pi-ai` block: it would override the whole config together
with `zai` and `anthropic`. The secret never reaches the file: `apiKeyEnv` is resolved through the
DSH credential store.

The file [`openrouter-free.overlay.yml`](../examples/openrouter-free.overlay.yml) is the same
config as a separate overlay layer; it works both with `--patch` and as a ready-made fragment to
copy.

### Rollback

⚠️ **About editing at the same time.** The script and the settings GUI editor write the same file.
The config editor keeps the comments and the foreign values, but if the settings are saved exactly
while the script is working there is a race: the last writer wins. The script makes a backup
before every write, so a rollback is always possible.

```bash
cp dsh-free-models/backup/cordis.patch.yml.<timestamp>.bak ~/.dsh/profiles/desktop/cordis.patch.yml
```

Checking that the edit applied: the `- id: llm-pi-ai` block → `config.providers` must contain
`zai`, `openai-codex`, `anthropic`, `openrouter` (the route was added next to them, nothing was
overridden). The profile composition after the edit was checked: `dsh --profile verify --dump-config`
→ exit 0 (the CLI cannot boot the `desktop` profile — it is reserved for the Electron app), and a
live run with the same provider block returned `PONG2`.

## Pitfalls

- **OpenRouter's free slugs rotate.** `qwen/qwen3.8-27b:free` already answers
  `404 "This model is unavailable for free. The paid version is available now"`,
  `inclusionai/ling-3.0-flash-fin:free` — `404 No endpoints found`,
  `thinkingmachines/inkling-small:free` — `403 only available on agentic harnesses`.
  The model list in the route has to be refreshed from time to time (the *Fetch available models*
  button).
- **The limits of OpenRouter's free models** are separate per-minute/per-day caps (429 when
  exceeded). The current key has `is_free_tier: false`, a credit limit of 250, a balance of about
  $122 → the high tier applies.
- **Quality.** `nemotron-3-super-120b-a12b:free` was verified for agentic work with tools.
- **DSH validates the route strictly:** a duplicate id in the model list → `INVALID_CONFIG:
  llm-pi-ai: provider "openrouter" lists model "…" more than once`; a missing credential →
  `MISSING_CREDENTIAL`.
- **`ALL_PROXY`**: a SOCKS proxy is set, DSH warns that SOCKS is not supported and connects
  directly. If a proxy is needed, give an `http://`/`https://` URL.

## What else can be connected for free

- **LM Studio** (local, without limits): a custom route in DSH — `api: openai-completions`,
  `baseURL: http://127.0.0.1:1234/v1` (the default port), a placeholder key.
- **Z.AI GLM** — already connected in DSH (`zai`, `ZAI_API_KEY`).

## Reproducing the checks

```bash
CLI="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
cd <this folder>/..
DSH_HOME=$PWD/.dsh-test \
OPENROUTER_API_KEY=$(python3 -c "import yaml;print(yaml.safe_load(open('$HOME/.dsh/.credentials.yaml'))['refs']['OPENROUTER_API_KEY'])") \
  "$CLI" --profile headless --patch ./openrouter-free.overlay.yml "Reply with exactly the word: PONG"
```

A separate `DSH_HOME` folder — so the working `desktop` profile is not touched.
