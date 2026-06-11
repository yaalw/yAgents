export class Camera {
  x = 0   // world px at screen origin
  y = 0
  scale = 3
  /** set once the user pans/zooms; the renderer stops auto-fitting after that */
  userMoved = false

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.x + sx / this.scale, y: this.y + sy / this.scale }
  }
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.x) * this.scale, y: (wy - this.y) * this.scale }
  }
  panBy(dxScreen: number, dyScreen: number): void {
    this.userMoved = true
    this.x -= dxScreen / this.scale
    this.y -= dyScreen / this.scale
  }
  /** Multiply the zoom by `factor` (e.g. 1.05 in, 0.95 out) while keeping the world
   *  point under (sx,sy) fixed. Fractional scale gives smooth, fine-grained control;
   *  the renderer samples nearest-neighbour so pixels stay crisp. */
  zoomAt(sx: number, sy: number, factor: number): void {
    this.userMoved = true
    const anchor = this.screenToWorld(sx, sy)
    this.scale = Math.min(8, Math.max(0.3, this.scale * factor))
    this.x = anchor.x - sx / this.scale
    this.y = anchor.y - sy / this.scale
  }
}
