// Creating mentor notes (rows in mentor_interactions) from inside a
// transaction, and the concept-reminder check shared by every platform.

import { chooseConceptReminder } from "../dashboard/reminders.mjs";

// Concept reminders for a struggling topic repeat at most this often.
const CONCEPT_REPEAT_MS = 20 * 60 * 60 * 1000;

export async function createNote(client, { userId, sessionId, type, message, priority, at, topic = null, problemSlug = null }) {
  const { rows: [row] } = await client.query(
    `INSERT INTO mentor_interactions
       (user_id, session_id, nudge_type, message, priority, problem_slug, topic, "timestamp")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, nudge_type, message, priority, "timestamp"`,
    [userId, sessionId, type, message, priority, problemSlug, topic, at]
  );
  return {
    id: row.id,
    type: row.nudge_type,
    message: row.message,
    priority: row.priority,
    createdAt: row.timestamp.getTime()
  };
}

export async function lastNoteAt(client, userId, type) {
  const { rows: [row] } = await client.query(
    `SELECT max("timestamp") AS at FROM mentor_interactions
     WHERE user_id = $1 AND nudge_type = $2`,
    [userId, type]
  );
  return row.at;
}

// If the learner is starting on a topic they find hard (or have never seen),
// leave a short reminder of its key idea. profile: focused on the topics.
export async function maybeConceptReminder(client, { userId, sessionId, profile, at }) {
  if (!profile || profile.focusTopics.length === 0) return null;

  const { rows } = await client.query(
    `SELECT topic, max("timestamp") AS at FROM mentor_interactions
     WHERE user_id = $1 AND nudge_type = 'CONCEPT_REMINDER' AND topic = ANY($2)
     GROUP BY topic`,
    [userId, profile.focusTopics.map(t => t.topic)]
  );

  const remindedEver = new Set(rows.map(r => r.topic));
  const remindedToday = new Set(
    rows.filter(r => at.getTime() - r.at.getTime() < CONCEPT_REPEAT_MS).map(r => r.topic)
  );

  const choice = chooseConceptReminder(profile, { remindedToday, remindedEver });
  if (!choice) return null;

  return createNote(client, {
    userId,
    sessionId,
    type: "CONCEPT_REMINDER",
    message: choice.message,
    priority: "low",
    at,
    topic: choice.topic
  });
}
