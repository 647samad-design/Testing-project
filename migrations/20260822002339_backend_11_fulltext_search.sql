/*
# Backend Architecture: Full-Text Search Indexes

## Purpose
Add PostgreSQL full-text search (FTS) capabilities for candidate, issue, election, and bill search.

## Changes
### `candidates` — search_vector from first_name, last_name, display_name, party, bio
### `issues` — search_vector from name, slug, category (no description column exists)
### `elections` — search_vector from name, description
### `bills` — search_vector from title, bill_number, description

## Security
- No RLS changes — FTS columns are read-only generated columns
*/

-- Candidates FTS
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(first_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(last_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(display_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(party, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(bio, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_candidates_search ON candidates USING GIN(search_vector);

-- Issues FTS (no description column)
ALTER TABLE issues ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(slug, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_issues_search ON issues USING GIN(search_vector);

-- Elections FTS
ALTER TABLE elections ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_elections_search ON elections USING GIN(search_vector);

-- Bills FTS
ALTER TABLE bills ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(bill_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_bills_search ON bills USING GIN(search_vector);
