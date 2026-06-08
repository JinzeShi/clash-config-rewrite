# Clash Config Rewrite

A small TypeScript tool and management UI for rewriting Clash YAML configs.

## Directory Layout

```text
src/
  main.ts       # rewrite runner
  server.ts     # management UI server
configs/
  config.yaml    # file mapping config
  rewrite.js     # custom rewrite logic
origin/          # source Clash config files
output/          # generated files
public/          # management UI
```

## Config

`configs/config.yaml` controls which files are processed:

```yaml
originDir: origin
outputDir: output
profiles:
  - name: Example
    originFile: Example.yaml
    outputFile: Example_Output.yaml
    rewriteOutputFile: Example_Rewrite.yaml
```

`originFile` is the source filename in `origin/`.
`outputFile` and `rewriteOutputFile` are generated under `output/`.

## Rewrite Logic

Edit `configs/rewrite.js`:

```js
function main(config, profileName) {
  return config;
}
```

`config` is the parsed YAML object. Return the modified config object.

## Profile API

Fetch a profile by filename (only output and rewritten profiles are accessible).

```http
GET /api/profiles?filename={filename}
```

Example:

```http
GET /api/profiles?filename=Example_Output.yaml
```

## Local Usage

Install dependencies:

```bash
npm install
```

Run rewrite once:

```bash
npm start
```

Build TypeScript only:

```bash
npm run build
```

Start the management UI:

```bash
npm run web
```

Open:

```text
http://127.0.0.1:13000
```