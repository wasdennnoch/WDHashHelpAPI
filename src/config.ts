// tslint:disable-next-line: no-var-requires
const config = require("../config");

interface Web {
    port: number;
}

interface DB {
    postgres: {
        host: string | null;
        port: number | null;
        database: string;
        user: string;
        password: string;
    };
}

export default class Config {

    public static web: Web = config.web;
    public static db: DB = config.db;

}