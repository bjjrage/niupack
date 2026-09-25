import { spawn, exec, execSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";

const PORT = 3000;

console.log("===================================================");
console.log("      NIU INTELLIGENCE OS - Invocador Local        ");
console.log("            GARDINER S.A. (NIUPACK)                ");
console.log("===================================================");

// 1. Liberar puerto si quedó ocupado por un proceso previo colgado
try {
  const stdout = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });
  const lines = stdout.trim().split("\n");
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && !isNaN(Number(pid))) {
      console.log(`[INFO] Liberando puerto ${PORT} (PID anterior: ${pid})...`);
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
      } catch {}
    }
  }
} catch {
  // No había procesos en el puerto
}

// 2. Limpiar cache previa de .next (previene desincronización tras build previo)
if (fs.existsSync(".next")) {
  try {
    fs.rmSync(".next", { recursive: true, force: true });
    console.log("[INFO] Cache de compilación (.next) limpiada correctamente.");
  } catch (err) {
    console.log("[AVISO] No se pudo limpiar .next por bloqueo temporal, continuando...");
  }
}

// 3. Crear .env.local si no existe
if (!fs.existsSync(".env.local") && fs.existsSync(".env.example")) {
  try {
    fs.copyFileSync(".env.example", ".env.local");
    console.log("[INFO] Archivo .env.local creado desde .env.example.");
  } catch {}
}

console.log(`\nIniciando servidor Next.js en http://localhost:${PORT}...`);
console.log("Esperando que el servidor responda para abrir el navegador...\n");

const devServer = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PORT: String(PORT) },
});

let browserOpened = false;

const checkReady = setInterval(() => {
  const req = http.get(`http://localhost:${PORT}`, (res) => {
    if (!browserOpened && res.statusCode) {
      browserOpened = true;
      clearInterval(checkReady);
      console.log(`\n===================================================`);
      console.log(` [OK] NIU Intelligence OS listo en http://localhost:${PORT}`);
      console.log(` [OK] Abriendo navegador...`);
      console.log(`===================================================\n`);
      exec(`start http://localhost:${PORT}`);
    }
  });

  req.on("error", () => {
    // Servidor aún levantándose
  });
}, 800);

devServer.on("error", (err) => {
  console.error("\n[ERROR al iniciar el servidor]:", err);
});

devServer.on("close", (code) => {
  clearInterval(checkReady);
  console.log(`\nEl servidor se detuvo con código: ${code}`);
});
