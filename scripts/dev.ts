import { startServer } from "./server.ts";

const port = Number(process.env.PORT ?? 5173);
await startServer(port, true);
console.log(`esplain: http://localhost:${port}`);
