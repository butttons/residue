# @residue/installer

One-click deploy wizard for provisioning a user's own residue worker on Cloudflare. A Cloudflare Worker itself, serving both an API and a step-by-step install/update UI.

## Build

The build bundles the worker package's compiled output and migrations into `public/` so the installer can deploy them on behalf of the user. The `build:worker` script compiles the worker, copies its bundle, migrations, and static assets. Both build steps must run before dev or deploy.
