-- COLT — Basketball starter content (skills + global drills).
--
-- Runs AFTER ..._000013 has committed the 'basketball' enum value. Adds the
-- basketball-specific skills (shared skills like agility / passing / defence /
-- finishing / decision_making already apply via sport = NULL) and a starter set
-- of global drills (>= 2 per age group) so the Training Library AND the weekly
-- Matchday Set auto-rotation pick basketball up immediately. Text-only
-- (video_url NULL) — real clips are a separate content workstream. Idempotent.

-- 1. Basketball-specific skills (the growing vocabulary; shared skills stay sport-null).
insert into public.skills (key, label, sport)
values
  ('shooting',   'Shooting',   'basketball'),
  ('dribbling',  'Dribbling',  'basketball'),
  ('rebounding', 'Rebounding', 'basketball')
on conflict (key) do nothing;

-- 2. Starter global basketball drills (club_id NULL = visible to every club).
insert into public.drills (club_id, sport, age_group, title, description, duration_min, video_url)
values
  (null, 'basketball', 'u10', 'Pound Dribble Control',
   'Stationary pound dribbles at hip height, both hands, eyes up. Keep the ball low and controlled; swap hands on the coach''s call. Builds early ball-handling and confidence.',
   10, null),
  (null, 'basketball', 'u10', 'Layup Lines',
   'Two-step layups to the rim off both sides, using the backboard. Walk the footwork first, then add a slow dribble in. Focus on the right-foot/left-hand timing (and the reverse).',
   12, null),
  (null, 'basketball', 'u13', 'Triple Threat to Drive',
   'From a balanced triple-threat stance, jab step then drive past a passive defender in a lane. Protect the ball, push off the outside foot, and finish under control.',
   15, null),
  (null, 'basketball', 'u13', 'Form Shooting Progression',
   'Close-range form shooting: balance, elbow in, soft follow-through. Make ten in a row before stepping back. Technique quality over distance.',
   15, null),
  (null, 'basketball', 'u16', 'Pick and Roll Reads',
   'Two-player pick and roll against a passive-to-active defender: read whether to use the screen, split it, or reject it, then make the simple pass or finish. Decision-making over speed.',
   20, null),
  (null, 'basketball', 'u16', 'Box-Out and Rebound',
   'On the shot, find your man, make contact, box out, then secure the rebound with two hands. Controlled technique only — no pushing or jumping into contact.',
   18, null);

-- 3. Tag the new drills with skills (join by title + skill key; global club_id NULL).
insert into public.drill_skills (drill_id, skill_id, club_id)
select d.id, s.id, null
from (values
  ('Pound Dribble Control',     'dribbling'),
  ('Pound Dribble Control',     'agility'),
  ('Layup Lines',               'shooting'),
  ('Layup Lines',               'finishing'),
  ('Triple Threat to Drive',    'dribbling'),
  ('Triple Threat to Drive',    'decision_making'),
  ('Form Shooting Progression', 'shooting'),
  ('Pick and Roll Reads',       'decision_making'),
  ('Pick and Roll Reads',       'passing'),
  ('Box-Out and Rebound',       'rebounding'),
  ('Box-Out and Rebound',       'defence')
) as x(title, skill_key)
join public.drills d
  on d.title = x.title and d.club_id is null and d.sport = 'basketball'
join public.skills s on s.key = x.skill_key
on conflict (drill_id, skill_id) do nothing;
