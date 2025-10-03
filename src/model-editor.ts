import Camera, { CameraOptions } from '@basementuniverse/camera';
import Camera3d, { Camera3dOptions } from '@basementuniverse/camera-3d';
import Debug from '@basementuniverse/debug';
import InputManager, { MouseButton } from '@basementuniverse/input-manager';
import {
  intersection3d,
  intersectionUtilities,
} from '@basementuniverse/intersection-helpers';
import { clamp, radians, round } from '@basementuniverse/utils';
import { vec2, vec3 } from '@basementuniverse/vec';
import * as dat from 'dat.gui';
import Axes from './axes';
import Edge from './edge';
import Grid from './grid';
import Grid3d from './grid3d';
import Model from './model';
import Surface from './surface';
import { HistoryEntry, Panel2dInfo } from './types';
import { setsEqual } from './utilities';
import Vertex from './vertex';

const { rayIntersectsPlane, meshCentroid } = intersection3d;
const { vectorAlmostZero } = intersectionUtilities;

export default class ModelEditor {
  private static readonly DEFAULT_CAMERA3D_POSITION = vec3(300, 400, 500);
  private static readonly DEFAULT_CAMERA3D_TARGET = vec3(0, 0, 0);
  private static readonly PANEL_MIN_SIZE = 0.2;

  public static instance: ModelEditor | null = null;

  private lastFrameTime: number;
  private lastFrameCountTime: number;
  private frameRate: number = 0;
  private frameCount: number = 0;

  private canvasTop: HTMLCanvasElement;
  private contextTop: CanvasRenderingContext2D;
  private cameraTop: Camera;

  private canvasFront: HTMLCanvasElement;
  private contextFront: CanvasRenderingContext2D;
  private cameraFront: Camera;

  private canvasSide: HTMLCanvasElement;
  private contextSide: CanvasRenderingContext2D;
  private cameraSide: Camera;

  private canvas3d: HTMLCanvasElement;
  private context3d: CanvasRenderingContext2D;
  private camera3d: Camera3d;

  public tool: string = 'select';
  public options = {
    modelName: '',
    showVertexLabels: true,
    showAxes: true,
    showGrid: true,
    gridSize: 50,
    showGridLabels: true,
    gridLabelsGap: 5,
    showGroundPlane: true,
    groundPlaneSize: 20,
    showGroundPlaneLabels: true,
    groundPlaneLabelsGap: 5,
    zoomSpeed: 0.2,
    moveSpeed: 0.3,
    rotateSpeed: 0.003,
  };

  private cameraOptions: Partial<CameraOptions> = {
    maxScale: 10,
    minScale: 0.1,
    moveEaseAmount: 0.75,
    scaleEaseAmount: 0.75,
  };

  private camera3dOptions: Partial<Camera3dOptions> = {
    fov: Math.PI / 4,
    positionEaseAmount: 0.75,
    targetEaseAmount: 0.75,
  };

  public static gui: dat.GUI;
  public static verticesFolder: dat.GUI | null = null;
  public static edgesFolder: dat.GUI | null = null;
  public static surfacesFolder: dat.GUI | null = null;
  public static historyFolder: dat.GUI | null = null;

  public model: Model | null = null;
  private history: HistoryEntry[] = [];
  private currentHistoryIndex: number = -1;

  private panning: boolean = false;
  private lastPanPosition: vec2 | null = null;
  private lastMousePosition: vec2 = vec2();

  private camera3dYaw: number = 0;
  private camera3dPitch: number = 0;

  private hoveredVertex: Vertex | null = null;
  private hoveredEdge: Edge | null = null;
  private hoveredSurface: Surface | null = null;

  private clickedVertex: Vertex | null = null;
  private selectedVertices: Vertex[] = [];
  private selectedEdges: Edge[] = [];
  private selectedSurfaces: Surface[] = [];

  private draggingVertex: Vertex | null = null;
  private dragStartMouse: vec2 | null = null;
  private dragStartVertexPositions: Map<string, vec3> | null = null;
  private verticesMoved: boolean = false;

  private creatingEdge: Edge | null = null;
  private creatingSurface: Surface | null = null;

  private previousTool: string | null = null;
  private spacebarPanActive: boolean = false;

  private movementConstraintXActive: boolean = false;
  private movementConstraintYActive: boolean = false;
  private movementConstraintZActive: boolean = false;

  private panelContainer: HTMLDivElement | null = null;
  private panelResizeMode: 'vertical' | 'horizontal' | 'center' | null = null;
  private panelVerticalSize: number = 0.5;
  private panelHorizontalSize: number = 0.5;
  private panelResizeHandleVertical: HTMLDivElement | null = null;
  private panelResizeHandleHorizontal: HTMLDivElement | null = null;
  private panelResizeHandleCenter: HTMLDivElement | null = null;

  private undoButton: HTMLButtonElement | null = null;
  private redoButton: HTMLButtonElement | null = null;

  private helpModal: HTMLDialogElement;

  private lastGuiState = {
    vertices: new Set<string>(),
    edges: new Set<string>(),
    surfaces: new Set<string>(),
    historyIndex: -1,
  };

  private tools = {
    /**
     * Scale vertices from their common centroid by a given amount
     */
    scale: () => {
      if (!this.model) {
        console.error('No model loaded');
        return;
      }
      if (this.selectedVertices.length === 0) {
        console.warn('No vertices selected');
        return;
      }
      const scaleString = prompt('Amount to scale by:', '1');
      if (scaleString === null) {
        return;
      }
      const scale = parseFloat(scaleString);
      if (scale === 1) {
        console.warn('Scale factor 1 does nothing');
        return;
      }
      const centroid = meshCentroid({
        vertices: this.selectedVertices.map(v => v.position),
        indices: [],
      });
      for (const vertex of this.selectedVertices) {
        const delta = vec3.sub(vertex.position, centroid);
        vertex.position = vec3.add(centroid, vec3.mul(delta, scale));
      }
      this.model.emitChangeEvent('Vertices scaled');
    },

    /**
     * Rotate vertices around their common centroid by a given amount in the
     * X dimension
     */
    rotateX: () => {
      if (!this.model) {
        console.error('No model loaded');
        return;
      }
      if (this.selectedVertices.length === 0) {
        console.warn('No vertices selected');
        return;
      }
      const thetaString = prompt('Amount to rotate by (in degrees):', '0');
      if (thetaString === null) {
        return;
      }
      const theta = parseFloat(thetaString);
      if (theta === 0) {
        console.warn('Rotating by 0 degrees does nothing');
        return;
      }
      const centroid = meshCentroid({
        vertices: this.selectedVertices.map(v => v.position),
        indices: [],
      });
      for (const vertex of this.selectedVertices) {
        const delta = vec3.sub(vertex.position, centroid);
        vertex.position = vec3.add(centroid, vec3.rotx(delta, radians(theta)));
      }
      this.model.emitChangeEvent('Vertices rotated');
    },

    /**
     * Rotate vertices around their common centroid by a given amount in the
     * Y dimension
     */
    rotateY: () => {
      if (!this.model) {
        console.error('No model loaded');
        return;
      }
      if (this.selectedVertices.length === 0) {
        console.warn('No vertices selected');
        return;
      }
      const thetaString = prompt('Amount to rotate by (in degrees):', '0');
      if (thetaString === null) {
        return;
      }
      const theta = parseFloat(thetaString);
      if (theta === 0) {
        console.warn('Rotating by 0 degrees does nothing');
        return;
      }
      const centroid = meshCentroid({
        vertices: this.selectedVertices.map(v => v.position),
        indices: [],
      });
      for (const vertex of this.selectedVertices) {
        const delta = vec3.sub(vertex.position, centroid);
        vertex.position = vec3.add(centroid, vec3.roty(delta, radians(theta)));
      }
      this.model.emitChangeEvent('Vertices rotated');
    },

    /**
     * Rotate vertices around their common centroid by a given amount in the
     * Z dimension
     */
    rotateZ: () => {
      if (!this.model) {
        console.error('No model loaded');
        return;
      }
      if (this.selectedVertices.length === 0) {
        console.warn('No vertices selected');
        return;
      }
      const thetaString = prompt('Amount to rotate by (in degrees):', '0');
      if (thetaString === null) {
        return;
      }
      const theta = parseFloat(thetaString);
      if (theta === 0) {
        console.warn('Rotating by 0 degrees does nothing');
        return;
      }
      const centroid = meshCentroid({
        vertices: this.selectedVertices.map(v => v.position),
        indices: [],
      });
      for (const vertex of this.selectedVertices) {
        const delta = vec3.sub(vertex.position, centroid);
        vertex.position = vec3.add(centroid, vec3.rotz(delta, radians(theta)));
      }
      this.model.emitChangeEvent('Vertices rotated');
    },
  };

  public constructor() {
    ModelEditor.instance = this;

    // Initialise canvases
    this.canvasTop = document.getElementById('canvas-top') as HTMLCanvasElement;
    this.contextTop = this.canvasTop.getContext(
      '2d'
    ) as CanvasRenderingContext2D;
    this.canvasFront = document.getElementById(
      'canvas-front'
    ) as HTMLCanvasElement;
    this.contextFront = this.canvasFront.getContext(
      '2d'
    ) as CanvasRenderingContext2D;
    this.canvasSide = document.getElementById(
      'canvas-side'
    ) as HTMLCanvasElement;
    this.contextSide = this.canvasSide.getContext(
      '2d'
    ) as CanvasRenderingContext2D;
    this.canvas3d = document.getElementById('canvas-3d') as HTMLCanvasElement;
    this.context3d = this.canvas3d.getContext('2d') as CanvasRenderingContext2D;

    // Handle window resize
    window.addEventListener('resize', () => {
      this.resizePanels();
      this.resizeCanvases();
    });
    this.resizeCanvases();

    // Initialise toolbar event handlers
    document.querySelectorAll('.toolbar button').forEach(button => {
      button.addEventListener('click', event => {
        const target = event.currentTarget as HTMLButtonElement;
        if (target.dataset.selectable === 'true') {
          this.setTool(target.dataset.tool!);
        } else {
          switch (target.dataset.tool) {
            case 'reset':
              this.reset();
              break;
            case 'import':
              this.import();
              break;
            case 'export':
              this.export();
              break;
            case 'undo':
              this.undo();
              break;
            case 'redo':
              this.redo();
              break;
          }
        }
      });
    });
    this.undoButton = document.querySelector('#btn-undo') as HTMLButtonElement;
    this.redoButton = document.querySelector('#btn-redo') as HTMLButtonElement;

    // Reset camera button event handlers
    document.querySelectorAll('.reset-camera-btn').forEach(button => {
      button.addEventListener('click', event => {
        const panel = (event.currentTarget as HTMLButtonElement).dataset.panel;
        this.resetCamera(panel);
      });
    });

    // Movement constraint button event handlers
    document.querySelectorAll('.movement-constraint-btn').forEach(button => {
      button.addEventListener('click', () => {
        this.updateMovementConstraints(
          (button as HTMLButtonElement).dataset.axis as 'x' | 'y' | 'z'
        );
      });
    });

    // Panel resize handle event handlers
    this.panelContainer = document.querySelector('.panel-container');
    this.panelResizeHandleVertical = document.querySelector(
      '.resize-handle-vertical'
    ) as HTMLDivElement;
    this.panelResizeHandleHorizontal = document.querySelector(
      '.resize-handle-horizontal'
    ) as HTMLDivElement;
    this.panelResizeHandleCenter = document.querySelector(
      '.resize-handle-center'
    ) as HTMLDivElement;
    document.querySelectorAll('.resize-handle').forEach(handle => {
      // Start resizing panels on mouse down
      handle.addEventListener('mousedown', () => {
        switch ((handle as HTMLDivElement).dataset.mode) {
          case 'vertical':
            this.panelResizeMode = 'vertical';
            this.panelResizeHandleVertical?.classList.add('active');
            break;
          case 'horizontal':
            this.panelResizeMode = 'horizontal';
            this.panelResizeHandleHorizontal?.classList.add('active');
            break;
          case 'center':
            this.panelResizeMode = 'center';
            this.panelResizeHandleCenter?.classList.add('active');
            break;
        }
      });

      // Reset panel sizes on double-click
      handle.addEventListener('dblclick', () => {
        this.panelResizeMode = null;
        this.panelResizeHandleVertical?.classList.remove('active');
        this.panelResizeHandleHorizontal?.classList.remove('active');
        this.panelResizeHandleCenter?.classList.remove('active');
        this.panelVerticalSize = 0.5;
        this.panelHorizontalSize = 0.5;
        this.resizePanels();
      });
    });

    // Handle panel resize when dragging with the mouse
    this.panelContainer?.addEventListener('mousemove', (e: MouseEvent) => {
      switch (this.panelResizeMode) {
        case 'vertical':
          this.calculatePanelSizes(e.clientX, null);
          break;
        case 'horizontal':
          this.calculatePanelSizes(null, e.clientY - 40);
          break;
        case 'center':
          this.calculatePanelSizes(e.clientX, e.clientY - 40);
          break;
      }

      this.resizePanels();
      this.resizeCanvases();
    });

    // Finish resizing panels on mouse up
    window.addEventListener('mouseup', () => {
      this.panelResizeMode = null;
      this.panelResizeHandleVertical?.classList.remove('active');
      this.panelResizeHandleHorizontal?.classList.remove('active');
      this.panelResizeHandleCenter?.classList.remove('active');
    });

    // Initialise subsystems
    Debug.initialise();
    InputManager.initialise();
    this.cameraTop = new Camera(vec2(), this.cameraOptions);
    this.cameraFront = new Camera(vec2(), this.cameraOptions);
    this.cameraSide = new Camera(vec2(), this.cameraOptions);
    this.camera3d = new Camera3d(
      ModelEditor.DEFAULT_CAMERA3D_POSITION,
      ModelEditor.DEFAULT_CAMERA3D_TARGET,
      this.camera3dOptions
    );
    this.initialiseCameraYawAndPitch();

    // Initialise GUI
    ModelEditor.gui = new dat.GUI({ width: 400, closed: true });
    ModelEditor.gui
      .add(this.options, 'modelName')
      .name('Model name')
      .onFinishChange((name: string) => {
        if (this.model) {
          this.model.name = name;
          this.model.emitChangeEvent('Model name changed');
        }
      })
      .listen();
    ModelEditor.gui
      .add(this.options, 'showVertexLabels')
      .name('Show vertex labels');
    ModelEditor.gui.add(this.options, 'showAxes').name('Show 3d axes');

    const toolsFolder = ModelEditor.gui.addFolder('Tools');
    toolsFolder.add(this.tools, 'scale').name('Scale');
    toolsFolder.add(this.tools, 'rotateX').name('Rotate X');
    toolsFolder.add(this.tools, 'rotateY').name('Rotate Y');
    toolsFolder.add(this.tools, 'rotateZ').name('Rotate Z');

    const gridFolder = ModelEditor.gui.addFolder('2D Grids');
    gridFolder.add(this.options, 'showGrid').name('Show 2d grids');
    gridFolder.add(this.options, 'gridSize', 1, 100, 1).name('Grid size');
    gridFolder.add(this.options, 'showGridLabels').name('Show grid labels');
    gridFolder
      .add(this.options, 'gridLabelsGap', 1, 10, 1)
      .name('Grid labels gap');

    const groundPlaneFolder = ModelEditor.gui.addFolder('3D Ground Plane');
    groundPlaneFolder
      .add(this.options, 'showGroundPlane')
      .name('Show 3d ground plane');
    groundPlaneFolder
      .add(this.options, 'groundPlaneSize', 2, 100, 2)
      .name('Ground plane size');
    groundPlaneFolder
      .add(this.options, 'showGroundPlaneLabels')
      .name('Show ground plane labels');
    groundPlaneFolder
      .add(this.options, 'groundPlaneLabelsGap', 1, 10, 1)
      .name('Ground plane labels gap');

    const cameraFolder = ModelEditor.gui.addFolder('Camera');
    cameraFolder
      .add(this.camera3d, 'fov', Math.PI / 8, Math.PI / 2, 0.01)
      .name('3D camera FOV');
    cameraFolder
      .add(this.options, 'zoomSpeed', 0.1, 10, 0.01)
      .name('Zoom speed');
    cameraFolder
      .add(this.options, 'moveSpeed', 0.1, 10, 0.01)
      .name('Move speed');
    cameraFolder
      .add(this.options, 'rotateSpeed', 0.0001, 0.01)
      .name('Rotate speed');

    ModelEditor.verticesFolder = ModelEditor.gui.addFolder('Vertices');
    ModelEditor.edgesFolder = ModelEditor.gui.addFolder('Edges');
    ModelEditor.surfacesFolder = ModelEditor.gui.addFolder('Surfaces');
    ModelEditor.historyFolder = ModelEditor.gui.addFolder('History');

    // Initialise the model and UI
    this.reset();

    // Initialise help modal
    this.helpModal = document.getElementById('help-modal') as HTMLDialogElement;
    const helpButton = document.getElementById('btn-help');
    const closeButton = this.helpModal.querySelector('.close-btn');

    helpButton?.addEventListener('click', () => {
      this.helpModal.showModal();
    });

    closeButton?.addEventListener('click', () => {
      this.helpModal.close();
    });

    this.helpModal.addEventListener('click', event => {
      const rect = this.helpModal.getBoundingClientRect();
      const isInDialog =
        rect.top <= event.clientY &&
        event.clientY <= rect.bottom &&
        rect.left <= event.clientX &&
        event.clientX <= rect.right;
      if (!isInDialog) {
        this.helpModal.close();
      }
    });

    // Start render loop
    this.lastFrameTime = this.lastFrameCountTime = performance.now();
    this.loop();
  }

  private resizeCanvases() {
    this.canvasTop.width = this.canvasTop.clientWidth;
    this.canvasTop.height = this.canvasTop.clientHeight;
    this.canvasFront.width = this.canvasFront.clientWidth;
    this.canvasFront.height = this.canvasFront.clientHeight;
    this.canvasSide.width = this.canvasSide.clientWidth;
    this.canvasSide.height = this.canvasSide.clientHeight;
    this.canvas3d.width = this.canvas3d.clientWidth;
    this.canvas3d.height = this.canvas3d.clientHeight;
  }

  private calculatePanelSizes(x: number | null, y: number | null) {
    if (!this.panelContainer) {
      return;
    }
    if (x !== null) {
      const clampedX = clamp(
        x - 2,
        this.panelContainer.clientWidth * ModelEditor.PANEL_MIN_SIZE,
        this.panelContainer.clientWidth * (1 - ModelEditor.PANEL_MIN_SIZE)
      );
      this.panelHorizontalSize = round(
        clampedX / this.panelContainer.clientWidth,
        2
      );
    }
    if (y !== null) {
      const clampedY = clamp(
        y - 2,
        this.panelContainer.clientHeight * ModelEditor.PANEL_MIN_SIZE,
        this.panelContainer.clientHeight * (1 - ModelEditor.PANEL_MIN_SIZE)
      );
      this.panelVerticalSize = round(
        clampedY / this.panelContainer.clientHeight,
        2
      );
    }
  }

  private resizePanels() {
    if (!this.panelContainer) {
      return;
    }

    // Set panel container grid template styles to resize panels
    this.panelContainer.style.gridTemplateColumns = `${
      this.panelHorizontalSize
    }fr ${1 - this.panelHorizontalSize}fr`;
    this.panelContainer.style.gridTemplateRows = `${this.panelVerticalSize}fr ${
      1 - this.panelVerticalSize
    }fr`;

    // Re-position the panel resize handles
    const resizeHandleX =
      this.panelHorizontalSize * this.panelContainer.clientWidth;
    const resizeHandleY =
      this.panelVerticalSize * this.panelContainer.clientHeight;
    if (this.panelResizeHandleVertical) {
      this.panelResizeHandleVertical.style.left = `${resizeHandleX - 2}px`;
    }
    if (this.panelResizeHandleHorizontal) {
      this.panelResizeHandleHorizontal.style.top = `${resizeHandleY - 2}px`;
    }
    if (this.panelResizeHandleCenter) {
      this.panelResizeHandleCenter.style.left = `${resizeHandleX - 6}px`;
      this.panelResizeHandleCenter.style.top = `${resizeHandleY - 6}px`;
    }
  }

  private reset() {
    if (
      this.model &&
      !confirm('Are you sure you want to reset? This will clear undo history.')
    ) {
      return;
    }

    // Reset cameras to default positions and scales
    this.resetCamera('top');
    this.resetCamera('front');
    this.resetCamera('side');
    this.resetCamera('3d');

    // Clear the current model and create a new one
    if (this.model) {
      this.model.removeEventListener('change', this.modelChanged.bind(this));
      this.model.destroy();
      this.model = null;
    }
    this.model = new Model();
    this.options.modelName = '';
    this.model.addEventListener('change', this.modelChanged.bind(this));

    // Reset tool, hover, and selection states
    this.tool = 'select';
    this.hoveredVertex = null;
    if (this.selectedVertices.length > 0) {
      this.selectedVertices.forEach(v => (v.selected = false));
      this.selectedVertices = [];
    }
    if (this.selectedEdges.length > 0) {
      this.selectedEdges.forEach(e => (e.selected = false));
      this.selectedEdges = [];
    }
    if (this.selectedSurfaces.length > 0) {
      this.selectedSurfaces.forEach(s => (s.selected = false));
      this.selectedSurfaces = [];
    }
    this.draggingVertex = null;
    this.dragStartMouse = null;
    this.dragStartVertexPositions = null;
    this.panning = false;
    this.lastPanPosition = null;
    this.lastMousePosition = vec2();

    // Reset edges and surfaces being created
    if (this.creatingEdge) {
      this.creatingEdge.destroy();
      this.creatingEdge = null;
    }
    if (this.creatingSurface) {
      this.creatingSurface.destroy();
      this.creatingSurface = null;
    }

    // Clear history
    if (ModelEditor.historyFolder) {
      ModelEditor.historyFolder.__controllers.forEach(controller =>
        controller.remove()
      );
    }
    this.history = [];
    this.currentHistoryIndex = -1;
    this.updateUndoRedoButtons();
  }

  private setTool(tool: string) {
    this.tool = tool;
    const toolbarButtons = document.querySelectorAll('.toolbar button');
    toolbarButtons.forEach((button: HTMLButtonElement) => {
      if (button.dataset.tool === tool) {
        button.classList.add('selected');
      } else {
        button.classList.remove('selected');
      }
    });

    // Update panel container class based on selected tool
    if (this.panelContainer) {
      this.panelContainer.classList.forEach(c => {
        if (c.startsWith('tool-')) {
          this.panelContainer!.classList.remove(c);
        }
      });
      this.panelContainer.classList.add(`tool-${this.tool}`);
    }
  }

  private import() {
    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    // Handle file selection
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target?.result as string);

          // Clear the existing model if one exists
          if (this.model) {
            this.model.removeEventListener(
              'change',
              this.modelChanged.bind(this)
            );
            this.model.destroy();
            this.model = null;
          }
          this.model = Model.deserialize(data);

          // If a model successfully imported, set up the model
          if (this.model) {
            this.model.addEventListener('change', this.modelChanged.bind(this));
            this.options.modelName = this.model.name || '';
            this.clearHistoryEntries();
            this.addHistoryEntry('Model imported', this.model.serialize());
            console.log('Model imported successfully');
          }
        } catch (err) {
          console.error('Error importing model:', err);
        }
      };
      reader.readAsText(file);
    });

    // Trigger file selection dialog
    input.click();
  }

  private export() {
    if (!this.model) {
      console.error('No model to export');
      return;
    }

    // Make sure model name is up to date before export
    this.model.name = this.options.modelName;

    // Serialize the model and create a Blob
    const data = JSON.stringify(this.model.serialize(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });

    // Create a download URL and link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.model.name || 'model'}.json`;

    // Trigger download and cleanup
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private undo() {
    if (this.currentHistoryIndex <= 0) {
      console.warn('No more history to undo');
      return;
    }

    // Jump to the previous history entry
    this.currentHistoryIndex--;
    this.jumpToHistoryEntry(this.currentHistoryIndex);
    this.updateUndoRedoButtons();
    console.log('Undo last action:', this.history[this.currentHistoryIndex]);
  }

  private redo() {
    if (this.currentHistoryIndex >= this.history.length - 1) {
      console.warn('No more history to redo');
      return;
    }

    // Jump to the next history entry
    this.currentHistoryIndex++;
    this.jumpToHistoryEntry(this.currentHistoryIndex);
    this.updateUndoRedoButtons();
    console.log('Redo last action:', this.history[this.currentHistoryIndex]);
  }

  private modelChanged(e: CustomEvent) {
    const { action, model } = e.detail;
    if (action) {
      this.addHistoryEntry(action, model);
    }
  }

  private jumpToHistoryEntry(index: number) {
    if (index < 0 || index >= this.history.length) {
      console.warn('Invalid history index:', index);
      return;
    }

    // Clear current model and load the model from the history entry
    if (this.model) {
      this.model.removeEventListener('change', this.modelChanged.bind(this));
      this.model.destroy();
      this.model = null;
    }
    const entry = this.history[index];
    this.model = Model.deserialize(entry.model);
    this.options.modelName = this.model.name || '';
    this.model.addEventListener('change', this.modelChanged.bind(this));

    // Update current history index
    this.currentHistoryIndex = index;

    // Update button states
    this.updateUndoRedoButtons();
  }

  private addHistoryEntry(action: string, model: Record<string, any>) {
    let index: number = -1;

    // If we're not at the end of the history, clear future entries
    if (this.currentHistoryIndex < this.history.length - 1) {
      this.clearHistoryEntries(this.currentHistoryIndex + 1);
    }
    index = this.history.length;

    // Create GUI button
    const date = new Date().toISOString();
    let controller: dat.GUIController | undefined = undefined;
    if (ModelEditor.historyFolder) {
      controller = ModelEditor.historyFolder
        .add({ jump: () => this.jumpToHistoryEntry(index) }, 'jump')
        .name(`${date} - ${action}`);
    }
    const entry: HistoryEntry = {
      action,
      model,
      date,
      controller,
    };
    this.history.push(entry);
    this.currentHistoryIndex = index;
    this.updateUndoRedoButtons();
  }

  private clearHistoryEntries(from?: number) {
    from = from ?? 0;
    if (from < 0 || from >= this.history.length) {
      return;
    }

    // Remove all history entries from the specified index
    for (let i = from; i < this.history.length; i++) {
      const entry = this.history[i];
      if (entry.controller && ModelEditor.historyFolder) {
        ModelEditor.historyFolder.remove(entry.controller);
      }
    }
    this.history.splice(from, this.history.length - from);
    this.updateUndoRedoButtons();
  }

  private updateUndoRedoButtons() {
    if (this.undoButton) {
      this.undoButton.disabled = this.currentHistoryIndex <= 0;
    }
    if (this.redoButton) {
      this.redoButton.disabled =
        this.currentHistoryIndex >= this.history.length - 1;
    }
  }

  private resetCamera(panel: string | undefined) {
    switch (panel) {
      case 'top':
        this.cameraTop.position = vec2(0, 0);
        this.cameraTop.scale = 1;
        break;
      case 'front':
        this.cameraFront.position = vec2(0, 0);
        this.cameraFront.scale = 1;
        break;
      case 'side':
        this.cameraSide.position = vec2(0, 0);
        this.cameraSide.scale = 1;
        break;
      case '3d':
        this.camera3d.position = ModelEditor.DEFAULT_CAMERA3D_POSITION;
        this.camera3d.target = ModelEditor.DEFAULT_CAMERA3D_TARGET;
        this.initialiseCameraYawAndPitch();
        break;
    }
  }

  private updateMovementConstraints(axis: 'x' | 'y' | 'z' | null) {
    document.querySelectorAll('.movement-constraint-btn').forEach(button => {
      (button as HTMLButtonElement).classList.remove('active');
    });
    const movementConstraintButtonX = document.querySelector(
      '.movement-constraint-btn-x'
    ) as HTMLButtonElement;
    const movementConstraintButtonY = document.querySelector(
      '.movement-constraint-btn-y'
    ) as HTMLButtonElement;
    const movementConstraintButtonZ = document.querySelector(
      '.movement-constraint-btn-z'
    ) as HTMLButtonElement;

    switch (axis) {
      case 'x':
        this.movementConstraintXActive = !this.movementConstraintXActive;
        this.movementConstraintYActive = false;
        this.movementConstraintZActive = false;
        movementConstraintButtonX.classList.toggle(
          'active',
          this.movementConstraintXActive
        );
        break;
      case 'y':
        this.movementConstraintXActive = false;
        this.movementConstraintYActive = !this.movementConstraintYActive;
        this.movementConstraintZActive = false;
        movementConstraintButtonY.classList.toggle(
          'active',
          this.movementConstraintYActive
        );
        break;
      case 'z':
        this.movementConstraintXActive = false;
        this.movementConstraintYActive = false;
        this.movementConstraintZActive = !this.movementConstraintZActive;
        movementConstraintButtonZ.classList.toggle(
          'active',
          this.movementConstraintZActive
        );
        break;
      default:
        this.movementConstraintXActive = false;
        this.movementConstraintYActive = false;
        this.movementConstraintZActive = false;
        break;
    }
  }

  private initialiseCameraYawAndPitch() {
    const forward = vec3.nor(
      vec3.sub(this.camera3d.target, this.camera3d.position)
    );

    const polar = vec3.polar(forward);
    this.camera3dYaw = polar.phi;
    this.camera3dPitch = Math.PI / 2 - polar.theta;
  }

  private loop() {
    const now = performance.now();
    const elapsedTime = now - this.lastFrameTime;

    // Calculate framerate
    if (now - this.lastFrameCountTime >= 1000) {
      this.lastFrameCountTime = now;
      this.frameRate = this.frameCount;
      this.frameCount = 0;
    }
    this.frameCount++;
    this.lastFrameTime = now;
    Debug.value('FPS', this.frameRate, { align: 'right', tags: ['panel-3d'] });

    // Do game loop
    this.update(elapsedTime);
    this.draw();
    window.requestAnimationFrame(this.loop.bind(this));
  }

  private update(dt: number) {
    const hoveredElement = InputManager.hoveredElement?.id ?? '';

    // Auto-pan tool: when holding the spacebar, switch to pan tool
    if (InputManager.keyPressed('Space') && this.tool !== 'pan') {
      this.previousTool = this.tool;
      this.setTool('pan');
      this.spacebarPanActive = true;
    }
    if (InputManager.keyReleased('Space') && this.spacebarPanActive) {
      if (this.previousTool && this.tool === 'pan') {
        this.setTool(this.previousTool);
      }
      this.spacebarPanActive = false;
      this.previousTool = null;
    }

    // Movement constraint keys
    if (InputManager.keyPressed('KeyX')) {
      this.updateMovementConstraints('x');
    }
    if (InputManager.keyPressed('KeyY')) {
      this.updateMovementConstraints('y');
    }
    if (InputManager.keyPressed('KeyZ')) {
      this.updateMovementConstraints('z');
    }
    if (InputManager.keyReleased('KeyX')) {
      this.updateMovementConstraints(null);
    }
    if (InputManager.keyReleased('KeyY')) {
      this.updateMovementConstraints(null);
    }
    if (InputManager.keyReleased('KeyZ')) {
      this.updateMovementConstraints(null);
    }

    // Clear all hovered states
    if (this.model) {
      this.model.vertices.forEach(v => (v.hovered = false));
      this.model.edges.forEach(e => (e.hovered = false));
      this.model.surfaces.forEach(s => (s.hovered = false));
    }
    this.hoveredVertex = null;
    this.hoveredEdge = null;
    this.hoveredSurface = null;

    // Hover logic 2d: find topmost object under mouse in active 2d panel
    if (
      this.model &&
      ['select', 'create-edge', 'create-surface'].includes(this.tool) &&
      ['canvas-top', 'canvas-front', 'canvas-side'].includes(hoveredElement)
    ) {
      // Convert mouse to world space for the panel
      const { camera, components } = this.getPanel2dInfo(hoveredElement) ?? {};
      const mouseWorld = camera!.screenToWorld(InputManager.mousePosition);

      // Find all vertices under mouse
      const hoveredVertices = this.model.vertices.filter(v =>
        v.isPointNear2d(mouseWorld, components!)
      );
      if (hoveredVertices.length > 0) {
        // Make sure we only hover the topmost vertex
        switch (hoveredElement) {
          case 'canvas-top':
            hoveredVertices.sort((a, b) => a.position.y - b.position.y);
            break;
          case 'canvas-front':
            hoveredVertices.sort((a, b) => a.position.z - b.position.z);
            break;
          case 'canvas-side':
            hoveredVertices.sort((a, b) => a.position.x - b.position.x);
            break;
        }
        this.hoveredVertex = hoveredVertices[hoveredVertices.length - 1];
        this.hoveredVertex.hovered = true;
      }

      // If no vertex is hovered, find all edges under mouse
      // (edges can only be hovered in "select" mode)
      if (this.tool === 'select' && !this.hoveredVertex) {
        const hoveredEdges = this.model.edges
          .filter(e => e.isPointNear2d(mouseWorld, components!))
          .map(e => ({
            edge: e,

            // We can skip dividing by 2 here since we're only interested in
            // the relative values for sorting
            avg: vec3(
              e.a.position.x + e.b.position.x,
              e.a.position.y + e.b.position.y,
              e.a.position.z + e.b.position.z
            ),
          }));
        if (hoveredEdges.length > 0) {
          // Make sure we only hover the topmost edge
          // This is based on the average of the start and end vertex positions
          switch (hoveredElement) {
            case 'canvas-top':
              hoveredEdges.sort((a, b) => a.avg.y - b.avg.y);
              break;
            case 'canvas-front':
              hoveredEdges.sort((a, b) => a.avg.z - b.avg.z);
              break;
            case 'canvas-side':
              hoveredEdges.sort((a, b) => a.avg.x - b.avg.x);
              break;
          }
          this.hoveredEdge = hoveredEdges[hoveredEdges.length - 1].edge;
          this.hoveredEdge.hovered = true;
        }
      }

      // If no vertex or edge is hovered, find all surfaces under mouse
      // (surfaces can only be hovered in "select" mode)
      if (this.tool === 'select' && !this.hoveredVertex && !this.hoveredEdge) {
        const hoveredSurfaces = this.model.surfaces
          .filter(s => s.isPointNear2d(mouseWorld, components!))
          .map(s => ({
            surface: s,

            // We can't skip dividing by the number of vertices here since each
            // surface might have a different number of vertices
            avg: vec3(
              s.vertices.reduce((sum, v) => sum + v.position.x, 0) /
                s.vertices.length,
              s.vertices.reduce((sum, v) => sum + v.position.y, 0) /
                s.vertices.length,
              s.vertices.reduce((sum, v) => sum + v.position.z, 0) /
                s.vertices.length
            ),
          }));
        if (hoveredSurfaces.length > 0) {
          // Make sure we only hover the topmost surface
          // This is based on the average of the surface vertices positions
          switch (hoveredElement) {
            case 'canvas-top':
              hoveredSurfaces.sort((a, b) => a.avg.y - b.avg.y);
              break;
            case 'canvas-front':
              hoveredSurfaces.sort((a, b) => a.avg.z - b.avg.z);
              break;
            case 'canvas-side':
              hoveredSurfaces.sort((a, b) => a.avg.x - b.avg.x);
              break;
          }
          this.hoveredSurface =
            hoveredSurfaces[hoveredSurfaces.length - 1].surface;
          this.hoveredSurface.hovered = true;
        }
      }
    }

    // Hover logic 3d: find closest object under mouse in 3d canvas
    if (
      this.model &&
      ['select', 'create-edge', 'create-surface'].includes(this.tool) &&
      hoveredElement === 'canvas-3d'
    ) {
      // Find all vertices under mouse
      let closestVertex: Vertex | null = null;
      const intersectingVertices = this.model.vertices.filter(v =>
        v.isPointNear3d(
          InputManager.mousePosition,
          this.camera3d,
          vec2(this.canvas3d.width, this.canvas3d.height)
        )
      );

      // Get the closest vertex to the camera
      if (intersectingVertices.length > 0) {
        closestVertex = intersectingVertices
          .map(v => ({
            vertex: v,
            distance: vec3.len(vec3.sub(v.position, this.camera3d.position)),
          }))
          .sort((a, b) => a.distance - b.distance)[0].vertex;
      }

      // If we found a closest vertex, set it as hovered
      if (closestVertex) {
        this.hoveredVertex = closestVertex;
        this.hoveredVertex.hovered = true;
      }

      // If no vertex is hovered, find all edges under mouse
      // (edges can only be hovered in "select" mode)
      if (this.tool === 'select' && !this.hoveredVertex) {
        let closestEdge: Edge | null = null;
        const intersectingEdges = this.model.edges.filter(e =>
          e.isPointNear3d(
            InputManager.mousePosition,
            this.camera3d,
            vec2(this.canvas3d.width, this.canvas3d.height)
          )
        );

        // Get the closest edge to the camera
        // This is based on the average of the start and end vertex positions
        if (intersectingEdges.length > 0) {
          closestEdge = intersectingEdges
            .map(e => ({
              edge: e,
              distance: vec3.len(
                vec3.sub(
                  vec3.div(vec3.add(e.a.position, e.b.position), 2),
                  this.camera3d.position
                )
              ),
            }))
            .sort((a, b) => a.distance - b.distance)[0].edge;
        }

        // If we found a closest edge, set it as hovered
        if (closestEdge) {
          this.hoveredEdge = closestEdge;
          this.hoveredEdge.hovered = true;
        }
      }

      // If no vertex or edge is hovered, find all surfaces under mouse
      // (surfaces can only be hovered in "select" mode)
      if (this.tool === 'select' && !this.hoveredVertex && !this.hoveredEdge) {
        let closestSurface: Surface | null = null;
        const intersectingSurfaces = this.model.surfaces.filter(s =>
          s.isPointNear3d(
            InputManager.mousePosition,
            this.camera3d,
            vec2(this.canvas3d.width, this.canvas3d.height)
          )
        );

        // Get the closest surface to the camera
        if (intersectingSurfaces.length > 0) {
          closestSurface = intersectingSurfaces
            .map(s => ({
              surface: s,
              distance: vec3.len(
                vec3.sub(
                  vec3.div(
                    s.vertices.reduce(
                      (sum, v) => vec3.add(sum, v.position),
                      vec3()
                    ),
                    s.vertices.length
                  ),
                  this.camera3d.position
                )
              ),
            }))
            .sort((a, b) => a.distance - b.distance)[0].surface;
        }

        // If we found a closest surface, set it as hovered
        if (closestSurface) {
          this.hoveredSurface = closestSurface;
          this.hoveredSurface.hovered = true;
        }
      }
    }

    // Track the most recently clicked and selected vertex
    // This is a workaround to handle an edge case when toggling selection state
    // We don't want to deselect a vertex on mouse release if it was only just
    // selected on the corresponding mouse press
    if (
      this.hoveredVertex &&
      this.hoveredVertex.selected &&
      InputManager.mousePressed(MouseButton.Left)
    ) {
      this.clickedVertex = this.hoveredVertex;
    }
    if (!this.hoveredVertex) {
      this.clickedVertex = null;
    }

    // Selection logic 2d and 3d: on mouse press, select hovered object
    if (this.tool === 'select' && InputManager.mousePressed(MouseButton.Left)) {
      // A vertex is hovered
      if (this.hoveredVertex) {
        if (
          InputManager.keyDown('ControlLeft') ||
          InputManager.keyDown('ControlRight')
        ) {
          // Multi-select: add the hovered vertex to the selection
          this.selectVertex(this.hoveredVertex);
        } else {
          // Single-select: deselect other vertices before selecting this one
          this.deselectVertex();
          this.selectVertex(this.hoveredVertex);
        }

        // Handle dragging start
        if (this.selectedVertices.length > 0) {
          this.draggingVertex = this.hoveredVertex;
          this.dragStartMouse = vec2.cpy(InputManager.mousePosition);
          this.dragStartVertexPositions = new Map(
            this.selectedVertices.map(v => [v.id, vec3.cpy(v.position)])
          );
        }
      }

      // An edge is hovered
      if (this.hoveredEdge) {
        if (
          InputManager.keyDown('ControlLeft') ||
          InputManager.keyDown('ControlRight')
        ) {
          // Multi-select: add the hovered edge to the selection
          this.selectEdge(this.hoveredEdge);
        } else {
          // Single-select: deselect all other edges before selecting this one
          this.deselectEdge();
          this.selectEdge(this.hoveredEdge);
        }
      }

      // A surface is hovered
      if (this.hoveredSurface) {
        if (
          InputManager.keyDown('ControlLeft') ||
          InputManager.keyDown('ControlRight')
        ) {
          // Multi-select: add the hovered surface to the selection
          this.selectSurface(this.hoveredSurface);
        } else {
          // Single-select: deselect all other surfaces before selecting this one
          this.deselectSurface();
          this.selectSurface(this.hoveredSurface);
        }
      }
    }

    // Drag logic 2d: move selected vertices while dragging
    if (
      this.tool === 'select' &&
      this.draggingVertex &&
      this.selectedVertices.length > 0 &&
      ['canvas-top', 'canvas-front', 'canvas-side'].includes(hoveredElement) &&
      InputManager.mouseDown(MouseButton.Left)
    ) {
      const mouseNow = vec2.cpy(InputManager.mousePosition);
      const { camera } = this.getPanel2dInfo(hoveredElement) ?? {};
      const worldStart = camera!.screenToWorld(this.dragStartMouse!);
      const worldNow = camera!.screenToWorld(mouseNow);
      const deltaMouse = vec2.sub(worldNow, worldStart);

      // Calculate unsnapped delta position based on panel
      const deltaVertexPosition = vec3();
      switch (hoveredElement) {
        case 'canvas-top':
          deltaVertexPosition.x = deltaMouse.x;
          deltaVertexPosition.z = deltaMouse.y;
          break;
        case 'canvas-front':
          deltaVertexPosition.x = deltaMouse.x;
          deltaVertexPosition.y = -deltaMouse.y;
          break;
        case 'canvas-side':
          deltaVertexPosition.z = -deltaMouse.x;
          deltaVertexPosition.y = -deltaMouse.y;
          break;
      }

      // Get dragging vertex's initial position
      const draggingInitialPosition = this.dragStartVertexPositions!.get(
        this.draggingVertex.id
      )!;
      const draggingNewPosition = vec3.add(
        draggingInitialPosition,
        deltaVertexPosition
      );

      // If shift is held, snap the dragging vertex's position to grid
      if (
        InputManager.keyDown('ShiftLeft') ||
        InputManager.keyDown('ShiftRight')
      ) {
        const grid = this.options.gridSize;
        draggingNewPosition.x = Math.round(draggingNewPosition.x / grid) * grid;
        draggingNewPosition.y = Math.round(draggingNewPosition.y / grid) * grid;
        draggingNewPosition.z = Math.round(draggingNewPosition.z / grid) * grid;
      }

      // Calculate final delta based on dragging vertex's new position
      const finalDelta = vec3.sub(draggingNewPosition, draggingInitialPosition);

      // Update all selected vertex positions using the final delta
      this.selectedVertices.forEach(v => {
        const initialPosition = this.dragStartVertexPositions!.get(v.id);
        if (initialPosition) {
          v.position = vec3.add(initialPosition, finalDelta);
        }
      });
      if (!vectorAlmostZero(finalDelta)) {
        this.verticesMoved = true;
      }
    }

    // Drag logic 3d: move selected vertices while dragging
    if (
      this.tool === 'select' &&
      this.draggingVertex &&
      this.selectedVertices.length > 0 &&
      hoveredElement === 'canvas-3d' &&
      InputManager.mouseDown(MouseButton.Left)
    ) {
      const mouse = vec2.cpy(InputManager.mousePosition);
      const ray = this.camera3d.raycast(
        mouse,
        vec2(this.canvas3d.width, this.canvas3d.height)
      );

      if (ray) {
        let deltaVertexPosition = vec3();
        const draggingInitialPosition = this.dragStartVertexPositions!.get(
          this.draggingVertex.id
        )!;

        if (
          this.movementConstraintXActive ||
          this.movementConstraintYActive ||
          this.movementConstraintZActive
        ) {
          const mouseStartToNow = mouse.y - this.dragStartMouse!.y;
          const movementAmount = -mouseStartToNow;

          // Apply movement to the constrained dimension
          if (this.movementConstraintXActive) {
            deltaVertexPosition.x += movementAmount;
          }
          if (this.movementConstraintYActive) {
            deltaVertexPosition.y += movementAmount;
          }
          if (this.movementConstraintZActive) {
            deltaVertexPosition.z += movementAmount;
          }

          // Calculate new dragging vertex position
          const draggingNewPosition = vec3.add(
            draggingInitialPosition,
            deltaVertexPosition
          );

          // Apply grid snapping if shift is held
          if (
            InputManager.keyDown('ShiftLeft') ||
            InputManager.keyDown('ShiftRight')
          ) {
            const grid = this.options.gridSize;
            draggingNewPosition.x =
              Math.round(draggingNewPosition.x / grid) * grid;
            draggingNewPosition.y =
              Math.round(draggingNewPosition.y / grid) * grid;
            draggingNewPosition.z =
              Math.round(draggingNewPosition.z / grid) * grid;
          }

          // Calculate final delta based on dragging vertex's new position
          deltaVertexPosition = vec3.sub(
            draggingNewPosition,
            draggingInitialPosition
          );
        } else {
          // Default behavior - move in XZ plane
          const planePoint = vec3(0, this.draggingVertex.position.y, 0);
          const planeNormal = vec3(0, 1, 0);
          const intersection = rayIntersectsPlane(ray, {
            point: planePoint,
            normal: planeNormal,
          });

          if (intersection.intersects) {
            // Calculate new dragging vertex position
            let draggingNewPosition = vec3.cpy(intersection.intersectionPoint!);

            // Apply grid snapping if shift is held
            if (
              InputManager.keyDown('ShiftLeft') ||
              InputManager.keyDown('ShiftRight')
            ) {
              const grid = this.options.gridSize;
              draggingNewPosition.x =
                Math.round(draggingNewPosition.x / grid) * grid;
              draggingNewPosition.z =
                Math.round(draggingNewPosition.z / grid) * grid;
            }

            // Calculate final delta based on dragging vertex's new position
            deltaVertexPosition = vec3.sub(
              draggingNewPosition,
              draggingInitialPosition
            );
          }
        }

        // Update all selected vertex positions using the final delta
        this.selectedVertices.forEach(v => {
          const initialPosition = this.dragStartVertexPositions!.get(v.id);
          if (initialPosition) {
            v.position = vec3.add(initialPosition, deltaVertexPosition);
          }
        });
        if (!vectorAlmostZero(deltaVertexPosition)) {
          this.verticesMoved = true;
        }
      }
    }

    // Deselection logic 2d and 3d: deselect the hovered vertex on mouse release
    if (
      this.tool === 'select' &&
      this.hoveredVertex &&
      InputManager.mouseReleased(MouseButton.Left) &&
      this.clickedVertex === this.hoveredVertex &&
      (!this.dragStartMouse ||
        vec2.eq(this.dragStartMouse, InputManager.mousePosition)) &&
      ['canvas-top', 'canvas-front', 'canvas-side', 'canvas-3d'].includes(
        hoveredElement
      )
    ) {
      this.deselectVertex(this.hoveredVertex);
      this.clickedVertex = null;
    }

    // End drag on mouse release
    if (this.draggingVertex && InputManager.mouseReleased(MouseButton.Left)) {
      this.draggingVertex = null;
      this.dragStartMouse = null;
      this.dragStartVertexPositions = null;
    }

    // When the mouse is released, check if we moved any vertices and if so,
    // fire the model changed event
    if (this.verticesMoved && InputManager.mouseReleased(MouseButton.Left)) {
      this.verticesMoved = false;
      if (this.model) {
        this.model.emitChangeEvent('Vertices moved');
      }
    }

    // Deselect all vertices if clicking empty space (or something that isn't a
    // vertex) in 2D panel
    if (
      this.tool === 'select' &&
      !this.hoveredVertex &&
      InputManager.mousePressed(MouseButton.Left) &&
      ['canvas-top', 'canvas-front', 'canvas-side', 'canvas-3d'].includes(
        hoveredElement
      )
    ) {
      this.deselectVertex();
    }

    // Deselect all edges if clicking empty space (or something that isn't an
    // edge) in 2D panel
    if (
      this.tool === 'select' &&
      !this.hoveredEdge &&
      InputManager.mousePressed(MouseButton.Left) &&
      ['canvas-top', 'canvas-front', 'canvas-side', 'canvas-3d'].includes(
        hoveredElement
      )
    ) {
      this.deselectEdge();
    }

    // Deselect all surfaces if clicking empty space (or something that isn't a
    // surface) in 2D panel
    if (
      this.tool === 'select' &&
      !this.hoveredSurface &&
      InputManager.mousePressed(MouseButton.Left) &&
      ['canvas-top', 'canvas-front', 'canvas-side', 'canvas-3d'].includes(
        hoveredElement
      )
    ) {
      this.deselectSurface();
    }

    // Create new vertices
    if (
      this.tool === 'create-vertex' &&
      InputManager.mousePressed(MouseButton.Left) &&
      this.model
    ) {
      // 2D panels
      if (
        ['canvas-top', 'canvas-front', 'canvas-side'].includes(hoveredElement)
      ) {
        const panelInfo = this.getPanel2dInfo(hoveredElement);
        if (panelInfo) {
          const { camera, components } = panelInfo;
          const mouseWorld = camera.screenToWorld(InputManager.mousePosition);
          let position = vec3();
          switch (components) {
            case 'xz':
              position = vec3(mouseWorld.x, 0, mouseWorld.y);
              break;
            case 'xY':
              position = vec3(mouseWorld.x, -mouseWorld.y, 0);
              break;
            case 'ZY':
              position = vec3(0, -mouseWorld.y, -mouseWorld.x);
              break;
          }

          // Snap to grid if Shift is held
          if (
            InputManager.keyDown('ShiftLeft') ||
            InputManager.keyDown('ShiftRight')
          ) {
            const grid = this.options.gridSize;
            position.x = Math.round(position.x / grid) * grid;
            position.y = Math.round(position.y / grid) * grid;
            position.z = Math.round(position.z / grid) * grid;
          }

          // Add vertex to model
          this.model.addVertex(position);
        }
      }

      // 3D panel
      if (hoveredElement === 'canvas-3d') {
        const mouse = vec2.cpy(InputManager.mousePosition);
        const ray = this.camera3d.raycast(
          mouse,
          vec2(this.canvas3d.width, this.canvas3d.height)
        );
        if (ray) {
          // Intersect with ground plane y=0
          const planePoint = vec3(0, 0, 0);
          const planeNormal = vec3(0, 1, 0);
          const intersection = rayIntersectsPlane(ray, {
            point: planePoint,
            normal: planeNormal,
          });

          if (intersection.intersects && intersection.intersectionPoint) {
            let position = intersection.intersectionPoint!;

            // Snap to grid if Shift is held
            if (
              InputManager.keyDown('ShiftLeft') ||
              InputManager.keyDown('ShiftRight')
            ) {
              const grid = this.options.gridSize;
              position.x = Math.round(position.x / grid) * grid;
              position.y = Math.round(position.y / grid) * grid;
              position.z = Math.round(position.z / grid) * grid;
            }

            // Add vertex to model
            this.model.addVertex(position);
          }
        }
      }
    }

    // Create new edges
    if (
      this.model &&
      this.tool === 'create-edge' &&
      this.hoveredVertex &&
      InputManager.mousePressed(MouseButton.Left)
    ) {
      if (this.creatingEdge) {
        // If we are already creating an edge, add the hovered vertex to it
        this.creatingEdge.b = this.hoveredVertex;
        this.model.addEdge(new Edge(this.creatingEdge.a, this.creatingEdge.b));
        this.creatingEdge.destroy();
        this.creatingEdge = null;
      } else {
        // If we are not yet creating an edge, start creating one with the
        // hovered vertex
        this.creatingEdge = new Edge(
          this.hoveredVertex,
          new Vertex(vec3(), false, false),
          false
        );
      }
    }
    if (this.creatingEdge) {
      this.creatingEdge.a.hovered = true;
      this.creatingEdge.hovered = true;
      if (this.hoveredVertex) {
        // Snap the end vertex of the edge to the hovered vertex position
        this.creatingEdge.b.position = vec3.cpy(this.hoveredVertex.position);
      } else if (
        ['canvas-top', 'canvas-front', 'canvas-side'].includes(hoveredElement)
      ) {
        // Convert mouse to world space for the panel
        const { camera } = this.getPanel2dInfo(hoveredElement) ?? {};
        const mouseWorld = camera!.screenToWorld(InputManager.mousePosition);

        // The end vertex of the edge should follow the mouse position
        switch (hoveredElement) {
          case 'canvas-top':
            this.creatingEdge.b.position = vec3(
              mouseWorld.x,
              this.creatingEdge.a.position.y,
              mouseWorld.y
            );
            break;
          case 'canvas-front':
            this.creatingEdge.b.position = vec3(
              mouseWorld.x,
              -mouseWorld.y,
              this.creatingEdge.a.position.z
            );
            break;
          case 'canvas-side':
            this.creatingEdge.b.position = vec3(
              this.creatingEdge.a.position.x,
              -mouseWorld.y,
              -mouseWorld.x
            );
            break;
        }
      } else if (['canvas-3d'].includes(hoveredElement)) {
        // In 3D panel, the end vertex of the edge should follow the mouse
        const mouse = vec2.cpy(InputManager.mousePosition);
        const ray = this.camera3d.raycast(
          mouse,
          vec2(this.canvas3d.width, this.canvas3d.height)
        );
        if (ray) {
          // Intersect with ground plane (y = edge start vertex y)
          const planePoint = vec3(0, this.creatingEdge.a.position.y, 0);
          const planeNormal = vec3(0, 1, 0);
          const intersection = rayIntersectsPlane(ray, {
            point: planePoint,
            normal: planeNormal,
          });

          if (intersection.intersects && intersection.intersectionPoint) {
            this.creatingEdge.b.position = vec3.cpy(
              intersection.intersectionPoint!
            );
          }
        }
      }
    }

    // If we're creating an edge, we can cancel it by pressing Escape
    if (
      this.tool === 'create-edge' &&
      this.creatingEdge &&
      InputManager.keyPressed('Escape')
    ) {
      this.creatingEdge.destroy();
      this.creatingEdge = null;
    }

    // If we switch tools while creating an edge, cancel the creation
    // (unless we are switching to the pan tool)
    if (!['create-edge', 'pan'].includes(this.tool) && this.creatingEdge) {
      this.creatingEdge.destroy();
      this.creatingEdge = null;
    }

    // Create new surfaces
    if (
      this.model &&
      this.tool === 'create-surface' &&
      this.hoveredVertex &&
      InputManager.mousePressed(MouseButton.Left)
    ) {
      if (this.creatingSurface) {
        // If we are already creating a surface...
        if (!this.creatingSurface.vertices.includes(this.hoveredVertex)) {
          // If the vertex is not already in the surface, add it
          this.creatingSurface.vertices.push(this.hoveredVertex);
        } else if (
          this.creatingSurface.vertices.length >= 3 &&
          this.creatingSurface.vertices[0] === this.hoveredVertex
        ) {
          // If the vertex is the first one in the surface, we have closed the
          // surface polygon and can add it to the model
          this.model.addSurface(
            new Surface([...this.creatingSurface.vertices])
          );
          this.creatingSurface.destroy();
          this.creatingSurface = null;
        } else {
          // Otherwise, the vertex is already in the surface, so remove it
          this.creatingSurface.vertices = this.creatingSurface.vertices.filter(
            v => v !== this.hoveredVertex
          );
        }
      } else {
        // If we are not yet creating a surface, start creating one with the
        // hovered vertex
        this.creatingSurface = new Surface([this.hoveredVertex], false);
      }
    }
    if (this.creatingSurface) {
      this.creatingSurface.vertices.forEach(v => (v.hovered = true));
      this.creatingSurface.hovered = true;
    }

    // If we're creating a surface, we can cancel it by pressing Escape
    if (
      this.tool === 'create-surface' &&
      this.creatingSurface &&
      InputManager.keyPressed('Escape')
    ) {
      this.creatingSurface.destroy();
      this.creatingSurface = null;
    }

    // If we switch tools while creating an edge, cancel the creation
    // (unless we are switching to the pan tool)
    if (
      !['create-surface', 'pan'].includes(this.tool) &&
      this.creatingSurface
    ) {
      this.creatingSurface.destroy();
      this.creatingSurface = null;
    }

    // Delete selected objects with Delete key
    if (
      this.tool === 'select' &&
      InputManager.keyPressed('Delete') &&
      this.model
    ) {
      // Delete vertices
      if (this.selectedVertices.length) {
        this.selectedVertices.forEach(v => this.model!.removeVertex(v));
        this.deselectVertex();
      }

      // Delete edges
      if (this.selectedEdges.length) {
        this.selectedEdges.forEach(e => this.model!.removeEdge(e));
        this.selectedEdges = [];
      }

      // Delete surfaces
      if (this.selectedSurfaces.length) {
        this.selectedSurfaces.forEach(s => this.model!.removeSurface(s));
        this.selectedSurfaces = [];
      }
    }

    // 3d camera movement (WASD + ZX)
    if (hoveredElement === 'canvas-3d') {
      let moved = false;
      let moveDir = vec3();

      // Calculate forward, right, and up vectors
      const forward = vec3.nor(
        vec3.sub(this.camera3d.target, this.camera3d.position)
      );
      const right = vec3.nor(vec3.cross(forward, vec3(0, 1, 0)));
      const up = vec3(0, 1, 0);

      // Keyboard movement
      if (InputManager.keyDown('KeyW')) {
        moveDir = vec3.add(moveDir, forward);
        moved = true;
      }
      if (InputManager.keyDown('KeyS')) {
        moveDir = vec3.sub(moveDir, forward);
        moved = true;
      }
      if (InputManager.keyDown('KeyA')) {
        moveDir = vec3.sub(moveDir, right);
        moved = true;
      }
      if (InputManager.keyDown('KeyD')) {
        moveDir = vec3.add(moveDir, right);
        moved = true;
      }
      if (InputManager.keyDown('KeyQ')) {
        moveDir = vec3.add(moveDir, up);
        moved = true;
      }
      if (InputManager.keyDown('KeyE')) {
        moveDir = vec3.sub(moveDir, up);
        moved = true;
      }

      if (moved) {
        moveDir = vec3.nor(moveDir);
        const moveStep = vec3.scale(moveDir, this.options.moveSpeed * dt);
        this.camera3d.position = vec3.add(this.camera3d.position, moveStep);
        this.camera3d.target = vec3.add(this.camera3d.target, moveStep);
      }
    }

    // 3d camera rotation
    if (
      this.tool === 'pan' &&
      hoveredElement === 'canvas-3d' &&
      InputManager.mouseDown(MouseButton.Left)
    ) {
      const delta = vec2.sub(
        InputManager.mousePosition,
        this.lastMousePosition
      );
      this.camera3dYaw += delta.x * this.options.rotateSpeed;
      this.camera3dPitch -= delta.y * this.options.rotateSpeed;

      // Clamp pitch to avoid flipping
      const maxPitch = Math.PI / 2 - 0.01;
      this.camera3dPitch = Math.max(
        -maxPitch,
        Math.min(maxPitch, this.camera3dPitch)
      );

      // Calculate new forward vector
      const r = vec3.len(
        vec3.sub(this.camera3d.position, this.camera3d.target)
      );
      const offset = vec3.fromPolar(
        r,
        Math.PI / 2 - this.camera3dPitch,
        this.camera3dYaw
      );

      // Move the target position
      this.camera3d.target = vec3.add(this.camera3d.position, offset);
    }

    // 2d camera zooming
    if (
      ['canvas-top', 'canvas-front', 'canvas-side'].includes(hoveredElement)
    ) {
      const camera = this.getPanel2dInfo(hoveredElement)!.camera;
      if (InputManager.mouseWheelUp()) {
        camera.scale *= 1 + this.options.zoomSpeed;
      }
      if (InputManager.mouseWheelDown()) {
        camera.scale *= 1 - this.options.zoomSpeed;
      }
    }

    // 2d camera panning
    if (this.tool === 'pan') {
      // Start panning
      if (
        ['canvas-top', 'canvas-front', 'canvas-side'].includes(
          hoveredElement
        ) &&
        InputManager.mousePressed(MouseButton.Left)
      ) {
        this.panning = true;
        this.lastPanPosition = vec2.cpy(InputManager.mousePosition);
      }

      // Pan the camera
      if (
        this.panning &&
        ['canvas-top', 'canvas-front', 'canvas-side'].includes(
          hoveredElement
        ) &&
        InputManager.mouseDown(MouseButton.Left) &&
        this.lastPanPosition
      ) {
        const delta = vec2.sub(
          InputManager.mousePosition,
          this.lastPanPosition
        );
        const camera = this.getPanel2dInfo(hoveredElement)!.camera;
        if (camera) {
          camera.position.x -= delta.x / camera.actualScale;
          camera.position.y -= delta.y / camera.actualScale;
        }
        this.lastPanPosition = vec2.cpy(InputManager.mousePosition);
      }

      // Stop panning
      if (this.panning && InputManager.mouseReleased(MouseButton.Left)) {
        this.panning = false;
        this.lastPanPosition = null;
      }
    } else {
      // Reset panning state if not in pan tool
      this.panning = false;
      this.lastPanPosition = null;
    }

    this.updateGuiStates();

    // Update model
    if (this.model) {
      this.model.update(dt);
    }

    // Update cameras
    this.cameraTop.update({
      x: this.canvasTop.width,
      y: this.canvasTop.height,
    });
    this.cameraFront.update({
      x: this.canvasFront.width,
      y: this.canvasFront.height,
    });
    this.cameraSide.update({
      x: this.canvasSide.width,
      y: this.canvasSide.height,
    });
    this.camera3d.update();

    Debug.value(
      'camera-top',
      `(${vec2.str(vec2.map(this.cameraTop.position, Math.floor))}) x${round(
        this.cameraTop.scale,
        2
      )}`,
      {
        showLabel: false,
        align: 'right',
        tags: ['panel-top'],
      }
    );
    Debug.value(
      'camera-front',
      `(${vec2.str(vec2.map(this.cameraFront.position, Math.floor))}) x${round(
        this.cameraFront.scale,
        2
      )}`,
      {
        showLabel: false,
        align: 'right',
        tags: ['panel-front'],
      }
    );
    Debug.value(
      'camera-side',
      `(${vec2.str(vec2.map(this.cameraSide.position, Math.floor))}) x${round(
        this.cameraSide.scale,
        2
      )}`,
      {
        showLabel: false,
        align: 'right',
        tags: ['panel-side'],
      }
    );
    Debug.value(
      'camera-3d',
      `(${vec3.str(
        vec3.map(this.camera3d.position, Math.floor)
      )}) > (${vec3.str(
        vec3.map(this.camera3d.target, Math.floor)
      )}) yaw=${round(this.camera3dYaw, 2)} pitch=${round(
        this.camera3dPitch,
        2
      )}`,
      {
        showLabel: false,
        align: 'right',
        tags: ['panel-3d'],
      }
    );

    this.lastMousePosition = vec2.cpy(InputManager.mousePosition);
    InputManager.update();
  }

  private updateGuiStates() {
    // Check if vertices selection changed
    const currentVertices = new Set(this.selectedVertices.map(v => v.id));
    if (!setsEqual(this.lastGuiState.vertices, currentVertices)) {
      if (ModelEditor.verticesFolder) {
        Object.values(ModelEditor.verticesFolder.__folders).forEach(folder => {
          folder.domElement.classList.remove('selected');
        });
        this.selectedVertices.forEach(v => {
          if (v.folder) {
            v.folder.domElement.classList.add('selected');
          }
        });
      }
      this.lastGuiState.vertices = currentVertices;
    }

    // Check if edges selection changed
    const currentEdges = new Set(this.selectedEdges.map(e => e.id));
    if (!setsEqual(this.lastGuiState.edges, currentEdges)) {
      if (ModelEditor.edgesFolder) {
        Object.values(ModelEditor.edgesFolder.__folders).forEach(folder => {
          folder.domElement.classList.remove('selected');
        });
        this.selectedEdges.forEach(e => {
          if (e.folder) {
            e.folder.domElement.classList.add('selected');
          }
        });
      }
      this.lastGuiState.edges = currentEdges;
    }

    // Check if surfaces selection changed
    const currentSurfaces = new Set(this.selectedSurfaces.map(s => s.id));
    if (!setsEqual(this.lastGuiState.surfaces, currentSurfaces)) {
      if (ModelEditor.surfacesFolder) {
        Object.values(ModelEditor.surfacesFolder.__folders).forEach(folder => {
          folder.domElement.classList.remove('selected');
        });
        this.selectedSurfaces.forEach(s => {
          if (s.folder) {
            s.folder.domElement.classList.add('selected');
          }
        });
      }
      this.lastGuiState.surfaces = currentSurfaces;
    }

    // Check if history index changed
    if (this.currentHistoryIndex !== this.lastGuiState.historyIndex) {
      if (ModelEditor.historyFolder) {
        Object.values(ModelEditor.historyFolder.__controllers).forEach(
          controller => {
            controller.domElement.parentNode
              ?.querySelector('span.property-name')
              ?.classList.remove('selected');
          }
        );
        if (this.history.length > 0 && this.currentHistoryIndex >= 0) {
          const currentController =
            ModelEditor.historyFolder.__controllers[this.currentHistoryIndex];
          if (currentController) {
            currentController.domElement.parentNode
              ?.querySelector('span.property-name')
              ?.classList.add('selected');
          }
        }
      }
      this.lastGuiState.historyIndex = this.currentHistoryIndex;
    }
  }

  public selectVertex(vertex: Vertex, addToSelection = true) {
    if (!addToSelection) {
      this.deselectVertex();
    }
    vertex.selected = true;
    this.selectedVertices.push(vertex);
    this.draggingVertex = null;
    this.dragStartMouse = null;
    this.dragStartVertexPositions = null;
  }

  public selectEdge(edge: Edge, addToSelection = true) {
    if (!addToSelection) {
      this.deselectEdge();
    }
    edge.selected = true;
    this.selectedEdges.push(edge);
  }

  public selectSurface(surface: Surface, addToSelection = true) {
    if (!addToSelection) {
      this.deselectSurface();
    }
    surface.selected = true;
    this.selectedSurfaces.push(surface);
  }

  private deselectVertex(vertex?: Vertex) {
    if (vertex) {
      vertex.selected = false;
      this.selectedVertices = this.selectedVertices.filter(v => v !== vertex);
    } else {
      this.selectedVertices.forEach(v => (v.selected = false));
      this.selectedVertices = [];
    }
  }

  private deselectEdge(edge?: Edge) {
    if (edge) {
      edge.selected = false;
      this.selectedEdges = this.selectedEdges.filter(e => e !== edge);
    } else {
      this.selectedEdges.forEach(e => (e.selected = false));
      this.selectedEdges = [];
    }
  }

  private deselectSurface(surface?: Surface) {
    if (surface) {
      surface.selected = false;
      this.selectedSurfaces = this.selectedSurfaces.filter(s => s !== surface);
    } else {
      this.selectedSurfaces.forEach(s => (s.selected = false));
      this.selectedSurfaces = [];
    }
  }

  public removeVertex(vertex: Vertex) {
    if (this.model) {
      this.model.removeVertex(vertex);
    }
    this.deselectVertex(vertex);
  }

  public removeEdge(edge: Edge) {
    if (this.model) {
      this.model.removeEdge(edge);
    }
    this.deselectEdge(edge);
  }

  public removeSurface(surface: Surface) {
    if (this.model) {
      this.model.removeSurface(surface);
    }
    this.deselectSurface(surface);
  }

  private getPanel2dInfo(panelId: string): Panel2dInfo | null {
    switch (panelId) {
      case 'canvas-top':
        return {
          camera: this.cameraTop,
          context: this.contextTop,
          components: 'xz',
        };
      case 'canvas-front':
        return {
          camera: this.cameraFront,
          context: this.contextFront,
          components: 'xY',
        };
      case 'canvas-side':
        return {
          camera: this.cameraSide,
          context: this.contextSide,
          components: 'ZY',
        };
      default:
        return null;
    }
  }

  private draw() {
    // Clear canvases
    this.contextTop.clearRect(
      0,
      0,
      this.canvasTop.width,
      this.canvasTop.height
    );
    this.contextFront.clearRect(
      0,
      0,
      this.canvasFront.width,
      this.canvasFront.height
    );
    this.contextSide.clearRect(
      0,
      0,
      this.canvasSide.width,
      this.canvasSide.height
    );
    this.context3d.clearRect(0, 0, this.canvas3d.width, this.canvas3d.height);

    // Save contexts
    this.contextTop.save();
    this.contextFront.save();
    this.contextSide.save();
    this.context3d.save();

    // Apply camera transforms
    this.cameraTop.setTransforms(this.contextTop);
    this.cameraFront.setTransforms(this.contextFront);
    this.cameraSide.setTransforms(this.contextSide);

    // Update the 3d camera aspect ratio
    this.camera3d.aspect = this.canvas3d.width / this.canvas3d.height;

    // Draw grids
    const panel3dSize = vec2(this.canvas3d.width, this.canvas3d.height);
    if (this.options.showGrid) {
      Grid.draw(
        this.contextTop,
        this.cameraTop,
        this.options.gridSize,
        this.options.showGridLabels,
        this.options.gridLabelsGap,
        'panel-top'
      );
      Grid.draw(
        this.contextFront,
        this.cameraFront,
        this.options.gridSize,
        this.options.showGridLabels,
        this.options.gridLabelsGap,
        'panel-front'
      );
      Grid.draw(
        this.contextSide,
        this.cameraSide,
        this.options.gridSize,
        this.options.showGridLabels,
        this.options.gridLabelsGap,
        'panel-side'
      );
    }
    if (this.options.showGroundPlane) {
      Grid3d.draw(
        this.context3d,
        this.camera3d,
        panel3dSize,
        this.options.gridSize,
        this.options.groundPlaneSize,
        this.options.showGroundPlaneLabels,
        this.options.groundPlaneLabelsGap
      );
    }

    // Draw the model
    if (this.model) {
      this.model.drawTop(this.contextTop, this.options.showVertexLabels);
      this.model.drawFront(this.contextFront, this.options.showVertexLabels);
      this.model.drawSide(this.contextSide, this.options.showVertexLabels);
      this.model.draw3d(
        this.context3d,
        this.camera3d,
        panel3dSize,
        this.options.showVertexLabels
      );
    }

    // If we're creating an edge, draw the temporary edge
    if (this.creatingEdge) {
      this.creatingEdge.draw2d(this.contextTop, 'xz');
      this.creatingEdge.draw2d(this.contextFront, 'xY');
      this.creatingEdge.draw2d(this.contextSide, 'ZY');
      this.creatingEdge.draw3d(this.context3d, this.camera3d, panel3dSize);
    }

    // If we're creating a surface, draw the temporary surface
    if (this.creatingSurface) {
      this.creatingSurface.draw2d(this.contextTop, 'xz');
      this.creatingSurface.draw2d(this.contextFront, 'xY');
      this.creatingSurface.draw2d(this.contextSide, 'ZY');
      this.creatingSurface.draw3d(this.context3d, this.camera3d, panel3dSize);
    }

    // Draw axis indicators
    if (this.options.showAxes) {
      Axes.draw(this.context3d, this.camera3d, panel3dSize);
    }

    // Render debug information
    Debug.draw(this.contextTop, ['panel-top'], false);
    Debug.draw(this.contextFront, ['panel-front'], false);
    Debug.draw(this.contextSide, ['panel-side'], false);
    Debug.draw(this.context3d, ['panel-3d'], false);
    Debug.clear();

    // Restore contexts
    this.contextTop.restore();
    this.contextFront.restore();
    this.contextSide.restore();
    this.context3d.restore();
  }
}
