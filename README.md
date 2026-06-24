# Clash Config Rewrite

A small Fastify application for managing Clash profile files, fetching subscription profiles, and generating rewritten Clash YAML output through a user-provided JavaScript rewrite function.

The project includes:

- A web UI served from `public/`
- REST APIs under `/api`
- YAML-backed configuration in `configs/`
- Source profiles in `origin/`
- Generated output files in `output/`

## Directory Layout

```text
src/
  app.ts              # application entry point
  router/             # Fastify API routes
  service/            # API service layer
  core/               # config/profile/rewrite/repository logic
  dto/                # API DTO types
  model/              # domain models and Zod schemas
configs/
  app.yaml            # app server and directory config
  profiles.yaml       # profile definitions
  rewrite.js          # custom rewrite function
origin/               # source Clash profile files
output/               # generated output and rewritten files
public/               # static web UI
```

`configs/app.yaml`, `configs/profiles.yaml`, and `configs/rewrite.js` are created automatically with defaults when the app starts if they do not exist.

## Configuration

### `configs/app.yaml`

```yaml
originDir: origin
outputDir: output
host: 0.0.0.0
port: 13000
```

- `originDir`: directory for original profile files.
- `outputDir`: directory for generated files.
- `host`: Fastify listen host.
- `port`: Fastify listen port.

`originDir` and `outputDir` must be different and cannot point to reserved project directories such as `src`, `dist`, `configs`, `public`, `.git`, or `node_modules`.

### `configs/profiles.yaml`

```yaml
- name: Example
  originFile: Example.yaml
  outputFile: Example_Output.yaml
  rewriteOutputFile: Example_Rewrite.yaml
  url: https://example.com/subscription
  userAgent: clash
  updateInterval: 86400
```

Required fields:

- `name`: unique profile name.
- `originFile`: source file name under `originDir`.

Optional fields:

- `outputFile`: generated base output file name under `outputDir`. Defaults to `{Name}_Output.yaml`.
- `rewriteOutputFile`: generated rewritten output file name under `outputDir`. Defaults to `{Name}_Rewrite.yaml`.
- `url`: subscription URL used by the fetch action.
- `userAgent`: optional User-Agent for subscription fetches.
- `updateInterval`: subscription update interval in seconds.

## Rewrite Logic

Edit `configs/rewrite.js`:

```js
function main(config, profileName) {
  return config;
}
```

`config` is the parsed YAML object from the origin profile. `profileName` is the profile's configured name. Return a valid object; it will be written as YAML to the rewrite output file.

When rewrite runs, the app writes:

- `outputFile`: a YAML dump of the original parsed profile object.
- `rewriteOutputFile`: a YAML dump of the object returned by `main(config, profileName)`.

## Local Usage

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Start the app:

```bash
npm start
```

Open the web UI:

```text
http://127.0.0.1:13000
```

The UI supports direct navigation with query parameters, for example:

```text
http://127.0.0.1:13000/?view=files&profile=Example&type=output
```

Supported `view` values are `config`, `rewrite`, and `files`. Supported file `type` values are `origin`, `output`, and `rewrite`.

## Docker

Build and run with Compose:

```bash
docker compose up -d --build
```

The compose file exposes port `13000` and mounts:

```text
./configs -> /app/configs
./origin  -> /app/origin
./output  -> /app/output
```

Open:

```text
http://127.0.0.1:13000
```

## API

### Config

```http
GET /api/config
```

Returns app directory settings:

```json
{
  "originDir": "origin",
  "outputDir": "output"
}
```

### Rewrite

```http
GET /api/rewrite/script
PUT /api/rewrite/script
POST /api/rewrite/run
```

- `GET /script`: returns the current `configs/rewrite.js` content.
- `PUT /script`: replaces `configs/rewrite.js`; request body is a JSON string.
- `POST /run`: rewrites all configured profiles.

### Profiles

```http
GET /api/profile
POST /api/profile
PUT /api/profile/:name
DELETE /api/profile/:name
POST /api/profile/:name/fetch
```

- `GET /api/profile`: lists profiles.
- `POST /api/profile`: creates a profile.
- `PUT /api/profile/:name`: updates a profile. Profile names cannot be changed.
- `DELETE /api/profile/:name`: deletes a profile.
- `POST /api/profile/:name/fetch`: fetches subscription content into the origin file.

Profile request body:

```json
{
  "name": "Example",
  "originFile": "Example.yaml",
  "outputFile": "Example_Output.yaml",
  "rewriteOutputFile": "Example_Rewrite.yaml",
  "url": "https://example.com/subscription",
  "userAgent": "clash",
  "updateInterval": 86400
}
```

### Profile Content

```http
GET /api/profile/:name/content
GET /api/profile/:name/content/:type
PUT /api/profile/:name/content
```

- `GET /content`: returns the origin content for a profile.
- `GET /content/:type`: returns `origin`, `output`, or `rewrite` content.
- `PUT /content`: updates the origin file; request body is a JSON string containing YAML text.

Content response:

```json
{
  "name": "Example",
  "type": "origin",
  "fileName": "Example.yaml",
  "userInfo": {
    "upload": 0,
    "download": 0,
    "total": 0,
    "expire": 0
  },
  "content": "port: 7890\nmode: rule\n"
}
```

### Download By File Name

```http
GET /api/files?filename=Example_Output.yaml
```

Returns a generated output file as an attachment. When available, subscription usage is exposed through the `subscription-userinfo` response header.

## Notes

- The rewrite script is evaluated in a restricted VM context and must define `main(config, profileName)`.
- The app validates profile YAML content before saving or rewriting.
- Generated output files are written under `outputDir`; origin files are read from and saved under `originDir`.
