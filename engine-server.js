// DWG/DXF engine server for Universal File Converter Pro.
// Run: node engine-server.js   (Node 18+, no dependencies)
// Needs ODAFileConverter on PATH (or set ODA_PATH), licensed from the Open Design Alliance.
// DWG -> DXF falls back to LibreDWG's dwg2dxf if ODA fails or is missing.
// On Linux, ODA usually needs a virtual display: xvfb-run node engine-server.js
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { execFile } = require('child_process');
const PORT = process.env.PORT || 8787;
const ODA = process.env.ODA_PATH || 'ODAFileConverter';
const VER = process.env.ACAD_VERSION || 'ACAD2018';
const run = (cmd, args) => new Promise((ok, no) =>
  execFile(cmd, args, { timeout: 120000 }, (e, so, se) => e ? no(new Error(se || e.message)) : ok()));

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const u = new URL(req.url, 'http://x');
  const from = u.searchParams.get('from'), to = u.searchParams.get('to');
  const types = ['dwg', 'dxf'];
  if (req.method !== 'POST' || u.pathname !== '/convert' || !types.includes(from) || !types.includes(to) || from === to) {
    res.writeHead(400); return res.end('Use POST /convert?from=dwg|dxf&to=dxf|dwg');
  }
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 100 * 1048576) { res.writeHead(413); return res.end('File is larger than 100 MB'); }
    chunks.push(c);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ufc-'));
  const inDir = path.join(dir, 'in'), outDir = path.join(dir, 'out');
  fs.mkdirSync(inDir); fs.mkdirSync(outDir);
  try {
    fs.writeFileSync(path.join(inDir, 'file.' + from), Buffer.concat(chunks));
    try {
      // ODAFileConverter <in> <out> <version> <DWG|DXF> <recurse> <audit> <filter>
      await run(ODA, [inDir, outDir, VER, to.toUpperCase(), '0', '1', '*.*']);
      if (!fs.existsSync(path.join(outDir, 'file.' + to))) throw new Error('ODA produced no output');
    } catch (e) {
      if (from === 'dwg' && to === 'dxf') await run('dwg2dxf', ['-o', path.join(outDir, 'file.dxf'), path.join(inDir, 'file.dwg')]);
      else throw e;
    }
    const out = fs.readFileSync(path.join(outDir, 'file.' + to));
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(out);
  } catch (e) {
    res.writeHead(500); res.end(String(e.message).slice(0, 500));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}).listen(PORT, () => console.log('DWG/DXF engine server on http://localhost:' + PORT));
