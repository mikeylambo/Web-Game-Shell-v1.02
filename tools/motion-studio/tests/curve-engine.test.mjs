import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Interpolation,
  createCurveKey,
  createTransformCurves,
  moveCurveKey,
  sampleCurve,
  sampleTransformCurves,
  upsertCurveKey,
} from '../src/curve-engine.js';

test('linear and step interpolation are deterministic', () => {
  const linear = [
    createCurveKey(0, 0, { interpolation: Interpolation.LINEAR }),
    createCurveKey(1, 10),
  ];
  assert.equal(sampleCurve(linear, 0.5), 5);

  const stepped = [
    createCurveKey(0, 3, { interpolation: Interpolation.STEP }),
    createCurveKey(1, 9),
  ];
  assert.equal(sampleCurve(stepped, 0.75), 3);
});

test('bezier/hermite tangents can create anticipation or overshoot', () => {
  const curve = [
    createCurveKey(0, 0, { interpolation: Interpolation.BEZIER, outTangent: 20 }),
    createCurveKey(1, 10, { inTangent: -5 }),
  ];
  const quarter = sampleCurve(curve, 0.25);
  assert.ok(quarter > 2.5);
});

test('upsert and move preserve sorted unique key times', () => {
  let curve = [];
  curve = upsertCurveKey(curve, createCurveKey(1, 10));
  curve = upsertCurveKey(curve, createCurveKey(0, 0));
  curve = upsertCurveKey(curve, createCurveKey(1, 11));
  assert.deepEqual(curve.map(k => [k.time, k.value]), [[0,0],[1,11]]);
  curve = moveCurveKey(curve, 1, 0.5, 7);
  assert.deepEqual(curve.map(k => [k.time, k.value]), [[0,0],[0.5,7]]);
});

test('transform curves support position rotation and scale independently', () => {
  const curves = createTransformCurves();
  curves.position.x = [createCurveKey(0,0), createCurveKey(1,2,{ interpolation:Interpolation.LINEAR })];
  curves.rotation.z = [createCurveKey(0,0), createCurveKey(1,90,{ interpolation:Interpolation.LINEAR })];
  curves.scale.y = [createCurveKey(0,1), createCurveKey(1,1.5,{ interpolation:Interpolation.LINEAR })];
  const sample = sampleTransformCurves(curves, 0.5);
  assert.equal(sample.position[0], 1);
  assert.equal(sample.rotation[2], 45);
  assert.equal(sample.scale[1], 1.25);
});
