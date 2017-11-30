import constants from "./constants";

export default class CLI {
    private static actions: {[key: string]: (args: string[]) => Promise<void>} = {};
    public static exec(command: string, ...args: string[]): Promise<void> {
        const path = `${constants.basePath}node_modules/@xroadsed/eta-cli/dist/lib/actions/${command.replace(/ /g, "/")}.js`;
        console.log(path);
        if (!this.actions[command]) this.actions[command] = require(path).default;
        console.log(this.actions[command]);
        return this.actions[command](args);
    }
}
