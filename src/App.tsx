import { useEffect, useRef } from "react";
import { Game } from "./game/game";

/**
 * Casca React — o jogo inteiro vive em src/game/* (TypeScript + Three.js).
 * O React apenas monta o contêiner e garante cleanup no desmonte.
 */
export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const game = new Game(host);
    return () => game.dispose();
  }, []);

  return <div ref={hostRef} className="app-host" />;
}
