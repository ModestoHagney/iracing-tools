// node --test test/*.test.js [path/to/track.cam]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../cam.js';

const file = process.argv.find((a) => a.endsWith('.cam')) || process.env.TRACK_CAM;

// A tiny made-up file: one chase cam, one group.
function sample() {
  const b = new Uint8Array(16 + 184 + 4 + 16424), v = new DataView(b.buffer);
  b.set([77, 65, 67, 84]); v.setUint32(4, 18, true); v.setUint32(8, b.length - 12, true); v.setUint32(12, 1, true);
  b.set(new TextEncoder().encode('CamChase'), 16); v.setUint32(48, 3, true); v.setFloat32(68, -6, true);
  b[16 + 150] = 99; // an unknown byte that must survive
  v.setUint32(200, 1, true);
  b.set(new TextEncoder().encode('Chase'), 208); v.setUint32(240, 1, true);
  b.set(new TextEncoder().encode('CamChase'), 244);
  return b;
}

test('round trip is byte for byte', () => {
  const b = file ? new Uint8Array(readFileSync(file)) : sample();
  assert.deepEqual(C.serialize(C.parse(b)), b);
});

test('add, copy, edit and remove groups', () => {
  const t = C.parse(sample());
  C.addGroup(t, 'Far Chase', { x: -20, y: 0, z: 5, yaw: 0 });
  const t2 = C.parse(C.serialize(t));
  const cam = C.camGet(t2.cams[C.findCam(t2, 'CamFar Chase')]);
  assert.equal(cam.x, -20); assert.equal(cam.z, 5); assert.equal(cam.type, 3);
  assert.equal(t2.cams[C.findCam(t2, 'CamFar Chase')][150], 99);
  assert.deepEqual(C.groupGet(t2.groups[1]).cams, ['CamFar Chase']);

  C.addGroup(t2, 'Far Chase', { x: -25 }); // same name replaces
  assert.equal(t2.groups.length, 2); assert.equal(t2.cams.length, 2);

  const dst = C.parse(sample());
  C.copyGroup(t2, dst, 'Far Chase');
  assert.equal(C.camGet(dst.cams[1]).x, -25);

  C.removeGroup(dst, 'Far Chase');
  assert.equal(dst.groups.length, 1); assert.equal(dst.cams.length, 1);
  assert.throws(() => C.addGroup(dst, 'x'.repeat(29), {}));
});

test('refuses files that are not track.cam', () => {
  assert.throws(() => C.parse(new Uint8Array(40)));
  const b = sample(); new DataView(b.buffer).setUint32(4, 19, true);
  assert.throws(() => C.parse(b));
});
