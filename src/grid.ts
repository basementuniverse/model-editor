import Camera from '@basementuniverse/camera';
import { line } from '@basementuniverse/canvas-helpers';
import Debug, { DebugMarker } from '@basementuniverse/debug';
import { vec2 } from '@basementuniverse/vec';

export default class Grid {
  private static readonly GRID_COLOUR = '#fff1';
  private static readonly GRID_LINE_WIDTH = 1;
  private static readonly CENTER_AXIS_COLOUR = '#fff2';
  private static readonly CENTER_AXIS_LINE_WIDTH = 2;
  private static readonly MARKER_OPTIONS: Partial<DebugMarker> = {
    showMarker: true,
    markerStyle: '+',
    labelOffset: vec2(3),
    showLabel: false,
    backgroundColour: 'transparent',
    font: '10px monospace',
    foregroundColour: '#fff5',
  };

  public static draw(
    context: CanvasRenderingContext2D,
    camera: Camera,
    gridSize: number,
    showLabels: boolean = false,
    labelsGap: number = 0,
    labelsTag: string = ''
  ) {
    const bounds = camera.bounds;

    const topLeft = vec2.mul(
      vec2.map(vec2.div(vec2(bounds.left, bounds.top), gridSize), Math.floor),
      gridSize
    );
    const bottomRight = vec2.mul(
      vec2.map(
        vec2.div(vec2(bounds.right, bounds.bottom), gridSize),
        Math.ceil
      ),
      gridSize
    );

    // Vertical lines
    for (let x = topLeft.x; x <= bottomRight.x; x += gridSize) {
      const isCenter = Math.abs(x) < gridSize / 2;
      line(context, vec2(x, topLeft.y), vec2(x, bottomRight.y), {
        strokeColor: isCenter ? Grid.CENTER_AXIS_COLOUR : Grid.GRID_COLOUR,
        lineWidth:
          (isCenter ? Grid.CENTER_AXIS_LINE_WIDTH : Grid.GRID_LINE_WIDTH) /
          camera.actualScale,
      });
    }

    // Horizontal lines
    for (let y = topLeft.y; y <= bottomRight.y; y += gridSize) {
      const isCenter = Math.abs(y) < gridSize / 2;
      line(context, vec2(topLeft.x, y), vec2(bottomRight.x, y), {
        strokeColor: isCenter ? Grid.CENTER_AXIS_COLOUR : Grid.GRID_COLOUR,
        lineWidth:
          (isCenter ? Grid.CENTER_AXIS_LINE_WIDTH : Grid.GRID_LINE_WIDTH) /
          camera.actualScale,
      });
    }

    // Labels
    if (showLabels) {
      const labelsStartX =
        Math.floor(topLeft.x / (gridSize * labelsGap)) * gridSize * labelsGap;
      const labelsStartY =
        Math.floor(topLeft.y / (gridSize * labelsGap)) * gridSize * labelsGap;
      for (
        let x = labelsStartX;
        x <= bottomRight.x;
        x += gridSize * labelsGap
      ) {
        for (
          let y = labelsStartY;
          y <= bottomRight.y;
          y += gridSize * labelsGap
        ) {
          Debug.marker(`grid-${labelsTag}-${x}-${y}`, `${x},${y}`, vec2(x, y), {
            tags: [labelsTag],
            ...Grid.MARKER_OPTIONS,
          });
        }
      }
    }
  }
}
