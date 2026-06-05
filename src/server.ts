import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  readAppConfig,
  readRawAppConfig,
  readRewriteFile,
  runRewrite,
  type AppConfig,
  type RawAppConfig,
  type RawProfileConfig,
} from './main';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const HOST = '0.0.0.0';
const PORT = 13000;
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const CONFIG_FILE_PATH = path.join(PROJECT_ROOT, 'configs', 'config.yaml');
const REWRITE_FILE_PATH = path.join(PROJECT_ROOT, 'configs', 'rewrite.js');
const FILE_TYPES = ['origin', 'output', 'rewrite'] as const;

type FileType = (typeof FILE_TYPES)[number];

interface ConfigInput {
  profiles?: Partial<RawProfileConfig>[];
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(
  res: ServerResponse,
  statusCode: number,
  content: string | Buffer,
  contentType = 'text/plain; charset=utf-8'
): void {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(content),
  });
  res.end(content);
}

function sendFile(res: ServerResponse, statusCode: number, content: string | Buffer, fileName: string): void {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Disposition': `attachment; filename="${fileName}"; filename*=utf-8''${encodeURIComponent(fileName)}`,
    'profile-update-interval': '24',
    'Content-Length': Buffer.byteLength(content),
  });
  res.end(content);
}

function toCapitalizeCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function assertFileType(value: string | null): FileType {
  if (!FILE_TYPES.includes(value as FileType)) {
    throw new TypeError('Invalid config type.');
  }

  return value as FileType;
}

function writeConfig(input: ConfigInput): void {
  if (!input || !Array.isArray(input.profiles)) {
    throw new TypeError('Config profiles must be an array.');
  }

  const currentConfig = readRawAppConfig();
  const profileNames = new Set<string>();
  const originNames = new Set<string>();
  const nextConfig: RawAppConfig = {
    originDir: currentConfig.originDir,
    outputDir: currentConfig.outputDir,
    profiles: input.profiles.map((profile, index) => {
      const name = String(profile.name || '').trim();
      const originFile = String(profile.originFile || '').trim();
      const outputFile = String(profile.outputFile || '').trim();
      const rewriteOutputFile = String(profile.rewriteOutputFile || '').trim();

      if (!name || !originFile) {
        throw new TypeError(`Profile ${index + 1} is incomplete.`);
      }

      if (profileNames.has(name)) {
        throw new TypeError(`Profile "${name}" is duplicated.`);
      }

      if (originNames.has(originFile)) {
        throw new TypeError(`Origin file "${originFile}" is duplicated.`);
      }

      profileNames.add(name);
      originNames.add(originFile);

      const nextProfile: RawProfileConfig = {
        name,
        originFile,
      };

      if (outputFile) {
        nextProfile.outputFile = outputFile;
      }

      if (rewriteOutputFile) {
        nextProfile.rewriteOutputFile = rewriteOutputFile;
      }

      return nextProfile;
    }),
  };

  fs.writeFileSync(
    CONFIG_FILE_PATH,
    yaml.dump(nextConfig, {
      lineWidth: -1,
      noRefs: true,
    }),
    'utf8'
  );
}

function writeRewrite(content: unknown): void {
  fs.writeFileSync(REWRITE_FILE_PATH, String(content ?? ''), 'utf8');
}

function readProfileFile(profileName: string, fileType: FileType): { name: string; type: FileType; fileName: string; content: string } {
  const appConfig = readAppConfig();
  const profile = appConfig.profiles.find((item) => item.name === profileName);

  if (!profile) {
    throw new TypeError(`Profile "${profileName}" does not exist.`);
  }

  const fileByType: Record<FileType, string> = {
    origin: profile.originFile,
    output: profile.outputFile,
    rewrite: profile.rewriteOutputFile,
  };
  const dirByType: Record<FileType, string> = {
    origin: appConfig.originDir,
    output: appConfig.outputDir,
    rewrite: appConfig.outputDir,
  };
  const fileName = fileByType[fileType];
  const filePath = path.resolve(PROJECT_ROOT, dirByType[fileType], fileName);

  if (!fs.existsSync(filePath)) {
    return {
      name: profile.name,
      type: fileType,
      fileName,
      content: '',
    };
  }

  return {
    name: profile.name,
    type: fileType,
    fileName,
    content: fs.readFileSync(filePath, 'utf8'),
  };
}

function writeProfileFile(profileName: string, fileType: FileType, content: string): void {
  const appConfig = readAppConfig();
  const profile = appConfig.profiles.find((item) => item.name === profileName);

  if (!profile) {
    throw new TypeError(`Profile "${profileName}" does not exist.`);
  }

  if (fileType !== 'origin') {
    throw new TypeError('Only origin files can be edited.');
  }
  
  fs.writeFileSync(path.resolve(PROJECT_ROOT, appConfig.originDir, profile.originFile), content, 'utf8');
}

function findOutputFile(appConfig: AppConfig, outputFileName: string): { name: string; type: FileType } {
  for (const profile of appConfig.profiles) {
    if (profile.outputFile === outputFileName) {
      return { name: profile.name, type: 'output' };
    }

    if (profile.rewriteOutputFile === outputFileName) {
      return { name: profile.name, type: 'rewrite' };
    }
  }
  
  throw new TypeError(`Output file "${outputFileName}" does not exist.`);
}

function getOutputFile(outputFileName: string): { name: string; type: FileType; fileName: string; content: string } {
  const appConfig : AppConfig = readAppConfig();
  const { name, type } = findOutputFile(appConfig, outputFileName);

  const fileName = outputFileName;
  const filePath = path.resolve(PROJECT_ROOT, appConfig.outputDir, fileName);
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';

  return {
    name,
    type,
    fileName,
    content,
  };
}

function getContentType(filePath: string): string {
  const extname = path.extname(filePath);

  if (extname === '.html') return 'text/html; charset=utf-8';
  if (extname === '.css') return 'text/css; charset=utf-8';
  if (extname === '.js') return 'text/javascript; charset=utf-8';

  return 'application/octet-stream';
}

function serveStatic(res: ServerResponse, pathname: string): void {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, 'Not found');
    return;
  }

  sendText(res, 200, fs.readFileSync(filePath), getContentType(filePath));
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {  
  if (req.method === 'GET' && url.pathname === '/api/config') {
    console.log('Config requested.');
    sendJson(res, 200, readRawAppConfig());
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/config') {
    console.log('Config update requested.');
    writeConfig(JSON.parse(await readRequestBody(req)) as ConfigInput);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/rewrite') {
    console.log('Rewrite script requested.');
    sendText(res, 200, readRewriteFile());
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/rewrite') {
    console.log('Rewrite script update requested.');
    const body = JSON.parse(await readRequestBody(req)) as { content?: unknown };
    writeRewrite(body.content);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/file') {
    const name = url.searchParams.get('name') || '';
    const type = assertFileType(url.searchParams.get('type'));
    console.log(`File "${type}" for profile "${name}" requested.`);
    sendJson(res, 200, readProfileFile(name, type));
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/file') {
    const body = JSON.parse(await readRequestBody(req)) as { name?: string; type?: string; content?: string };
    const name = body.name || '';
    const type = assertFileType(body.type || '');
    const content = String(body.content ?? '');
    console.log(`File "${type}" for profile "${name}" saving.`);
    writeProfileFile(name, type, content);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/run') {
    console.log('Rewrite process requested.');
    await runRewrite();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/profiles') {
    const filename = url.searchParams.get('filename') || '';
    if (!filename) {
      console.log('Profile file requested without filename.');
      sendText(res, 404, 'Not found');
      return;
    }
    console.log(`Profile "${filename}" requested.`);
    try {
      const fileData = getOutputFile(filename);
      sendFile(res, 200, fileData.content, toCapitalizeCase(fileData.name) + '_' + toCapitalizeCase(fileData.type) + '.yaml');
    } catch (error: unknown) {
      if (error instanceof TypeError) {
        console.warn('Profile file not found: ', error.message);
        sendText(res, 404, 'Not found');
        return;
      }
      throw error;
    }
    return;
  }

  sendText(res, 404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
  console.log(`API request: ${req.method} ${url.pathname}${url.search}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(res, url.pathname);
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error handling request: ', err);
    sendText(res, 500, 'Internal server error');
  }
  console.log(`API response: ${res.statusCode}`);
});

server.listen(PORT, HOST, () => {
  console.log(`Management UI: http://${HOST}:${PORT}`);
});
