window.addEventListener("load", () => {
  let canvas = document.getElementById("visualization");

  if (!(canvas instanceof HTMLCanvasElement)) return;

  resize(canvas);
  window.addEventListener("resize", () => resize(canvas as HTMLCanvasElement));

  let context = canvas.getContext("2d");

  if (!context) return;

  let lastTime = performance.now();

  const animate = (time: number) => {
    render(lastTime, time, context as CanvasRenderingContext2D);
    lastTime = time;

    requestAnimationFrame(animate);
  };

  requestAnimationFrame(animate);

  window.addEventListener("message", ({ data: message }) => {
    console.log(message);
    if ("ntpTime" in message) {
      let [seconds, fractional] = message.ntpTime;
      let timestamp =
        (seconds - 2208988800 + fractional / 4294967295) * // NTP Epoch to Unix Seconds
          1000 - // In milliseconds
        performance.timeOrigin; // Offset by timeOrigin

      for (let packet of message.packets) {
        let { address, args } = packet;

        let key: string;
        let value: any;

        let params: { [name: string]: any } = {};

        while (args.length > 0) {
          [key, value, ...args] = args;
          params[key] = value;
        }

        let time = timestamp ?? performance.now();
        let duration = "delta" in params ? params.delta * 1000 : 0;

        if (address === "/background") {
          background = params.background ?? "black";
        } else if (address === "/draw") {
          let easeIn = params.easeIn ?? 0;
          let easeOut = params.easeOut ?? 0;

          // Offset timing if necessary to accomodate an ease out
          if (easeOut > 0) {
            let oldDuration = duration;
            duration *= 1 + easeOut;
            easeIn *= oldDuration / duration;
            easeOut *= oldDuration / duration;
          }

          if ("shape" in params) {
            if (params.shape === "dot" || params.shape === "diamond") {
              let toX = params.toX ?? Math.random();
              let toY = params.toY ?? Math.random();
              let fromX = params.fromX ?? toX;
              let fromY = params.fromY ?? toY;

              activeEvents.push({
                time,
                duration,
                draw: (ctx, delta) => {
                  let x = lerp(fromX, toX, delta) * width;
                  let y = lerp(fromY, toY, delta) * height;

                  for (let i = 0; i < 2; ++i) {
                    let radius = params.width * 0.5 ?? 0.25;
                    radius *= width;
                    radius *= Math.max(
                      0,
                      Math.min(
                        envIn(delta, easeIn, easeInOutCubic),
                        envOut(delta, easeOut, easeInOutCubic)
                      )
                    );
                    radius += [5, 0][i];
                    ctx.fillStyle = [background, params.color ?? "white"][i];
                    ctx.beginPath();
                    if (params.shape === "dot") {
                      ctx.ellipse(x, y, radius, radius, 0, 0, Math.PI * 2);
                    } else if (params.shape === "diamond") {
                      radius += [Math.SQRT2, 0][i];
                      ctx.moveTo(x, y - radius);
                      ctx.lineTo(x + radius, y);
                      ctx.lineTo(x, y + radius);
                      ctx.lineTo(x - radius, y);
                      ctx.lineTo(x, y - radius);
                    }
                    ctx.fill();
                  }
                },
              });
            } else if (params.shape === "line") {
              let toX = width * (params.toX ?? Math.random());
              let toY = height * (params.toY ?? Math.random());
              let fromX = width * (params.fromX ?? Math.random());
              let fromY = height * (params.fromY ?? Math.random());

              activeEvents.push({
                time,
                duration,
                draw: (ctx, delta) => {
                  for (let i = 0; i < 2; ++i) {
                    ctx.strokeStyle = [background, params.color ?? "white"][i];
                    ctx.lineWidth =
                      width * (params.width ?? 0.025) + [10, 0][i];

                    let x1 = lerp(
                      fromX,
                      toX,
                      envOut(delta, easeOut, easeInOutCubic)
                    );
                    let y1 = lerp(
                      fromY,
                      toY,
                      envOut(delta, easeOut, easeInOutCubic)
                    );

                    let x2 = lerp(
                      toX,
                      fromX,
                      envIn(delta, easeIn, easeInOutCubic)
                    );
                    let y2 = lerp(
                      toY,
                      fromY,
                      envIn(delta, easeIn, easeInOutCubic)
                    );

                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                  }
                },
              });
            }
          }
        }
      }
    }
  });
});

function lerp(start: number, end: number, amount: number) {
  return (end - start) * amount + start;
}

function envIn(amount: number, duration: number, func = (x: number) => x) {
  return amount < duration ? func(amount / duration) : 1;
}

function envOut(amount: number, duration: number, func = (x: number) => x) {
  return amount > 1 - duration
    ? 1 - func((amount - (1 - duration)) / duration)
    : 1;
}

function easeInCubic(x: number) {
  return x * x * x;
}

function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3);
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

interface VisualizationEvent {
  time: number;
  duration: number;
}

interface DrawEvent extends VisualizationEvent {
  draw: (ctx: CanvasRenderingContext2D, time: number) => void;
}

interface BackgroundEvent extends VisualizationEvent {
  bgColor: string;
}

let activeEvents: (DrawEvent | BackgroundEvent)[] = [];

let width = window.innerWidth;
let height = window.innerHeight;

let background = "black";

function resize(canvas: HTMLCanvasElement) {
  canvas.width = width = window.innerWidth;
  canvas.height = height = window.innerHeight;
}

function render(
  previous: number,
  current: number,
  context: CanvasRenderingContext2D
) {
  context.clearRect(0, 0, width, height);

  activeEvents = activeEvents.filter(
    ({ time, duration }) => time + duration > previous
  );

  const currentEvents = activeEvents.filter(({ time }) => time <= current);

  for (let event of currentEvents) {
    if ("bgColor" in event) {
      background = event.bgColor;
    }
  }

  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  for (let event of currentEvents) {
    if ("draw" in event) {
      event.draw(context, (current - event.time) / event.duration);
    }
  }
}
