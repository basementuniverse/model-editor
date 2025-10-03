import Camera3d from '@basementuniverse/camera-3d';
import { circle } from '@basementuniverse/canvas-helpers';
import Debug, { DebugMarker } from '@basementuniverse/debug';
import { round } from '@basementuniverse/utils';
import { vec2, vec3 } from '@basementuniverse/vec';
import { v4 as uuid } from 'uuid';
import ModelEditor from './model-editor';
import { dot, v32 } from './utilities';

export default class Vertex {
  private static readonly COLOUR = '#fff';
  private static readonly HIDDEN_COLOUR = '#fff6';
  private static readonly RADIUS = 3;
  private static readonly HOVER_RADIUS = 10;
  private static readonly HOVER_LINE_WIDTH = 2;
  private static readonly MARKER_OPTIONS: Partial<DebugMarker> = {
    showMarker: false,
    showLabel: false,
    backgroundColour: '#fff2',
  };

  public id: string = '';
  public hovered: boolean = false;
  public selected: boolean = false;
  public folder: dat.GUI | null = null;

  // We keep an internal position so we have a consistent object reference
  // for displaying in dat.GUI (otherwise, if/when the position object is
  // replaced, the GUI listener will stop working)
  private readonly internalPosition: vec3 = vec3();

  constructor(
    public position: vec3,
    public hidden: boolean = false,
    addFolder: boolean = true
  ) {
    this.id = uuid();

    if (ModelEditor.verticesFolder && addFolder) {
      this.folder = ModelEditor.verticesFolder.addFolder(`Vertex ${this.id}`);
      this.folder.add(
        { select: () => ModelEditor.instance?.selectVertex(this, false) },
        'select'
      );
      this.folder.add(
        { delete: () => ModelEditor.instance?.removeVertex(this) },
        'delete'
      );
      this.folder
        .add(this.internalPosition, 'x')
        .onChange(value => {
          this.position.x = value;
        })
        .listen();
      this.folder
        .add(this.internalPosition, 'y')
        .onChange(value => {
          this.position.y = value;
        })
        .listen();
      this.folder
        .add(this.internalPosition, 'z')
        .onChange(value => {
          this.position.z = value;
        })
        .listen();
      this.folder
        .add(this, 'hidden')
        .onChange(value => {
          this.hidden = value;
          ModelEditor.instance?.model?.emitChangeEvent(
            'Vertex visibility changed'
          );
        })
        .listen();
    }
  }

  public destroy() {
    if (this.folder) {
      ModelEditor.verticesFolder?.removeFolder(this.folder);
    }
  }

  public serialize(): Record<string, any> {
    return {
      id: this.id,
      position: vec3.components(this.position),
      hidden: this.hidden,
    };
  }

  public static deserialize(data: Record<string, any>): Vertex {
    const vertex = new Vertex(
      vec3.fromComponents(data.position),
      !!data.hidden
    );
    if (data.id) {
      vertex.id = data.id;
    }
    return vertex;
  }

  public update(dt: number) {
    if (!vec3.eq(this.internalPosition, this.position)) {
      this.internalPosition.x = this.position.x;
      this.internalPosition.y = this.position.y;
      this.internalPosition.z = this.position.z;
    }
  }

  public draw2d(
    context: CanvasRenderingContext2D,
    components: string,
    showVertexLabels = false
  ) {
    const p2 = v32(this.position, components);
    dot(
      context,
      p2,
      Vertex.RADIUS,
      this.hidden ? Vertex.HIDDEN_COLOUR : Vertex.COLOUR
    );

    if (showVertexLabels) {
      const tags = { xz: 'panel-top', xY: 'panel-front', ZY: 'panel-side' };
      Debug.marker(
        `${this.id}-${components}`,
        this.hovered || this.selected
          ? `${this.id}\n${vec3.str(vec3.map(this.position, v => round(v, 2)))}`
          : this.id.substring(0, 5),
        p2,
        {
          tags: [tags[components as keyof typeof tags]],
          ...Vertex.MARKER_OPTIONS,
          foregroundColour: this.hidden ? Vertex.HIDDEN_COLOUR : Vertex.COLOUR,
        }
      );
    }

    if (this.hovered || this.selected) {
      circle(context, p2, Vertex.HOVER_RADIUS, {
        strokeColor: Vertex.COLOUR,
        lineWidth: Vertex.HOVER_LINE_WIDTH,
        lineStyle: this.selected ? 'solid' : 'dashed',
      });
    }
  }

  public draw3d(
    context: CanvasRenderingContext2D,
    camera: Camera3d,
    screen: vec2,
    showVertexLabels = false
  ) {
    const projected = camera.project(this.position, screen);

    if (!projected) {
      return;
    }

    dot(
      context,
      projected,
      Vertex.RADIUS,
      this.hidden ? Vertex.HIDDEN_COLOUR : Vertex.COLOUR
    );

    if (showVertexLabels) {
      Debug.marker(
        `${this.id}-3d`,
        this.hovered || this.selected
          ? `${this.id}\n${vec3.str(vec3.map(this.position, v => round(v, 2)))}`
          : this.id.substring(0, 5),
        projected,
        {
          tags: ['panel-3d'],
          ...Vertex.MARKER_OPTIONS,
          foregroundColour: this.hidden ? Vertex.HIDDEN_COLOUR : Vertex.COLOUR,
        }
      );
    }

    if (this.hovered || this.selected) {
      circle(context, projected, Vertex.HOVER_RADIUS, {
        strokeColor: Vertex.COLOUR,
        lineWidth: Vertex.HOVER_LINE_WIDTH,
        lineStyle: this.selected ? 'solid' : 'dashed',
      });
    }
  }

  public isPointNear2d(
    point: vec2,
    components: string,
    radius: number = Vertex.HOVER_RADIUS
  ): boolean {
    return vec2.len(vec2.sub(point, v32(this.position, components))) <= radius;
  }

  public isPointNear3d(
    point: vec2,
    camera: Camera3d,
    screen: vec2,
    radius: number = Vertex.HOVER_RADIUS
  ): boolean {
    const projected = camera.project(this.position, screen);

    if (!projected) {
      return false;
    }

    return vec2.len(vec2.sub(point, projected)) <= radius;
  }
}
