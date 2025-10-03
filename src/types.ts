import Camera from '@basementuniverse/camera';

export type Panel2dInfo = {
  camera: Camera;
  context: CanvasRenderingContext2D;
  components: string;
};

export type HistoryEntry = {
  action: string;
  model: Record<string, any>;
  date: string;
  controller?: dat.GUIController;
};
