// Reads and writes iRacing track.cam files (MACT version 18, little-endian).
// Header 16 bytes, then N cameras x 184 bytes, then u32 group count, then G groups x 16424 bytes.
// Bytes we don't understand are kept exactly as they were.

const CAM = 184, GRP = 16424, SLOTS = 512, NAME = 32;
const dec = new TextDecoder('latin1');
const dv = (r) => new DataView(r.buffer, r.byteOffset, r.byteLength);

function readName(b, off) {
  let e = off;
  while (e < off + NAME && b[e]) e++;
  return dec.decode(b.subarray(off, e));
}

function writeName(b, off, s) {
  if (!s || s.length > NAME - 1 || /[^\x20-\x7e]/.test(s)) throw new Error(`"${s}" must be 1 to 31 plain letters, numbers or spaces`);
  b.fill(0, off, off + NAME);
  for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
}

export function parse(buf) {
  const b = new Uint8Array(buf), v = dv(b);
  if (b.length < 20 || dec.decode(b.subarray(0, 4)) !== 'MACT') throw new Error('Not a track.cam file');
  const ver = v.getUint32(4, true);
  if (ver !== 18) throw new Error(`Unknown track.cam version ${ver}, not touching it`);
  const n = v.getUint32(12, true);
  let o = 16 + n * CAM;
  if (o + 4 > b.length) throw new Error('File is shorter than its camera count says');
  const g = v.getUint32(o, true);
  if (o + 4 + g * GRP > b.length) throw new Error('File is shorter than its group count says');
  const cams = [], groups = [];
  for (let i = 0; i < n; i++) cams.push(b.slice(16 + i * CAM, 16 + (i + 1) * CAM));
  o += 4;
  for (let i = 0; i < g; i++, o += GRP) groups.push(b.slice(o, o + GRP));
  // lenDelta: the header stores file length minus 12; keep whatever offset this file uses
  return { head: b.slice(0, 16), cams, groups, tail: b.slice(o), lenDelta: b.length - v.getUint32(8, true) };
}

export function serialize(t) {
  const len = 16 + t.cams.length * CAM + 4 + t.groups.length * GRP + t.tail.length;
  const b = new Uint8Array(len), v = dv(b);
  b.set(t.head);
  v.setUint32(8, len - t.lenDelta, true);
  v.setUint32(12, t.cams.length, true);
  let o = 16;
  for (const c of t.cams) { b.set(c, o); o += CAM; }
  v.setUint32(o, t.groups.length, true); o += 4;
  for (const g of t.groups) { b.set(g, o); o += GRP; }
  b.set(t.tail, o);
  return b;
}

// Camera fields. x-, behind the car; z, height; yaw and fov in radians (fov is a best guess).
export function camGet(c) {
  const v = dv(c);
  return { name: readName(c, 0), type: v.getUint32(32, true), x: v.getFloat32(52, true), y: v.getFloat32(56, true),
    z: v.getFloat32(60, true), yaw: v.getFloat32(64, true), fov: v.getFloat32(76, true) };
}
const OFF = { x: 52, y: 56, z: 60, yaw: 64, fov: 76 };
export function camSet(c, p) {
  const v = dv(c);
  for (const k in OFF) if (p[k] !== undefined) {
    if (!Number.isFinite(p[k])) throw new Error(`${k} must be a number`);
    v.setFloat32(OFF[k], p[k], true);
  }
}

export function groupGet(g) {
  const n = Math.min(dv(g).getUint32(36, true), SLOTS), cams = [];
  for (let i = 0; i < n; i++) cams.push(readName(g, 40 + i * NAME));
  return { flags: dv(g).getUint32(0, true), name: readName(g, 4), cams };
}
function groupSet(g, name, cams) {
  if (cams.length > SLOTS) throw new Error('Too many cameras in one group');
  writeName(g, 4, name);
  dv(g).setUint32(36, cams.length, true);
  g.fill(0, 40);
  cams.forEach((c, i) => writeName(g, 40 + i * NAME, c));
}

export const findGroup = (t, name) => t.groups.findIndex((g) => readName(g, 4) === name);
export const findCam = (t, name) => t.cams.findIndex((c) => readName(c, 0) === name);
const put = (list, i, rec) => (i < 0 ? list.push(rec) : (list[i] = rec));

// Adds (or replaces) a one-camera chase group, copying the track's first chase cam for the unknown bytes.
export function addGroup(t, name, pos) {
  if (name.length > NAME - 4) throw new Error('Name can be at most 28 characters');
  const tpl = t.cams.find((c) => dv(c).getUint32(32, true) === 3);
  if (!tpl) throw new Error('This track has no chase cam to copy from');
  const cam = tpl.slice(), cn = 'Cam' + name;
  writeName(cam, 0, cn);
  camSet(cam, pos);
  const g = new Uint8Array(GRP);
  groupSet(g, name, [cn]);
  put(t.cams, findCam(t, cn), cam);
  put(t.groups, findGroup(t, name), g);
}

// Copies a group and its cameras from one track to another, replacing any with the same names.
export function copyGroup(src, dst, name) {
  const g = src.groups[findGroup(src, name)];
  if (!g) throw new Error(`No group "${name}"`);
  for (const cn of groupGet(g).cams) {
    const i = findCam(src, cn);
    if (i >= 0) put(dst.cams, findCam(dst, cn), src.cams[i].slice());
  }
  put(dst.groups, findGroup(dst, name), g.slice());
}

// Removes a group, and its cameras unless another group still uses them.
export function removeGroup(t, name) {
  const i = findGroup(t, name);
  if (i < 0) return;
  const [g] = t.groups.splice(i, 1);
  const used = new Set(t.groups.flatMap((x) => groupGet(x).cams));
  for (const cn of groupGet(g).cams) {
    const j = findCam(t, cn);
    if (j >= 0 && !used.has(cn)) t.cams.splice(j, 1);
  }
}
