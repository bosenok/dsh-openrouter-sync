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

> Note for the app-managed `desktop` profile: `dsh plugin --profile desktop add`
> only installs the dependency and copies the package; unlike a regular profile
> it does not enable the bundle. Enable it by adding the package name to
> `dsh.profile.bundles` in `~/.dsh/profiles/desktop/package.json` (or through the
> Plugins page). Other profiles enable the installed bundle automatically.


## Where the key comes from

The host half resolves `OPENROUTER_API_KEY` through the harness credential
service first, then the process environment, then
`~/.dsh/.credentials.yaml`; with no key it still lists the provider's models only
when configured — the sync itself is skipped. Nothing plugin-specific to set up
beyond the OpenRouter provider (or an `OPENROUTER_API_KEY` entry in the
credential store / environment layers).

## Versioning

This project follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).
Releases are tagged in git (`v0.1.0` and later `v0.1.x` tags), announced
as GitHub releases and documented in [CHANGELOG.md](./CHANGELOG.md).

`engines.dsh` in `package.json` pins the compatible DSH range.

Bump policy: **patch** — fixes; **minor** — new features without breaking the
configuration; **major** — breaking changes to the configuration, the session
format or the supported DSH range.

`CHANGELOG.md` is generated with [git-cliff](https://git-cliff.org/) from
[Conventional Commits](https://www.conventionalcommits.org/) (`cliff.toml`):

```sh
./scripts/changelog.sh                 # print unreleased notes
./scripts/changelog.sh v0.2.0          # add the next release section
git cliff -o CHANGELOG.md              # full regeneration (curated history is kept otherwise)
```

To install a specific release instead of a moving branch, pin the tag:

```sh
dsh plugin --profile desktop add "git+ssh://git@github.com/bosenok/dsh-openrouter-sync.git#v0.1.0"
```

Tags are created on `master` by Git Flow; integration builds live on `develop`
(install with `#develop` if you want the latest unreleased code).

## Development

`lib/` is built and committed; the sources live in `src/`. Rebuild the client with
the repository's Vite config (`npx vite build` → `dist/`, then the wrapper in
`build/wrapper.js` produces `lib/client.js`).

## License

MIT — see [LICENSE](LICENSE). Third-party code bundled into `lib/` and its
licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
