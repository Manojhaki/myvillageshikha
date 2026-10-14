import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./docs/', import.meta.url));
const port = Number(process.env.PORT || 4174);
const repoBase = '/myvillageshikha';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf'
};

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  let url;
  let pathname;
  try {
    url = new URL(request.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('Invalid URL');
    return;
  }

  if (pathname === repoBase) {
    response.writeHead(308, { Location: repoBase + '/' + url.search }).end();
    return;
  }
  const relative = pathname.startsWith(repoBase + '/')
    ? pathname.slice(repoBase.length + 1)
    : pathname.replace(/^\/+/, '');
  let filename = path.resolve(root, relative);
  const normalizedRoot = path.resolve(root);
  if (filename !== normalizedRoot && !filename.startsWith(normalizedRoot + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(filename);
    if (info.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        response.writeHead(308, { Location: url.pathname + '/' + url.search }).end();
        return;
      }
      filename = path.join(filename, 'index.html');
    }
    const body = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': types[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache'
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500)
      .end(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'Not found' : 'Unable to serve file');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`My Village Shikha: http://127.0.0.1:${port}/`);
  console.log(`GitHub Pages preview: http://127.0.0.1:${port}${repoBase}/`);
});
