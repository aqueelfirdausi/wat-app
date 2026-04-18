import QRCode from "qrcode";
import { getStoreBrandById, resolveProductBrand } from "@/lib/brands";
import { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

const CARD_X = 56;
const CARD_Y = 58;
const CARD_WIDTH = 968;
const CARD_HEIGHT = 1804;
const CARD_RADIUS = 36;

const LABEL_X = 108;
const LABEL_Y = 118;

const IMAGE_X = 136;
const IMAGE_Y = 168;
const IMAGE_WIDTH = 808;
const IMAGE_HEIGHT = 940;
const IMAGE_RADIUS = 28;

const TITLE_X = 108;
const TITLE_Y = 1168;
const TITLE_MAX_WIDTH = 760;
const TITLE_MAX_LINES = 3;
const TITLE_LINE_HEIGHT = 58;

const PRICE_GAP = 24;
const CHIPS_GAP = 24;
const CHIP_HEIGHT = 46;
const CHIP_HORIZONTAL_PADDING = 20;
const CHIP_GAP = 12;

const QR_CARD_X = 700;
const QR_CARD_Y = 1310;
const QR_CARD_WIDTH = 220;
const QR_CARD_HEIGHT = 260;
const QR_CARD_RADIUS = 26;
const QR_SIZE = 150;

function isEventLike(value: unknown) {
  return typeof value === "object" && value !== null && "preventDefault" in value && "stopPropagation" in value;
}

function assertRenderableProduct(product: unknown): asserts product is Product {
  if (isEventLike(product)) {
    throw new Error("Status image export received a click event instead of a product.");
  }

  if (!product || typeof product !== "object") {
    throw new Error("Status image export requires a product.");
  }

  const candidate = product as Partial<Product>;

  if (!candidate.name || typeof candidate.name !== "string") {
    throw new Error("Status image export requires a product name.");
  }

  if (!candidate.slug || typeof candidate.slug !== "string") {
    throw new Error("Status image export requires a valid product slug.");
  }

  if (!candidate.categoryName || typeof candidate.categoryName !== "string") {
    throw new Error("Status image export requires a category.");
  }
}

function fillRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string
) {
  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = color;
  context.fill();
  context.restore();
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (context.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      lines.push(word);
    }

    if (lines.length === maxLines) {
      break;
    }
  }

  if (lines.length < maxLines && currentLine) {
    lines.push(currentLine);
  }

  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    let lastLine = lines[lines.length - 1] ?? "";

    while (lastLine.length > 0 && context.measureText(`${lastLine}...`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }

    lines[lines.length - 1] = `${lastLine}...`;
  }

  return lines.slice(0, maxLines);
}

async function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = source;
  });
}

async function loadProductImage(source?: string, appOrigin?: string) {
  if (!source) {
    return {
      image: null,
      error: null
    };
  }

  try {
    const proxiedUrl = appOrigin
      ? `${appOrigin}/api/image-proxy?url=${encodeURIComponent(source)}`
      : `/api/image-proxy?url=${encodeURIComponent(source)}`;

    const image = await loadImage(proxiedUrl);
    return {
      image,
      error: null
    };
  } catch (error) {
    return {
      image: null,
      error: error instanceof Error ? error.message : "Unable to load product image."
    };
  }
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const imageRatio = image.width / image.height;
  const frameRatio = width / height;

  let drawWidth = width;
  let drawHeight = height;
  let drawX = x;
  let drawY = y;

  if (imageRatio > frameRatio) {
    drawHeight = width / imageRatio;
    drawY = y + (height - drawHeight) / 2;
  } else {
    drawWidth = height * imageRatio;
    drawX = x + (width - drawWidth) / 2;
  }

  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.clip();
  context.fillStyle = "#efe6d8";
  context.fillRect(x, y, width, height);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  context.restore();
}

function drawChip(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  fillColor: string,
  textColor: string
) {
  context.save();
  context.font = "700 20px sans-serif";
  const chipWidth = Math.ceil(context.measureText(text).width) + CHIP_HORIZONTAL_PADDING * 2;
  fillRoundRect(context, x, y, chipWidth, CHIP_HEIGHT, 999, fillColor);
  context.fillStyle = textColor;
  context.fillText(text, x + CHIP_HORIZONTAL_PADDING, y + 30);
  context.restore();
  return chipWidth;
}

export async function generateMinimalStatusImage(product: Product, productUrl: string, appOrigin?: string) {
  assertRenderableProduct(product);

  if (isEventLike(productUrl) || typeof productUrl !== "string" || !productUrl.trim()) {
    throw new Error("Status image export requires a valid product URL.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available in this browser.");
  }

  const qrDataUrl = await QRCode.toDataURL(productUrl, {
    errorCorrectionLevel: "H",
    margin: 4,
    width: 240,
    color: {
      dark: "#1f1a14",
      light: "#ffffff"
    }
  });

  const qrImage = await loadImage(qrDataUrl);
  const { image: productImage, error: productImageError } = await loadProductImage(product.imageUrl, appOrigin);

  if (product.imageUrl && !productImage && productImageError) {
    throw new Error(`Status image export could not load the product photo: ${productImageError}`);
  }

  const brand = getStoreBrandById(resolveProductBrand(product));
  const brandName = brand?.name ?? "WAT App";
  const labelText = `${brandName} | ${product.categoryName}`;

  context.fillStyle = "#efe9df";
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  fillRoundRect(context, CARD_X, CARD_Y, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS, "#faf7f2");

  context.fillStyle = "#146c43";
  context.font = "700 24px sans-serif";
  context.fillText(labelText, LABEL_X, LABEL_Y, 840);

  if (productImage) {
    drawContainedImage(context, productImage, IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_RADIUS);
  } else {
    fillRoundRect(context, IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_RADIUS, "#ece3d6");
    context.textAlign = "center";
    context.fillStyle = "#6d6253";
    context.font = "700 34px sans-serif";
    context.fillText(product.categoryName, IMAGE_X + IMAGE_WIDTH / 2, IMAGE_Y + IMAGE_HEIGHT / 2);
    context.textAlign = "left";
  }

  context.fillStyle = "#1f1a14";
  context.font = "900 50px sans-serif";
  const titleLines = wrapText(context, product.name, TITLE_MAX_WIDTH, TITLE_MAX_LINES);

  titleLines.forEach((line, index) => {
    context.fillText(line, TITLE_X, TITLE_Y + index * TITLE_LINE_HEIGHT);
  });

  const titleBottom = TITLE_Y + titleLines.length * TITLE_LINE_HEIGHT;
  let chipsY = titleBottom + CHIPS_GAP;

  if (Number.isFinite(product.price) && product.price > 0) {
    const priceY = titleBottom + PRICE_GAP + 58;
    context.font = "900 64px sans-serif";
    context.fillStyle = "#1f1a14";
    context.fillText(formatCurrency(product.price, product.currency), TITLE_X, priceY);
    chipsY = priceY + CHIPS_GAP;
  }

  let nextChipX = TITLE_X;
  nextChipX += drawChip(context, nextChipX, chipsY, product.condition, "#efe6d8", "#1f1a14") + CHIP_GAP;
  drawChip(
    context,
    nextChipX,
    chipsY,
    product.stockStatus,
    product.stockStatus === "In Stock"
      ? "rgba(20, 108, 67, 0.12)"
      : product.stockStatus === "Low Stock"
        ? "rgba(241, 177, 77, 0.22)"
        : "rgba(185, 66, 66, 0.12)",
    product.stockStatus === "In Stock" ? "#146c43" : product.stockStatus === "Low Stock" ? "#8a5d16" : "#b94242"
  );

  fillRoundRect(context, QR_CARD_X, QR_CARD_Y, QR_CARD_WIDTH, QR_CARD_HEIGHT, QR_CARD_RADIUS, "#ffffff");

  const qrX = QR_CARD_X + (QR_CARD_WIDTH - QR_SIZE) / 2;
  const qrY = QR_CARD_Y + 24;
  context.drawImage(qrImage, qrX, qrY, QR_SIZE, QR_SIZE);

  context.textAlign = "center";
  context.fillStyle = "#1f1a14";
  context.font = "700 20px sans-serif";
  context.fillText("Scan for details", QR_CARD_X + QR_CARD_WIDTH / 2, QR_CARD_Y + 202);
  context.fillStyle = "#6d6253";
  context.font = "600 17px sans-serif";
  context.fillText("Reply to order", QR_CARD_X + QR_CARD_WIDTH / 2, QR_CARD_Y + 230);
  context.textAlign = "left";

  return canvas.toDataURL("image/png");
}
