# dsh-openrouter-sync

Keep the DSH `openrouter` provider model list in sync with OpenRouter's currently-free models.

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin,
packaged as a DSH bundle: `package.json` declares `dsh.bundle.patch`, and
`cordis.patch.yml` inserts the `openrouter-sync` row into the active profile.
Host-only plugin: every six hours it rewrites the `openrouter` provider models in the active profile patch; HMR recomposes it live.

## Install

- Desktop app: **Plugins** → install `github:bosenok/dsh-openrouter-sync` (private repository:
  give the machine git access), then enable the bundle.
- CLI: `dsh plugin --profile <profile> add github:bosenok/dsh-openrouter-sync`.
- Local checkout: `dsh plugin --profile <profile> add file:/path/to/dsh-openrouter-sync`.

Enabling the bundle mounts the plugin; HMR applies it to a running app, and a
restart makes sure the client half is rebuilt.

## Where the key comes from

The host half resolves `OPENROUTER_API_KEY` through the harness credential
service first, then the process environment, then
`~/.dsh/.credentials.yaml`; with no key it still lists the provider's models only
when configured — the sync itself is skipped. Nothing plugin-specific to set up
beyond the OpenRouter provider (or an `OPENROUTER_API_KEY` entry in the
credential store / environment layers).

## Development

`lib/` is built and committed; the sources live in `src/`. Rebuild the client with
the repository's Vite config (`npx vite build` → `dist/`, then the wrapper in
`build/wrapper.js` produces `lib/client.js`).

## License

MIT — see [LICENSE](LICENSE). Third-party code bundled into `lib/` and its
licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
