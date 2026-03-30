-- Scry seed data
-- ===============
-- Populates the database with sample projects, sites, runs, suites, and findings
-- for local development and testing.
--
-- Usage:
--   1. Replace the @user_id variable below with your actual Supabase auth user UUID.
--      You can find it in the Supabase dashboard under Authentication > Users,
--      or by running: SELECT id FROM auth.users LIMIT 1;
--   2. Run this file against your local Supabase instance:
--        psql -h localhost -p 54322 -U postgres -d postgres -f seed.sql
--      or via the Supabase dashboard SQL editor.
--
-- Note: This script is idempotent-safe only if run on an empty database.
--       Re-running on existing data will create duplicates.

-- ============================================================
-- Set your user ID here
-- ============================================================
\set user_id '''00000000-0000-0000-0000-000000000000'''

-- ============================================================
-- Projects
-- ============================================================
INSERT INTO projects (id, user_id, name, slug, created_at) VALUES
  ('a1000000-0000-0000-0000-000000000001', :user_id, 'Acme Corp',     'acme-corp',     '2026-01-10 09:00:00+00'),
  ('a1000000-0000-0000-0000-000000000002', :user_id, 'Bella Design',  'bella-design',  '2026-01-15 10:00:00+00');

-- ============================================================
-- Sites
-- ============================================================
-- Acme Corp sites
INSERT INTO sites (id, project_id, url, slug, name, created_at) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'https://acme.com',       'acme-com',       'acme.com',       '2026-01-10 09:05:00+00'),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
   'https://shop.acme.com',  'shop-acme-com',  'shop.acme.com',  '2026-01-12 11:00:00+00');

-- Bella Design sites
INSERT INTO sites (id, project_id, url, slug, name, created_at) VALUES
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002',
   'https://belladesign.co',     'belladesign-co',     'belladesign.co',     '2026-01-15 10:05:00+00'),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002',
   'https://blog.belladesign.co','blog-belladesign-co','blog.belladesign.co','2026-01-18 14:00:00+00');

-- ============================================================
-- Runs  (3 per site, varying statuses and dates)
-- ============================================================
-- acme.com runs
INSERT INTO runs (id, site_id, status, pages_tested, suites_run, started_at, completed_at) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
   'pass', 12, '{functionality,accessibility,responsive,visual}',
   '2026-03-01 08:00:00+00', '2026-03-01 08:14:00+00'),
  ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001',
   'warn', 12, '{functionality,accessibility,responsive,visual}',
   '2026-03-10 08:00:00+00', '2026-03-10 08:12:00+00'),
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001',
   'pass', 12, '{functionality,accessibility,responsive,visual}',
   '2026-03-20 08:00:00+00', '2026-03-20 08:11:00+00');

-- shop.acme.com runs
INSERT INTO runs (id, site_id, status, pages_tested, suites_run, started_at, completed_at) VALUES
  ('c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000002',
   'fail', 8, '{functionality,accessibility,responsive,visual}',
   '2026-02-20 10:00:00+00', '2026-02-20 10:09:00+00'),
  ('c1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000002',
   'warn', 8, '{functionality,accessibility,responsive,visual}',
   '2026-03-05 10:00:00+00', '2026-03-05 10:10:00+00'),
  ('c1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000002',
   'fail', 8, '{functionality,accessibility,responsive,visual}',
   '2026-03-18 10:00:00+00', '2026-03-18 10:08:00+00');

-- belladesign.co runs
INSERT INTO runs (id, site_id, status, pages_tested, suites_run, started_at, completed_at) VALUES
  ('c1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000003',
   'pass', 6, '{functionality,accessibility,responsive,visual}',
   '2026-03-02 14:00:00+00', '2026-03-02 14:06:00+00'),
  ('c1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000003',
   'pass', 6, '{functionality,accessibility,responsive,visual}',
   '2026-03-12 14:00:00+00', '2026-03-12 14:05:00+00'),
  ('c1000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000003',
   'warn', 6, '{functionality,accessibility,responsive,visual}',
   '2026-03-22 14:00:00+00', '2026-03-22 14:07:00+00');

-- blog.belladesign.co runs
INSERT INTO runs (id, site_id, status, pages_tested, suites_run, started_at, completed_at) VALUES
  ('c1000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000004',
   'warn', 4, '{functionality,accessibility,responsive,visual}',
   '2026-02-28 16:00:00+00', '2026-02-28 16:04:00+00'),
  ('c1000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000004',
   'pass', 4, '{functionality,accessibility,responsive,visual}',
   '2026-03-08 16:00:00+00', '2026-03-08 16:03:00+00'),
  ('c1000000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000004',
   'pass', 4, '{functionality,accessibility,responsive,visual}',
   '2026-03-19 16:00:00+00', '2026-03-19 16:04:00+00');

-- ============================================================
-- Run suites  (4 suites per run)
-- ============================================================

-- --- acme.com run 1 (pass) ---
INSERT INTO run_suites (run_id, suite, score, status) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'functionality',  98, 'pass'),
  ('c1000000-0000-0000-0000-000000000001', 'accessibility',  95, 'pass'),
  ('c1000000-0000-0000-0000-000000000001', 'responsive',     97, 'pass'),
  ('c1000000-0000-0000-0000-000000000001', 'visual',         99, 'pass');

-- --- acme.com run 2 (warn) ---
INSERT INTO run_suites (run_id, suite, score, status) VALUES
  ('c1000000-0000-0000-0000-000000000002', 'functionality',  96, 'pass'),
  ('c1000000-0000-0000-0000-000000000002', 'accessibility',  72, 'warn'),
  ('c1000000-0000-0000-0000-000000000002', 'responsive',     94, 'pass'),
  ('c1000000-0000-0000-0000-000000000002', 'visual',         91, 'pass');

-- --- acme.com run 3 (pass) ---
INSERT INTO run_suites (run_id, suite, score, status) VALUES
  ('c1000000-0000-0000-0000-000000000003', 'functionality',  99, 'pass'),
  ('c1000000-0000-0000-0000-000000000003', 'accessibility',  96, 'pass'),
  ('c1000000-0000-0000-0000-000000000003', 'responsive',     98, 'pass'),
  ('c1000000-0000-0000-0000-000000000003', 'visual',        100, 'pass');

-- --- shop.acme.com run 1 (fail) ---
INSERT INTO run_suites (run_id, suite, score, status) VALUES
  ('c1000000-0000-0000-0000-000000000004', 'functionality',  45, 'fail'),
  ('c1000000-0000-0000-0000-000000000004', 'accessibility',  68, 'warn'),
  ('c1000000-0000-0000-0000-000000000004', 'responsive',     82, 'pass'),
  ('c1000000-0000-0000-0000-000000000004', 'visual',         77, 'warn');

-- --- shop.acme.com run 2 (warn) ---
INSERT INTO run_suites (run_id, suite, score, status) VALUES
  ('c1000000-0000-0000-0000-000000000005', 'functionality',  88, 'pass'),
  ('c1000000-0000-0000-0000-000000000005', 'accessibility',  74, 'warn'),
  ('c1000000-0000-0000-0000-000000000005', 'responsive',     85, 'pass'),
  ('c1000000-0000-0000-0000-000000000005', 'visual',         80, 'warn');

-- --- shop.acme.com run 3 (fail) ---
INSERT INTO run_suites (run_id, suite, score, status) VALUES
  ('c1000000-0000-0000-0000-000000000006', 'functionality',  52, 'fail'),
  ('c1000000-0000-0000-0000-000000000006', 'accessibility',  60, 'fail'),
  ('c1000000-0000-0000-0000-000000000006', 'responsive',     78, 'warn'),
  ('c1000000-0000-0000-0000-000000000006', 'visual',         85, 'pass');

-- --- belladesign.co run 1 (pass) ---
INSERT INTO run_suites (run_id, suite, score, status) VALUES
  ('c1000000-0000-0000-0000-000000000007', 'functionality',  97, 'pass'),
  ('c1000000-0000-0000-0000-000000000007', 'accessibility',  99, 'pass'),
  ('c1000000-0000-0000-0000-000000000007', 'responsive',     95, 'pass'),
  ('c1000000-0000-0000-0000-000000000007', 'visual',         98, 'pass');

-- --- belladesign.co run 2 (pass) ---
INSERT INTO run_suites (run_id, suite, score, status) VALUES
  ('c1000000-0000-0000-0000-000000000008', 'functionality',  98, 'pass'),
  ('c1000000-0000-0000-0000-000000000008', 'accessibility',  97, 'pass'),
  ('c1000000-0000-0000-0000-000000000008', 'responsive',     96, 'pass'),
  ('c1000000-0000-0000-0000-000000000008', 'visual',         99, 'pass');

-- --- belladesign.co run 3 (warn) ---
INSERT INTO run_suites (run_id, suite, score, status) VALUES
  ('c1000000-0000-0000-0000-000000000009', 'functionality',  94, 'pass'),
  ('c1000000-0000-0000-0000-000000000009', 'accessibility',  91, 'pass'),
  ('c1000000-0000-0000-0000-000000000009', 'responsive',     73, 'warn'),
  ('c1000000-0000-0000-0000-000000000009', 'visual',         88, 'pass');

-- --- blog.belladesign.co run 1 (warn) ---
INSERT INTO run_suites (run_id, suite, score, status) VALUES
  ('c1000000-0000-0000-0000-000000000010', 'functionality',  90, 'pass'),
  ('c1000000-0000-0000-0000-000000000010', 'accessibility',  70, 'warn'),
  ('c1000000-0000-0000-0000-000000000010', 'responsive',     88, 'pass'),
  ('c1000000-0000-0000-0000-000000000010', 'visual',         92, 'pass');

-- --- blog.belladesign.co run 2 (pass) ---
INSERT INTO run_suites (run_id, suite, score, status) VALUES
  ('c1000000-0000-0000-0000-000000000011', 'functionality',  96, 'pass'),
  ('c1000000-0000-0000-0000-000000000011', 'accessibility',  93, 'pass'),
  ('c1000000-0000-0000-0000-000000000011', 'responsive',     95, 'pass'),
  ('c1000000-0000-0000-0000-000000000011', 'visual',         97, 'pass');

-- --- blog.belladesign.co run 3 (pass) ---
INSERT INTO run_suites (run_id, suite, score, status) VALUES
  ('c1000000-0000-0000-0000-000000000012', 'functionality',  97, 'pass'),
  ('c1000000-0000-0000-0000-000000000012', 'accessibility',  95, 'pass'),
  ('c1000000-0000-0000-0000-000000000012', 'responsive',     96, 'pass'),
  ('c1000000-0000-0000-0000-000000000012', 'visual',         98, 'pass');

-- ============================================================
-- Findings  (for runs with warn/fail statuses)
-- ============================================================

-- acme.com run 2 (warn) — accessibility issue
INSERT INTO findings (run_id, suite, rule, severity, page_count, details) VALUES
  ('c1000000-0000-0000-0000-000000000002', 'accessibility', 'color-contrast', 'warning', 3,
   '{"message": "Text does not meet WCAG AA contrast ratio", "selector": ".hero-subtitle", "ratio": "3.8:1", "required": "4.5:1"}'),
  ('c1000000-0000-0000-0000-000000000002', 'accessibility', 'image-alt', 'warning', 2,
   '{"message": "Images missing alt attributes", "selector": "img.decorative", "count": 4}');

-- shop.acme.com run 1 (fail)
INSERT INTO findings (run_id, suite, rule, severity, page_count, details) VALUES
  ('c1000000-0000-0000-0000-000000000004', 'functionality', 'broken-link', 'blocker', 5,
   '{"message": "Internal links returning 404", "urls": ["/products/old-sku", "/returns-policy"]}'),
  ('c1000000-0000-0000-0000-000000000004', 'functionality', 'form-submission', 'blocker', 2,
   '{"message": "Checkout form fails to submit", "selector": "#checkout-form", "error": "500 Internal Server Error"}'),
  ('c1000000-0000-0000-0000-000000000004', 'accessibility', 'aria-label', 'warning', 4,
   '{"message": "Interactive elements missing accessible labels", "selector": "button.icon-only", "count": 6}'),
  ('c1000000-0000-0000-0000-000000000004', 'visual', 'layout-shift', 'warning', 3,
   '{"message": "Cumulative layout shift above threshold", "cls": 0.32, "threshold": 0.1}');

-- shop.acme.com run 2 (warn)
INSERT INTO findings (run_id, suite, rule, severity, page_count, details) VALUES
  ('c1000000-0000-0000-0000-000000000005', 'accessibility', 'heading-order', 'warning', 3,
   '{"message": "Heading levels skip from h2 to h4", "selector": "main h4", "pages": ["/products", "/about", "/faq"]}'),
  ('c1000000-0000-0000-0000-000000000005', 'visual', 'font-rendering', 'warning', 2,
   '{"message": "Custom font fails to load on some pages", "font": "ShopSans", "fallback": "system-ui"}');

-- shop.acme.com run 3 (fail)
INSERT INTO findings (run_id, suite, rule, severity, page_count, details) VALUES
  ('c1000000-0000-0000-0000-000000000006', 'functionality', 'js-error', 'blocker', 6,
   '{"message": "Uncaught TypeError in cart module", "file": "cart.bundle.js", "line": 142}'),
  ('c1000000-0000-0000-0000-000000000006', 'accessibility', 'keyboard-trap', 'blocker', 2,
   '{"message": "Focus trapped in modal with no escape", "selector": "#promo-modal"}'),
  ('c1000000-0000-0000-0000-000000000006', 'responsive', 'overflow-x', 'warning', 4,
   '{"message": "Horizontal scroll on mobile viewports", "breakpoint": "375px", "pages": ["/", "/products", "/cart", "/checkout"]}');

-- belladesign.co run 3 (warn)
INSERT INTO findings (run_id, suite, rule, severity, page_count, details) VALUES
  ('c1000000-0000-0000-0000-000000000009', 'responsive', 'tap-target', 'warning', 2,
   '{"message": "Tap targets too small on mobile", "selector": ".portfolio-grid a", "size": "32x32", "minimum": "44x44"}'),
  ('c1000000-0000-0000-0000-000000000009', 'responsive', 'viewport-meta', 'warning', 1,
   '{"message": "Viewport meta tag uses fixed width", "content": "width=1024"}');

-- blog.belladesign.co run 1 (warn)
INSERT INTO findings (run_id, suite, rule, severity, page_count, details) VALUES
  ('c1000000-0000-0000-0000-000000000010', 'accessibility', 'link-name', 'warning', 3,
   '{"message": "Links have no discernible text", "selector": "a.read-more", "count": 8}'),
  ('c1000000-0000-0000-0000-000000000010', 'accessibility', 'color-contrast', 'warning', 2,
   '{"message": "Body text fails contrast check against background", "ratio": "3.2:1", "required": "4.5:1"}');
