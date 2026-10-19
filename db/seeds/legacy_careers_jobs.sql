-- Compatibility seed for the six existing fictional Careers Portal roles.
-- Idempotent: only create missing rows; never overwrite an existing job edited by a user.
-- NULL recruiterId marks imported legacy/demo content until an explicit trusted
-- recruiter ownership-assignment step is implemented. It does not grant edit access.

INSERT INTO "Job"
  ("id", "recruiterId", "title", "department", "description", "location",
   "workMode", "employmentType", "level", "salary", "highlights", "status", "closingAt")
VALUES
  ('web-developer', NULL, 'Web Developer', 'Engineering',
   'Build thoughtful, fast experiences that make complicated work feel simple.',
   'Dhaka, Bangladesh', 'HYBRID', 'FULL_TIME', 'Junior · Mid-level', '৳45k–৳85k / month',
   '["React & TypeScript", "Design systems", "Product collaboration"]'::jsonb,
   'PUBLISHED', NULL),
  ('product-designer', NULL, 'Product Designer', 'Design',
   'Turn customer insight into useful, accessible product experiences.',
   'Remote · Bangladesh', 'REMOTE', 'FULL_TIME', 'Mid-level', '৳55k–৳95k / month',
   '["UX research", "Prototyping", "Accessibility"]'::jsonb,
   'PUBLISHED', NULL),
  ('backend-engineer', NULL, 'Backend Engineer', 'Engineering',
   'Design dependable APIs and services for a product used every day.',
   'Dhaka, Bangladesh', 'HYBRID', 'FULL_TIME', 'Mid-level', '৳70k–৳120k / month',
   '["Node.js", "API design", "Data integrity"]'::jsonb,
   'PUBLISHED', NULL),
  ('qa-engineer', NULL, 'QA Engineer', 'Engineering',
   'Make quality a shared habit through useful automated and exploratory tests.',
   'Dhaka, Bangladesh', 'ON_SITE', 'FULL_TIME', 'Junior · Mid-level', '৳40k–৳75k / month',
   '["Test strategy", "Automation", "Release confidence"]'::jsonb,
   'PUBLISHED', NULL),
  ('data-analyst-intern', NULL, 'Data Analyst Intern', 'Data',
   'Help teams ask sharper questions and make evidence-led decisions.',
   'Remote · Bangladesh', 'REMOTE', 'INTERNSHIP', 'Entry-level', '৳18k–৳25k / month',
   '["SQL fundamentals", "Data storytelling", "Mentorship"]'::jsonb,
   'PUBLISHED', NULL),
  ('customer-success', NULL, 'Customer Success Associate', 'Customer Experience',
   'Help people get real value from products and share feedback with the team.',
   'Dhaka, Bangladesh', 'HYBRID', 'FULL_TIME', 'Entry-level', '৳35k–৳60k / month',
   '["Customer support", "Communication", "Problem solving"]'::jsonb,
   'PUBLISHED', NULL)
ON CONFLICT ("id") DO NOTHING;
