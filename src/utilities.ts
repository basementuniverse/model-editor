import { circle } from '@basementuniverse/canvas-helpers';
import { intersection2d } from '@basementuniverse/intersection-helpers';
import { vec2, vec3 } from '@basementuniverse/vec';

type Line = intersection2d.Line;
type Point = intersection2d.Point;

export function v32(v: vec3, components: string): vec2 {
  return vec2.fromComponents(vec3.swiz(v, components));
}

export function pointNearLine(
  point: Point,
  line: Line,
  range: number = 5
): boolean {
  return intersection2d.pointOnLine(point, line).distance <= range;
}

export function dot(
  context: CanvasRenderingContext2D,
  position: vec2,
  radius: number = 5,
  colour: string = '#fff'
) {
  circle(context, position, radius, {
    fill: true,
    fillColor: colour,
  });
}

export function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
