# PostgreSQL migrations

Keep `../schema.sql` as the immutable `001_initial_schema` baseline. Add later changes as
`NNN_short_description.sql`, starting at `002`; never edit a migration after it has been applied.

The runner applies files in lexical version order, under a per-database PostgreSQL advisory lock.
Each migration and its SHA-256 ledger row commit in one transaction. Startup stops on checksum drift
or a database ledger version that has no source file. Migrations must be safe for the project's
already-existing data; put explicit conflict/orphan checks before adding constraints.
