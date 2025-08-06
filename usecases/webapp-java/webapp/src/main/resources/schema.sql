DROP TABLE IF EXISTS sampleapp_table;
CREATE TABLE IF NOT EXISTS sampleapp_table
(
    id serial NOT NULL,
    name text COLLATE pg_catalog."default" NOT NULL,
    job0001_flag boolean NOT NULL DEFAULT false,
    job0002_flag boolean NOT NULL DEFAULT false,
    job0003_flag boolean NOT NULL DEFAULT false,
    job0004_flag boolean NOT NULL DEFAULT false,
    job0005_flag boolean NOT NULL DEFAULT false,
    CONSTRAINT sample_app_pkey PRIMARY KEY (id)
);
