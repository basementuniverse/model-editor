import Camera3d from '@basementuniverse/camera-3d';
import {
  line as _line,
  StyleOptions,
  withContext,
} from '@basementuniverse/canvas-helpers';
import Debug, { DebugMarker } from '@basementuniverse/debug';
import { vec2, vec3 } from '@basementuniverse/vec';

export default class Axes {
  private static readonly AXES_LENGTH = 30;
  private static readonly AXES_WIDTH = 2;
  private static readonly X_COLOR = '#f44';
  private static readonly Y_COLOR = '#4f4';
  private static readonly Z_COLOR = '#48f';
  private static readonly MARKER_LENGTH = 35;
  private static readonly MARKER_OPTIONS: Partial<DebugMarker> = {
    showMarker: false,
    labelOffset: vec2(-4, 0),
    backgroundColour: 'transparent',
    tags: ['panel-3d'],
  };

  public static draw(
    context: CanvasRenderingContext2D,
    camera: Camera3d,
    screenSize: vec2
  ) {
    const origin2d = camera.project(vec3(0, 0, 0), screenSize);

    // Project endpoints along each axis
    const x2 = camera.project(vec3(Axes.AXES_LENGTH, 0, 0), screenSize);
    const y2 = camera.project(vec3(0, Axes.AXES_LENGTH, 0), screenSize);
    const z2 = camera.project(vec3(0, 0, Axes.AXES_LENGTH), screenSize);

    if (!origin2d || !x2 || !y2 || !z2) {
      return;
    }

    const line = withContext(context, _line) as (
      start: vec2,
      end: vec2,
      style: Partial<StyleOptions>
    ) => void;
    const style: Partial<StyleOptions> = {
      lineWidth: Axes.AXES_WIDTH,
    };
    line(origin2d, x2, { ...style, strokeColor: Axes.X_COLOR });
    line(origin2d, y2, { ...style, strokeColor: Axes.Y_COLOR });
    line(origin2d, z2, { ...style, strokeColor: Axes.Z_COLOR });

    // Project marker positions along each axis
    const markerX2 = camera.project(vec3(Axes.MARKER_LENGTH, 0, 0), screenSize);
    const markerY2 = camera.project(vec3(0, Axes.MARKER_LENGTH, 0), screenSize);
    const markerZ2 = camera.project(vec3(0, 0, Axes.MARKER_LENGTH), screenSize);

    if (!markerX2 || !markerY2 || !markerZ2) {
      return;
    }

    Debug.marker('x', '', markerX2, {
      foregroundColour: Axes.X_COLOR,
      ...Axes.MARKER_OPTIONS,
    });
    Debug.marker('y', '', markerY2, {
      foregroundColour: Axes.Y_COLOR,
      ...Axes.MARKER_OPTIONS,
    });
    Debug.marker('z', '', markerZ2, {
      foregroundColour: Axes.Z_COLOR,
      ...Axes.MARKER_OPTIONS,
    });
  }
}
