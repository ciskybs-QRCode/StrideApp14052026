import { useEffect, useState } from "react";

interface Props {
  width: number;
  height: number;
  children: React.ReactNode;
  scrollable?: boolean;
}

export function ScaleToFit({ width, height, children, scrollable = false }: Props) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (scrollable) {
        setScale(Math.min(vw / width, 1));
      } else {
        const sx = vw / width;
        const sy = vh / height;
        setScale(Math.min(sx, sy));
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [width, height, scrollable]);

  const scaledW = width * scale;
  const scaledH = height * scale;

  if (scrollable) {
    return (
      <div style={{ background: "#0a0f1e", width: "100vw", minHeight: "100vh", display: "flex", justifyContent: "center" }}>
        <div style={{ width: scaledW, height: scaledH, position: "relative", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ width, height, transformOrigin: "0 0", transform: `scale(${scale})`, position: "absolute", top: 0, left: 0 }}>
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0f1e", width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div style={{ width: scaledW, height: scaledH, position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ width, height, transformOrigin: "0 0", transform: `scale(${scale})`, position: "absolute", top: 0, left: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
