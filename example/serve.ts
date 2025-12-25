import index from "./index.html";

let server = Bun.serve({
    port: 1234,
    routes: { '/*': index },
    development: process.env.NODE_ENV != "production" && {
        hmr: true,
        console: true
    }
});

console.log(`🚀 Server running at ${server.url}`);