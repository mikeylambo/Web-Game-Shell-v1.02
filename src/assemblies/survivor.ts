import type { FrameAssemblyContext, FrameAssembly } from './types.js';
import { createArcadeAssembly } from './arcade.js';
export function createSurvivorAssembly(context: FrameAssemblyContext): FrameAssembly {
  const arcade = createArcadeAssembly(context);
  const frame: import('../frames/types.js').GenreFrame = {...arcade.frame, id:'survivor', label:'Survivor', modes:[{id:'hunt',label:'The Hunt'},{id:'nightly',label:'Nightly Hunt'}], difficulties:[{id:'crescent',label:'Crescent'}],statKeys:['runs','kills','time','perfects','evolutions'],challengeCategories:['survival','precision','evolution']};
  return { ...arcade, id:'survivor',frame, install(){context.shell.modes.register(frame.modes);context.shell.difficulty.register(frame.difficulties ?? []);} };
}
