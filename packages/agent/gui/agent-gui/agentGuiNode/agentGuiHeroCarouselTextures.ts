import * as THREE from "three";

const TEXTURE_SIZE = 256;
const RECORD_RADIUS_RATIO = 0.47;
const RECORD_LABEL_RADIUS_RATIO = 0.41;
const RECORD_SPINDLE_RADIUS_RATIO = 0.035;

// Composites each host-provided agent icon into the paper label of a shared
// vinyl-record treatment. The monochrome groove/rim palette is intentionally
// material-specific; the label keeps the host artwork and brand color intact.
export function vinylRecordTexture(
  image: HTMLImageElement,
  onReadyRender: () => void
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (context) {
    const center = TEXTURE_SIZE / 2;
    const recordRadius = TEXTURE_SIZE * RECORD_RADIUS_RATIO;
    const labelRadius = recordRadius * RECORD_LABEL_RADIUS_RATIO;

    context.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    context.save();
    context.beginPath();
    context.arc(center, center, recordRadius, 0, Math.PI * 2);
    context.clip();

    const recordFill = context.createRadialGradient(
      center * 0.92,
      center * 0.88,
      labelRadius,
      center,
      center,
      recordRadius
    );
    recordFill.addColorStop(0, "rgb(26 26 27)");
    recordFill.addColorStop(0.54, "rgb(5 5 6)");
    recordFill.addColorStop(0.82, "rgb(18 18 19)");
    recordFill.addColorStop(1, "rgb(3 3 4)");
    context.fillStyle = recordFill;
    context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

    for (
      let radius = labelRadius + 4;
      radius < recordRadius - 3;
      radius += 3.5
    ) {
      const grooveIndex = Math.round((radius - labelRadius) / 3.5);
      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.strokeStyle =
        grooveIndex % 3 === 0
          ? "rgb(255 255 255 / 0.12)"
          : "rgb(255 255 255 / 0.055)";
      context.lineWidth = grooveIndex % 3 === 0 ? 0.7 : 0.45;
      context.stroke();
    }

    context.save();
    context.translate(center, center);
    context.rotate(-Math.PI / 4);
    const sheen = context.createLinearGradient(
      -recordRadius,
      0,
      recordRadius,
      0
    );
    sheen.addColorStop(0, "rgb(255 255 255 / 0)");
    sheen.addColorStop(0.42, "rgb(255 255 255 / 0.02)");
    sheen.addColorStop(0.5, "rgb(255 255 255 / 0.18)");
    sheen.addColorStop(0.58, "rgb(255 255 255 / 0.02)");
    sheen.addColorStop(1, "rgb(255 255 255 / 0)");
    context.fillStyle = sheen;
    context.fillRect(
      -recordRadius,
      -recordRadius,
      recordRadius * 2,
      recordRadius * 2
    );
    context.restore();
    context.restore();

    context.save();
    context.beginPath();
    context.arc(center, center, labelRadius, 0, Math.PI * 2);
    context.clip();
    const scale = Math.max(
      (labelRadius * 2) / image.width,
      (labelRadius * 2) / image.height
    );
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(
      image,
      center - width / 2,
      center - height / 2,
      width,
      height
    );
    context.restore();

    context.beginPath();
    context.arc(center, center, labelRadius, 0, Math.PI * 2);
    context.strokeStyle = "rgb(255 255 255 / 0.2)";
    context.lineWidth = 1;
    context.stroke();

    context.beginPath();
    context.arc(
      center,
      center,
      recordRadius * RECORD_SPINDLE_RADIUS_RATIO,
      0,
      Math.PI * 2
    );
    context.fillStyle = "rgb(5 5 6)";
    context.fill();
    context.strokeStyle = "rgb(255 255 255 / 0.18)";
    context.lineWidth = 0.75;
    context.stroke();

    context.beginPath();
    context.arc(center, center, recordRadius - 0.75, 0, Math.PI * 2);
    context.strokeStyle = "rgb(255 255 255 / 0.32)";
    context.lineWidth = 1.25;
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  onReadyRender();
  return texture;
}

export function roundedIconTexture(
  image: HTMLImageElement,
  onReadyRender: () => void,
  cornerRadius: number
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (context) {
    const radius = TEXTURE_SIZE * cornerRadius;
    context.beginPath();
    context.roundRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE, radius);
    context.clip();
    const scale = Math.max(
      TEXTURE_SIZE / image.width,
      TEXTURE_SIZE / image.height
    );
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(
      image,
      (TEXTURE_SIZE - width) / 2,
      (TEXTURE_SIZE - height) / 2,
      width,
      height
    );
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  onReadyRender();
  return texture;
}
