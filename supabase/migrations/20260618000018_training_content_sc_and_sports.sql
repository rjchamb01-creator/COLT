-- COLT — Training content build-out: a cross-sport S&C bank + deeper RL/Basketball
--
-- Two changes the content model needed:
--   1. A shared Strength & Conditioning bank that applies to EVERY sport. We model
--      "cross-sport" the same way the schema already models "all clubs" (club_id
--      NULL) and "all sports" on skills (skills.sport NULL): make drills.sport
--      NULLABLE, where sport IS NULL = a general S&C / conditioning drill that
--      every athlete can use, regardless of sport.
--   2. Deeper sport-specific content for Rugby League and Basketball (the pilot
--      sports). Soccer is being hidden in the app layer (removed from the sport
--      pickers); its enum value + existing drills are left intact here.
--
-- All new drills are GLOBAL (club_id NULL), text-only (video_url NULL — filming is
-- a separate human workstream), and difficulty-graded (1 intro → 3 advanced) so the
-- Matchday rotation and the AI Program Recommender have richer, progressive inputs.
--
-- YOUTH-SAFETY: these are standard, widely-used, age-appropriate drills — cones,
-- balls, bibs, bodyweight only. For u10/u13 there is NO loaded resistance, NO
-- max-effort, NO contact tackling (tag/technique only); light bodyweight strength
-- and controlled technique work appears only from u13/u16. They are a vetted
-- STARTER SET for the pilot's expert coach to review/refine — not the final word.

-- ---------------------------------------------------------------------------
-- 1. Make sport nullable. sport IS NULL = the cross-sport S&C bank.
-- ---------------------------------------------------------------------------

alter table public.drills alter column sport drop not null;

-- ---------------------------------------------------------------------------
-- 2. New skills. Global (sport NULL) S&C/athletic skills apply to every drill;
--    sport-specific skills enrich RL / Basketball tagging.
-- ---------------------------------------------------------------------------

insert into public.skills (key, label, sport)
values
  ('speed',        'Speed',        null),
  ('strength',     'Strength',     null),
  ('mobility',     'Mobility',     null),
  ('coordination', 'Coordination', null),
  ('footwork',     'Footwork',     null),
  ('tackling',     'Tackling',     'rugby_league'),
  ('kicking',      'Kicking',      'rugby_league'),
  ('support_play', 'Support Play', 'rugby_league'),
  ('court_vision', 'Court Vision', 'basketball')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. The cross-sport Strength & Conditioning bank (sport NULL), by age group.
-- ---------------------------------------------------------------------------

insert into public.drills (club_id, sport, age_group, title, description, duration_min, difficulty)
values
  -- S&C · Under 10 (fun, mechanics, coordination — no weights)
  (null, null, 'u10', 'Animal Movement Warm-Up', 'Move through bear crawls, crab walks, frog jumps and inchworms across 10 metres. Builds full-body coordination and warms everything up — make it a game.', 8, 1),
  (null, null, 'u10', 'Running Tall Basics', 'March then jog focusing on tall posture, relaxed arms driving hand-to-pocket, and quiet landings. Teaches good running shape early.', 10, 1),
  (null, null, 'u10', 'Reaction Tag', 'On a colour or number call, sprint, freeze, or change direction. Short bursts with full rest. Builds reaction speed and fun.', 10, 1),
  (null, null, 'u10', 'Cone Weave Footwork', 'Weave through a line of cones using small, quick steps, then jog back. Both leading feet. Light and snappy.', 8, 1),
  (null, null, 'u10', 'Jump and Stick', 'Two-foot jump forward and land softly on two feet, holding the landing for two seconds. Teaches safe, balanced landings.', 8, 1),
  (null, null, 'u10', 'Short Shuttle Runs', 'Sprint 10 metres, touch the line, jog back. Repeat for the set with plenty of rest. Builds speed and habit.', 10, 2),
  (null, null, 'u10', 'Skip & Ladder Coordination', 'Skipping on the spot and simple agility-ladder patterns (one foot, two feet in). Rhythm and coordination, no rush.', 8, 1),
  (null, null, 'u10', 'Bodyweight Fun Circuit', 'Star jumps, squats to a low box, and slow mountain climbers in short rounds. Light, playful, bodyweight only.', 10, 1),
  -- S&C · Under 13 (building mechanics + conditioning)
  (null, null, 'u13', 'Dynamic Warm-Up Flow', 'Lunges with a twist, leg swings, hip openers and arm circles moving down the pitch. Prepares the body and improves mobility.', 10, 1),
  (null, null, 'u13', 'Acceleration Wall Drives', 'Lean into a wall and drive one knee up powerfully, holding tall posture. Singles then quick alternating. Teaches the acceleration position.', 12, 2),
  (null, null, 'u13', 'Sprint Mechanics — A-Skips', 'A-skip down 15 metres focusing on knee drive, dorsiflexed foot and arm action. Walk back. Clean technique over speed.', 12, 2),
  (null, null, 'u13', 'Lateral Bound & Stick', 'Bound sideways onto one leg and stick the landing balanced for two seconds. Builds single-leg control and agility.', 10, 2),
  (null, null, 'u13', '20m Build-Up Sprints', 'Accelerate smoothly to about 80% over 20 metres, hold, then ease down. Full walk-back recovery. Speed with control.', 12, 2),
  (null, null, 'u13', 'Change-of-Direction 5-10-5', 'From the middle, sprint 5m, plant and drive back 10m, then 5m to finish. Sharp plants, low hips. Both directions.', 12, 2),
  (null, null, 'u13', 'Core Stability Circuit', 'Front plank, dead bugs and bird-dogs in short holds. Slow and controlled, bodyweight only. Builds a stable trunk.', 12, 2),
  (null, null, 'u13', 'Tempo Conditioning Runs', 'Relaxed runs at about 70% over 40–60 metres with a walk-back between. Builds an aerobic base without flogging.', 15, 2),
  -- S&C · Under 16 (advanced bodyweight, technique-led)
  (null, null, 'u16', 'Comprehensive Dynamic Warm-Up', 'A full prep routine: mobility, activation, leg swings, skips and strides building to near-sprint pace. Ready to perform and injury-aware.', 12, 2),
  (null, null, 'u16', 'Max-Velocity Sprint Technique', 'Build-up "fly" runs hitting top speed over a short zone, focusing on relaxed face, tall posture and powerful, cyclic legs. Long rest between reps.', 15, 3),
  (null, null, 'u16', 'Resisted Acceleration Starts', 'Partner- or band-resisted starts over 10 metres, driving low and powerful out of the first steps. Controlled effort, full recovery.', 12, 3),
  (null, null, 'u16', 'Reactive Mirror Agility', 'Mirror a partner''s side-to-side and forward-back movement inside a small box. Read and react — agility plus decision speed.', 12, 3),
  (null, null, 'u16', 'Plyometric Hops & Bounds', 'Low-level pogo hops, broad jumps and bounds with soft, balanced landings. Quality over quantity — technique is the point.', 12, 3),
  (null, null, 'u16', 'Single-Leg Strength Circuit', 'Split squats, bodyweight single-leg RDLs and calf raises in controlled rounds. Builds leg strength and balance — bodyweight only.', 15, 3),
  (null, null, 'u16', 'Repeated-Sprint Conditioning', 'Repeated near-max sprints over 20–30m on a short cycle. Builds the ability to back up efforts — the engine for any sport.', 15, 3),
  (null, null, 'u16', 'Mobility & Recovery Flow', 'A guided cooldown of hip, ankle and thoracic mobility plus easy stretching. Aids recovery and keeps the body moving well.', 12, 2);

-- ---------------------------------------------------------------------------
-- 4. Rugby League (sport-specific), by age group.
-- ---------------------------------------------------------------------------

insert into public.drills (club_id, sport, age_group, title, description, duration_min, difficulty)
values
  -- RL · Under 10 (no-contact: tag, handling, technique)
  (null, 'rugby_league', 'u10', 'Two-Hand Catch Basics', 'Catch with two hands and "soft" arms, eyes on the ball, fingers spread. Progress from short feeds to higher catches.', 8, 1),
  (null, 'rugby_league', 'u10', 'Lateral Pass Lines', 'In a line, pass across the body with two hands, hips and chest turning to the target. Pass and follow. Both directions.', 10, 1),
  (null, 'rugby_league', 'u10', 'Play-the-Ball Technique', 'Walk through a clean play-the-ball: control the ball, place it back with the foot, dummy-half collects. Slow and correct first.', 8, 1),
  (null, 'rugby_league', 'u10', 'Tag Defending Footwork', 'Using tag belts, shuffle square and side-on, take a tag, then reset onside. No contact — footwork and positioning only.', 10, 1),
  (null, 'rugby_league', 'u10', 'Pop Pass & Support', 'Short pop pass to a runner hitting the line, who calls for it. Teaches timing and getting in support.', 10, 1),
  (null, 'rugby_league', 'u10', 'Ground Ball Presentation', 'Practise presenting the ball cleanly on the ground, long and square, then springing up. Builds a tidy ruck habit.', 8, 1),
  (null, 'rugby_league', 'u10', 'Catch-Pass Under Light Pressure', 'A passive defender shows on one side; catch, decide and pass to space. Heads up, simple decisions.', 10, 2),
  (null, 'rugby_league', 'u10', 'Grubber Kick Intro', 'Drop the ball onto a flat foot to roll a low grubber along the ground to a target. Technique and contact point only.', 8, 1),
  -- RL · Under 13 (intro safe contact technique + skills)
  (null, 'rugby_league', 'u13', 'Side-On Tackle Technique', 'From knees then a walking start, practise a safe side-on tackle: cheek-to-cheek, head behind, arms wrap, ring the bell. Technique only — controlled and progressive.', 12, 2),
  (null, 'rugby_league', 'u13', 'Play-the-Ball Speed Reps', 'Sharp, repeated play-the-balls focusing on a quick, square ruck and fast dummy-half service. Builds ruck tempo.', 10, 2),
  (null, 'rugby_league', 'u13', 'Long Spiral Pass', 'Pass over longer distance with a spiral, rotating hips and following through to the target. Both sides.', 12, 2),
  (null, 'rugby_league', 'u13', 'Draw and Pass 2v1', 'Two attackers versus one defender: commit the defender, then pass to put the free runner away. Timing and decision.', 12, 2),
  (null, 'rugby_league', 'u13', 'Defensive Line Connection', 'Move up as a connected line, talking, square and onside, sliding together. Communication and line speed.', 12, 2),
  (null, 'rugby_league', 'u13', 'Support Lines off the Break', 'A runner breaks the line; supporters work back inside and out to take a pass. Teaches reading and supporting a break.', 12, 2),
  (null, 'rugby_league', 'u13', 'Kick Chase & Catch', 'One side kicks and chases in a line; the back three communicate and take the high ball cleanly. Reset and swap.', 12, 2),
  (null, 'rugby_league', 'u13', 'Two-Hand Offload', 'In controlled contact, stay strong and offload with two hands to a trailing supporter. Keep the ball alive.', 12, 2),
  -- RL · Under 16 (advanced game skills)
  (null, 'rugby_league', 'u16', 'Dominant Tackle Technique', 'Full technique tackle with leg drive and a strong, safe finish — head position, footwork into contact, gang-tackle roles. Progressive, controlled intensity.', 15, 3),
  (null, 'rugby_league', 'u16', 'Edge Defence Slide & Communicate', 'Defend the edge: read the attacking shape, slide and jam as a unit, and talk through the threats. Decision-making under shape.', 15, 3),
  (null, 'rugby_league', 'u16', 'Halfback Kicking Game', 'End-of-set kicks for territory and contestables — bombs, grubbers and 40/20 attempts — with chase coordination. Selection and execution.', 15, 3),
  (null, 'rugby_league', 'u16', 'Goal-Line Defensive Set', 'Defend a set on your own line: stay square, scramble, and communicate shifts under pressure. Resilience and organisation.', 15, 3),
  (null, 'rugby_league', 'u16', 'Second-Phase Offload Support', 'Win the collision, offload, and support the second-phase break with depth and lines. Keeping the ball alive with control.', 15, 3),
  (null, 'rugby_league', 'u16', 'Long Passing Under Fatigue', 'Repeat quality long passes both ways after a short conditioning burst. Skill execution when tired.', 15, 3),
  (null, 'rugby_league', 'u16', 'Hit-Up & Fast Play-the-Ball', 'Strong carry into contact, win the ruck, and produce a fast play-the-ball to keep the attack on the front foot. Yardage work.', 12, 3),
  (null, 'rugby_league', 'u16', 'Attacking Shape & Decision', 'Run a set play with options; the ball-player reads the defence and chooses the right one. Shape, timing and decisions.', 15, 3);

-- ---------------------------------------------------------------------------
-- 5. Basketball (sport-specific), by age group.
-- ---------------------------------------------------------------------------

insert into public.drills (club_id, sport, age_group, title, description, duration_min, difficulty)
values
  -- BB · Under 10 (fundamentals)
  (null, 'basketball', 'u10', 'Pound Dribble Series', 'Strong pound dribbles at knee height with each hand, eyes up. Add front-and-back and side-to-side. Builds ball control.', 8, 1),
  (null, 'basketball', 'u10', 'Triple-Threat & Pivots', 'From triple-threat, practise front and reverse pivots without travelling, staying low and balanced. Footwork foundation.', 8, 1),
  (null, 'basketball', 'u10', 'Layups Both Hands', 'Right-hand layups on the right, left on the left: outside foot, knee up, soft off the glass. Form before speed.', 10, 1),
  (null, 'basketball', 'u10', 'Chest & Bounce Passing', 'Partner passing with crisp chest and bounce passes, stepping to the target. Accuracy and good technique.', 8, 1),
  (null, 'basketball', 'u10', 'Defensive Stance & Slides', 'Hold a low, wide stance and slide side-to-side without crossing the feet. Builds defensive footwork.', 10, 1),
  (null, 'basketball', 'u10', 'Form Shooting Close', 'Shoot one-handed close to the rim: balanced base, elbow in, follow-through held. Reps that groove the form.', 10, 1),
  (null, 'basketball', 'u10', 'Stationary Crossover Control', 'Controlled crossovers, between-the-legs and behind-the-back on the spot, eyes up. Builds handle and confidence.', 8, 1),
  (null, 'basketball', 'u10', 'Rebound & Chin It', 'Catch the ball off the board with two hands and "chin it" strong with elbows out before passing out. Habit of protecting the ball.', 8, 1),
  -- BB · Under 13 (building skills)
  (null, 'basketball', 'u13', 'Two-Ball Dribbling', 'Dribble two balls together then alternating, at varying heights, eyes up. Builds coordination and a stronger weak hand.', 12, 2),
  (null, 'basketball', 'u13', 'Mikan Finishing', 'Continuous Mikan drill: alternate-hand finishes off the correct foot under the rim with good footwork and touch.', 10, 2),
  (null, 'basketball', 'u13', 'Catch-and-Shoot Form', 'Catch on the hop or 1-2 into a balanced, square shot. Feet ready before the catch. Repeatable shooting mechanics.', 12, 2),
  (null, 'basketball', 'u13', 'Closeout & Contain', 'Sprint then break down into a balanced closeout with high hands, then slide to contain the drive. Defensive technique.', 12, 2),
  (null, 'basketball', 'u13', 'Pivot & Pass Reads', 'Catch under pressure, pivot to protect the ball, and read the open passing option. Decision-making and ball security.', 12, 2),
  (null, 'basketball', 'u13', 'Change-of-Pace Dribble', 'Speed dribble then hesitation/change of pace to beat a cone or passive defender. Attacking with control.', 12, 2),
  (null, 'basketball', 'u13', 'Box-Out & Rebound', 'On a shot, find a body, box out with a wide base, then go and get the ball. Effort and technique.', 10, 2),
  (null, 'basketball', 'u13', '1v1 from the Wing', 'Read the defender from the wing and attack with one or two dribbles to a balanced finish. Footwork and decisions.', 12, 2),
  -- BB · Under 16 (advanced)
  (null, 'basketball', 'u16', 'Pick-and-Roll Reads', 'Run the pick-and-roll and read the on-ball defender: pull up, attack the pocket, split, or hit the roller. The decision layer.', 15, 3),
  (null, 'basketball', 'u16', 'Pull-Up Jumper off the Dribble', 'Create with one or two dribbles into a balanced pull-up, controlling momentum into a square base. Shot-making off the bounce.', 15, 3),
  (null, 'basketball', 'u16', 'Euro-Step & Contact Finishing', 'Attack the rim with euro-steps and finish through light, controlled contact with either hand. Footwork and touch.', 15, 3),
  (null, 'basketball', 'u16', 'On-Ball Defence & Recovery', 'Pressure the ball, take a hit, and recover to contain after a beat. Live-ish reps building defensive resilience and agility.', 15, 3),
  (null, 'basketball', 'u16', 'Transition Passing & Spacing', 'Push the ball in transition with the pass ahead and correct lane spacing into an early advantage. Vision and tempo.', 15, 3),
  (null, 'basketball', 'u16', 'Combo Dribble Series', 'Chain combo moves — cross, between, behind, into-pull — at game pace with eyes up. Handle under speed.', 12, 3),
  (null, 'basketball', 'u16', 'Rebound to Outlet', 'Secure the defensive board, turn, and deliver a sharp outlet to start the break. Rebounding into transition.', 12, 3),
  (null, 'basketball', 'u16', 'Shooting off Movement', 'Shoot off curls, flares and relocations — set the feet on the catch and stay balanced. Shot-making coming off actions.', 15, 3);

-- ---------------------------------------------------------------------------
-- 6. Tag every new drill with its skills (join by title — all new drills are
--    global with unique titles). Mirrors the seeding pattern in migration 0012.
-- ---------------------------------------------------------------------------

insert into public.drill_skills (drill_id, skill_id, club_id)
select d.id, s.id, null
from (values
  -- S&C bank
  ('Animal Movement Warm-Up', 'mobility'), ('Animal Movement Warm-Up', 'coordination'),
  ('Running Tall Basics', 'acceleration'), ('Running Tall Basics', 'coordination'),
  ('Reaction Tag', 'agility'), ('Reaction Tag', 'speed'),
  ('Cone Weave Footwork', 'agility'), ('Cone Weave Footwork', 'footwork'),
  ('Jump and Stick', 'coordination'), ('Jump and Stick', 'strength'),
  ('Short Shuttle Runs', 'speed'), ('Short Shuttle Runs', 'fitness'),
  ('Skip & Ladder Coordination', 'coordination'), ('Skip & Ladder Coordination', 'agility'),
  ('Bodyweight Fun Circuit', 'strength'), ('Bodyweight Fun Circuit', 'fitness'),
  ('Dynamic Warm-Up Flow', 'mobility'), ('Dynamic Warm-Up Flow', 'coordination'),
  ('Acceleration Wall Drives', 'acceleration'), ('Acceleration Wall Drives', 'speed'),
  ('Sprint Mechanics — A-Skips', 'acceleration'), ('Sprint Mechanics — A-Skips', 'coordination'),
  ('Lateral Bound & Stick', 'agility'), ('Lateral Bound & Stick', 'strength'),
  ('20m Build-Up Sprints', 'speed'), ('20m Build-Up Sprints', 'acceleration'),
  ('Change-of-Direction 5-10-5', 'agility'), ('Change-of-Direction 5-10-5', 'speed'),
  ('Core Stability Circuit', 'strength'), ('Core Stability Circuit', 'mobility'),
  ('Tempo Conditioning Runs', 'fitness'), ('Tempo Conditioning Runs', 'speed'),
  ('Comprehensive Dynamic Warm-Up', 'mobility'),
  ('Max-Velocity Sprint Technique', 'speed'), ('Max-Velocity Sprint Technique', 'acceleration'),
  ('Resisted Acceleration Starts', 'acceleration'), ('Resisted Acceleration Starts', 'strength'),
  ('Reactive Mirror Agility', 'agility'), ('Reactive Mirror Agility', 'decision_making'),
  ('Plyometric Hops & Bounds', 'strength'), ('Plyometric Hops & Bounds', 'coordination'),
  ('Single-Leg Strength Circuit', 'strength'), ('Single-Leg Strength Circuit', 'mobility'),
  ('Repeated-Sprint Conditioning', 'fitness'), ('Repeated-Sprint Conditioning', 'speed'),
  ('Mobility & Recovery Flow', 'mobility'),
  -- Rugby League
  ('Two-Hand Catch Basics', 'ball_handling'),
  ('Lateral Pass Lines', 'passing'), ('Lateral Pass Lines', 'ball_handling'),
  ('Play-the-Ball Technique', 'ball_handling'),
  ('Tag Defending Footwork', 'defence'), ('Tag Defending Footwork', 'agility'),
  ('Pop Pass & Support', 'support_play'), ('Pop Pass & Support', 'passing'),
  ('Ground Ball Presentation', 'ball_handling'),
  ('Catch-Pass Under Light Pressure', 'passing'), ('Catch-Pass Under Light Pressure', 'decision_making'),
  ('Grubber Kick Intro', 'kicking'),
  ('Side-On Tackle Technique', 'tackling'), ('Side-On Tackle Technique', 'defence'),
  ('Play-the-Ball Speed Reps', 'ball_handling'), ('Play-the-Ball Speed Reps', 'fitness'),
  ('Long Spiral Pass', 'passing'),
  ('Draw and Pass 2v1', 'passing'), ('Draw and Pass 2v1', 'decision_making'),
  ('Defensive Line Connection', 'defence'), ('Defensive Line Connection', 'agility'),
  ('Support Lines off the Break', 'support_play'), ('Support Lines off the Break', 'decision_making'),
  ('Kick Chase & Catch', 'kicking'), ('Kick Chase & Catch', 'ball_handling'),
  ('Two-Hand Offload', 'ball_handling'), ('Two-Hand Offload', 'support_play'),
  ('Dominant Tackle Technique', 'tackling'), ('Dominant Tackle Technique', 'defence'),
  ('Edge Defence Slide & Communicate', 'defence'), ('Edge Defence Slide & Communicate', 'decision_making'),
  ('Halfback Kicking Game', 'kicking'), ('Halfback Kicking Game', 'decision_making'),
  ('Goal-Line Defensive Set', 'defence'), ('Goal-Line Defensive Set', 'tackling'),
  ('Second-Phase Offload Support', 'support_play'), ('Second-Phase Offload Support', 'ball_handling'),
  ('Long Passing Under Fatigue', 'passing'), ('Long Passing Under Fatigue', 'fitness'),
  ('Hit-Up & Fast Play-the-Ball', 'ball_handling'), ('Hit-Up & Fast Play-the-Ball', 'fitness'),
  ('Attacking Shape & Decision', 'decision_making'), ('Attacking Shape & Decision', 'passing'),
  -- Basketball
  ('Pound Dribble Series', 'dribbling'),
  ('Triple-Threat & Pivots', 'footwork'),
  ('Layups Both Hands', 'finishing'), ('Layups Both Hands', 'footwork'),
  ('Chest & Bounce Passing', 'passing'),
  ('Defensive Stance & Slides', 'defence'), ('Defensive Stance & Slides', 'footwork'),
  ('Form Shooting Close', 'shooting'),
  ('Stationary Crossover Control', 'dribbling'),
  ('Rebound & Chin It', 'rebounding'),
  ('Two-Ball Dribbling', 'dribbling'), ('Two-Ball Dribbling', 'coordination'),
  ('Mikan Finishing', 'finishing'), ('Mikan Finishing', 'footwork'),
  ('Catch-and-Shoot Form', 'shooting'), ('Catch-and-Shoot Form', 'footwork'),
  ('Closeout & Contain', 'defence'), ('Closeout & Contain', 'footwork'),
  ('Pivot & Pass Reads', 'passing'), ('Pivot & Pass Reads', 'court_vision'),
  ('Change-of-Pace Dribble', 'dribbling'), ('Change-of-Pace Dribble', 'speed'),
  ('Box-Out & Rebound', 'rebounding'), ('Box-Out & Rebound', 'strength'),
  ('1v1 from the Wing', 'footwork'), ('1v1 from the Wing', 'decision_making'),
  ('Pick-and-Roll Reads', 'court_vision'), ('Pick-and-Roll Reads', 'decision_making'),
  ('Pull-Up Jumper off the Dribble', 'shooting'), ('Pull-Up Jumper off the Dribble', 'dribbling'),
  ('Euro-Step & Contact Finishing', 'finishing'), ('Euro-Step & Contact Finishing', 'footwork'),
  ('On-Ball Defence & Recovery', 'defence'), ('On-Ball Defence & Recovery', 'agility'),
  ('Transition Passing & Spacing', 'passing'), ('Transition Passing & Spacing', 'court_vision'),
  ('Combo Dribble Series', 'dribbling'), ('Combo Dribble Series', 'coordination'),
  ('Rebound to Outlet', 'rebounding'), ('Rebound to Outlet', 'passing'),
  ('Shooting off Movement', 'shooting'), ('Shooting off Movement', 'footwork')
) as x(title, skill_key)
join public.drills d on d.title = x.title and d.club_id is null
join public.skills s on s.key = x.skill_key
on conflict (drill_id, skill_id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Recreate rotate_weekly_sets() to ignore the S&C bank.
--
-- The weekly Matchday Set rotation groups global drills into cohorts by
-- (sport, age_group). Now that the S&C bank has sport NULL, those rows would
-- form a (NULL, age) "cohort" and the function would try to INSERT a program
-- with sport = NULL — which programs.sport (NOT NULL) rejects, breaking the whole
-- rotation. Guard the cohort scan with `d.sport is not null` so Sets stay
-- sport-specific; everything else is reproduced verbatim from migration 0012.
-- (S&C drills still appear in the Library and feed the AI Program Recommender;
-- they're just not used to build the cohort Matchday Set.)
-- ---------------------------------------------------------------------------

create or replace function public.rotate_weekly_sets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_week        date := date_trunc('week', current_date)::date;
  v_cohort      record;
  v_prog_id     uuid;
  v_created     integer := 0;
  v_sport_label text;
begin
  if v_uid is not null and public.current_role() is distinct from 'admin' then
    raise exception 'Only platform admins can rotate weekly Sets';
  end if;

  for v_cohort in
    select d.sport, d.age_group
    from public.drills d
    where d.club_id is null
      and d.sport is not null
    group by d.sport, d.age_group
    having count(*) >= 2
  loop
    if exists (
      select 1 from public.programs p
      where p.club_id is null
        and p.sport = v_cohort.sport
        and p.age_group = v_cohort.age_group
        and p.week_start = v_week
    ) then
      continue;
    end if;

    v_sport_label := case v_cohort.sport
      when 'rugby_league' then 'Rugby League'
      when 'soccer'       then 'Soccer'
      else v_cohort.sport::text
    end;

    insert into public.programs (club_id, sport, age_group, title, description, week_start)
    values (
      null, v_cohort.sport, v_cohort.age_group,
      'This Week''s Set',
      'A fresh ' || v_sport_label || ' Set — bank every drill this week to complete the Set and keep your Heat alive.',
      v_week
    )
    returning id into v_prog_id;

    insert into public.program_drills (program_id, drill_id, position, club_id)
    select v_prog_id,
           d.id,
           row_number() over (order by md5(v_week::text || d.id::text)),
           null
    from public.drills d
    where d.club_id is null
      and d.sport = v_cohort.sport
      and d.age_group = v_cohort.age_group
    order by md5(v_week::text || d.id::text)
    limit 3;

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke execute on function public.rotate_weekly_sets() from public, anon;
grant execute on function public.rotate_weekly_sets() to authenticated;
