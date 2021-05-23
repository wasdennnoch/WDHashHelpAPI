CREATE ROLE hashhelp WITH LOGIN PASSWORD '1234';

CREATE DATABASE hashhelp WITH ENCODING='UTF8' LC_COLLATE='en_US.UTF8' LC_CTYPE='en_US.UTF8';

\c hashhelp

CREATE TABLE imports (
    id                  SERIAL      PRIMARY KEY,
    created_at          TIMESTAMP   NOT NULL        DEFAULT now(),
    type                SMALLINT    NOT NULL        DEFAULT 0, -- 0: Unknown, 1: Discord, 2: Leak
    source              TEXT,                                  -- Such as: Discord message link
    discord_id          TEXT                                   -- If applicable
);
CREATE INDEX ON imports (created_at);

CREATE TABLE hashes (
    id                  BIGSERIAL   PRIMARY KEY,
    fnv32               INTEGER,
    fnv64               BIGINT,
    crc32               INTEGER,
    crc64               BIGINT,
    string              TEXT,
    description         TEXT,
    type                SMALLINT    NOT NULL,                  -- 0: Unknown, 1: File Path, 2: UUID, ...
    CONSTRAINT has_value CHECK (
        fnv32 IS NOT NULL OR
        fnv64 IS NOT NULL OR
        crc32 IS NOT NULL OR
        crc64 IS NOT NULL OR
        string IS NOT NULL
    )
);
CREATE INDEX ON hashes (fnv32);
CREATE INDEX ON hashes (fnv64);
CREATE INDEX ON hashes (crc32);
CREATE INDEX ON hashes (crc64);
CREATE UNIQUE INDEX ON hashes (string);
CREATE UNIQUE INDEX ON hashes (fnv32, fnv64, crc32, crc64);

-- One hash may be edited by multiple imports.
-- For instance, one import might add a hash, and another one the corresponding string.
-- Edge case: Import FNV32s, another import with FNV64s, third import with strings.
   -- Turns out, one of those strings matches two previously separate hashes.
   -- Have to merge them into one row, while preserving the import data of both rows.

CREATE TABLE hash_import_map (
    hash_id             BIGSERIAL   REFERENCES hashes (id),
    import_id           SERIAL      REFERENCES imports (id),
    PRIMARY KEY (hash_id, import_id)
);

CREATE TABLE games (
    id                  SERIAL      PRIMARY KEY,
    name                TEXT        NOT NULL
);

CREATE TABLE archives (
    id                  SERIAL      PRIMARY KEY,
    game_id             INTEGER     REFERENCES games (id),
    name                TEXT        NOT NULL,                  -- Such as: "windy_city.fat", "worlds/london/generated/watersplines.fcb"
    description         TEXT
);

CREATE TABLE hash_archive_map (
    hash_id             BIGSERIAL   REFERENCES hashes (id),
    archive_id          SERIAL      REFERENCES archives (id),
    PRIMARY KEY (hash_id, archive_id)
);


GRANT CONNECT ON DATABASE hashhelp TO hashhelp;
GRANT USAGE ON SCHEMA public TO hashhelp;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO hashhelp;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imports TO hashhelp;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hashes TO hashhelp;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO hashhelp;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archives TO hashhelp;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hash_import_map TO hashhelp;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hash_archive_map TO hashhelp;
