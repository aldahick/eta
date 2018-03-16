import * as chokidar from "chokidar";
import * as eta from "../eta";
import * as events from "events";
import * as fs from "fs-extra";
import * as path from "path";
import Application from "./Application";

const requireReload: (path: string) => any = require("require-reload")(require);

export default class ModuleLoader extends events.EventEmitter {
    public controllers: {[key: string]: typeof eta.IHttpController};
    public lifecycleHandlers: (typeof eta.LifecycleHandler)[];
    /** webPath: fsPath */
    public staticFiles: {[key: string]: string};
    /** webPath: fsPath */
    public viewFiles: {[key: string]: string};
    public viewMetadata: {[key: string]: {[key: string]: any}};

    public moduleName: string;
    public config: eta.ModuleConfiguration;
    public isInitialized = false;

    private app: Application;
    private requireFunc: (path: string) => any = require;

    public constructor(moduleName: string, app: Application) {
        super();
        this.moduleName = moduleName;
        this.app = app;
    }

    public async loadAll(): Promise<void> {
        await this.loadConfig();
        if (this.config.disable || (process.env.ETA_TESTING === "true" && this.config.name !== this.app.configs.global.get("server.testModule"))) {
            return;
        }
        await Promise.all([
            this.loadControllers(),
            this.loadStatic(),
            this.loadViewMetadata(),
            this.loadViews(),
            this.loadLifecycleHandlers()
        ]);
        this.setupWatchers();
        this.requireFunc = requireReload;
        this.isInitialized = true;
    }

    public async loadConfig(): Promise<void> {
        const rootDir: string = eta.constants.modulesPath + this.moduleName + "/";
        const rawConfig: Buffer = await fs.readFile(rootDir + "eta.json");
        this.config = JSON.parse(rawConfig.toString());
        // prepend root dir to all config-based dirs
        this.config.rootDir = rootDir;
        Object.keys(this.config.dirs).forEach(k => {
            const dirs: string[] = (<any>this.config.dirs)[k];
            (<any>this.config.dirs)[k] = dirs.map(d => {
                if (!d.endsWith("/")) {
                    d += "/";
                }
                if (d.startsWith("/")) {
                    d = d.substr(1);
                }
                return this.config.rootDir + d;
            });
        });
        const configPath: string = eta.constants.basePath + "config/modules/" + this.moduleName + ".json";
        if ((await fs.pathExists(configPath)) === true) {
            this.config = eta._.defaults(JSON.parse(await fs.readFile(configPath, "utf-8")), this.config);
        }
        Object.values(this.app.configs).forEach(c => c.buildFromObject(this.config, ["modules", this.moduleName]));
    }

    public async loadControllers(): Promise<void> {
        this.controllers = {};
        const controllerFiles: string[] = (await eta.fs.recursiveReaddirs(this.config.dirs.controllers))
            .filter(f => f.endsWith(".js"));
        controllerFiles.forEach(this.loadController.bind(this));
    }

    private loadController(path: string): typeof eta.IHttpController {
        path = path.replace(/\\/g, "/");
        if (!path.endsWith(".js")) return undefined;
        let controllerType: typeof eta.IHttpController;
        try {
            controllerType = this.requireFunc(path).default;
        } catch (err) {
            eta.logger.warn("Couldn't load controller: " + path);
            eta.logger.error(err);
            return undefined;
        }
        if (controllerType.prototype.route === undefined) {
            eta.logger.warn("Couldn't load controller: " + path + ". Please ensure all decorators are properly applied.");
            return undefined;
        }
        const actions: eta.HttpRouteAction[] = Object.values(controllerType.prototype.route.actions);
        for (const action of actions) { // checking @eta.mvc.flags({script})
            if (!action.flags.script) continue;
            const dir: string = eta._.first(this.config.dirs.controllers.filter(dir =>
                fs.pathExistsSync(dir + action.flags.script)));
            if (dir === undefined) eta.logger.warn("Couldn't find script file " + action.flags.script + " for controller " + path);
            else action.flags.script = dir + action.flags.script;
        }
        this.emit("controller-load", controllerType);
        return controllerType;
    }

    public loadStatic(): Promise<void> {
        this.staticFiles = {};
        return <any>Promise.all(this.config.dirs.staticFiles.map(async d => {
            const files: string[] = await eta.fs.recursiveReaddirs([d]);
            files.forEach(f => {
                const webPath: string = f.substring(d.length - 1);
                this.staticFiles[webPath] = f;
            });
        }));
    }

    public async loadViewMetadata(): Promise<void> {
        this.viewMetadata = {};
        await Promise.all(this.config.dirs.views.map(async viewDir => {
            const files: string[] = (await eta.fs.recursiveReaddirs([viewDir]))
                .filter(f => f.endsWith(".json"));
            for (const filename of files) {
                await this.loadViewMetadataFile(filename, viewDir, false);
            }
        }));
    }

    private async loadViewMetadataFile(filename: string, viewDir: string, forceReload: boolean): Promise<void> {
        const mvcPath = filename.substring(viewDir.length - 1, filename.length - 5);
        if (this.viewMetadata[mvcPath] !== undefined && !forceReload) {
            eta.logger.warn("View metadata " + mvcPath + " was already loaded - keeping the first one found (not " + filename + ").");
            return;
        }
        let metadata: {[key: string]: any};
        try {
            metadata = await fs.readJson(filename);
        } catch (err) {
            eta.logger.warn("Encountered invalid JSON in " + path);
            eta.logger.error(err);
        }
        this.viewMetadata[mvcPath] = metadata;
        this.emit("metadata-load", mvcPath);
    }

    public loadViews(): Promise<void> {
        this.viewFiles = {};
        return <any>Promise.all(this.config.dirs.views.map(async d => {
            const files: string[] = await eta.fs.recursiveReaddirs([d]);
            files.filter(f => f.endsWith(".pug")).forEach(f => {
                const webPath: string = f.substring(d.length - 1);
                this.viewFiles[webPath.substring(0, webPath.length - 4)] = f;
            });
        }));
    }

    public async loadLifecycleHandlers(): Promise<void> {
        const loadResult = await eta.misc.loadModules(this.config.dirs.lifecycleHandlers, this.requireFunc);
        loadResult.errors.forEach(err => eta.logger.error(err));
        this.lifecycleHandlers = loadResult.modules.map(m => m.default);
    }

    private setupWatchers(): void {
        if (!this.app.configs.global.get("dev.enable")) return;
        // controllers
        chokidar.watch(this.config.dirs.controllers, {
            persistent: false
        }).on("change", (path: string) => {
            const HttpController: typeof eta.IHttpController = this.loadController(path);
            if (HttpController !== undefined) {
                eta.logger.trace(`Reloaded controller: ${HttpController.name} (${HttpController.prototype.route.raw})`);
            }
        });
        // view metadata
        chokidar.watch(this.config.dirs.views, {
            persistent: false,
            ignored: /\.pug$/
        }).on("change", (path: string) => {
            path = path.replace(/\\/g, "/");
            const viewDir = this.config.dirs.views.find(d => path.startsWith(d));
            this.loadViewMetadataFile(path, viewDir, true).then(data => {
                eta.logger.trace(`Reloaded view metadata: ${path.substring(viewDir.length)}`);
            }).catch(err => {
                eta.logger.error(err);
            });
        });
    }
}
