-- Talyn — Training Library seed refresh (demo-safe starter content)
--
-- The original 0004 seed used placeholder video URLs (a Rickroll) on two drills.
-- This (1) clears every placeholder video link on global drills, and (2) expands
-- the free global library to a credible ~20-drill starter set across both MVP
-- sports and all three age groups.
--
-- Deliberately NO video_url on the new rows: real clips are a content/sourcing
-- workstream (curated embeds → own footage → marquee). The UI shows a "Watch
-- video" link only when video_url is set, so null = clean (no dead links).
-- A drill's XP award = its duration_min.

-- 1. Remove placeholder/junk video links from the seeded global drills.
update public.drills
  set video_url = null
  where club_id is null
    and video_url is not null;

-- 2. Expand the global starter library (text-only; club_id NULL = visible to all).
insert into public.drills (club_id, sport, age_group, title, description, duration_min, video_url)
values
  -- Rugby League · U10
  (null, 'rugby_league', 'u10', 'Two-Hand Pickup',
   'Scoop a stationary ball with two hands and accelerate three steps, focusing on a low body position and eyes up. Reset and repeat off both sides.',
   10, null),
  (null, 'rugby_league', 'u10', 'Tag and Reset',
   'Non-contact tag in a small grid: carry, get tagged, perform a quick square play-the-ball, then support the next carry. Builds ruck habits early.',
   10, null),

  -- Rugby League · U13
  (null, 'rugby_league', 'u13', 'Dummy-Half Service',
   'From a fast play-the-ball, the dummy-half delivers a clean, catchable pass to first receiver. Work both directions and chase a quick tempo.',
   15, null),
  (null, 'rugby_league', 'u13', 'Kick-Chase Pursuit',
   'Two lines chase a kick downfield in a connected line, communicating to apply pressure to the catcher and shut down the return. Emphasis on staying onside.',
   20, null),

  -- Rugby League · U16
  (null, 'rugby_league', 'u16', 'Edge Defence Reads',
   'Three-defender edge versus attackers with a ball-player and support: read the threat, slide or jam together, and make the decision call early. Touch only.',
   25, null),
  (null, 'rugby_league', 'u16', 'Yardage Carry and Quick PTB',
   'Strong carry into a contact bag, win the collision, present the ball, and clear with a fast play-the-ball to set quick ruck speed under fatigue.',
   20, null),

  -- Soccer · U10
  (null, 'soccer', 'u10', 'Sole-Roll Turns',
   'Dribble to a line, stop the ball with the sole, roll it back and accelerate the other way. Both feet, head up, soft touches close to the body.',
   10, null),
  (null, 'soccer', 'u10', 'Inside-Outside Touches',
   'Walking-pace ball mastery using inside then outside of the same foot down a cone channel, building comfort and feel on both feet.',
   10, null),

  -- Soccer · U13
  (null, 'soccer', 'u13', 'Receive and Turn',
   'Check to a feeder, take a half-turn first touch out of your feet, and play forward. Work on body shape so you can see the whole pitch on the turn.',
   15, null),
  (null, 'soccer', 'u13', '1v1 Attacking the Defender',
   'Take on a passive-to-active defender in a channel: attack at speed, use a feint, and accelerate past into space. Decision-making over tricks.',
   15, null),

  -- Soccer · U16
  (null, 'soccer', 'u16', 'Pressing Triggers',
   'Two-player press and cover: the first defender presses on the trigger (a bad touch or back-pass) while the second covers the angle. Win it back high.',
   25, null),
  (null, 'soccer', 'u16', 'Switching Play',
   'Move the ball across a grid and hit a long diagonal switch to a target on the far side, then receive on the back foot and attack. Quality over the top.',
   20, null);
