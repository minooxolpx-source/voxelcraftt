import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

/**
 * Nunca deixar a tela branca em silêncio: qualquer erro fatal de boot
 * (WebGL indisponível, navegador antigo, bloqueio de script) vira uma
 * mensagem visível.
 */
function showFatal(title: string, detail: string): void {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b100d;font-family:'Chakra Petch',monospace;color:#e8efe6;padding:2rem">
      <div style="max-width:560px;background:#1a211b;border:2px solid #05070a;box-shadow:0 6px 0 rgba(0,0,0,.45);padding:28px 30px">
        <h1 style="font-family:'Press Start 2P',monospace;font-size:16px;color:#e0563f;margin:0 0 14px">VOXEL WORLD</h1>
        <h2 style="margin:0 0 10px;font-size:19px">${title}</h2>
        <p style="color:#9fb3a0;line-height:1.6;font-size:14px;margin:0 0 12px">${detail}</p>
        <p style="color:#79c94e;font-size:13px;margin:0">Dica: use um navegador atualizado (Chrome, Edge ou Firefox) com aceleração de vídeo/WebGL ativada.</p>
      </div>
    </div>`;
}

window.addEventListener("error", (e) => {
  console.error("[VoxelWorld] Erro fatal:", e.error ?? e.message);
  showFatal("O jogo encontrou um erro", String(e.message ?? e.error ?? "Erro desconhecido"));
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[VoxelWorld] Promessa rejeitada:", e.reason);
  showFatal("O jogo encontrou um erro", String(e.reason ?? "Falha inesperada"));
});

try {
  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
} catch (e) {
  console.error("[VoxelWorld] Falha ao montar o React:", e);
  showFatal("Não foi possível iniciar", String(e));
}
