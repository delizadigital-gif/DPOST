-- Runs once, when the Postgres container's data volume is first created.
-- A separate database for integration tests, so tests never touch dev data.
CREATE DATABASE dpost_test OWNER dpost;
