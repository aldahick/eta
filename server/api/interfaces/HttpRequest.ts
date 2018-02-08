import * as express from "express";
import Configuration from "../../../lib/Configuration";

export default interface HttpRequest {
    req: express.Request;
    res: express.Response;
    next: express.NextFunction;
    config: Configuration;
}
