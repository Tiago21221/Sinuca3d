import { describe, expect, it } from "vitest";
import { Controls } from "../js/controls.js";

function createControls() {
  const previousWindow = globalThis.window;
  globalThis.window = { addEventListener() {} };
  const canvas = {
    addEventListener() {},
    setPointerCapture() {},
  };
  const controls = new Controls(canvas, {});
  return {
    controls,
    restore() {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    },
  };
}

describe("controles de jogo", () => {
  it("não transforma o clique de posicionar a branca em tacada", () => {
    const { controls, restore } = createControls();
    let shots = 0;
    let placements = 0;
    controls.enabled = true;
    controls.placeMode = true;
    controls.onShoot = () => shots++;
    controls.onPlace = () => placements++;

    try {
      controls._down({ pointerId: 1, clientX: 10, clientY: 10, button: 0 });
      controls.placeMode = false;
      controls._up({ pointerId: 1 });
      expect(placements).toBe(1);
      expect(shots).toBe(0);
    } finally {
      restore();
    }
  });

  it("usa arrasto horizontal para mirar sem disparar ao soltar", () => {
    const { controls, restore } = createControls();
    let shots = 0;
    controls.enabled = true;
    controls.onShoot = () => shots++;

    try {
      controls._down({ pointerId: 1, clientX: 10, clientY: 10, button: 0 });
      controls._move({ pointerId: 1, clientX: 40, clientY: 10 });
      controls._up({ pointerId: 1 });
      expect(shots).toBe(0);
      expect(controls.aimAngle).not.toBe(0);
    } finally {
      restore();
    }
  });

  it("dispara ao puxar e empurrar o mouse para frente", () => {
    const { controls, restore } = createControls();
    let shots = 0;
    controls.enabled = true;
    controls.onShoot = () => shots++;

    try {
      controls._down({ pointerId: 1, clientX: 10, clientY: 10, button: 0 });
      controls._move({ pointerId: 1, clientX: 10, clientY: 100 });
      controls._move({ pointerId: 1, clientX: 10, clientY: 40 });
      expect(shots).toBe(1);
      expect(controls.power).toBeGreaterThan(0.5);
    } finally {
      restore();
    }
  });

  it("dispara ao soltar depois de puxar o mouse para trás", () => {
    const { controls, restore } = createControls();
    let shots = 0;
    controls.enabled = true;
    controls.onShoot = () => shots++;

    try {
      controls._down({ pointerId: 1, clientX: 10, clientY: 10, button: 0 });
      controls._move({ pointerId: 1, clientX: 10, clientY: 80 });
      controls._up({ pointerId: 1 });
      expect(shots).toBe(1);
      expect(controls.power).toBeGreaterThan(0.4);
    } finally {
      restore();
    }
  });
});
