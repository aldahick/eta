import * as express from "express";
import IRequestHandler from "./IRequestHandler";
import WebServer from "../../WebServer";

abstract class IHttpController extends IRequestHandler {
    public routes: ({
        regex: RegExp;
        map: string[];
        raw: string;
    } | string)[] = [];
    public actions: {[key: string]: {
        flags: {[key: string]: string | number | boolean | RegExp};
        method: "GET" | "POST";
        useView: boolean;
        isAuthRequired: boolean;
        permissionsRequired: string[];
    }} = {};
    public server: WebServer;
    public params: {[key: string]: string} = {};

    public constructor(init: Partial<IHttpController>) {
        super(init);
        Object.assign(this, init);
    }

    public getRoutes(): string[] {
        return this.routes.map(r => {
            if (typeof(r) === "string") return r;
            return r.raw;
        });
    }
}

export default IHttpController;
