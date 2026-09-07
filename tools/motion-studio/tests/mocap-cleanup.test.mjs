import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCleanupReport,
  contactWeight,
  detectFootContacts,
  detectPositionOutliers,
  footLockCorrection,
  solveFloorHeight,
  stabilizeRootPath,
} from '../src/mocap-cleanup.js';

const samples = (positions, dt = 0.05) => positions.map((position, i) => ({ time:i*dt, position }));

test('floor solve uses low stable foot samples rather than average height', () => {
  const left = samples([[0,.01,0],[0,.01,0],[0,.01,0],[0,.4,0]]);
  const right = samples([[0,.02,0],[0,.02,0],[0,.3,0],[0,.3,0]]);
  assert.ok(solveFloorHeight([left,right]) <= .02);
});

test('detectFootContacts finds a planted window', () => {
  const foot = samples([
    [0,.01,0],[0,.01,0],[0,.01,0],[0,.01,0],
    [.1,.1,0],[.2,.2,0],[.3,.1,0]
  ]);
  const result = detectFootContacts(foot,{speedThreshold:.15,heightThreshold:.05,minimumDuration:.1,floorHeight:.01});
  assert.equal(result.windows.length,1);
  assert.ok(result.windows[0].endTime >= .15);
});

test('foot lock correction pulls a planted foot toward its anchor with blended weight', () => {
  const window={startTime:.1,endTime:.3,anchor:[1,0,2]};
  assert.equal(contactWeight(.2,window),1);
  const corrected=footLockCorrection({time:.2,position:[1.2,0,2.1]},[window]);
  assert.equal(corrected.weight,1);
  assert.ok(corrected.correction[0] < 0);
  assert.ok(corrected.correction[2] < 0);
});

test('root outlier detector finds a sudden teleport spike', () => {
  const root=samples([[0,0,0],[.01,0,0],[.02,0,0],[5,0,0],[.04,0,0],[.05,0,0]]);
  const outliers=detectPositionOutliers(root,3);
  assert.ok(outliers.length >= 1);
});

test('root stabilizer reduces horizontal jitter while preserving vertical values', () => {
  const root=samples([[0,0,0],[.3,.2,0],[-.2,.4,0],[.25,.6,0],[0,.8,0]]);
  const stable=stabilizeRootPath(root,{strength:1,radius:1,preserveVertical:true});
  assert.equal(stable[2].position[1],.4);
  assert.ok(Math.abs(stable[2].position[0]) < .2);
});

test('cleanup report combines floor contacts and root diagnostics', () => {
  const foot=samples([[0,.01,0],[0,.01,0],[0,.01,0],[0,.01,0]]);
  const root=samples([[0,1,0],[.01,1,0],[.02,1,0],[0.03,1,0]]);
  const report=buildCleanupReport({leftFoot:foot,rightFoot:foot,root},{minimumDuration:.1,speedThreshold:.2,heightThreshold:.05});
  assert.ok(report.leftContacts.length >= 1);
  assert.ok(report.rightContacts.length >= 1);
  assert.ok(report.recommendations.some(r=>r.includes('foot-lock')));
});
