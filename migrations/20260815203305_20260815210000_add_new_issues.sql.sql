-- Add new issues
INSERT INTO issues (name, slug, category, is_custom) VALUES
  ('Cost of Living', 'cost-of-living', 'Domestic Policy', false),
  ('Gun Violence', 'gun-violence', 'Domestic Policy', false),
  ('Abortion & Reproductive Rights', 'abortion-reproductive-rights', 'Domestic Policy', false),
  ('Dark Money & Campaign Finance', 'dark-money-campaign-finance', 'Democracy', false),
  ('Political Division & Polarization', 'political-division-polarization', 'Democracy', false)
ON CONFLICT (slug) DO NOTHING;