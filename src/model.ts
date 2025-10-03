import Camera3d from '@basementuniverse/camera-3d';
import { vec2, vec3 } from '@basementuniverse/vec';
import Edge from './edge';
import Surface from './surface';
import Vertex from './vertex';

export default class Model extends EventTarget {
  public vertices: Vertex[] = [];
  public edges: Edge[] = [];
  public surfaces: Surface[] = [];

  constructor(public name: string = '') {
    super();
  }

  public destroy() {
    this.vertices.forEach(v => v.destroy());
    this.edges.forEach(e => e.destroy());
    this.surfaces.forEach(s => s.destroy());

    this.vertices = [];
    this.edges = [];
    this.surfaces = [];
  }

  public serialize(): Record<string, any> {
    return {
      name: this.name,
      vertices: this.vertices.map(v => v.serialize()),
      edges: this.edges.map(e => e.serialize()),
      surfaces: this.surfaces.map(s => s.serialize()),
    };
  }

  public static deserialize(data: Record<string, any>): Model {
    const model = new Model(data.name);
    model.vertices = data.vertices.map((v: Record<string, any>) =>
      Vertex.deserialize(v)
    );
    const verticesMap = model.vertices.reduce((map, v) => {
      map.set(v.id, v);
      return map;
    }, new Map<string, Vertex>());
    model.edges = data.edges.map((e: Record<string, any>) =>
      Edge.deserialize(e, verticesMap)
    );
    model.surfaces = data.surfaces.map((s: Record<string, any>) =>
      Surface.deserialize(s, verticesMap)
    );
    return model;
  }

  public emitChangeEvent(action: string = '') {
    this.dispatchEvent(
      new CustomEvent('change', {
        detail: {
          model: this.serialize(),
          action,
        },
      })
    );
  }

  public addVertex(position: vec3): Vertex {
    const vertex = new Vertex(position, false);
    this.vertices.push(vertex);

    // The model has changed, so we emit a change event
    this.emitChangeEvent('Vertex added');
    return vertex;
  }

  public removeVertex(vertex: Vertex) {
    const index = this.vertices.indexOf(vertex);
    if (index !== -1) {
      this.vertices.splice(index, 1);
      vertex.destroy();

      // Remove edges connected to this vertex
      this.edges = this.edges.filter(e => e.a !== vertex && e.b !== vertex);

      // Remove surfaces that contain this vertex
      this.surfaces = this.surfaces.filter(s => !s.vertices.includes(vertex));

      // The model has changed, so we emit a change event
      this.emitChangeEvent('Vertex removed');
    }
  }

  public addEdge(edge: Edge): Edge;
  public addEdge(a: Vertex, b: Vertex): Edge;
  public addEdge(a: Vertex | Edge, b?: Vertex): Edge {
    if (!(a instanceof Edge)) {
      a = new Edge(a, b!);
    }
    this.edges.push(a);

    // The model has changed, so we emit a change event
    this.emitChangeEvent('Edge added');
    return a;
  }

  public removeEdge(edge: Edge) {
    const index = this.edges.indexOf(edge);
    if (index !== -1) {
      this.edges.splice(index, 1);
      edge.destroy();

      // The model has changed, so we emit a change event
      this.emitChangeEvent('Edge removed');
    }
  }

  public addSurface(surface: Surface): Surface;
  public addSurface(vertices: Vertex[]): Surface;
  public addSurface(a: Surface | Vertex[]): Surface {
    if (!(a instanceof Surface)) {
      a = new Surface(a);
    }
    this.surfaces.push(a);

    // The model has changed, so we emit a change event
    this.emitChangeEvent('Surface added');
    return a;
  }

  public removeSurface(surface: Surface) {
    const index = this.surfaces.indexOf(surface);
    if (index !== -1) {
      this.surfaces.splice(index, 1);
      surface.destroy();

      // The model has changed, so we emit a change event
      this.emitChangeEvent('Surface removed');
    }
  }

  public update(dt: number) {
    this.vertices.forEach(v => v.update(dt));
    this.edges.forEach(e => e.update(dt));
    this.surfaces.forEach(s => s.update(dt));
  }

  public drawTop(context: CanvasRenderingContext2D, showVertexLabels = false) {
    this.vertices.forEach(v => v.draw2d(context, 'xz', showVertexLabels));
    this.edges.forEach(e => e.draw2d(context, 'xz'));
    this.surfaces.forEach(s => s.draw2d(context, 'xz'));
  }

  public drawFront(
    context: CanvasRenderingContext2D,
    showVertexLabels = false
  ) {
    this.vertices.forEach(v => v.draw2d(context, 'xY', showVertexLabels));
    this.edges.forEach(e => e.draw2d(context, 'xY'));
    this.surfaces.forEach(s => s.draw2d(context, 'xY'));
  }

  public drawSide(context: CanvasRenderingContext2D, showVertexLabels = false) {
    this.vertices.forEach(v => v.draw2d(context, 'ZY', showVertexLabels));
    this.edges.forEach(e => e.draw2d(context, 'ZY'));
    this.surfaces.forEach(s => s.draw2d(context, 'ZY'));
  }

  public draw3d(
    context: CanvasRenderingContext2D,
    camera: Camera3d,
    screen: vec2,
    showVertexLabels = false
  ) {
    this.vertices.forEach(v =>
      v.draw3d(context, camera, screen, showVertexLabels)
    );
    this.edges.forEach(e => e.draw3d(context, camera, screen));
    this.surfaces.forEach(s => s.draw3d(context, camera, screen));
  }
}
