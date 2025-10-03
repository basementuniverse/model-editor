import Camera3d from '@basementuniverse/camera-3d';
import { polygon } from '@basementuniverse/canvas-helpers';
import { intersection2d } from '@basementuniverse/intersection-helpers';
import { vec2 } from '@basementuniverse/vec';
import { v4 as uuid } from 'uuid';
import ModelEditor from './model-editor';
import { v32 } from './utilities';
import Vertex from './vertex';

const { pointInPolygon } = intersection2d;

export default class Surface {
  private static readonly COLOUR = '#fff2';
  private static readonly HOVER_COLOUR = '#fff4';
  private static readonly HOVER_PATTERN_SIZE = 6;
  private static readonly SELECT_COLOUR = '#fff6';

  public id: string = '';
  public hovered: boolean = false;
  public selected: boolean = false;
  public folder: dat.GUI | null = null;

  private static hoverPatternCanvas: HTMLCanvasElement | null = null;
  private static hoverPatternContext: CanvasRenderingContext2D | null = null;

  constructor(public vertices: Vertex[], addFolder: boolean = true) {
    this.id = uuid();

    if (ModelEditor.surfacesFolder && addFolder) {
      this.folder = ModelEditor.surfacesFolder.addFolder(`Surface ${this.id}`);
      this.folder.add(
        { select: () => ModelEditor.instance?.selectSurface(this, false) },
        'select'
      );
      this.folder.add(
        { delete: () => ModelEditor.instance?.removeSurface(this) },
        'delete'
      );
    }

    // Create the hover pattern canvas if it doesn't exist
    if (!Surface.hoverPatternCanvas) {
      Surface.hoverPatternCanvas = document.createElement('canvas');
      Surface.hoverPatternCanvas.width = Surface.HOVER_PATTERN_SIZE;
      Surface.hoverPatternCanvas.height = Surface.HOVER_PATTERN_SIZE;
      Surface.hoverPatternContext = Surface.hoverPatternCanvas.getContext('2d');
      if (Surface.hoverPatternContext) {
        const halfHoverPatternSize = Surface.HOVER_PATTERN_SIZE / 2;
        Surface.hoverPatternContext.fillStyle = Surface.HOVER_COLOUR;
        Surface.hoverPatternContext.fillRect(
          0,
          0,
          halfHoverPatternSize,
          halfHoverPatternSize
        );
        Surface.hoverPatternContext.fillRect(
          halfHoverPatternSize,
          halfHoverPatternSize,
          halfHoverPatternSize,
          halfHoverPatternSize
        );
      }
    }
  }

  public destroy() {
    if (this.folder) {
      ModelEditor.surfacesFolder?.removeFolder(this.folder);
    }
  }

  public serialize(): Record<string, any> {
    return {
      id: this.id,
      vertices: this.vertices.map(v => v.id),
    };
  }

  public static deserialize(
    data: Record<string, any>,
    vertices: Map<string, Vertex>
  ): Surface {
    const surfaceVertices = data.vertices.map((id: string) => {
      const vertex = vertices.get(id);
      if (!vertex) {
        throw new Error(
          `Surface ${data.id} references non-existent vertex ${id}.`
        );
      }
      return vertex;
    });

    const surface = new Surface(surfaceVertices);
    if (data.id) {
      surface.id = data.id;
    }
    return surface;
  }

  public update(dt: number) {}

  public draw2d(context: CanvasRenderingContext2D, components: string) {
    if (this.hovered && !this.selected && Surface.hoverPatternCanvas) {
      context.beginPath();
      polygon(
        context,
        this.vertices.map(v => v32(v.position, components)),
        {
          batch: true,
        }
      );
      context.fillStyle = context.createPattern(
        Surface.hoverPatternCanvas,
        'repeat'
      )!;
      context.fill();
    } else {
      polygon(
        context,
        this.vertices.map(v => v32(v.position, components)),
        {
          stroke: false,
          fill: true,
          fillColor: this.selected ? Surface.SELECT_COLOUR : Surface.COLOUR,
        }
      );
    }
  }

  public draw3d(
    context: CanvasRenderingContext2D,
    camera: Camera3d,
    screen: vec2
  ) {
    const vertices = this.vertices
      .map(v => camera.project(v.position, screen))
      .filter((v): v is vec2 => !!v);

    if (this.hovered && !this.selected && Surface.hoverPatternCanvas) {
      context.beginPath();
      polygon(context, vertices, {
        batch: true,
      });
      context.fillStyle = context.createPattern(
        Surface.hoverPatternCanvas,
        'repeat'
      )!;
      context.fill();
    } else {
      polygon(context, vertices, {
        stroke: false,
        fill: true,
        fillColor: this.selected ? Surface.SELECT_COLOUR : Surface.COLOUR,
      });
    }
  }

  public isPointNear2d(point: vec2, components: string): boolean {
    return (
      pointInPolygon(point, {
        vertices: this.vertices.map(v => v32(v.position, components)),
      })?.intersects || false
    );
  }

  public isPointNear3d(point: vec2, camera: Camera3d, screen: vec2): boolean {
    const projectedVertices = this.vertices
      .map(v => camera.project(v.position, screen))
      .filter((v): v is vec2 => !!v);

    return (
      pointInPolygon(point, {
        vertices: projectedVertices,
      })?.intersects || false
    );
  }
}
