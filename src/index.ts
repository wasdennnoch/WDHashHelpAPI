import Koa from "koa";
import Router from "@koa/router";
import koaBody from "koa-body";
import Logger from "./logger";
import Database from "./database";
import Config from "./config";

const TAG = "Index";

// eslint-disable-next-line arrow-body-style
const checkAuth = (ctx: Koa.BaseContext, next: Koa.Next) => {
/*     const auth = ctx.get("Authorization") || ctx.query.auth;
    if (auth !== "a") {
        ctx.status = 401;
        return;
    } */
    return next();
};

const jsonParser = koaBody({
    multipart: false,
    urlencoded: false,
    text: false,
    json: true,
    jsonLimit: 10 * 1024,
    jsonStrict: true,
    onError: (err, ctx) => {
        Logger.info(TAG, "Couldn't parse request body", err);
        ctx.status = 400;
        ctx.body = "Invalid form body";
    },
});

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
async function run() {

    Logger.info(TAG, "Starting up...");

    const db = new Database();
    await db.init();

    // const path = "E:\\WD Modding\\WD3 Mod\\BIGFILE\\filelist.txt";
/*     const path = "G:\\Games\\Ubisoft\\Watch_Dogs\\bin_mine\\filelist.txt";
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const lines = fs.readFileSync(path, "utf8").replace(/\r/g, "").split("\n") as string[];
    const strings = lines; */

    const strings = ["lol"];
    await db.importStrings({
        importType: 0,
        strings: strings.map(s => ({ string: s })),
    });

    process.exit(0);
    return;

    const app = new Koa();
    const router = new Router();

/*     router.post("/create", checkAuth, jsonParser, async ctx => {
        const body = ctx.request.body;
        ctx.assert(
            body.path && typeof body.path === "string" && body.path.length <= 1000 &&
            body.originalName && typeof body.originalName === "string" && body.originalName.length <= 1000, 400, "Invalid body");
        Logger.debug(TAG, `Creating new file ${body.path} (original: ${body.originalName})`);
        await db.createNewFile(body.path, body.originalName);
        ctx.status = 200;
    }); */

    app.use(router.allowedMethods()).use(router.routes());

    await new Promise<void>(resolve => {
        app.listen(Config.web.port, () => {
            Logger.info(TAG, `Listening on port ${Config.web.port}`);
            resolve();
        });
    });

}

run().catch(err => {
    Logger.wtf(TAG, "Error starting app", err);
});

process.on("uncaughtException", err => {
    Logger.wtf(TAG, "Uncaught Exception", err);
});

process.on("unhandledRejection", err => {
    Logger.error(TAG, "Unhandled Rejection", err as Error);
});
