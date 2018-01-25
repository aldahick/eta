import * as cookie from "cookie";
import * as http from "http";
import * as orm from "typeorm";
import * as redis from "redis";
import * as eta from "../eta";
import Application from "../server/Application";

export default class HelperSession {
    public static getFromRequest(req: http.IncomingMessage, redis: redis.RedisClient): Promise<{[key: string]: any}> {
        let sid: string;
        try {
            sid = cookie.parse(<any>req.headers.cookie)["connect.sid"];
        } catch (err) { return undefined; }
        if (!sid) return undefined;
        sid = sid.split(".")[0].substring(2);
        return new Promise((resolve, reject) =>
            redis.get("sess:" + sid, (err: Error, value: string) => {
                if (err) return reject(err);
                try {
                    return resolve(JSON.parse(value));
                } catch (err) {
                    return reject(err);
                }
            })
        );
    }

    public static async promise(session: Express.Session, methodName: "save" | "regenerate" | "destroy"): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            session[methodName].bind(session)((err: Error) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}
