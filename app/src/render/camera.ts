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
  zoomAt(sx: number, sy: number, dir: 1 | -1): void {
    this.userMoved = true
    const anchor = this.screenToWorld(sx, sy)
    this.scale = Math.min(6, Math.max(1, this.scale + dir))
    this.x = anchor.x - sx / this.scale
    this.y = anchor.y - sy / this.scale
  }
}
