import app from "./app.js";

const port = Number(process.env.PORT || 5000);
if(!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535");
const server = app.listen(port, () => console.log(`NEXZO backend running on port ${port}`));

server.on("error", error => {
  console.error(JSON.stringify({ level:"error", event:"server_error", message:error?.message || String(error) }));
  process.exit(1);
});

function shutdown(signal){
  console.info(JSON.stringify({ level:"info", event:"shutdown", signal, time:new Date().toISOString() }));
  server.close(error => {
    if(error){
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", error => {
  console.error(JSON.stringify({ level:"error", event:"unhandled_rejection", message:error?.message || String(error) }));
});
