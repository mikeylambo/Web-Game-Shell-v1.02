export class EntityPool<T extends { active: boolean }> {
  readonly items: T[];
  constructor(capacity: number, factory: () => T) { this.items = Array.from({length: capacity}, factory); }
  acquire(): T | undefined { for (const item of this.items) if (!item.active) { item.active = true; return item; } }
  clear() { for (const item of this.items) item.active = false; }
  get count() { let n = 0; for (const item of this.items) if (item.active) n++; return n; }
}
export class SpatialHash<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();
  constructor(readonly cellSize = 96) {}
  clear() { for (const cell of this.cells.values()) cell.length = 0; }
  insert(item: T) { const key = this.key(item.x, item.y); let cell = this.cells.get(key); if (!cell) { cell = []; this.cells.set(key, cell); } cell.push(item); }
  query(x: number, y: number, radius: number, visit: (item: T) => void) {
    const minX = Math.floor((x-radius)/this.cellSize), maxX = Math.floor((x+radius)/this.cellSize);
    const minY = Math.floor((y-radius)/this.cellSize), maxY = Math.floor((y+radius)/this.cellSize);
    for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
      const cell = this.cells.get(cy * 100000 + cx); if (cell) for (const item of cell) visit(item);
    }
  }
  private key(x: number, y: number) { return Math.floor(y/this.cellSize)*100000+Math.floor(x/this.cellSize); }
}
export class GridFlowField {
  readonly costs: Int32Array; readonly blocked: Uint8Array; private queue: Int32Array;
  constructor(readonly width: number, readonly height: number, readonly cellSize: number) {
    this.costs = new Int32Array(width*height); this.blocked = new Uint8Array(width*height); this.queue = new Int32Array(width*height);
  }
  rebuild(x: number, y: number) {
    this.costs.fill(2147483647); let head = 0, tail = 0;
    const start = Math.max(0,Math.min(this.height-1,Math.floor(y/this.cellSize)))*this.width+Math.max(0,Math.min(this.width-1,Math.floor(x/this.cellSize)));
    this.queue[tail++] = start; this.costs[start] = 0;
    while (head < tail) { const at = this.queue[head++]!; for (let direction = 0; direction < 4; direction++) { const delta = direction===0?-1:direction===1?1:direction===2?-this.width:this.width;
      const next = at+delta; if(next<0||next>=this.costs.length||this.blocked[next]||this.costs[next]!==2147483647)continue;
      if(Math.abs(delta)===1&&Math.floor(next/this.width)!==Math.floor(at/this.width))continue;
      this.costs[next]=this.costs[at]!+1; this.queue[tail++]=next;
    } }
  }
  direction(x: number, y: number, out: {x: number;y: number}) {
    const cx = Math.floor(x/this.cellSize),cy=Math.floor(y/this.cellSize); const at=cy*this.width+cx;
    let best=at,cost=this.costs[at]??2147483647;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=this.width||ny>=this.height)continue;
      const n=ny*this.width+nx;if(this.costs[n]!<cost&&!this.blocked[n]){best=n;cost=this.costs[n]!;}
    }
    out.x=(best%this.width+.5)*this.cellSize-x;out.y=(Math.floor(best/this.width)+.5)*this.cellSize-y;
  }
}
