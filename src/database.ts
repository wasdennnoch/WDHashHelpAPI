import pgPromise, { ColumnSet, IDatabase, IMain } from "pg-promise";
import Config from "./config";
import { hashCrc32, hashCrc64, hashWDFnv32, hashWDFnv64 } from "./hasher";
import Logger from "./logger";
import { RequireOnlyOne } from "./utils";

export enum ImportTypes {
    UNKNOWN,
    DISCORD,
    LEAK,
}

export enum StringTypes {
    UNKNWON,
    FILE_PATH,
}


export interface DBImports {
    id: number;
    created_at: Date;
    type: ImportTypes;
    source: string | null;
    discord_id: string | null;
}

export interface DBHashes {
    id: number;
    fnv32: bigint | null;
    fnv64: bigint | null;
    crc32: bigint | null;
    crc64: bigint | null;
    string: string | null;
    description: string | null;
    type: StringTypes;
}

export interface DBHashImportMap {
    hash_id: DBHashes["id"];
    import_id: DBImports["id"];
}

export interface DBGames {
    id: number;
    name: string;
}

export interface DBArchives {
    id: number;
    game_id: DBGames["id"];
    name: string;
    description: string | null;
}

export interface DBHashArchiveMap {
    hash_id: DBHashes["id"];
    archive_id: DBArchives["id"];
}

type OneHash = RequireOnlyOne<{
    fnv32?: bigint;
    fnv64?: bigint;
    crc32?: bigint;
    crc64?: bigint;
}, "fnv32" | "fnv64" | "crc32" | "crc64">;

export interface ImportStringsArgs {
    strings: ImportStringsStringObject[];
    importType: ImportTypes;
    source?: string;
    discord_id?: string;
}

interface ImportStringsStringObject {
    string: string;
    description?: string;
    type?: StringTypes;
}

export default class Database {

    private static readonly TAG = "Database";
    private static readonly POWERS_OF_TWO: Record<number, bigint> = {
        31: 2_147_483_648n,
        32: 4_294_967_296n,
        63: 9_223_372_036_854_775_808n,
        64: 18_446_744_073_709_551_616n,
    };
    private static readonly INSERT_BATCH_SIZE = 10_000;

    private readonly pgp: IMain;
    private readonly db: IDatabase<{}>;
    private readonly insertTempHashColumns: ColumnSet;

    public constructor() {
        this.pgp = pgPromise({
            capSQL: true,
        });
        this.pgp.pg.types.setTypeParser(20, BigInt);
        this.db = this.pgp({
            host: Config.db.postgres.host || undefined,
            port: Config.db.postgres.port || undefined,
            database: Config.db.postgres.database,
            user: Config.db.postgres.user,
            password: Config.db.postgres.password,
        });
        this.insertTempHashColumns = new this.pgp.helpers.ColumnSet(
            ["fnv32", "fnv64", "crc32", "crc64", "string", "description", "type"],
            { table: "temp_hashes" },
        );
    }

    public async init(): Promise<void> {
        Logger.debug(Database.TAG, "Connecting...");
        await this.db.connect();
    }

    public async createArchive(data: Omit<DBArchives, "id">): Promise<void> {
        await this.db.none("INSERT INTO archives (game_id, name, type, description) VALUES " +
            "($[game_id], $[name], $[type], $[description])", data);
    }

    public async findHash(hash: OneHash): Promise<DBHashes[]> {
        const chosenHash = Object.keys(hash)[0] as keyof OneHash;
        const res = await this.db.any<DBHashes>(`SELECT * FROM hashes WHERE ${chosenHash} = $[hash]`, {
            hash: hash[chosenHash],
        });
        return res.map(r => ({
            ...r,
            fnv32: this.fromDBBigint(r.fnv32, 32),
            fnv64: this.fromDBBigint(r.fnv64, 64),
            crc32: this.fromDBBigint(r.crc32, 32),
            crc64: this.fromDBBigint(r.crc64, 64),
        }));
    }

    public async importStrings(data: ImportStringsArgs): Promise<void> {
        Logger.info(Database.TAG, `Importing ${data.strings.length} strings with import type ${data.importType}`);

        await this.db.tx(async t => {

            Logger.debug(Database.TAG, `Creating temporary tables`);
            // Note: This table uses the same sequence as the main one, which guarantees us unique IDs
            await t.none("CREATE TEMP TABLE IF NOT EXISTS temp_hashes (LIKE hashes INCLUDING DEFAULTS) ON COMMIT DELETE ROWS");
            await t.none(`
                CREATE TEMP TABLE IF NOT EXISTS temp_duplicates (
                    new_id         BIGINT      NOT NULL,
                    orig_id        BIGINT      NOT NULL,
                    import_id      INTEGER,
                    archive_id     INTEGER
                ) ON COMMIT DELETE ROWS
            `);
            // TODO Indexes on temp_duplicates? Or not required?

            Logger.debug(Database.TAG, `Inserting new values into temporary table`);
            const seenStrings = new Set<string>();
            let totalSeenCount = 0;
            for (let i = 0; i < data.strings.length; i += Database.INSERT_BATCH_SIZE) {
                const slicedChunk = data.strings.slice(i, i + Database.INSERT_BATCH_SIZE);
                const batch: Omit<DBHashes, "id">[] = [];
                totalSeenCount += slicedChunk.length;
                for (const entry of slicedChunk) {
                    if (seenStrings.has(entry.string)) {
                        continue;
                    }
                    seenStrings.add(entry.string);
                    // TODO Ideally the DB would first remove already existing strings and
                    // after that I generate and insert the hashes for the remaining strings
                    batch.push({
                        ...entry,
                        description: entry.description ?? null,
                        type: entry.type ?? StringTypes.UNKNWON,
                        fnv32: this.toDBBigint(hashWDFnv32(entry.string), 32),
                        fnv64: this.toDBBigint(hashWDFnv64(entry.string), 64),
                        crc32: this.toDBBigint(hashCrc32(entry.string), 32),
                        crc64: this.toDBBigint(hashCrc64(entry.string), 64),
                    });
                }
                Logger.debug(Database.TAG, `Inserting batch of ${batch.length} items, ${data.strings.length - totalSeenCount} remaining`);
                if (!batch.length) {
                    continue;
                }
                await t.none(this.pgp.helpers.insert(batch, this.insertTempHashColumns));
            }
            Logger.debug(Database.TAG, `After deduplication ${seenStrings.size} strings have been inserted (${
                data.strings.length - seenStrings.size} duplicates)`);

            Logger.debug(Database.TAG, `Analyzing temp_hashes`);
            await t.none("ANALYZE temp_hashes");

            Logger.debug(Database.TAG, `Removing already existing strings from new table`);
            const existingStringCount = await t.result<number>(`
                DELETE FROM temp_hashes t
                USING hashes h
                WHERE t.string = h.string
            `, null, r => r.rowCount);
            const newStringCount = seenStrings.size - existingStringCount;
            Logger.debug(Database.TAG, `${existingStringCount} items were already in DB (${newStringCount} new)`);

            Logger.debug(Database.TAG, `Copying matching hash duplicates without strings to temp table`);
            await t.none(`
                INSERT INTO temp_duplicates (
                    new_id, orig_id, import_id, archive_id
                ) (
                    SELECT t.id AS new_id, h.id AS orig_id, hi.import_id, ha.archive_id
                    FROM hashes h
                    INNER JOIN temp_hashes t ON (
                        (h.fnv32 = t.fnv32 OR h.fnv32 IS NULL) AND
                        (h.fnv64 = t.fnv64 OR h.fnv64 IS NULL) AND
                        (h.crc32 = t.crc32 OR h.crc32 IS NULL) AND
                        (h.crc64 = t.crc64 OR h.crc64 IS NULL)
                    )
                    LEFT JOIN hash_import_map hi ON (
                        hi.hash_id = h.id
                    )
                    LEFT JOIN hash_archive_map ha ON (
                        ha.hash_id = h.id
                    )
                    WHERE h.string IS NULL
                )
            `);
            // TODO import_id and archive_id may be null

            Logger.debug(Database.TAG, `Analyzing temp_duplicates`);
            await t.none("ANALYZE temp_duplicates");

            Logger.debug(Database.TAG, `Deleting duplicate entries from original table`);
            await t.none(`
                DELETE FROM hashes h
                USING temp_duplicates d
                WHERE h.id = d.orig_id
            `);

            Logger.debug(Database.TAG, `Copying new hashes from temp table to main one`);
            // This also copies the temp IDs. Those are however generated by the same sequence as the main table,
            // so there will not be any collisions and the IDs are globally unique.
            // TODO Handle description conflicts instead of just overriding the old ones
            await t.none(`INSERT INTO hashes (SELECT * FROM temp_hashes)`);

            Logger.debug(Database.TAG, `Restoring original import mappings`);
            await t.none(`
                INSERT INTO hash_import_map (
                    hash_id, import_id
                ) (
                    SELECT new_id AS hash_id, import_id
                    FROM temp_duplicates
                    WHERE import_id IS NOT NULL
                    GROUP BY new_id, import_id
                )
            `);

            Logger.debug(Database.TAG, `Restoring original archive mappings`);
            await t.none(`
                INSERT INTO hash_archive_map (
                    hash_id, archive_id
                ) (
                    SELECT new_id AS hash_id, archive_id
                    FROM temp_duplicates
                    WHERE archive_id IS NOT NULL
                    GROUP BY new_id, archive_id
                )
            `);

            Logger.debug(Database.TAG, `Creating new import for this transaction`);
            const newImportId = await t.one<{ id: number }>(`
                INSERT INTO imports (
                    type, source, discord_id
                ) VALUES (
                    $[type], $[source], $[discordId]
                ) RETURNING id
            `, {
                type: data.importType,
                source: data.source ?? null,
                discordId: data.discord_id ?? null,
            });

            Logger.debug(Database.TAG, `Inserting import mapping for new hashes`);
            await t.none(`
                INSERT INTO hash_import_map (
                    hash_id, import_id
                ) (
                    SELECT id AS hash_id, ${newImportId.id}::INTEGER AS import_id
                    FROM temp_hashes
                )
            `);

            Logger.info(Database.TAG, `Imported ${newStringCount} new strings`);

        });

    }

    private toDBBigint(num: bigint, pow: number): bigint {
        if (num > Database.POWERS_OF_TWO[pow - 1]) {
            return num - Database.POWERS_OF_TWO[pow];
        }
        return num;
    }

    private fromDBBigint(num: bigint | null, pow: number): bigint | null {
        if (num === null) {
            return null;
        }
        if (num < 0n) {
            return num + Database.POWERS_OF_TWO[pow];
        }
        return num;
    }

}
