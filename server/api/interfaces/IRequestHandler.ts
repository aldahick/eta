import * as express from "express";
import * as helpers from "../../../helpers/index";

abstract class IRequestHandler {
    public req: express.Request;
    public res: express.Response;
    public next: Function;

    public constructor(init: Partial<IRequestHandler>) {
        Object.assign(this, init);
    }

    public error(code: number, more?: {[key: string]: any}): void { this.sendRawResponse("error", code, more); }
    public result(code: number, more?: {[key: string]: any}): void { this.sendRawResponse("result", code, more); }

    public redirect(url: string): void {
        this.res.redirect(303, url);
        this.res.end();
        this.res.finished = true;
    }

    public saveSession(): Promise<void> {
        return helpers.session.save(this.req.session);
    }

    public isLoggedIn(): boolean {
        return this.req.session !== undefined && this.req.session.userid !== undefined;
    }

    private sendRawResponse(name: string, code: number, more?: {[key: string]: any}): void {
        if (!more) more = {};
        more[name] = code;
        this.res.raw = more;
    }
}

export default IRequestHandler;
