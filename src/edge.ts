import Camera3d from '@basementuniverse/camera-3d';
import { line } from '@basementuniverse/canvas-helpers';
import { vec2 } from '@basementuniverse/vec';
import { v4 as uuid } from 'uuid';
import ModelEditor from './model-editor';
import { pointNearLine, v32 } from './utilities';
import Vertex from './vertex';

export default class Edge {
  private static readonly COLOUR = '#fff';
  private static readonly LINE_WIDTH = 1;
  private static readonly HOVER_LINE_WIDTH = 3;
  private static readonly SELECT_LINE_WIDTH = 3;
  private static readonly HOVER_RADIUS = 6;

  public id: string = '';
  public hovered: boolean = false;
  public selected: boolean = false;
  public folder: dat.GUI | null = null;

  constructor(public a: Vertex, public b: Vertex, addFolder: boolean = true) {
    this.id = uuid();

    if (ModelEditor.edgesFolder && addFolder) {
      this.folder = ModelEditor.edgesFolder.addFolder(`Edge ${this.id}`);
      this.folder.add(
        { select: () => ModelEditor.instance?.selectEdge(this, false) },
        'select'
      );
      this.folder.add(
        { delete: () => ModelEditor.instance?.removeEdge(this) },
        'delete'
      );
    }
  }

  public destroy() {
    if (this.folder) {
      ModelEditor.edgesFolder?.removeFolder(this.folder);
    }
  }

  public serialize(): Record<string, any> {
    return {
      id: this.id,
      a: this.a.id,
      b: this.b.id,
    };
  }

  public static deserialize(
    data: Record<string, any>,
    vertices: Map<string, Vertex>
  ): Edge {
    const a = vertices.get(data.a);
    const b = vertices.get(data.b);
    if (!a || !b) {
      throw new Error(`Edge ${data.id} references non-existent vertices.`);
    }
    const edge = new Edge(a, b);
    if (data.id) {
      edge.id = data.id;
    }
    return edge;
  }

  public update(dt: number) {}

  public draw2d(context: CanvasRenderingContext2D, components: string) {
    line(
      context,
      v32(this.a.position, components),
      v32(this.b.position, components),
      {
        strokeColor: Edge.COLOUR,
        lineWidth: this.selected
          ? Edge.SELECT_LINE_WIDTH
          : this.hovered
          ? Edge.HOVER_LINE_WIDTH
          : Edge.LINE_WIDTH,
        lineStyle: this.hovered && !this.selected ? 'dashed' : 'solid',
      }
    );
  }

  public draw3d(
    context: CanvasRenderingContext2D,
    camera: Camera3d,
    screen: vec2
  ) {
    const a3 = camera.project(this.a.position, screen);
    const b3 = camera.project(this.b.position, screen);

    if (!a3 || !b3) {
      return;
    }

    line(context, a3, b3, {
      strokeColor: Edge.COLOUR,
      lineWidth: this.selected
        ? Edge.SELECT_LINE_WIDTH
        : this.hovered
        ? Edge.HOVER_LINE_WIDTH
        : Edge.LINE_WIDTH,
      lineStyle: this.hovered && !this.selected ? 'dashed' : 'solid',
    });
  }

  public isPointNear2d(
    point: vec2,
    components: string,
    range: number = Edge.HOVER_RADIUS
  ): boolean {
    return pointNearLine(
      point,
      {
        start: v32(this.a.position, components),
        end: v32(this.b.position, components),
      },
      range
    );
  }

  public isPointNear3d(
    point: vec2,
    camera: Camera3d,
    screen: vec2,
    range: number = Edge.HOVER_RADIUS
  ): boolean {
    const a3 = camera.project(this.a.position, screen);
    const b3 = camera.project(this.b.position, screen);

    if (!a3 || !b3) {
      return false;
    }

    return pointNearLine(point, { start: a3, end: b3 }, range);
  }
}
