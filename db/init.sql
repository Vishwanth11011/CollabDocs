-- ============================================================
-- CollabDocs — Database Schema
-- ============================================================
-- Run automatically on first PostgreSQL container startup via
-- docker-entrypoint-initdb.d mount.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Documents Table
-- Stores document metadata and Yjs binary state snapshots.
-- content_snapshot uses BYTEA because Yjs serializes state as
-- Uint8Array binary blobs — avoids UTF-8 encoding overhead.
-- ============================================================
CREATE TABLE documents (
    doc_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(255) NOT NULL DEFAULT 'Untitled Document',
    content_snapshot BYTEA,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- URL Mappings Table
-- Maps 7-character Base62 short codes to document IDs.
-- id (BIGSERIAL) is used as input for Base62 encoding to
-- mathematically guarantee zero collisions.
-- ============================================================
CREATE TABLE url_mappings (
    id          BIGSERIAL UNIQUE,
    short_code  CHAR(7) PRIMARY KEY,
    doc_id      UUID NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    click_count BIGINT NOT NULL DEFAULT 0
);

-- B-tree index for O(log N) lookups by doc_id
CREATE INDEX idx_url_mappings_doc_id ON url_mappings(doc_id);

-- ============================================================
-- Seed: Create a welcome document for first-time users
-- ============================================================
INSERT INTO documents (doc_id, title)
VALUES ('00000000-0000-0000-0000-000000000001', 'Welcome to CollabDocs')
ON CONFLICT DO NOTHING;
