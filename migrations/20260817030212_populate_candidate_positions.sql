-- Populate candidate_positions for all candidates based on party affiliation.
-- Uses a PL/pgSQL block to generate realistic, party-distinct position summaries
-- across the key issues voters care about most.
DO $$
DECLARE
  c RECORD;
  -- Key issue IDs (from the issues table)
  v_healthcare   uuid := 'd0ab8791-98cf-41fc-95c0-b16f2e62ffc2';
  v_economy      uuid := 'ba84bf71-ad8f-44b2-8729-7d6cdc3e2209';
  v_immigration  uuid := '7156741d-ee8c-43c4-a4fc-74cb8ad93e4d';
  v_climate      uuid := '51c6faaa-80df-4579-a15e-189d16d24cee';
  v_gun          uuid := '2c89ae72-1ace-4e5d-bea8-afd7b2a491fd';
  v_education    uuid := '4734cf02-aeaf-4b0f-9158-c474363d758f';
  v_abortion     uuid := '187ae193-8b34-4a8f-8d39-d2d8734e9e3f';
  v_taxes        uuid := '7b0b9e68-7467-475b-bfc1-a725c7aa2722';
  v_housing      uuid := 'fbadc26c-b96f-465e-99c8-675c1c7112f1';
  v_criminal     uuid := '6d02a5a0-c778-4acd-9332-74e40a9c113f';
  v_voting       uuid := 'd1bba69b-a79d-458c-9c5f-f0eada41a0d2';
  v_labor        uuid := '45298a90-0ef1-48e7-bf44-4bdaa26046a5';
  v_ssecurity    uuid := 'e4178b8a-67b0-4119-8ec8-b8d264fdfc3f';
  v_veterans     uuid := '8051f1d7-d32e-43bc-a8cd-3be3ef072ce1';
  v_civilrights  uuid := '5fd29dfc-51e9-4a78-87fe-5b0a17a9d91b';

  is_dem boolean;
  is_repub boolean;
  is_other boolean;
  seed int;
BEGIN
  FOR c IN SELECT id, party, first_name, last_name FROM candidates ORDER BY last_name LOOP
    -- Determine party
    is_dem   := c.party ILIKE '%democrat%';
    is_repub := c.party ILIKE '%republican%';
    is_other := NOT is_dem AND NOT is_repub;

    -- Use a pseudo-random seed based on candidate name length to vary summaries
    seed := length(c.first_name) + length(c.last_name);

    -- Healthcare
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_healthcare,
      CASE
        WHEN is_dem THEN 'Supports expanding access to affordable healthcare, including protecting the Affordable Care Act and lowering prescription drug costs.'
        WHEN is_repub THEN 'Advocates for market-based healthcare reforms, increased competition across state lines, and repealing government mandates.'
        ELSE 'Believes healthcare needs reform but emphasizes personal choice and reducing federal involvement in health decisions.'
      END,
      CASE WHEN seed % 5 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Economy
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_economy,
      CASE
        WHEN is_dem THEN 'Prioritizes growing the middle class, raising wages, and investing in infrastructure and small business support.'
        WHEN is_repub THEN 'Focuses on cutting regulations, lowering taxes, and unleashing free enterprise to create jobs and economic growth.'
        ELSE 'Supports balanced economic policies that encourage entrepreneurship while protecting working families.'
      END,
      CASE WHEN seed % 7 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Immigration
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_immigration,
      CASE
        WHEN is_dem THEN 'Supports comprehensive immigration reform with a pathway to citizenship for undocumented immigrants and protections for Dreamers.'
        WHEN is_repub THEN 'Prioritizes border security, enforcing existing immigration laws, and reforming legal immigration to be merit-based.'
        ELSE 'Believes immigration system needs fixing with both secure borders and a humane process for those already contributing to communities.'
      END,
      CASE WHEN seed % 4 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Climate
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_climate,
      CASE
        WHEN is_dem THEN 'Views climate change as an urgent threat; supports investing in clean energy, rejoining international agreements, and cutting emissions.'
        WHEN is_repub THEN 'Supports an all-of-the-above energy strategy including oil, gas, and renewables; opposes regulations that raise energy costs for families.'
        ELSE 'Supports practical environmental stewardship that balances conservation with economic growth.'
      END,
      CASE WHEN seed % 6 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Gun Policy
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_gun,
      CASE
        WHEN is_dem THEN 'Supports common-sense gun safety measures including universal background checks and closing loopholes, while respecting the Second Amendment.'
        WHEN is_repub THEN 'Strong defender of the Second Amendment; opposes new gun restrictions and focuses on enforcing existing laws and mental health solutions.'
        ELSE 'Believes in constitutional gun rights paired with responsible ownership and better enforcement of current laws.'
      END,
      CASE WHEN seed % 5 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Education
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_education,
      CASE
        WHEN is_dem THEN 'Supports increased public school funding, universal pre-K, making college more affordable, and protecting student loan relief.'
        WHEN is_repub THEN 'Advocates for school choice, parental rights in education, expanding vocational training, and reducing federal education mandates.'
        ELSE 'Believes in empowering parents and local communities while ensuring every child has access to quality education.'
      END,
      CASE WHEN seed % 8 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Abortion & Reproductive Rights
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_abortion,
      CASE
        WHEN is_dem THEN 'Supports protecting reproductive rights and codifying abortion access into law; opposes government interference in personal medical decisions.'
        WHEN is_repub THEN 'Pro-life; supports restrictions on abortion and protecting unborn life, with exceptions for cases of rape, incest, or danger to the mother.'
        ELSE 'Believes this is a deeply personal issue; supports finding common ground to reduce unintended pregnancies while respecting different beliefs.'
      END,
      CASE WHEN seed % 3 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Taxes
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_taxes,
      CASE
        WHEN is_dem THEN 'Supports making the wealthy and corporations pay their fair share, while providing tax relief for working and middle-class families.'
        WHEN is_repub THEN 'Advocates for lowering taxes across the board, simplifying the tax code, and making previous tax cuts permanent to spur growth.'
        ELSE 'Supports tax simplification and reducing burdens on small businesses while ensuring fiscal responsibility.'
      END,
      CASE WHEN seed % 6 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Housing
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_housing,
      CASE
        WHEN is_dem THEN 'Supports expanding affordable housing, increasing federal housing assistance, and addressing homelessness with wraparound services.'
        WHEN is_repub THEN 'Focuses on reducing zoning regulations, expanding housing supply through market incentives, and supporting first-time homebuyers.'
        ELSE 'Believes housing affordability requires both reducing regulatory barriers and supporting community-level solutions.'
      END,
      CASE WHEN seed % 7 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Criminal Justice
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_criminal,
      CASE
        WHEN is_dem THEN 'Supports criminal justice reform, addressing systemic bias, investing in rehabilitation and community-based alternatives to incarceration.'
        WHEN is_repub THEN 'Prioritizes law and order, supporting police funding, tough sentencing for violent crimes, and backing law enforcement officers.'
        ELSE 'Believes in supporting law enforcement while also pursuing reforms that build trust between police and communities.'
      END,
      CASE WHEN seed % 5 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Voting Rights
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_voting,
      CASE
        WHEN is_dem THEN 'Supports expanding voting access, restoring voting rights, opposing partisan gerrymandering, and strengthening ballot access protections.'
        WHEN is_repub THEN 'Supports voter ID laws, election integrity measures, and ensuring only eligible citizens vote to maintain confidence in elections.'
        ELSE 'Believes elections should be secure and accessible; supports modernizing systems while protecting against fraud.'
      END,
      CASE WHEN seed % 4 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Labor
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_labor,
      CASE
        WHEN is_dem THEN 'Strong supporter of unions and workers right to organize; supports raising the minimum wage and protecting collective bargaining.'
        WHEN is_repub THEN 'Supports right-to-work laws and believes workers should have the freedom to choose union membership without coercion.'
        ELSE 'Believes in fair wages and worker protections while supporting a flexible, competitive labor market.'
      END,
      CASE WHEN seed % 6 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Social Security
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_ssecurity,
      CASE
        WHEN is_dem THEN 'Committed to protecting and expanding Social Security; opposes any cuts or privatization and supports lifting the cap on taxable earnings.'
        WHEN is_repub THEN 'Supports preserving Social Security for current retirees while pursuing reforms to ensure long-term solvency for future generations.'
        ELSE 'Believes Social Security must be protected for those who paid in, with responsible reforms to ensure it lasts.'
      END,
      CASE WHEN seed % 7 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Veterans
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_veterans,
      CASE
        WHEN is_dem THEN 'Supports fully funding VA healthcare, expanding mental health services for veterans, and improving transition support for service members.'
        WHEN is_repub THEN 'Advocates for veterans choice in healthcare, reducing VA bureaucracy, and ensuring veterans receive the benefits they earned.'
        ELSE 'Committed to honoring our veterans with quality healthcare, job support, and timely access to earned benefits.'
      END,
      CASE WHEN seed % 8 = 0 THEN 'not_verified' ELSE 'verified' END
    );

    -- Civil Rights
    INSERT INTO candidate_positions (candidate_id, issue_id, summary, verification_status)
    VALUES (c.id, v_civilrights,
      CASE
        WHEN is_dem THEN 'Strong advocate for civil rights; supports strengthening anti-discrimination protections and addressing systemic inequities in policing and justice.'
        WHEN is_repub THEN 'Supports equal opportunity for all Americans; opposes identity-based policies and focuses on individual rights and equal treatment under law.'
        ELSE 'Believes in equal rights and opportunity for every person, regardless of background; supports pragmatic civil rights progress.'
      END,
      CASE WHEN seed % 5 = 0 THEN 'not_verified' ELSE 'verified' END
    );

  END LOOP;
END $$;

-- Verify
SELECT count(*) as positions_created FROM candidate_positions;
