import { useEffect, useRef } from "react";

const TILE_HALF_WIDTH = 16;
const TILE_HALF_HEIGHT = 8;
const ROOM_SIZE = 10;
const WALL_HEIGHT = 58;
const FRAME_INTERVAL_MS = 1000 / 30;

const LOGO_ROWS = [
  "   ▄█████▄                                                    ",
  " ▄█████▀▀▄██▄  ▄▄▄▄▄  ▄▄▄ ▄▄▄▄▄▄  ▄▄▄▄▄  ▄▄▄▄▄▄ ▄▄     ▄▄▄▄▄  ",
  "████▀▀   ▀███  ██▀▀██ ███ ███▀██▄ ██▀▀▀  ██▀▀▀  ██    ███▀▀██▄",
  "████     ████  ██▄███ ███ ███▄██▀ █████  █████  ██    ██    ██",
  "████    ▄████  ██▀▀   ███ ███▀    ██▄▄▄  ██▄▄▄  ██▄▄▄ ▀██▄▄██▀",
  " ▀██▄▄██████▀  ▀▀     ▀▀▀ ▀▀▀     ▀▀▀▀▀▀ ▀▀▀▀▀▀ ▀▀▀▀▀  ▀▀▀▀▀  ",
  "    █████▀▀                                                   ",
];

const COLORS = {
  floorA: "#131E33",
  floorB: "#0F192B",
  floorEdge: "#1B2A45",
  rug: "#251C4A",
  rugAlt: "#2B2156",
  wallLeft: "#17243C",
  wallRight: "#111B2E",
  wallTop: "#22345A",
  mint: "#00D2A0",
  mintDim: "#0A7F68",
  deskTop: "#2C3D5C",
  deskLeft: "#1F2D47",
  deskRight: "#182338",
  monitor: "#0B1220",
  rackTop: "#2A3550",
  rackLeft: "#1C2540",
  rackRight: "#141B30",
  potLeft: "#5B4636",
  potRight: "#463528",
  leaf: "#1FA774",
  leafDark: "#147A55",
  shadow: "rgba(0, 0, 0, 0.35)",
  bubble: "#F8FAFC",
  purple: "#8B5CF6",
};

type Furniture = { i: number; j: number; kind: "desk" | "rack" | "plant" };

const FURNITURE: Furniture[] = [
  { i: 1, j: 0, kind: "desk" },
  { i: 3, j: 0, kind: "desk" },
  { i: 5, j: 0, kind: "desk" },
  { i: 0, j: 2, kind: "rack" },
  { i: 0, j: 3, kind: "rack" },
  { i: 7, j: 0, kind: "desk" },
  { i: 0, j: 8, kind: "plant" },
  { i: 9, j: 0, kind: "plant" },
  { i: 5, j: 5, kind: "desk" },
  { i: 4, j: 5, kind: "desk" },
  { i: 8, j: 8, kind: "plant" },
];

const BLOCKED = new Set(FURNITURE.map((item) => `${item.i},${item.j}`));

type Walker = {
  kind: "person" | "robot";
  i: number;
  j: number;
  targetI: number;
  targetJ: number;
  stepI: number;
  stepJ: number;
  progress: number;
  wait: number;
  speed: number;
  shirt: string;
  hair: string;
  skin: string;
  bubble: number;
  phase: number;
};

const WALKER_SEEDS: Array<Pick<Walker, "kind" | "i" | "j" | "shirt" | "hair" | "skin">> = [
  { kind: "person", i: 2, j: 2, shirt: "#00D2A0", hair: "#2B1B12", skin: "#E8B48C" },
  { kind: "person", i: 5, j: 3, shirt: "#8B5CF6", hair: "#D9A441", skin: "#F1C9A5" },
  { kind: "person", i: 3, j: 6, shirt: "#F59E0B", hair: "#111827", skin: "#B9794E" },
  { kind: "person", i: 6, j: 2, shirt: "#38BDF8", hair: "#7C2D12", skin: "#E8B48C" },
  { kind: "robot", i: 1, j: 4, shirt: "#9AA7B8", hair: "#C5D0DE", skin: "#00D2A0" },
  { kind: "robot", i: 3, j: 7, shirt: "#7C8AA0", hair: "#B4C0D2", skin: "#8B5CF6" },
  { kind: "person", i: 8, j: 4, shirt: "#F472B6", hair: "#3F2A1D", skin: "#F1C9A5" },
  { kind: "person", i: 6, j: 8, shirt: "#E2E8F0", hair: "#111827", skin: "#B9794E" },
];

function isFree(i: number, j: number) {
  return i >= 0 && j >= 0 && i < ROOM_SIZE && j < ROOM_SIZE && !BLOCKED.has(`${i},${j}`);
}

function pickTarget(walker: Walker) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const i = Math.floor(Math.random() * ROOM_SIZE);
    const j = Math.floor(Math.random() * ROOM_SIZE);
    if (isFree(i, j) && (i !== walker.i || j !== walker.j)) {
      walker.targetI = i;
      walker.targetJ = j;
      return;
    }
  }
}

function createWalkers(): Walker[] {
  return WALKER_SEEDS.map((seed, index) => ({
    ...seed,
    targetI: seed.i,
    targetJ: seed.j,
    stepI: 0,
    stepJ: 0,
    progress: 0,
    wait: 20 + index * 25,
    speed: seed.kind === "robot" ? 0.03 : 0.04,
    bubble: 0,
    phase: index * 1.7,
  }));
}

export function PipeeloOfficeScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ctx: CanvasRenderingContext2D = context;
    const view: HTMLCanvasElement = canvas;

    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const walkers = createWalkers();
    let frame: number | null = null;
    let lastRenderAt = 0;
    let tick = 0;
    let originX = 0;
    let originY = 0;

    function resize() {
      const width = view.clientWidth;
      const height = view.clientHeight;
      if (width === 0 || height === 0) return;
      const scale = Math.max(2, Math.floor(Math.min(width / 340, height / 300)));
      view.width = Math.ceil(width / scale);
      view.height = Math.ceil(height / scale);
      originX = Math.floor(view.width / 2);
      originY = Math.floor((view.height - ROOM_SIZE * TILE_HALF_HEIGHT * 2 + WALL_HEIGHT) / 2);
      draw();
    }

    function rect(x: number, y: number, w: number, h: number, color: string) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    }

    function diamond(x: number, y: number, halfWidth: number, color: string) {
      const halfHeight = halfWidth / 2;
      for (let row = 0; row < halfHeight * 2; row++) {
        const half = row < halfHeight ? (row + 1) * 2 : (halfHeight * 2 - row) * 2;
        rect(x - half, y + row, half * 2, 1, color);
      }
    }

    function box(cx: number, cy: number, halfWidth: number, height: number, top: string, left: string, right: string) {
      const halfHeight = halfWidth / 2;
      for (let x = 0; x < halfWidth; x++) {
        rect(cx - halfWidth + x, cy + Math.floor(x / 2) - height, 1, height, left);
        rect(cx + x, cy + halfHeight - Math.floor(x / 2) - height, 1, height, right);
      }
      diamond(cx, cy - halfHeight - height, halfWidth, top);
    }

    function tileCenter(i: number, j: number) {
      return {
        x: originX + (i - j) * TILE_HALF_WIDTH,
        y: originY + (i + j) * TILE_HALF_HEIGHT + TILE_HALF_HEIGHT,
      };
    }

    function drawRoom() {
      const wallLength = ROOM_SIZE * TILE_HALF_WIDTH;
      for (let x = 0; x < wallLength; x++) {
        const y = originY + Math.floor(x / 2);
        rect(originX - 1 - x, y - WALL_HEIGHT, 1, WALL_HEIGHT, COLORS.wallLeft);
        rect(originX + x, y - WALL_HEIGHT, 1, WALL_HEIGHT, COLORS.wallRight);
        rect(originX - 1 - x, y - WALL_HEIGHT, 1, 2, COLORS.wallTop);
        rect(originX + x, y - WALL_HEIGHT, 1, 2, COLORS.wallTop);
        rect(originX - 1 - x, y - 3, 1, 1, COLORS.mintDim);
        rect(originX + x, y - 3, 1, 1, COLORS.mintDim);
      }

      const glow = 0.75 + Math.sin(tick * 0.05) * 0.25;
      ctx.globalAlpha = glow;
      const logoX = originX + 30;
      for (let row = 0; row < LOGO_ROWS.length; row++) {
        const line = LOGO_ROWS[row] ?? "";
        for (let col = 0; col < line.length; col++) {
          const glyph = line[col];
          if (glyph === " " || glyph === undefined) continue;
          const x = logoX + col;
          const y = originY + Math.floor((30 + col) / 2) - WALL_HEIGHT + 14 + row * 2;
          if (glyph === "█" || glyph === "▀") rect(x, y, 1, 1, COLORS.mint);
          if (glyph === "█" || glyph === "▄") rect(x, y + 1, 1, 1, COLORS.mint);
        }
      }
      ctx.globalAlpha = 1;

      for (let w = 0; w < 3; w++) {
        const base = 28 + w * 44;
        for (let x = 0; x < 26; x++) {
          const y = originY + Math.floor((base + x) / 2) - WALL_HEIGHT + 16;
          const lit = (Math.floor(tick / 90) + w) % 3 !== 0;
          rect(originX - 1 - base - x, y, 1, 22, lit ? "#1C2F52" : "#152340");
          if (x === 0 || x === 25 || x === 12) rect(originX - 1 - base - x, y, 1, 22, COLORS.wallTop);
        }
      }

      for (let i = 0; i < ROOM_SIZE; i++) {
        for (let j = 0; j < ROOM_SIZE; j++) {
          const x = originX + (i - j) * TILE_HALF_WIDTH;
          const y = originY + (i + j) * TILE_HALF_HEIGHT;
          const onRug = i >= 3 && i <= 7 && j >= 3 && j <= 7;
          const even = (i + j) % 2 === 0;
          diamond(x, y, TILE_HALF_WIDTH, COLORS.floorEdge);
          diamond(x, y + 1, TILE_HALF_WIDTH - 2, onRug ? (even ? COLORS.rug : COLORS.rugAlt) : even ? COLORS.floorA : COLORS.floorB);
        }
      }
    }

    function drawFurniture(item: Furniture) {
      const { x, y } = tileCenter(item.i, item.j);
      if (item.kind === "desk") {
        box(x, y, 13, 8, COLORS.deskTop, COLORS.deskLeft, COLORS.deskRight);
        box(x, y - 10, 5, 7, COLORS.monitor, COLORS.monitor, COLORS.monitor);
        const flicker = Math.floor(tick / 12 + item.i * 3) % 5;
        for (let px = 0; px < 4; px++) {
          rect(x + px, y - 12 - Math.floor(px / 2) - 3, 1, 4, flicker === px ? COLORS.bubble : COLORS.mint);
        }
        return;
      }
      if (item.kind === "rack") {
        box(x, y, 11, 26, COLORS.rackTop, COLORS.rackLeft, COLORS.rackRight);
        for (let row = 0; row < 5; row++) {
          for (let led = 0; led < 3; led++) {
            const on = Math.floor(tick / 8 + row * 5 + led * 3 + item.j * 7) % 4 !== 0;
            rect(x + 2 + led * 3, y + 3 - Math.floor((2 + led * 3) / 2) - 22 + row * 4, 1, 1, on ? (led === 2 ? COLORS.purple : COLORS.mint) : COLORS.rackLeft);
          }
        }
        return;
      }
      box(x, y, 6, 6, COLORS.potLeft, COLORS.potLeft, COLORS.potRight);
      const sway = Math.round(Math.sin(tick * 0.04 + item.i) * 1);
      rect(x - 1, y - 17, 2, 9, COLORS.leafDark);
      rect(x - 5 + sway, y - 19, 4, 3, COLORS.leaf);
      rect(x + 1 + sway, y - 21, 4, 3, COLORS.leaf);
      rect(x - 3 + sway, y - 24, 5, 3, COLORS.leaf);
      rect(x - 6 + sway, y - 14, 3, 2, COLORS.leafDark);
      rect(x + 3 + sway, y - 15, 3, 2, COLORS.leafDark);
    }

    function drawBubble(x: number, y: number, kind: "person" | "robot") {
      rect(x - 5, y - 9, 11, 8, COLORS.bubble);
      rect(x - 4, y - 10, 9, 1, COLORS.bubble);
      rect(x - 4, y - 1, 9, 1, COLORS.bubble);
      rect(x - 1, y, 2, 1, COLORS.bubble);
      if (kind === "robot") {
        rect(x - 3, y - 5, 1, 1, COLORS.mintDim);
        rect(x - 2, y - 4, 1, 1, COLORS.mintDim);
        rect(x - 1, y - 5, 1, 1, COLORS.mintDim);
        rect(x, y - 6, 1, 1, COLORS.mintDim);
        rect(x + 1, y - 7, 1, 1, COLORS.mintDim);
        rect(x + 2, y - 8, 1, 1, COLORS.mintDim);
        return;
      }
      const dots = Math.floor(tick / 10) % 4;
      for (let dot = 0; dot < 3; dot++) {
        if (dot < dots) rect(x - 3 + dot * 3, y - 5, 1, 2, "#0F172A");
      }
    }

    function drawWalker(walker: Walker) {
      const i = walker.i + walker.stepI * walker.progress;
      const j = walker.j + walker.stepJ * walker.progress;
      const x = Math.round(originX + (i - j) * TILE_HALF_WIDTH);
      const y = Math.round(originY + (i + j) * TILE_HALF_HEIGHT + TILE_HALF_HEIGHT);
      const moving = walker.stepI !== 0 || walker.stepJ !== 0;
      const facingFront = walker.stepI + walker.stepJ >= 0;
      rect(x - 5, y - 1, 10, 3, COLORS.shadow);

      if (walker.kind === "robot") {
        const hover = Math.round(Math.sin(tick * 0.12 + walker.phase) * 1.5);
        const top = y - 22 + hover;
        rect(x - 2, y - 4 + hover, 4, 2, walker.skin);
        rect(x - 4, top + 9, 8, 8, walker.shirt);
        rect(x - 5, top + 11, 1, 4, walker.shirt);
        rect(x + 4, top + 11, 1, 4, walker.shirt);
        rect(x - 4, top + 1, 8, 7, walker.hair);
        if (facingFront) rect(x - 3, top + 3, 6, 2, walker.skin);
        rect(x, top - 2, 1, 3, walker.hair);
        rect(x - 1, top - 3, 3, 1, Math.floor(tick / 15 + walker.phase) % 2 === 0 ? walker.skin : walker.hair);
        if (walker.bubble > 0) drawBubble(x, top - 5, "robot");
        return;
      }

      const stride = moving ? Math.floor(tick / 5 + walker.phase) % 2 : 0;
      rect(x - 3, y - 5, 2, stride === 0 ? 5 : 4, "#1E293B");
      rect(x + 1, y - 5, 2, stride === 0 ? 4 : 5, "#1E293B");
      rect(x - 4, y - 13, 8, 8, walker.shirt);
      rect(x - 5, y - 12, 1, 5, walker.skin);
      rect(x + 4, y - 12, 1, 5, walker.skin);
      rect(x - 3, y - 19, 6, 6, walker.skin);
      rect(x - 4, y - 20, 8, 3, walker.hair);
      if (facingFront) {
        rect(x - 2, y - 16, 1, 1, "#0F172A");
        rect(x + 1, y - 16, 1, 1, "#0F172A");
      } else {
        rect(x - 4, y - 18, 8, 3, walker.hair);
      }
      if (walker.bubble > 0) drawBubble(x, y - 24, "person");
    }

    function draw() {
      ctx.clearRect(0, 0, view.width, view.height);
      drawRoom();
      const items: Array<{ depth: number; render: () => void }> = [];
      for (const item of FURNITURE) items.push({ depth: item.i + item.j + 0.5, render: () => drawFurniture(item) });
      for (const walker of walkers) {
        items.push({
          depth: walker.i + walker.j + (walker.stepI + walker.stepJ) * walker.progress + 0.4,
          render: () => drawWalker(walker),
        });
      }
      items.sort((a, b) => a.depth - b.depth);
      for (const item of items) item.render();
    }

    function update(delta: number) {
      tick += delta;
      for (const walker of walkers) {
        if (walker.bubble > 0) walker.bubble -= delta;
        if (walker.wait > 0) {
          walker.wait -= delta;
          continue;
        }
        if (walker.stepI === 0 && walker.stepJ === 0) {
          if (walker.i === walker.targetI && walker.j === walker.targetJ) {
            pickTarget(walker);
            walker.wait = 40 + Math.random() * 110;
            if (Math.random() < 0.5) walker.bubble = 70;
            continue;
          }
          const towardI = Math.sign(walker.targetI - walker.i);
          const towardJ = Math.sign(walker.targetJ - walker.j);
          const occupied = (i: number, j: number) =>
            walkers.some((other) => other !== walker && other.i + other.stepI === i && other.j + other.stepJ === j);
          if (towardI !== 0 && isFree(walker.i + towardI, walker.j) && !occupied(walker.i + towardI, walker.j)) {
            walker.stepI = towardI;
          } else if (towardJ !== 0 && isFree(walker.i, walker.j + towardJ) && !occupied(walker.i, walker.j + towardJ)) {
            walker.stepJ = towardJ;
          } else {
            pickTarget(walker);
            walker.wait = 15;
          }
          continue;
        }
        walker.progress += walker.speed * delta;
        if (walker.progress >= 1) {
          walker.i += walker.stepI;
          walker.j += walker.stepJ;
          walker.stepI = 0;
          walker.stepJ = 0;
          walker.progress = 0;
        }
      }
    }

    function step(time: number) {
      frame = requestAnimationFrame(step);
      if (time - lastRenderAt < FRAME_INTERVAL_MS) return;
      const delta = Math.min(3, lastRenderAt === 0 ? 1 : (time - lastRenderAt) / 16.6667);
      lastRenderAt = time;
      update(delta);
      draw();
    }

    function sync() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastRenderAt = 0;
      if (motionMedia.matches || document.visibilityState === "hidden") {
        draw();
        return;
      }
      frame = requestAnimationFrame(step);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(view);
    document.addEventListener("visibilitychange", sync);
    motionMedia.addEventListener("change", sync);
    resize();
    sync();

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motionMedia.removeEventListener("change", sync);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      style={{ imageRendering: "pixelated" }}
      aria-hidden="true"
    />
  );
}
