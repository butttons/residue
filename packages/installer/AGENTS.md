# @residue/installer

One-click deploy wizard for provisioning a user's own residue worker on Cloudflare. A Cloudflare Worker itself, serving both an API and a step-by-step install/update UI.

The build bundles the worker package's compiled output and migrations into `public/` so the installer can deploy them on behalf of the user. Both build steps (`build:assets` and `build:worker`) must run before dev or deploy.
