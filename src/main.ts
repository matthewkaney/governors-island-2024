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
        let args = packet.args;
        let key: string;
        let value: any;

        let eventParams: { [name: string]: any } = {};

        while (args.length > 0) {
          [key, value, ...args] = args;
          eventParams[key] = value;
        }

        let time = timestamp ?? performance.now();
        let duration = "delta" in eventParams ? eventParams.delta * 1000 : 0;

        if ("shape" in eventParams) {
          if (eventParams.shape === "dot") {
            let x = eventParams.x ?? Math.random();
            let y = eventParams.y ?? Math.random();

            activeEvents.push({
              time,
              duration,
              draw: (ctx) => {
                let radius = eventParams.radius ?? 50;
                ctx.fillStyle = eventParams.color ?? "white";
                ctx.beginPath();
                ctx.ellipse(
                  x * width,
                  y * height,
                  radius,
                  radius,
                  0,
                  0,
                  Math.PI * 2
                );
                ctx.fill();
              },
            });
          } else if (eventParams.shape === "line") {
            let x = eventParams.x ?? Math.random();

            let easeIn = eventParams.easeIn ?? 0;
            let easeOut = eventParams.easeOut ?? 0;

            // Offset timing if necessary to accomodate an ease out
            if (easeOut > 0) {
              let oldDuration = duration;
              duration *= 1 + easeOut;
              easeIn *= oldDuration / duration;
              easeOut *= oldDuration / duration;
            }

            activeEvents.push({
              time,
              duration,
              draw: (ctx, delta) => {
                ctx.strokeStyle = eventParams.color ?? "white";
                ctx.lineWidth = 20;
                ctx.beginPath();
                ctx.moveTo(
                  x * width,
                  height * (1 - envOut(delta, easeOut, easeOutCubic))
                );
                ctx.lineTo(
                  x * width,
                  height * (1 - envIn(delta, easeIn, easeInCubic))
                );
                ctx.stroke();
              },
            });
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
  return amount > 1 - duration ? func((amount - (1 - duration)) / duration) : 0;
}

function easeInCubic(x: number) {
  return x * x * x;
}

function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3);
}

interface VisualizationEvent {
  time: number;
  duration: number;
  draw: (ctx: CanvasRenderingContext2D, time: number) => void;
}

let activeEvents: VisualizationEvent[] = [];

let width = window.innerWidth;
let height = window.innerHeight;

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

  for (let event of activeEvents.filter(({ time }) => time <= current)) {
    event.draw(context, (current - event.time) / event.duration);
  }
}
