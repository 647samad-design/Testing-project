-- Fixture for the PostgREST integration tests (db-tests/run-api-tests.sh).
-- Adds a fictional state "Testland" with more than 1,000 district races so the
-- 1,000-row response cap is exercised, plus a race in another state that must
-- never appear on a Testland ballot.
DO $$
DECLARE e uuid := (SELECT id FROM elections ORDER BY election_date DESC LIMIT 1);
BEGIN
  INSERT INTO districts (id, name, district_type, state) VALUES
    ('7e570000-0000-0000-0000-000000000001', 'Testland House 1', 'state_house', 'Testland'),
    ('7e570000-0000-0000-0000-000000000002', 'Testland House 2', 'state_house', 'Testland'),
    ('07e50000-0000-0000-0000-000000000003', 'Otherstate House 9', 'state_house', 'Otherstate');
  INSERT INTO districts (id, name, district_type, state)
    SELECT md5('bulk'||g)::uuid, 'Testland Council '||g, 'municipal', 'Testland' FROM generate_series(1,1200) g;

  INSERT INTO ballot_contests (id, election_id, district_id, office_name, contest_level) VALUES
    ('c7e50000-0000-0000-0000-000000000001', e, '7e570000-0000-0000-0000-000000000001', 'Testland House 1', 'state'),
    ('c7e50000-0000-0000-0000-000000000002', e, '7e570000-0000-0000-0000-000000000002', 'Testland House 2', 'state'),
    ('c07e0000-0000-0000-0000-000000000003', e, '07e50000-0000-0000-0000-000000000003', 'Otherstate House 9', 'state');
  INSERT INTO ballot_contests (election_id, district_id, office_name, contest_level)
    SELECT e, md5('bulk'||g)::uuid, 'Testland Council '||g, 'local' FROM generate_series(1,1200) g;

  INSERT INTO ballot_measures (election_id, district_id, title, measure_type) VALUES
    (e, '7e570000-0000-0000-0000-000000000001', 'Testland House 1 bond', 'local'),
    (e, '07e50000-0000-0000-0000-000000000003', 'Otherstate bond', 'local');

  INSERT INTO candidates (id, first_name, last_name, is_demo) VALUES ('ca7e0000-0000-0000-0000-000000000001', 'Tess', 'Landry', false);
  INSERT INTO candidate_offices (candidate_id, contest_id) VALUES ('ca7e0000-0000-0000-0000-000000000001', 'c7e50000-0000-0000-0000-000000000001');
  -- A leftover sample candidate in the same race (the live DB still has the
  -- fictional seed). It must never show up next to the real one.
  INSERT INTO candidates (id, first_name, last_name, is_demo) VALUES ('ca7e0000-0000-0000-0000-00000000de30', 'Taylor', 'Brooks', true);
  INSERT INTO candidate_offices (candidate_id, contest_id) VALUES ('ca7e0000-0000-0000-0000-00000000de30', 'c7e50000-0000-0000-0000-000000000001');

  INSERT INTO zip_districts (zip_code, state, county, state_house_district_id) VALUES ('99901', 'Testland', 'Test County', '7e570000-0000-0000-0000-000000000001');
  INSERT INTO zip_districts (zip_code, state, county) VALUES ('99902', 'Testland', 'Test County');
END $$;
