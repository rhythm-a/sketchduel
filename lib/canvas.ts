export interface DrawStroke {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  size: number;
}

/** Map screen coords to canvas bitmap coords (handles CSS scaling). */
export const getCanvasPoint = (
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
};

export const drawLine = (
  ctx: CanvasRenderingContext2D,
  stroke: DrawStroke
) => {
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(stroke.fromX, stroke.fromY);
  ctx.lineTo(stroke.toX, stroke.toY);
  ctx.stroke();
};

export const clearCanvas = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) => {
  ctx.clearRect(0, 0, width, height);
};
