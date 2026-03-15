import type { Optimization3DRenderData } from "./optimization3DRenderData.js";

function parsePoints(value: string): Array<[number, number]> {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => token.split(",").map(Number) as [number, number])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

export function drawOptimization3DCanvas(
  canvas: HTMLCanvasElement,
  renderData: Optimization3DRenderData,
  viewportWidth: number,
  viewportHeight: number
): void {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(viewportWidth * devicePixelRatio));
  canvas.height = Math.max(1, Math.round(viewportHeight * devicePixelRatio));
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, viewportWidth, viewportHeight);

  const background = context.createLinearGradient(0, 0, 0, viewportHeight);
  background.addColorStop(0, "#f5f8fb");
  background.addColorStop(1, "#dde4e4");
  context.fillStyle = background;
  context.fillRect(0, 0, viewportWidth, viewportHeight);

  for (const face of renderData.faces) {
    const points = parsePoints(face.points);
    if (points.length < 3) {
      continue;
    }
    context.save();
    context.globalAlpha = face.opacity;
    context.beginPath();
    const firstFacePoint = points[0]!;
    context.moveTo(firstFacePoint[0], firstFacePoint[1]);
    for (let index = 1; index < points.length; index += 1) {
      const facePoint = points[index]!;
      context.lineTo(facePoint[0], facePoint[1]);
    }
    context.closePath();
    context.fillStyle = face.fill;
    context.fill();
    if (face.stroke !== "transparent" && face.strokeWidth > 0) {
      context.strokeStyle = face.stroke;
      context.lineWidth = face.strokeWidth;
      context.stroke();
    }
    context.restore();
  }

  for (const stroke of renderData.strokes) {
    context.save();
    context.globalAlpha = stroke.opacity;
    context.strokeStyle = stroke.stroke;
    context.lineWidth = stroke.strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.setLineDash(stroke.dashArray ? stroke.dashArray.split(" ").map(Number) : []);

    if (stroke.kind === "path" && stroke.pathPoints) {
      const [start, control, end] = stroke.pathPoints;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.quadraticCurveTo(control.x, control.y, end.x, end.y);
      context.stroke();

      const angle = Math.atan2(end.y - control.y, end.x - control.x);
      const arrowLength = 8;
      context.fillStyle = stroke.stroke;
      context.beginPath();
      context.moveTo(end.x, end.y);
      context.lineTo(
        end.x - arrowLength * Math.cos(angle - Math.PI / 6),
        end.y - arrowLength * Math.sin(angle - Math.PI / 6)
      );
      context.lineTo(
        end.x - arrowLength * Math.cos(angle + Math.PI / 6),
        end.y - arrowLength * Math.sin(angle + Math.PI / 6)
      );
      context.closePath();
      context.fill();
    } else {
      const points = parsePoints(stroke.value);
      if (points.length >= 2) {
        context.beginPath();
        const firstStrokePoint = points[0]!;
        context.moveTo(firstStrokePoint[0], firstStrokePoint[1]);
        for (let index = 1; index < points.length; index += 1) {
          const strokePoint = points[index]!;
          context.lineTo(strokePoint[0], strokePoint[1]);
        }
        context.stroke();
      }
    }

    context.restore();
  }

  for (const badge of renderData.badges) {
    context.save();
    context.beginPath();
    context.arc(badge.cx, badge.cy, 15, 0, Math.PI * 2);
    context.fillStyle = badge.fill;
    context.fill();
    context.lineWidth = 1.4;
    context.strokeStyle = badge.stroke;
    context.stroke();

    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "700 11px sans-serif";
    context.fillText(badge.step, badge.cx, badge.cy + 0.5);

    if (badge.segmentLabel) {
      context.fillStyle = "rgba(17, 30, 36, 0.78)";
      context.font = "700 9px sans-serif";
      context.textBaseline = "alphabetic";
      context.fillText(badge.segmentLabel, badge.cx, badge.cy + 24);
    }
    context.restore();
  }
}
