import Camera3d from '@basementuniverse/camera-3d';
import { line } from '@basementuniverse/canvas-helpers';
import Debug, { DebugMarker } from '@basementuniverse/debug';
import { intersection2d } from '@basementuniverse/intersection-helpers';
import { vec2, vec3 } from '@basementuniverse/vec';

const { aabbToRectangle, lineIntersectsRectangle, pointInRectangle } =
  intersection2d;

export default class Grid3d {
  private static readonly GRID_COLOR = '#fff1';
  private static readonly GRID_LINE_WIDTH = 1;
  private static readonly CENTER_AXIS_COLOR = '#fff2';
  private static readonly CENTER_AXIS_LINE_WIDTH = 2;
  private static readonly MARKER_OPTIONS: Partial<DebugMarker> = {
    showMarker: true,
    markerStyle: '+',
    labelOffset: vec2(3),
    showLabel: false,
    backgroundColour: 'transparent',
    font: '10px monospace',
    foregroundColour: '#fff5',
    tags: ['panel-3d'],
  };

  private static clipToScreen(
    a: vec2,
    b: vec2,
    screen: vec2
  ): [vec2, vec2] | [null, null] {
    const aInScreen = pointInRectangle(
      a,
      aabbToRectangle({ position: vec2(), size: screen })
    );
    const bInScreen = pointInRectangle(
      b,
      aabbToRectangle({ position: vec2(), size: screen })
    );

    if (aInScreen && bInScreen) {
      return [a, b];
    }

    const intersections = lineIntersectsRectangle(
      { start: a, end: b },
      aabbToRectangle({ position: vec2(), size: screen })
    );

    if (!intersections.intersects) {
      // Both points are off the screen and the line does not intersect the
      // screen, so we don't need to render this line
      return [null, null];
    }

    if (
      intersections.intersectionPoints &&
      intersections.intersectionPoints.length === 1
    ) {
      // We have one intersection point, so we need to determine which
      // point to keep based on which one is in the screen
      if (aInScreen) {
        return [a, intersections.intersectionPoints[0]];
      } else {
        return [intersections.intersectionPoints[0], b];
      }
    }

    // We have two intersection points, so we can return them directly
    if (
      intersections.intersectionPoints &&
      intersections.intersectionPoints.length === 2
    ) {
      return intersections.intersectionPoints as [vec2, vec2];
    }

    return [null, null];
  }

  public static draw(
    context: CanvasRenderingContext2D,
    camera: Camera3d,
    screen: vec2,
    gridSize: number,
    gridCount: number,
    showLabels: boolean = false,
    labelsGap: number = 0
  ) {
    const halfCount = gridCount / 2;
    const halfGrid = halfCount * gridSize;

    // Draw lines parallel to X (varying Z)
    for (let i = -halfCount; i <= halfCount; i++) {
      const z = i * gridSize;
      const a3 = vec3(-halfGrid, 0, z);
      const b3 = vec3(halfGrid, 0, z);
      let a2 = camera.project(a3, screen);
      let b2 = camera.project(b3, screen);

      if (!a2 || !b2) {
        continue;
      }

      [a2, b2] = this.clipToScreen(a2, b2, screen);

      if (!a2 || !b2) {
        continue;
      }

      const isCenter = Math.abs(z) < gridSize;
      line(context, vec2(a2.x, a2.y), vec2(b2.x, b2.y), {
        strokeColor: isCenter ? Grid3d.CENTER_AXIS_COLOR : Grid3d.GRID_COLOR,
        lineWidth: isCenter
          ? Grid3d.CENTER_AXIS_LINE_WIDTH
          : Grid3d.GRID_LINE_WIDTH,
      });
    }

    // Draw lines parallel to Z (varying X)
    for (let i = -halfCount; i <= halfCount; i++) {
      const x = i * gridSize;
      const a3 = vec3(x, 0, -halfGrid);
      const b3 = vec3(x, 0, halfGrid);
      let a2 = camera.project(a3, screen);
      let b2 = camera.project(b3, screen);

      if (!a2 || !b2) {
        continue;
      }

      [a2, b2] = this.clipToScreen(a2, b2, screen);

      if (!a2 || !b2) {
        continue;
      }

      const isCenter = Math.abs(x) < gridSize;
      line(context, vec2(a2.x, a2.y), vec2(b2.x, b2.y), {
        strokeColor: isCenter ? Grid3d.CENTER_AXIS_COLOR : Grid3d.GRID_COLOR,
        lineWidth: isCenter
          ? Grid3d.CENTER_AXIS_LINE_WIDTH
          : Grid3d.GRID_LINE_WIDTH,
      });
    }

    // Labels
    if (showLabels) {
      const labelsStartX =
        Math.floor(-halfGrid / (gridSize * labelsGap)) * gridSize * labelsGap;
      const labelsStartZ =
        Math.floor(-halfGrid / (gridSize * labelsGap)) * gridSize * labelsGap;
      for (let x = labelsStartX; x <= halfGrid; x += gridSize * labelsGap) {
        for (let z = labelsStartZ; z <= halfGrid; z += gridSize * labelsGap) {
          // If this label is outside of the grid bounds, skip it
          if (Math.abs(x) > halfGrid || Math.abs(z) > halfGrid) {
            continue;
          }

          const p2 = camera.project(vec3(x, 0, z), screen);
          if (!p2) {
            continue;
          }
          Debug.marker(
            `grid-3d-${x}-${z}`,
            `${x},${z}`,
            vec2(p2.x, p2.y),
            Grid3d.MARKER_OPTIONS
          );
        }
      }
    }
  }
}
